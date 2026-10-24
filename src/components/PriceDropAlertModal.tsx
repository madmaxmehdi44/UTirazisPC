import React, { useEffect, useState } from 'react';
import { Bell, BellRing, Check, Mail, ShieldCheck, Trash2, X } from 'lucide-react';
import { User } from 'firebase/auth';
import { Locale, Product } from '../lib/commerce/types';
import { PriceDropAlertDoc } from '../lib/firebase/client';
import { formatCurrency, TRANSLATIONS } from '../lib/i18n/translations';

interface PriceDropAlertModalProps {
  product: Product | null;
  locale: Locale;
  user: User | null;
  existingAlert?: PriceDropAlertDoc | null;
  onClose: () => void;
  onSubmitAlert: (product: Product, email: string) => Promise<void>;
  onRemoveAlert: (product: Product) => Promise<void>;
  onSignIn?: () => Promise<void>;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PriceDropAlertModal: React.FC<PriceDropAlertModalProps> = ({
  product,
  locale,
  user,
  existingAlert,
  onClose,
  onSubmitAlert,
  onRemoveAlert,
  onSignIn,
}) => {
  const [email, setEmail] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setEmail(existingAlert?.email || user?.email || '');
      setErrorMsg(null);
    }
  }, [product, existingAlert, user]);

  if (!product) return null;

  const t = TRANSLATIONS[locale];
  const displayName = locale === 'fa' ? product.nameFa || product.name : product.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 254 || !EMAIL_REGEX.test(trimmed)) {
      setErrorMsg(
        locale === 'fa'
          ? 'لطفاً یک آدرس ایمیل معتبر وارد کنید.'
          : 'Please enter a valid email address.'
      );
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmitAlert(product, trimmed);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save price drop alert.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onRemoveAlert(product);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove price drop alert.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={t.priceDropModalTitle}
      data-testid="price-drop-modal"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#111827] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-[#0b0f17]">
          <div className="flex items-center gap-2.5">
            {existingAlert ? (
              <BellRing className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <Bell className="w-5 h-5 text-cyan-400 shrink-0" />
            )}
            <h2 className="text-sm font-bold text-white">{t.priceDropModalTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close price drop modal"
            data-testid="close-price-drop-modal"
            className="p-1.5 rounded-lg bg-slate-800/90 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Component Summary */}
          <div className="p-3.5 rounded-xl bg-[#0b0f17] border border-slate-800/90 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-cyan-400">
                {product.brand?.name || 'Tirazis'}
              </div>
              <div className="text-xs font-semibold text-white line-clamp-1 mt-0.5">
                {displayName}
              </div>
            </div>
            <div className="text-end shrink-0">
              <div className="text-[10px] text-slate-400">
                {locale === 'fa' ? 'قیمت فعلی' : 'Current Price'}
              </div>
              <div className="text-xs font-bold font-mono tabular-nums text-white">
                {formatCurrency(product.price, product.currency, locale)}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">{t.priceDropModalDesc}</p>

          {/* Firebase Account Scope Indicator */}
          <div className="px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-300 min-w-0">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">
                {user
                  ? locale === 'fa'
                    ? `متصل به حساب فایربیس: ${user.email || user.displayName}`
                    : `Firebase Account: ${user.email || user.displayName}`
                  : locale === 'fa'
                    ? 'ذخیره در حساب کاربری فعلی (همگام‌سازی خودکار با فایربیس)'
                    : 'Stored under your account (auto-syncs with Firebase)'}
              </span>
            </div>
            {!user && onSignIn && (
              <button
                type="button"
                onClick={onSignIn}
                className="text-cyan-400 hover:underline font-semibold shrink-0 cursor-pointer"
              >
                {locale === 'fa' ? 'ورود با گوگل' : 'Sign in'}
              </button>
            )}
          </div>

          {/* Email Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="price-drop-email-input"
              className="block text-xs font-semibold text-slate-200"
            >
              {t.priceDropEmailLabel}
            </label>
            <div className="relative" dir="ltr">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="price-drop-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@example.com"
                data-testid="price-drop-email-input"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0b0f17] border border-slate-700 focus:border-cyan-400 text-xs font-mono text-white placeholder:text-slate-500 outline-none transition-colors"
              />
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              data-testid="price-drop-error"
              className="p-2.5 rounded-lg bg-rose-950/70 border border-rose-700/60 text-rose-200 text-xs"
            >
              {errorMsg}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              data-testid="price-drop-submit-button"
              className="flex-1 py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{t.priceDropSubmit}</span>
            </button>

            {existingAlert && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleRemove}
                data-testid="price-drop-remove-button"
                className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/60 text-slate-300 hover:text-rose-300 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>{t.priceDropRemove}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
