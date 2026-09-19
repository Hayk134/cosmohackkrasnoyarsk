import React, { useState } from 'react';
import {
  TrendingUp,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { formatNumber, formatRub } from '../utils';

interface UserRightPanelProps {
  areaHa: number;
  siteId?: string;
  siteName?: string;
  cadastralNumber?: string;
}

export const UserRightPanel: React.FC<UserRightPanelProps> = ({
  areaHa,
  siteId = 'RU_TVER_01',
  siteName = 'Поле проекта',
  cadastralNumber = '69:10:0000012:451',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const isMordovia = siteId.includes('MORDOVIA');
  const isVologda = siteId.includes('VOLOGDA');

  const ndviMean = isMordovia ? 0.78 : isVologda ? 0.82 : 0.80;
  const annualCO2 = areaHa * 3.5;
  const tradableUnits = annualCO2 * 0.8;
  const estimatedIncome = tradableUnits * 1500;

  // Данные для многолетнего графика (2016–2025)
  const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const ndviValues = isMordovia
    ? [0.73, 0.74, 0.75, 0.76, 0.77, 0.70, 0.74, 0.76, 0.78, 0.79]
    : [0.76, 0.77, 0.77, 0.78, 0.79, 0.80, 0.81, 0.81, 0.82, 0.83];

  const chartW = 380;
  const chartH = 150;
  const pad = { top: 15, right: 20, bottom: 22, left: 42 };
  const plotW = chartW - pad.left - pad.right;
  const plotH = chartH - pad.top - pad.bottom;

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
      val,
      comment: val >= 0.8 ? 'Высокая плотность полога' : 'Нормальный прирост древостоя',
    };
  });

  const path = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), '');
  const areaPath = `${path} L ${points[points.length - 1].x},${pad.top + plotH} L ${points[0].x},${pad.top + plotH} Z`;

  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : points[points.length - 1];

  // Структура угодий
  const coniferPct = isVologda ? 68 : isMordovia ? 58 : 62;
  const broadPct = isVologda ? 22 : isMordovia ? 30 : 26;
  const meadowPct = 8;
  const bufferPct = 100 - coniferPct - broadPct - meadowPct;

  return (
    <div className="flex flex-col gap-3 text-zinc-100">
      {/* 1. Карточки ключевых показателей для собственника */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-zinc-900/80 p-2.5 border border-zinc-800 flex flex-col justify-between">
          <div className="text-[10px] text-zinc-400 uppercase font-semibold">Индекс полога (NDVI)</div>
          <div className="font-mono text-base font-black text-[#c8d4be] my-0.5">
            {ndviMean.toFixed(2)}
          </div>
          <div className="text-[10px] text-zinc-400">Здоровый густой лес</div>
        </div>

        <div className="rounded-xl bg-zinc-900/80 p-2.5 border border-zinc-800 flex flex-col justify-between">
          <div className="text-[10px] text-zinc-400 uppercase font-semibold">Поглощение CO₂</div>
          <div className="font-mono text-base font-black text-white my-0.5">
            {formatNumber(annualCO2, 0)} т
          </div>
          <div className="text-[10px] text-zinc-400">В год на {areaHa.toFixed(0)} га</div>
        </div>

        <div className="rounded-xl bg-zinc-900/80 p-2.5 border border-zinc-800 flex flex-col justify-between">
          <div className="text-[10px] text-zinc-400 uppercase font-semibold">Квоты к выпуску</div>
          <div className="font-mono text-base font-black text-[#a5b997] my-0.5">
            {formatNumber(tradableUnits, 0)} шт
          </div>
          <div className="text-[10px] text-zinc-400">С учётом буфера 20%</div>
        </div>

        <div className="rounded-xl bg-zinc-900/80 p-2.5 border border-zinc-800 flex flex-col justify-between">
          <div className="text-[10px] text-zinc-400 uppercase font-semibold">Оценка выгоды</div>
          <div className="font-mono text-base font-black text-[#c8d4be] my-0.5">
            {formatRub(estimatedIncome)}
          </div>
          <div className="text-[10px] text-zinc-400">Годовой потенциал квот</div>
        </div>
      </div>

      {/* 2. График многолетней динамики здоровья полога */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-md flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-[#a5b997]" />
            <span className="text-xs font-bold text-white">Здоровье полога (2016–2025 гг.)</span>
          </div>
          <span className="text-[10px] font-mono text-[#c8d4be] bg-[#3A4831] px-1.5 py-0.5 rounded border border-[#5c744f]/30">
            Кадастр: {cadastralNumber}
          </span>
        </div>

        {/* Интерактивная плашка при наведении */}
        <div className="flex items-center justify-between bg-zinc-950/70 px-2.5 py-1.5 rounded-lg border border-zinc-800 text-[11px]">
          <span className="font-mono text-zinc-300">
            {activePoint.year} г.:
          </span>
          <span className="text-[#c8d4be] font-mono font-bold">
            NDVI {activePoint.val.toFixed(2)}
          </span>
          <span className="text-zinc-400 text-[10px] truncate max-w-[150px]">
            {activePoint.comment}
          </span>
        </div>

        {/* SVG График */}
        <div className="w-full overflow-hidden">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-32">
            <defs>
              <linearGradient id="userRightGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7f9870" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#3A4831" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Линии сетки */}
            {[0.70, 0.75, 0.80, 0.85].map((lvl) => {
              const y = pad.top + ((maxNdvi - lvl) / range) * plotH;
              return (
                <g key={lvl}>
                  <line
                    x1={pad.left}
                    y1={y}
                    x2={chartW - pad.right}
                    y2={y}
                    stroke="#27272a"
                    strokeDasharray="2,2"
                    strokeWidth="1"
                  />
                  <text
                    x={pad.left - 5}
                    y={y + 3}
                    fontSize="8"
                    fill="#71717a"
                    textAnchor="end"
                    fontFamily="monospace"
                  >
                    {lvl.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* Заливка под графиком */}
            <path d={areaPath} fill="url(#userRightGrad)" />

            {/* Линия */}
            <path
              d={path}
              fill="none"
              stroke="#7f9870"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Точки */}
            {points.map((p, i) => (
              <circle
                key={p.year}
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === i ? 4.5 : 2.5}
                fill={hoveredIdx === i ? '#ffffff' : '#7f9870'}
                stroke="#18181b"
                strokeWidth="1.5"
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHoveredIdx(i)}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* 3. Структура угодий на участке */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-md flex flex-col gap-2">
        <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
          <Layers className="h-3.5 w-3.5 text-[#a5b997] shrink-0" />
          <span className="truncate">Структура насаждений · {siteName}</span>
        </span>

        <div className="space-y-1.5 text-xs">
          <div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-zinc-300">Хвойный лес (сосна/ель):</span>
              <span className="font-mono text-[#c8d4be] font-bold">
                {coniferPct}% · {(areaHa * (coniferPct / 100)).toFixed(0)} га
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
              <div className="h-full bg-[#5c744f] rounded-full" style={{ width: `${coniferPct}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-zinc-300">Лиственный лес (береза):</span>
              <span className="font-mono text-zinc-300 font-bold">
                {broadPct}% · {(areaHa * (broadPct / 100)).toFixed(0)} га
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
              <div className="h-full bg-[#7f9870] rounded-full" style={{ width: `${broadPct}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-zinc-400">Поляны и залежь:</span>
              <span className="font-mono text-zinc-400">
                {meadowPct}% · {(areaHa * (meadowPct / 100)).toFixed(0)} га
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
              <div className="h-full bg-zinc-600 rounded-full" style={{ width: `${meadowPct}%` }} />
            </div>
          </div>

          {bufferPct > 0 && (
            <div>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span className="text-zinc-400">Буферная полоса и межи:</span>
                <span className="font-mono text-zinc-400">
                  {bufferPct}% · {(areaHa * (bufferPct / 100)).toFixed(0)} га
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                <div className="h-full bg-zinc-700 rounded-full" style={{ width: `${bufferPct}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-zinc-800/80 flex items-center gap-1.5 text-[10px] text-[#a5b997]">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span>Спутниковый мониторинг FIRMS: термических аномалий нет</span>
        </div>
      </div>
    </div>
  );
};
