import React, { useState } from 'react';
import { Check, Cpu, Eye, GitCompare, Plus, ShoppingCart, AlertTriangle } from 'lucide-react';
import { Locale, Product } from '../lib/commerce/types';
import { formatCurrency, formatStockLabel, TRANSLATIONS } from '../lib/i18n/translations';

interface ProductCardProps {
  product: Product;
  locale: Locale;
  isCompared: boolean;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onToggleCompare: (product: Product) => void;
  onUseInBuilder: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  locale,
  isCompared,
  onSelectProduct,
  onAddToCart,
  onToggleCompare,
  onUseInBuilder,
}) => {
  const [imgError, setImgError] = useState(false);
  const t = TRANSLATIONS[locale];
  const displayName = locale === 'fa' ? product.nameFa || product.name : product.name;
  const categoryName =
    locale === 'fa'
      ? product.categories[0]?.nameFa || product.categories[0]?.name || 'قطعات سخت‌افزار'
      : product.categories[0]?.name || 'Hardware';

  const isOutOfStock = product.stockStatus === 'OUT_OF_STOCK';

  return (
    <article
      className="group flex flex-col justify-between rounded-xl bg-[#111827] border border-slate-800/90 hover:border-cyan-500/50 transition-all duration-150 overflow-hidden"
      data-testid={`product-card-${product.slug}`}
    >
      {/* Top 68% Product Visual Area */}
      <div className="relative aspect-[4/3] w-full bg-[#0d1320] overflow-hidden border-b border-slate-800/70">
        {product.imageUrl && !imgError ? (
          <img
            src={product.imageUrl}
            alt={product.imageAlt || displayName}
            referrerPolicy="no-referrer"
            loading="lazy"
            width={640}
            height={480}
            onError={() => setImgError(true)}
            onClick={() => onSelectProduct(product)}
            className="w-full h-full object-cover cursor-pointer group-hover:scale-[1.02] transition-transform duration-200"
          />
        ) : (
          <button
            type="button"
            onClick={() => onSelectProduct(product)}
            className="w-full h-full flex flex-col items-center justify-center p-6 text-slate-400 bg-gradient-to-br from-slate-900 to-slate-950 cursor-pointer"
          >
            <Cpu className="w-10 h-10 text-cyan-400/70 mb-2" />
            <span className="text-xs text-center line-clamp-2">{displayName}</span>
          </button>
        )}

        {/* Quick Inspect Action */}
        <button
          type="button"
          onClick={() => onSelectProduct(product)}
          aria-label={locale === 'fa' ? `مشاهده جزئیات ${displayName}` : `Inspect ${displayName}`}
          className="absolute top-3 end-3 p-2 rounded-lg bg-slate-950/80 text-slate-200 hover:text-cyan-400 hover:bg-slate-900 transition-colors"
        >
          <Eye className="w-4 h-4" />
        </button>

        {product.isDemoProduct && (
          <div className="absolute bottom-2 start-2 px-2 py-1 rounded bg-amber-950/90 border border-amber-700/60 text-amber-200 text-[11px] flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>{locale === 'fa' ? 'کالای آزمایشی ووکامرس' : 'WooCommerce Demo Item'}</span>
          </div>
        )}
      </div>

      {/* Product Body & Clean Unboxed Metadata */}
      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div>
          {/* Zero-Pill Metadata Line */}
          <div className="flex items-center flex-wrap gap-1.5 text-xs text-slate-400 mb-1.5">
            <span className="uppercase tracking-wider font-medium text-cyan-400">
              {product.brand?.name || 'Tirazis'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{categoryName}</span>
            {product.hardwareSpecs.socket && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-300">{product.hardwareSpecs.socket}</span>
              </>
            )}
            {product.hardwareSpecs.memoryType && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-300">{product.hardwareSpecs.memoryType}</span>
              </>
            )}
          </div>

          <h3 className="text-base font-semibold text-slate-100 leading-snug line-clamp-2">
            <button
              type="button"
              onClick={() => onSelectProduct(product)}
              className="text-start hover:text-cyan-400 transition-colors cursor-pointer"
            >
              {displayName}
            </button>
          </h3>

          <p className="mt-1.5 text-xs text-slate-400 line-clamp-2 leading-relaxed">
            {locale === 'fa'
              ? product.shortDescriptionFa || product.shortDescription
              : product.shortDescription}
          </p>
        </div>

        {/* Price Baseline & Stock Status */}
        <div className="pt-3 border-t border-slate-800/80 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`text-xs font-medium ${
                product.stockStatus === 'IN_STOCK'
                  ? 'text-emerald-400'
                  : product.stockStatus === 'OUT_OF_STOCK'
                    ? 'text-rose-400'
                    : 'text-amber-400'
              }`}
            >
              {formatStockLabel(product.stockStatus, locale)}
            </span>

            <span className="text-[15px] font-semibold font-mono tabular-nums text-white">
              {formatCurrency(product.price, product.currency, locale)}
            </span>
          </div>

          {/* Interactive Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={() => onAddToCart(product)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isOutOfStock
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
              <span>{isOutOfStock ? t.outOfStock : t.addToCart}</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleCompare(product)}
              aria-label={`${t.compareAdd} ${displayName}`}
              title={isCompared ? t.compareRemove : t.compareAdd}
              className={`p-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                isCompared
                  ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {isCompared ? <Check className="w-4 h-4" /> : <GitCompare className="w-4 h-4" />}
            </button>

            {product.hardwareSpecs.slot && (
              <button
                type="button"
                onClick={() => onUseInBuilder(product)}
                aria-label={`${t.selectInBuilder} ${displayName}`}
                title={t.selectInBuilder}
                className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-300 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};
