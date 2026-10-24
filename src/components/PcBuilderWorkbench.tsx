import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Cpu,
  ExternalLink,
  HardDrive,
  HelpCircle,
  Save,
  ShoppingCart,
  Trash2,
  Zap,
} from 'lucide-react';
import { evaluatePcBuildCompatibility } from '../lib/commerce/compatibility';
import { Locale, PcComponentSlot, Product } from '../lib/commerce/types';
import {
  deleteDriveBuildFile,
  deletePcBuildFromFirestore,
  DriveFileRecord,
  exportBuildToGoogleDrive,
  googleSignIn,
  listDriveBuildFiles,
  SavedPcBuildDoc,
  savePcBuildToFirestore,
} from '../lib/firebase/client';
import { formatCurrency } from '../lib/i18n/translations';
import { User } from 'firebase/auth';

interface PcBuilderWorkbenchProps {
  catalog: Product[];
  selectedParts: Partial<Record<PcComponentSlot, Product | null>>;
  locale: Locale;
  user: User | null;
  savedBuilds: SavedPcBuildDoc[];
  strictSocketCheck: boolean;
  onSelectPart: (slot: PcComponentSlot, product: Product | null) => void;
  onAddBuildToCart: (products: Product[]) => void;
  onAuthUpdated: (user: User) => void;
}

const SLOT_DEFINITIONS: {
  slot: PcComponentSlot;
  labelEn: string;
  labelFa: string;
}[] = [
  { slot: 'cpu', labelEn: 'Processor (CPU)', labelFa: 'پردازنده (CPU)' },
  { slot: 'motherboard', labelEn: 'Motherboard', labelFa: 'مادربرد (Motherboard)' },
  { slot: 'gpu', labelEn: 'Graphics Card (GPU)', labelFa: 'کارت گرافیک (GPU)' },
  { slot: 'ram', labelEn: 'Memory (RAM)', labelFa: 'حافظه رم (RAM)' },
  { slot: 'storage', labelEn: 'NVMe SSD Storage', labelFa: 'حافظه اس‌اس‌دی (SSD)' },
  { slot: 'psu', labelEn: 'Power Supply (PSU)', labelFa: 'منبع تغذیه (پاور)' },
  { slot: 'case', labelEn: 'Workstation Chassis', labelFa: 'کیس (Chassis)' },
  { slot: 'cooler', labelEn: 'CPU Thermal Cooling', labelFa: 'خنک‌کننده پردازنده' },
];

