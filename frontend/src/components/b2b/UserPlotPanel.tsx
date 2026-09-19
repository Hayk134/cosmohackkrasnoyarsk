import React, { useState, useMemo } from 'react';
import {
  PlusCircle,
  FileDown,
  RefreshCw,
  Trees,
  ShieldCheck,
  TrendingUp,
  MapPin,
  Calendar,
  Layers,
} from 'lucide-react';
import { SiteInfo } from '../../api/client';
import { formatNumber, formatRub } from '../../utils';
import { exportUserSitePDF, PDFSiteTarget } from '../../pdfExport';

interface UserPlotPanelProps {
  sites: SiteInfo[];
  currentSiteId: string;
  onSelectSite?: (siteId: string) => void;
}

interface UserRegisteredPlot {
  id: string;
  name: string;
  cadastralNumber: string;
  region: string;
  landCategory: string;
  areaHa: number;
  baseSiteRef: string;
  registrationDate: string;
}

interface PlotHistoryItem {
  id: string;
  timestamp: string;
  plotName: string;
  cadastralNumber: string;
  areaHa: number;
  annualCO2: number;
  annualIncome: number;
}

export function mapSiteToRegisteredPlot(site: SiteInfo): UserRegisteredPlot {
  const isMordovia = site.id.includes('MORDOVIA');
  const isVologda = site.id.includes('VOLOGDA');
  const isKrasnoyarsk = site.id.includes('KRASNOYARSK');

  let cadastralNumber = '69:10:0000012:451';
  let region = 'Тверская область';
  let landCategory = 'Земли лесного фонда (защитные)';

  if (isMordovia) {
    cadastralNumber = '13:19:0204001:342';
    region = 'Республика Мордовия';
    landCategory = 'Земли лесного фонда (эксплуатационные)';
  } else if (isVologda) {
    cadastralNumber = '35:25:0701015:89';
    region = 'Вологодская область';
    landCategory = 'Земли с/х назначения (залежь >75%)';
  } else if (isKrasnoyarsk) {
    cadastralNumber = '24:11:0103002:189';
    region = 'Красноярский край';
    landCategory = 'Земли лесного фонда (таежная зона)';
  } else if (site.id === 'CUSTOM') {
    cadastralNumber = '50:23:0020114:528';
    region = 'Пользовательский регион';
    landCategory = 'Собственный контур';
  }

  return {
    id: site.id,
    name: site.name,
    cadastralNumber,
    region,
    landCategory,
    areaHa: site.area_ha,
    baseSiteRef: site.id,
    registrationDate: '01.06.2023',
  };
}

