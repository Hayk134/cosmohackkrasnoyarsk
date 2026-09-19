import React, { useState, useEffect, useCallback } from 'react';
import {
  Flame,
  Sun,
  Bug,
  Wind,
  Zap,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  TrendingDown,
  Clock,
  Coins,
  FileText,
  X,
  Loader2,
  Layers,
  Sparkles,
  Split,
  Trash2,
  Send,
  Bookmark,
} from 'lucide-react';
import {
  SiteInfo,
  StressTestResponse,
  runStressTest,
  generateCustomScenario,
  GeneratedScenario,
} from '../api/client';
import { exportStressTestPDF } from '../pdfExport';
import { formatNumber, formatRub } from '../utils';

interface StressTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  sites?: SiteInfo[];
  siteName?: string;
  areaHa?: number;
  onSelectSite?: (siteId: string) => void;
  onLaunchSwipe?: (targetYear?: number) => void;
}

const PRESET_SCENARIOS = [
  {
    id: 'drought_2027',
    label: 'Засуха 2027 года',
    icon: Sun,
    desc: 'Дефицит влаги в почве, усыхание хвои и отпад древостоя',
    badge: 'Засуха',
  },
  {
    id: 'wildfire',
    label: 'Лесной пожар',
    icon: Flame,
    desc: 'Выгорание подстилки и пирогенные потери биомассы',
    badge: 'Пожар',
  },
  {
    id: 'pest_outbreak',
    label: 'Короед-типограф',
    icon: Bug,
    desc: 'Вспышка вредителей и очаговая дефолиация хвойных',
    badge: 'Вредители',
  },
  {
    id: 'windthrow',
    label: 'Шквальный ветровал',
    icon: Wind,
    desc: 'Механический вывал полога при штормовом ветре',
    badge: 'Шторм',
  },
  {
    id: 'combined',
    label: 'Засуха + Пожар',
    icon: Zap,
    desc: 'Комплексный шок: экстремальная засуха с возгоранием',
    badge: 'Комплексный',
  },
];

interface TrajectoryPoint {
  year: number;
  label: string;
  isShockYear: boolean;
  baseAgb: number;
  baseCo2: number;
  stressAgb: number;
  stressCo2: number;
  deltaAgb: number;
  deltaCo2: number;
  lossPct: number;
  status: string;
  badgeColor: string;
}

const getTrajectoryData = (d: StressTestResponse): TrajectoryPoint[] => {
  const b0 = d.initial_metrics.agb_t_ha;
  const area = d.area_ha;
  const co2Factor = area * 0.5 * (44 / 12);
  const lossFraction = (d.shock_impact.agb_loss_pct || 15.0) / 100.0;
  const years = [2024, 2025, 2026, 2027, 2028, 2030, 2035];

  return years.map((y) => {
    let baseAgb: number;
    let stressAgb: number;
    let isShockYear = false;
    let status = '';
    let badgeColor = '';

    if (y === 2024) baseAgb = b0;
    else if (y === 2025) baseAgb = b0 + 2.2;
    else if (y === 2026) baseAgb = b0 + 4.5;
    else if (y === 2027) baseAgb = b0 + 6.8;
    else if (y === 2028) baseAgb = b0 + 9.1;
    else if (y === 2030) baseAgb = b0 + 13.5;
    else baseAgb = b0 + 24.5;

    if (y <= 2026) {
      stressAgb = baseAgb;
      status = y === 2026 ? 'Пик полога до шока' : 'Штатный прирост';
      badgeColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40';
    } else if (y === 2027) {
      isShockYear = true;
      stressAgb = (b0 + 4.5) * (1.0 - lossFraction);
      status = `⚡ Шок катастрофы (-${d.shock_impact.agb_loss_pct}%)`;
      badgeColor = 'text-rose-400 bg-rose-950/50 border-rose-800/50';
    } else if (y === 2028) {
      const s27 = (b0 + 4.5) * (1.0 - lossFraction);
      stressAgb = s27 * 0.96;
      status = 'Остаточный шок (дефолиация)';
      badgeColor = 'text-amber-400 bg-amber-950/50 border-amber-800/50';
    } else if (y === 2030) {
      const s27 = (b0 + 4.5) * (1.0 - lossFraction);
      stressAgb = s27 * 0.96 + 8.5;
      status = 'Регенерация подроста';
      badgeColor = 'text-sky-400 bg-sky-950/50 border-sky-800/50';
    } else {
      const s27 = (b0 + 4.5) * (1.0 - lossFraction);
      stressAgb = Math.min(s27 * 0.96 + 24.0, baseAgb * 0.96);
      status = 'Восстановление экосистемы';
      badgeColor = 'text-emerald-400 bg-emerald-950/50 border-emerald-800/50';
    }

    const baseCo2 = baseAgb * co2Factor;
    const stressCo2 = stressAgb * co2Factor;
    const deltaAgb = stressAgb - baseAgb;
    const deltaCo2 = stressCo2 - baseCo2;
    const lossPct = baseAgb > 0 ? ((baseAgb - stressAgb) / baseAgb) * 100 : 0;

    return {
      year: y,
      label: `${y}`,
      isShockYear,
      baseAgb: Math.round(baseAgb * 10) / 10,
      baseCo2: Math.round(baseCo2),
      stressAgb: Math.round(stressAgb * 10) / 10,
      stressCo2: Math.round(stressCo2),
      deltaAgb: Math.round(deltaAgb * 10) / 10,
      deltaCo2: Math.round(deltaCo2),
      lossPct: Math.round(lossPct * 10) / 10,
      status,
      badgeColor,
    };
  });
};

