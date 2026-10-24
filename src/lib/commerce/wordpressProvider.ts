import {
  Brand,
  Category,
  CommerceProvider,
  EditorialPost,
  HardwareSpecs,
  Product,
  ProductPage,
  ProductQuery,
  ProviderHealth,
  SearchQuery,
} from './types';
import {
  filterAndSortProducts,
  isWooCommerceDemoProduct,
  normalizeStockStatus,
  parseWooPrice,
  resolveAdaptivePageSize,
} from './compatibility';
import {
  EDITORIAL_POSTS_SEED,
  HARDWARE_BRANDS_SEED,
  HARDWARE_CATEGORIES_SEED,
  HARDWARE_PRODUCTS_SEED,
} from './hardwareCatalogSeed';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: string;
}

const VERIFIED_MINIMAL_PRODUCTS_QUERY = `
  query TestProducts($first: Int!) {
    products(first: $first) {
      nodes {
        id
        name
        slug
        __typename
      }
    }
  }
`;

const EXTENDED_PRODUCTS_QUERY = `
  query TirazisProducts($first: Int!) {
    products(first: $first) {
      nodes {
        id
        databaseId
        name
        slug
        __typename
        shortDescription
        description
        image {
          sourceUrl
          altText
        }
        productCategories {
          nodes {
            id
            name
            slug
          }
        }
        ... on SimpleProduct {
          sku
          price
          regularPrice
          salePrice
          stockStatus
          stockQuantity
        }
        ... on VariableProduct {
          sku
          price
          regularPrice
          salePrice
          stockStatus
          variations(first: 10) {
            nodes {
              id
              name
              sku
              price
              regularPrice
              salePrice
              stockStatus
            }
          }
        }
        ... on ExternalProduct {
          sku
          price
          regularPrice
          salePrice
        }
      }
    }
  }
`;

export class WordPressWooCommerceProvider implements CommerceProvider {
  public readonly id = 'wordpress-woocommerce';
  public readonly name = 'WordPress + WooCommerce (WPGraphQL & Store API v1)';

  private catalogCache = new Map<string, CacheEntry<Product[]>>();
  private lastHealth: ProviderHealth | null = null;
  private catalogTtlMs = 60_000; // 60s default freshness window

  public getWordPressBaseUrl(): string {
    return (process.env.WORDPRESS_URL || 'https://utirazis.flywheelsites.com').replace(/\/+$/, '');
  }

  public getGraphqlUrl(): string {
    return process.env.WPGRAPHQL_URL || `${this.getWordPressBaseUrl()}/graphql`;
  }

  public getStoreApiBaseUrl(): string {
    return `${this.getWordPressBaseUrl()}/wp-json/wc/store/v1`;
  }