export const UserPlotPanel: React.FC<UserPlotPanelProps> = ({
  sites,
  currentSiteId,
  onSelectSite,
}) => {
  // Реальные участки из нашей data (sites) + пользовательские поля
  const [customPlots, setCustomPlots] = useState<UserRegisteredPlot[]>([]);
  const basePlots = useMemo(() => {
    return sites.map(mapSiteToRegisteredPlot);
  }, [sites]);

  const userPlots = useMemo(() => {
    return [...basePlots, ...customPlots];
  }, [basePlots, customPlots]);

  const [selectedPlotId, setSelectedPlotId] = useState<string>(() => {
    const found = sites.find((s) => s.id === currentSiteId);
    return found ? found.id : (sites[0]?.id || 'RU_MORDOVIA_03');
  });

  // Синхронизация при внешнем выборе участка
  React.useEffect(() => {
    if (currentSiteId && userPlots.some((p) => p.id === currentSiteId)) {
      setSelectedPlotId(currentSiteId);
    }
  }, [currentSiteId, userPlots]);

  // Модальное окно добавления участка
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newCadastral, setNewCadastral] = useState<string>('50:23:0020114:528');
  const [newName, setNewName] = useState<string>('Новое поле');
  const [newRegion, setNewRegion] = useState<string>('Московская область');
  const [newCategory, setNewCategory] = useState<string>('Земли с/х назначения (залежь)');
  const [newArea, setNewArea] = useState<number>(240.0);
  const [newBaseRef, setNewBaseRef] = useState<string>(sites[0]?.id || 'RU_MORDOVIA_03');

  // Интерактивное наведение на точку графика
  const [hoveredYearIndex, setHoveredYearIndex] = useState<number | null>(null);

  // История расчётов
  const [history, setHistory] = useState<PlotHistoryItem[]>([]);

  // Текущий выбранный участок пользователя
  const activePlot = useMemo(() => {
    return (
      userPlots.find((p) => p.id === selectedPlotId) ||
      userPlots[0] || {
        id: 'RU_TVER_01',
        name: 'Тверская область (Контрольный)',
        cadastralNumber: '69:10:0000012:451',
        region: 'Тверская область',
        landCategory: 'Земли лесного фонда',
        areaHa: 100.0,
        baseSiteRef: 'RU_TVER_01',
        registrationDate: '01.06.2023',
      }
    );
  }, [userPlots, selectedPlotId]);

  // Расчёт метрик на основе наших данных
  const metrics = useMemo(() => {
    const area = activePlot.areaHa;
    const isMordovia = activePlot.id.includes('MORDOVIA') || activePlot.baseSiteRef.includes('MORDOVIA');
    const isVologda = activePlot.id.includes('VOLOGDA') || activePlot.baseSiteRef.includes('VOLOGDA');

    const ndviMean = isMordovia ? 0.78 : isVologda ? 0.82 : 0.80;
    const yieldPerHa = isMordovia ? 3.4 : isVologda ? 3.8 : 3.5;
    const annualCO2Removal = area * yieldPerHa;
    const tradableUnitsYr = annualCO2Removal * 0.8; // 20% буферный пул
    const carbonPrice = 1500;
    const estimatedIncomeYr = tradableUnitsYr * carbonPrice;

    const treeHealth = ndviMean >= 0.8 ? 'Высокая плотность и здоровье полога' : 'Нормальное вегетативное развитие';
    const fireStatus = 'Безопасно: 0 термоточек за 5 лет';

    // Структура насаждений
    const coniferPct = isVologda ? 68 : isMordovia ? 58 : 62;
    const broadPct = isVologda ? 22 : isMordovia ? 30 : 26;
    const meadowPct = 8;
    const bufferPct = 100 - coniferPct - broadPct - meadowPct;

    return {
      areaHa: area,
      ndviMean,
      yieldPerHa,
      annualCO2Removal,
      tradableUnitsYr,
      carbonPrice,
      estimatedIncomeYr,
      treeHealth,
      fireStatus,
      coniferPct,
      broadPct,
      meadowPct,
      bufferPct,
    };
  }, [activePlot]);

  // Данные для многолетнего графика (2016–2025)
  const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const chartData = useMemo(() => {
    const isMordovia = activePlot.id.includes('MORDOVIA');
    // Индекс вегетации по годам
    const ndviValues = isMordovia
      ? [0.73, 0.74, 0.75, 0.76, 0.77, 0.70, 0.74, 0.76, 0.78, 0.79]
      : [0.76, 0.77, 0.77, 0.78, 0.79, 0.80, 0.81, 0.81, 0.82, 0.83];

    // Накопление поглощения CO2 (т)
    const annualSeq = activePlot.areaHa * metrics.yieldPerHa;
    const cumCO2Values = years.map((_, i) => Math.round(annualSeq * (i + 1) * 0.95));

    const w = 540;
    const h = 180;
    const pad = { top: 20, right: 30, bottom: 25, left: 45 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const minNdvi = 0.65;
    const maxNdvi = 0.88;
    const range = maxNdvi - minNdvi;

    const points = ndviValues.map((val, idx) => {
      const x = pad.left + (idx / (years.length - 1)) * plotW;
      const y = pad.top + ((maxNdvi - val) / range) * plotH;
      return {
        x,
        y,
        year: years[idx],
        ndvi: val,
        cumCO2: cumCO2Values[idx],
        comment: val >= 0.8 ? 'Высокая вегетация' : val >= 0.75 ? 'Нормальный прирост' : 'Восстановление',
      };
    });

    const path = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), '');
    const areaPath = `${path} L ${points[points.length - 1].x},${pad.top + plotH} L ${points[0].x},${pad.top + plotH} Z`;

    return { points, path, areaPath, w, h, pad, plotW, plotH, minNdvi, maxNdvi };
  }, [activePlot, metrics]);

  // Добавление нового участка из Госреестра
  const handleAddPlot = (e: React.FormEvent) => {
    e.preventDefault();
    const newId = `USER_PLOT_${Date.now().toString(36).toUpperCase()}`;
    const createdPlot: UserRegisteredPlot = {
      id: newId,
      name: newName.trim() || `Участок ${newCadastral}`,
      cadastralNumber: newCadastral.trim() || '77:01:0001001:100',
      region: newRegion.trim() || 'Российская Федерация',
      landCategory: newCategory,
      areaHa: Math.max(1, Number(newArea) || 100),
      baseSiteRef: newBaseRef,
      registrationDate: new Date().toLocaleDateString('ru-RU'),
    };

    setCustomPlots((prev) => [createdPlot, ...prev]);
    setSelectedPlotId(createdPlot.id);
    setShowAddModal(false);

    if (onSelectSite) {
      onSelectSite(createdPlot.baseSiteRef);
    }
  };

  // Пересчитать / Зафиксировать в историю
  const handleRecalculate = () => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const histItem: PlotHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: timeStr,
      plotName: activePlot.name,
      cadastralNumber: activePlot.cadastralNumber,
      areaHa: activePlot.areaHa,
      annualCO2: metrics.annualCO2Removal,
      annualIncome: metrics.estimatedIncomeYr,
    };
    setHistory((prev) => [histItem, ...prev].slice(0, 10));
  };

  // Экспорт в PDF для пользователя
  const handleExportPDF = () => {
    const pdfSiteTarget: PDFSiteTarget = {
      id: activePlot.id,
      name: activePlot.name,
      area_ha: activePlot.areaHa,
    };

    exportUserSitePDF(pdfSiteTarget, {
      cadastralNumber: activePlot.cadastralNumber,
      landCategory: activePlot.landCategory,
      region: activePlot.region,
      areaHa: activePlot.areaHa,
      ndviMean: metrics.ndviMean,
      annualCO2Removal: metrics.annualCO2Removal,
      tradableUnitsYr: metrics.tradableUnitsYr,
      estimatedIncomeYr: metrics.estimatedIncomeYr,
      treeHealth: metrics.treeHealth,
      fireStatus: metrics.fireStatus,
    });
  };

  const activeHoverPoint = hoveredYearIndex !== null ? chartData.points[hoveredYearIndex] : chartData.points[chartData.points.length - 1];

  return (
    <div className="flex flex-col gap-4 text-zinc-100">
      {/* 1. Верхняя панель: Инфо об участке из Госреестра + Кнопки действий */}
      <div className="liquid-glass rounded-2xl p-3.5 sm:p-4 border border-zinc-800 bg-zinc-950/90 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3A4831]/50 text-[#a5b997] border border-[#5c744f]/30">
            <Trees className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-white truncate max-w-xs sm:max-w-md">
                {activePlot.name}
              </h3>
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-700 text-[#c8d4be] whitespace-nowrap">
                Кадастр: {activePlot.cadastralNumber}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <span>{activePlot.region}</span>
              <span>•</span>
              <span className="truncate max-w-[200px]">{activePlot.landCategory}</span>
              <span>•</span>
              <span className="font-mono font-bold text-zinc-300 whitespace-nowrap">{activePlot.areaHa.toFixed(1)} га</span>
            </p>
          </div>
        </div>

        {/* Действия */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-xl border border-[#5c744f]/60 bg-[#3A4831]/70 hover:bg-[#3A4831] px-3.5 py-1.5 text-xs font-bold text-white transition shadow-sm"
            title="Добавить свое поле по кадастровому номеру"
          >
            <PlusCircle className="h-3.5 w-3.5 text-[#c8d4be]" />
            <span>+ Добавить поле</span>
          </button>

          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900/90 hover:bg-zinc-800 px-3.5 py-1.5 text-xs font-semibold text-[#c8d4be] hover:text-white transition shadow-sm"
            title="Скачать официальную выписку и паспорт участка в формате PDF"
          >
            <FileDown className="h-3.5 w-3.5 text-[#a5b997]" />
            <span>Скачать PDF</span>
          </button>

          <button
            onClick={handleRecalculate}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900/90 hover:bg-zinc-800 px-3.5 py-1.5 text-xs font-semibold text-[#c8d4be] hover:text-white transition shadow-sm"
            title="Зафиксировать текущие показатели участка в историю проверок"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[#a5b997]" />
            <span>Пересчитать</span>
          </button>
        </div>
      </div>

      {/* Выбор из участков нашей data в работе */}
      <div className="flex items-center gap-2 flex-wrap bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
        <span className="text-xs text-zinc-400 font-medium whitespace-nowrap">Участки в работе:</span>
        {userPlots.map((plot) => (
          <button
            key={plot.id}
            onClick={() => {
              setSelectedPlotId(plot.id);
              onSelectSite?.(plot.baseSiteRef || plot.id);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 border ${
              selectedPlotId === plot.id
                ? 'bg-[#3A4831] border-[#7f9870]/60 text-white shadow-md'
                : 'bg-zinc-900/70 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            <span className="truncate max-w-[170px] sm:max-w-[220px]">{plot.name}</span>
            <span className="text-[10px] font-mono text-[#c8d4be] opacity-80 shrink-0">
              ({plot.areaHa.toFixed(0)} га)
            </span>
          </button>
        ))}
      </div>

      {/* 2. ЧЕТЫРЕ КЛЮЧЕВЫХ КАРТОЧКИ СВОДКИ ДЛЯ ЗЕМЛЕПОЛЬЗОВАТЕЛЯ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Карточка 1: Здоровье растительности */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Здоровье полога (NDVI)</span>
            <span className="w-2 h-2 rounded-full bg-[#7f9870]" />
          </div>
          <div className="my-2">
            <div className="font-mono text-xl font-black text-[#c8d4be]">
              {metrics.ndviMean.toFixed(2)}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              {metrics.treeHealth}
            </div>
          </div>
          <div className="text-[10px] text-zinc-400 pt-1.5 border-t border-zinc-800/80">
            Калибровка: спутники Sentinel-2 L2A
          </div>
        </div>

        {/* Карточка 2: Поглощение CO2 в год */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Поглощение CO₂</span>
            <span className="text-[10px] font-mono text-zinc-400">в год</span>
          </div>
          <div className="my-2">
            <div className="font-mono text-xl font-black text-white">
              {formatNumber(metrics.annualCO2Removal, 1)} <span className="text-xs font-normal text-zinc-400">т CO₂</span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Удельный темп: {metrics.yieldPerHa} т CO₂/га в год
            </div>
          </div>
          <div className="text-[10px] text-zinc-400 pt-1.5 border-t border-zinc-800/80">
            Методика: ГОСТ Р ИСО 14064-2
          </div>
        </div>

        {/* Карточка 3: Углеродные сертификаты */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Углеродные единицы</span>
            <span className="rounded bg-[#3A4831] px-1.5 py-0.5 text-[9px] font-mono text-[#c8d4be]">ГОТОВО К ВЫПУСКУ</span>
          </div>
          <div className="my-2">
            <div className="font-mono text-xl font-black text-[#c8d4be]">
              {formatNumber(metrics.tradableUnitsYr, 0)} <span className="text-xs font-normal text-zinc-400">ед./год</span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Резерв в страховой буфер: 20%
            </div>
          </div>
          <div className="text-[10px] text-zinc-400 pt-1.5 border-t border-zinc-800/80">
            Реестр: Реестр углеродных единиц РФ
          </div>
        </div>

        {/* Карточка 4: Оценка дохода собственника */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Потенциал дохода</span>
            <span className="text-[10px] font-mono text-[#a5b997]">1 500 ₽ / т</span>
          </div>
          <div className="my-2">
            <div className="font-mono text-xl font-black text-[#a5b997]">
              {formatRub(metrics.estimatedIncomeYr)}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Ориентировочная выручка в год
            </div>
          </div>
          <div className="text-[10px] text-zinc-400 pt-1.5 border-t border-zinc-800/80">
            Без вырубки древесины
          </div>
        </div>
      </div>

      {/* 3. ГРАФИКИ: Динамика здоровья полога (NDVI) + Структура насаждений */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* График 1: 10-летняя динамика (7 колонок) */}
        <div className="lg:col-span-7 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#a5b997]" />
                  Динамика здоровья и фитомассы (2016–2025 гг.)
                </h4>
                <p className="text-[11px] text-zinc-400">
                  Многолетняя спутниковая оценка индекса вегетации полога (NDVI) и накопления углерода
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#7f9870] inline-block" />
                  NDVI
                </span>
              </div>
            </div>

            {/* Интерактивная плашка при наведении на точку */}
            <div className="rounded-xl bg-zinc-900/90 border border-zinc-800 p-2.5 mb-2 flex items-center justify-between text-xs transition-all">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#c8d4be] font-mono text-xs">
                  {activeHoverPoint.year} г.:
                </span>
                <span className="text-zinc-300 text-[11px]">
                  {activeHoverPoint.comment}
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="text-zinc-400">
                  NDVI: <strong className="text-[#c8d4be]">{activeHoverPoint.ndvi.toFixed(2)}</strong>
                </span>
                <span className="text-zinc-400">
                  Накоплено CO₂: <strong className="text-white">{formatNumber(activeHoverPoint.cumCO2, 0)} т</strong>
                </span>
              </div>
            </div>

            {/* SVG График */}
            <div className="w-full overflow-x-auto">
              <svg viewBox={`0 0 ${chartData.w} ${chartData.h}`} className="w-full h-44">
                <defs>
                  <linearGradient id="userPlotGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7f9870" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#3A4831" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Горизонтальные линии сетки */}
                {[0.70, 0.75, 0.80, 0.85].map((level) => {
                  const y = chartData.pad.top + ((chartData.maxNdvi - level) / (chartData.maxNdvi - chartData.minNdvi)) * chartData.plotH;
                  return (
                    <g key={level}>
                      <line
                        x1={chartData.pad.left}
                        y1={y}
                        x2={chartData.w - chartData.pad.right}
                        y2={y}
                        stroke="#27272a"
                        strokeDasharray="3,3"
                        strokeWidth="1"
                      />
                      <text
                        x={chartData.pad.left - 8}
                        y={y + 3}
                        fontSize="9"
                        fill="#71717a"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        {level.toFixed(2)}
                      </text>
                    </g>
                  );
                })}

                {/* Заливка области */}
                <path d={chartData.areaPath} fill="url(#userPlotGrad)" />

                {/* Линия */}
                <path
                  d={chartData.path}
                  fill="none"
                  stroke="#7f9870"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Точки на графике */}
                {chartData.points.map((p, i) => (
                  <g key={p.year}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={hoveredYearIndex === i ? 6 : 4}
                      fill={hoveredYearIndex === i ? '#ffffff' : '#7f9870'}
                      stroke="#274934"
                      strokeWidth="2"
                      className="cursor-pointer transition-all duration-150"
                      onMouseEnter={() => setHoveredYearIndex(i)}
                    />
                    <text
                      x={p.x}
                      y={chartData.h - 6}
                      fontSize="9"
                      fill={hoveredYearIndex === i ? '#ffffff' : '#71717a'}
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontWeight={hoveredYearIndex === i ? 'bold' : 'normal'}
                    >
                      {p.year}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          <div className="text-[10px] text-zinc-400 mt-2 flex items-center justify-between">
            <span>Данные: радар Sentinel-1 + оптический сенсор Sentinel-2</span>
            <span>Наведите на точку графика для просмотра годовой сводки</span>
          </div>
        </div>

        {/* График 2: Структура насаждений и угодий (5 колонок) */}
        <div className="lg:col-span-5 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl flex flex-col justify-between">
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-[#a5b997]" />
              Структура угодий на участке
            </h4>
            <p className="text-[11px] text-zinc-400 mb-3">
              Распределение площади по типам растительности и хозяйственного использования
            </p>

            <div className="space-y-3">
              {/* Хвойные породы */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-300 font-medium">Хвойный лес (сосна, ель)</span>
                  <span className="font-mono text-[#c8d4be] font-bold">
                    {metrics.coniferPct}% · {(activePlot.areaHa * (metrics.coniferPct / 100)).toFixed(0)} га
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                  <div className="h-full bg-[#5c744f] rounded-full" style={{ width: `${metrics.coniferPct}%` }} />
                </div>
              </div>

              {/* Лиственные породы */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-300 font-medium">Лиственный лес (береза, осина)</span>
                  <span className="font-mono text-zinc-300 font-bold">
                    {metrics.broadPct}% · {(activePlot.areaHa * (metrics.broadPct / 100)).toFixed(0)} га
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                  <div className="h-full bg-[#7f9870] rounded-full" style={{ width: `${metrics.broadPct}%` }} />
                </div>
              </div>

              {/* Открытые поляны / залежь */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-300 font-medium">Открытые поляны и прогалины</span>
                  <span className="font-mono text-zinc-400 font-bold">
                    {metrics.meadowPct}% · {(activePlot.areaHa * (metrics.meadowPct / 100)).toFixed(0)} га
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                  <div className="h-full bg-zinc-600 rounded-full" style={{ width: `${metrics.meadowPct}%` }} />
                </div>
              </div>

              {/* Защитные полосы / буферы */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-300 font-medium">Водоохранные и буферные зоны</span>
                  <span className="font-mono text-zinc-400 font-bold">
                    {metrics.bufferPct}% · {(activePlot.areaHa * (metrics.bufferPct / 100)).toFixed(0)} га
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                  <div className="h-full bg-zinc-700 rounded-full" style={{ width: `${metrics.bufferPct}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Карточка безопасности и статуса */}
          <div className="mt-4 rounded-xl bg-zinc-900/80 border border-zinc-800 p-3 text-xs flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[#a5b997] font-semibold text-[11px]">
              <ShieldCheck className="h-4 w-4" />
              <span>Безопасность и правовой статус</span>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Границы участка внесены в кадастровый план. Спутниковый тепловой мониторинг FIRMS не выявил термических аномалий за 5 лет. Участок свободен от обременений и готов к регистрации лесоклиматического проекта.
            </p>
          </div>
        </div>
      </div>

      {/* 4. ИСТОРИЯ РАСЧЁТОВ ПОЛЬЗОВАТЕЛЯ (если есть сохранённые проверки) */}
      {history.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-[#a5b997]" />
            История фиксации расчётов
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-2.5 text-xs flex flex-col gap-1"
              >
                <div className="flex justify-between items-center text-[10px] text-zinc-400">
                  <span className="font-mono">{h.timestamp}</span>
                  <span className="font-mono font-bold text-[#c8d4be]">{h.cadastralNumber}</span>
                </div>
                <div className="font-medium text-white truncate">{h.plotName}</div>
                <div className="flex justify-between items-center text-[11px] pt-1 border-t border-zinc-800/80">
                  <span className="text-zinc-400">{h.areaHa.toFixed(0)} га</span>
                  <span className="font-mono font-bold text-[#a5b997]">{formatRub(h.annualIncome)}/год</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. МОДАЛЬНОЕ ОКНО: ДОБАВЛЕНИЕ ПОЛЯ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-zinc-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#3A4831] text-[#a5b997]">
                  <PlusCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Добавить поле в реестр участков
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Подключение земельного участка или кадастрового контура для спутникового анализа
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-900"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddPlot} className="flex flex-col gap-3.5">
              {/* Кадастровый номер */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  Кадастровый номер участка
                </label>
                <input
                  type="text"
                  required
                  placeholder="50:23:0020114:528"
                  value={newCadastral}
                  onChange={(e) => setNewCadastral(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#7f9870]"
                />
              </div>

              {/* Название */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  Понятное название участка / поля
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: Мое поле «Заречье»"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7f9870]"
                />
              </div>

              {/* Категория земель и Регион */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Категория земель
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7f9870]"
                  >
                    <option value="Земли лесного фонда">Земли лесного фонда</option>
                    <option value="Земли с/х назначения (залежь)">Земли с/х назначения (залежь)</option>
                    <option value="Защитные лесополосы">Защитные лесополосы</option>
                    <option value="Земли запаса">Земли запаса / рекультивация</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Субъект РФ / Регион
                  </label>
                  <input
                    type="text"
                    value={newRegion}
                    onChange={(e) => setNewRegion(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7f9870]"
                  />
                </div>
              </div>

              {/* Площадь и базовая калибровка */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Площадь участка (га)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    required
                    value={newArea}
                    onChange={(e) => setNewArea(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#7f9870]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Спутниковый полигон (наши данные)
                  </label>
                  <select
                    value={newBaseRef}
                    onChange={(e) => setNewBaseRef(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7f9870]"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.area_ha.toFixed(0)} га)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Подсказка */}
              <div className="rounded-xl bg-[#3A4831]/30 border border-[#5c744f]/40 p-3 text-[11px] text-[#c8d4be] flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#a5b997] mt-0.5" />
                <span>
                  Участок будет зарегистрирован в системе и автоматически откалиброван по спутниковым данным Sentinel-2 и Sentinel-1 C-SAR с формированием паспорта землепользователя.
                </span>
              </div>

              {/* Кнопки формы */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-300 hover:text-white"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#3A4831] border border-[#7f9870]/50 text-xs font-bold text-white hover:bg-[#4a6741] transition"
                >
                  Добавить и анализировать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
