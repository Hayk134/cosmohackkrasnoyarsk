import React, { useState } from 'react';
import { LineChart, TrendingUp } from 'lucide-react';
import { TimeseriesResponse, TimeseriesItem, ProjectionItem } from '../api/client';
import { formatNumber } from '../utils';

interface ChartsPanelProps {
  timeseries: TimeseriesResponse | null;
  loading: boolean;
  yearStart?: number;
  yearEnd?: number;
  calculation?: any;
}

export const ChartsPanel: React.FC<ChartsPanelProps> = ({
  timeseries,
  loading,
  yearStart = 2019,
  yearEnd = 2024,
  calculation,
}) => {
  const [retroMetric, setRetroMetric] = useState<'biomass' | 'carbon'>('biomass');
  const [hoveredRetro, setHoveredRetro] = useState<TimeseriesItem | null>(null);
  const [hoveredProj, setHoveredProj] = useState<ProjectionItem | null>(null);

  if (loading && !timeseries) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5" />
        <div className="h-80 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5" />
      </div>
    );
  }

  const retro = timeseries?.retrospective || [];
  const proj = timeseries?.projections || [];
  const startIndex = retro.findIndex((d) => d.year === yearStart);
  const endIndex = retro.findIndex((d) => d.year === yearEnd);

  // -------------------------------------------------------------
  // Chart 1: Retrospective SVG Rendering (2015 - 2024)
  // -------------------------------------------------------------
  const chartW = 540;
  const chartH = 220;
  const padL = 55;
  const padR = 20;
  const padT = 18;
  const padB = 28;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const retroVals = retro.map((d) =>
    retroMetric === 'biomass' ? d.biomass_t_ha : d.carbon_stock_t
  );
  const minRetro = retroVals.length ? Math.min(...retroVals) * 0.95 : 0;
  const maxRetro = retroVals.length ? Math.max(...retroVals) * 1.05 : 100;
  const rangeRetro = maxRetro - minRetro || 1;

  const getRetroX = (index: number) => {
    if (retro.length <= 1) return padL + plotW / 2;
    return padL + (index / (retro.length - 1)) * plotW;
  };

  const getRetroY = (val: number) => {
    return padT + plotH - ((val - minRetro) / rangeRetro) * plotH;
  };

  const retroLinePath = retro
    .map((d, i) => {
      const val = retroMetric === 'biomass' ? d.biomass_t_ha : d.carbon_stock_t;
      return `${i === 0 ? 'M' : 'L'} ${getRetroX(i)} ${getRetroY(val)}`;
    })
    .join(' ');

  const retroAreaPath = retro.length
    ? `${retroLinePath} L ${getRetroX(retro.length - 1)} ${padT + plotH} L ${getRetroX(0)} ${padT + plotH} Z`
    : '';

  // -------------------------------------------------------------
  // Chart 2: Projection SVG Rendering (2025 - 2029)
  // -------------------------------------------------------------
  const projValsAll = proj.flatMap((d) => [d.e_base, d.e_proj_est, d.ci_lower, d.ci_upper]);
  const minProj = projValsAll.length ? Math.min(...projValsAll) * 1.1 : -100;
  const maxProj = projValsAll.length ? Math.max(...projValsAll) * 1.1 : 100;
  const rangeProj = maxProj - minProj || 1;

  const getProjX = (index: number) => {
    if (proj.length <= 1) return padL + plotW / 2;
    return padL + (index / (proj.length - 1)) * plotW;
  };

  const getProjY = (val: number) => {
    return padT + plotH - ((val - minProj) / rangeProj) * plotH;
  };

  // Base line path
  const baseLinePath = proj
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getProjX(i)} ${getProjY(d.e_base)}`)
    .join(' ');

  // Project estimate line path
  const projLinePath = proj
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getProjX(i)} ${getProjY(d.e_proj_est)}`)
    .join(' ');

  // 95% Confidence Shaded Area Path
  const ciAreaPath = proj.length
    ? proj.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getProjX(i)} ${getProjY(d.ci_upper)}`).join(' ') +
      ' ' +
      proj
        .slice()
        .reverse()
        .map((d, i) => `L ${getProjX(proj.length - 1 - i)} ${getProjY(d.ci_lower)}`)
        .join(' ') +
      ' Z'
    : '';

  return (
    <div className="flex flex-col gap-4">
      {/* --------------------------------------------------------- */}
      {/* 0. Dynamic Selected Period Summary Card */}
      {/* --------------------------------------------------------- */}
      {calculation && (
        <div className="liquid-glass rounded-2xl p-3 border border-emerald-500/40 shadow-xl bg-emerald-950/20">
          <div className="flex items-center justify-between border-b border-emerald-900/40 pb-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                Период проекта: {yearStart} → {yearEnd} ({calculation.delta_years || (yearEnd - yearStart)} {calculation.delta_years === 1 ? 'год' : calculation.delta_years < 5 ? 'года' : 'лет'})
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-700/50 font-semibold">
              Спутниковый MRV
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
              <div className="text-[9px] text-zinc-400 uppercase font-medium">Биомасса AGB</div>
              <div className="font-mono text-xs font-bold text-zinc-200 mt-0.5">
                {formatNumber(calculation.t0_biomass_t_ha || 0, 1)} → {formatNumber(calculation.t1_biomass_t_ha || 0, 1)}
              </div>
              <div className={`text-[10px] font-mono font-semibold mt-0.5 ${(calculation.delta_biomass_t_ha || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                Δ {(calculation.delta_biomass_t_ha || 0) >= 0 ? '+' : ''}{formatNumber(calculation.delta_biomass_t_ha || 0, 2)} т/га
              </div>
            </div>

            <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
              <div className="text-[9px] text-zinc-400 uppercase font-medium">Запас углерода</div>
              <div className={`font-mono text-xs font-bold mt-0.5 ${(calculation.delta_carbon_t || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {(calculation.delta_carbon_t || 0) >= 0 ? '+' : ''}{formatNumber(calculation.delta_carbon_t || 0, 1)} т C
              </div>
              <div className="text-[9px] text-zinc-500 mt-0.5">CF = 0.47</div>
            </div>

            <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
              <div className="text-[9px] text-zinc-400 uppercase font-medium">Эффект проекта</div>
              <div className={`font-mono text-xs font-bold mt-0.5 ${(calculation.e_proj_t_co2e || 0) <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatNumber(calculation.e_proj_t_co2e || 0, 1)} т CO₂e
              </div>
              <div className="text-[9px] text-zinc-500 mt-0.5">
                {formatNumber(calculation.e_proj_rate_t_co2e_ha_yr || 0, 2)} т/га/год
              </div>
            </div>

            <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
              <div className="text-[9px] text-zinc-400 uppercase font-medium">Базовый тренд</div>
              <div className="font-mono text-xs font-bold text-zinc-200 mt-0.5">
                {formatNumber(calculation.e_base_t_co2e || 0, 1)} т CO₂e
              </div>
              <div className="text-[9px] text-zinc-500 mt-0.5">
                {formatNumber(calculation.e_base_rate_t_co2e_ha_yr || 0, 2)} т/га/год
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* Chart 1: Retrospective Dynamics 2015-2024 */}
      {/* --------------------------------------------------------- */}
      <div className="liquid-glass rounded-2xl p-3 shadow-xl border border-emerald-500/20 flex flex-col overflow-hidden">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-400 border border-emerald-500/20">
                <LineChart className="h-3.5 w-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Динамика биомассы (2015–2024)</h4>
                <p className="text-[10px] text-zinc-400">Спутниковые измерения ESA CCI</p>
              </div>
            </div>

            {/* Toggle metric */}
            <div className="flex items-center rounded-lg bg-zinc-950 p-0.5 text-[10px]">
              <button
                onClick={() => setRetroMetric('biomass')}
                className={`rounded px-2 py-0.5 font-medium transition ${
                  retroMetric === 'biomass'
                    ? 'bg-[#3A4831] text-white font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Биомасса (т/га)
              </button>
              <button
                onClick={() => setRetroMetric('carbon')}
                className={`rounded px-2 py-0.5 font-medium transition ${
                  retroMetric === 'carbon'
                    ? 'bg-[#3A4831] text-white font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Углерод (т C)
              </button>
            </div>
          </div>

          {/* SVG Canvas */}
          <div className="relative mt-2 overflow-hidden">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto overflow-hidden">
              <defs>
                <linearGradient id="retroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7f9870" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#7f9870" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = padT + plotH * pct;
                const val = maxRetro - pct * rangeRetro;
                return (
                  <g key={i}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={padL + plotW}
                      y2={y}
                      stroke="#27272a"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padL - 8}
                      y={y + 4}
                      fill="#71717a"
                      fontSize="10"
                      textAnchor="end"
                      fontFamily="monospace"
                    >
                      {formatNumber(val, 0)}
                    </text>
                  </g>
                );
              })}

              {/* Area Under Curve */}
              {retroAreaPath && <path d={retroAreaPath} fill="url(#retroGrad)" />}

              {/* Highlighted Selected Period Corridor */}
              {startIndex >= 0 && endIndex >= 0 && startIndex < endIndex && (
                <g>
                  <rect
                    x={getRetroX(startIndex)}
                    y={padT}
                    width={getRetroX(endIndex) - getRetroX(startIndex)}
                    height={plotH}
                    fill="rgba(16, 185, 129, 0.12)"
                    stroke="rgba(16, 185, 129, 0.6)"
                    strokeWidth="1.5"
                    strokeDasharray="3 2"
                    rx="3"
                  />
                  <line
                    x1={getRetroX(startIndex)}
                    y1={padT}
                    x2={getRetroX(startIndex)}
                    y2={padT + plotH}
                    stroke="#7f9870"
                    strokeWidth="1.5"
                  />
                  <line
                    x1={getRetroX(endIndex)}
                    y1={padT}
                    x2={getRetroX(endIndex)}
                    y2={padT + plotH}
                    stroke="#7f9870"
                    strokeWidth="1.5"
                  />
                </g>
              )}

              {/* Uncertainty error bars / envelope */}
              {retro.map((d, i) => {
                if (d.sd === undefined || d.sd === null) return null;
                const val = retroMetric === 'biomass' ? d.biomass_t_ha : d.carbon_stock_t;
                const sdScaled = retroMetric === 'biomass' ? d.sd : d.sd * 0.47 * (d.carbon_stock_t / (d.biomass_t_ha || 1));
                const yTop = getRetroY(val + sdScaled);
                const yBot = getRetroY(val - sdScaled);
                const x = getRetroX(i);
                return (
                  <g key={`err-${i}`}>
                    <line x1={x} y1={yTop} x2={x} y2={yBot} stroke="#3A4831" strokeWidth="1.5" strokeOpacity="0.4" />
                    <line x1={x - 3} y1={yTop} x2={x + 3} y2={yTop} stroke="#3A4831" strokeWidth="1.5" strokeOpacity="0.4" />
                    <line x1={x - 3} y1={yBot} x2={x + 3} y2={yBot} stroke="#3A4831" strokeWidth="1.5" strokeOpacity="0.4" />
                  </g>
                );
              })}

              {/* Line */}
              {retroLinePath && (
                <path d={retroLinePath} fill="none" stroke="#3A4831" strokeWidth="2.5" />
              )}

              {/* Points */}
              {retro.map((d, i) => {
                const val = retroMetric === 'biomass' ? d.biomass_t_ha : d.carbon_stock_t;
                const x = getRetroX(i);
                const y = getRetroY(val);
                const isHovered = hoveredRetro?.year === d.year;

                return (
                  <g
                    key={d.year}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredRetro(d)}
                    onMouseLeave={() => setHoveredRetro(null)}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 6 : 4}
                      fill={isHovered ? '#3A4831' : '#2B4023'}
                      stroke="#09090b"
                      strokeWidth="2"
                    />
                    {/* X axis labels */}
                    <text
                      x={x}
                      y={padT + plotH + 18}
                      fill={isHovered ? '#7f9870' : '#71717a'}
                      fontSize="10"
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontWeight={isHovered ? 'bold' : 'normal'}
                    >
                      {d.year}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredRetro && (
              <div className="absolute top-2 right-4 rounded-xl border border-zinc-800 bg-zinc-950/90 px-3 py-2 text-xs backdrop-blur-md shadow-lg pointer-events-none">
                <div className="font-bold text-white">Год: {hoveredRetro.year}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-zinc-400">Плотность AGB:</span>
                  <span className="font-mono font-semibold text-emerald-400">
                    {formatNumber(hoveredRetro.biomass_t_ha, 2)} т/га
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">Запас углерода C:</span>
                  <span className="font-mono font-semibold text-zinc-200">
                    {formatNumber(hoveredRetro.carbon_stock_t, 1)} т C
                  </span>
                </div>
                {hoveredRetro.sd && (
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <span>Погрешность SD:</span>
                    <span className="font-mono">±{formatNumber(hoveredRetro.sd, 2)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-zinc-800/80 pt-2 text-[11px] text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" />
            <span>Фактические спутниковые измерения</span>
          </div>
          <span>Погрешность SD</span>
        </div>
      </div>

      {/* --------------------------------------------------------- */}
      {/* Chart 2: Projection & Counterfactual Baseline (2025-2029) */}
      {/* --------------------------------------------------------- */}
      <div className="liquid-glass rounded-2xl p-3 shadow-xl border border-emerald-900/50 flex flex-col overflow-hidden">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-amber-500/10 p-1.5 text-amber-400 border border-amber-500/20">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Прогноз углеродного баланса (2025–2029)</h4>
                <p className="text-[10px] text-zinc-400">
                  Прогноз поглощения и базовая линия (95% ДИ)
                </p>
              </div>
            </div>

            {/* Legend indicators */}
            <div className="flex items-center gap-2.5 text-[10px] text-zinc-400">
              <div className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-3 rounded-sm bg-amber-500/30" />
                <span>95% ДИ</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-2.5 bg-zinc-400" />
                <span>Базовая линия</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-2.5 bg-[#7f9870]" />
                <span>Проектный сценарий</span>
              </div>
            </div>
          </div>

          {/* SVG Canvas */}
          <div className="relative mt-2 overflow-hidden">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto overflow-hidden">
              <defs>
                <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = padT + plotH * pct;
                const val = maxProj - pct * rangeProj;
                return (
                  <g key={i}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={padL + plotW}
                      y2={y}
                      stroke="#27272a"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padL - 8}
                      y={y + 4}
                      fill="#71717a"
                      fontSize="10"
                      textAnchor="end"
                      fontFamily="monospace"
                    >
                      {formatNumber(val, 0)}
                    </text>
                  </g>
                );
              })}

              {/* 95% Confidence Interval Band */}
              {ciAreaPath && <path d={ciAreaPath} fill="url(#ciGrad)" />}

              {/* Base line (dashed) */}
              {baseLinePath && (
                <path
                  d={baseLinePath}
                  fill="none"
                  stroke="#a1a1aa"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />
              )}

              {/* Project line (solid forest green) */}
              {projLinePath && (
                <path d={projLinePath} fill="none" stroke="#3A4831" strokeWidth="2.5" />
              )}

              {/* Points */}
              {proj.map((d, i) => {
                const x = getProjX(i);
                const yProj = getProjY(d.e_proj_est);
                const yBase = getProjY(d.e_base);
                const isHovered = hoveredProj?.year === d.year;

                return (
                  <g
                    key={d.year}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredProj(d)}
                    onMouseLeave={() => setHoveredProj(null)}
                  >
                    {/* Baseline point */}
                    <circle cx={x} cy={yBase} r={3.5} fill="#a1a1aa" stroke="#09090b" strokeWidth="1.5" />
                    {/* Project point */}
                    <circle
                      cx={x}
                      cy={yProj}
                      r={isHovered ? 6 : 4}
                      fill={isHovered ? '#3A4831' : '#2B4023'}
                      stroke="#09090b"
                      strokeWidth="2"
                    />
                    {/* X axis labels */}
                    <text
                      x={x}
                      y={padT + plotH + 18}
                      fill={isHovered ? '#7f9870' : '#71717a'}
                      fontSize="10"
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontWeight={isHovered ? 'bold' : 'normal'}
                    >
                      {d.year}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredProj && (
              <div className="absolute top-2 right-4 rounded-xl border border-zinc-800 bg-zinc-950/90 px-3 py-2 text-xs backdrop-blur-md shadow-lg pointer-events-none">
                <div className="font-bold text-white">Прогноз: {hoveredProj.year} г.</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-zinc-400">Проектные эмиссии E_proj:</span>
                  <span className="font-mono font-semibold text-emerald-400">
                    {formatNumber(hoveredProj.e_proj_est, 1)} т CO₂e
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">Базовый уровень E_base:</span>
                  <span className="font-mono font-semibold text-zinc-300">
                    {formatNumber(hoveredProj.e_base, 1)} т CO₂e
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-amber-400">
                  <span>95% ДИ [L, U]:</span>
                  <span className="font-mono">
                    [{formatNumber(hoveredProj.ci_lower, 1)}; {formatNumber(hoveredProj.ci_upper, 1)}]
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-zinc-800/80 pt-2 text-[11px] text-zinc-400">
          <span>Разность кривых = Углеродный эффект (R)</span>
          <span>Доверительный коридор α=0.05</span>
        </div>
      </div>
    </div>
  );
};