const LOCAL_STORAGE_KEY = 'kosmo_mrv_custom_stress_scenarios';

export const StressTestModal: React.FC<StressTestModalProps> = ({
  isOpen,
  onClose,
  siteId,
  sites = [],
  siteName = 'Текущий участок',
  areaHa = 1000,
  onSelectSite,
  onLaunchSwipe,
}) => {
  const [activeSiteId, setActiveSiteId] = useState<string>(siteId);
  const [scenarioType, setScenarioType] = useState<string>('drought_2027');
  const [activeCustomScenario, setActiveCustomScenario] = useState<GeneratedScenario | null>(null);
  const [customScenarios, setCustomScenarios] = useState<GeneratedScenario[]>([]);

  const [severity, setSeverity] = useState<number>(0.5);
  const [bufferPoolPct, setBufferPoolPct] = useState<number>(20.0);
  const [carbonPriceRub] = useState<number>(1500.0);

  // Selected year and metric for comparison chart
  const [selectedChartYear, setSelectedChartYear] = useState<number>(2027);
  const [chartMetric, setChartMetric] = useState<'agb' | 'co2'>('agb');

  // AI Scenario Generator state
  const [showAiCreator, setShowAiCreator] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [aiGenError, setAiGenError] = useState<string | null>(null);

  const [data, setData] = useState<StressTestResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved custom scenarios from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        setCustomScenarios(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to parse saved scenarios', e);
    }
  }, []);

  const saveCustomScenariosToStorage = (list: GeneratedScenario[]) => {
    setCustomScenarios(list);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to save scenarios', e);
    }
  };

  useEffect(() => {
    if (siteId) setActiveSiteId(siteId);
  }, [siteId, isOpen]);

  const fetchSimulation = useCallback(
    async (sId: string, sType: string, sev: number, buf: number, customSc?: GeneratedScenario | null) => {
      setLoading(true);
      setError(null);
      try {
        const cur = sites.find((s) => s.id === sId);
        const res = await runStressTest({
          site_id: sId,
          scenario_type: sType,
          severity: sev,
          buffer_pool_pct: buf,
          carbon_price_rub: carbonPriceRub,
          custom_area_ha: cur?.area_ha ?? areaHa,
          custom_site_name: cur?.name ?? siteName,
          custom_scenario: customSc || undefined,
        });
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Ошибка симуляции стресс-теста');
      } finally {
        setLoading(false);
      }
    },
    [sites, areaHa, siteName, carbonPriceRub]
  );

  useEffect(() => {
    if (isOpen) {
      fetchSimulation(activeSiteId, scenarioType, severity, bufferPoolPct, activeCustomScenario);
    }
  }, [isOpen, activeSiteId, scenarioType, severity, bufferPoolPct, activeCustomScenario, fetchSimulation]);

  if (!isOpen) return null;

  const isSurvived = data?.shock_impact.buffer_status === 'SURVIVED';

  const handleSiteChange = (newSiteId: string) => {
    setActiveSiteId(newSiteId);
    onSelectSite?.(newSiteId);
  };

  const handleSelectPresetScenario = (id: string) => {
    setActiveCustomScenario(null);
    setScenarioType(id);
  };

  const handleSelectCustomScenario = (sc: GeneratedScenario) => {
    setScenarioType(sc.id);
    setActiveCustomScenario(sc);
  };

  const handleDeleteCustomScenario = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customScenarios.filter((s) => s.id !== id);
    saveCustomScenariosToStorage(updated);
    if (scenarioType === id) {
      handleSelectPresetScenario('drought_2027');
    }
  };

  const handleGenerateScenario = async () => {
    if (!aiPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setAiGenError(null);
    try {
      const generated = await generateCustomScenario(aiPrompt.trim(), activeSiteId);
      const updated = [generated, ...customScenarios.filter((s) => s.id !== generated.id)];
      saveCustomScenariosToStorage(updated);
      setActiveCustomScenario(generated);
      setScenarioType(generated.id);
      setAiPrompt('');
      setShowAiCreator(false);
    } catch (err: any) {
      setAiGenError(err.message || 'Не удалось сгенерировать сценарий');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = () => {
    if (!data) return;
    exportStressTestPDF(data);
  };

  const trajectory = data ? getTrajectoryData(data) : [];
  const selectedPoint =
    trajectory.find((p) => p.year === selectedChartYear) || trajectory[3] || trajectory[0];

  const CHART_W = 760;
  const CHART_H = 200;
  const MARGIN = { top: 20, right: 30, bottom: 25, left: 45 };
  const innerW = CHART_W - MARGIN.left - MARGIN.right;
  const innerH = CHART_H - MARGIN.top - MARGIN.bottom;

  const yVals = trajectory.flatMap((p) =>
    chartMetric === 'agb' ? [p.baseAgb, p.stressAgb] : [p.baseCo2, p.stressCo2]
  );
  const minY = Math.max(0, Math.floor((Math.min(...(yVals.length ? yVals : [0])) * 0.85) / 10) * 10);
  const maxY = Math.ceil(((Math.max(...(yVals.length ? yVals : [100]))) * 1.1) / 10) * 10;
  const yRange = maxY - minY || 1;

  const getXPos = (idx: number) => MARGIN.left + (idx / Math.max(1, trajectory.length - 1)) * innerW;
  const getYPos = (val: number) => MARGIN.top + innerH - ((val - minY) / yRange) * innerH;

  const basePath = trajectory
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${getXPos(i).toFixed(1)} ${getYPos(
          chartMetric === 'agb' ? p.baseAgb : p.baseCo2
        ).toFixed(1)}`
    )
    .join(' ');

  const stressPath = trajectory
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${getXPos(i).toFixed(1)} ${getYPos(
          chartMetric === 'agb' ? p.stressAgb : p.stressCo2
        ).toFixed(1)}`
    )
    .join(' ');

  const lossAreaPath =
    trajectory.length > 0
      ? trajectory
          .map(
            (p, i) =>
              `${i === 0 ? 'M' : 'L'} ${getXPos(i).toFixed(1)} ${getYPos(
                chartMetric === 'agb' ? p.baseAgb : p.baseCo2
              ).toFixed(1)}`
          )
          .join(' ') +
        ' ' +
        [...trajectory]
          .reverse()
          .map(
            (p, i) =>
              `L ${getXPos(trajectory.length - 1 - i).toFixed(1)} ${getYPos(
                chartMetric === 'agb' ? p.stressAgb : p.stressCo2
              ).toFixed(1)}`
          )
          .join(' ') +
        ' Z'
      : '';

  const selectedIdx = trajectory.findIndex((p) => p.year === selectedChartYear);
  const selectedX = selectedIdx >= 0 ? getXPos(selectedIdx) : null;
  const gridYValues = [minY, minY + yRange * 0.33, minY + yRange * 0.66, maxY];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-zinc-950/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[94dvh] liquid-glass rounded-2xl shadow-2xl flex flex-col overflow-hidden bg-zinc-950/95 border border-zinc-800">
        {/* Шапка модального окна */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3.5 border-b border-zinc-800/80 bg-zinc-950/90 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-[#3A4831] text-[#c8d4be] shadow-sm shrink-0">
              <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-sm sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Стресс-тест полигона: 2024–2035</span>
                </h2>
                <span className="rounded-full bg-[#3A4831] px-2 py-0.5 text-[9px] sm:text-[10px] font-medium text-[#c8d4be] border border-[#5c744f]/40">
                  IPCC Моделирование
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-zinc-400 line-clamp-1">
                Сравнение нормы и катастрофы лесного массива
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

        {/* Панель выбора полигона */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-2 sm:py-2.5 bg-zinc-900/60 border-b border-zinc-800/80 text-xs shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 font-medium">Полигон:</span>
            <select
              value={activeSiteId}
              onChange={(e) => handleSiteChange(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-xs text-[#c8d4be] font-bold rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 focus:outline-none focus:border-[#7f9870] cursor-pointer shadow-sm max-w-[200px] truncate"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id} className="bg-zinc-950 text-zinc-200">
                  {s.name} ({s.area_ha.toFixed(0)} га)
                </option>
              ))}
            </select>
          </div>

          {data && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-zinc-400">Регион:</span>
              <span className="text-zinc-200 font-medium">{data.region}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">Площадь:</span>
              <span className="text-zinc-200 font-medium">{data.area_ha.toFixed(0)} га</span>
            </div>
          )}
        </div>

        {/* Основной контент */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 custom-scrollbar space-y-4 sm:space-y-5 text-zinc-200 text-xs sm:text-sm">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* 1. Блок выбора сценария + Кнопка генерации через AI */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-[#a5b997]" />
                <span>Выберите сценарий климатического шока</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAiCreator(!showAiCreator)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold bg-[#3A4831] hover:bg-[#485c3e] text-[#c8d4be] hover:text-white transition shadow-sm border border-[#5c744f]/40"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>Создать сценарий через AI</span>
              </button>
            </div>

            {/* AI Scenario Generator Form */}
            {showAiCreator && (
              <div className="mb-3.5 p-3.5 rounded-xl bg-zinc-900 border border-[#5c744f]/60 shadow-lg animate-in fade-in duration-150">
                <div className="text-xs font-bold text-white mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span>Генерация нового стресс-теста с помощью нейросети</span>
                </div>
                <p className="text-[11px] text-zinc-400 mb-2.5">
                  Опишите катастрофу своими словами. Нейросеть смоделирует физические параметры, класс риска TCFD и меры защиты.
                </p>

                {aiGenError && (
                  <div className="p-2 mb-2 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-[11px]">
                    {aiGenError}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Например: Аномальный торфяной пожар на севере участка и майские заморозки..."
                    disabled={isGenerating}
                    className="flex-1 rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#7f9870]"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateScenario}
                    disabled={isGenerating || !aiPrompt.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-[#3A4831] hover:bg-[#4a5f3f] disabled:opacity-50 text-white px-3.5 py-2 text-xs font-bold transition shadow-sm shrink-0"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#c8d4be]" />
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Сгенерировать</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Сетка сценариев: Базовые + Сохраненные пользователем */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {/* Базовые сценарии */}
              {PRESET_SCENARIOS.map((sc) => {
                const Icon = sc.icon;
                const active = scenarioType === sc.id && !activeCustomScenario;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => handleSelectPresetScenario(sc.id)}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      active
                        ? 'bg-[#3A4831]/80 border-[#7f9870] shadow-md ring-1 ring-[#7f9870]/40'
                        : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Icon
                          className={`h-4 w-4 ${
                            active ? 'text-[#c8d4be]' : 'text-zinc-400'
                          }`}
                        />
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                            active
                              ? 'bg-[#293422] text-[#c8d4be]'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {sc.badge}
                        </span>
                      </div>
                      <div className="font-bold text-xs text-white leading-snug">
                        {sc.label}
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-400 line-clamp-2 mt-2 leading-tight">
                      {sc.desc}
                    </div>
                  </button>
                );
              })}

              {/* Пользовательские сохраненные сценарии */}
              {customScenarios.map((sc) => {
                const active = scenarioType === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => handleSelectCustomScenario(sc)}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between relative group ${
                      active
                        ? 'bg-[#3A4831]/80 border-[#7f9870] shadow-md ring-1 ring-[#7f9870]/40'
                        : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Bookmark className="h-4 w-4 text-amber-300" />
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-amber-950/60 text-amber-300 border border-amber-800/40">
                          AI Сценарий
                        </span>
                      </div>
                      <div className="font-bold text-xs text-white leading-snug line-clamp-2">
                        {sc.name}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-800/60">
                      <span className="text-[10px] text-zinc-400 truncate max-w-[90px]">
                        {sc.risk_category.split(' ')[0]}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCustomScenario(sc.id, e)}
                        className="opacity-60 hover:opacity-100 p-1 text-zinc-400 hover:text-rose-400 transition"
                        title="Удалить сохраненный сценарий"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Интерактивные регуляторы стресс-теста */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Интенсивность катастрофы:</span>
                </span>
                <span className="font-mono font-bold text-[#c8d4be] text-xs">
                  {Math.round(severity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={severity}
                onChange={(e) => setSeverity(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#7f9870]"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                <span>10% (Умеренный)</span>
                <span>50% (Проектный)</span>
                <span>100% (Катастрофический)</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Буферный резерв полигона:</span>
                </span>
                <span className="font-mono font-bold text-[#c8d4be] text-xs">
                  {bufferPoolPct.toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="30"
                step="1"
                value={bufferPoolPct}
                onChange={(e) => setBufferPoolPct(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#7f9870]"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                <span>10% (Минимальный)</span>
                <span>20% (ГОСТ Р 58973)</span>
                <span>30% (Максимальный)</span>
              </div>
            </div>
          </div>

          {/* 3. Результаты стресс-теста */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-[#a5b997]" />
              <p className="text-xs">Пересчет биофизических параметров и финансовой устойчивости...</p>
            </div>
          ) : data ? (
            <div className="space-y-4">
              {/* Статус буфера и Индекс TCFD */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isSurvived
                    ? 'bg-[#3A4831]/40 border-[#5c744f]/60'
                    : 'bg-rose-950/30 border-rose-800/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-xl shrink-0 ${
                      isSurvived
                        ? 'bg-[#3A4831] text-[#c8d4be]'
                        : 'bg-rose-900 text-rose-200'
                    }`}
                  >
                    {isSurvived ? (
                      <ShieldCheck className="h-5 w-5" />
                    ) : (
                      <ShieldAlert className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-white flex items-center gap-2">
                      <span>{isSurvived ? 'БУФЕРНЫЙ ПУЛ ВЫДЕРЖАЛ' : 'ДЕФИЦИТ БУФЕРНОГО ПУЛА'}</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/40 text-[#c8d4be]">
                        {data.shock_impact.buffer_remaining_pct}% остаток
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                      {data.shock_impact.buffer_status_label}
                    </p>
                  </div>
                </div>

                <div className="sm:text-right shrink-0">
                  <div className="text-[10px] text-zinc-400 uppercase font-medium">
                    Индекс устойчивости (TCFD)
                  </div>
                  <div className="text-xl font-extrabold text-[#c8d4be] font-mono">
                    {data.financial_impact.resilience_score}
                    <span className="text-xs text-zinc-400">/100</span>
                  </div>
                  <div className="text-[11px] font-semibold text-zinc-300">
                    {data.financial_impact.resilience_grade}
                  </div>
                </div>
              </div>

              {/* Метрики в 4 карточки */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="text-[11px] text-zinc-400 mb-1 flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                    <span>Потеря углерода</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-rose-400 font-mono">
                    -{formatNumber(data.shock_impact.carbon_loss_t_co2, 0)} т
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    AGB: {data.initial_metrics.agb_t_ha} ➔ {data.shock_impact.post_shock_agb_t_ha} т/га (-{data.shock_impact.agb_loss_pct}%)
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="text-[11px] text-zinc-400 mb-1 flex items-center gap-1.5">
                    <Coins className="h-3.5 w-3.5 text-[#a5b997]" />
                    <span>Стресс-NPV (15 лет)</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-white font-mono">
                    {formatRub(data.financial_impact.stressed_npv_rub)}
                  </div>
                  <div className="text-[10px] text-rose-400 mt-0.5">
                    Δ: -{formatRub(data.financial_impact.delta_npv_rub)}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="text-[11px] text-zinc-400 mb-1 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#a5b997]" />
                    <span>Срок окупаемости</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-white font-mono">
                    {data.financial_impact.stressed_payback_years} года
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    Базовый: {data.initial_metrics.base_payback_years} года
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="text-[11px] text-zinc-400 mb-1 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-[#a5b997]" />
                    <span>Поглощено буфером</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-[#c8d4be] font-mono">
                    {formatNumber(data.shock_impact.buffer_absorbed_co2, 0)} т
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    {isSurvived ? '100% шока погашено' : 'Резерв исчерпан'}
                  </div>
                </div>
              </div>

              {/* 4. Интерактивный график: Норма vs Катастрофа с выбором года */}
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4">
                {/* Шапка графика и переключатели */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-zinc-800/80">
                  <div>
                    <div className="font-bold text-xs sm:text-sm text-white flex items-center gap-2">
                      <span>Сравнение: Обычный участок (Норма) vs Со стресс-тестом (Катастрофа)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        2024–2035
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Кликните по любому году на графике для мгновенного сопоставления показателей
                    </div>
                  </div>

                  {/* Переключатель единиц измерения */}
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setChartMetric('agb')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                        chartMetric === 'agb'
                          ? 'bg-[#3A4831] text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Биомасса (т/га)
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartMetric('co2')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                        chartMetric === 'co2'
                          ? 'bg-[#3A4831] text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Углерод (т CO₂)
                    </button>
                  </div>
                </div>

                {/* Селектор годов в виде кнопок-таблеток */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                  <span className="text-[11px] text-zinc-400 font-medium mr-1 shrink-0">Выбор года:</span>
                  {trajectory.map((pt) => {
                    const isSelected = selectedChartYear === pt.year;
                    return (
                      <button
                        key={pt.year}
                        type="button"
                        onClick={() => setSelectedChartYear(pt.year)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                          isSelected
                            ? pt.isShockYear
                              ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/50 ring-1 ring-rose-400'
                              : 'bg-[#3A4831] text-white shadow-md ring-1 ring-[#7f9870]'
                            : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-zinc-800'
                        }`}
                      >
                        {pt.isShockYear && <span>⚡</span>}
                        <span>{pt.year}</span>
                        {pt.isShockYear && (
                          <span className="text-[9px] font-normal opacity-90 hidden sm:inline">
                            (Шок)
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* SVG График */}
                <div className="relative w-full bg-zinc-950/80 rounded-xl p-2 border border-zinc-800/60 overflow-hidden">
                  <svg
                    viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                    className="w-full h-44 sm:h-52 select-none"
                  >
                    <defs>
                      <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.32" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.06" />
                      </linearGradient>
                    </defs>

                    {/* Горизонтальные направляющие сетки */}
                    {gridYValues.map((val, idx) => {
                      const yPos = getYPos(val);
                      return (
                        <g key={idx}>
                          <line
                            x1={MARGIN.left}
                            y1={yPos}
                            x2={CHART_W - MARGIN.right}
                            y2={yPos}
                            stroke="#27272a"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={MARGIN.left - 8}
                            y={yPos + 3}
                            fill="#71717a"
                            fontSize="9"
                            fontFamily="monospace"
                            textAnchor="end"
                          >
                            {chartMetric === 'agb' ? `${val}` : `${Math.round(val / 1000)}k`}
                          </text>
                        </g>
                      );
                    })}

                    {/* Зона потерь между базовой траекторией и стресс-тестом */}
                    <path d={lossAreaPath} fill="url(#lossGradient)" />

                    {/* Линия нормы (Обычный участок) */}
                    <path
                      d={basePath}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Линия стресс-теста (Катастрофа) */}
                    <path
                      d={stressPath}
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="2.5"
                      strokeDasharray="5 3"
                      strokeLinecap="round"
                    />

                    {/* Вертикальная направляющая выбранного года */}
                    {selectedX !== null && (
                      <line
                        x1={selectedX}
                        y1={MARGIN.top}
                        x2={selectedX}
                        y2={CHART_H - MARGIN.bottom}
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                    )}

                    {/* Точки для каждого года */}
                    {trajectory.map((pt, idx) => {
                      const x = getXPos(idx);
                      const baseVal = chartMetric === 'agb' ? pt.baseAgb : pt.baseCo2;
                      const stressVal = chartMetric === 'agb' ? pt.stressAgb : pt.stressCo2;
                      const yBase = getYPos(baseVal);
                      const yStress = getYPos(stressVal);
                      const isSelected = pt.year === selectedChartYear;

                      return (
                        <g
                          key={pt.year}
                          className="cursor-pointer"
                          onClick={() => setSelectedChartYear(pt.year)}
                        >
                          {/* Зона клика */}
                          <rect
                            x={x - 20}
                            y={MARGIN.top}
                            width="40"
                            height={CHART_H - MARGIN.top - MARGIN.bottom}
                            fill="transparent"
                          />

                          {/* Точка нормы */}
                          <circle
                            cx={x}
                            cy={yBase}
                            r={isSelected ? 5.5 : 3.5}
                            fill="#10b981"
                            stroke="#064e3b"
                            strokeWidth={isSelected ? 2 : 1}
                          />

                          {/* Точка стресса */}
                          <circle
                            cx={x}
                            cy={yStress}
                            r={isSelected ? (pt.isShockYear ? 6.5 : 5.5) : 3.5}
                            fill={pt.isShockYear ? '#f43f5e' : '#fbbf24'}
                            stroke={pt.isShockYear ? '#881337' : '#78350f'}
                            strokeWidth={isSelected ? 2 : 1}
                          />

                          {/* Метка года под осью */}
                          <text
                            x={x}
                            y={CHART_H - 12}
                            fill={isSelected ? '#ffffff' : '#a1a1aa'}
                            fontSize={isSelected ? '11' : '10'}
                            fontWeight={isSelected ? 'bold' : 'normal'}
                            textAnchor="middle"
                          >
                            {pt.year}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Легенда графика */}
                  <div className="flex items-center justify-center gap-5 mt-1 pt-2 border-t border-zinc-900 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-5 rounded bg-[#10b981]" />
                      <span className="text-zinc-300 font-medium">Обычный участок (Норма)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-0.5 w-5 border-t-2 border-dashed border-[#f43f5e]" />
                      <span className="text-rose-400 font-medium">Стресс-тест (Катастрофа)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-4 rounded bg-rose-500/30 border border-rose-500/50" />
                      <span className="text-amber-400 font-medium">Зона потерь</span>
                    </div>
                  </div>
                </div>

                {/* Панель детального сравнения для выбранного года */}
                {selectedPoint && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white flex items-center gap-2">
                        <span>Сравнение для {selectedPoint.year} года:</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${selectedPoint.badgeColor}`}>
                          {selectedPoint.status}
                        </span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Карточка 1: Обычный участок */}
                      <div className="p-3.5 rounded-xl bg-zinc-950 border border-emerald-900/40">
                        <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                          <span className="font-semibold text-emerald-400">Обычный участок (Норма)</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300">
                            База
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-baseline">
                            <span className="text-[11px] text-zinc-400">Биомасса:</span>
                            <span className="font-mono font-bold text-white text-sm">
                              {selectedPoint.baseAgb} т/га
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-[11px] text-zinc-400">Запас углерода:</span>
                            <span className="font-mono font-bold text-[#c8d4be] text-xs">
                              {formatNumber(selectedPoint.baseCo2, 0)} т CO₂
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Карточка 2: Со стресс-тестом */}
                      <div className="p-3.5 rounded-xl bg-zinc-950 border border-rose-900/40">
                        <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                          <span className="font-semibold text-rose-400">Со стресс-тестом (Катастрофа)</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300">
                            Шок
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-baseline">
                            <span className="text-[11px] text-zinc-400">Биомасса:</span>
                            <span className="font-mono font-bold text-white text-sm">
                              {selectedPoint.stressAgb} т/га
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-[11px] text-zinc-400">Запас углерода:</span>
                            <span className="font-mono font-bold text-[#c8d4be] text-xs">
                              {formatNumber(selectedPoint.stressCo2, 0)} т CO₂
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Карточка 3: Разница (Дельта) */}
                      <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                        <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                          <span className="font-semibold text-amber-300">Разница потерь (Δ)</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300">
                            {selectedPoint.lossPct > 0 ? `-${selectedPoint.lossPct}%` : '0%'}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-baseline">
                            <span className="text-[11px] text-zinc-400">Потеря биомассы:</span>
                            <span className={`font-mono font-bold text-sm ${selectedPoint.deltaAgb < 0 ? 'text-rose-400' : 'text-zinc-300'}`}>
                              {selectedPoint.deltaAgb < 0 ? `${selectedPoint.deltaAgb} т/га` : '0 т/га'}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-[11px] text-zinc-400">Потеря углерода:</span>
                            <span className={`font-mono font-bold text-xs ${selectedPoint.deltaCo2 < 0 ? 'text-rose-400' : 'text-zinc-300'}`}>
                              {selectedPoint.deltaCo2 < 0 ? `${formatNumber(selectedPoint.deltaCo2, 0)} т CO₂` : '0 т'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Кнопка мгновенного перехода в шторку на карте для выбранного года */}
                    {onLaunchSwipe && (
                      <button
                        type="button"
                        onClick={() => onLaunchSwipe(selectedPoint.year)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#3A4831] hover:bg-[#4a5f3f] text-white text-xs font-bold transition shadow-md border border-[#5c744f]/50"
                        title={`Открыть интерактивную шторку на карте и сравнить базовое состояние с ${selectedPoint.year} годом`}
                      >
                        <Split className="h-4 w-4 text-amber-300" />
                        <span>Открыть в шторке сравнение на карте ({selectedPoint.year} год)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Подвал с кнопками: Сравнить в шторке + Скачать PDF + Закрыть */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3 border-t border-zinc-800/80 bg-zinc-950/90 shrink-0 gap-2">
          <div className="text-[11px] text-zinc-400 font-mono">
            Спутниковый мониторинг биомассы и прогнозирование рисков
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Кнопка наглядного сравнения в шторке на карте! */}
            {onLaunchSwipe && (
              <button
                type="button"
                onClick={() => onLaunchSwipe(selectedChartYear)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 hover:text-white text-xs font-semibold transition border border-amber-500/30 shadow-sm"
                title="Перейти на карту и наглядно сравнить здоровый лес и зону поражения катастрофы в шторке"
              >
                <Split className="h-3.5 w-3.5 text-amber-400" />
                <span>Сравнить в шторке ({selectedChartYear} г.)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportPDF}
              disabled={loading || !data}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#3A4831] hover:bg-[#4a5f3f] disabled:opacity-50 text-white text-xs font-bold transition shadow-sm"
              title="Скачать отчет стресс-тестирования в PDF"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Скачать отчет (PDF)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold transition"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
