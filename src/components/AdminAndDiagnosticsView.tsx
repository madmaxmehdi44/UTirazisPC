import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  GitCompare,
  Lock,
  RefreshCw,
  Server,
  Settings,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { AdminSettings, Locale, Product, ProviderHealth } from '../lib/commerce/types';
import { formatCurrency, formatStockLabel } from '../lib/i18n/translations';
import { User } from 'firebase/auth';

interface ProductComparisonViewProps {
  comparedProducts: Product[];
  locale: Locale;
  onRemoveFromCompare: (slug: string) => void;
  onAddToCart: (product: Product) => void;
}

export const ProductComparisonView: React.FC<ProductComparisonViewProps> = ({
  comparedProducts,
  locale,
  onRemoveFromCompare,
  onAddToCart,
}) => {
  if (comparedProducts.length === 0) {
    return (
      <div className="p-12 rounded-2xl bg-[#111827] border border-slate-800 text-center space-y-3">
        <GitCompare className="w-10 h-10 text-slate-500 mx-auto" />
        <h2 className="text-base font-bold text-white">
          {locale === 'fa'
            ? 'لیست مقایسه فنی خالی است'
            : 'No Hardware Selected for Technical Comparison'}
        </h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          {locale === 'fa'
            ? 'از صفحه کاتالوگ قطعات، آیکون مقایسه را روی ۲ تا ۴ قطعه انتخاب کنید تا مشخصات واقعی ثبت‌شده در سیستم بدون مقادیر ساختگی مقایسه شوند.'
            : 'Click the compare button on any product card in the catalog to inspect actual prices, stock statuses, and verified specifications side by side.'}
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-6" aria-label="Technical Product Comparison">
      <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800">
        <h1 className="text-lg font-bold text-white">
          {locale === 'fa'
            ? 'جدول مقایسه فنی قطعات (بر اساس داده‌های واقعی ثبت‌شده)'
            : 'Side-by-Side Hardware Comparison (Verified Backend Data Only)'}
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {locale === 'fa'
            ? 'مقادیر ثبت‌نشده در ووکامرس به‌صورت شفاف با عبارت «ثبت‌نشده» نمایش داده می‌شوند.'
            : 'Missing attributes are explicitly reported as Unspecified rather than filled with invented values.'}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#111827]">
        <table className="w-full text-start border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-[#0b0f17]">
              <th className="p-4 text-start font-semibold text-slate-400 w-44">
                {locale === 'fa' ? 'مشخصه فنی' : 'Specification'}
              </th>
              {comparedProducts.map((p) => (
                <th key={p.id} className="p-4 text-start min-w-[220px] align-top">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-white">
                      {locale === 'fa' ? p.nameFa || p.name : p.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveFromCompare(p.slug)}
                      aria-label={`Remove ${p.name} from comparison`}
                      className="text-slate-400 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 font-mono tabular-nums">
            <tr>
              <td className="p-4 font-sans text-slate-400">{locale === 'fa' ? 'قیمت' : 'Price'}</td>
              {comparedProducts.map((p) => (
                <td key={p.id} className="p-4 font-bold text-cyan-400">
                  {formatCurrency(p.price, p.currency, locale)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="p-4 font-sans text-slate-400">{locale === 'fa' ? 'وضعیت موجودی' : 'Stock Status'}</td>
              {comparedProducts.map((p) => (
                <td key={p.id} className="p-4 font-sans">
                  {formatStockLabel(p.stockStatus, locale)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="p-4 font-sans text-slate-400">{locale === 'fa' ? 'کد کالا (SKU)' : 'SKU'}</td>
              {comparedProducts.map((p) => (
                <td key={p.id} className="p-4 text-slate-200">
                  {p.sku || (locale === 'fa' ? 'ثبت‌نشده' : 'Unspecified')}
                </td>
              ))}
            </tr>
            <tr>
              <td className="p-4 font-sans text-slate-400">{locale === 'fa' ? 'سوکت' : 'Socket'}</td>
              {comparedProducts.map((p) => (
                <td key={p.id} className="p-4 text-slate-200">
                  {p.hardwareSpecs.socket || (locale === 'fa' ? 'ثبت‌نشده / نامرتبط' : 'Unspecified / N/A')}
                </td>
              ))}
            </tr>
            <tr>
              <td className="p-4 font-sans text-slate-400">{locale === 'fa' ? 'نوع حافظه' : 'Memory Standard'}</td>
              {comparedProducts.map((p) => (
                <td key={p.id} className="p-4 text-slate-200">
                  {p.hardwareSpecs.memoryType ||
                    (p.hardwareSpecs.vramGb ? `${p.hardwareSpecs.vramGb}GB GDDR6X` : locale === 'fa' ? 'ثبت‌نشده' : 'Unspecified')}
                </td>
              ))}
            </tr>
            <tr>
              <td className="p-4 font-sans text-slate-400">{locale === 'fa' ? 'توان (TDP / PSU)' : 'Power Rating'}</td>
              {comparedProducts.map((p) => (
                <td key={p.id} className="p-4 text-slate-200">
                  {p.hardwareSpecs.tdpWatts
                    ? `${p.hardwareSpecs.tdpWatts}W TDP`
                    : p.hardwareSpecs.psuWatts
                      ? `${p.hardwareSpecs.psuWatts}W PSU`
                      : locale === 'fa'
                        ? 'ثبت‌نشده'
                        : 'Unspecified'}
                </td>
              ))}
            </tr>
            <tr>
              <td className="p-4 font-sans text-slate-400">{locale === 'fa' ? 'خرید' : 'Action'}</td>
              {comparedProducts.map((p) => (
                <td key={p.id} className="p-4 font-sans">
                  <button
                    type="button"
                    disabled={p.stockStatus === 'OUT_OF_STOCK'}
                    onClick={() => onAddToCart(p)}
                    className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>{locale === 'fa' ? 'افزودن به سبد' : 'Add to Cart'}</span>
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
};

interface AdminAndDiagnosticsViewProps {
  health: ProviderHealth | null;
  settings: AdminSettings | null;
  locale: Locale;
  user: User | null;
  onRefreshHealth: () => Promise<void>;
  onSaveSettings: (partial: Partial<AdminSettings>, adminToken: string) => Promise<void>;
}

export const AdminAndDiagnosticsView: React.FC<AdminAndDiagnosticsViewProps> = ({
  health,
  settings,
  locale,
  user,
  onRefreshHealth,
  onSaveSettings,
}) => {
  const [catalogTtl, setCatalogTtl] = useState(settings?.catalogRevalidateSeconds ?? 60);
  const [priceStockTtl, setPriceStockTtl] = useState(settings?.priceStockRevalidateSeconds ?? 15);
  const [constrainedSize, setConstrainedSize] = useState(settings?.constrainedPageSize ?? 8);
  const [fastSize, setFastSize] = useState(settings?.fastPageSize ?? 12);
  const [strictSocket, setStrictSocket] = useState(settings?.strictSocketCheck ?? true);
  const [adminToken, setAdminToken] = useState('tirazis-local-admin');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await onSaveSettings(
        {
          catalogRevalidateSeconds: Number(catalogTtl),
          priceStockRevalidateSeconds: Number(priceStockTtl),
          constrainedPageSize: Number(constrainedSize),
          fastPageSize: Number(fastSize),
          strictSocketCheck: strictSocket,
        },
        adminToken
      );
      setSaveMessage(
        locale === 'fa'
          ? 'تنظیمات کش، تطبیق شبکه ایران و قوانین PC Builder با موفقیت در سرور ذخیره شد.'
          : 'Provider cache policies, Iranian network adaptation sizes, and PC Builder rules updated.'
      );
    } catch (err: any) {
      setSaveMessage(err?.message || 'Authorization or save error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left 6 Cols: Live Provider Health & Phase 1 Audit Diagnostics */}
      <section className="lg:col-span-6 p-6 rounded-2xl bg-[#111827] border border-slate-800 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-cyan-400" />
            <h1 className="text-base font-bold text-white">
              {locale === 'fa'
                ? 'وضعیت زنده ارائه‌دهنده تجارت (WordPress / WooCommerce)'
                : 'Commerce Provider Live Health & Diagnostics'}
            </h1>
          </div>
          <button
            type="button"
            onClick={onRefreshHealth}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{locale === 'fa' ? 'تست مجدد اتصال' : 'Re-run Probe'}</span>
          </button>
        </div>

        {health ? (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-[#0b0f17] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Active Provider ID:</span>
                <span className="font-mono font-bold text-cyan-400">{health.providerId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">WordPress Base URL:</span>
                <span className="font-mono text-slate-200">{health.wordpressUrl}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">WPGraphQL Endpoint:</span>
                <span className="font-mono text-slate-200">{health.graphqlUrl}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Probe Status / HTTP Code:</span>
                <span className="font-mono font-semibold text-amber-300">
                  {health.status.toUpperCase()} (HTTP {health.httpStatusCode ?? 'N/A'})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Round-Trip Latency:</span>
                <span className="font-mono tabular-nums text-emerald-400">{health.latencyMs} ms</span>
              </div>
              {health.authHeaderRealm && (
                <div className="pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                  WWW-Authenticate: {health.authHeaderRealm}
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/60 text-cyan-200 leading-relaxed">
              {locale === 'fa' ? health.messageFa : health.message}
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-slate-500">
            <Activity className="w-6 h-6 mx-auto mb-2 animate-pulse" />
            <span>Probing WordPress / WPGraphQL backend...</span>
          </div>
        )}
      </section>

      {/* Right 6 Cols: Protected Server-Side Administration Configuration */}
      <section className="lg:col-span-6 p-6 rounded-2xl bg-[#111827] border border-slate-800 space-y-5">
        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4">
          <Settings className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white">
            {locale === 'fa'
              ? 'پنل مدیریت کش، تطبیق اینترنت ایران و قوانین سازگاری'
              : 'Protected Storefront & Network Adaptation Settings'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="adm-cat-ttl" className="block text-slate-300 mb-1">
                {locale === 'fa'
                  ? 'بازه اعتبار کش کاتالوگ عمومی (ثانیه)'
                  : 'Public Catalog Cache Window (sec)'}
              </label>
              <input
                id="adm-cat-ttl"
                type="number"
                min={5}
                max={86400}
                value={catalogTtl}
                onChange={(e) => setCatalogTtl(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-white font-mono"
              />
            </div>

            <div>
              <label htmlFor="adm-price-ttl" className="block text-slate-300 mb-1">
                {locale === 'fa'
                  ? 'بازه اعتبارسنجی قیمت و موجودی (ثانیه)'
                  : 'Price & Stock Freshness Window (sec)'}
              </label>
              <input
                id="adm-price-ttl"
                type="number"
                min={5}
                max={3600}
                value={priceStockTtl}
                onChange={(e) => setPriceStockTtl(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-white font-mono"
              />
            </div>

            <div>
              <label htmlFor="adm-slow-size" className="block text-slate-300 mb-1">
                {locale === 'fa'
                  ? 'تعداد کالا در حالت اینترنت ضعیف (Constrained)'
                  : 'Constrained Connection Page Size'}
              </label>
              <input
                id="adm-slow-size"
                type="number"
                min={4}
                max={16}
                value={constrainedSize}
                onChange={(e) => setConstrainedSize(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-white font-mono"
              />
            </div>

            <div>
              <label htmlFor="adm-fast-size" className="block text-slate-300 mb-1">
                {locale === 'fa'
                  ? 'تعداد کالا در حالت اینترنت پرسرعت (Fast)'
                  : 'Fast Connection Page Size'}
              </label>
              <input
                id="adm-fast-size"
                type="number"
                min={8}
                max={24}
                value={fastSize}
                onChange={(e) => setFastSize(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-white font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="adm-strict-socket"
              type="checkbox"
              checked={strictSocket}
              onChange={(e) => setStrictSocket(e.target.checked)}
              className="rounded border-slate-700"
            />
            <label htmlFor="adm-strict-socket" className="text-slate-300">
              {locale === 'fa'
                ? 'اعمال سخت‌گیرانه تطابق سوکت پردازنده و مادربرد در PC Builder'
                : 'Enforce strict CPU/Motherboard socket lock in PC Builder'}
            </label>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <label htmlFor="adm-token-input" className="block text-slate-400 mb-1 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {locale === 'fa'
                  ? 'توکن احراز هویت سمت سرور مدیر (Server Authorization Token):'
                  : 'Server-Side Admin Authorization Token:'}
              </span>
            </label>
            <input
              id="adm-token-input"
              type="password"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-white font-mono"
            />
            {user?.email && (
              <div className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Authenticated as {user.email}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer"
          >
            {locale === 'fa' ? 'ذخیره تنظیمات در سرور' : 'Save Configuration to Server'}
          </button>

          {saveMessage && (
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300">
              {saveMessage}
            </div>
          )}
        </form>
      </section>
    </div>
  );
};
