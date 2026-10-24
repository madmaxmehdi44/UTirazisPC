import {
  CompatibilityIssue,
  CompatibilityReport,
  PcComponentSlot,
  Product,
  ProductQuery,
  StockStatus,
} from './types';

const DEMO_PRODUCT_KEYWORDS = [
  't-shirt',
  'tshirt',
  'v-neck',
  'sunglasses',
  'beanie',
  'hoodie',
  'cap',
  'belt',
  'polo',
  'jeans',
  'pennant',
  'album',
  'single',
  'logo collection',
  'wordpress pennant',
  'clothing',
  'decor',
];

/**
 * Detects whether a returned WooCommerce product record is a generic sample/demo item
 * (such as T-shirts, hoodies, sunglasses, albums, or unconfigured "Product" / "product-21" placeholders)
 * so it is never silently presented as real computer hardware.
 */
export function isWooCommerceDemoProduct(name: string, slug: string, categories: string[] = []): boolean {
  const cleanName = name.trim().toLowerCase();
  const cleanSlug = slug.trim().toLowerCase();
  if (
    cleanName === 'product' ||
    cleanName === 'unnamed product' ||
    /^product(-\d+)?$/.test(cleanSlug)
  ) {
    return true;
  }
  const haystack = `${cleanName} ${cleanSlug} ${categories.join(' ')}`.toLowerCase();
  return DEMO_PRODUCT_KEYWORDS.some((kw) => haystack.includes(kw));
}

/**
 * Parses a raw WooCommerce / WPGraphQL price string or number into a clean numeric value,
 * returning null when price is absent or unparseable (never inventing prices).
 */
