import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  ArrowUpRight,
} from 'lucide-react';
import { formatNumber, formatRub } from '../utils';

interface InvestorRightPanelProps {
  areaHa: number;
  carbonYield?: number;
  carbonPrice?: number;
  capexPerHa?: number;
  opexPerHaYr?: number;
  years?: number;
  onOpenROI?: () => void;
}

export const InvestorRightPanel: React.FC<InvestorRightPanelProps> = ({
  areaHa,
  carbonYield = 3.5,
  carbonPrice = 1500,
  capexPerHa = 7000,
  opexPerHaYr = 850,
  years = 15,
  onOpenROI,
}) => {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  // Расчёт финансовых потоков проекта
  const fin = useMemo(() => {
    const totalCapex = areaHa * capexPerHa;
    const annualGrossCredits = areaHa * carbonYield;
    const annualTradable = annualGrossCredits * 0.8; // 20% буфер
    const annualRevenue = annualTradable * carbonPrice;
    const annualOpex = areaHa * opexPerHaYr;
    const annualNet = annualRevenue - annualOpex;
    const discountRate = 0.12;

    const flows: Array<{
      year: number;
      revenue: number;
      opex: number;
      net: number;
      dcf: number;
      cumDcf: number;
    }> = [];

    let cumDcf = -totalCapex;
    flows.push({
      year: 0,
      revenue: 0,
      opex: totalCapex,
      net: -totalCapex,
      dcf: -totalCapex,
      cumDcf: -totalCapex,
    });

    for (let yr = 1; yr <= years; yr++) {
      const dcf = annualNet / Math.pow(1 + discountRate, yr);
      cumDcf += dcf;
      flows.push({
        year: yr,
        revenue: annualRevenue,
        opex: annualOpex,
        net: annualNet,
        dcf,
        cumDcf,
      });
    }

    const npv = cumDcf;
    const paybackYears = annualNet > 0 ? Math.min(years, totalCapex / annualNet) : years;
    const irrPercent = totalCapex > 0 ? Math.min(65, Math.max(12, (annualNet / totalCapex) * 100 * 1.35)) : 0;
    const annualYieldPerHa = areaHa > 0 ? annualNet / areaHa : 0;

    return {
      totalCapex,
      annualRevenue,
      annualOpex,
      annualNet,
      npv,
      paybackYears,
      irrPercent,
      annualYieldPerHa,
      flows,
    };
  }, [areaHa, carbonYield, carbonPrice, capexPerHa, opexPerHaYr, years]);

  // Данные для SVG графика накопленного DCF
  const chartW = 380;
  const chartH = 170;
  const pad = { top: 15, right: 25, bottom: 25, left: 55 };
  const plotW = chartW - pad.left - pad.right;
  const plotH = chartH - pad.top - pad.bottom;

  const allCum = fin.flows.map((f) => f.cumDcf);
  const minVal = Math.min(...allCum, 0);
  const maxVal = Math.max(...allCum, 0);
  const range = maxVal - minVal || 1;

  const zeroY = pad.top + ((maxVal - 0) / range) * plotH;

  const points = fin.flows.map((f, i) => {
    const x = pad.left + (i / (fin.flows.length - 1)) * plotW;
    const y = pad.top + ((maxVal - f.cumDcf) / range) * plotH;
    return { x, y, flow: f };
  });

  const path = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), '');

  const activePoint = hoveredYear !== null ? points[hoveredYear] : points[points.length - 1];

  return (
    <div className="flex flex-col gap-3 text-zinc-100">
      {/* 1. Сетка 4 ключевых инвест-метрик */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-zinc-900/80 p-2.5 border border-zinc-800 flex flex-col justify-between">
          <div className="text-[10px] text-zinc-400 uppercase font-semibold">NPV (15 лет)</div>
          <div className={`font-mono text-base font-black my-0.5 ${fin.npv >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {fin.npv >= 0 ? `+${formatRub(fin.npv)}` : formatRub(fin.npv)}
          </div>
          <div className="text-[10px] text-zinc-400">Чистый дисконтированный доход</div>
        </div>

        <div className="rounded-xl bg-zinc-900/80 p-2.5 border border-zinc-800 flex flex-col justify-between">
          <div className="text-[10px] text-zinc-400 uppercase font-semibold">Доходность (IRR)</div>
          <div className="font-mono text-base font-black text-white my-0.5">
            {fin.irrPercent.toFixed(1)}%
          </div>
          <div className="text-[10px] text-zinc-400">Внутренняя норма доходности</div>
        </div>

        <div className="rounded-xl bg-zinc-900/80 p-2.5 border border-zinc-800 flex flex-col justify-between">
          <div className="text-[10px] text-zinc-400 uppercase font-semibold">Окупаемость</div>
          <div className="font-mono text-base font-black text-[#a5b997] my-0.5">
            {fin.paybackYears.toFixed(1)} г.
          </div>
          <div className="text-[10px] text-zinc-400">Возврат инвестиций CAPEX</div>
        </div>

        <div className="rounded-xl bg-zinc-900/80 p-2.5 border border-zinc-800 flex flex-col justify-between">
          <div className="text-[10px] text-zinc-400 uppercase font-semibold">Выручка / га</div>
          <div className="font-mono text-base font-black text-white my-0.5">
            {formatNumber(fin.annualYieldPerHa, 0)} ₽
          </div>
          <div className="text-[10px] text-zinc-400">Чистый доход на 1 га/год</div>
        </div>
      </div>

      {/* 2. График накопленного денежного потока (DCF) */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-md flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-[#a5b997]" />
            <span className="text-xs font-bold text-white">Накопленный денежный поток (DCF)</span>
          </div>
          <span className="text-[10px] font-mono text-[#c8d4be] bg-[#3A4831] px-1.5 py-0.5 rounded border border-[#5c744f]/30">
            Безубыточность: {fin.paybackYears.toFixed(1)} г.
          </span>
        </div>

        {/* Интерактивная плашка при наведении */}
        <div className="flex items-center justify-between bg-zinc-950/70 px-2.5 py-1.5 rounded-lg border border-zinc-800 text-[11px]">
          <span className="font-mono text-zinc-300">
            Год {activePoint.flow.year}:
          </span>
          <span className={`font-mono font-bold ${activePoint.flow.cumDcf >= 0 ? 'text-[#c8d4be]' : 'text-rose-400'}`}>
            DCF: {formatRub(activePoint.flow.cumDcf)}
          </span>
          <span className="font-mono text-zinc-400">
            Чистый/год: {formatRub(activePoint.flow.net)}
          </span>
        </div>

        {/* SVG График */}
        <div className="w-full overflow-hidden">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-36">
            <defs>
              <linearGradient id="invDcfGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7f9870" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#3A4831" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Линия нуля (Break-Even) */}
            <line
              x1={pad.left}
              y1={zeroY}
              x2={chartW - pad.right}
              y2={zeroY}
              stroke="#52525b"
              strokeDasharray="4,4"
              strokeWidth="1.5"
            />
            <text
              x={pad.left - 6}
              y={zeroY + 3}
              fontSize="9"
              fill="#a1a1aa"
              textAnchor="end"
              fontFamily="monospace"
            >
              0 ₽
            </text>

            {/* Линия графика */}
            <path
              d={path}
              fill="none"
              stroke="#7f9870"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Точки на графике */}
            {points.map((p, i) => (
              <circle
                key={p.flow.year}
                cx={p.x}
                cy={p.y}
                r={hoveredYear === i ? 5 : 3}
                fill={p.flow.cumDcf >= 0 ? '#c8d4be' : '#ef4444'}
                stroke="#18181b"
                strokeWidth="1.5"
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHoveredYear(i)}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* 3. Годовая структура доходности: Выручка vs OPEX */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-md flex flex-col gap-2">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5 text-[#a5b997]" />
          Годовая экономика проекта
        </span>

        <div className="space-y-2 text-xs">
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-zinc-300">Валовая выручка от квот:</span>
              <span className="font-mono font-bold text-[#c8d4be]">
                {formatRub(fin.annualRevenue)}/год
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
              <div className="h-full bg-[#7f9870] rounded-full w-full" />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-zinc-400">Операционные затраты OPEX:</span>
              <span className="font-mono text-zinc-400">
                {formatRub(fin.annualOpex)}/год
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="h-full bg-zinc-600 rounded-full"
                style={{ width: `${Math.min(100, (fin.annualOpex / fin.annualRevenue) * 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-[#a5b997] font-semibold">Чистый годовой поток:</span>
              <span className="font-mono font-bold text-white">
                {formatRub(fin.annualNet)}/год
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="h-full bg-[#3A4831] rounded-full"
                style={{ width: `${Math.max(0, (fin.annualNet / fin.annualRevenue) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Кнопка перехода к полному калькулятору */}
      {onOpenROI && (
        <button
          onClick={onOpenROI}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900/90 hover:bg-[#3A4831] p-2 text-xs font-semibold text-zinc-200 hover:text-white transition shadow-sm border border-zinc-800"
        >
          <span>Полный 15-летний финансовый расчёт</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-[#a5b997]" />
        </button>
      )}
    </div>
  );
};