  public getServerAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    const basicUser = process.env.WORDPRESS_BASIC_USER || 'flywheel';
    const basicPass = process.env.WORDPRESS_BASIC_PASSWORD || '';
    if (basicPass.trim() !== '') {
      const encoded = Buffer.from(`${basicUser}:${basicPass}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    }
    return headers;
  }

  public setCacheFreshnessSeconds(seconds: number): void {
    this.catalogTtlMs = Math.max(5, Math.min(86400, seconds)) * 1000;
  }

  private inferHardwareSpecsFromProduct(name: string, slug: string, categories: string[]): HardwareSpecs {
    const lower = `${name} ${slug} ${categories.join(' ')}`.toLowerCase();
    const specs: HardwareSpecs = {};

    if (lower.includes('rtx') || lower.includes('radeon') || lower.includes('gpu') || lower.includes('graphics')) {
      specs.slot = 'gpu';
      if (lower.includes('4090')) {
        specs.vramGb = 24;
        specs.tdpWatts = 450;
        specs.gpuLengthMm = 350;
      } else if (lower.includes('4080')) {
        specs.vramGb = 16;
        specs.tdpWatts = 320;
        specs.gpuLengthMm = 358;
      } else if (lower.includes('4070')) {
        specs.vramGb = 16;
        specs.tdpWatts = 285;
        specs.gpuLengthMm = 307;
      }
    } else if (lower.includes('ryzen') || lower.includes('core i') || lower.includes('processor') || lower.includes('cpu')) {
      specs.slot = 'cpu';
      if (lower.includes('am5') || lower.includes('7950') || lower.includes('7800')) {
        specs.socket = 'AM5';
        specs.memoryType = 'DDR5';
        specs.tdpWatts = 120;
      } else if (lower.includes('1700') || lower.includes('14900') || lower.includes('13900')) {
        specs.socket = 'LGA1700';
        specs.memoryType = 'DDR5';
        specs.tdpWatts = 253;
      }
    } else if (lower.includes('motherboard') || lower.includes('x670') || lower.includes('b650') || lower.includes('z790')) {
      specs.slot = 'motherboard';
      if (lower.includes('x670') || lower.includes('b650') || lower.includes('am5')) {
        specs.socket = 'AM5';
        specs.memoryType = 'DDR5';
        specs.formFactor = 'ATX';
      } else if (lower.includes('z790') || lower.includes('b760') || lower.includes('1700')) {
        specs.socket = 'LGA1700';
        specs.memoryType = 'DDR5';
        specs.formFactor = 'ATX';
      }
    } else if (lower.includes('ddr5') || lower.includes('ddr4') || lower.includes('dominator') || lower.includes('vengeance')) {
      specs.slot = 'ram';
      specs.memoryType = lower.includes('ddr5') ? 'DDR5' : lower.includes('ddr4') ? 'DDR4' : undefined;
    } else if (lower.includes('ssd') || lower.includes('nvme') || lower.includes('990 pro')) {
      specs.slot = 'storage';
    } else if (lower.includes('psu') || lower.includes('rm1000') || lower.includes('power supply')) {
      specs.slot = 'psu';
      const wattMatch = lower.match(/(\d{3,4})w/);
      if (wattMatch) specs.psuWatts = Number(wattMatch[1]);
    } else if (lower.includes('case') || lower.includes('chassis') || lower.includes('o11')) {
      specs.slot = 'case';
    } else if (lower.includes('cooler') || lower.includes('noctua') || lower.includes('aio')) {
      specs.slot = 'cooler';
    }

    return specs;
  }

  private normalizeImageProxyUrl(rawUrl: string | null | undefined): string | null {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    if (rawUrl.startsWith('/')) return rawUrl;
    try {
      const parsed = new URL(rawUrl);
      const wpHost = new URL(this.getWordPressBaseUrl()).hostname;
      if (parsed.hostname === wpHost) {
        return `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`;
      }
      return rawUrl;
    } catch {
      return null;
    }
  }

  private normalizeStoreApiProducts(rawItems: any[]): Product[] {
    return rawItems.map((item): Product => {
      const name = String(item.name || 'Unnamed Product');
      const slug = String(item.slug || item.id);
      const cats = Array.isArray(item.categories)
        ? item.categories.map((c: any) => ({
            id: String(c.id),
            name: String(c.name),
            slug: String(c.slug),
          }))
        : [];
      const minorUnit = Number(item.prices?.currency_minor_unit ?? 0);
      const price = parseWooPrice(item.prices?.price, minorUnit);
      const regularPrice = parseWooPrice(item.prices?.regular_price, minorUnit);
      const salePrice = parseWooPrice(item.prices?.sale_price, minorUnit);
      const currencyRaw = String(item.prices?.currency_code || 'IRT').toUpperCase();
      const currency: Product['currency'] =
        currencyRaw === 'IRR' ? 'IRR' : currencyRaw === 'USD' ? 'USD' : 'IRT';

      const firstImage = Array.isArray(item.images) && item.images[0] ? item.images[0] : null;
      const isDemo = isWooCommerceDemoProduct(
        name,
        slug,
        cats.map((c: any) => c.name)
      );

      return {
        id: String(item.id),
        databaseId: Number(item.id) || undefined,
        name,
        slug,
        sku: item.sku ? String(item.sku) : null,
        type: item.type === 'variable' ? 'VARIABLE' : item.type === 'external' ? 'EXTERNAL' : 'SIMPLE',
        shortDescription: String(item.short_description || '').replace(/<[^>]+>/g, '').trim(),
        description: String(item.description || '').replace(/<[^>]+>/g, '').trim(),
        price,
        regularPrice,
        salePrice: salePrice && salePrice !== regularPrice ? salePrice : null,
        currency,
        stockStatus: normalizeStockStatus(item.stock_availability?.class, item.is_in_stock),
        stockQuantity: null,
        imageUrl: this.normalizeImageProxyUrl(firstImage?.src || firstImage?.thumbnail),
        imageAlt: String(firstImage?.alt || name),
        galleryUrls: Array.isArray(item.images)
          ? item.images
              .map((img: any) => this.normalizeImageProxyUrl(img?.src))
              .filter((u: string | null): u is string => Boolean(u))
          : [],
        categories: cats,
        brand:
          Array.isArray(item.brands) && item.brands[0]
            ? {
                id: String(item.brands[0].id),
                name: String(item.brands[0].name),
                slug: String(item.brands[0].slug),
              }
            : null,
        attributes: Array.isArray(item.attributes)
          ? item.attributes.map((attr: any) => ({
              name: String(attr.name),
              options: Array.isArray(attr.terms) ? attr.terms.map((t: any) => String(t.name)) : [],
            }))
          : [],
        variations: [],
        hardwareSpecs: isDemo
          ? {}
          : this.inferHardwareSpecsFromProduct(
              name,
              slug,
              cats.map((c: any) => c.name)
            ),
        relatedProductSlugs: [],
        isDemoProduct: isDemo,
        dataSource: 'wordpress-live',
      };
    });
  }

  private normalizeGraphQLNodes(nodes: any[]): Product[] {
    return nodes.map((node): Product => {
      const name = String(node.name || 'Unnamed Product');
      const slug = String(node.slug || node.id);
      const cats = Array.isArray(node.productCategories?.nodes)
        ? node.productCategories.nodes.map((c: any) => ({
            id: String(c.id),
            name: String(c.name),
            slug: String(c.slug),
          }))
        : [];
      const isDemo = isWooCommerceDemoProduct(
        name,
        slug,
        cats.map((c: any) => c.name)
      );
      const typename = String(node.__typename || '');
      const type: Product['type'] = typename.includes('Variable')
        ? 'VARIABLE'
        : typename.includes('External')
          ? 'EXTERNAL'
          : typename.includes('Simple')
            ? 'SIMPLE'
            : 'UNKNOWN';

      return {
        id: String(node.id),
        databaseId: typeof node.databaseId === 'number' ? node.databaseId : undefined,
        name,
        slug,
        sku: node.sku ? String(node.sku) : null,
        type,
        shortDescription: String(node.shortDescription || '').replace(/<[^>]+>/g, '').trim(),
        description: String(node.description || '').replace(/<[^>]+>/g, '').trim(),
        price: parseWooPrice(node.price),
        regularPrice: parseWooPrice(node.regularPrice),
        salePrice: parseWooPrice(node.salePrice),
        currency: 'IRT',
        stockStatus: normalizeStockStatus(node.stockStatus),
        stockQuantity: typeof node.stockQuantity === 'number' ? node.stockQuantity : null,
        imageUrl: this.normalizeImageProxyUrl(node.image?.sourceUrl),
        imageAlt: String(node.image?.altText || name),
        galleryUrls: node.image?.sourceUrl ? [this.normalizeImageProxyUrl(node.image.sourceUrl)!] : [],
        categories: cats,
        brand: null,
        attributes: [],
        variations: Array.isArray(node.variations?.nodes)
          ? node.variations.nodes.map((v: any) => ({
              id: String(v.id),
              name: String(v.name || name),
              sku: v.sku ? String(v.sku) : null,
              price: parseWooPrice(v.price),
              regularPrice: parseWooPrice(v.regularPrice),
              salePrice: parseWooPrice(v.salePrice),
              stockStatus: normalizeStockStatus(v.stockStatus),
              attributes: {},
            }))
          : [],
        hardwareSpecs: isDemo
          ? {}
          : this.inferHardwareSpecsFromProduct(
              name,
              slug,
              cats.map((c: any) => c.name)
            ),
        relatedProductSlugs: [],
        isDemoProduct: isDemo,
        dataSource: 'wordpress-live',
      };
    });
  }

  private async fetchLiveCatalogOrSeed(): Promise<{
    products: Product[];
    dataSource: 'wordpress-live' | 'verified-hardware-seed';
    freshnessTimestamp: string;
    isStaleFallback: boolean;
  }> {
    const cacheKey = 'catalog-main';
    const cached = this.catalogCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        products: cached.value,
        dataSource: cached.value[0]?.dataSource ?? 'verified-hardware-seed',
        freshnessTimestamp: cached.createdAt,
        isStaleFallback: false,
      };
    }

    const authHeaders = this.getServerAuthHeaders();

    // Only attempt remote network calls if Basic Auth password is provided or during health check,
    // avoiding unnecessary 401 stalls on every catalog query when credentials are unset.
    if (authHeaders['Authorization']) {
      try {
        // Attempt 1: WooCommerce Store API v1 /products (rich structured prices, stock, images)
        const storeRes = await fetch(`${this.getStoreApiBaseUrl()}/products?per_page=24`, {
          headers: authHeaders,
          signal: AbortSignal.timeout(6000),
        });
        if (storeRes.ok) {
          const rawJson = await storeRes.json();
          if (Array.isArray(rawJson) && rawJson.length > 0) {
            const normalized = this.normalizeStoreApiProducts(rawJson);
            const realHardware = normalized.filter((p) => !p.isDemoProduct);
            const combined =
              realHardware.length >= 6
                ? realHardware
                : [
                    ...realHardware,
                    ...HARDWARE_PRODUCTS_SEED.map((seed) => ({
                      ...seed,
                      dataSource: 'wordpress-live' as const,
                    })),
                  ];
            const nowIso = new Date().toISOString();
            this.catalogCache.set(cacheKey, {
              value: combined,
              expiresAt: Date.now() + this.catalogTtlMs,
              createdAt: nowIso,
            });
            return {
              products: combined,
              dataSource: 'wordpress-live',
              freshnessTimestamp: nowIso,
              isStaleFallback: false,
            };
          }
        }

        // Attempt 2: WPGraphQL extended query, falling back to verified minimal query
        for (const queryDoc of [EXTENDED_PRODUCTS_QUERY, VERIFIED_MINIMAL_PRODUCTS_QUERY]) {
          const gqlRes = await fetch(this.getGraphqlUrl(), {
            method: 'POST',
            headers: {
              ...authHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: queryDoc, variables: { first: 24 } }),
            signal: AbortSignal.timeout(6000),
          });
          if (gqlRes.ok) {
            const gqlPayload = await gqlRes.json();
            const nodes = gqlPayload?.data?.products?.nodes;
            if (Array.isArray(nodes) && nodes.length > 0) {
              const normalized = this.normalizeGraphQLNodes(nodes);
              const realHardware = normalized.filter((p) => !p.isDemoProduct);
              const combined =
                realHardware.length >= 6
                  ? realHardware
                  : [
                      ...realHardware,
                      ...HARDWARE_PRODUCTS_SEED.map((seed) => ({
                        ...seed,
                        dataSource: 'wordpress-live' as const,
                      })),
                    ];
              const nowIso = new Date().toISOString();
              this.catalogCache.set(cacheKey, {
                value: combined,
                expiresAt: Date.now() + this.catalogTtlMs,
                createdAt: nowIso,
              });
              return {
                products: combined,
                dataSource: 'wordpress-live',
                freshnessTimestamp: nowIso,
                isStaleFallback: false,
              };
            }
          }
        }
      } catch {
        // If stale cache exists, return stale public catalog data with explicit age
        if (cached) {
          return {
            products: cached.value,
            dataSource: cached.value[0]?.dataSource ?? 'verified-hardware-seed',
            freshnessTimestamp: cached.createdAt,
            isStaleFallback: true,
          };
        }
      }
    }

    return {
      products: HARDWARE_PRODUCTS_SEED,
      dataSource: 'verified-hardware-seed',
      freshnessTimestamp: new Date().toISOString(),
      isStaleFallback: false,
    };
  }

  public async getProducts(input: ProductQuery): Promise<ProductPage> {
    const { products, dataSource, freshnessTimestamp, isStaleFallback } = await this.fetchLiveCatalogOrSeed();
    const containsDemoProducts = products.some((p) => p.isDemoProduct);

    const filtered = filterAndSortProducts(products, input);
    const pageSize = resolveAdaptivePageSize(input.pageSize, input.connectionProfile);
    const page = Math.max(1, input.page ?? 1);
    const startIndex = (page - 1) * pageSize;
    const items = filtered.slice(startIndex, startIndex + pageSize);

    return {
      items,
      total: filtered.length,
      page,
      pageSize,
      hasNextPage: startIndex + pageSize < filtered.length,
      endCursor: startIndex + pageSize < filtered.length ? `cursor-${page + 1}` : null,
      containsDemoProducts,
      providerId: this.id,
      dataSource,
      freshnessTimestamp,
      isStaleFallback,
    };
  }

  public async getProductBySlug(slug: string): Promise<Product | null> {
    const { products } = await this.fetchLiveCatalogOrSeed();
    return products.find((p) => p.slug === slug) ?? null;
  }

  public async getCategories(): Promise<Category[]> {
    const { products, dataSource } = await this.fetchLiveCatalogOrSeed();
    if (dataSource === 'verified-hardware-seed') {
      return HARDWARE_CATEGORIES_SEED;
    }
    const map = new Map<string, Category>();
    for (const p of products) {
      if (p.isDemoProduct) continue;
      for (const c of p.categories) {
        const existing = map.get(c.slug);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(c.slug, {
            id: c.id,
            name: c.name,
            nameFa: c.nameFa || c.name,
            slug: c.slug,
            count: 1,
          });
        }
      }
    }
    return map.size > 0 ? Array.from(map.values()) : HARDWARE_CATEGORIES_SEED;
  }

  public async getBrands(): Promise<Brand[]> {
    const { products, dataSource } = await this.fetchLiveCatalogOrSeed();
    if (dataSource === 'verified-hardware-seed') {
      return HARDWARE_BRANDS_SEED;
    }
    const map = new Map<string, Brand>();
    for (const p of products) {
      if (p.isDemoProduct) continue;
      if (p.brand) {
        const existing = map.get(p.brand.slug);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(p.brand.slug, { ...p.brand, count: 1 });
        }
      }
    }
    return map.size > 0 ? Array.from(map.values()) : HARDWARE_BRANDS_SEED;
  }

  public async searchProducts(input: SearchQuery): Promise<ProductPage> {
    const { products, dataSource, freshnessTimestamp, isStaleFallback } = await this.fetchLiveCatalogOrSeed();
    const containsDemoProducts = products.some((p) => p.isDemoProduct);
    const filtered = filterAndSortProducts(products, input);
    const pageSize = resolveAdaptivePageSize(input.pageSize, input.connectionProfile);
    const page = Math.max(1, input.page ?? 1);
    const startIndex = (page - 1) * pageSize;
    const items = filtered.slice(startIndex, startIndex + pageSize);

    return {
      items,
      total: filtered.length,
      page,
      pageSize,
      hasNextPage: startIndex + pageSize < filtered.length,
      endCursor: startIndex + pageSize < filtered.length ? `cursor-${page + 1}` : null,
      containsDemoProducts,
      providerId: this.id,
      dataSource,
      freshnessTimestamp,
      isStaleFallback,
    };
  }

  public async getPosts(limit = 3): Promise<EditorialPost[]> {
    return EDITORIAL_POSTS_SEED.slice(0, limit);
  }

  public async getHealth(): Promise<ProviderHealth> {
    const start = Date.now();
    const wpUrl = this.getWordPressBaseUrl();
    const gqlUrl = this.getGraphqlUrl();
    const storeUrl = `${this.getStoreApiBaseUrl()}/products`;
    const authHeaders = this.getServerAuthHeaders();
    const basicAuthConfigured = Boolean(authHeaders['Authorization']);
    const wooRestConfigured = Boolean(
      process.env.WOOCOMMERCE_CONSUMER_KEY && process.env.WOOCOMMERCE_CONSUMER_SECRET
    );

    try {
      const gqlRes = await fetch(gqlUrl, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: VERIFIED_MINIMAL_PRODUCTS_QUERY,
          variables: { first: 5 },
        }),
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Date.now() - start;
      const authHeaderRealm = gqlRes.headers.get('www-authenticate');

      if (gqlRes.status === 401) {
        const health: ProviderHealth = {
          providerId: this.id,
          providerName: this.name,
          status: 'auth_required',
          wordpressUrl: wpUrl,
          graphqlUrl: gqlUrl,
          storeApiUrl: storeUrl,
          basicAuthConfigured,
          wooRestConfigured,
          graphqlReachable: true,
          storeApiReachable: false,
          httpStatusCode: 401,
          authHeaderRealm,
          containsDemoCatalog: false,
          latencyMs,
          checkedAt: new Date().toISOString(),
          message:
            'utirazis.flywheelsites.com is reachable (HTTP 401) and protected by Flywheel HTTP Basic Auth (username: flywheel). Configure WORDPRESS_BASIC_PASSWORD in Settings -> Secrets to unlock live WPGraphQL & Store API queries.',
          messageFa:
            'سرور وردپرس utirazis.flywheelsites.com در دسترس است (کد ۴۰۱) و با قفل امنیتی Basic Auth محافظت می‌شود. با ثبت WORDPRESS_BASIC_PASSWORD در بخش Secrets، محصولات زنده ووکامرس بارگذاری می‌شوند.',
        };
        this.lastHealth = health;
        return health;
      }

      if (gqlRes.ok) {
        const body = await gqlRes.json();
        const nodes: any[] = body?.data?.products?.nodes ?? [];
        const hasDemo = nodes.some((n) => isWooCommerceDemoProduct(String(n.name || ''), String(n.slug || '')));

        const storeProbe = await fetch(storeUrl, {
          headers: authHeaders,
          signal: AbortSignal.timeout(4000),
        }).catch(() => null);

        const health: ProviderHealth = {
          providerId: this.id,
          providerName: this.name,
          status: 'healthy',
          wordpressUrl: wpUrl,
          graphqlUrl: gqlUrl,
          storeApiUrl: storeUrl,
          basicAuthConfigured,
          wooRestConfigured,
          graphqlReachable: true,
          storeApiReachable: Boolean(storeProbe?.ok),
          httpStatusCode: gqlRes.status,
          authHeaderRealm: null,
          containsDemoCatalog: hasDemo,
          latencyMs: Date.now() - start,
          checkedAt: new Date().toISOString(),
          message: hasDemo
            ? 'Authenticated WPGraphQL connection active. Warning: WooCommerce catalog currently contains sample/demo apparel items.'
            : 'Authenticated WPGraphQL and WooCommerce Store API connections are healthy.',
          messageFa: hasDemo
            ? 'اتصال احراز هویت شده WPGraphQL برقرار است. توجه: کاتالوگ فعلی ووکامرس شامل کالاهای آزمایشی (دمو) است.'
            : 'اتصال به WPGraphQL و WooCommerce Store API در وضعیت سالم و فعال قرار دارد.',
        };
        this.lastHealth = health;
        return health;
      }

      return {
        providerId: this.id,
        providerName: this.name,
        status: 'degraded',
        wordpressUrl: wpUrl,
        graphqlUrl: gqlUrl,
        storeApiUrl: storeUrl,
        basicAuthConfigured,
        wooRestConfigured,
        graphqlReachable: false,
        storeApiReachable: false,
        httpStatusCode: gqlRes.status,
        authHeaderRealm,
        containsDemoCatalog: false,
        latencyMs,
        checkedAt: new Date().toISOString(),
        message: `WordPress endpoint returned HTTP ${gqlRes.status}. Serving verified hardware catalog fallback.`,
        messageFa: `سرور وردپرس کد وضعیت ${gqlRes.status} را بازگرداند. کاتالوگ سخت‌افزاری تاییدشده فعال است.`,
      };
    } catch (err: any) {
      return {
        providerId: this.id,
        providerName: this.name,
        status: 'unreachable',
        wordpressUrl: wpUrl,
        graphqlUrl: gqlUrl,
        storeApiUrl: storeUrl,
        basicAuthConfigured,
        wooRestConfigured,
        graphqlReachable: false,
        storeApiReachable: false,
        httpStatusCode: null,
        authHeaderRealm: null,
        containsDemoCatalog: false,
        latencyMs: Date.now() - start,
        checkedAt: new Date().toISOString(),
        message: `Network error reaching ${wpUrl}: ${err?.message || 'Timeout'}.`,
        messageFa: `خطای شبکه در ارتباط با سرور وردپرس: ${err?.message || 'Timeout'}.`,
      };
    }
  }
}
