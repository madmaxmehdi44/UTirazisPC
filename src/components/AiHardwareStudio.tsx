import React, { useState } from 'react';
import {
  Bolt,
  BrainCircuit,
  Camera,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  MapPin,
  RefreshCw,
  Send,
} from 'lucide-react';
import { Locale } from '../lib/commerce/types';

interface AiHardwareStudioProps {
  locale: Locale;
}

type AdvisorMode = 'thinking' | 'fast-lite' | 'search-grounding' | 'maps-grounding';

const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'] as const;
const IMAGE_SIZES = ['1K', '2K', '4K'] as const;

export const AiHardwareStudio: React.FC<AiHardwareStudioProps> = ({ locale }) => {
  // 1. Advisor State
  const [advisorMode, setAdvisorMode] = useState<AdvisorMode>('thinking');
  const [advisorPrompt, setAdvisorPrompt] = useState(
    locale === 'fa'
      ? 'توزیع خطوط PCIe 5.0 در مادربرد X670E Hero هنگام نصب همزمان کارت RTX 4080 SUPER و دو اس‌اس‌دی NVMe چگونه است؟'
      : 'Analyze PCIe 5.0 lane bifurcation on ASUS ROG Crosshair X670E Hero when running an RTX 4080 SUPER and dual NVMe M.2 drives.'
  );
  const [advisorResponse, setAdvisorResponse] = useState<{
    model: string;
    text: string;
    groundingChunks: any[];
  } | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorError, setAdvisorError] = useState<string | null>(null);

  // 2. Image Generation State
  const [imgPrompt, setImgPrompt] = useState(
    'Minimalist dark anodized aluminum workstation PC build with custom hardline liquid cooling on a travertine desk, studio photography'
  );
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');
  const [imageSize, setImageSize] = useState<string>('1K');
  const [imageModel, setImageModel] = useState<'gemini-3-pro-image' | 'gemini-nano-banana-2.1'>(
    'gemini-3-pro-image'
  );
  const [generatedImage, setGeneratedImage] = useState<{
    imageUrl: string;
    model: string;
    aspectRatio: string;
    imageSize: string;
  } | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  // 3. Hardware Photo Analyzer State
  const [analyzePreview, setAnalyzePreview] = useState<string | null>(null);
  const [analyzeMime, setAnalyzeMime] = useState<string>('image/jpeg');
  const [analyzePrompt, setAnalyzePrompt] = useState(
    locale === 'fa'
      ? 'مدل قطعه، نوع سوکت یا کانکتور تغذیه و نکات سازگاری این تصویر سخت‌افزاری را بررسی کن.'
      : 'Identify the hardware component, connector/socket type, thermal design, and compatibility requirements.'
  );
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const handleRunAdvisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advisorPrompt.trim()) return;
    setAdvisorLoading(true);
    setAdvisorError(null);
    try {
      const res = await fetch('/api/gemini/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: advisorPrompt,
          mode: advisorMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Advisor request failed');
      }
      setAdvisorResponse(data);
    } catch (err: any) {
      setAdvisorError(err?.message || 'Failed to reach server-side Gemini endpoint');
    } finally {
      setAdvisorLoading(false);
    }
  };

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imgPrompt.trim()) return;
    setImgLoading(true);
    setImgError(null);
    try {
      const res = await fetch('/api/gemini/image-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt,
          aspectRatio,
          imageSize,
          modelChoice: imageModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Image generation failed');
      }
      setGeneratedImage(data);
    } catch (err: any) {
      setImgError(err?.message || 'Image generation failed');
    } finally {
      setImgLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzeMime(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAnalyzePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzePhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!analyzePreview) {
      setAnalyzeError(
        locale === 'fa'
          ? 'لطفاً ابتدا تصویر قطعه یا برچسب مشخصات فنی را بارگذاری کنید.'
          : 'Please upload a hardware photo first.'
      );
      return;
    }
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    try {
      const res = await fetch('/api/gemini/image-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: analyzePreview,
          mimeType: analyzeMime,
          prompt: analyzePrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Image analysis failed');
      }
      setAnalysisResult(data.analysis);
    } catch (err: any) {
      setAnalyzeError(err?.message || 'Hardware photo analysis failed');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Module 1: Multi-Mode Gemini Hardware Architect (High Thinking, Fast Lite, Search Grounding, Maps Grounding) */}
      <section className="p-6 rounded-2xl bg-[#111827] border border-slate-800 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-lg font-bold text-white">
              {locale === 'fa'
                ? 'مشاور مهندسی سخت‌افزار تیرازیس (مبتنی بر Gemini Server-Side)'
                : 'Tirazis AI Workstation Architect & Grounding Lab'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {locale === 'fa'
                ? 'پشتیبانی از حالت تفکر عمیق (ThinkingLevel.HIGH)، پاسخ آنی (Flash-Lite)، جستجوی زنده گوگل و مکان‌یابی مراکز خدمات روی نقشه گوگل'
                : 'Powered by Gemini 4 Argon (High Thinking), Gemini 3.1 Flash Lite (Low-Latency), and Gemini 3.8 Flash (Google Search & Maps Grounding).'}
            </p>
          </div>

          {/* Mode Selector Tabs */}
          <div className="flex flex-wrap gap-1.5 bg-[#0b0f17] p-1.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setAdvisorMode('thinking')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                advisorMode === 'thinking'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>{locale === 'fa' ? 'تفکر عمیق (Argon High)' : 'High Thinking (Argon)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAdvisorMode('fast-lite')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                advisorMode === 'fast-lite'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Bolt className="w-3.5 h-3.5" />
              <span>{locale === 'fa' ? 'پاسخ سریع (Flash Lite)' : 'Low-Latency (Lite)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAdvisorMode('search-grounding')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                advisorMode === 'search-grounding'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{locale === 'fa' ? 'جستجوی گوگل' : 'Search Grounding'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAdvisorMode('maps-grounding')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                advisorMode === 'maps-grounding'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{locale === 'fa' ? 'نقشه گوگل (مراکز سخت‌افزار)' : 'Maps Grounding'}</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleRunAdvisor} className="space-y-3">
          <label htmlFor="ai-advisor-prompt" className="sr-only">
            Hardware Architecture Prompt
          </label>
          <textarea
            id="ai-advisor-prompt"
            rows={3}
            value={advisorPrompt}
            onChange={(e) => setAdvisorPrompt(e.target.value)}
            className="w-full p-3.5 rounded-xl bg-[#0b0f17] border border-slate-700 text-xs text-white leading-relaxed"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={advisorLoading}
              className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              {advisorLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{locale === 'fa' ? 'ارسال پرسش فنی' : 'Run Technical Query'}</span>
            </button>
          </div>
        </form>

        {advisorError && (
          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-700 text-xs text-rose-200">
            {advisorError}
          </div>
        )}

        {advisorResponse && (
          <div className="p-5 rounded-xl bg-[#0b0f17] border border-slate-800 space-y-4">
            <div className="text-xs font-mono text-cyan-400">Model: {advisorResponse.model}</div>
            <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
              {advisorResponse.text}
            </div>

            {/* Grounding Citations (Web & Google Maps) */}
            {advisorResponse.groundingChunks && advisorResponse.groundingChunks.length > 0 && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-400">
                  {locale === 'fa' ? 'منابع و لینک‌های تاییدشده:' : 'Verified Grounding Sources:'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {advisorResponse.groundingChunks.map((chunk: any, idx: number) => {
                    if (chunk.web?.uri) {
                      return (
                        <a
                          key={idx}
                          href={chunk.web.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-cyan-400 hover:underline inline-flex items-center gap-1"
                        >
                          <span>{chunk.web.title || chunk.web.uri}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      );
                    }
                    if (chunk.maps?.uri) {
                      return (
                        <a
                          key={idx}
                          href={chunk.maps.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded bg-emerald-950/50 border border-emerald-700 text-xs text-emerald-300 hover:underline inline-flex items-center gap-1"
                        >
                          <MapPin className="w-3 h-3" />
                          <span>{chunk.maps.title || 'Google Maps Place'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Module 2 & 3 Split Grid: Custom Rig Image Generator + Hardware Photo Analyzer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Module 2: Studio Rig Image Generator (1K/2K/4K + Aspect Ratio Control) */}
        <section className="p-6 rounded-2xl bg-[#111827] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white">
              {locale === 'fa'
                ? 'طراحی بصری شاسی و ورک‌استیشن سفارشی (1K / 2K / 4K)'
                : 'Custom Workstation Studio Visualizer (1K / 2K / 4K)'}
            </h2>
          </div>

          <form onSubmit={handleGenerateImage} className="space-y-4">
            <div>
              <label htmlFor="rig-img-prompt" className="block text-xs text-slate-300 mb-1">
                {locale === 'fa' ? 'توصیف ظاهر سیستم و نورپردازی:' : 'Studio Visualization Prompt:'}
              </label>
              <textarea
                id="rig-img-prompt"
                rows={2}
                value={imgPrompt}
                onChange={(e) => setImgPrompt(e.target.value)}
                className="w-full p-3 rounded-xl bg-[#0b0f17] border border-slate-700 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="rig-model-select" className="block text-xs text-slate-400 mb-1">
                  {locale === 'fa' ? 'مدل تصویرساز' : 'Image Model'}
                </label>
                <select
                  id="rig-model-select"
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white font-mono"
                >
                  <option value="gemini-3-pro-image">gemini-3-pro-image</option>
                  <option value="gemini-nano-banana-2.1">gemini-nano-banana-2.1</option>
                </select>
              </div>

              <div>
                <label htmlFor="rig-size-select" className="block text-xs text-slate-400 mb-1">
                  {locale === 'fa' ? 'رزولوشن خروجی (Size)' : 'Resolution (Size)'}
                </label>
                <select
                  id="rig-size-select"
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white font-mono"
                >
                  {IMAGE_SIZES.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="rig-aspect-select" className="block text-xs text-slate-400 mb-1">
                  {locale === 'fa' ? 'نسبت تصویر (Aspect Ratio)' : 'Aspect Ratio'}
                </label>
                <select
                  id="rig-aspect-select"
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white font-mono"
                >
                  {ASPECT_RATIOS.map((ar) => (
                    <option key={ar} value={ar}>
                      {ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={imgLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {imgLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>{locale === 'fa' ? 'تولید تصویر استودیویی' : 'Generate Studio Image'}</span>
            </button>
          </form>

          {imgError && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-700 text-xs text-rose-200">
              {imgError}
            </div>
          )}

          {generatedImage && (
            <div className="space-y-2 pt-2">
              <div className="rounded-xl overflow-hidden border border-slate-700 bg-[#0b0f17]">
                <img
                  src={generatedImage.imageUrl}
                  alt="Generated custom workstation rig"
                  className="w-full h-auto object-contain max-h-72"
                />
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                {generatedImage.model} · {generatedImage.imageSize} · {generatedImage.aspectRatio}
              </div>
            </div>
          )}
        </section>

        {/* Module 3: Hardware Photo & Label Analyzer (gemini-4-argon) */}
        <section className="p-6 rounded-2xl bg-[#111827] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white">
              {locale === 'fa'
                ? 'تشخیص هوشمند قطعه و برچسب فنی از روی عکس (Gemini 4 Argon)'
                : 'Hardware Component & Spec Label Photo Analyzer (Gemini 4 Argon)'}
            </h2>
          </div>

          <form onSubmit={handleAnalyzePhoto} className="space-y-4">
            <div>
              <label htmlFor="hw-photo-upload" className="block text-xs text-slate-300 mb-1">
                {locale === 'fa'
                  ? 'بارگذاری تصویر قطعه، سوکت مادربرد یا جدول توان پاور:'
                  : 'Upload Hardware Photo (Motherboard Socket, GPU, or PSU Label):'}
              </label>
              <input
                id="hw-photo-upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="w-full text-xs text-slate-300 file:me-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-cyan-300 hover:file:bg-slate-700"
              />
            </div>

            {analyzePreview && (
              <div className="h-36 rounded-lg bg-[#0b0f17] border border-slate-800 overflow-hidden flex items-center justify-center">
                <img
                  src={analyzePreview}
                  alt="Uploaded hardware preview"
                  className="max-h-full object-contain"
                />
              </div>
            )}

            <div>
              <label htmlFor="hw-analyze-prompt" className="block text-xs text-slate-300 mb-1">
                {locale === 'fa' ? 'دستور تحلیل تصویر:' : 'Analysis Instruction:'}
              </label>
              <input
                id="hw-analyze-prompt"
                type="text"
                value={analyzePrompt}
                onChange={(e) => setAnalyzePrompt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f17] border border-slate-700 text-xs text-white"
              />
            </div>

            <button
              type="submit"
              disabled={analyzeLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {analyzeLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>{locale === 'fa' ? 'تحلیل فنی تصویر با Gemini 4 Argon' : 'Analyze Photo with Gemini 4 Argon'}</span>
            </button>
          </form>

          {analyzeError && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-700 text-xs text-rose-200">
              {analyzeError}
            </div>
          )}

          {analysisResult && (
            <div className="p-4 rounded-xl bg-[#0b0f17] border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
              {analysisResult}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
