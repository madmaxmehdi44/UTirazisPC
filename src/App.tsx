import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  Globe,
  Heart,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Wifi,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  AdminSettings,
  Brand,
  Cart,
  Category,
  CheckoutRevalidationResult,
  EditorialPost,
  Locale,
  PcComponentSlot,
  Product,
  ProductPage,
  ProviderHealth,
  SortOption,
} from './lib/commerce/types';
import { HARDWARE_PRODUCTS_SEED } from './lib/commerce/hardwareCatalogSeed';
import {
  googleSignIn,
  initAuth,
  logout,
  SavedPcBuildDoc,
  subscribeToUserPcBuilds,
} from './lib/firebase/client';
import { formatCurrency, TRANSLATIONS } from './lib/i18n/translations';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawerAndCheckout } from './components/CartDrawerAndCheckout';
import { WishlistDrawer } from './components/WishlistDrawer';
import { PcBuilderWorkbench } from './components/PcBuilderWorkbench';
import { ScienceFoldingWorkbench } from './components/ScienceFoldingWorkbench';
import { AiHardwareStudio } from './components/AiHardwareStudio';
import {
  AdminAndDiagnosticsView,
  ProductComparisonView,
} from './components/AdminAndDiagnosticsView';

type ActiveView =
  | 'home'
  | 'catalog'
  | 'builder'
  | 'compare'
  | 'science'
  | 'ai-studio'
  | 'blog'
  | 'admin';

