import React, { useEffect, useState } from 'react';
import { Check, Copy, Cpu, FileText, Heart, Plus, Share2, ShoppingCart, Trash2, X } from 'lucide-react';
import { Locale, Product } from '../lib/commerce/types';
import { formatCurrency, formatStockLabel, TRANSLATIONS } from '../lib/i18n/translations';

export const WISHLIST_NOTES_STORAGE_KEY = 'tirazis_wishlist_notes';

interface WishlistDrawerProps {
  isOpen: boolean;
  items: Product[];
  locale: Locale;
  notes?: Record<string, string>;
  onUpdateNote?: (slug: string, note: string) => void;
  onClose: () => void;
  onRemoveItem: (product: Product) => void;
  onClearAll: () => void;
  onAddToCart: (product: Product) => void;
  onAddAllToCart: () => void;
  onSelectProduct: (product: Product) => void;
  onUseInBuilder: (product: Product) => void;
  onShareWishlist?: (url: string) => void;
}

export const WishlistDrawer: React.FC<WishlistDrawerProps> = ({
  isOpen,
  items,
  locale,
  notes,
  onUpdateNote,
  onClose,
  onRemoveItem,
  onClearAll,
  onAddToCart,
  onAddAllToCart,
  onSelectProduct,
  onUseInBuilder,
  onShareWishlist,
}) => {
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(WISHLIST_NOTES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Ignore storage read errors
    }
    return {};
  });

  const activeNotes = notes ?? internalNotes;

  const handleNoteChange = (slug: string, value: string) => {
    if (onUpdateNote) {
      onUpdateNote(slug, value);
    } else {
      setInternalNotes((prev) => {
        const next = { ...prev };
        if (value) {
          next[slug] = value;
        } else {
          delete next[slug];
        }
        try {
          localStorage.setItem(WISHLIST_NOTES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage write errors
        }
        return next;
      });
    }
  };

  // Keep generated share URL in sync when items or locale change while panel is open
  useEffect(() => {
    if (items.length === 0) {
      setSharedUrl(null);
      setCopied(false);
    } else if (sharedUrl) {
      const slugsParam = items.map((p) => p.slug).join(',');
      setSharedUrl(`${window.location.origin}/${locale}/catalog?wishlist=${slugsParam}`);
    }
  }, [items, locale]);

  if (!isOpen) return null;

  const t = TRANSLATIONS[locale];
  const totalEstimatedPrice = items.reduce((sum, item) => sum + (item.price || 0), 0);
  const inStockCount = items.filter((item) => item.stockStatus === 'IN_STOCK').length;

  const handleGenerateAndCopyShareUrl = async () => {
    if (items.length === 0) return;
    const slugsParam = items.map((p) => p.slug).join(',');
    const url = `${window.location.origin}/${locale}/catalog?wishlist=${slugsParam}`;
    setSharedUrl(url);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // Clipboard API may be restricted in iframe; the visible input allows manual copy
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    if (onShareWishlist) {
      onShareWishlist(url);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={t.wishlistTitle}
      data-testid="wishlist-drawer"
    >
      <div className="w-full max-w-lg bg-[#0b0f17] border-s border-slate-800 h-full flex flex-col justify-between overflow-hidden shadow-2xl">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-[#111827]">
          <div className="flex items-center gap-2.5">
            <Heart className="w-5 h-5 text-rose-500 fill-rose-500 shrink-0" />
            <h2 className="text-base font-bold text-white">
              {t.wishlistTitle} ({items.length})
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={handleGenerateAndCopyShareUrl}
                data-testid="wishlist-share-button"
                aria-label={t.wishlistShare}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-400 text-xs font-semibold text-cyan-400 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{t.wishlistShare}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close wishlist drawer"
              data-testid="close-wishlist-drawer"
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Public Shareable URL Banner (Shown when Share is clicked) */}
        {sharedUrl && items.length > 0 && (
          <div
            data-testid="wishlist-share-panel"
            className="px-5 py-3.5 bg-[#0d1526] border-b border-cyan-500/30 space-y-2"
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-cyan-400">{t.wishlistSharedBanner}</span>
              {copied && (
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>{locale === 'fa' ? 'کپی شد' : 'Copied'}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2" dir="ltr">
              <input
                type="text"
                readOnly
                value={sharedUrl}
                data-testid="wishlist-share-url-input"
                aria-label="Public Shareable Wishlist URL"
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 px-3 py-1.5 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs font-mono text-slate-200 outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={handleGenerateAndCopyShareUrl}
                data-testid="wishlist-copy-url-button"
                aria-label="Copy shareable wishlist link"
                className="px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{locale === 'fa' ? 'کپی' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {items.length === 0 ? (
            <div
              className="py-16 text-center space-y-3 text-slate-400"
              data-testid="wishlist-empty-state"
            >
              <Heart className="w-12 h-12 mx-auto text-slate-600" />
              <p className="text-sm">{t.wishlistEmpty}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((product) => {
                const displayName = locale === 'fa' ? product.nameFa || product.name : product.name;
                const isOutOfStock = product.stockStatus === 'OUT_OF_STOCK';
                const itemNote = activeNotes[product.slug] || '';

                return (
                  <div
                    key={product.id}
                    data-testid={`wishlist-item-${product.slug}`}
                    className="p-3.5 rounded-xl bg-[#111827] border border-slate-800/90 flex flex-col gap-3"
                  >
                    <div className="flex items-start gap-3.5">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={displayName}
                          referrerPolicy="no-referrer"
                          onClick={() => {
                            onClose();
                            onSelectProduct(product);
                          }}
                          className="w-16 h-16 rounded-lg object-cover bg-slate-900 shrink-0 cursor-pointer border border-slate-800"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onSelectProduct(product);
                          }}
                          className="w-16 h-16 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <Cpu className="w-6 h-6 text-cyan-400/70" />
                        </button>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-slate-400 mb-0.5">
                          <span className="uppercase tracking-wider font-medium text-cyan-400">
                            {product.brand?.name || 'Tirazis'}
                          </span>
                          {product.hardwareSpecs.socket && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-slate-300">
                                {product.hardwareSpecs.socket}
                              </span>
                            </>
                          )}
                          {product.hardwareSpecs.memoryType && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-slate-300">
                                {product.hardwareSpecs.memoryType}
                              </span>
                            </>
                          )}
                        </div>

                        <h3 className="text-xs font-semibold text-white line-clamp-2">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onSelectProduct(product);
                            }}
                            className="text-start hover:text-cyan-400 transition-colors cursor-pointer"
                          >
                            {displayName}
                          </button>
                        </h3>

                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span
                            className={`text-[11px] font-medium ${
                              product.stockStatus === 'IN_STOCK'
                                ? 'text-emerald-400'
                                : isOutOfStock
                                  ? 'text-rose-400'
                                  : 'text-amber-400'
                            }`}
                          >
                            {formatStockLabel(product.stockStatus, locale)}
                          </span>

                          <span className="text-xs font-bold font-mono tabular-nums text-white">
                            {formatCurrency(product.price, product.currency, locale)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Editable Personal Note / Build Reminder Field */}
                    <div className="pt-2 border-t border-slate-800/60 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label
                          htmlFor={`wishlist-note-${product.slug}`}
                          className="text-slate-400 font-medium inline-flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span>{t.wishlistNoteLabel}</span>
                        </label>
                        {itemNote.trim().length > 0 && (
                          <span
                            data-testid={`wishlist-note-saved-${product.slug}`}
                            className="text-[10px] text-emerald-400/90 font-medium inline-flex items-center gap-1"
                          >
                            <Check className="w-2.5 h-2.5" />
                            <span>{t.wishlistNoteSaved}</span>
                          </span>
                        )}
                      </div>
                      <input
                        id={`wishlist-note-${product.slug}`}
                        type="text"
                        value={itemNote}
                        onChange={(e) => handleNoteChange(product.slug, e.target.value)}
                        placeholder={t.wishlistNotePlaceholder}
                        data-testid={`wishlist-note-input-${product.slug}`}
                        aria-label={`${t.wishlistNoteLabel} - ${displayName}`}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#0b0f17] border border-slate-700/90 focus:border-cyan-400 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
                      />
                    </div>

                    {/* Item Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/70">
                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => onAddToCart(product)}
                        data-testid={`wishlist-add-to-cart-${product.slug}`}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          isOutOfStock
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                        }`}
                      >
                        <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                        <span>{isOutOfStock ? t.outOfStock : t.addToCart}</span>
                      </button>

                      {product.hardwareSpecs.slot && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onUseInBuilder(product);
                          }}
                          title={t.selectInBuilder}
                          aria-label={`${t.selectInBuilder} ${displayName}`}
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-300 transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onRemoveItem(product)}
                        data-testid={`wishlist-remove-${product.slug}`}
                        aria-label={`${t.wishlistRemove} ${displayName}`}
                        title={t.wishlistRemove}
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:border-rose-500/60 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        {items.length > 0 && (
          <div className="p-5 border-t border-slate-800 bg-[#111827] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {locale === 'fa' ? 'مجموع ارزش قطعات ذخیره‌شده:' : 'Total Saved Value:'}
              </span>
              <span className="text-sm font-bold font-mono tabular-nums text-cyan-400">
                {formatCurrency(totalEstimatedPrice, 'IRT', locale)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={inStockCount === 0}
                onClick={onAddAllToCart}
                data-testid="wishlist-add-all-to-cart"
                className="flex-1 py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4 shrink-0" />
                <span>{t.wishlistMoveAllToCart}</span>
              </button>

              <button
                type="button"
                onClick={onClearAll}
                data-testid="wishlist-clear-all"
                className="py-2.5 px-3.5 rounded-xl bg-slate-900 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/50 text-slate-300 hover:text-rose-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {t.wishlistClear}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
