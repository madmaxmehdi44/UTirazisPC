import React, { useState } from 'react';
import { CheckCircle2, Cpu, Plus, ShoppingCart, X } from 'lucide-react';
import { Locale, Product } from '../lib/commerce/types';
import { formatCurrency, formatStockLabel, TRANSLATIONS } from '../lib/i18n/translations';

interface ProductDetailModalProps {
  product: Product | null;
  relatedProducts: Product[];
  locale: Locale;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number, variationId?: string) => void;
  onSelectRelated: (product: Product) => void;
  onUseInBuilder: (product: Product) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  relatedProducts,
  locale,
  onClose,
  onAddToCart,
  onSelectRelated,
  onUseInBuilder,
}) => {
  if (!product) return null;

  const [selectedVariationId, setSelectedVariationId] = useState<string | undefined>(
    product.variations[0]?.id
  );
  const [quantity, setQuantity] = useState(1);
  const t = TRANSLATIONS[locale];

  const activeVariation = product.variations.find((v) => v.id === selectedVariationId);
  const activePrice = activeVariation ? activeVariation.price : product.price;
  const activeSku = activeVariation?.sku || product.sku || 'UNSPECIFIED';
  const activeStock = activeVariation ? activeVariation.stockStatus : product.stockStatus;
  const displayName = locale === 'fa' ? product.nameFa || product.name : product.name;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdp-modal-title"
    >
      <div className="relative w-full max-w-4xl rounded-2xl bg-[#111827] border border-slate-800 shadow-2xl overflow-hidden my-8">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-cyan-400">{product.brand?.name || 'Tirazis'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">SKU: {activeSku}</span>
            <span aria-hidden="true">·</span>
            <span>
              {product.dataSource === 'wordpress-live'
                ? locale === 'fa'
                  ? '데이터 زنده ووکامرس'
                  : 'Live WooCommerce Record'
                : locale === 'fa'
                  ? 'کاتالوگ مرجع سخت‌افزار تیرازیس'
                  : 'Verified Hardware Catalog'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={locale === 'fa' ? 'بستن پنجره' : 'Close product details'}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contiguous 2-Column Purchase Module */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6">
          {/* Left: Product Visual & Technical Specs */}
          <div className="lg:col-span-6 space-y-5">
            <div className="aspect-[4/3] rounded-xl bg-[#0b0f17] border border-slate-800 overflow-hidden flex items-center justify-center">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.imageAlt || displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Cpu className="w-16 h-16 text-cyan-500/60" />
              )}
            </div>

            {/* Verified Technical Specifications Table */}
            <div className="rounded-xl bg-[#0b0f17] border border-slate-800/90 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                {locale === 'fa' ? 'مشخصات فنی ثبت‌شده در سیستم' : 'Verified Technical Specifications'}
              </h4>
              <dl className="divide-y divide-slate-800/70 text-xs">
                {product.attributes.map((attr) => (
                  <div key={attr.name} className="py-2 flex items-center justify-between gap-4">
                    <dt className="text-slate-400">{locale === 'fa' ? attr.labelFa || attr.name : attr.name}</dt>
                    <dd className="font-mono text-slate-200 tabular-nums">{attr.options.join(' / ')}</dd>
                  </div>
                ))}
                {product.hardwareSpecs.socket && (
                  <div className="py-2 flex items-center justify-between gap-4">
                    <dt className="text-slate-400">{locale === 'fa' ? 'سوکت' : 'Socket'}</dt>
                    <dd className="font-mono text-cyan-300">{product.hardwareSpecs.socket}</dd>
                  </div>
                )}
                {product.hardwareSpecs.tdpWatts !== undefined && (
                  <div className="py-2 flex items-center justify-between gap-4">
                    <dt className="text-slate-400">{locale === 'fa' ? 'توان حرارتی / مصرفی (TDP)' : 'Thermal / Board Power'}</dt>
                    <dd className="font-mono text-slate-200 tabular-nums">{product.hardwareSpecs.tdpWatts} W</dd>
                  </div>
                )}
                {product.attributes.length === 0 && !product.hardwareSpecs.socket && (
                  <div className="py-2 text-slate-500">
                    {locale === 'fa'
                      ? 'مشخصات فنی تکمیلی برای این کالا در ووکامرس ثبت نشده است.'
                      : 'No additional technical attributes recorded in backend.'}
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Right: Contiguous Purchase Module */}
          <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <h2 id="pdp-modal-title" className="text-xl font-bold text-white leading-snug">
                {displayName}
              </h2>

              <p className="text-sm text-slate-300 leading-relaxed">
                {locale === 'fa' ? product.descriptionFa || product.description : product.description}
              </p>

              {/* Price & Stock Status */}
              <div className="p-4 rounded-xl bg-[#0b0f17] border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 mb-1">
                    {locale === 'fa' ? 'وضعیت موجودی انبار' : 'Availability'}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{formatStockLabel(activeStock, locale)}</span>
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-xs text-slate-400 mb-1">
                    {locale === 'fa' ? 'قیمت واحد' : 'Unit Price'}
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums text-white">
                    {formatCurrency(activePrice, product.currency, locale)}
                  </div>
                </div>
              </div>

              {/* Variable Product Selector (AJAX without page reload) */}
              {product.variations.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-300">
                    {locale === 'fa' ? 'انتخاب نسخه / گارانتی (بدون بارگذاری مجدد صفحه):' : 'Select Product Variation:'}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {product.variations.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVariationId(v.id)}
                        className={`p-3 rounded-lg border text-start text-xs transition-colors cursor-pointer ${
                          selectedVariationId === v.id
                            ? 'bg-cyan-950/60 border-cyan-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-semibold">{v.name}</div>
                        <div className="font-mono tabular-nums text-cyan-400 mt-1">
                          {formatCurrency(v.price, product.currency, locale)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity Stepper & Primary Add to Cart CTA */}
              <div className="flex items-center gap-3 pt-2">
                <div className="flex items-center rounded-lg bg-[#0b0f17] border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Decrease quantity"
                    className="px-3 py-2 text-sm text-slate-300 hover:text-white cursor-pointer"
                  >
                    -
                  </button>
                  <span className="px-3 py-2 text-sm font-mono tabular-nums text-white">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                    aria-label="Increase quantity"
                    className="px-3 py-2 text-sm text-slate-300 hover:text-white cursor-pointer"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  disabled={activeStock === 'OUT_OF_STOCK'}
                  onClick={() => {
                    onAddToCart(product, quantity, selectedVariationId);
                    onClose();
                  }}
                  className="flex-1 py-2.5 px-5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>{t.addToCart}</span>
                </button>
              </div>

              {product.hardwareSpecs.slot && (
                <button
                  type="button"
                  onClick={() => {
                    onUseInBuilder(product);
                    onClose();
                  }}
                  className="w-full py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-cyan-400" />
                  <span>{t.selectInBuilder}</span>
                </button>
              )}
            </div>

            {/* Related Products Based on Real Backend Slugs */}
            {relatedProducts.length > 0 && (
              <div className="pt-4 border-t border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                  {locale === 'fa' ? 'قطعات مکمل و مرتبط' : 'Compatible & Related Hardware'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {relatedProducts.slice(0, 2).map((rel) => (
                    <button
                      key={rel.id}
                      type="button"
                      onClick={() => onSelectRelated(rel)}
                      className="p-2.5 rounded-lg bg-[#0b0f17] border border-slate-800 hover:border-cyan-500/50 text-start transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-medium text-slate-200 line-clamp-1">
                        {locale === 'fa' ? rel.nameFa || rel.name : rel.name}
                      </div>
                      <div className="text-xs font-mono tabular-nums text-cyan-400 mt-1">
                        {formatCurrency(rel.price, rel.currency, locale)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
