import React, { useState, useEffect } from 'react';
import {
  fetchSites,
  calculateMRV,
  fetchTimeseries,
  fetchDisturbances,
  generateReport,
  SiteInfo,
  CalculationResponse,
  TimeseriesResponse,
  DisturbanceResponse,
  ReportResponse,
} from './api/client';
import { Header } from './components/Header';
import { MapViewer } from './components/MapViewer';
import { WaterfallPanel } from './components/WaterfallPanel';
import { DisturbancePanel } from './components/DisturbancePanel';
import { ChartsPanel } from './components/ChartsPanel';
import { InvestorRightPanel } from './components/InvestorRightPanel';
import { UserRightPanel } from './components/UserRightPanel';
import { CreditRegistryModal } from './components/CreditRegistryModal';
import { CustomPolygonModal } from './components/CustomPolygonModal';
import { ReportModal } from './components/ReportModal';
import { FloatingBottomBar, RasterLayerType } from './components/FloatingBottomBar';
import { B2BSuiteModal, PersonaMode } from './components/b2b/B2BSuiteModal';
import { AIAssistantModal } from './components/AIAssistantModal';
import { StressTestModal } from './components/StressTestModal';
import { SwipeLayerId } from './components/b2b/SwipeToolPanel';
import {
  AlertCircle,
  ShieldCheck,
  Globe2,
  TreeDeciduous,
  CircleDollarSign,
  Coins,
  Briefcase,
  Microscope,
  Trees,
} from 'lucide-react';
import { formatNumber, formatRub } from './utils';

