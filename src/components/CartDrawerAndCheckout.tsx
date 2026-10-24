import React, { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { Cart, CheckoutRevalidationResult, Locale } from '../lib/commerce/types';
import { formatCurrency, TRANSLATIONS } from '../lib/i18n/translations';

interface CartDrawerAndCheckoutProps {
  isOpen: boolean;
  cart: Cart;
  locale: Locale;
  onClose: () => void;
  onUpdateQty: (key: string, quantity: number) => Promise<void>;
  onRemoveItem: (key: string) => Promise<void>;
  onApplyCoupon: (code: string) => Promise<void>;
  onRevalidateCheckout: () => Promise<CheckoutRevalidationResult | null>;
  onSubmitOrder: (payload: {
    customerName: string;
    email: string;
    phone: string;
    city: string;
    address: string;
    postalCode: string;
    shippingMethodId: string;
  }) => Promise<any>;
}

export const CartDrawerAndCheckout: React.FC<CartDrawerAndCheckoutProps> = ({
  isOpen,
  cart,
  locale,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onApplyCoupon,
  onRevalidateCheckout,
  onSubmitOrder,
}) => {
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [step, setStep] = useState<'cart' | 'checkout' | 'confirmed'>('cart');
  const [revalidation, setRevalidation] = useState<CheckoutRevalidationResult | null>(null);
  const [isRevalidating, setIsRevalidating] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState(locale === 'fa' ? 'تهران' : 'Tehran');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [shippingMethodId, setShippingMethodId] = useState('tehran-express-courier');
  const [formError, setFormError] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<any | null>(null);

  if (!isOpen) return null;

  const t = TRANSLATIONS[locale];

  const handleCouponSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError(null);
    try {
      await onApplyCoupon(couponInput);
    } catch (err: any) {
      setCouponError(err?.message || 'Invalid coupon');
    }
  };

  const handleProceedToCheckout = async () => {
    setIsRevalidating(true);
    setFormError(null);
    try {
      const result = await onRevalidateCheckout();
      setRevalidation(result);
      setStep('checkout');
    } finally {
      setIsRevalidating(false);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!customerName.trim() || !phone.trim() || !address.trim() || !postalCode.trim()) {
      setFormError(
        locale === 'fa'
          ? 'لطفاً نام و نام خانوادگی، شماره موبایل، آدرس دقیق و کد پستی ۱۰ رقمی را وارد کنید.'
          : 'Please complete Full Name, Phone Number, Street Address, and Postal Code.'
      );
      return;
    }
    try {
      const result = await onSubmitOrder({
        customerName: customerName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        city: city.trim(),
        address: address.trim(),
        postalCode: postalCode.trim(),
        shippingMethodId,
      });
      setOrderResult(result);
      setStep('confirmed');
    } catch (err: any) {
      setFormError(err?.message || 'Checkout submission failed');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={t.cartTitle}
    >
      <div className="w-full max-w-lg bg-[#111827] border-s border-slate-800 h-full flex flex-col justify-between overflow-y-auto">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[#111827] z-10">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white">{t.cartTitle}</h2>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              ({cart.itemCount} {locale === 'fa' ? 'مورد' : 'items'})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart drawer"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 space-y-6">
          {step === 'confirmed' && orderResult ? (
            <div className="p-5 rounded-xl bg-emerald-950/30 border border-emerald-700/60 space-y-4">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>
                  {locale === 'fa'
                    ? `سفارش ${orderResult.orderReference} ثبت و آماده انتقال به درگاه شد`
                    : `Order ${orderResult.orderReference} Validated & Ready for Gateway`}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {locale === 'fa'
                  ? 'موجودی و قیمت قطعات با سرور ووکامرس تطبیق داده شد. برای تکمیل پرداخت شاپرکی یا تسویه رسمی در ووکامرس، از لینک مستقیم زیر استفاده نمایید.'
                  : 'Prices, taxes, and inventory have been revalidated against the WooCommerce Store API contract. Proceed to the official WooCommerce payment gateway when ready.'}
              </p>
              <div className="p-3 rounded-lg bg-[#0b0f17] border border-slate-800 text-xs space-y-1.5 font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-400">{locale === 'fa' ? 'گیرنده:' : 'Recipient:'}</span>
                  <span className="text-white">{orderResult.customer.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{locale === 'fa' ? 'مبلغ قابل پرداخت:' : 'Payable Total:'}</span>
                  <span className="text-cyan-400 font-bold">
                    {formatCurrency(orderResult.payableTotal, orderResult.currency, locale)}
                  </span>
                </div>
              </div>
              <a
                href={orderResult.officialWooCommerceCheckoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <span>
                  {locale === 'fa'
                    ? 'انتقال امن به درگاه رسمی ووکامرس (utirazis.flywheelsites.com)'
                    : 'Open Official WooCommerce Checkout Gateway'}
                </span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => {
                  setStep('cart');
                  setOrderResult(null);
                  onClose();
                }}
                className="w-full py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                {locale === 'fa' ? 'بازگشت به فروشگاه' : 'Return to Storefront'}
              </button>
            </div>
          ) : cart.items.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-400">{t.cartEmpty}</p>
            </div>
          ) : step === 'cart' ? (
            <>
              <div className="space-y-3">
                {cart.items.map((item) => (
                  <div
                    key={item.key}
                    className="p-3.5 rounded-xl bg-[#0b0f17] border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-100 truncate">
                        {locale === 'fa' ? item.nameFa || item.name : item.name}
                      </div>
                      <div className="text-xs font-mono tabular-nums text-cyan-400 mt-1">
                        {formatCurrency(item.unitPrice, item.currency, locale)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center rounded bg-slate-900 border border-slate-700">
                        <button
                          type="button"
                          onClick={() => onUpdateQty(item.key, item.quantity - 1)}
                          aria-label={`Decrease quantity of ${item.name}`}
                          className="px-2 py-1 text-xs text-slate-300 hover:text-white cursor-pointer"
                        >
                          -
                        </button>
                        <span className="px-2 py-1 text-xs font-mono tabular-nums text-white">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQty(item.key, item.quantity + 1)}
                          aria-label={`Increase quantity of ${item.name}`}
                          className="px-2 py-1 text-xs text-slate-300 hover:text-white cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.key)}
                        aria-label={`Remove ${item.name} from cart`}
                        className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon Form */}
              <form onSubmit={handleCouponSubmit} className="space-y-2 pt-2">
                <label htmlFor="cart-coupon-input" className="block text-xs text-slate-400">
                  {locale === 'fa'
                    ? 'کد تخفیف سازمانی / ورک‌استیشن (مثال: TIRAZIS5 یا WORKSTATION10)'
                    : 'Promo / Workstation Coupon Code (Try TIRAZIS5 or WORKSTATION10)'}
                </label>
                <div className="flex gap-2">
                  <input
                    id="cart-coupon-input"
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="TIRAZIS5"
                    className="flex-1 px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white font-mono"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white cursor-pointer"
                  >
                    {locale === 'fa' ? 'اعمال کد' : 'Apply'}
                  </button>
                </div>
                {couponError && <p className="text-xs text-rose-400">{couponError}</p>}
              </form>
            </>
          ) : (
            /* Step === 'checkout' */
            <form id="checkout-shipping-form" onSubmit={handlePlaceOrder} className="space-y-4">
              <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-800/60 flex items-center justify-between text-xs text-cyan-200">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>
                    {locale === 'fa'
                      ? 'قیمت و موجودی کالاها پیش از تسویه‌حساب مجدداً اعتبارسنجی شد.'
                      : 'Prices, stock, and tax rates revalidated with server.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  className="underline text-cyan-300 hover:text-white cursor-pointer"
                >
                  {locale === 'fa' ? 'ویرایش سبد' : 'Edit Cart'}
                </button>
              </div>

              {revalidation && revalidation.issues.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-700 text-xs text-amber-200 space-y-1">
                  {revalidation.issues.map((iss) => (
                    <div key={iss.productSlug}>
                      {locale === 'fa' ? iss.messageFa : iss.messageEn}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label htmlFor="chk-name" className="block text-xs text-slate-300 mb-1">
                  {locale === 'fa' ? 'نام و نام خانوادگی تحویل‌گیرنده *' : 'Recipient Full Name *'}
                </label>
                <input
                  id="chk-name"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="chk-phone" className="block text-xs text-slate-300 mb-1">
                    {locale === 'fa' ? 'شماره موبایل *' : 'Mobile Phone *'}
                  </label>
                  <input
                    id="chk-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0912..."
                    className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="chk-postal" className="block text-xs text-slate-300 mb-1">
                    {locale === 'fa' ? 'کد پستی ۱۰ رقمی *' : 'Postal Code *'}
                  </label>
                  <input
                    id="chk-postal"
                    type="text"
                    required
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="chk-address" className="block text-xs text-slate-300 mb-1">
                  {locale === 'fa' ? 'آدرس دقیق پستی *' : 'Street Address *'}
                </label>
                <textarea
                  id="chk-address"
                  rows={2}
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white"
                />
              </div>

              <div>
                <label htmlFor="chk-shipping" className="block text-xs text-slate-300 mb-1">
                  {locale === 'fa' ? 'روش ارسال بیمه‌شده سخت‌افزار' : 'Insured Hardware Shipping Method'}
                </label>
                <select
                  id="chk-shipping"
                  value={shippingMethodId}
                  onChange={(e) => setShippingMethodId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white"
                >
                  <option value="tehran-express-courier">
                    {locale === 'fa'
                      ? 'پیک ویژه بیمه‌شده سخت‌افزار تیرازیس (تهران و کرج)'
                      : 'Tirazis Insured Hardware Courier (Tehran & Karaj)'}
                  </option>
                  <option value="chapar-air-freight">
                    {locale === 'fa'
                      ? 'ارسال بیمه‌شده چاپار / تیپاکس (سراسر کشور)'
                      : 'Chapar / Tipax Insured Heavy Parcel (Nationwide)'}
                  </option>
                </select>
              </div>

              {formError && <p className="text-xs text-rose-400">{formError}</p>}
            </form>
          )}
        </div>

        {/* Footer Totals & Action CTA */}
        {cart.items.length > 0 && step !== 'confirmed' && (
          <div className="p-6 border-t border-slate-800 bg-[#0b0f17] space-y-4">
            <div className="space-y-1.5 text-xs font-mono tabular-nums">
              <div className="flex justify-between text-slate-400">
                <span>{locale === 'fa' ? 'جمع کل قطعات:' : 'Subtotal:'}</span>
                <span>{formatCurrency(cart.subtotal, cart.currency, locale)}</span>
              </div>
              {cart.discountTotal > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>
                    {locale === 'fa' ? 'تخفیف کوپن:' : 'Coupon Discount:'} ({cart.appliedCoupons.join(', ')})
                  </span>
                  <span>-{formatCurrency(cart.discountTotal, cart.currency, locale)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>{locale === 'fa' ? 'بیمه و ارسال:' : 'Insured Shipping:'}</span>
                <span>
                  {cart.shippingTotal === 0
                    ? locale === 'fa'
                      ? 'رایگان (سفارش بالای ۵۰ میلیون)'
                      : 'Free (Orders > 50M)'
                    : formatCurrency(cart.shippingTotal, cart.currency, locale)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>{locale === 'fa' ? 'مالیات بر ارزش افزوده (۹٪):' : 'VAT (9%):'}</span>
                <span>{formatCurrency(cart.taxTotal, cart.currency, locale)}</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex justify-between text-sm font-bold text-white">
                <span>{locale === 'fa' ? 'مبلغ نهایی قابل پرداخت:' : 'Final Payable Amount:'}</span>
                <span className="text-cyan-400">{formatCurrency(cart.total, cart.currency, locale)}</span>
              </div>
            </div>

            {step === 'cart' ? (
              <button
                type="button"
                disabled={isRevalidating}
                onClick={handleProceedToCheckout}
                className="w-full py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isRevalidating && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>{t.proceedToCheckout}</span>
              </button>
            ) : (
              <button
                type="submit"
                form="checkout-shipping-form"
                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>
                  {locale === 'fa'
                    ? 'تایید نهایی و دریافت حواله درگاه رسمی ووکامرس'
                    : 'Confirm Order & Proceed to Official WooCommerce Gateway'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