export default function App() {
  // Parse initial locale and view from URL path (/fa/... or /en/...)
  const getInitialRoute = (): { locale: Locale; view: ActiveView } => {
    const path = window.location.pathname;
    const locale: Locale = path.startsWith('/en') ? 'en' : 'fa';
    if (path.includes('/catalog')) return { locale, view: 'catalog' };
    if (path.includes('/builder')) return { locale, view: 'builder' };
    if (path.includes('/compare')) return { locale, view: 'compare' };
    if (path.includes('/science')) return { locale, view: 'science' };
    if (path.includes('/ai-studio')) return { locale, view: 'ai-studio' };
    if (path.includes('/blog')) return { locale, view: 'blog' };
    if (path.includes('/admin')) return { locale, view: 'admin' };
    return { locale, view: 'home' };
  };

  const initialRoute = getInitialRoute();
  const [locale, setLocale] = useState<Locale>(initialRoute.locale);
  const [activeView, setActiveView] = useState<ActiveView>(initialRoute.view);

  // Detect browser connection hints safely for Iranian internet adaptation
  const detectDefaultConnectionProfile = (): 'constrained' | 'standard' | 'fast' => {
    const nav = navigator as any;
    const conn = nav?.connection;
    if (conn) {
      if (conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g') {
        return 'constrained';
      }
      if (conn.effectiveType === '4g' && (conn.downlink ?? 5) >= 8) {
        return 'fast';
      }
    }
    return 'standard';
  };

  const [connectionProfile, setConnectionProfile] = useState<'constrained' | 'standard' | 'fast'>(
    detectDefaultConnectionProfile
  );

  // Catalog & Filter States
  const [productPage, setProductPage] = useState<ProductPage>({
    items: HARDWARE_PRODUCTS_SEED.slice(0, 8),
    total: HARDWARE_PRODUCTS_SEED.length,
    page: 1,
    pageSize: 8,
    hasNextPage: true,
    containsDemoProducts: false,
    providerId: 'wordpress-woocommerce',
    dataSource: 'verified-hardware-seed',
    freshnessTimestamp: new Date().toISOString(),
    isStaleFallback: false,
  });
  const [allCatalog, setAllCatalog] = useState<Product[]>(HARDWARE_PRODUCTS_SEED);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [posts, setPosts] = useState<EditorialPost[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth | null>(null);
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sortOption, setSortOption] = useState<SortOption>('featured');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);

  // Product Detail Modal & Related Products
  const [inspectedProduct, setInspectedProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);

  // Comparison & PC Builder States
  const [comparedProducts, setComparedProducts] = useState<Product[]>([
    HARDWARE_PRODUCTS_SEED[0],
    HARDWARE_PRODUCTS_SEED[1],
  ]);
  const [builderParts, setBuilderParts] = useState<Partial<Record<PcComponentSlot, Product | null>>>({
    cpu: HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'amd-ryzen-9-7950x3d') || null,
    motherboard: HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'asus-rog-crosshair-x670e-hero') || null,
    gpu: HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'asus-rog-strix-rtx-4080-super-16gb') || null,
    ram: HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'corsair-dominator-titanium-64gb-ddr5') || null,
    storage: HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'samsung-990-pro-2tb-nvme') || null,
    psu: HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'corsair-rm1000x-shift-atx3') || null,
    case: HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'lian-li-o11-dynamic-evo-rgb') || null,
    cooler: HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'noctua-nh-d15-chromax-black') || null,
  });

  // Cart & Toast Notification States
  const [cart, setCart] = useState<Cart>({
    items: [],
    itemCount: 0,
    subtotal: 0,
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    total: 0,
    currency: 'IRT',
    appliedCoupons: [],
    cartTokenPresent: true,
    noncePresent: true,
    syncedWithStoreApi: false,
    updatedAt: new Date().toISOString(),
  });
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sharedParam = params.get('wishlist');
      return Boolean(sharedParam && sharedParam.trim().length > 0);
    } catch {
      return false;
    }
  });
  const [wishlistProducts, setWishlistProducts] = useState<Product[]>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sharedParam = params.get('wishlist');
      if (sharedParam && sharedParam.trim().length > 0) {
        const sharedSlugs = sharedParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const matched = HARDWARE_PRODUCTS_SEED.filter((p) => sharedSlugs.includes(p.slug));
        if (matched.length > 0) {
          return matched;
        }
      }

      const saved = localStorage.getItem('tirazis_wishlist_slugs');
      if (saved) {
        const slugs: string[] = JSON.parse(saved);
        if (Array.isArray(slugs)) {
          return HARDWARE_PRODUCTS_SEED.filter((p) => slugs.includes(p.slug));
        }
      }
    } catch {
      // Ignore storage read errors
    }
    return [];
  });
  const [wishlistNotes, setWishlistNotes] = useState<Record<string, string>>(() => {
    try {
      const savedNotes = localStorage.getItem('tirazis_wishlist_notes');
      if (savedNotes) {
        const parsed = JSON.parse(savedNotes);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Ignore storage read errors
    }
    return {};
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [wishlistAddedAnim, setWishlistAddedAnim] = useState<boolean>(false);
  const wishlistAnimTimerRef = useRef<number | null>(null);
  const cartTokenRef = useRef<string>('trz-session-client-1');

  // Firebase Auth & Saved Builds State
  const [user, setUser] = useState<User | null>(null);
  const [savedBuilds, setSavedBuilds] = useState<SavedPcBuildDoc[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'tirazis_wishlist_slugs',
        JSON.stringify(wishlistProducts.map((p) => p.slug))
      );
    } catch {
      // Ignore storage write errors
    }
  }, [wishlistProducts]);

  useEffect(() => {
    try {
      localStorage.setItem('tirazis_wishlist_notes', JSON.stringify(wishlistNotes));
    } catch {
      // Ignore storage write errors
    }
  }, [wishlistNotes]);

  const t = TRANSLATIONS[locale];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  // Sync HTML dir and lang attributes for RTL Persian (/fa) and LTR English (/en)
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr';
  }, [locale]);

  // Client-side navigation helper (updates URL without full page reload)
  const navigateTo = (nextView: ActiveView, nextLocale: Locale = locale) => {
    setActiveView(nextView);
    setLocale(nextLocale);
    const suffix = nextView === 'home' ? '' : `/${nextView}`;
    const nextUrl = `/${nextLocale}${suffix}`;
    if (window.location.pathname !== nextUrl) {
      window.history.pushState({ view: nextView, locale: nextLocale }, '', nextUrl);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handlePopState = () => {
      const route = getInitialRoute();
      setLocale(route.locale);
      setActiveView(route.view);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Initialize Firebase Auth & Firestore subscription
  useEffect(() => {
    let unsubBuilds: (() => void) | null = null;
    const unsubAuth = initAuth(
      (authedUser) => {
        setUser(authedUser);
        if (unsubBuilds) unsubBuilds();
        unsubBuilds = subscribeToUserPcBuilds(authedUser.uid, (builds) => {
          setSavedBuilds(builds);
        });
      },
      () => {
        setUser(null);
        setSavedBuilds([]);
        if (unsubBuilds) {
          unsubBuilds();
          unsubBuilds = null;
        }
      }
    );
    return () => {
      unsubAuth();
      if (unsubBuilds) unsubBuilds();
    };
  }, []);

  // Debounce search input (250ms) to avoid duplicate requests on slow connections
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch initial taxonomy, cart, editorial posts, and provider health
  const fetchProviderHealth = async () => {
    try {
      const res = await fetch('/api/commerce/health');
      if (res.ok) {
        setProviderHealth(await res.json());
      }
    } catch {
      // Ignore network hiccup
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [catRes, cartRes, postRes, admRes, fullCatRes] = await Promise.all([
          fetch('/api/commerce/categories'),
          fetch('/api/cart', { headers: { 'X-WC-Cart-Token': cartTokenRef.current } }),
          fetch('/api/commerce/posts'),
          fetch('/api/admin/settings'),
          fetch('/api/commerce/products?pageSize=24'),
        ]);
        if (catRes.ok) {
          const d = await catRes.json();
          setCategories(d.categories || []);
          setBrands(d.brands || []);
        }
        if (cartRes.ok) {
          setCart(await cartRes.json());
        }
        if (postRes.ok) {
          const p = await postRes.json();
          setPosts(p.posts || []);
        }
        if (admRes.ok) {
          const a = await admRes.json();
          setAdminSettings(a.settings || null);
        }
        if (fullCatRes.ok) {
          const fc = await fullCatRes.json();
          if (Array.isArray(fc.items) && fc.items.length > 0) {
            setAllCatalog(fc.items);
          }
        }
        fetchProviderHealth();
      } catch {
        // Keep seed fallback intact
      }
    })();
  }, []);

  // Fetch paginated products whenever filter, search, sort, page, or connectionProfile changes
  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);

    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('connection', connectionProfile);
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (selectedBrand !== 'all') params.set('brand', selectedBrand);
    if (inStockOnly) params.set('inStock', 'true');
    if (sortOption !== 'featured') params.set('sort', sortOption);
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());

    fetch(`/api/commerce/products?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then((pageData: ProductPage) => {
        setProductPage(pageData);
      })
      .catch(() => {
        // Ignore aborted requests
      })
      .finally(() => {
        setCatalogLoading(false);
      });

    return () => controller.abort();
  }, [
    currentPage,
    connectionProfile,
    selectedCategory,
    selectedBrand,
    inStockOnly,
    sortOption,
    debouncedSearch,
  ]);

  // Search suggestions while typing
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allCatalog
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.nameFa && p.nameFa.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.hardwareSpecs.socket && p.hardwareSpecs.socket.toLowerCase().includes(q))
      )
      .slice(0, 5);
  }, [searchQuery, allCatalog]);

  // Inspect single product & fetch related products
  const handleInspectProduct = async (product: Product) => {
    setInspectedProduct(product);
    try {
      const res = await fetch(`/api/commerce/products/${encodeURIComponent(product.slug)}`);
      if (res.ok) {
        const data = await res.json();
        setRelatedProducts(data.relatedProducts || []);
      }
    } catch {
      setRelatedProducts([]);
    }
  };

  // Cart Mutations (reconciled with real server response)
  const handleAddToCart = async (
    product: Product,
    quantity = 1,
    variationId?: string
  ) => {
    try {
      const res = await fetch('/api/cart/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WC-Cart-Token': cartTokenRef.current,
        },
        body: JSON.stringify({
          slug: product.slug,
          quantity,
          variationId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(locale === 'fa' ? data.errorFa || data.error : data.error);
        return;
      }
      setCart(data);
      showToast(
        locale === 'fa'
          ? `${product.nameFa || product.name} به سبد خرید اضافه شد.`
          : `Added ${product.name} to cart.`
      );
    } catch {
      showToast(locale === 'fa' ? 'خطا در ارتباط با سرور سبد خرید' : 'Failed to update cart');
    }
  };

  const handleAddBuildToCart = async (products: Product[]) => {
    for (const prod of products) {
      if (prod.stockStatus !== 'OUT_OF_STOCK') {
        await handleAddToCart(prod, 1);
      }
    }
    setIsCartOpen(true);
  };

  const handleUpdateCartQty = async (key: string, quantity: number) => {
    const res = await fetch('/api/cart/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WC-Cart-Token': cartTokenRef.current,
      },
      body: JSON.stringify({ key, quantity }),
    });
    if (res.ok) {
      setCart(await res.json());
    }
  };

  const handleRemoveCartItem = async (key: string) => {
    const res = await fetch('/api/cart/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WC-Cart-Token': cartTokenRef.current,
      },
      body: JSON.stringify({ key }),
    });
    if (res.ok) {
      setCart(await res.json());
    }
  };

  const handleApplyCoupon = async (code: string) => {
    const res = await fetch('/api/cart/coupon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WC-Cart-Token': cartTokenRef.current,
      },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(locale === 'fa' ? data.errorFa || data.error : data.error);
    }
    setCart(data);
  };

  const handleRevalidateCheckout = async (): Promise<CheckoutRevalidationResult | null> => {
    const res = await fetch('/api/checkout/revalidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WC-Cart-Token': cartTokenRef.current,
      },
    });
    if (!res.ok) return null;
    const data: CheckoutRevalidationResult = await res.json();
    setCart(data.cart);
    return data;
  };

  const handleSubmitOrder = async (payload: any) => {
    const res = await fetch('/api/checkout/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WC-Cart-Token': cartTokenRef.current,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(locale === 'fa' ? data.errorFa || data.error : data.error);
    }
    // Refresh emptied cart
    const freshCartRes = await fetch('/api/cart', {
      headers: { 'X-WC-Cart-Token': cartTokenRef.current },
    });
    if (freshCartRes.ok) {
      setCart(await freshCartRes.json());
    }
    return data;
  };

  const handleToggleCompare = (product: Product) => {
    setComparedProducts((prev) => {
      const exists = prev.some((p) => p.slug === product.slug);
      if (exists) {
        return prev.filter((p) => p.slug !== product.slug);
      }
      if (prev.length >= 4) {
        showToast(
          locale === 'fa'
            ? 'حداکثر ۴ قطعه را می‌توان همزمان مقایسه کرد.'
            : 'Maximum 4 components can be compared at once.'
        );
        return prev;
      }
      return [...prev, product];
    });
  };

  const handleToggleWishlist = (product: Product) => {
    const exists = wishlistProducts.some((p) => p.slug === product.slug);
    if (exists) {
      setWishlistProducts((prev) => prev.filter((p) => p.slug !== product.slug));
      setWishlistAddedAnim(false);
      showToast(
        locale === 'fa'
          ? `${product.nameFa || product.name} از لیست علاقه‌مندی‌ها حذف شد.`
          : `Removed ${product.name} from wishlist.`
      );
    } else {
      setWishlistProducts((prev) => [...prev, product]);
      setWishlistAddedAnim(true);
      if (wishlistAnimTimerRef.current) {
        window.clearTimeout(wishlistAnimTimerRef.current);
      }
      wishlistAnimTimerRef.current = window.setTimeout(() => {
        setWishlistAddedAnim(false);
      }, 700);
      showToast(
        locale === 'fa'
          ? `${product.nameFa || product.name} به لیست علاقه‌مندی‌ها اضافه شد.`
          : `Saved ${product.name} to wishlist.`
      );
    }
  };

  const handleUpdateWishlistNote = (slug: string, note: string) => {
    setWishlistNotes((prev) => {
      const next = { ...prev };
      if (note) {
        next[slug] = note;
      } else {
        delete next[slug];
      }
      try {
        localStorage.setItem('tirazis_wishlist_notes', JSON.stringify(next));
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  };

  const handleClearWishlist = () => {
    setWishlistProducts([]);
    setWishlistNotes({});
    try {
      localStorage.removeItem('tirazis_wishlist_notes');
    } catch {
      // Ignore storage errors
    }
    showToast(
      locale === 'fa'
        ? 'لیست علاقه‌مندی‌ها پاک شد.'
        : 'Cleared saved wishlist.'
    );
  };

  const handleAddAllWishlistToCart = async () => {
    const inStockItems = wishlistProducts.filter((p) => p.stockStatus === 'IN_STOCK');
    for (const item of inStockItems) {
      await handleAddToCart(item, 1);
    }
    setIsWishlistOpen(false);
    setIsCartOpen(true);
  };

  const handleUseInBuilder = (product: Product) => {
    const slot = product.hardwareSpecs.slot;
    if (slot) {
      setBuilderParts((prev) => ({ ...prev, [slot]: product }));
      navigateTo('builder');
      showToast(
        locale === 'fa'
          ? `${product.nameFa || product.name} در اسلات مربوطه در PC Builder قرار گرفت.`
          : `Selected ${product.name} in PC Builder.`
      );
    }
  };

  const handleSaveAdminSettings = async (partial: Partial<AdminSettings>, adminToken: string) => {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken,
        'x-admin-email': user?.email || '',
      },
      body: JSON.stringify(partial),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(locale === 'fa' ? data.errorFa || data.error : data.error);
    }
    setAdminSettings(data.settings);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f17] text-slate-100">
      {/* =====================================================================
          STRICT 3-ZONE TOP BAR CONTRACT (Brand | 5 Single-Line Nav Links | 1 Primary CTA)
          ===================================================================== */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800/90 bg-[#0b0f17]/95 sticky top-0 z-30 backdrop-blur-xs">
        {/* Zone 1: Single text element wordmark */}
        <a
          href={`/${locale}`}
          onClick={(e) => {
            e.preventDefault();
            navigateTo('home');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          {t.brandName}
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Primary Storefront Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300"
        >
          <a
            href={`/${locale}/catalog`}
            data-testid="nav-catalog"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('catalog');
            }}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'catalog' ? 'text-cyan-400 underline' : ''
            }`}
          >
            {t.navCatalog}
          </a>
          <a
            href={`/${locale}/builder`}
            data-testid="nav-builder"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('builder');
            }}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'builder' ? 'text-cyan-400 underline' : ''
            }`}
          >
            {t.navBuilder}
          </a>
          <a
            href={`/${locale}/compare`}
            data-testid="nav-compare"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('compare');
            }}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'compare' ? 'text-cyan-400 underline' : ''
            }`}
          >
            {t.navCompare} ({comparedProducts.length})
          </a>
          <a
            href={`/${locale}/science`}
            data-testid="nav-science"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('science');
            }}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'science' ? 'text-cyan-400 underline' : ''
            }`}
          >
            {t.navScience}
          </a>
          <a
            href={`/${locale}/ai-studio`}
            data-testid="nav-ai-studio"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('ai-studio');
            }}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'ai-studio' ? 'text-cyan-400 underline' : ''
            }`}
          >
            {t.navAiLab}
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action (Cart Drawer Trigger) */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            aria-label={t.cartTitle}
            data-testid="open-cart-button"
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-500 hover:bg-cyan-400 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>
              {t.cartTitle} ({cart.itemCount})
            </span>
          </button>
        </div>
      </header>

      {/* =====================================================================
          WORKSPACE & UTILITY SUB-TOOLBAR (Bilingual Switcher, Iranian Network Mode, Auth, Admin/Blog)
          ===================================================================== */}
      <div className="bg-[#111827] border-b border-slate-800/80 px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Mobile & Secondary View Switcher */}
          <div className="flex items-center flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigateTo(activeView, locale === 'fa' ? 'en' : 'fa')}
              data-testid="locale-toggle-button"
              className="px-2.5 py-1 rounded bg-[#0b0f17] border border-slate-700 hover:border-cyan-400 text-slate-200 font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>{locale === 'fa' ? 'English (LTR)' : 'فارسی (RTL)'}</span>
            </button>

            {/* Iranian Network Adaptation Selector */}
            <div className="flex items-center gap-1.5 text-slate-400">
              <Wifi className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <label htmlFor="network-profile-select" className="sr-only">
                Network Adaptation Mode
              </label>
              <select
                id="network-profile-select"
                value={connectionProfile}
                onChange={(e) => {
                  setConnectionProfile(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="bg-[#0b0f17] border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs outline-none"
              >
                <option value="constrained">{t.networkConstrained}</option>
                <option value="standard">{t.networkStandard}</option>
                <option value="fast">{t.networkFast}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => navigateTo('blog')}
              className={`hover:text-cyan-400 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                activeView === 'blog' ? 'text-cyan-400 font-semibold' : 'text-slate-400'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t.navBlog}</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('admin')}
              className={`hover:text-cyan-400 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                activeView === 'admin' ? 'text-cyan-400 font-semibold' : 'text-slate-400'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{t.navAdmin}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsWishlistOpen(true)}
              data-testid="open-wishlist-button"
              data-animating={wishlistAddedAnim ? 'true' : 'false'}
              aria-label={`${t.wishlistTitle} (${wishlistProducts.length})`}
              className={`relative px-2.5 py-1 rounded bg-[#0b0f17] border transition-all duration-200 text-slate-200 font-medium inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                wishlistAddedAnim
                  ? 'border-rose-400 bg-rose-950/40 ring-2 ring-rose-500/40'
                  : wishlistProducts.length > 0
                    ? 'border-rose-500/50 hover:border-rose-400'
                    : 'border-slate-700 hover:border-rose-400'
              }`}
            >
              <span className="relative inline-flex items-center justify-center">
                {wishlistAddedAnim && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full bg-rose-500/40 animate-ping"
                  />
                )}
                <Heart
                  className={`relative z-10 w-3.5 h-3.5 transition-transform duration-200 ${
                    wishlistProducts.length > 0 ? 'text-rose-500 fill-rose-500' : 'text-rose-400'
                  } ${wishlistAddedAnim ? 'animate-wishlist-heart' : ''}`}
                />
              </span>
              <span>{t.wishlistTitle}</span>
              <span
                data-testid="wishlist-badge"
                aria-live="polite"
                className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-mono font-bold tabular-nums transition-colors ${
                  wishlistProducts.length > 0
                    ? 'bg-rose-500 text-white shadow-xs shadow-rose-950'
                    : 'bg-slate-800 text-slate-400'
                } ${wishlistAddedAnim ? 'animate-wishlist-badge' : ''}`}
              >
                {wishlistProducts.length}
              </span>
            </button>
          </div>

          {/* Right: Official Google Sign-In Button & Provider Provenance Status */}
          <div className="flex items-center gap-3">
            <span className="hidden lg:inline text-slate-400">
              {productPage.dataSource === 'wordpress-live'
                ? locale === 'fa'
                  ? 'متصل به ووکامرس زنده (utirazis.flywheelsites.com)'
                  : 'Connected: Live WooCommerce'
                : locale === 'fa'
                  ? 'کاتالوگ سخت‌افزار تاییدشده · آماده دریافت رمز Basic Auth سرور وردپرس'
                  : 'Verified Hardware Seed · Ready for Flywheel Basic Auth Secret'}
            </span>

            {user ? (
              <div className="flex items-center gap-2 bg-[#0b0f17] px-2.5 py-1 rounded border border-slate-800">
                <span className="text-slate-200 font-medium truncate max-w-[140px]">
                  {user.displayName || user.email}
                </span>
                <button
                  type="button"
                  onClick={() => logout()}
                  aria-label="Sign out"
                  className="text-slate-400 hover:text-rose-400 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await googleSignIn();
                    setUser(res.user);
                  } catch (e: any) {
                    showToast(e?.message || 'Google Sign-In cancelled');
                  }
                }}
                className="gsi-material-button"
              >
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="w-4 h-4 block"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                </div>
                <span className="gsi-material-button-contents">Sign in with Google</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile View Navigation Strip (Visible below md breakpoint) */}
        <div className="flex md:hidden items-center gap-4 overflow-x-auto pt-2.5 mt-2.5 border-t border-slate-800/70 text-xs font-medium text-slate-300">
          <button
            type="button"
            onClick={() => navigateTo('catalog')}
            className={`whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'catalog' ? 'text-cyan-400 font-bold' : ''
            }`}
          >
            {t.navCatalog}
          </button>
          <button
            type="button"
            onClick={() => navigateTo('builder')}
            className={`whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'builder' ? 'text-cyan-400 font-bold' : ''
            }`}
          >
            {t.navBuilder}
          </button>
          <button
            type="button"
            onClick={() => navigateTo('compare')}
            className={`whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'compare' ? 'text-cyan-400 font-bold' : ''
            }`}
          >
            {t.navCompare} ({comparedProducts.length})
          </button>
          <button
            type="button"
            onClick={() => navigateTo('science')}
            className={`whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'science' ? 'text-cyan-400 font-bold' : ''
            }`}
          >
            {t.navScience}
          </button>
          <button
            type="button"
            onClick={() => navigateTo('ai-studio')}
            className={`whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'ai-studio' ? 'text-cyan-400 font-bold' : ''
            }`}
          >
            {t.navAiLab}
          </button>
        </div>
      </div>

      {/* Toast Feedback Banner */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-5 end-5 z-50 px-4 py-3 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-xs shadow-xl flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* =====================================================================
          MAIN VIEWPORT CONTAINER
          ===================================================================== */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-12">
        {activeView === 'home' && (
          <>
            {/* SECTION 1: Storefront Split-Screen Hero */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-6 p-8 rounded-2xl bg-[#111827] border border-slate-800 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    {t.heroKicker}
                  </div>
                  <h1
                    className="text-3xl sm:text-4xl font-bold text-white leading-tight"
                    style={{ textWrap: 'balance' }}
                  >
                    {t.heroTitle}
                  </h1>
                  <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
                    {t.heroSubtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigateTo('catalog')}
                    className="py-3 px-6 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {t.ctaExploreCatalog}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('builder')}
                    className="py-3 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {t.ctaLaunchBuilder}
                  </button>
                </div>
              </div>

              <div className="lg:col-span-6 rounded-2xl overflow-hidden border border-slate-800 bg-[#0d1320] relative min-h-[300px]">
                <img
                  src="/src/assets/images/hero_workstation_pc_1792854233589.jpg"
                  alt="Tirazis Flagship Liquid-Cooled Workstation PC"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end p-6">
                  <div className="text-xs text-slate-200 space-y-1">
                    <div className="font-mono text-cyan-400 font-semibold">
                      TIRAZIS WORKSTATION SERIES · AM5 &amp; LGA1700
                    </div>
                    <div>
                      {locale === 'fa'
                        ? 'اسمبل تخصصی ایستگاه‌های کاری هوش مصنوعی، رندرینگ و محاسبات بیوانفورماتیک با گارانتی معتبر'
                        : 'Custom liquid-cooled GPU compute nodes validated for 24/7 thermal and transient stability.'}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Full-Width 4-Column Hardware Proof & Architecture Strip */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl bg-[#111827] border border-slate-800">
                <div className="text-xs text-slate-400">
                  {locale === 'fa' ? 'پروتکل تجارت هدلس' : 'Commerce Provider'}
                </div>
                <div className="text-base font-bold text-white mt-1 font-mono tabular-nums">
                  WPGraphQL + Store v1
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {locale === 'fa'
                    ? 'عدم افشای کلیدهای سرور در مرورگر'
                    : 'Zero browser credential exposure'}
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#111827] border border-slate-800">
                <div className="text-xs text-slate-400">
                  {locale === 'fa' ? 'موتور بررسی سازگاری' : 'Compatibility Engine'}
                </div>
                <div className="text-base font-bold text-cyan-400 mt-1 font-mono tabular-nums">
                  8 Hardware Constraints
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {locale === 'fa'
                    ? 'بررسی سوکت، نسل رم، ابعاد گرافیک و توان پاور'
                    : 'Socket, DDR4/DDR5, mm clearance & PSU watts'}
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#111827] border border-slate-800">
                <div className="text-xs text-slate-400">
                  {locale === 'fa' ? 'بهینه‌سازی اینترنت ایران' : 'Adaptive Payload Size'}
                </div>
                <div className="text-base font-bold text-emerald-400 mt-1">
                  <span className="font-mono tabular-nums">{productPage.pageSize}</span>{' '}
                  <span>{locale === 'fa' ? 'کالا در هر صفحه' : 'Items / Page'}</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {locale === 'fa'
                    ? 'صفحه‌بندی سمت سرور و لغو درخواست‌های تکراری'
                    : 'Server-side pagination & debounced search'}
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#111827] border border-slate-800">
                <div className="text-xs text-slate-400">
                  {locale === 'fa' ? 'تضمین تسویه‌حساب' : 'Checkout Integrity'}
                </div>
                <div className="text-base font-bold text-white mt-1 font-mono tabular-nums">
                  100% Live Revalidation
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {locale === 'fa'
                    ? 'بررسی مجدد قیمت و موجودی پیش از پرداخت'
                    : 'Pre-checkout price & stock verification'}
                </div>
              </div>
            </section>

            {/* SECTION 2: Featured Hardware Collection Grid (3-Column Desktop) */}
            <section className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {locale === 'fa'
                      ? 'قطعات منتخب ورک‌استیشن و گیمینگ'
                      : 'Featured Workstation & Enthusiast Components'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {locale === 'fa'
                      ? 'موجودی و قیمت‌های ثبت‌شده همراه با امکان افزودن مستقیم به سبد خرید یا سیستم‌ساز هوشمند'
                      : 'Verified hardware specifications with direct Add-to-Cart, Comparison, and PC Builder integration.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigateTo('catalog')}
                  className="text-xs font-semibold text-cyan-400 hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>{locale === 'fa' ? 'مشاهده تمام قطعات و فیلترها' : 'View Full Catalog & Filters'}</span>
                  {locale === 'fa' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {productPage.items.slice(0, 6).map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    locale={locale}
                    isCompared={comparedProducts.some((p) => p.slug === product.slug)}
                    isWishlisted={wishlistProducts.some((p) => p.slug === product.slug)}
                    onSelectProduct={handleInspectProduct}
                    onAddToCart={(p) => handleAddToCart(p, 1)}
                    onToggleCompare={handleToggleCompare}
                    onToggleWishlist={handleToggleWishlist}
                    onUseInBuilder={handleUseInBuilder}
                  />
                ))}
              </div>
            </section>

            {/* SECTION 3: Engineering Craftsmanship & Interactive Workbench Callouts */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl bg-[#111827] border border-slate-800 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    01. {locale === 'fa' ? 'آزمایشگاه تاشدگی پروتئین AlphaFold' : 'Biomolecular Compute Benchmark'}
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    {locale === 'fa'
                      ? 'بررسی توان محاسباتی کارت‌های RTX 4080S / 4090 با داده‌های واقعی AlphaFold DB و UniProt'
                      : 'Evaluate GPU VRAM & Molecular Dynamics Throughput Against Real AlphaFold Structures'}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {locale === 'fa'
                      ? 'اتصال زنده به پایگاه‌های داده علمی AlphaFold و UniProtKB برای سنجش نیاز حافظه گرافیکی و سرعت شبیه‌سازی پروتئین‌های انسانی مانند TP53 و BRCA1.'
                      : 'Inspect 3D protein coordinates, per-residue pLDDT confidence scores, and calculate molecular dynamics ns/day performance on Tirazis workstation GPUs.'}
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => navigateTo('science')}
                    className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-400 cursor-pointer"
                  >
                    {locale === 'fa' ? 'ورود به بنچمارک علمی AlphaFold' : 'Open AlphaFold Compute Workbench'}
                  </button>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-[#111827] border border-slate-800 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    02. {locale === 'fa' ? 'مشاور هوش مصنوعی و تحلیلگر عکس قطعات' : 'Gemini 4 Argon Hardware Studio'}
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    {locale === 'fa'
                      ? 'تحلیل تخصصی خطوط PCIe، جستجوی زنده گوگل، نقشه مراکز خدمات و طراحی استودیویی سیستم'
                      : 'Deep Architecture Reasoning, Search/Maps Grounding & 4K Custom Rig Visualization'}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {locale === 'fa'
                      ? 'مجهز به مدل Gemini 4 Argon با سطح تفکر بالا (HIGH)، مدل سریع Flash-Lite و تولید تصویر با رزولوشن انتخابی 1K/2K/4K.'
                      : 'Ask complex workstation questions with High Thinking mode, verify specs with Google Search grounding, or upload hardware photos for instant inspection.'}
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => navigateTo('ai-studio')}
                    className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-400 cursor-pointer"
                  >
                    {locale === 'fa' ? 'ورود به آزمایشگاه هوش مصنوعی' : 'Open AI Hardware Studio'}
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

        {activeView === 'catalog' && (
          <section className="space-y-6" aria-label="Hardware Product Catalog">
            {/* Search & Filter Control Bar */}
            <div className="p-6 rounded-2xl bg-[#111827] border border-slate-800 space-y-4">
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Debounced AJAX Search Box with Live Suggestions */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute top-3 start-3.5" />
                  <input
                    type="search"
                    aria-label={t.searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="w-full ps-10 pe-4 py-2.5 rounded-xl bg-[#0b0f17] border border-slate-700 text-xs text-white focus:border-cyan-400 outline-none"
                  />
                  {searchSuggestions.length > 0 && (
                    <div className="absolute start-0 end-0 top-full mt-1 rounded-xl bg-[#0b0f17] border border-slate-700 shadow-2xl z-20 divide-y divide-slate-800">
                      {searchSuggestions.map((sug) => (
                        <button
                          key={sug.id}
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            handleInspectProduct(sug);
                          }}
                          className="w-full px-4 py-2.5 text-start text-xs hover:bg-slate-900 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="text-slate-200 truncate">
                            {locale === 'fa' ? sug.nameFa || sug.name : sug.name}
                          </span>
                          <span className="font-mono text-cyan-400 shrink-0">
                            {formatCurrency(sug.price, sug.currency, locale)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Brand Filter */}
                <div>
                  <label htmlFor="catalog-brand-select" className="sr-only">
                    Filter by Brand
                  </label>
                  <select
                    id="catalog-brand-select"
                    value={selectedBrand}
                    onChange={(e) => {
                      setSelectedBrand(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-3.5 py-2.5 rounded-xl bg-[#0b0f17] border border-slate-700 text-xs text-white"
                  >
                    <option value="all">
                      {locale === 'fa' ? 'همه برندها (All Brands)' : 'All Brands'}
                    </option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.slug}>
                        {b.name} ({b.count})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Selector */}
                <div>
                  <label htmlFor="catalog-sort-select" className="sr-only">
                    Sort Products
                  </label>
                  <select
                    id="catalog-sort-select"
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as SortOption)}
                    className="px-3.5 py-2.5 rounded-xl bg-[#0b0f17] border border-slate-700 text-xs text-white"
                  >
                    <option value="featured">
                      {locale === 'fa' ? 'مرتب‌سازی: پیشنهادی' : 'Sort: Featured'}
                    </option>
                    <option value="price-asc">
                      {locale === 'fa' ? 'قیمت: ارزان‌ترین به گران‌ترین' : 'Price: Low to High'}
                    </option>
                    <option value="price-desc">
                      {locale === 'fa' ? 'قیمت: گران‌ترین به ارزان‌ترین' : 'Price: High to Low'}
                    </option>
                    <option value="in-stock-first">
                      {locale === 'fa' ? 'موجودی: اول کالاهای موجود' : 'Availability: In Stock First'}
                    </option>
                  </select>
                </div>

                {/* In-Stock Toggle */}
                <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0b0f17] border border-slate-700 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => {
                      setInStockOnly(e.target.checked);
                      setCurrentPage(1);
                    }}
                  />
                  <span>{locale === 'fa' ? 'فقط کالاهای موجود' : 'In Stock Only'}</span>
                </label>
              </div>

              {/* Interactive Category Filter Buttons */}
              <div className="flex items-center flex-wrap gap-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedCategory === 'all'
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'bg-[#0b0f17] text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  {locale === 'fa' ? 'همه دسته‌ها' : 'All Categories'}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat.slug);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      selectedCategory === cat.slug
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'bg-[#0b0f17] text-slate-300 hover:text-white border border-slate-800'
                    }`}
                  >
                    {locale === 'fa' ? cat.nameFa || cat.name : cat.name} ({cat.count})
                  </button>
                ))}
              </div>
            </div>

            {/* Product Grid or Empty State */}
            {catalogLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-96 rounded-xl bg-[#111827] border border-slate-800 animate-pulse p-5"
                  />
                ))}
              </div>
            ) : productPage.items.length === 0 ? (
              <div className="p-12 rounded-2xl bg-[#111827] border border-slate-800 text-center space-y-3">
                <Cpu className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-white">
                  {locale === 'fa'
                    ? 'قطعه‌ای با این فیلترها یافت نشد'
                    : 'No Matching Hardware Components Found'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedBrand('all');
                    setInStockOnly(false);
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs cursor-pointer"
                >
                  {locale === 'fa' ? 'پاک کردن فیلترها' : 'Reset Filters'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {productPage.items.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    locale={locale}
                    isCompared={comparedProducts.some((p) => p.slug === product.slug)}
                    isWishlisted={wishlistProducts.some((p) => p.slug === product.slug)}
                    onSelectProduct={handleInspectProduct}
                    onAddToCart={(p) => handleAddToCart(p, 1)}
                    onToggleCompare={handleToggleCompare}
                    onToggleWishlist={handleToggleWishlist}
                    onUseInBuilder={handleUseInBuilder}
                  />
                ))}
              </div>
            )}

            {/* Manual Server-Side Pagination Controls (Reliable Fallback for Constrained Connections) */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs">
              <div className="text-slate-400 font-mono tabular-nums">
                {locale === 'fa'
                  ? `نمایش صفحه ${productPage.page} — کل قطعات منطبق: ${productPage.total}`
                  : `Showing page ${productPage.page} — Total matching components: ${productPage.total}`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3.5 py-2 rounded-lg bg-[#111827] border border-slate-700 disabled:opacity-40 text-white cursor-pointer"
                >
                  {locale === 'fa' ? 'صفحه قبل' : 'Previous Page'}
                </button>
                <button
                  type="button"
                  disabled={!productPage.hasNextPage}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="px-3.5 py-2 rounded-lg bg-[#111827] border border-slate-700 disabled:opacity-40 text-white cursor-pointer"
                >
                  {locale === 'fa' ? 'صفحه بعد' : 'Next Page'}
                </button>
              </div>
            </div>
          </section>
        )}

        {activeView === 'builder' && (
          <PcBuilderWorkbench
            catalog={allCatalog}
            selectedParts={builderParts}
            locale={locale}
            user={user}
            savedBuilds={savedBuilds}
            strictSocketCheck={adminSettings?.strictSocketCheck ?? true}
            onSelectPart={(slot, prod) =>
              setBuilderParts((prev) => ({ ...prev, [slot]: prod }))
            }
            onAddBuildToCart={handleAddBuildToCart}
            onAuthUpdated={(u) => setUser(u)}
          />
        )}

        {activeView === 'compare' && (
          <ProductComparisonView
            comparedProducts={comparedProducts}
            locale={locale}
            onRemoveFromCompare={(slug) =>
              setComparedProducts((prev) => prev.filter((p) => p.slug !== slug))
            }
            onAddToCart={(p) => handleAddToCart(p, 1)}
          />
        )}

        {activeView === 'science' && <ScienceFoldingWorkbench locale={locale} />}

        {activeView === 'ai-studio' && <AiHardwareStudio locale={locale} />}

        {activeView === 'blog' && (
          <section className="space-y-6" aria-label="Technical Editorial & Hardware Guides">
            <div className="p-6 rounded-2xl bg-[#111827] border border-slate-800">
              <h1 className="text-xl font-bold text-white">
                {locale === 'fa'
                  ? 'مقالات مهندسی و راهنمای تخصصی سخت‌افزار تیرازیس'
                  : 'Tirazis Hardware Lab Editorial & Architecture Notes'}
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                {locale === 'fa'
                  ? 'بررسی‌های فنی توان پاور ATX 3.1، مقایسه‌های معماری پردازنده و بهینه‌سازی سیستم‌های ورک‌استیشن'
                  : 'Technical analyses on ATX 3.1 transient power excursions, AM5 vs LGA1700 memory latency, and headless storefront resilience.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {posts.map((post) => (
                <article
                  key={post.id}
                  className="p-6 rounded-2xl bg-[#111827] border border-slate-800 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2.5">
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <span className="text-cyan-400 font-medium">{post.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{post.publishedAt}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {post.readTimeMinutes} {locale === 'fa' ? 'دقیقه مطالعه' : 'min read'}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-white leading-snug">
                      {locale === 'fa' ? post.titleFa : post.title}
                    </h2>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {locale === 'fa' ? post.excerptFa : post.excerpt}
                    </p>
                  </div>
                  <div className="text-xs text-slate-500 pt-3 border-t border-slate-800">
                    {post.author}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeView === 'admin' && (
          <AdminAndDiagnosticsView
            health={providerHealth}
            settings={adminSettings}
            locale={locale}
            user={user}
            onRefreshHealth={fetchProviderHealth}
            onSaveSettings={handleSaveAdminSettings}
          />
        )}
      </main>

      {/* =====================================================================
          CLEAN FOOTER
          ===================================================================== */}
      <footer className="border-t border-slate-800/90 bg-[#0b0f17] px-6 py-8 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>
              {locale === 'fa'
                ? 'تیرازیس کامپیوتر — فروشگاه هدلس متصل به WordPress / WooCommerce و WPGraphQL'
                : 'Tirazis Computer — Headless Commerce Storefront powered by WordPress & WooCommerce'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="hover:text-white">
              Sitemap.xml
            </a>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => navigateTo('admin')}
              className="hover:text-white cursor-pointer"
            >
              {locale === 'fa' ? 'وضعیت اتصال سرور' : 'Provider Diagnostics'}
            </button>
          </div>
        </div>
      </footer>

      {/* Modals & Slide-Over Drawers */}
      <ProductDetailModal
        product={inspectedProduct}
        relatedProducts={relatedProducts}
        locale={locale}
        onClose={() => setInspectedProduct(null)}
        onAddToCart={handleAddToCart}
        onSelectRelated={handleInspectProduct}
        onUseInBuilder={handleUseInBuilder}
      />

      <CartDrawerAndCheckout
        isOpen={isCartOpen}
        cart={cart}
        locale={locale}
        onClose={() => setIsCartOpen(false)}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onApplyCoupon={handleApplyCoupon}
        onRevalidateCheckout={handleRevalidateCheckout}
        onSubmitOrder={handleSubmitOrder}
      />

      <WishlistDrawer
        isOpen={isWishlistOpen}
        items={wishlistProducts}
        locale={locale}
        notes={wishlistNotes}
        onUpdateNote={handleUpdateWishlistNote}
        onClose={() => setIsWishlistOpen(false)}
        onRemoveItem={handleToggleWishlist}
        onClearAll={handleClearWishlist}
        onAddToCart={(p) => handleAddToCart(p, 1)}
        onAddAllToCart={handleAddAllWishlistToCart}
        onSelectProduct={handleInspectProduct}
        onUseInBuilder={handleUseInBuilder}
        onShareWishlist={(shareUrl) => {
          try {
            const parsed = new URL(shareUrl);
            window.history.replaceState({}, '', `${parsed.pathname}${parsed.search}`);
          } catch {
            // Ignore URL history update errors
          }
          showToast(t.wishlistShareCopied);
        }}
      />
    </div>
  );
}
