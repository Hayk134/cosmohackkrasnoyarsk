import React, { useState, useMemo } from 'react';
import {
  Scale,
  Activity,
  Layers,
  FileDown,
} from 'lucide-react';
import { SiteInfo } from '../../api/client';
import { exportEcologistComparePDF } from '../../pdfExport';

interface EcologistCompareProps {
  sites: SiteInfo[];
  currentSiteId: string;
}

export const EcologistCompare: React.FC<EcologistCompareProps> = ({
  sites,
  currentSiteId,
}) => {
  const [siteAId, setSiteAId] = useState<string>(currentSiteId);
  const [siteBId, setSiteBId] = useState<string>(() => {
    const other = sites.find((s) => s.id !== currentSiteId);
    return other ? other.id : (sites[1]?.id || 'RU_MORDOVIA_03');
  });

  const siteA = sites.find((s) => s.id === siteAId) || {
    id: siteAId,
    name: 'Участок А',
    area_ha: 1750.5,
  };
  const siteB = sites.find((s) => s.id === siteBId) || {
    id: siteBId,
    name: 'Участок Б',
    area_ha: 1832.8,
  };

  // Mock biophysical characteristics modeled according to forest registry data
  const bioA = useMemo(() => {
    const isMordovia = siteAId.includes('MORDOVIA');
    const isKrasnoyarsk = siteAId.includes('KRASNOYARSK');
    return {
      agb_t_ha: isMordovia ? 112.5 : isKrasnoyarsk ? 145.0 : 183.3,
      delta_agb_yr: isMordovia ? 1.85 : isKrasnoyarsk ? 0.95 : 0.43,
      cf: isMordovia ? 0.48 : isKrasnoyarsk ? 0.50 : 0.51,
      species: isMordovia ? 'Берёза / Сосна (смешанный)' : isKrasnoyarsk ? 'Лиственница сибирская' : 'Сосна обыкновенная (хвойный)',
      fire_history: isMordovia ? 'Очаг 2021 г. (14% площади), восстановление' : 'Термических аномалий не обнаружено',
      ndvi_mean: isMordovia ? 0.76 : 0.82,
      uncertainty_sd: isMordovia ? 18.5 : 14.2,
      req_drone_pct: isMordovia ? 2.5 : 1.5,
      pools: {
        agb: isMordovia ? 54.0 : 93.5,
        bgb: isMordovia ? 12.5 : 21.5,
        cwd: isMordovia ? 6.2 : 4.8,
        litter: isMordovia ? 4.8 : 5.4,
        soil: 0, // excluded under conservativeness
      },
    };
  }, [siteAId]);

  const bioB = useMemo(() => {
    const isMordovia = siteBId.includes('MORDOVIA');
    const isKrasnoyarsk = siteBId.includes('KRASNOYARSK');
    return {
      agb_t_ha: isMordovia ? 112.5 : isKrasnoyarsk ? 145.0 : 183.3,
      delta_agb_yr: isMordovia ? 1.85 : isKrasnoyarsk ? 0.95 : 0.43,
      cf: isMordovia ? 0.48 : isKrasnoyarsk ? 0.50 : 0.51,
      species: isMordovia ? 'Берёза / Сосна (смешанный)' : isKrasnoyarsk ? 'Лиственница сибирская' : 'Сосна обыкновенная (хвойный)',
      fire_history: isMordovia ? 'Очаг 2021 г. (14% площади), восстановление' : 'Термических аномалий не обнаружено',
      ndvi_mean: isMordovia ? 0.76 : 0.82,
      uncertainty_sd: isMordovia ? 18.5 : 14.2,
      req_drone_pct: isMordovia ? 2.5 : 1.5,
      pools: {
        agb: isMordovia ? 54.0 : 93.5,
        bgb: isMordovia ? 12.5 : 21.5,
        cwd: isMordovia ? 6.2 : 4.8,
        litter: isMordovia ? 4.8 : 5.4,
        soil: 0,
      },
    };
  }, [siteBId]);

  // 10-year NDVI retrospective curve comparison (2015 - 2024)
  const ndviYears = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
  const ndviCurveA = useMemo(() => {
    return [0.79, 0.80, 0.81, 0.81, 0.82, 0.82, 0.81, 0.82, 0.83, 0.83];
  }, []);

  const ndviCurveB = useMemo(() => {
    const isMordovia = siteBId.includes('MORDOVIA');
    if (isMordovia) {
      // drop in 2021 fire, then recovery
      return [0.78, 0.79, 0.79, 0.80, 0.80, 0.81, 0.68, 0.72, 0.75, 0.77];
    }
    return [0.74, 0.75, 0.75, 0.76, 0.77, 0.78, 0.78, 0.79, 0.80, 0.81];
  }, [siteBId]);

  // SVG Chart calculation for NDVI
  const chartW = 540;
  const chartH = 170;
  const pad = { top: 15, right: 30, bottom: 25, left: 45 };
  const plotW = chartW - pad.left - pad.right;
  const plotH = chartH - pad.top - pad.bottom;

  const minNdvi = 0.65;
  const maxNdvi = 0.88;
  const rangeNdvi = maxNdvi - minNdvi;

  const pointsNdviA = ndviCurveA.map((val, idx) => ({
    x: pad.left + (idx / (ndviYears.length - 1)) * plotW,
    y: pad.top + ((maxNdvi - val) / rangeNdvi) * plotH,
    val,
  }));

  const pointsNdviB = ndviCurveB.map((val, idx) => ({
    x: pad.left + (idx / (ndviYears.length - 1)) * plotW,
    y: pad.top + ((maxNdvi - val) / rangeNdvi) * plotH,
    val,
  }));

  const pathNdviA = pointsNdviA.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), '');
  const pathNdviB = pointsNdviB.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), '');

  return (
    <div className="flex flex-col gap-4 text-zinc-100">
      {/* Top Banner */}
      <div className="liquid-glass rounded-2xl p-3.5 border border-zinc-800 bg-zinc-950/80 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3A4831]/50 text-[#a5b997]">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Экологическое сопоставление биофизических параметров
            </h3>
            <p className="text-[11px] text-zinc-400">
              Сравнение запасов биомассы, темпов поглощения углерода и стабильности полога
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportEcologistComparePDF(siteA, siteB, bioA, bioB)}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900/90 hover:bg-zinc-800 px-3.5 py-1.5 text-xs font-semibold text-[#c8d4be] hover:text-white transition shadow-sm"
            title="Скачать сравнительный экологический паспорт 2 участков"
          >
            <FileDown className="h-3.5 w-3.5 text-[#a5b997]" />
            <span>Скачать PDF сравнения</span>
          </button>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#3A4831] text-[#c8d4be] border border-[#5c744f]/40">
            ГОСТ Р ИСО 14064-2
          </span>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Site A */}
        <div className="rounded-xl bg-[#274934]/25 border border-[#3A4831] p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#a5b997] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#7f9870] inline-block" />
              Полигон №1 (Зелёный контур)
            </span>
            <span className="text-[11px] font-mono text-zinc-400">{siteA.area_ha.toFixed(0)} га</span>
          </div>
          <select
            value={siteAId}
            onChange={(e) => setSiteAId(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded-lg p-2 font-medium focus:outline-none focus:border-[#7f9870]"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.area_ha.toFixed(0)} га)
              </option>
            ))}
          </select>
        </div>

        {/* Site B */}
        <div className="rounded-xl bg-zinc-900/70 border border-zinc-700/60 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#c8d4be] inline-block" />
              Полигон №2 (Светлый контур)
            </span>
            <span className="text-[11px] font-mono text-zinc-400">{siteB.area_ha.toFixed(0)} га</span>
          </div>
          <select
            value={siteBId}
            onChange={(e) => setSiteBId(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded-lg p-2 font-medium focus:outline-none focus:border-zinc-500"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.area_ha.toFixed(0)} га)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Biophysical Scorecards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
        {/* Card 1: AGB Density */}
        <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-1">
          <span className="text-[10px] text-zinc-400 uppercase">Плотность биомассы AGB</span>
          <div className="flex items-baseline justify-between mt-1">
            <div>
              <span className="text-[10px] text-[#7f9870] block">Участок 1</span>
              <span className="font-mono font-bold text-sm text-white">{bioA.agb_t_ha} т/га</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-400 block">Участок 2</span>
              <span className="font-mono font-bold text-sm text-zinc-300">{bioB.agb_t_ha} т/га</span>
            </div>
          </div>
          <div className="text-[9px] text-zinc-400 mt-0.5">
            {bioA.agb_t_ha >= bioB.agb_t_ha ? 'Выше базовый запас биомассы у Участка 1' : 'Выше базовый запас биомассы у Участка 2'}
          </div>
        </div>

        {/* Card 2: Annual Growth rate (Delta AGB) */}
        <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-1">
          <span className="text-[10px] text-zinc-400 uppercase">Темп годового поглощения</span>
          <div className="flex items-baseline justify-between mt-1">
            <div>
              <span className="text-[10px] text-[#7f9870] block">Участок 1</span>
              <span className="font-mono font-bold text-sm text-white">+{bioA.delta_agb_yr} т/га/г</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-400 block">Участок 2</span>
              <span className="font-mono font-bold text-sm text-zinc-300">+{bioB.delta_agb_yr} т/га/г</span>
            </div>
          </div>
          <div className="text-[9px] font-semibold text-[#a5b997] mt-0.5">
            {bioA.delta_agb_yr >= bioB.delta_agb_yr ? '✓ Быстрее прирастает Участок 1' : '✓ Быстрее прирастает Участок 2'}
          </div>
        </div>

        {/* Card 3: Carbon Fraction CF */}
        <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-1">
          <span className="text-[10px] text-zinc-400 uppercase">Коэффициент углерода (CF)</span>
          <div className="flex items-baseline justify-between mt-1">
            <div>
              <span className="text-[10px] text-[#7f9870] block">Участок 1</span>
              <span className="font-mono font-bold text-sm text-white">{bioA.cf.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-400 block">Участок 2</span>
              <span className="font-mono font-bold text-sm text-zinc-300">{bioB.cf.toFixed(2)}</span>
            </div>
          </div>
          <div className="text-[9px] text-zinc-400 mt-0.5 truncate">
            {bioA.species.split(' ')[0]} vs {bioB.species.split(' ')[0]}
          </div>
        </div>

        {/* Card 4: LiDAR Drone Calibration Required */}
        <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-1">
          <span className="text-[10px] text-zinc-400 uppercase">Требуемый объём БПЛА</span>
          <div className="flex items-baseline justify-between mt-1">
            <div>
              <span className="text-[10px] text-[#7f9870] block">Участок 1</span>
              <span className="font-mono font-bold text-sm text-white">{bioA.req_drone_pct}%</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-400 block">Участок 2</span>
              <span className="font-mono font-bold text-sm text-zinc-300">{bioB.req_drone_pct}%</span>
            </div>
          </div>
          <div className="text-[9px] text-zinc-400 mt-0.5">
            Погрешность: ±{bioA.uncertainty_sd} vs ±{bioB.uncertainty_sd} т/га
          </div>
        </div>
      </div>

      {/* Visual Chart 1: 5 Carbon Pools Comparison */}
      <div className="liquid-glass rounded-2xl p-4 border border-zinc-800 bg-zinc-950/70 flex flex-col gap-3 shadow-xl">
        <div className="flex items-center justify-between text-xs border-b border-zinc-800/80 pb-2">
          <span className="font-bold text-white flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-[#a5b997]" />
            Сравнение углеродных пулов (т C / га)
          </span>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5 text-[#a5b997]">
              <span className="w-2.5 h-2.5 bg-[#7f9870] rounded-sm inline-block" />
              {siteA.name}
            </span>
            <span className="flex items-center gap-1.5 text-[#c8d4be]">
              <span className="w-2.5 h-2.5 bg-[#c8d4be] rounded-sm inline-block" />
              {siteB.name}
            </span>
          </div>
        </div>

        {/* Horizontal Stack Bar Comparison */}
        <div className="flex flex-col gap-2.5 text-xs">
          {/* 1. AGB */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-300">1. Стволы и кроны (AGB)</span>
              <span className="font-mono text-zinc-400">
                {bioA.pools.agb} vs {bioB.pools.agb} т C/га
              </span>
            </div>
            <div className="w-full bg-zinc-900 rounded-lg h-3 overflow-hidden flex gap-0.5 p-0.5 border border-zinc-800">
              <div
                className="bg-[#7f9870] h-full rounded transition-all duration-300"
                style={{ width: `${Math.min(100, (bioA.pools.agb / 120) * 100)}%` }}
                title={`${siteA.name}: ${bioA.pools.agb} т C/га`}
              />
              <div
                className="bg-[#c8d4be] h-full rounded transition-all duration-300 opacity-80"
                style={{ width: `${Math.min(100, (bioB.pools.agb / 120) * 100)}%` }}
                title={`${siteB.name}: ${bioB.pools.agb} т C/га`}
              />
            </div>
          </div>

          {/* 2. BGB */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-300">2. Подземная биомасса корней (BGB)</span>
              <span className="font-mono text-zinc-400">
                {bioA.pools.bgb} vs {bioB.pools.bgb} т C/га
              </span>
            </div>
            <div className="w-full bg-zinc-900 rounded-lg h-3 overflow-hidden flex gap-0.5 p-0.5 border border-zinc-800">
              <div
                className="bg-[#7f9870] h-full rounded transition-all duration-300"
                style={{ width: `${Math.min(100, (bioA.pools.bgb / 30) * 100)}%` }}
              />
              <div
                className="bg-[#c8d4be] h-full rounded transition-all duration-300 opacity-80"
                style={{ width: `${Math.min(100, (bioB.pools.bgb / 30) * 100)}%` }}
              />
            </div>
          </div>

          {/* 3. CWD & Litter */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-300">3. Валеж и лесная подстилка (CWD + Litter)</span>
              <span className="font-mono text-zinc-400">
                {(bioA.pools.cwd + bioA.pools.litter).toFixed(1)} vs {(bioB.pools.cwd + bioB.pools.litter).toFixed(1)} т C/га
              </span>
            </div>
            <div className="w-full bg-zinc-900 rounded-lg h-3 overflow-hidden flex gap-0.5 p-0.5 border border-zinc-800">
              <div
                className="bg-[#7f9870] h-full rounded transition-all duration-300"
                style={{ width: `${Math.min(100, ((bioA.pools.cwd + bioA.pools.litter) / 15) * 100)}%` }}
              />
              <div
                className="bg-[#c8d4be] h-full rounded transition-all duration-300 opacity-80"
                style={{ width: `${Math.min(100, ((bioB.pools.cwd + bioB.pools.litter) / 15) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Visual Chart 2: 10-Year NDVI & Disturbance Dynamics */}
      <div className="liquid-glass rounded-2xl p-4 border border-zinc-800 bg-zinc-950/70 flex flex-col gap-2.5 shadow-xl">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-[#a5b997]" />
            Сравнительная динамика вегетационного индекса NDVI (2015–2024)
          </span>
          <span className="text-[10px] text-zinc-400 font-mono">
            Sentinel-2 & Landsat-8
          </span>
        </div>

        {/* SVG Chart */}
        <div className="relative w-full overflow-hidden">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto overflow-visible select-none">
            {/* Grid Lines */}
            <line x1={pad.left} y1={pad.top} x2={chartW - pad.right} y2={pad.top} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="3 3" />
            <line x1={pad.left} y1={pad.top + plotH / 2} x2={chartW - pad.right} y2={pad.top + plotH / 2} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="3 3" />
            <line x1={pad.left} y1={pad.top + plotH} x2={chartW - pad.right} y2={pad.top + plotH} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="3 3" />

            <text x={pad.left - 6} y={pad.top + 3} textAnchor="end" fill="#71717a" fontSize="8" fontFamily="monospace">
              0.88
            </text>
            <text x={pad.left - 6} y={pad.top + plotH / 2 + 3} textAnchor="end" fill="#71717a" fontSize="8" fontFamily="monospace">
              0.76
            </text>
            <text x={pad.left - 6} y={pad.top + plotH + 3} textAnchor="end" fill="#71717a" fontSize="8" fontFamily="monospace">
              0.65
            </text>

            {/* Path A */}
            <path d={pathNdviA} fill="none" stroke="#7f9870" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {pointsNdviA.map((p, i) => (
              <circle key={`a-${i}`} cx={p.x} cy={p.y} r="2.5" fill="#3A4831" stroke="#7f9870" strokeWidth="1.5" />
            ))}

            {/* Path B */}
            <path d={pathNdviB} fill="none" stroke="#c8d4be" strokeWidth="2" strokeDasharray="4 2" strokeLinecap="round" strokeLinejoin="round" />
            {pointsNdviB.map((p, i) => (
              <circle key={`b-${i}`} cx={p.x} cy={p.y} r="2" fill="#27272a" stroke="#c8d4be" strokeWidth="1.5" />
            ))}

            {/* X Ticks */}
            {pointsNdviA.map((p, i) => {
              if (i % 2 !== 0 && i !== ndviYears.length - 1) return null;
              return (
                <text key={`tx-${i}`} x={p.x} y={chartH - 8} textAnchor="middle" fill="#71717a" fontSize="8" fontFamily="monospace">
                  {ndviYears[i]}
                </text>
              );
            })}
          </svg>
        </div>

        <div className="flex justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/80">
          <span>{siteA.name}: стабильный здоровый полог (NDVI ≈ 0.82)</span>
          <span>{siteB.name}: {siteBId.includes('MORDOVIA') ? 'просадка 2021 г. (пожар), активный рост молодняка' : 'устойчивый тренд'}</span>
        </div>
      </div>
    </div>
  );
};
