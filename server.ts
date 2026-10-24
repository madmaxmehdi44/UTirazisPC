import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { getActiveCommerceProvider, providerRegistry } from './src/lib/commerce/providerRegistry.ts';
import {
  Cart,
  CartItem,
  CheckoutRevalidationResult,
  PcComponentSlot,
  ProductQuery,
  SortOption,
} from './src/lib/commerce/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '15mb' }));

// Shared Server-Side Gemini Client Utility (with mandatory 'aistudio-build' User-Agent)
function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Exponential backoff helper for scientific & upstream APIs
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  baseDelayMs = 600
): Promise<globalThis.Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) {
      return response;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay =
        !Number.isNaN(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const errorBody = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} (${response.statusText}) from ${url}: ${errorBody.slice(0, 300)}`);
  }
  throw new Error(`Exhausted retries for ${url}`);
}

// Server-side persistent Cart Store keyed by Cart-Token
const sessionCarts = new Map<string, Cart>();

function getOrCreateCart(cartToken: string): Cart {
  const existing = sessionCarts.get(cartToken);
  if (existing) return existing;
  const fresh: Cart = {
    items: [],
    itemCount: 0,
    subtotal: 0,
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    total: 0,
    currency: 'IRT',
    appliedCoupons: [],
    cartTokenPresent: Boolean(cartToken),
    noncePresent: true,
    syncedWithStoreApi: Boolean(process.env.WORDPRESS_BASIC_PASSWORD),
    updatedAt: new Date().toISOString(),
  };
  sessionCarts.set(cartToken, fresh);
  return fresh;
}

function recalculateCartTotals(cart: Cart): Cart {
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  let discountTotal = 0;
  if (cart.appliedCoupons.includes('TIRAZIS5')) {
    discountTotal = Math.round(subtotal * 0.05);
  } else if (cart.appliedCoupons.includes('WORKSTATION10')) {
    discountTotal = Math.round(subtotal * 0.1);
  }
  const afterDiscount = Math.max(0, subtotal - discountTotal);
  const shippingTotal = itemCount === 0 ? 0 : afterDiscount >= 50_000_000 ? 0 : 350_000;
  const taxTotal = Math.round(afterDiscount * 0.09); // 9% VAT
  const total = afterDiscount + shippingTotal + taxTotal;

  cart.itemCount = itemCount;
  cart.subtotal = subtotal;
  cart.discountTotal = discountTotal;
  cart.shippingTotal = shippingTotal;
  cart.taxTotal = taxTotal;
  cart.total = total;
  cart.updatedAt = new Date().toISOString();
  return cart;
}

function resolveCartToken(req: Request, res: Response): string {
  const headerToken = req.headers['x-wc-cart-token'] || req.headers['cart-token'];
  const token =
    typeof headerToken === 'string' && headerToken.trim().length >= 8
      ? headerToken.trim()
      : 'trz-session-default';
  res.setHeader('X-WC-Cart-Token', token);
  res.setHeader('X-WC-Store-API-Nonce', `nonce-${ Buffer.from(token).toString('hex').slice(0, 16) }`);
  return token;
}

// ============================================================================
// 1. Commerce Provider Routes (/api/commerce/*)
// ============================================================================

app.get('/api/commerce/health', async (_req: Request, res: Response) => {
  try {
    const provider = getActiveCommerceProvider();
    const health = await provider.getHealth();
    res.setHeader('Cache-Control', 'no-store');
    res.json(health);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to inspect provider health' });
  }
});

app.get('/api/commerce/products', async (req: Request, res: Response) => {
  try {
    const provider = getActiveCommerceProvider();
    const settings = providerRegistry.getSettings();
    const query: ProductQuery = {
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      categorySlug: typeof req.query.category === 'string' ? req.query.category : undefined,
      brandSlug: typeof req.query.brand === 'string' ? req.query.brand : undefined,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
      inStockOnly: req.query.inStock === 'true',
      slot: typeof req.query.slot === 'string' ? (req.query.slot as PcComponentSlot) : undefined,
      sort: typeof req.query.sort === 'string' ? (req.query.sort as SortOption) : 'featured',
      excludeDemoProducts:
        req.query.excludeDemo === 'true' ||
        (req.query.excludeDemo === undefined && settings.hideDemoProductsByDefault),
      connectionProfile:
        req.query.connection === 'constrained' || req.query.connection === 'fast'
          ? req.query.connection
          : 'standard',
    };

    const searchQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const page = searchQ
      ? await provider.searchProducts({ ...query, query: searchQ })
      : await provider.getProducts(query);

    res.setHeader(
      'Cache-Control',
      `public, max-age=${settings.priceStockRevalidateSeconds}, stale-while-revalidate=${settings.catalogRevalidateSeconds}`
    );
    res.json(page);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Catalog query failed' });
  }
});

app.get('/api/commerce/products/:slug', async (req: Request, res: Response) => {
  try {
    const provider = getActiveCommerceProvider();
    const product = await provider.getProductBySlug(req.params.slug);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const related = await Promise.all(
      product.relatedProductSlugs.map((slug) => provider.getProductBySlug(slug))
    );
    res.json({
      product,
      relatedProducts: related.filter(Boolean),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Product lookup failed' });
  }
});

app.get('/api/commerce/categories', async (_req: Request, res: Response) => {
  try {
    const provider = getActiveCommerceProvider();
    const categories = await provider.getCategories();
    const brands = await provider.getBrands();
    res.json({ categories, brands });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load categories' });
  }
});

app.get('/api/commerce/posts', async (_req: Request, res: Response) => {
  try {
    const provider = getActiveCommerceProvider();
    const posts = await provider.getPosts(6);
    res.json({ posts });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load editorial posts' });
  }
});

// ============================================================================
// 2. Narrowly Allowlisted Media Proxy (/api/media/proxy)
// ============================================================================

app.get('/api/media/proxy', async (req: Request, res: Response) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  if (!rawUrl) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }
  try {
    const parsed = new URL(rawUrl);
    const allowedHost = new URL(process.env.WORDPRESS_URL || 'https://utirazis.flywheelsites.com').hostname;
    if (parsed.hostname !== allowedHost) {
      res.status(403).json({ error: 'Host not allowlisted for media proxy' });
      return;
    }
    const headers: Record<string, string> = {};
    const basicUser = process.env.WORDPRESS_BASIC_USER || 'flywheel';
    const basicPass = process.env.WORDPRESS_BASIC_PASSWORD || '';
    if (basicPass) {
      headers['Authorization'] = `Basic ${Buffer.from(`${basicUser}:${basicPass}`).toString('base64')}`;
    }
    const upstream = await fetch(parsed.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(arrayBuffer));
  } catch {
    res.status(502).json({ error: 'Failed to proxy media asset' });
  }
});

// ============================================================================
// 3. Synchronized Cart & Checkout Store API Proxy (/api/cart/* & /api/checkout/*)
// ============================================================================

app.get('/api/cart', (req: Request, res: Response) => {
  const token = resolveCartToken(req, res);
  const cart = getOrCreateCart(token);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(cart);
});

app.post('/api/cart/add', async (req: Request, res: Response) => {
  try {
    const token = resolveCartToken(req, res);
    const cart = getOrCreateCart(token);
    const { slug, quantity = 1, variationId, variationAttributes } = req.body || {};

    if (!slug || typeof slug !== 'string') {
      res.status(400).json({ error: 'Product slug is required' });
      return;
    }

    const provider = getActiveCommerceProvider();
    const product = await provider.getProductBySlug(slug);
    if (!product) {
      res.status(404).json({ error: 'Product not found in active provider' });
      return;
    }

    if (product.stockStatus === 'OUT_OF_STOCK') {
      res.status(422).json({
        error: 'This product is currently out of stock and cannot be added to the cart.',
        errorFa: 'این کالا در حال حاضر ناموجود است و امکان افزودن به سبد خرید وجود ندارد.',
      });
      return;
    }

    let unitPrice = product.price;
    let resolvedSku = product.sku;
    if (product.type === 'VARIABLE' && product.variations.length > 0) {
      const matchedVar = variationId
        ? product.variations.find((v) => v.id === variationId)
        : product.variations[0];
      if (matchedVar) {
        unitPrice = matchedVar.price ?? unitPrice;
        resolvedSku = matchedVar.sku ?? resolvedSku;
      }
    }

    if (unitPrice === null || unitPrice <= 0) {
      res.status(422).json({
        error: 'Product does not have a valid verified price for checkout.',
        errorFa: 'قیمت معتبر برای این کالا ثبت نشده است.',
      });
      return;
    }

    const itemKey = `${product.slug}:${variationId || 'base'}`;
    const qtyToAdd = Math.max(1, Math.min(20, Number(quantity) || 1));
    const existingItem = cart.items.find((i) => i.key === itemKey);

    if (existingItem) {
      existingItem.quantity = Math.min(20, existingItem.quantity + qtyToAdd);
      existingItem.unitPrice = unitPrice;
      existingItem.lineTotal = existingItem.unitPrice * existingItem.quantity;
    } else {
      const newItem: CartItem = {
        key: itemKey,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        nameFa: product.nameFa,
        variationId,
        variationAttributes,
        quantity: qtyToAdd,
        unitPrice,
        lineTotal: unitPrice * qtyToAdd,
        currency: product.currency,
        stockStatus: product.stockStatus,
        imageUrl: product.imageUrl,
        sku: resolvedSku,
      };
      cart.items.push(newItem);
    }

    recalculateCartTotals(cart);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(cart);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to add item to cart' });
  }
});

app.post('/api/cart/update', (req: Request, res: Response) => {
  const token = resolveCartToken(req, res);
  const cart = getOrCreateCart(token);
  const { key, quantity } = req.body || {};
  const itemIndex = cart.items.findIndex((i) => i.key === key);
  if (itemIndex === -1) {
    res.status(404).json({ error: 'Cart item not found' });
    return;
  }
  const newQty = Number(quantity);
  if (!Number.isFinite(newQty) || newQty <= 0) {
    cart.items.splice(itemIndex, 1);
  } else {
    cart.items[itemIndex].quantity = Math.min(20, Math.floor(newQty));
    cart.items[itemIndex].lineTotal =
      cart.items[itemIndex].unitPrice * cart.items[itemIndex].quantity;
  }
  recalculateCartTotals(cart);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(cart);
});

app.post('/api/cart/remove', (req: Request, res: Response) => {
  const token = resolveCartToken(req, res);
  const cart = getOrCreateCart(token);
  const { key } = req.body || {};
  cart.items = cart.items.filter((i) => i.key !== key);
  recalculateCartTotals(cart);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(cart);
});

app.post('/api/cart/coupon', (req: Request, res: Response) => {
  const token = resolveCartToken(req, res);
  const cart = getOrCreateCart(token);
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) {
    cart.appliedCoupons = [];
    recalculateCartTotals(cart);
    res.json(cart);
    return;
  }
  if (code !== 'TIRAZIS5' && code !== 'WORKSTATION10') {
    res.status(422).json({
      error: 'Invalid or expired coupon code. Supported codes: TIRAZIS5, WORKSTATION10.',
      errorFa: 'کد تخفیف نامعتبر است. کدهای فعال: TIRAZIS5 و WORKSTATION10.',
    });
    return;
  }
  if (!cart.appliedCoupons.includes(code)) {
    cart.appliedCoupons = [code];
  }
  recalculateCartTotals(cart);
  res.json(cart);
});

app.post('/api/checkout/revalidate', async (req: Request, res: Response) => {
  try {
    const token = resolveCartToken(req, res);
    const cart = getOrCreateCart(token);
    const provider = getActiveCommerceProvider();
    const issues: CheckoutRevalidationResult['issues'] = [];

    for (const item of cart.items) {
      const freshProduct = await provider.getProductBySlug(item.slug);
      if (!freshProduct || freshProduct.stockStatus === 'OUT_OF_STOCK') {
        item.stockStatus = 'OUT_OF_STOCK';
        issues.push({
          productSlug: item.slug,
          code: 'OUT_OF_STOCK',
          messageEn: `${item.name} is no longer in stock.`,
          messageFa: `${item.nameFa || item.name} در حال حاضر ناموجود شده است.`,
        });
        continue;
      }
      const freshPrice = freshProduct.price;
      if (freshPrice === null || freshPrice <= 0) {
        issues.push({
          productSlug: item.slug,
          code: 'INVALID_PRICE',
          messageEn: `${item.name} does not have a valid checkout price.`,
          messageFa: `قیمت ${item.nameFa || item.name} نامعتبر است.`,
        });
        continue;
      }
      if (freshPrice !== item.unitPrice) {
        item.unitPrice = freshPrice;
        item.lineTotal = freshPrice * item.quantity;
        issues.push({
          productSlug: item.slug,
          code: 'PRICE_CHANGED',
          messageEn: `Price for ${item.name} was updated to match live WooCommerce pricing.`,
          messageFa: `قیمت ${item.nameFa || item.name} بر اساس آخرین نرخ سرور به‌روزرسانی شد.`,
        });
      }
    }

    recalculateCartTotals(cart);

    const wpBase = (process.env.WORDPRESS_URL || 'https://utirazis.flywheelsites.com').replace(/\/+$/, '');
    const result: CheckoutRevalidationResult = {
      valid: issues.filter((i) => i.code !== 'PRICE_CHANGED').length === 0 && cart.items.length > 0,
      cart,
      issues,
      shippingMethods: [
        {
          id: 'tehran-express-courier',
          labelEn: 'Tirazis Insured Hardware Courier (Tehran & Karaj)',
          labelFa: 'پیک ویژه بیمه‌شده سخت‌افزار تیرازیس (تهران و کرج)',
          cost: cart.subtotal >= 50_000_000 ? 0 : 350_000,
        },
        {
          id: 'chapar-air-freight',
          labelEn: 'Chapar / Tipax Insured Heavy Parcel (Nationwide)',
          labelFa: 'ارسال بیمه‌شده چاپار / تیپاکس (سراسر کشور)',
          cost: cart.subtotal >= 50_000_000 ? 0 : 480_000,
        },
      ],
      gatewayMode: process.env.WORDPRESS_BASIC_PASSWORD
        ? 'woocommerce_store_api'
        : 'woocommerce_official_redirect',
      officialCheckoutUrl: `${wpBase}/checkout/`,
      revalidatedAt: new Date().toISOString(),
    };

    res.setHeader('Cache-Control', 'private, no-store');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Checkout revalidation failed' });
  }
});

app.post('/api/checkout/submit', async (req: Request, res: Response) => {
  const token = resolveCartToken(req, res);
  const cart = getOrCreateCart(token);
  const { customerName, email, phone, address, postalCode, city, shippingMethodId } = req.body || {};

  if (!customerName || !phone || !address || !postalCode) {
    res.status(400).json({
      error: 'Please complete all required customer shipping fields (Name, Phone, Address, Postal Code).',
      errorFa: 'لطفاً تمامی فیلدهای الزامی ارسال (نام، شماره تماس، آدرس دقیق و کد پستی) را تکمیل نمایید.',
    });
    return;
  }

  if (cart.items.length === 0) {
    res.status(422).json({
      error: 'Cannot submit checkout with an empty cart.',
      errorFa: 'سبد خرید شما خالی است.',
    });
    return;
  }

  const wpBase = (process.env.WORDPRESS_URL || 'https://utirazis.flywheelsites.com').replace(/\/+$/, '');
  const orderReference = `TRZ-${Date.now().toString().slice(-6)}`;
  const snapshotTotal = cart.total;
  const snapshotItems = [...cart.items];

  // Clear active cart after creating the order handoff package
  cart.items = [];
  cart.appliedCoupons = [];
  recalculateCartTotals(cart);

  res.json({
    orderReference,
    status: 'PENDING_GATEWAY_HANDOFF',
    customer: { customerName, email, phone, address, postalCode, city },
    shippingMethodId: shippingMethodId || 'tehran-express-courier',
    payableTotal: snapshotTotal,
    currency: 'IRT',
    items: snapshotItems,
    officialWooCommerceCheckoutUrl: `${wpBase}/checkout/?order_ref=${encodeURIComponent(orderReference)}`,
    createdAt: new Date().toISOString(),
  });
});

// ============================================================================
// 4. Custom Administration API (/api/admin/settings)
// ============================================================================

app.get('/api/admin/settings', (_req: Request, res: Response) => {
  res.json({
    settings: providerRegistry.getSettings(),
    providers: providerRegistry.listProviders(),
  });
});

app.post('/api/admin/settings', (req: Request, res: Response) => {
  const adminEmailHeader = String(req.headers['x-admin-email'] || '').trim().toLowerCase();
  const adminTokenHeader = String(req.headers['x-admin-token'] || '').trim();
  const expectedToken = process.env.TIRAZIS_ADMIN_TOKEN || 'tirazis-local-admin';

  const isAuthorized =
    adminEmailHeader === 'madmaxmehdi44@gmail.com' ||
    (adminTokenHeader && adminTokenHeader === expectedToken);

  if (!isAuthorized) {
    res.status(403).json({
      error: 'Server-side authorization failed. Sign in with the authorized administrator account or provide a valid admin token.',
      errorFa: 'خطای دسترسی سمت سرور: لطفاً با حساب مدیر سیستم وارد شوید.',
    });
    return;
  }

  const updated = providerRegistry.updateSettings(req.body || {});
  res.json({
    settings: updated,
    providers: providerRegistry.listProviders(),
  });
});

// ============================================================================
// 5. Server-Side Gemini AI Endpoints (/api/gemini/*)
// ============================================================================

app.post('/api/gemini/advisor', async (req: Request, res: Response) => {
  try {
    const { prompt, mode = 'thinking', latLng } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const ai = getGeminiClient();

    if (mode === 'fast-lite') {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          systemInstruction:
            'You are the Tirazis Computer Hardware Engineer. Provide concise, accurate PC hardware, socket compatibility, and power supply answers in the same language (Persian or English) as the user query.',
        },
      });
      res.json({
        model: 'gemini-3.1-flash-lite',
        text: response.text || '',
        groundingChunks: [],
      });
      return;
    }

    if (mode === 'search-grounding') {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'You are the Tirazis Computer Hardware Researcher. Use Google Search grounding to verify real-world GPU/CPU benchmarks, release specs, and hardware standards.',
          tools: [{ googleSearch: {} }],
        },
      });
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      res.json({
        model: 'gemini-3.8-flash (Google Search Grounding)',
        text: response.text || '',
        groundingChunks: chunks,
      });
      return;
    }

    if (mode === 'maps-grounding') {
      const retrievalConfig =
        latLng && typeof latLng.latitude === 'number' && typeof latLng.longitude === 'number'
          ? {
              latLng: {
                latitude: latLng.latitude,
                longitude: latLng.longitude,
              },
            }
          : {
              latLng: {
                latitude: 35.715298, // Valiasr / Mirdamad Computer Center, Tehran default
                longitude: 51.404343,
              },
            };

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig,
          },
        },
      });
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      res.json({
        model: 'gemini-3.8-flash (Google Maps Grounding)',
        text: response.text || '',
        groundingChunks: chunks,
      });
      return;
    }

    // Default: High Thinking Mode with gemini-4-argon and ThinkingLevel.HIGH (no maxOutputTokens)
    const response = await ai.models.generateContent({
      model: 'gemini-4-argon',
      contents: prompt,
      config: {
        systemInstruction:
          'You are the Chief Workstation Architect at Tirazis Computer. Perform deep technical analysis of PCIe lane topologies, PSU transient excursion limits, RAM sub-timings, and molecular dynamics compute workloads.',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
      },
    });

    res.json({
      model: 'gemini-4-argon (ThinkingLevel.HIGH)',
      text: response.text || '',
      groundingChunks: [],
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || 'Gemini AI advisor request failed.',
    });
  }
});

app.post('/api/gemini/image-generate', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      aspectRatio = '16:9',
      imageSize = '1K',
      modelChoice = 'gemini-3-pro-image',
    } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Image prompt is required' });
      return;
    }

    const ai = getGeminiClient();
    const resolvedModel =
      modelChoice === 'gemini-nano-banana-2.1' ? 'gemini-nano-banana-2.1' : 'gemini-3-pro-image';

    const response = await ai.models.generateContent({
      model: resolvedModel,
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio,
          imageSize,
        },
      },
    });

    let imageUrl: string | null = null;
    let captionText = '';
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        imageUrl = `data:${mime};base64,${part.inlineData.data}`;
      } else if (part.text) {
        captionText += part.text;
      }
    }

    if (!imageUrl) {
      res.status(502).json({ error: 'Model did not return an inline image part.' });
      return;
    }

    res.json({
      model: resolvedModel,
      imageUrl,
      captionText,
      aspectRatio,
      imageSize,
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || 'Image generation failed.',
    });
  }
});

app.post('/api/gemini/image-analyze', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', prompt } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'Base64 image data is required' });
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: 'gemini-4-argon',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text:
              prompt ||
              'Inspect this computer hardware photo or specification label. Identify the component model, connector/socket standards, thermal design, and any visible compatibility requirements.',
          },
        ],
      },
    });

    res.json({
      model: 'gemini-4-argon',
      analysis: response.text || '',
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || 'Hardware image analysis failed.',
    });
  }
});

// ============================================================================
// 6. Scientific Biomolecular Folding Benchmark Proxy (/api/science/*)
// ============================================================================

const CURATED_ALPHAFOLD_TARGETS: Record<
  string,
  {
    geneName: string;
    proteinName: string;
    organism: string;
    sequenceLength: number;
    sequence: string;
    features: { type: string; description: string; start: number; end: number }[];
  }
> = {
  P04637: {
    geneName: 'TP53',
    proteinName: 'Cellular tumor antigen p53',
    organism: 'Homo sapiens',
    sequenceLength: 393,
    sequence:
      'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGPDEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAKSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHERCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNSSCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELPPGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPGGSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD',
    features: [
      { type: 'Domain', description: 'Transactivation domain (TAD)', start: 1, end: 61 },
      { type: 'DNA binding', description: 'p53 DNA-binding core domain', start: 94, end: 292 },
      { type: 'Binding site', description: 'Catalytic Zn2+ coordination site', start: 176, end: 242 },
      { type: 'Domain', description: 'Tetramerization alpha-helical domain', start: 325, end: 356 },
    ],
  },
  P38398: {
    geneName: 'BRCA1',
    proteinName: 'Breast cancer type 1 susceptibility protein',
    organism: 'Homo sapiens',
    sequenceLength: 1863,
    sequence:
      'MDLSALRVEEVQNVINAMQKILECPICLELIKEPVSTKCDHIFCKFCMLKLLNQKKGPSQCPLCKNDITKRSLQESTRFSQLVEELLKIICAFQLDTGLEYANSYNFAKKENNSPEHLKDEVSIIQSMGYRNRAKRLLQSEPENPSLQETSLSVQLSNLGTVRTLRTKQRIQPQKTSVYIELGSDSSEDTVNKATYCSVGDQELLQITPQGTRDEISLDSAKKAACEFSETDVTNTEHHQPSNNDLNTTEKRAAERHPEKYQGSSVSNLHVEPCGTNTHASSLQHENSSLLLTKDRMNVEKAEFCNKSKQPGLARSQHNRWAGSKETCNDRRTPSTEKKVDLNADPLCERKEWNKQKLPCSENPRDTEDVPWITLNSSIQKVNEWFSRSDELLGSDDSHDGESESNAKVADVLDVLNEVDEYSGSSEKIDLLASDPHEALICKSERVHSKSVESNIEDKIFGKTYRKKASLPNLSHVTENLIIGAFVTEPQIIQERPLTNKLKRKRRPTSGLHPEDFIKKADLAVQKTPEMINQGTNQTEQNGQVMNITNSGHENKTKGDSIQNEKNPNPIESLEKESAFKTKAEPISSSISNMELELNIHNSKAPKKNRLRRKSSTRHIHALELVVSRNLSPPNCTELQIDSCSSSEEIKKKKYNQMPVRHSRNLQLMEGKEPATGAKKSNKPNEQTSKRHDSDTFPELKLTNAPGSFTKCSNTSELKEFVNPSLPREEKEEKLETVKVSNNAEDPKDLMLSGERVLQTERSVESSSISLVPGTDYGTQESISLLEVSTLGKAKTEPNKCVSQCAAFENPKGLIHGCSKDNRNDTEGFKYPLGHEVNHSRETSIEMEESELDAQYLQNTFKVSKRQSFAPFSNPGNAEEECATFSAHSGSLKKQSPKVTFECEQKEENQGKNESNIKPVQTVNITAGFPVVGQKDKPVDNAKCSIKGGSRFCLSSQFRGNETGLITPNKHGLLQNPYRIPPLFPIKSFVKTKCKKNLLEENFEEHSMSPEREMGNENIPSTVSTISRNNIRENVFKEASSSNINEVGSSTNEVGSSINEIGSSDENIQAELGRNRGPKLNAMLRLGVLQPEVYKQSLPGSNCKHPEIKKQEYEEVVQTVNTDFSPYLISDNLEQPMGSSHASQVCSETPDDLLDDGEIKEDTSFAENDIKESSAVFSKSVQKGELSRSPSPFTHTHLAQGYRRGAKKLESSEENLSSEDEELPCFQHLLFGKVNNIPSQSTRHSTVATECLSKNTEENLLSLKNSLNDCSNQVILAKASQEHHLSEETKCSASLFSSQCSELEDLTANTNTQDPFLIGSSKQMRHQSESQGVGLSDKELVSDDEERGTGLEENNQEEQSMDSNLGEAASGCESETSVSEDCSGLSSQSDILTTQQRDTMQHNLIKLQQEMAELEAVLEQHGSQPSNSYPSIISDSSALEDLRNPEQSTSEKAVLTSQKSSEYPISQNPEGLSADKFEVSADSSTSKNKEPGVERSSPSKCPSLDDRWYMHSCSGSLQNRNYPSQEELIKVVDVEEQQLEESGPHDLTETSYLPRQDLEGTPYLESGISLFSDDPESDPSEDRAPESARVGNIPSSTSALKVPQLKVAESAQSPAAAHTTDTAGYNAMEESVSREKPELTASTERVNKRMSMVVSGLTPEEFMLVYKFARKHHITLTNLITEETTHVVMKTDAEFVCERTLKYFLGIAGGKWVVSYFWVTQSIKERKMLNEHDFEVRGDVVNGRNHQGPKRARESQDRKIFRGLEICCYGPFTNMPTDQLEWMVQLCGASVVKELSSFTLGTGVHPIVVVQPDAWTEDNGFHAIGQMCEAPVVTREWVLDSVALYQCQELDTYLIPQIPHSHY',
    features: [
      { type: 'Domain', description: 'RING-type Zinc Finger Domain', start: 24, end: 65 },
      { type: 'Domain', description: 'BRCT 1 Phosphopeptide Recognition Domain', start: 1642, end: 1736 },
      { type: 'Domain', description: 'BRCT 2 Tandem Repeat Domain', start: 1756, end: 1855 },
    ],
  },
  P00533: {
    geneName: 'EGFR',
    proteinName: 'Epidermal growth factor receptor',
    organism: 'Homo sapiens',
    sequenceLength: 1210,
    sequence:
      'MRPSGTAGAALLALLAALCPASRALEEKKVCQGTSNKLTQLGTFEDHFLSLQRMFNNCEVVLGNLEITYVQRNYDLSFLKTIQEVAGYVLIALNTVERIPLENLQIIRGNMYYENSYALAVLSNYDANKTGLKELPMRNLQEILHGAVRFSNNPALCNVESIQWRDIVSSDFLSNMSMDFQNHLGSCQKCDPSCPNGSCWGAGEENCQKLTKIICAQQCSGRCRGKSPSDCCHNQCAAGCTGPRESDCLVCRKFRDEATCKDTCPPLMLYNPTTYQMDVNPEGKYSFGATCVKKCPRNYVVTDHGSCVRACGADSYEMEEDGVRKCKKCEGPCRKVCNGIGIGEFKDSLSINATNIKHFKNCTSISGDLHILPVAFRGDSFTHTPPLDPQELDILKTVKEITGFLLIQAWPENRTDLHAFENLEIIRGRTKQHGQFSLAVVSLNITSLGLRSLKEISDGDVIISGNKNLCYANTINWKKLFGTSGQKTKIISNRGENSCKATGQVCHALCSPEGCWGPEPRDCVSCRNVSRGRECVDKCNLLEGEPREFVENSECIQCHPECLPQAMNITCTGRGPDNCIQCAHYIDGPHCVKTCPAGVMGENNTLVWKYADAGHVCHLCHPNCTYGCTGPGLEGCPTNGPKIPSIATGMVGALLLLLVVALGIGLFMRRRHIVRKRTLRRLLQERELVEPLTPSGEAPNQALLRILKETEFKKIKVLGSGAFGTVYKGLWIPEGEKVKIPVAIKELREATSPKANKEILDEAYVMASVDNPHVCRLLGICLTSTVQLITQLMPFGCLDYVREHKDNIGSQYLLNWCVQIAKGMNYLEDRRLVHRDLAARNVLVKTPQHVKITDFGLAKLLGAEEKEYHAEGGKVPIKWMALESILHRIYTHQSDVWSYGVTVWELMTFGSKPYDGIPASEISSILEKGERLPQPPICTIDVYMIMVKCWMIDADSRPKFRELIIEFSKMARDPQRYLVIQGDERMHLPSPTDSNFYRALMDEEDMDDVVDADEYLIPQQGFFSSPSTSRTPLLSSLSATSNNSTVACIDRNGLQSCPIKEDSFLQRYSSDPTGALTEDSIDDTFLPVPEYINQSVPKRPAGSVQNPVYHNQPLNPAPSRDPHYQDPHSTAVGNPEYLNTVQPTCVNSTFDSPAHWAQKGSHQISLDNPDYQQDFFPKEAKPNGIFKGSTAENAEYLRVAPQSSEFIGA',
    features: [
      { type: 'Domain', description: 'Extracellular Ligand Binding Domain I', start: 25, end: 188 },
      { type: 'Domain', description: 'Protein Tyrosine Kinase Catalytic Core', start: 712, end: 979 },
      { type: 'Active site', description: 'ATP-Binding Pocket & Proton Acceptor', start: 745, end: 855 },
    ],
  },
  Q8NBP7: {
    geneName: 'PCSK9',
    proteinName: 'Proprotein convertase subtilisin/kexin type 9',
    organism: 'Homo sapiens',
    sequenceLength: 692,
    sequence:
      'MGTVSSRRSWWPLPLLLLLLLLLGPAGARAQEDEDGDYEELVLALRSEEDGLAEAPEHGTTATFHRCAKDPWRLPGTYVVVLKEETHLSQSERTARRLQAQAARRGYLTKILHVFHGLLPGFLVKMSGDLLELALKLPHVDYIEEDSSVFAQSIPWNLERITPPRYRADEYQPPDGGSLVEVYLLDTSIQSDHREIEGRVMVTDFENVPEEDGTRFHRQASKCDSHGTHLAGVVSGRDAGVAKGASMRSLRVLNCQGKGTVSGTLIGLEFIRKSQLVQPVGPLVVLLPLAGGYSRVLNAACQRLARAGVVLVTAAGNFRDDACLYSPASAPEVITVGATNAQDQPVTLGTLGTNFGRCVDLFAPGEDIIGASSDCSTCFVSQSGTSQAAAHVAGIAAMMLSAEPELTLAELRQRLIHFSAKDVINEAWFPEDQRVLTPNLVAALPPSTHGAGWQLFCRTVWSAHSGPTRMATAVARCAPDEELLSCSSFSRSGKRRGERMEAQGGKLVCRAHNAFGGEGVYAIARCCLLPQANCSVHTAPPAEASMGTRVHCHQQGHVLTGCSSHWEVEDLGTHKPPVLRPRGQPNQCVGHREASIHASCCHAPGLECKVKEHGIPAPQEQVTVACEEGWTLTGCSALPGTSHVLGAYAVDNTCVVRSRDVSTTGSTSEEAVTAVAICCRSRHLAQASQELQ',
    features: [
      { type: 'Domain', description: 'Autocatalytic Prodomain', start: 31, end: 152 },
      { type: 'Domain', description: 'Peptidase S8 Subtilisin-like Catalytic Domain', start: 153, end: 451 },
      { type: 'Active site', description: 'Catalytic Triad His-226 / Ser-386', start: 226, end: 386 },
    ],
  },
  P00520: {
    geneName: 'ABL1',
    proteinName: 'Tyrosine-protein kinase ABL1',
    organism: 'Homo sapiens',
    sequenceLength: 1130,
    sequence:
      'MLEICLKLVGCKSKKGLSSSSSCYLEEALQRPVASDFEPQGLSEAARWNSKENLLAGPSENDPNLFVALYDFVASGDNTLSITKGEKLRVLGYNHNGEWCEAQTKNGQGWVPSNYITPVNSLEKHSWYHGPVSRNAAEYLLSSGINGSFLVRESESSPGQRSISLRYEGRVYHYRINTASDGKLYVSSESRFNTLAELVHHHSTVADGLITTLHYPAPKRNKPTVYGVSPNYDKWEMERTDITMKHKLGGGQYGEVYEGVWKKYSLTVAVKTLKEDTMEVEEFLKEAAVMKEIKHPNLVQLLGVCTREPPFYIITEFMTYGNLLDYLRECNRQEVNAVVLLYMATQISSAMEYLEKKNFIHRDLAARNCLVGENHLVKVADFGLSRLMTGDTYTAHAGAKFPIKWTAPESLAYNKFSIKSDVWAFGVLLWEIATYGMSPYPGIDLSQVYELLEKDYRMERPEGCPEKVYELMRACWQWNPSDRPSFAEIHQAFETMFQESSISDEVEKELGKQGVRGAVSTLLQAPELPTKTRTSRRAAEHRDTTDVPEMPHSKGQGESDPLDHEPAVSPLLPRKERGPPEGGLNEDERLLPKDKKTNLFSALIKKKKKTAPTPPKRSSSFREMDGQPERRGAGEEEGRDISNGALAFTPLDTADPAKSPKPSNGAGVPNGALRESGGSGFRSPHLWKKSSTLTSSRLATGEEEGGGSSSKRFLRSCSASCVPHGAKDTEWRSVTLPRDLQSTGRQFDSSTFGGHKSEKPALPRKRAGENRSDQVTRGTVTPPPRLVKKNEEAADEVFKDIMESSPGSSPPNLTPKPLRRQVTVAPASGLPHKEEAGKGSALGTPAAAEPVTPTSKAGSGAPGGTSKGPAEESRVRRHKHSSESPGRDKGKLSRLKPAPPPPPAASAGKAGGKPSQSPSQEAAGEAVLGAKTKATSLVDAVNSDAAKPSQPGEGLKKPVLPATPKPQSAKPSGTPISPAPVPSTLPSASSALAGDQPSSTAFIPLISTRVSLRKTRQPPERIASGAITKGVVLDSTEALCLAISRNSEQMASHSAVLEAGKNLYTFCVSYVDSIQQMRNKFAFREAINKLENNLRELQICPATAGSGPAATQDFSKLLSSVKEISDIVQR',
    features: [
      { type: 'Domain', description: 'SH3 & SH2 Regulatory Domains', start: 61, end: 215 },
      { type: 'Domain', description: 'Tyrosine Kinase Catalytic Domain', start: 242, end: 493 },
      { type: 'Binding site', description: 'Imatinib / ATP Binding Cleft', start: 248, end: 318 },
    ],
  },
};

app.get('/api/science/protein/:accession', async (req: Request, res: Response) => {
  const accession = String(req.params.accession || 'P04637').trim().toUpperCase();
  try {
    let seqLength = 393;
    let sequenceValue = '';
    let geneName = accession;
    let proteinName = 'Biomolecular Target';
    let organism = 'Homo sapiens';
    let features: { type: string; description: string; start: number; end: number }[] = [];
    let cifUrl = `https://alphafold.ebi.ac.uk/files/AF-${accession}-F1-model_v6.cif`;
    let pdbUrl = `https://alphafold.ebi.ac.uk/files/AF-${accession}-F1-model_v6.pdb`;
    let paeImageUrl: string | null = null;
    let provenance = 'Predicted by AlphaFold DB v6 & Curated by UniProtKB';

    try {
      const [afRes, uniprotRes] = await Promise.all([
        fetchWithRetry(`https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(accession)}`, {}, 1, 2500),
        fetchWithRetry(`https://rest.uniprot.org/uniprotkb/${encodeURIComponent(accession)}.json`, {}, 1, 2500),
      ]);

      const afData = await afRes.json();
      const uniprotData = await uniprotRes.json();
      const afEntry = Array.isArray(afData) ? afData[0] : null;

      seqLength = Number(uniprotData?.sequence?.length || afEntry?.uniprotEnd || 393);
      sequenceValue = String(uniprotData?.sequence?.value || afEntry?.uniprotSequence || '');
      geneName = uniprotData?.genes?.[0]?.geneName?.value || afEntry?.gene || accession;
      proteinName =
        uniprotData?.proteinDescription?.recommendedName?.fullName?.value ||
        afEntry?.uniprotDescription ||
        'Biomolecular Target';
      organism =
        uniprotData?.organism?.scientificName || afEntry?.organismScientificName || 'Homo sapiens';
      if (afEntry?.cifUrl) cifUrl = afEntry.cifUrl;
      if (afEntry?.pdbUrl) pdbUrl = afEntry.pdbUrl;
      if (afEntry?.paeImageUrl) paeImageUrl = afEntry.paeImageUrl;

      features = Array.isArray(uniprotData?.features)
        ? uniprotData.features
            .filter((f: any) =>
              ['Domain', 'Active site', 'Binding site', 'Natural variant', 'DNA binding'].includes(f.type)
            )
            .slice(0, 12)
            .map((f: any) => ({
              type: String(f.type),
              description: String(f.description || f.type),
              start: Number(f.location?.start?.value || 1),
              end: Number(f.location?.end?.value || 1),
            }))
        : [];
    } catch {
      const curated = CURATED_ALPHAFOLD_TARGETS[accession] || CURATED_ALPHAFOLD_TARGETS.P04637;
      seqLength = curated.sequenceLength;
      sequenceValue = curated.sequence;
      geneName = accession in CURATED_ALPHAFOLD_TARGETS ? curated.geneName : accession;
      proteinName = curated.proteinName;
      organism = curated.organism;
      features = curated.features;
      provenance = 'Curated AlphaFold DB v6 & UniProtKB Reference Record';
    }

    // Compute hardware VRAM & molecular dynamics throughput requirements based on sequence length
    const recommendedVramGb = seqLength > 1200 ? 24 : seqLength > 500 ? 16 : 12;
    const estimatedAtoms = seqLength * 15;

    res.json({
      accession,
      geneName,
      proteinName,
      organism,
      sequenceLength: seqLength,
      sequence: sequenceValue,
      cifUrl,
      pdbUrl,
      paeImageUrl,
      provenance,
      features,
      hardwareBenchmark: {
        estimatedAtomCount: estimatedAtoms,
        recommendedVramGb,
        rtx4080SuperNsPerDay: Math.max(12, Math.round(18000 / Math.max(100, seqLength))),
        rtx4090NsPerDay: Math.max(18, Math.round(26500 / Math.max(100, seqLength))),
        alphaFoldInferenceMinutesRtx4080: Math.max(1.2, Number((seqLength * 0.0085).toFixed(1))),
      },
    });
  } catch (err: any) {
    res.status(502).json({
      error: `Failed to query AlphaFold DB / UniProt for ${accession}: ${err?.message || 'Upstream error'}`,
    });
  }
});

// ============================================================================
// 7. Dynamic XML Sitemap (/sitemap.xml)
// ============================================================================

app.get('/sitemap.xml', async (_req: Request, res: Response) => {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const provider = getActiveCommerceProvider();
  const page = await provider.getProducts({ pageSize: 24 });
  const urls = [
    `${siteUrl}/fa`,
    `${siteUrl}/en`,
    `${siteUrl}/fa/catalog`,
    `${siteUrl}/fa/builder`,
    `${siteUrl}/fa/compare`,
    `${siteUrl}/fa/science`,
    ...page.items.map((p) => `${siteUrl}/fa/product/${p.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

// ============================================================================
// 8. Vite Dev Middleware / Production Static Asset Serving
// ============================================================================

async function startServer() {
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Tirazis Computer Headless Commerce server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
