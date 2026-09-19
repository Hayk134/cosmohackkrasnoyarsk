import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Copy,
  Check,
  Briefcase,
  Microscope,
  Trees,
  MapPin,
  Scale,
  FileText,
  Shield,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import {
  askGeminiAI,
  AIAskResponse,
  SiteInfo,
  calculateTaxShield,
  protectTaxShieldBudget,
  TaxShieldCalculation,
  TaxShieldProtectResponse,
} from '../api/client';
import { PersonaMode } from './b2b/B2BSuiteModal';
import { exportAIReportPDF, exportTaxShieldPDF } from '../pdfExport';
import { formatNumber, formatRub } from '../utils';

export const PRESET_INNS = [
  { inn: '3528000597', name: 'Северсталь', tag: 'Металлургия', emissions: '80 000 т' },
  { inn: '8401005730', name: 'Норникель', tag: 'Горнодобыча', emissions: '140 000 т' },
  { inn: '6315376946', name: 'Т Плюс (ТЭЦ)', tag: 'Энергетика', emissions: '65 000 т' },
  { inn: '4823006703', name: 'НЛМК', tag: 'Металлургия', emissions: '110 000 т' },
  { inn: '7721230290', name: 'ЕвроХим', tag: 'Химия/Удобрения', emissions: '95 000 т' },
  { inn: '5504036333', name: 'Газпром нефть', tag: 'Нефтепереработка', emissions: '125 000 т' },
  { inn: '7706107510', name: 'Роснефть', tag: 'Нефтегаз', emissions: '180 000 т' },
  { inn: '7707083893', name: 'Сбербанк (ESG)', tag: 'Финансы/ЦОД', emissions: '45 000 т' },
];

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  sites?: SiteInfo[];
  siteName?: string;
  areaHa?: number;
  currentPersona: PersonaMode;
  onSelectPersona?: (persona: PersonaMode) => void;
  onSelectSite?: (siteId: string) => void;
}