export function parseWooPrice(rawPrice: unknown, minorUnit = 0): number | null {
  if (rawPrice === null || rawPrice === undefined || rawPrice === '') {
    return null;
  }
  if (typeof rawPrice === 'number') {
    return Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : null;
  }
  if (typeof rawPrice === 'string') {
    // Handle price ranges like "12,000,000 - 15,000,000" by taking the first valid price
    const firstPart = rawPrice.split('-')[0] ?? rawPrice;
    const cleaned = firstPart.replace(/[^\d.]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    if (minorUnit > 0) {
      return parsed / Math.pow(10, minorUnit);
    }
    return parsed;
  }
  return null;
}

/**
 * Maps raw WPGraphQL or WooCommerce Store API stock status strings into normalized StockStatus.
 * Explicitly distinguishes IN_STOCK, OUT_OF_STOCK, ON_BACKORDER, and UNKNOWN.
 */
export function normalizeStockStatus(rawStatus: unknown, isInStockBoolean?: boolean): StockStatus {
  if (typeof rawStatus === 'string' && rawStatus.trim() !== '') {
    const normalized = rawStatus.trim().toUpperCase().replace(/[\s-]/g, '_');
    if (normalized === 'INSTOCK' || normalized === 'IN_STOCK') return 'IN_STOCK';
    if (normalized === 'OUTOFSTOCK' || normalized === 'OUT_OF_STOCK') return 'OUT_OF_STOCK';
    if (normalized === 'ONBACKORDER' || normalized === 'ON_BACKORDER') return 'ON_BACKORDER';
  }
  if (typeof isInStockBoolean === 'boolean') {
    return isInStockBoolean ? 'IN_STOCK' : 'OUT_OF_STOCK';
  }
  return 'UNKNOWN';
}

/**
 * Resolves the adaptive page size for Iranian internet connections based on connection profile
 * and user preferences (8 items on constrained/Save-Data connections, 12-16 on faster connections).
 */
export function resolveAdaptivePageSize(
  requestedPageSize?: number,
  connectionProfile: 'constrained' | 'standard' | 'fast' = 'standard',
  constrainedDefault = 8,
  fastDefault = 12
): number {
  if (typeof requestedPageSize === 'number' && requestedPageSize >= 1 && requestedPageSize <= 24) {
    return requestedPageSize;
  }
  if (connectionProfile === 'constrained') {
    return constrainedDefault;
  }
  if (connectionProfile === 'fast') {
    return fastDefault;
  }
  return 12;
}

/**
 * Filters and sorts a collection of normalized products according to ProductQuery parameters.
 */
export function filterAndSortProducts(products: Product[], query: ProductQuery & { query?: string }): Product[] {
  let result = [...products];

  if (query.excludeDemoProducts) {
    result = result.filter((p) => !p.isDemoProduct);
  }

  if (query.slot) {
    result = result.filter((p) => p.hardwareSpecs.slot === query.slot);
  }

  if (query.categorySlug && query.categorySlug !== 'all') {
    result = result.filter((p) => p.categories.some((c) => c.slug === query.categorySlug));
  }

  if (query.brandSlug && query.brandSlug !== 'all') {
    result = result.filter((p) => p.brand?.slug === query.brandSlug);
  }

  if (query.inStockOnly) {
    result = result.filter((p) => p.stockStatus === 'IN_STOCK');
  }

  if (typeof query.minPrice === 'number') {
    result = result.filter((p) => p.price !== null && p.price >= query.minPrice!);
  }

  if (typeof query.maxPrice === 'number') {
    result = result.filter((p) => p.price !== null && p.price <= query.maxPrice!);
  }

  if (query.query && query.query.trim() !== '') {
    const q = query.query.trim().toLowerCase();
    result = result.filter((p) => {
      const matchName = p.name.toLowerCase().includes(q) || (p.nameFa?.toLowerCase().includes(q) ?? false);
      const matchSlug = p.slug.toLowerCase().includes(q);
      const matchSku = p.sku?.toLowerCase().includes(q) ?? false;
      const matchBrand = p.brand?.name.toLowerCase().includes(q) ?? false;
      const matchSpecs =
        (p.hardwareSpecs.socket?.toLowerCase().includes(q) ?? false) ||
        (p.hardwareSpecs.memoryType?.toLowerCase().includes(q) ?? false);
      return matchName || matchSlug || matchSku || matchBrand || matchSpecs;
    });
  }

  const sort = query.sort ?? 'featured';
  if (sort === 'price-asc') {
    result.sort((a, b) => {
      if (a.price === null && b.price === null) return 0;
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return a.price - b.price;
    });
  } else if (sort === 'price-desc') {
    result.sort((a, b) => {
      if (a.price === null && b.price === null) return 0;
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return b.price - a.price;
    });
  } else if (sort === 'name-asc') {
    result.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'in-stock-first') {
    const rank = (s: StockStatus) => (s === 'IN_STOCK' ? 0 : s === 'ON_BACKORDER' ? 1 : s === 'UNKNOWN' ? 2 : 3);
    result.sort((a, b) => rank(a.stockStatus) - rank(b.stockStatus));
  }

  return result;
}

/**
 * Deterministic PC Builder Compatibility Engine.
 * Evaluates socket, memory type, form factor, physical GPU/cooler clearance, and PSU power headroom.
 * Never guesses when technical attributes are missing: explicitly marks missing attributes as 'unverified'.
 */
export function evaluatePcBuildCompatibility(
  parts: Partial<Record<PcComponentSlot, Product | null>>,
  strictSocketCheck = true
): CompatibilityReport {
  const issues: CompatibilityIssue[] = [];
  const verifiedChecks: CompatibilityReport['verifiedChecks'] = [];

  const selectedEntries = Object.entries(parts).filter(([, product]) => Boolean(product)) as [
    PcComponentSlot,
    Product,
  ][];

  const selectedCount = selectedEntries.length;
  const totalPrice = selectedEntries.reduce((sum, [, prod]) => sum + (prod.price ?? 0), 0);
  const currency = selectedEntries[0]?.[1]?.currency ?? 'IRT';

  const cpu = parts.cpu ?? null;
  const motherboard = parts.motherboard ?? null;
  const gpu = parts.gpu ?? null;
  const ram = parts.ram ?? null;
  const storage = parts.storage ?? null;
  const psu = parts.psu ?? null;
  const pcCase = parts.case ?? null;
  const cooler = parts.cooler ?? null;

  // Base system draw (motherboard chipset, fans, NVMe, USB peripherals) when any part is selected
  const baseWatts = selectedCount > 0 ? 65 : 0;
  const cpuWatts = cpu?.hardwareSpecs.tdpWatts ?? 0;
  const gpuWatts = gpu?.hardwareSpecs.tdpWatts ?? 0;
  const ramWatts = ram ? 15 : 0;
  const storageWatts = storage ? 10 : 0;
  const coolerWatts = cooler ? 15 : 0;

  const estimatedWattage = baseWatts + cpuWatts + gpuWatts + ramWatts + storageWatts + coolerWatts;
  const recommendedPsuWatts = estimatedWattage > 0 ? Math.ceil((estimatedWattage * 1.25) / 50) * 50 : 0;

  // 1. CPU <-> Motherboard Socket Check
  if (cpu && motherboard) {
    const cpuSocket = cpu.hardwareSpecs.socket;
    const mbSocket = motherboard.hardwareSpecs.socket;
    if (!cpuSocket || !mbSocket) {
      issues.push({
        severity: 'unverified',
        code: 'SOCKET_UNVERIFIED',
        slots: ['cpu', 'motherboard'],
        messageEn: `Socket specification is missing on ${!cpuSocket ? cpu.name : motherboard.name}; compatibility cannot be automatically verified.`,
        messageFa: `مشخصات سوکت برای ${!cpuSocket ? (cpu.nameFa || cpu.name) : (motherboard.nameFa || motherboard.name)} ثبت نشده است؛ بررسی خودکار امکان‌پذیر نیست.`,
      });
    } else if (cpuSocket.toUpperCase() !== mbSocket.toUpperCase()) {
      issues.push({
        severity: strictSocketCheck ? 'incompatible' : 'warning',
        code: 'SOCKET_MISMATCH',
        slots: ['cpu', 'motherboard'],
        messageEn: `Socket mismatch: CPU uses ${cpuSocket}, but Motherboard requires ${mbSocket}.`,
        messageFa: `عدم تطابق سوکت: پردازنده دارای سوکت ${cpuSocket} است اما مادربرد از سوکت ${mbSocket} پشتیبانی می‌کند.`,
      });
      verifiedChecks.push({
        code: 'CPU_MB_SOCKET',
        passed: false,
        labelEn: `CPU & Motherboard Socket (${cpuSocket} vs ${mbSocket})`,
        labelFa: `تطابق سوکت پردازنده و مادربرد (${cpuSocket} در برابر ${mbSocket})`,
      });
    } else {
      verifiedChecks.push({
        code: 'CPU_MB_SOCKET',
        passed: true,
        labelEn: `CPU & Motherboard Socket Verified (${cpuSocket})`,
        labelFa: `تطابق سوکت پردازنده و مادربرد تایید شد (${cpuSocket})`,
      });
    }
  }

  // 2. Motherboard <-> RAM Memory Generation Check
  if (motherboard && ram) {
    const mbMem = motherboard.hardwareSpecs.memoryType;
    const ramMem = ram.hardwareSpecs.memoryType;
    if (!mbMem || !ramMem) {
      issues.push({
        severity: 'unverified',
        code: 'MEMORY_TYPE_UNVERIFIED',
        slots: ['motherboard', 'ram'],
        messageEn: 'Memory generation (DDR4/DDR5) attribute is missing on Motherboard or RAM.',
        messageFa: 'مشخصات نسل حافظه (DDR4/DDR5) در مادربرد یا رم ثبت نشده است.',
      });
    } else if (mbMem.toUpperCase() !== ramMem.toUpperCase()) {
      issues.push({
        severity: 'incompatible',
        code: 'MEMORY_TYPE_MISMATCH',
        slots: ['motherboard', 'ram'],
        messageEn: `Memory incompatibility: Motherboard supports ${mbMem}, but selected RAM is ${ramMem}.`,
        messageFa: `ناسازگاری حافظه رم: مادربرد از ${mbMem} پشتیبانی می‌کند اما رم انتخابی ${ramMem} است.`,
      });
      verifiedChecks.push({
        code: 'MB_RAM_TYPE',
        passed: false,
        labelEn: `Memory Generation (${mbMem} vs ${ramMem})`,
        labelFa: `نسل حافظه رم (${mbMem} در برابر ${ramMem})`,
      });
    } else {
      verifiedChecks.push({
        code: 'MB_RAM_TYPE',
        passed: true,
        labelEn: `Memory Generation Verified (${ramMem})`,
        labelFa: `تطابق نسل حافظه رم تایید شد (${ramMem})`,
      });
    }
  }

  // 3. Motherboard <-> Case Form Factor Check
  if (motherboard && pcCase) {
    const mbForm = motherboard.hardwareSpecs.formFactor;
    const supportedForms = pcCase.hardwareSpecs.supportedFormFactors;
    if (!mbForm || !supportedForms || supportedForms.length === 0) {
      issues.push({
        severity: 'unverified',
        code: 'FORM_FACTOR_UNVERIFIED',
        slots: ['motherboard', 'case'],
        messageEn: 'Form factor specifications are missing on Motherboard or Case.',
        messageFa: 'ابعاد استاندارد (Form Factor) برای مادربرد یا کیس ثبت نشده است.',
      });
    } else {
      const normalizedSupported = supportedForms.map((f) => f.toUpperCase());
      const fits = normalizedSupported.includes(mbForm.toUpperCase());
      if (!fits) {
        issues.push({
          severity: 'incompatible',
          code: 'FORM_FACTOR_MISMATCH',
          slots: ['motherboard', 'case'],
          messageEn: `Form factor incompatibility: ${motherboard.name} is ${mbForm}, which exceeds ${pcCase.name} (${supportedForms.join(', ')}).`,
          messageFa: `ناسازگاری ابعاد مادربرد: فرم فاکتور ${mbForm} در کیس انتخابی (${supportedForms.join('، ')}) جا نمی‌شود.`,
        });
      }
      verifiedChecks.push({
        code: 'MB_CASE_FORM',
        passed: fits,
        labelEn: `Chassis Form Factor Clearance (${mbForm})`,
        labelFa: `تطابق فرم فاکتور مادربرد و کیس (${mbForm})`,
      });
    }
  }

  // 4. GPU Physical Length <-> Case Max GPU Clearance
  if (gpu && pcCase) {
    const gpuLen = gpu.hardwareSpecs.gpuLengthMm;
    const maxLen = pcCase.hardwareSpecs.maxGpuLengthMm;
    if (typeof gpuLen !== 'number' || typeof maxLen !== 'number') {
      issues.push({
        severity: 'unverified',
        code: 'GPU_CLEARANCE_UNVERIFIED',
        slots: ['gpu', 'case'],
        messageEn: 'Physical GPU length or Case GPU clearance attribute is missing.',
        messageFa: 'طول کارت گرافیک یا حداکثر فضای کیس در مشخصات فنی ثبت نشده است.',
      });
    } else if (gpuLen > maxLen) {
      issues.push({
        severity: 'incompatible',
        code: 'GPU_TOO_LONG',
        slots: ['gpu', 'case'],
        messageEn: `Physical clearance failure: GPU length is ${gpuLen}mm, exceeding Case maximum of ${maxLen}mm.`,
        messageFa: `عدم تناسب فیزیکی: طول کارت گرافیک (${gpuLen} میلی‌متر) بیشتر از فضای مجاز کیس (${maxLen} میلی‌متر) است.`,
      });
      verifiedChecks.push({
        code: 'GPU_CASE_LENGTH',
        passed: false,
        labelEn: `GPU Physical Clearance (${gpuLen}mm > ${maxLen}mm)`,
        labelFa: `فضای نصب کارت گرافیک (${gpuLen}mm > ${maxLen}mm)`,
      });
    } else {
      verifiedChecks.push({
        code: 'GPU_CASE_LENGTH',
        passed: true,
        labelEn: `GPU Physical Clearance Verified (${gpuLen}mm / ${maxLen}mm max)`,
        labelFa: `فضای فیزیکی کارت گرافیک تایید شد (${gpuLen} از حداکثر ${maxLen} میلی‌متر)`,
      });
    }
  }

  // 5. Power Supply Wattage Check
  if (psu && estimatedWattage > 0) {
    const psuWatts = psu.hardwareSpecs.psuWatts;
    if (typeof psuWatts !== 'number') {
      issues.push({
        severity: 'unverified',
        code: 'PSU_WATTAGE_UNVERIFIED',
        slots: ['psu'],
        messageEn: 'PSU continuous wattage attribute is missing.',
        messageFa: 'توان خروجی پاور در مشخصات فنی ثبت نشده است.',
      });
    } else if (psuWatts < estimatedWattage) {
      issues.push({
        severity: 'incompatible',
        code: 'PSU_INSUFFICIENT',
        slots: ['psu', 'gpu', 'cpu'],
        messageEn: `Insufficient power supply: System draws ~${estimatedWattage}W under load, exceeding PSU rating (${psuWatts}W).`,
        messageFa: `کمبود توان پاور: مصرف تخمینی سیستم حدود ${estimatedWattage} وات است که از توان پاور (${psuWatts} وات) بیشتر است.`,
      });
      verifiedChecks.push({
        code: 'PSU_HEADROOM',
        passed: false,
        labelEn: `PSU Capacity (${psuWatts}W < ${estimatedWattage}W load)`,
        labelFa: `ظرفیت توان پاور (${psuWatts} وات کمتر از مصرف ${estimatedWattage} وات)`,
      });
    } else if (psuWatts < recommendedPsuWatts) {
      issues.push({
        severity: 'warning',
        code: 'PSU_LOW_HEADROOM',
        slots: ['psu'],
        messageEn: `Low PSU transient headroom: ${psuWatts}W covers ${estimatedWattage}W load, but ${recommendedPsuWatts}W+ is recommended for peak GPU transient spikes.`,
        messageFa: `حاشیه اطمینان پایین پاور: توان ${psuWatts} وات پاسخگوی مصرف ${estimatedWattage} وات هست، اما برای نوسانات لحظه‌ای حداقل ${recommendedPsuWatts} وات پیشنهاد می‌شود.`,
      });
      verifiedChecks.push({
        code: 'PSU_HEADROOM',
        passed: true,
        labelEn: `PSU Capacity Tight (${psuWatts}W vs ${recommendedPsuWatts}W recommended)`,
        labelFa: `توان پاور لب‌مرزی (${psuWatts} وات در برابر ${recommendedPsuWatts} وات پیشنهادی)`,
      });
    } else {
      verifiedChecks.push({
        code: 'PSU_HEADROOM',
        passed: true,
        labelEn: `PSU Headroom Verified (${psuWatts}W for ~${estimatedWattage}W load)`,
        labelFa: `ظرفیت و حاشیه اطمینان پاور تایید شد (${psuWatts} وات برای بار ${estimatedWattage} وات)`,
      });
    }
  }

  let status: CompatibilityReport['status'] = 'compatible';
  if (selectedCount === 0) {
    status = 'unverified';
  } else if (issues.some((i) => i.severity === 'incompatible')) {
    status = 'incompatible';
  } else if (issues.some((i) => i.severity === 'warning')) {
    status = 'warning';
  } else if (issues.some((i) => i.severity === 'unverified')) {
    status = 'unverified';
  }

  return {
    status,
    estimatedWattage,
    recommendedPsuWatts,
    totalPrice,
    currency,
    selectedCount,
    issues,
    verifiedChecks,
  };
}