export const PcBuilderWorkbench: React.FC<PcBuilderWorkbenchProps> = ({
  catalog,
  selectedParts,
  locale,
  user,
  savedBuilds,
  strictSocketCheck,
  onSelectPart,
  onAddBuildToCart,
  onAuthUpdated,
}) => {
  const [buildTitle, setBuildTitle] = useState(
    locale === 'fa' ? 'ورک‌استیشن مهندسی تیرازیس AM5' : 'Tirazis AM5 Render Workstation'
  );
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileRecord[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    type: 'firestore' | 'drive';
    id: string;
    name: string;
  } | null>(null);

  const report = evaluatePcBuildCompatibility(selectedParts, strictSocketCheck);

  const applyPreset = (preset: 'compatible-am5' | 'incompatible-test') => {
    const findSlug = (s: string) => catalog.find((p) => p.slug === s) || null;
    if (preset === 'compatible-am5') {
      onSelectPart('cpu', findSlug('amd-ryzen-9-7950x3d'));
      onSelectPart('motherboard', findSlug('asus-rog-crosshair-x670e-hero'));
      onSelectPart('gpu', findSlug('asus-rog-strix-rtx-4080-super-16gb'));
      onSelectPart('ram', findSlug('corsair-dominator-titanium-64gb-ddr5'));
      onSelectPart('storage', findSlug('samsung-990-pro-2tb-nvme'));
      onSelectPart('psu', findSlug('corsair-rm1000x-shift-atx3'));
      onSelectPart('case', findSlug('lian-li-o11-dynamic-evo-rgb'));
      onSelectPart('cooler', findSlug('noctua-nh-d15-chromax-black'));
    } else {
      onSelectPart('cpu', findSlug('intel-core-i9-14900k')); // LGA1700
      onSelectPart('motherboard', findSlug('asus-rog-crosshair-x670e-hero')); // AM5
      onSelectPart('ram', findSlug('corsair-vengeance-lpx-32gb-ddr4')); // DDR4
      onSelectPart('gpu', findSlug('asus-rog-strix-rtx-4080-super-16gb')); // 358mm
      onSelectPart('case', findSlug('lian-li-a4-h2o-mini-itx')); // Max 322mm, Mini-ITX only
    }
  };

  const handleSaveToFirestore = async () => {
    setStatusBanner(null);
    setIsBusy(true);
    try {
      if (!user) {
        const res = await googleSignIn();
        onAuthUpdated(res.user);
      }
      await savePcBuildToFirestore({
        title: buildTitle,
        cpuSlug: selectedParts.cpu?.slug || '',
        motherboardSlug: selectedParts.motherboard?.slug || '',
        gpuSlug: selectedParts.gpu?.slug || '',
        ramSlug: selectedParts.ram?.slug || '',
        storageSlug: selectedParts.storage?.slug || '',
        psuSlug: selectedParts.psu?.slug || '',
        caseSlug: selectedParts.case?.slug || '',
        coolerSlug: selectedParts.cooler?.slug || '',
        estimatedWattage: report.estimatedWattage,
        compatibilityStatus: report.status,
        totalPriceIrr: report.totalPrice,
      });
      setStatusBanner(
        locale === 'fa'
          ? 'مشخصات اسمبل با موفقیت در پایگاه داده ابری (Firestore) ذخیره شد.'
          : 'PC Build configuration saved to Firestore database.'
      );
    } catch (err: any) {
      setStatusBanner(err?.message || 'Failed to save build');
    } finally {
      setIsBusy(false);
    }
  };

  const handleExportToGoogleDrive = async () => {
    setStatusBanner(null);
    setIsBusy(true);
    try {
      if (!user) {
        const res = await googleSignIn();
        onAuthUpdated(res.user);
      }
      const manifest = {
        title: buildTitle,
        generatedBy: 'Tirazis Computer PC Builder',
        exportedAt: new Date().toISOString(),
        compatibilityReport: report,
        components: Object.fromEntries(
          Object.entries(selectedParts)
            .filter(([, p]) => Boolean(p))
            .map(([slot, p]) => [
              slot,
              {
                name: p!.name,
                sku: p!.sku,
                price: p!.price,
                currency: p!.currency,
                specs: p!.hardwareSpecs,
              },
            ])
        ),
      };
      let createdFile: DriveFileRecord;
      try {
        createdFile = await exportBuildToGoogleDrive(buildTitle, manifest);
      } catch (e: any) {
        if (e?.message === 'NEEDS_GOOGLE_DRIVE_AUTH') {
          const res = await googleSignIn();
          onAuthUpdated(res.user);
          createdFile = await exportBuildToGoogleDrive(buildTitle, manifest);
        } else {
          throw e;
        }
      }
      setDriveFiles((prev) => [createdFile, ...prev]);
      setStatusBanner(
        locale === 'fa'
          ? `فایل JSON مشخصات سیستم (${createdFile.name}) در Google Drive شما ذخیره شد.`
          : `Exported ${createdFile.name} to your Google Drive.`
      );
    } catch (err: any) {
      setStatusBanner(err?.message || 'Google Drive export failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRefreshDriveFiles = async () => {
    setIsBusy(true);
    try {
      const files = await listDriveBuildFiles();
      setDriveFiles(files);
    } catch (err: any) {
      if (err?.message === 'NEEDS_GOOGLE_DRIVE_AUTH') {
        const res = await googleSignIn();
        onAuthUpdated(res.user);
        const files = await listDriveBuildFiles();
        setDriveFiles(files);
      } else {
        setStatusBanner(err?.message || 'Failed to list Google Drive files');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const executeConfirmedDelete = async () => {
    if (!confirmDeleteModal) return;
    setIsBusy(true);
    try {
      if (confirmDeleteModal.type === 'firestore') {
        await deletePcBuildFromFirestore(confirmDeleteModal.id);
      } else {
        await deleteDriveBuildFile(confirmDeleteModal.id);
        setDriveFiles((prev) => prev.filter((f) => f.id !== confirmDeleteModal.id));
      }
      setConfirmDeleteModal(null);
    } catch (err: any) {
      setStatusBanner(err?.message || 'Delete failed');
    } finally {
      setIsBusy(false);
    }
  };

  const activeProducts = Object.values(selectedParts).filter((p): p is Product => Boolean(p));

  return (
    <section className="space-y-8" aria-label="PC Builder Workbench">
      {/* Top Toolbar & Quick Presets */}
      <div className="p-6 rounded-2xl bg-[#111827] border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <span>
              {locale === 'fa'
                ? 'موتور هوشمند اسمبل و بررسی سازگاری قطعات (PC Builder)'
                : 'Deterministic PC Builder & Compatibility Engine'}
            </span>
          </h1>
          <p className="text-xs text-slate-400">
            {locale === 'fa'
              ? 'بررسی خودکار سوکت پردازنده و مادربرد، نسل رم DDR4/DDR5، ابعاد فیزیکی کارت گرافیک و توان پاور بر اساس داده‌های واقعی'
              : 'Verifies CPU/Motherboard sockets, DDR4/DDR5 memory generation, chassis form factors, GPU physical clearance (mm), and PSU headroom.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => applyPreset('compatible-am5')}
            className="px-3.5 py-2 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/60 text-cyan-200 text-xs font-medium transition-colors cursor-pointer"
          >
            {locale === 'fa' ? 'بارگذاری سیستم سازگار AM5 + RTX 4080S' : 'Load Compatible AM5 Workstation'}
          </button>
          <button
            type="button"
            onClick={() => applyPreset('incompatible-test')}
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
          >
            {locale === 'fa' ? 'آزمایش تداخل سوکت و ابعاد' : 'Test Conflict Detection'}
          </button>
        </div>
      </div>

      {/* Main 12-Col Grid: 8 Component Slots (Left 7 cols) + Live Compatibility Inspector (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Component Slots */}
        <div className="lg:col-span-7 space-y-3">
          {SLOT_DEFINITIONS.map(({ slot, labelEn, labelFa }) => {
            const slotOptions = catalog.filter(
              (p) => p.hardwareSpecs.slot === slot && !p.isDemoProduct
            );
            const selected = selectedParts[slot] || null;
            const slotIssues = report.issues.filter((i) => i.slots.includes(slot));

            return (
              <div
                key={slot}
                className={`p-4 rounded-xl bg-[#111827] border transition-colors ${
                  slotIssues.some((i) => i.severity === 'incompatible')
                    ? 'border-rose-500/80'
                    : slotIssues.some((i) => i.severity === 'warning')
                      ? 'border-amber-500/70'
                      : selected
                        ? 'border-cyan-500/40'
                        : 'border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <label
                      htmlFor={`builder-slot-${slot}`}
                      className="block text-xs font-semibold uppercase tracking-wider text-cyan-400"
                    >
                      {locale === 'fa' ? labelFa : labelEn}
                    </label>
                    <select
                      id={`builder-slot-${slot}`}
                      value={selected?.slug || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const found = slotOptions.find((p) => p.slug === val) || null;
                        onSelectPart(slot, found);
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white focus:border-cyan-400 outline-none"
                    >
                      <option value="">
                        {locale === 'fa' ? '— انتخاب قطعه —' : '— Select Component —'}
                      </option>
                      {slotOptions.map((opt) => (
                        <option key={opt.id} value={opt.slug}>
                          {locale === 'fa' ? opt.nameFa || opt.name : opt.name} (
                          {formatCurrency(opt.price, opt.currency, locale)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selected && (
                    <div className="text-end shrink-0">
                      <div className="text-xs font-mono tabular-nums font-bold text-white">
                        {formatCurrency(selected.price, selected.currency, locale)}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {selected.hardwareSpecs.socket && `${selected.hardwareSpecs.socket} · `}
                        {selected.hardwareSpecs.memoryType && `${selected.hardwareSpecs.memoryType} · `}
                        {selected.hardwareSpecs.tdpWatts !== undefined && `${selected.hardwareSpecs.tdpWatts}W`}
                        {selected.hardwareSpecs.psuWatts !== undefined && `${selected.hardwareSpecs.psuWatts}W`}
                      </div>
                    </div>
                  )}
                </div>

                {slotIssues.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-1">
                    {slotIssues.map((iss, idx) => (
                      <div
                        key={`${iss.code}-${idx}`}
                        className={`text-xs flex items-center gap-1.5 ${
                          iss.severity === 'incompatible'
                            ? 'text-rose-400'
                            : iss.severity === 'warning'
                              ? 'text-amber-300'
                              : 'text-slate-400'
                        }`}
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{locale === 'fa' ? iss.messageFa : iss.messageEn}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column: Live Compatibility Verdict, Wattage Meter & Cloud Persistence */}
        <div className="lg:col-span-5 space-y-6 sticky top-20">
          <div className="p-6 rounded-2xl bg-[#111827] border border-slate-800 space-y-5">
            {/* Compatibility Status Header */}
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <div className="text-xs text-slate-400">
                  {locale === 'fa' ? 'وضعیت سازگاری کل سیستم' : 'Compatibility Verdict'}
                </div>
                <div
                  data-testid="compatibility-verdict"
                  className={`mt-1 text-base font-bold flex items-center gap-2 ${
                    report.status === 'compatible'
                      ? 'text-emerald-400'
                      : report.status === 'incompatible'
                        ? 'text-rose-400'
                        : report.status === 'warning'
                          ? 'text-amber-300'
                          : 'text-slate-300'
                  }`}
                >
                  {report.status === 'compatible' && <CheckCircle2 className="w-5 h-5" />}
                  {report.status === 'incompatible' && <AlertCircle className="w-5 h-5" />}
                  {report.status === 'warning' && <AlertTriangle className="w-5 h-5" />}
                  {report.status === 'unverified' && <HelpCircle className="w-5 h-5" />}
                  <span>
                    {report.status === 'compatible'
                      ? locale === 'fa'
                        ? 'کاملاً سازگار (تایید شده)'
                        : 'Compatible — All Checks Passed'
                      : report.status === 'incompatible'
                        ? locale === 'fa'
                          ? 'ناسازگاری سخت‌افزاری شناسایی شد'
                          : 'Incompatible Hardware Detected'
                        : report.status === 'warning'
                          ? locale === 'fa'
                            ? 'سازگار همراه با هشدار فنی'
                            : 'Compatible with Warnings'
                          : locale === 'fa'
                            ? 'بررسی نشده / نیازمند انتخاب قطعات'
                            : 'Unverified — Select Components'}
                  </span>
                </div>
              </div>

              <div className="text-end font-mono tabular-nums">
                <div className="text-xs text-slate-400 flex items-center justify-end gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>{locale === 'fa' ? 'مصرف تخمینی' : 'Est. Load'}</span>
                </div>
                <div className="text-base font-bold text-white">{report.estimatedWattage} W</div>
                <div className="text-[11px] text-slate-400">
                  {locale === 'fa'
                    ? `پاور پیشنهادی: ${report.recommendedPsuWatts}W+`
                    : `Rec. PSU: ${report.recommendedPsuWatts}W+`}
                </div>
              </div>
            </div>

            {/* Verified Constraint Matrix */}
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {locale === 'fa' ? 'ماتریس بررسی محدودیت‌های فنی' : 'Constraint Verification Matrix'}
              </div>
              {report.verifiedChecks.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {locale === 'fa'
                    ? 'پردازنده، مادربرد، رم و کیس را انتخاب کنید تا ماتریس سازگاری محاسبه شود.'
                    : 'Select CPU, Motherboard, RAM, GPU, and Chassis to run automated clearance checks.'}
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {report.verifiedChecks.map((chk) => (
                    <li
                      key={chk.code}
                      className="flex items-center justify-between py-1.5 px-2.5 rounded bg-[#0b0f17] border border-slate-800/80"
                    >
                      <span className="text-slate-300">
                        {locale === 'fa' ? chk.labelFa : chk.labelEn}
                      </span>
                      <span
                        className={`font-mono font-semibold ${
                          chk.passed ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {chk.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Total Price & Add All to Cart */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400">
                  {locale === 'fa'
                    ? `جمع کل (${report.selectedCount} قطعه انتخابی):`
                    : `Build Total (${report.selectedCount} components):`}
                </span>
                <span className="text-lg font-bold font-mono tabular-nums text-cyan-400">
                  {formatCurrency(report.totalPrice, report.currency, locale)}
                </span>
              </div>

              <button
                type="button"
                disabled={activeProducts.length === 0 || report.status === 'incompatible'}
                onClick={() => onAddBuildToCart(activeProducts)}
                className="w-full py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>
                  {locale === 'fa'
                    ? 'افزودن تمامی قطعات انتخابی به سبد خرید'
                    : 'Add Selected Build Components to Cart'}
                </span>
              </button>
            </div>

            {/* Save to Firestore & Export to Google Drive */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <label htmlFor="pc-build-title-input" className="block text-xs text-slate-300">
                {locale === 'fa' ? 'عنوان اسمبل جهت ذخیره ابری یا خروجی Google Drive:' : 'Build Configuration Name:'}
              </label>
              <input
                id="pc-build-title-input"
                type="text"
                maxLength={120}
                value={buildTitle}
                onChange={(e) => setBuildTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={isBusy || activeProducts.length === 0}
                  onClick={handleSaveToFirestore}
                  className="py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{locale === 'fa' ? 'ذخیره در حساب ابری' : 'Save to Account'}</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy || activeProducts.length === 0}
                  onClick={handleExportToGoogleDrive}
                  className="py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <CloudUpload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{locale === 'fa' ? 'خروجی به Google Drive' : 'Export to Google Drive'}</span>
                </button>
              </div>

              {statusBanner && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-cyan-300">
                  {statusBanner}
                </div>
              )}
            </div>
          </div>

          {/* Saved Firestore Builds & Google Drive Files */}
          <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-cyan-400" />
                <span>
                  {locale === 'fa' ? 'اسمبل‌های ذخیره‌شده و فایل‌های Google Drive' : 'Saved Builds & Google Drive'}
                </span>
              </h3>
              {user && (
                <button
                  type="button"
                  onClick={handleRefreshDriveFiles}
                  className="text-xs text-cyan-400 hover:underline cursor-pointer"
                >
                  {locale === 'fa' ? 'بررسی Google Drive' : 'Sync Drive Files'}
                </button>
              )}
            </div>

            {savedBuilds.length === 0 && driveFiles.length === 0 ? (
              <p className="text-xs text-slate-500">
                {locale === 'fa'
                  ? 'هنوز اسمبلی ذخیره نشده است. با حساب گوگل وارد شوید تا لیست اسمبل‌ها همگام‌سازی شود.'
                  : 'No saved builds yet. Sign in with Google to persist builds in Firestore or export to Google Drive.'}
              </p>
            ) : (
              <div className="space-y-2">
                {savedBuilds.map((b) => (
                  <div
                    key={b.id}
                    className="p-2.5 rounded-lg bg-[#0b0f17] border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{b.title}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {b.estimatedWattage}W · {b.compatibilityStatus}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmDeleteModal({ type: 'firestore', id: b.id, name: b.title })
                      }
                      aria-label={`Delete saved build ${b.title}`}
                      className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {driveFiles.map((df) => (
                  <div
                    key={df.id}
                    className="p-2.5 rounded-lg bg-[#0b0f17] border border-emerald-900/50 flex items-center justify-between text-xs"
                  >
                    <div className="truncate flex-1">
                      <div className="font-semibold text-emerald-300 truncate">{df.name}</div>
                      {df.webViewLink && (
                        <a
                          href={df.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-cyan-400 inline-flex items-center gap-1 hover:underline"
                        >
                          <span>Open in Google Drive</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmDeleteModal({ type: 'drive', id: df.id, name: df.name })
                      }
                      aria-label={`Delete Google Drive file ${df.name}`}
                      className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mandatory User Confirmation Dialog for Destructive Operations */}
      {confirmDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
        >
          <div className="w-full max-w-md rounded-xl bg-[#111827] border border-slate-700 p-6 space-y-4">
            <h3 id="confirm-delete-title" className="text-base font-bold text-white">
              {locale === 'fa' ? 'تایید حذف دائمی فایل / اسمبل' : 'Confirm Permanent Deletion'}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              {locale === 'fa'
                ? `آیا از حذف "${confirmDeleteModal.name}" از ${
                    confirmDeleteModal.type === 'drive' ? 'حساب Google Drive خود' : 'پایگاه داده حساب کاربری'
                  } اطمینان دارید؟ این عملیات غیرقابل بازگشت است.`
                : `Are you sure you want to permanently delete "${confirmDeleteModal.name}" from your ${
                    confirmDeleteModal.type === 'drive' ? 'Google Drive' : 'saved account builds'
                  }? This action cannot be undone.`}
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
              >
                {locale === 'fa' ? 'انصراف' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={executeConfirmedDelete}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white cursor-pointer"
              >
                {locale === 'fa' ? 'تایید و حذف' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