// Простой и аккуратный рендерер Markdown текста
const FormattedMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');

  const parseInline = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-bold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="space-y-2 text-zinc-200 text-xs sm:text-[13px] leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h3
              key={idx}
              className="text-sm sm:text-base font-bold text-white mt-3 pt-2 border-t border-zinc-800/80 flex items-center gap-1.5"
            >
              {parseInline(trimmed.replace(/^###\s+/, ''))}
            </h3>
          );
        }

        if (trimmed.startsWith('#### ')) {
          return (
            <h4
              key={idx}
              className="text-xs sm:text-sm font-bold text-[#c8d4be] mt-2 mb-0.5"
            >
              {parseInline(trimmed.replace(/^####\s+/, ''))}
            </h4>
          );
        }

        if (trimmed.startsWith('---')) {
          return <hr key={idx} className="border-zinc-800 my-2" />;
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-2 sm:ml-4">
              <span className="text-[#a5b997] font-bold text-xs mt-0.5">•</span>
              <span className="flex-1 text-zinc-300">
                {parseInline(trimmed.replace(/^[-*]\s+/, ''))}
              </span>
            </div>
          );
        }

        if (/^\d+\.\s+/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s+(.*)/);
          return (
            <div key={idx} className="flex items-start gap-2 ml-2 sm:ml-4">
              <span className="font-mono text-[#c8d4be] text-xs font-bold mt-0.5">
                {match ? match[1] : '1'}.
              </span>
              <span className="flex-1 text-zinc-300">
                {parseInline(match ? match[2] : trimmed)}
              </span>
            </div>
          );
        }

        return <p key={idx}>{parseInline(line)}</p>;
      })}
    </div>
  );
};

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  siteId,
  sites = [],
  siteName = 'Текущий участок',
  areaHa = 100,
  currentPersona,
  onSelectPersona,
  onSelectSite,
}) => {
  const [mode, setMode] = useState<'single' | 'compare' | 'tax_shield'>('single');
  const [activeSiteId, setActiveSiteId] = useState<string>(siteId);
  const [activeSiteBId, setActiveSiteBId] = useState<string>('');
  const [activePersona, setActivePersona] = useState<PersonaMode>(currentPersona);
  const [question, setQuestion] = useState<string>('');
  const [lastAskedQuestion, setLastAskedQuestion] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<AIAskResponse | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // B2B Налоговый щит state
  const [innInput, setInnInput] = useState<string>('');
  const [taxCalc, setTaxCalc] = useState<TaxShieldCalculation | null>(null);
  const [protectRes, setProtectRes] = useState<TaxShieldProtectResponse | null>(null);
  const [protecting, setProtecting] = useState<boolean>(false);

  useEffect(() => {
    if (siteId) setActiveSiteId(siteId);
    // Предзаполняем участок Б вторым доступным участком
    if (sites.length > 1) {
      const other = sites.find((s) => s.id !== siteId) || sites[1];
      setActiveSiteBId(other.id);
    }
  }, [siteId, isOpen, sites]);

  useEffect(() => {
    if (currentPersona) setActivePersona(currentPersona);
  }, [currentPersona, isOpen]);

  if (!isOpen) return null;

  const currentSite = sites.find((s) => s.id === activeSiteId);
  const currentSiteArea = currentSite?.area_ha ?? areaHa;
  const currentSiteName = currentSite?.name ?? siteName;

  const siteB = sites.find((s) => s.id === activeSiteBId);
  const siteBName = siteB?.name ?? 'Участок Б';

  const handleSiteChange = (newSiteId: string) => {
    setActiveSiteId(newSiteId);
    onSelectSite?.(newSiteId);
  };

  const handlePersonaChange = (newPersona: PersonaMode) => {
    setActivePersona(newPersona);
    onSelectPersona?.(newPersona);
  };

  const handleSend = async (customQuery?: string, customInn?: string) => {
    const q = (customQuery || question).trim() || (mode === 'tax_shield' ? 'Рассчитать списание эко-платежей по 296-ФЗ' : '');
    if (!q || loading) return;

    if (mode === 'tax_shield') {
      const rawInn = (customInn || innInput).trim();
      const cleanInn = rawInn.replace(/\D/g, '');
      if (!cleanInn || cleanInn.length !== 10) {
        setError(
          `Неверный ИНН: ИНН юридического лица в РФ должен содержать ровно 10 цифр (введено: ${cleanInn.length} знаков: "${rawInn}"). Выберите предприятие из государственного реестра 296-ФЗ или проверьте реквизиты.`
        );
        setTaxCalc(null);
        setResponse(null);
        setProtectRes(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    setLastAskedQuestion(q);

    try {
      if (mode === 'tax_shield') {
        const rawInn = (customInn || innInput).trim();
        const targetInn = rawInn.replace(/\D/g, '');
        setProtectRes(null);
        const [tRes, aiRes] = await Promise.all([
          calculateTaxShield(targetInn, activeSiteId),
          askGeminiAI({
            question: q,
            site_id: activeSiteId,
            persona: 'tax_shield',
            area_ha: currentSiteArea,
            inn: targetInn,
          }),
        ]);
        setTaxCalc(tRes);
        setResponse(aiRes);
      } else if (mode === 'compare') {
        setTaxCalc(null);
        setProtectRes(null);
        const res = await askGeminiAI({
          question: q,
          site_id: activeSiteId,
          site_b_id: activeSiteBId || undefined,
          persona: activePersona,
          area_ha: currentSiteArea,
          is_compare: true,
        });
        setResponse(res);
      } else {
        setTaxCalc(null);
        setProtectRes(null);
        const res = await askGeminiAI({
          question: q,
          site_id: activeSiteId,
          persona: activePersona,
          area_ha: currentSiteArea,
          is_compare: false,
        });
        setResponse(res);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка обработки запроса');
      if (mode === 'tax_shield') {
        setTaxCalc(null);
        setResponse(null);
        setProtectRes(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProtectBudget = async () => {
    if (!innInput.trim() || protecting) return;
    setProtecting(true);
    setError(null);
    try {
      const cleanInn = innInput.replace(/\D/g, '');
      const res = await protectTaxShieldBudget(cleanInn, activeSiteId);
      setProtectRes(res);
    } catch (err: any) {
      setError(err.message || 'Ошибка бронирования квот в Реестре');
      setProtectRes(null);
    } finally {
      setProtecting(false);
    }
  };

  const handleSelectPresetInn = (presetInn: string, presetName: string) => {
    setInnInput(presetInn);
    setProtectRes(null);
    const q = `Рассчитать налоговый щит и списание платежей по 296-ФЗ для ${presetName}`;
    setQuestion(q);
    handleSend(q, presetInn);
  };

  const handleCopy = () => {
    if (!response?.answer) return;
    navigator.clipboard.writeText(response.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPDF = () => {
    if (!response?.answer) return;
    exportAIReportPDF({
      question: lastAskedQuestion || question || 'Климатический анализ Kosmo·MRV',
      answer: response.answer,
      persona: activePersona,
      siteNameA: currentSiteName,
      siteNameB: mode === 'compare' ? siteBName : undefined,
      isCompare: mode === 'compare',
      modelUsed: response.model_used,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-zinc-950/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[94dvh] liquid-glass rounded-2xl shadow-2xl flex flex-col overflow-hidden bg-zinc-950/95 border border-zinc-800">
        {/* Шапка модального окна AI */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3.5 border-b border-zinc-800/80 bg-zinc-950/90 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-[#3A4831] text-[#c8d4be] shadow-sm shrink-0">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-sm sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>
                    {mode === 'tax_shield'
                      ? 'B2B Налоговый щит'
                      : 'Климатический AI-Анализ'}
                  </span>
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-medium border ${
                    mode === 'tax_shield'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 font-bold shadow-sm'
                      : 'bg-[#3A4831] text-[#c8d4be] border-[#5c744f]/40'
                  }`}
                >
                  {mode === 'tax_shield'
                    ? '296-ФЗ Арбитраж'
                    : activePersona === 'investor'
                    ? 'Инвестор'
                    : activePersona === 'ecologist'
                    ? 'Эколог'
                    : 'Пользователь'}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-zinc-400 line-clamp-1">
                {mode === 'tax_shield'
                  ? 'Автоматический расчет экономии налогов завода через лесной пул'
                  : 'Спутниковые данные и климатические модели IPCC CMIP6'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white transition shrink-0"
            title="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ПАНЕЛЬ УПРАВЛЕНИЯ: РЕЖИМ (1 УЧАСТОК / СРАВНИТЬ 2 / НАЛОГОВЫЙ ЩИТ) + ВЫБОР УЧАСТКОВ / ИНН */}
        <div className="flex flex-col gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-zinc-900/60 border-b border-zinc-800/80 text-xs shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Переключение режима: Один участок / Сравнить 2 участка / B2B Налоговый щит */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center p-0.5 rounded-xl bg-zinc-950/80 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode('single');
                    setTaxCalc(null);
                    setProtectRes(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    mode === 'single'
                      ? 'bg-[#3A4831] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Участок</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('compare');
                    setTaxCalc(null);
                    setProtectRes(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    mode === 'compare'
                      ? 'bg-[#3A4831] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Scale className="h-3.5 w-3.5 text-[#c8d4be]" />
                  <span>Сравнить</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('tax_shield');
                    if (!question || question.includes('Климатический')) {
                      setQuestion('Рассчитать налоговый арбитраж и списание эко-платежей завода по 296-ФЗ');
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    mode === 'tax_shield'
                      ? 'bg-emerald-600 text-white shadow-md ring-1 ring-emerald-400 font-bold'
                      : 'text-emerald-400/90 hover:text-emerald-300 hover:bg-zinc-900'
                  }`}
                >
                  <Shield className="h-3.5 w-3.5 text-emerald-300" />
                  <span>Налоговый щит</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-black/40 text-emerald-200 rounded">
                    ИНН
                  </span>
                </button>
              </div>

              {/* Селекторы участков / лесного пула */}
              {mode === 'single' ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400 font-medium whitespace-nowrap">Участок:</span>
                  <select
                    value={activeSiteId}
                    onChange={(e) => handleSiteChange(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 text-xs text-[#c8d4be] font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#7f9870] cursor-pointer shadow-sm max-w-[220px] truncate"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id} className="bg-zinc-950 text-zinc-200">
                        {s.name} ({s.area_ha.toFixed(0)} га)
                      </option>
                    ))}
                  </select>
                </div>
              ) : mode === 'compare' ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 font-medium whitespace-nowrap">Участок А:</span>
                    <select
                      value={activeSiteId}
                      onChange={(e) => handleSiteChange(e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 text-xs text-[#c8d4be] font-bold rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#7f9870] cursor-pointer shadow-sm max-w-[170px] truncate"
                    >
                      {sites.map((s) => (
                        <option key={s.id} value={s.id} className="bg-zinc-950 text-zinc-200">
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 font-medium whitespace-nowrap">Участок Б:</span>
                    <select
                      value={activeSiteBId}
                      onChange={(e) => setActiveSiteBId(e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 text-xs text-[#c8d4be] font-bold rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#7f9870] cursor-pointer shadow-sm max-w-[170px] truncate"
                    >
                      {sites.map((s) => (
                        <option key={s.id} value={s.id} className="bg-zinc-950 text-zinc-200">
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400 font-medium whitespace-nowrap">Лесной оффсетный пул:</span>
                  <select
                    value={activeSiteId}
                    onChange={(e) => handleSiteChange(e.target.value)}
                    className="bg-zinc-900 border border-emerald-700/60 text-xs text-emerald-300 font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-400 cursor-pointer shadow-sm max-w-[240px] truncate"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id} className="bg-zinc-950 text-zinc-200">
                        {s.name} ({s.area_ha.toFixed(0)} га)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Плашка с выбором профиля (для обычных режимов) */}
            {mode !== 'tax_shield' && (
              <div className="flex items-center gap-1 bg-zinc-950/80 p-1 rounded-xl border border-zinc-800 shrink-0">
                <button
                  type="button"
                  onClick={() => handlePersonaChange('investor')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    activePersona === 'investor'
                      ? 'bg-[#3A4831] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Briefcase className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Инвестор</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePersonaChange('ecologist')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    activePersona === 'ecologist'
                      ? 'bg-[#3A4831] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Microscope className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Эколог</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePersonaChange('user')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    activePersona === 'user'
                      ? 'bg-[#3A4831] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Trees className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Пользователь</span>
                </button>
              </div>
            )}
          </div>

          {/* Строка ввода ИНН предприятия + быстрые пресеты заводов */}
          {mode === 'tax_shield' && (
            <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5 shrink-0">
                  <Building2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>ИНН завода:</span>
                </span>
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <input
                    type="text"
                    value={innInput}
                    onChange={(e) => setInnInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="Введите 10 цифр ИНН"
                    className="flex-1 sm:w-44 bg-zinc-950 border border-emerald-500/60 text-xs text-white font-mono font-bold rounded-lg px-2.5 py-1.5 sm:py-1 focus:outline-none focus:border-emerald-400 shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => handleSend(undefined, innInput)}
                    disabled={loading || !innInput.trim()}
                    className="px-3 py-1.5 sm:py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm whitespace-nowrap shrink-0"
                  >
                    Рассчитать
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                <span className="text-[11px] text-zinc-500 mr-1">Реестр 296-ФЗ:</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {PRESET_INNS.map((p) => (
                    <button
                      key={p.inn}
                      type="button"
                      onClick={() => handleSelectPresetInn(p.inn, p.name)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition border ${
                        innInput === p.inn
                          ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900'
                      }`}
                      title={`${p.name} (${p.tag}) · Выбросы: ${p.emissions}/год`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Основной блок с ответом AI */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 custom-scrollbar text-zinc-200 text-xs sm:text-sm leading-relaxed">
          {error && (
            <div className="p-4 mb-4 rounded-xl bg-rose-950/70 border border-rose-600/80 text-rose-200 text-xs sm:text-sm flex items-start gap-3 shadow-xl">
              <span className="text-xl shrink-0 leading-none">❌</span>
              <div className="flex-1 space-y-1">
                <p className="font-bold text-rose-100 text-sm">
                  {error.includes('Неверный ИНН') ? 'Неверный ИНН' : 'Ошибка выполнения запроса'}
                </p>
                <p className="text-rose-200/90 text-xs leading-relaxed">{error}</p>
                {mode === 'tax_shield' && (
                  <p className="text-[11px] text-rose-300/80 pt-1 border-t border-rose-900/60">
                    💡 Подсказка: выберите проверенное предприятие из списка выше (Северсталь, Норникель, Т Плюс, НЛМК, ЕвроХим, Газпром нефть, Роснефть) или введите корректный 10-значный ИНН.
                  </p>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              <p className="text-xs text-zinc-300">
                {mode === 'tax_shield'
                  ? `Расчет налогового арбитража по 296-ФЗ для предприятия (ИНН ${innInput})...`
                  : mode === 'compare'
                  ? `Сравнительный AI-анализ: ${currentSiteName} и ${siteBName}...`
                  : `Анализ климатических моделей IPCC CMIP6 для участка ${currentSiteName}...`}
              </p>
              <span className="text-[10px] text-zinc-500 font-mono">
                {mode === 'tax_shield'
                  ? 'Режим: B2B Налоговый щит (296-ФЗ / Росприроднадзор)'
                  : `Режим: ${
                      activePersona === 'investor'
                        ? 'Инвестиции и окупаемость'
                        : activePersona === 'ecologist'
                        ? 'Экология и ГОСТ'
                        : 'Собственник поля'
                    }`}
              </span>
            </div>
          ) : response ? (
            <div className="space-y-4">
              {/* B2B Налоговый щит Терминал */}
              {taxCalc && (
                <div className="p-4 rounded-xl bg-gradient-to-b from-zinc-900/95 to-zinc-950 border border-emerald-500/40 shadow-xl space-y-3.5">
                  {/* Шапка карточки предприятия */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
                    <div className="flex items-start gap-2.5">
                      <div className="p-2 rounded-xl bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 shrink-0">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                          <span>{taxCalc.company_name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-emerald-300 font-bold">
                            ИНН {taxCalc.inn}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {taxCalc.industry} · {taxCalc.region} · {taxCalc.nvos_category}
                        </div>
                      </div>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <div className="text-[10px] text-zinc-400 uppercase font-medium">Квотируемый объем выбросов</div>
                      <div className="text-base font-bold text-white font-mono">
                        {formatNumber(taxCalc.annual_emissions_t_co2, 0)} т CO₂/год
                      </div>
                    </div>
                  </div>

                  {/* 3 Ключевые карточки Налогового арбитража */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* 1. Платеж государству */}
                    <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-rose-900/40">
                      <div className="text-[11px] text-rose-300/80 mb-1 flex items-center justify-between">
                        <span>Налог государству (без квот)</span>
                        <span className="text-[10px] font-mono opacity-80">1 500 ₽/т</span>
                      </div>
                      <div className="text-lg sm:text-xl font-bold text-rose-400 font-mono">
                        {formatRub(taxCalc.statutory_tax_rub)}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-1">Плата за НВОС и штрафы 296-ФЗ</div>
                    </div>

                    {/* 2. Покрытие лесными квотами */}
                    <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-emerald-800/40">
                      <div className="text-[11px] text-emerald-300/80 mb-1 flex items-center justify-between">
                        <span>Через лесные квоты полигона</span>
                        <span className="text-[10px] font-mono opacity-80">{taxCalc.discount_quota_price_rub.toFixed(0)} ₽/т</span>
                      </div>
                      <div className="text-lg sm:text-xl font-bold text-[#c8d4be] font-mono">
                        {formatRub(taxCalc.forest_quota_cost_rub)}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-1">Оффсет: {taxCalc.allocated_site_name}</div>
                    </div>

                    {/* 3. Чистая экономия завода */}
                    <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-950/60 to-zinc-950 border border-emerald-500/60 ring-1 ring-emerald-500/20 shadow-lg">
                      <div className="text-[11px] text-emerald-300 mb-1 flex items-center justify-between font-semibold">
                        <span>Чистая прибыль предприятия</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          -{taxCalc.savings_pct}%
                        </span>
                      </div>
                      <div className="text-lg sm:text-xl font-extrabold text-emerald-300 font-mono">
                        +{formatRub(taxCalc.net_savings_rub)}
                      </div>
                      <div className="text-[10px] text-emerald-400/80 mt-1">
                        Комиссия платформы (3.5%): {formatRub(taxCalc.platform_commission_rub)}
                      </div>
                    </div>
                  </div>

                  {/* Уведомление об успешной брони в реестре */}
                  {protectRes && (
                    <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/80 text-emerald-200 text-xs flex items-center gap-2.5 animate-in fade-in">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                      <div className="flex-1">
                        <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                          <span>Бюджет успешно защищен! Квоты забронированы</span>
                          <span className="font-mono text-[10px] bg-emerald-900/90 px-2 py-0.5 rounded text-emerald-300">
                            {protectRes.certificate_id}
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-300/80 mt-0.5">
                          Запись реестра: {protectRes.registry_record_id} · Хеш расчета: {protectRes.calculation_hash}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Кнопки действий: Защитить бюджет + Скачать пакет PDF */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={handleProtectBudget}
                      disabled={protecting || Boolean(protectRes)}
                      className="flex items-center gap-2 rounded-xl px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-xs shadow-lg transition"
                    >
                      {protecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Shield className="h-4 w-4 text-emerald-200" />
                      )}
                      <span>{protectRes ? 'Бюджет предприятия защищен' : 'Защитить бюджет предприятия'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => exportTaxShieldPDF(taxCalc, protectRes)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-semibold text-xs border border-zinc-700 transition"
                    >
                      <FileText className="h-4 w-4 text-[#a5b997]" />
                      <span>Скачать пакет документов (PDF)</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1.5 font-mono text-[#c8d4be]">
                  <Sparkles className="h-3.5 w-3.5 text-[#a5b997]" />
                  {response.model_used}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportPDF}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 bg-[#3A4831] hover:bg-[#4a5f3f] text-[#c8d4be] hover:text-white transition text-[11px] font-semibold shadow-sm"
                    title="Экспортировать ответ нейросети в PDF"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Экспорт в PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition text-[11px]"
                    title="Копировать текст"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Копировать</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Аккуратно отформатированный вывод Markdown без сырых решёток */}
              <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80 shadow-inner">
                <FormattedMarkdown content={response.answer} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 text-center text-zinc-400 gap-2">
              <div className="p-3 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                {mode === 'tax_shield' ? (
                  <Shield className="h-6 w-6" />
                ) : (
                  <Sparkles className="h-6 w-6 text-[#a5b997]" />
                )}
              </div>
              <h3 className="text-sm font-bold text-white">
                {mode === 'tax_shield'
                  ? 'Введите ИНН предприятия для списания эко-платежей'
                  : 'Задайте вопрос нейросети'}
              </h3>
              <p className="text-xs text-zinc-400 max-w-md">
                {mode === 'tax_shield'
                  ? 'Введите ИНН любого завода или выберите из списка выше (Северсталь, Норникель, Т Плюс) — система за 5 секунд рассчитает чистую экономию десятков миллионов рублей по 296-ФЗ.'
                  : mode === 'compare'
                  ? 'Выберите 2 участка для сравнения и профиль, введите интересующий вопрос и нажмите «Спросить».'
                  : 'Выберите участок и профиль, введите интересующий вопрос и нажмите «Спросить».'}
              </p>
            </div>
          )}
        </div>

        {/* Панель ввода вопроса */}
        <div className="p-3.5 border-t border-zinc-800/80 bg-zinc-950/90 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                mode === 'tax_shield'
                  ? `Вопрос по оптимизации налогов по 296-ФЗ для ИНН ${innInput}...`
                  : 'Введите ваш вопрос...'
              }
              disabled={loading}
              className="flex-1 rounded-xl bg-zinc-900 border border-zinc-700 px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#7f9870] shadow-inner"
            />
            <button
              type="submit"
              disabled={loading || (!question.trim() && mode !== 'tax_shield')}
              className={`flex items-center justify-center gap-2 rounded-xl text-white px-4 py-2.5 text-xs sm:text-sm font-bold transition shadow-md shrink-0 ${
                mode === 'tax_shield'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-[#3A4831] hover:bg-[#4a5f3f]'
              } disabled:opacity-50`}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {mode === 'tax_shield' ? <Shield className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  <span className="hidden sm:inline">
                    {mode === 'tax_shield' ? 'Рассчитать (5 сек)' : 'Спросить'}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

