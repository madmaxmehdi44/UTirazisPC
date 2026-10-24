export type Locale = 'fa' | 'en';

export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'ON_BACKORDER' | 'UNKNOWN';

export type PcComponentSlot =
  | 'cpu'
  | 'motherboard'
  | 'gpu'
  | 'ram'
  | 'storage'
  | 'psu'
  | 'case'
  | 'cooler';

export interface HardwareSpecs {
  slot?: PcComponentSlot;
  socket?: string;           // e.g. 'AM5', 'LGA1700', 'sTR5'
  memoryType?: string;       // e.g. 'DDR5', 'DDR4'
  memoryCapacityGb?: number; // e.g. 32, 64, 128
  formFactor?: string;       // e.g. 'ATX', 'Micro-ATX', 'Mini-ITX', 'E-ATX'
  supportedFormFactors?: string[]; // For PC Cases
  tdpWatts?: number;         // Thermal Design Power / board power for CPU/GPU
  psuWatts?: number;         // Rated continuous wattage for PSU
  gpuLengthMm?: number;      // Physical GPU card length in mm
  maxGpuLengthMm?: number;   // Max supported GPU length in Case
  coolerHeightMm?: number;   // Air cooler height in mm
  radiatorSizeMm?: number;   // 240, 360, 420
  maxCoolerHeightMm?: number;
  vramGb?: number;           // GPU VRAM in GB (also used in Science Folding Benchmark)
  cudaCores?: number;        // GPU compute cores
  interfaceType?: string;    // e.g. 'PCIe 5.0 x16', 'PCIe 4.0 NVMe M.2'
}

export interface ProductAttribute {
  name: string;
  labelFa?: string;
  options: string[];
}

export interface ProductVariation {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  regularPrice: number | null;
  salePrice: number | null;
  stockStatus: StockStatus;
  attributes: Record<string, string>;
}

export interface Product {
  id: string;
  databaseId?: number;
  name: string;
  nameFa?: string;
  slug: string;
  sku: string | null;
  type: 'SIMPLE' | 'VARIABLE' | 'EXTERNAL' | 'UNKNOWN';
  shortDescription: string;
  shortDescriptionFa?: string;
  description: string;
  descriptionFa?: string;
  price: number | null;
  regularPrice: number | null;
  salePrice: number | null;
  currency: 'IRR' | 'IRT' | 'USD';
  stockStatus: StockStatus;
  stockQuantity: number | null;
  imageUrl: string | null;
  imageAlt: string;
  galleryUrls: string[];
  categories: { id: string; name: string; nameFa?: string; slug: string }[];
  brand: { id: string; name: string; slug: string } | null;
  attributes: ProductAttribute[];
  variations: ProductVariation[];
  hardwareSpecs: HardwareSpecs;
  relatedProductSlugs: string[];
  isDemoProduct: boolean;
  dataSource: 'wordpress-live' | 'verified-hardware-seed';
}

export interface Category {
  id: string;
  name: string;
  nameFa: string;
  slug: string;
  count: number;
  description?: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export interface EditorialPost {
  id: string;
  title: string;
  titleFa: string;
  slug: string;
  excerpt: string;
  excerptFa: string;
  publishedAt: string;
  author: string;
  readTimeMinutes: number;
  category: string;
  dataSource: 'wordpress-live' | 'verified-editorial-seed';
}

export type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'name-asc' | 'in-stock-first';

export interface ProductQuery {
  page?: number;
  pageSize?: number;
  categorySlug?: string;
  brandSlug?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  slot?: PcComponentSlot;
  sort?: SortOption;
  excludeDemoProducts?: boolean;
  connectionProfile?: 'constrained' | 'standard' | 'fast';
}

export interface SearchQuery extends ProductQuery {
  query: string;
}

export interface ProductPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  endCursor?: string | null;
  containsDemoProducts: boolean;
  providerId: string;
  dataSource: 'wordpress-live' | 'verified-hardware-seed';
  freshnessTimestamp: string;
  isStaleFallback: boolean;
}

export interface ProviderHealth {
  providerId: string;
  providerName: string;
  status: 'healthy' | 'auth_required' | 'degraded' | 'unreachable';
  wordpressUrl: string;
  graphqlUrl: string;
  storeApiUrl: string;
  basicAuthConfigured: boolean;
  wooRestConfigured: boolean;
  graphqlReachable: boolean;
  storeApiReachable: boolean;
  httpStatusCode: number | null;
  authHeaderRealm: string | null;
  containsDemoCatalog: boolean;
  latencyMs: number;
  checkedAt: string;
  message: string;
  messageFa: string;
}

export interface CommerceProvider {
  readonly id: string;
  readonly name: string;
  getProducts(input: ProductQuery): Promise<ProductPage>;
  getProductBySlug(slug: string): Promise<Product | null>;
  getCategories(): Promise<Category[]>;
  getBrands(): Promise<Brand[]>;
  searchProducts(input: SearchQuery): Promise<ProductPage>;
  getPosts(limit?: number): Promise<EditorialPost[]>;
  getHealth(): Promise<ProviderHealth>;
}

export interface CartItem {
  key: string;
  productId: string;
  slug: string;
  name: string;
  nameFa?: string;
  variationId?: string;
  variationAttributes?: Record<string, string>;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  currency: 'IRR' | 'IRT' | 'USD';
  stockStatus: StockStatus;
  imageUrl: string | null;
  sku: string | null;
}

export interface Cart {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  currency: 'IRR' | 'IRT' | 'USD';
  appliedCoupons: string[];
  cartTokenPresent: boolean;
  noncePresent: boolean;
  syncedWithStoreApi: boolean;
  updatedAt: string;
}

export interface CheckoutRevalidationResult {
  valid: boolean;
  cart: Cart;
  issues: {
    productSlug: string;
    code: 'OUT_OF_STOCK' | 'PRICE_CHANGED' | 'INVALID_PRICE' | 'VARIATION_REQUIRED';
    messageEn: string;
    messageFa: string;
  }[];
  shippingMethods: {
    id: string;
    labelEn: string;
    labelFa: string;
    cost: number;
  }[];
  gatewayMode: 'woocommerce_store_api' | 'woocommerce_official_redirect';
  officialCheckoutUrl: string;
  revalidatedAt: string;
}

export interface CompatibilityIssue {
  severity: 'incompatible' | 'warning' | 'unverified';
  code: string;
  slots: PcComponentSlot[];
  messageEn: string;
  messageFa: string;
}

export interface CompatibilityReport {
  status: 'compatible' | 'warning' | 'incompatible' | 'unverified';
  estimatedWattage: number;
  recommendedPsuWatts: number;
  totalPrice: number;
  currency: 'IRR' | 'IRT' | 'USD';
  selectedCount: number;
  issues: CompatibilityIssue[];
  verifiedChecks: {
    code: string;
    passed: boolean;
    labelEn: string;
    labelFa: string;
  }[];
}

export interface AdminSettings {
  activeProvider: 'wordpress-woocommerce';
  catalogRevalidateSeconds: number;
  priceStockRevalidateSeconds: number;
  constrainedPageSize: number;
  fastPageSize: number;
  strictSocketCheck: boolean;
  hideDemoProductsByDefault: boolean;
  updatedAt: string;
}