export const App: React.FC = () => {
  const [currentPersona, setCurrentPersona] = useState<PersonaMode>('investor');
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('RU_TVER_01');
  const [customPolygon, setCustomPolygon] = useState<any>(null);
  const [customAreaHa, setCustomAreaHa] = useState<number>(0);
  const [isCustom, setIsCustom] = useState<boolean>(false);

  // Time-series & Layer states
  const [yearStart, setYearStart] = useState<number>(2019);
  const [yearEnd, setYearEnd] = useState<number>(2024);
  const [activeLayer, setActiveLayer] = useState<RasterLayerType>('biomass');
  const [opacity, setOpacity] = useState<number>(0.8);
  const [baseMap, setBaseMap] = useState<'dark' | 'satellite'>('satellite');
  const [loadingRaster, setLoadingRaster] = useState<boolean>(false);

  // Leaflet Swipe Comparison Tool states (inline directly in HUD)
  const [isSwipeActive, setIsSwipeActive] = useState<boolean>(false);
  const [swipePosition, setSwipePosition] = useState<number>(50);
  const [swipeLeftLayer, setSwipeLeftLayer] = useState<SwipeLayerId>('satellite');
  const [swipeRightLayer, setSwipeRightLayer] = useState<SwipeLayerId>('biomass');
  const [swipeLeftYear, setSwipeLeftYear] = useState<number>(2019);
  const [swipeRightYear, setSwipeRightYear] = useState<number>(2024);

  // UI HUD states
  const [showPanels, setShowPanels] = useState<boolean>(true);
  const [mobileTab, setMobileTab] = useState<'map' | 'summary' | 'analytics'>('map');
  const [rightTab, setRightTab] = useState<'charts' | 'waterfall'>('charts');
  const [leftValMode, setLeftValMode] = useState<'gross' | 'stock'>('gross');
  const [activeScenarioPrice, setActiveScenarioPrice] = useState<number>(1500);

  // MRV payload states
  const [calculation, setCalculation] = useState<CalculationResponse | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesResponse | null>(null);
  const [disturbances, setDisturbances] = useState<DisturbanceResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [isRegistryOpen, setIsRegistryOpen] = useState<boolean>(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState<boolean>(false);
  const [isStressTestModalOpen, setIsStressTestModalOpen] = useState<boolean>(false);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);

  // 1. Initial Load: Sites
  useEffect(() => {
    fetchSites()
      .then((data) => {
        setSites(data);
        if (data.length > 0 && !selectedSiteId) {
          setSelectedSiteId(data[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load sites:', err);
        setError('Не удалось подключиться к серверу API (http://localhost:8000). Проверьте запуск бэкенда.');
      });
  }, []);

  // 2. Load MRV Data when site, period or custom polygon changes
  const loadMRVData = async () => {
    setLoading(true);
    setError(null);

    const payload: any = isCustom
      ? { polygon: customPolygon, year_start: yearStart, year_end: yearEnd }
      : { site_id: selectedSiteId, year_start: yearStart, year_end: yearEnd };

    try {
      const [calcRes, tsRes, distRes] = await Promise.all([
        calculateMRV(payload),
        fetchTimeseries(payload),
        fetchDisturbances(payload),
      ]);

      setCalculation(calcRes);
      setTimeseries(tsRes);
      setDisturbances(distRes);
    } catch (err: any) {
      console.error('Calculation error:', err);
      setError(err.message || 'Ошибка выполнения спутниковых расчётов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSiteId || customPolygon) {
      loadMRVData();
    }
  }, [selectedSiteId, isCustom, customPolygon, yearStart, yearEnd]);

  // Handle preset site selection
  const handleSelectSite = (siteId: string) => {
    setIsCustom(false);
    setCustomPolygon(null);
    setSelectedSiteId(siteId);
  };

  // Handle custom polygon apply
  const handleApplyCustomPolygon = (geojson: any, areaHa: number) => {
    setCustomPolygon(geojson);
    setCustomAreaHa(areaHa);
    setIsCustom(true);
    setSelectedSiteId('CUSTOM');
  };

  // Open & Generate Report
  const handleOpenReport = async () => {
    setIsReportModalOpen(true);
    setLoadingReport(true);
    try {
      const rep = await generateReport({
        site_id: isCustom ? 'CUSTOM_AOI' : selectedSiteId,
        project_name: isCustom
          ? 'Пользовательский лесоклиматический проект'
          : sites.find((s) => s.id === selectedSiteId)?.name,
        calculation_result: calculation || undefined,
        verifier_notes: 'Верифицировано на основе спутниковой телеметрии ESA CCI Biomass, Sentinel-2 L2A и MODIS MCD64A1.',
      });
      setReport(rep);
    } catch (e: any) {
      console.error('Failed to generate report:', e);
    } finally {
      setLoadingReport(false);
    }
  };

  const selectedSite = isCustom
    ? {
        id: 'CUSTOM',
        name: `Пользовательский полигон (${formatNumber(customAreaHa, 1)} га)`,
        area_ha: customAreaHa,
        bounds: [32.91, 56.59, 32.97, 56.63] as [number, number, number, number],
        geojson: customPolygon,
      }
    : sites.find((s) => s.id === selectedSiteId) || null;

  const currentGeojson = isCustom ? customPolygon : selectedSite?.geojson;

  // Financial calculations for Left Card (Variant A)
  const eProj = calculation?.e_proj_t_co2e ?? 0;
  const grossAbs = Math.max(0, -eProj);
  const totalStockCo2 = ((calculation?.c1_t_c_ha ?? 0) * (calculation?.area_ha ?? 0) * (44 / 12));

  let leftActiveQty = grossAbs > 0 ? grossAbs : Math.abs(eProj);
  let leftUnitLabel = 'т CO₂e';
  let leftVal500 = leftActiveQty * 500;
  let leftVal1500 = leftActiveQty * 1500;
  let leftVal4000 = leftActiveQty * 4000;

  if (leftValMode === 'stock') {
    leftActiveQty = totalStockCo2;
    leftUnitLabel = 'т CO₂e';
    leftVal500 = leftActiveQty * 500;
    leftVal1500 = leftActiveQty * 1500;
    leftVal4000 = leftActiveQty * 4000;
  }

  const isValid = calculation?.is_valid ?? false;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 selection:bg-emerald-900/60 selection:text-emerald-200 font-sans">
      {/* 1. Полноэкранная Leaflet-карта */}
      <MapViewer
        site={selectedSite}
        geojson={currentGeojson}
        siteId={selectedSiteId}
        activeLayer={activeLayer}
        activeYear={yearEnd}
        opacity={opacity}
        baseMap={baseMap}
        onLoadingChange={setLoadingRaster}
        isSwipeActive={isSwipeActive}
        swipePosition={swipePosition}
        onSwipePositionChange={setSwipePosition}
        swipeLeftLayer={swipeLeftLayer}
        swipeRightLayer={swipeRightLayer}
        swipeLeftYear={swipeLeftYear}
        swipeRightYear={swipeRightYear}
        onToggleSwipe={() => setIsSwipeActive(!isSwipeActive)}
      />

      {/* 2. Верхняя панель: разделена на 2 плашки (ровно над нижними панелями 350px и 420px) */}
      <Header
        sites={sites}
        selectedSiteId={selectedSiteId}
        isCustomPolygon={isCustom}
        onSelectSite={handleSelectSite}
        onOpenCustomPolygonModal={() => setIsCustomModalOpen(true)}
        loading={loading}
        onRefresh={loadMRVData}
        onOpenRegistry={() => setIsRegistryOpen(true)}
        onOpenReport={handleOpenReport}
        onOpenAIModal={() => setIsAIModalOpen(true)}
        showPanels={showPanels}
        onTogglePanels={() => setShowPanels(!showPanels)}
        currentPersona={currentPersona}
        onSelectPersona={setCurrentPersona}
      />

      {/* Глобальное уведомление об ошибке */}
      {error && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 liquid-glass rounded-2xl border border-rose-500/40 p-4 text-rose-300 shadow-2xl flex items-center gap-3 max-w-lg">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <div className="text-xs">
            <span className="font-semibold text-rose-200">Ошибка: </span>
            {error}
          </div>
        </div>
      )}

      {/* Адаптивный переключатель видов (Карта / Сводка / Аналитика) на экранах < 1280px */}
      {showPanels && (
        <div className="fixed top-[58px] left-1/2 -translate-x-1/2 z-30 flex items-center p-0.5 rounded-xl liquid-glass border border-zinc-800 shadow-xl xl:hidden text-xs">
          <button
            onClick={() => setMobileTab('map')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              mobileTab === 'map'
                ? 'bg-[#3A4831] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            🗺️ Карта
          </button>
          <button
            onClick={() => setMobileTab('summary')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              mobileTab === 'summary'
                ? 'bg-[#3A4831] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            📋 Сводка
          </button>
          <button
            onClick={() => setMobileTab('analytics')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              mobileTab === 'analytics'
                ? 'bg-[#3A4831] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            📈 Аналитика
          </button>
        </div>
      )}

      {/* 3. Левая нижняя плашка HUD (350px на больших экранах, адаптивная до 1280px) */}
      {showPanels && (
        <aside
          className={`fixed top-[102px] xl:top-[56px] left-3 right-3 xl:right-auto xl:left-3 bottom-[60px] pb-10 w-auto max-w-md mx-auto xl:max-w-none xl:w-[350px] z-20 flex-col gap-2 overflow-y-auto pr-1 pointer-events-none custom-scrollbar transition-all duration-300 ${
            mobileTab === 'summary' ? 'flex' : 'hidden xl:flex'
          }`}
        >
          {/* Карточка A: Обзор проекта и статус MRV */}
          <div className="liquid-glass rounded-2xl p-3 pointer-events-auto shadow-xl border border-emerald-900/50 flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a5b997]">
                  Участок мониторинга
                </span>
                <h3 className="text-xs font-bold text-white line-clamp-1">
                  {selectedSite?.name || 'Территория проекта'}
                </h3>
              </div>
              <div
                className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium tracking-wide border ${
                  isValid
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                    : 'bg-zinc-900/90 text-zinc-400 border-zinc-800'
                }`}
              >
                <ShieldCheck className={`h-3 w-3 ${isValid ? 'text-emerald-500' : 'text-zinc-500'}`} />
                <span>{isValid ? 'Верифицировано' : 'Аудит MRV'}</span>
              </div>
            </div>

            {/* Сетка ключевых метрик */}
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <div className="rounded-xl bg-zinc-900/80 p-2 border border-zinc-800/80">
                <div className="text-[9px] font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                  <Globe2 className="h-2.5 w-2.5 text-emerald-600" />
                  <span>Площадь</span>
                </div>
                <div className="mt-0.5 text-sm font-bold text-white">
                  {formatNumber(calculation?.area_ha ?? selectedSite?.area_ha, 1)} <span className="text-[10px] text-zinc-400">га</span>
                </div>
              </div>

              <div className="rounded-xl bg-zinc-900/80 p-2 border border-zinc-800/80">
                <div className="text-[9px] font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                  <TreeDeciduous className="h-2.5 w-2.5 text-emerald-600" />
                  <span>Биомасса</span>
                </div>
                <div className="mt-0.5 text-sm font-bold text-white">
                  {formatNumber(calculation?.t1_biomass_t_ha, 1)} <span className="text-[10px] text-zinc-400">т/га</span>
                </div>
              </div>

              <div className="rounded-xl bg-zinc-900/80 p-2 border border-zinc-800/80">
                <div className="text-[9px] font-medium text-zinc-400 uppercase tracking-wider">
                  Поглощение CO₂
                </div>
                <div className={`mt-0.5 text-sm font-bold ${calculation?.e_proj_t_co2e && calculation.e_proj_t_co2e < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {calculation?.e_proj_t_co2e && calculation.e_proj_t_co2e < 0
                    ? `+${formatNumber(Math.abs(calculation.e_proj_t_co2e), 0)}`
                    : formatNumber(calculation?.e_proj_t_co2e, 0)}{' '}
                  <span className="text-[9px] text-zinc-400 font-normal">т CO₂e</span>
                </div>
              </div>

              <div className="rounded-xl bg-zinc-900/80 p-2 border border-zinc-800/80">
                <div className="text-[9px] font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                  <Coins className="h-2.5 w-2.5 text-emerald-600" />
                  <span>Запас углерода</span>
                </div>
                <div className="mt-0.5 text-sm font-bold text-white">
                  {formatNumber(calculation?.c1_t_c_ha ?? (calculation?.t1_biomass_t_ha ? calculation.t1_biomass_t_ha * 0.47 : 0), 1)}{' '}
                  <span className="text-[10px] text-zinc-400 font-normal">т C/га</span>
                </div>
              </div>
            </div>
          </div>

          {/* Карточка B: В зависимости от профиля (Инвестор vs Эколог vs Пользователь) */}
          <div className="liquid-glass rounded-2xl p-3 pointer-events-auto shadow-xl border border-emerald-900/50 flex flex-col gap-2.5">
            {currentPersona === 'investor' && (
              <>
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <div className="flex items-center gap-1.5">
                    <CircleDollarSign className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white">
                      Финансовая оценка
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-300 font-semibold">
                    {formatNumber(leftActiveQty, 0)} {leftUnitLabel}
                  </span>
                </div>

                {/* Сегментный переключатель */}
                <div className="grid grid-cols-2 rounded-lg bg-zinc-900/90 p-0.5 border border-zinc-800 text-[10px]">
                  <button
                    onClick={() => setLeftValMode('gross')}
                    className={`rounded py-1 px-1 font-medium transition ${
                      leftValMode === 'gross'
                        ? 'bg-emerald-800 text-white font-bold shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title="Оценка поглощённого экосистемой углерода"
                  >
                    Поглощение
                  </button>
                  <button
                    onClick={() => setLeftValMode('stock')}
                    className={`rounded py-1 px-1 font-medium transition ${
                      leftValMode === 'stock'
                        ? 'bg-emerald-800 text-white font-bold shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title="Полная капитализация лесного углеродного пула"
                  >
                    Запас леса
                  </button>
                </div>

                {/* Горизонтальные строки цен */}
                <div className="flex flex-col gap-1.5">
                  {[
                    { price: 500, title: 'Консервативный', val: leftVal500 },
                    { price: 1500, title: 'Базовый', val: leftVal1500 },
                    { price: 4000, title: 'Оптимистичный', val: leftVal4000 },
                  ].map((sc) => {
                    const isSelected = activeScenarioPrice === sc.price;
                    return (
                      <button
                        key={sc.price}
                        onClick={() => setActiveScenarioPrice(sc.price)}
                        className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 border text-xs text-left transition ${
                          isSelected
                            ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200 shadow-sm'
                            : 'bg-zinc-900/70 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isSelected ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                          <span className="text-[11px]">
                            {sc.title} <span className="text-zinc-400">({formatNumber(sc.price, 0)} ₽/т)</span>
                          </span>
                        </div>
                        <span className={`font-mono text-xs font-bold ${isSelected ? 'text-emerald-300' : 'text-zinc-100'}`}>
                          {formatRub(sc.val)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setIsDetailModalOpen(true)}
                  className="mt-0.5 flex items-center justify-center gap-2 rounded-xl bg-zinc-900/90 hover:bg-[#3A4831] p-2 text-xs font-semibold text-zinc-200 hover:text-white transition shadow-sm"
                  title="Открыть инвестиционную модель доходности и окупаемости"
                >
                  <Briefcase className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Инвестиционная аналитика (ROI)</span>
                </button>
              </>
            )}

            {currentPersona === 'ecologist' && (
              <>
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Microscope className="h-3.5 w-3.5 text-[#a5b997]" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white">
                      Биофизический аудит
                    </span>
                  </div>
                  <span className="rounded bg-[#3A4831] px-1.5 py-0.5 text-[9px] font-mono text-[#c8d4be]">
                    ГОСТ 14064-2
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between p-2 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                    <span className="text-zinc-400">Надземная биомасса (AGB):</span>
                    <span className="font-mono font-bold text-white">
                      {formatNumber(calculation?.t1_biomass_t_ha ?? 105.0, 1)} т/га
                    </span>
                  </div>
                  <div className="flex justify-between p-2 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                    <span className="text-zinc-400">Корневая масса (BGB):</span>
                    <span className="font-mono font-bold text-[#c8d4be]">
                      {formatNumber((calculation?.t1_biomass_t_ha ?? 105.0) * 0.22, 1)} т/га
                    </span>
                  </div>
                  <div className="flex justify-between p-2 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                    <span className="text-zinc-400">Радар Sentinel-1:</span>
                    <span className="font-mono font-bold text-[#a5b997]">
                      Полог стабилен (99.1%)
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsDetailModalOpen(true)}
                  className="mt-0.5 flex items-center justify-center gap-2 rounded-xl bg-zinc-900/90 hover:bg-[#3A4831] p-2 text-xs font-semibold text-zinc-200 hover:text-white transition shadow-sm"
                  title="Открыть экологический паспорт и 5 пулов биомассы"
                >
                  <Microscope className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Экологический аудит и ГОСТ</span>
                </button>
              </>
            )}

            {currentPersona === 'user' && (
              <>
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Trees className="h-3.5 w-3.5 text-[#a5b997]" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white">
                      Моё поле
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between p-2 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                    <span className="text-zinc-400">Кадастровый номер:</span>
                    <span className="font-mono font-bold text-[#c8d4be]">
                      {selectedSiteId.includes('MORDOVIA')
                        ? '13:19:0204001:342'
                        : selectedSiteId.includes('VOLOGDA')
                        ? '35:25:0701015:89'
                        : selectedSiteId.includes('KRASNOYARSK')
                        ? '24:11:0103002:189'
                        : '69:10:0000012:451'}
                    </span>
                  </div>
                  <div className="flex justify-between p-2 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                    <span className="text-zinc-400">Поглощение CO₂:</span>
                    <span className="font-mono font-bold text-white">
                      {formatNumber((calculation?.area_ha ?? selectedSite?.area_ha ?? 100) * 3.5, 0)} т/год
                    </span>
                  </div>
                  <div className="flex justify-between p-2 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                    <span className="text-zinc-400">Оценка дохода:</span>
                    <span className="font-mono font-bold text-[#a5b997]">
                      {formatRub((calculation?.area_ha ?? selectedSite?.area_ha ?? 100) * 3.5 * 0.8 * 1500)}/год
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsDetailModalOpen(true)}
                  className="mt-0.5 flex items-center justify-center gap-2 rounded-xl bg-zinc-900/90 hover:bg-[#3A4831] p-2 text-xs font-semibold text-zinc-200 hover:text-white transition shadow-sm"
                  title="Открыть паспорт участка"
                >
                  <Trees className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Паспорт участка</span>
                </button>
              </>
            )}
          </div>

          {/* Карточка C: Нарушения и гари */}
          <div className="pointer-events-auto">
            <DisturbancePanel disturbances={disturbances} loading={loading} />
          </div>
        </aside>
      )}

      {/* 4. Правая нижняя плашка HUD: Графика и Сводка MRV (420px на больших экранах, адаптивная до 1280px) */}
      {showPanels && (
        <aside
          className={`fixed top-[102px] xl:top-[56px] left-3 right-3 xl:left-auto xl:right-3 bottom-[60px] pb-4 w-auto max-w-md mx-auto xl:max-w-none xl:w-[420px] z-20 flex-col pointer-events-none transition-all duration-300 ${
            mobileTab === 'analytics' ? 'flex' : 'hidden xl:flex'
          }`}
        >
          <div className="liquid-glass rounded-2xl p-3 shadow-xl border border-zinc-800 flex flex-col h-full pointer-events-auto overflow-hidden">
            {/* Переключатель вкладок в зависимости от профиля */}
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80 mb-2 shrink-0">
              {currentPersona === 'investor' && (
                <div className="flex items-center gap-1 rounded-lg bg-zinc-900/90 p-0.5 text-[11px]">
                  <button
                    onClick={() => setRightTab('charts')}
                    className={`rounded px-2.5 py-1 font-medium transition ${
                      rightTab === 'charts'
                        ? 'bg-[#3A4831] text-white font-semibold shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Доходность и DCF
                  </button>
                  <button
                    onClick={() => setRightTab('waterfall')}
                    className={`rounded px-2.5 py-1 font-medium transition ${
                      rightTab === 'waterfall'
                        ? 'bg-[#3A4831] text-white font-semibold shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Динамика биомассы
                  </button>
                </div>
              )}

              {currentPersona === 'ecologist' && (
                <div className="flex items-center gap-1 rounded-lg bg-zinc-900/90 p-0.5 text-[11px]">
                  <button
                    onClick={() => setRightTab('charts')}
                    className={`rounded px-2.5 py-1 font-medium transition ${
                      rightTab === 'charts'
                        ? 'bg-[#3A4831] text-white font-semibold shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Динамика и прогноз
                  </button>
                  <button
                    onClick={() => setRightTab('waterfall')}
                    className={`rounded px-2.5 py-1 font-medium transition ${
                      rightTab === 'waterfall'
                        ? 'bg-[#3A4831] text-white font-semibold shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Сводка расчёта (ГОСТ)
                  </button>
                </div>
              )}

              {currentPersona === 'user' && (
                <div className="flex items-center gap-1 rounded-lg bg-zinc-900/90 p-0.5 text-[11px]">
                  <button
                    onClick={() => setRightTab('charts')}
                    className={`rounded px-2.5 py-1 font-medium transition ${
                      rightTab === 'charts'
                        ? 'bg-[#3A4831] text-white font-semibold shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Здоровье и угодья
                  </button>
                  <button
                    onClick={() => setRightTab('waterfall')}
                    className={`rounded px-2.5 py-1 font-medium transition ${
                      rightTab === 'waterfall'
                        ? 'bg-[#3A4831] text-white font-semibold shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Динамика полога
                  </button>
                </div>
              )}

              <span className="font-mono text-[10px] text-[#c8d4be] bg-[#3A4831] px-2 py-0.5 rounded border border-[#5c744f]/40">
                {currentPersona === 'investor'
                  ? `15 лет • ${formatNumber(activeScenarioPrice, 0)} ₽/т`
                  : currentPersona === 'ecologist'
                  ? `${yearStart}–${yearEnd}`
                  : `${(calculation?.area_ha ?? selectedSite?.area_ha ?? 100).toFixed(0)} га`}
              </span>
            </div>

            {/* Контент активной вкладки правой панели */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
              {currentPersona === 'investor' && (
                <>
                  {rightTab === 'charts' ? (
                    <InvestorRightPanel
                      areaHa={calculation?.area_ha ?? selectedSite?.area_ha ?? 100.0}
                      carbonPrice={activeScenarioPrice}
                      onOpenROI={() => setIsDetailModalOpen(true)}
                    />
                  ) : (
                    <ChartsPanel
                      timeseries={timeseries}
                      loading={loading}
                      yearStart={yearStart}
                      yearEnd={yearEnd}
                      calculation={calculation}
                    />
                  )}
                </>
              )}

              {currentPersona === 'ecologist' && (
                <>
                  {rightTab === 'charts' ? (
                    <ChartsPanel
                      timeseries={timeseries}
                      loading={loading}
                      yearStart={yearStart}
                      yearEnd={yearEnd}
                      calculation={calculation}
                    />
                  ) : (
                    <WaterfallPanel
                      calculation={calculation}
                      loading={loading}
                      onOpenReport={handleOpenReport}
                    />
                  )}
                </>
              )}

              {currentPersona === 'user' && (
                <>
                  {rightTab === 'charts' ? (
                    <UserRightPanel
                      areaHa={calculation?.area_ha ?? selectedSite?.area_ha ?? 100.0}
                      siteId={selectedSiteId}
                      siteName={selectedSite?.name}
                      cadastralNumber={
                        selectedSiteId.includes('MORDOVIA')
                          ? '13:19:0204001:342'
                          : selectedSiteId.includes('VOLOGDA')
                          ? '35:25:0701015:89'
                          : selectedSiteId.includes('KRASNOYARSK')
                          ? '24:11:0103002:189'
                          : '69:10:0000012:451'
                      }
                    />
                  ) : (
                    <ChartsPanel
                      timeseries={timeseries}
                      loading={loading}
                      yearStart={yearStart}
                      yearEnd={yearEnd}
                      calculation={calculation}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* 5. Нижняя панель управления и интерактивная шторка на карте */}
      <FloatingBottomBar
        activeLayer={activeLayer}
        onChangeLayer={setActiveLayer}
        opacity={opacity}
        onChangeOpacity={setOpacity}
        baseMap={baseMap}
        onChangeBaseMap={setBaseMap}
        yearStart={yearStart}
        yearEnd={yearEnd}
        onChangeYears={(start, end) => {
          setYearStart(start);
          setYearEnd(end);
        }}
        loadingRaster={loadingRaster}
        isSwipeActive={isSwipeActive}
        onToggleSwipe={() => setIsSwipeActive(!isSwipeActive)}
        onOpenStressTestModal={() => setIsStressTestModalOpen(true)}
        swipePosition={swipePosition}
        onChangeSwipePosition={setSwipePosition}
        swipeLeftLayer={swipeLeftLayer}
        onChangeLeftLayer={setSwipeLeftLayer}
        swipeRightLayer={swipeRightLayer}
        onChangeRightLayer={setSwipeRightLayer}
        swipeLeftYear={swipeLeftYear}
        onChangeLeftYear={setSwipeLeftYear}
        swipeRightYear={swipeRightYear}
        onChangeRightYear={setSwipeRightYear}
      />

      {/* Модальные окна */}
      <CreditRegistryModal
        isOpen={isRegistryOpen}
        onClose={() => setIsRegistryOpen(false)}
        currentSiteId={selectedSiteId}
        calculationHash={calculation?.calculation_hash || ''}
        defaultTradableUnits={calculation?.q_tradable_units || 0}
      />

      <CustomPolygonModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onApplyPolygon={handleApplyCustomPolygon}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        report={report}
        loading={loadingReport}
      />

      {/* Аналитика и финансовый калькулятор */}
      <B2BSuiteModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        siteId={selectedSiteId}
        selectedSite={selectedSite}
        calculation={calculation}
        sites={sites}
        initialPersona={currentPersona}
      />

      {/* Gemini AI Климатический Ассистент */}
      <AIAssistantModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        siteId={selectedSiteId}
        sites={sites}
        siteName={selectedSite?.name}
        areaHa={calculation?.area_ha ?? selectedSite?.area_ha ?? 100.0}
        currentPersona={currentPersona}
        onSelectPersona={setCurrentPersona}
        onSelectSite={handleSelectSite}
      />

      {/* Климатический Стресс-Тест: Black Swan 2025-2035 (TCFD) */}
      <StressTestModal
        isOpen={isStressTestModalOpen}
        onClose={() => setIsStressTestModalOpen(false)}
        siteId={selectedSiteId}
        sites={sites}
        siteName={selectedSite?.name}
        areaHa={calculation?.area_ha ?? selectedSite?.area_ha ?? 1000.0}
        onSelectSite={handleSelectSite}
        onLaunchSwipe={(targetYear?: number) => {
          setIsStressTestModalOpen(false);
          setIsSwipeActive(true);
          setSwipeLeftLayer('biomass');
          setSwipeLeftYear(2024);
          setSwipeRightLayer('stress');
          setSwipeRightYear(targetYear || 2027);
          setSwipePosition(50);
        }}
      />
    </div>
  );
};
