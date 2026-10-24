import { Locale, StockStatus } from '../commerce/types';

export function formatCurrency(amount: number | null, currency: 'IRR' | 'IRT' | 'USD', locale: Locale): string {
  if (amount === null || !Number.isFinite(amount)) {
    return locale === 'fa' ? 'استعلام قیمت' : 'Price Unverified';
  }
  if (locale === 'fa') {
    const formatted = new Intl.NumberFormat('fa-IR').format(amount);
    const unit = currency === 'IRR' ? 'ریال' : currency === 'USD' ? 'دلار' : 'تومان';
    return `${formatted} ${unit}`;
  }
  const formatted = new Intl.NumberFormat('en-US').format(amount);
  const unit = currency === 'IRR' ? 'IRR' : currency === 'USD' ? 'USD' : 'Toman';
  return `${formatted} ${unit}`;
}

export function formatStockLabel(status: StockStatus, locale: Locale): string {
  if (status === 'IN_STOCK') return locale === 'fa' ? 'موجود در انبار تیرازیس' : 'In Stock';
  if (status === 'OUT_OF_STOCK') return locale === 'fa' ? 'ناموجود' : 'Out of Stock';
  if (status === 'ON_BACKORDER') return locale === 'fa' ? 'سفارش پیش‌خرید' : 'On Backorder';
  return locale === 'fa' ? 'وضعیت موجودی نامشخص' : 'Stock Unverified';
}

export const TRANSLATIONS = {
  fa: {
    brandName: 'تیرازیس کامپیوتر',
    navCatalog: 'کاتالوگ قطعات',
    navBuilder: 'اسمبل هوشمند',
    navCompare: 'مقایسه فنی',
    navScience: 'بنچمارک علمی',
    navAiLab: 'آزمایشگاه هوش مصنوعی',
    navBlog: 'مقالات فنی',
    navAdmin: 'تنظیمات سیستم',
    navAccount: 'حساب کاربری',
    heroKicker: 'مهندسی سیستم‌های ورک‌استیشن، سرور و قطعات رده‌بالا',
    heroTitle: 'معماری دقیق سخت‌افزار برای پردازش‌های سنگین و گیمینگ حرفه‌ای',
    heroSubtitle:
      'فروشگاه هدلس تیرازیس کامپیوتر متصل به هسته ووکامرس و WPGraphQL، مجهز به موتور بررسی سازگاری فیزیکی و الکتریکی قطعات، بنچمارک تاشدگی پروتئین AlphaFold و بهینه‌سازی هوشمند برای اینترنت ایران.',
    ctaExploreCatalog: 'مشاهده کاتالوگ قطعات',
    ctaLaunchBuilder: 'ورود به سیستم‌ساز هوشمند',
    searchPlaceholder: 'جستجوی نام قطعه، مدل، سوکت (AM5, LGA1700, RTX 4080)...',
    addToCart: 'افزودن به سبد خرید',
    outOfStock: 'ناموجود',
    compareAdd: 'افزودن به مقایسه',
    compareRemove: 'حذف از مقایسه',
    selectInBuilder: 'انتخاب در سیستم‌ساز',
    cartTitle: 'سبد خرید تیرازیس',
    cartEmpty: 'سبد خرید شما در حال حاضر خالی است.',
    proceedToCheckout: 'ادامه جهت تسویه‌حساب و بررسی نهایی موجودی',
    networkConstrained: 'حالت کم‌مصرف (اینترنت محدود — ۸ کالا در صفحه)',
    networkStandard: 'حالت استاندارد (۱۲ کالا در صفحه)',
    networkFast: 'حالت پرسرعت (۱۶ کالا در صفحه)',
  },
  en: {
    brandName: 'Tirazis Computer',
    navCatalog: 'Catalog',
    navBuilder: 'PC Builder',
    navCompare: 'Compare',
    navScience: 'Folding Lab',
    navAiLab: 'AI Hardware Studio',
    navBlog: 'Editorial',
    navAdmin: 'Admin',
    navAccount: 'Account',
    heroKicker: 'Precision Workstation, Server & Enthusiast Hardware Retail',
    heroTitle: 'Deterministic Hardware Architecture for Compute & High-Frame Gaming',
    heroSubtitle:
      'Headless commerce storefront powered by WordPress/WooCommerce & WPGraphQL, real-time socket/clearance verification, AlphaFold biomolecular GPU benchmarks, and adaptive delivery for constrained connections.',
    ctaExploreCatalog: 'Browse Hardware Catalog',
    ctaLaunchBuilder: 'Open PC Builder',
    searchPlaceholder: 'Search component name, SKU, or socket (AM5, LGA1700, RTX 4080)...',
    addToCart: 'Add to Cart',
    outOfStock: 'Out of Stock',
    compareAdd: 'Compare',
    compareRemove: 'Selected for Compare',
    selectInBuilder: 'Select in PC Builder',
    cartTitle: 'Tirazis Shopping Cart',
    cartEmpty: 'Your hardware cart is currently empty.',
    proceedToCheckout: 'Revalidate Stock & Proceed to Checkout',
    networkConstrained: 'Low-Bandwidth Mode (8 items/page)',
    networkStandard: 'Standard Mode (12 items/page)',
    networkFast: 'Fast Link Mode (16 items/page)',
  },
} as const;
