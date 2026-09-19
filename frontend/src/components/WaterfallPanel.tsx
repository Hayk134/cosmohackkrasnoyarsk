import React from 'react';
import {
  Calculator,
  ShieldCheck,
  ShieldAlert,
  FileText,
} from 'lucide-react';
import { CalculationResponse } from '../api/client';
import { formatNumber, formatInt } from '../utils';

interface WaterfallPanelProps {
  calculation: CalculationResponse | null;
  loading: boolean;
  onOpenReport?: () => void;
}

export const WaterfallPanel: React.FC<WaterfallPanelProps> = ({
  calculation,
  loading,
  onOpenReport,
}) => {
  if (loading && !calculation) {
    return (
      <div className="h-80 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5" />
    );
  }

  if (!calculation) return null;

  const isValid = calculation.is_valid;
  const qUnits = calculation.q_tradable_units;
  const hOverR = calculation.h_over_r ?? 0;

  const summaryRows = [
    {
      label: 'Площадь участка',
      value: `${formatNumber(calculation.area_ha, 1)} га`,
      sub: 'Границы полигона',
    },
    {
      label: 'Динамика биомассы',
      value: `${calculation.delta_biomass_t_ha >= 0 ? '+' : ''}${formatNumber(calculation.delta_biomass_t_ha, 2)} т/га`,
      sub: 'Плотность древостоя',
      highlight: true,
      color: calculation.delta_biomass_t_ha >= 0 ? 'text-emerald-400' : 'text-rose-400',
    },
    {
      label: 'Запас углерода',
      value: `${calculation.delta_c_total_t >= 0 ? '+' : ''}${formatNumber(calculation.delta_c_total_t, 1)} т C`,
      sub: 'Пул углерода',
    },
    {
      label: 'Поглощение CO₂',
      value: `${formatNumber(calculation.e_proj_t_co2e, 1)} т CO₂e`,
      sub: 'Экосистемный баланс',
      color: calculation.e_proj_t_co2e <= 0 ? 'text-emerald-400' : 'text-rose-400',
    },
    {
      label: 'Базовый тренд',
      value: `${formatNumber(calculation.e_base_t_co2e, 1)} т CO₂e`,
      sub: 'Ретроспективный фон',
    },
    {
      label: 'Дополнительность (R)',
      value: `${formatNumber(calculation.r_gross_t_co2e, 1)} т CO₂e`,
      sub: calculation.r_gross_t_co2e > 0 ? 'Превышение базы' : 'Ниже базового тренда',
      highlight: true,
      color: calculation.r_gross_t_co2e > 0 ? 'text-emerald-400' : 'text-zinc-400',
    },
    {
      label: 'Погрешность измерений',
      value: calculation.h_over_r !== undefined ? `${(hOverR * 100).toFixed(1)}%` : 'н/д',
      sub: 'Спутниковая дисперсия',
      color: hOverR < 1.0 ? 'text-emerald-300' : 'text-rose-400',
    },
    {
      label: 'Консервативный вычет',
      value: `${(calculation.unc_deduction * 100).toFixed(0)}%`,
      sub: 'Дисконт неопределённости',
    },
    {
      label: 'Буферный резерв',
      value: `${formatNumber(calculation.buffer_reserve, 1)} т CO₂e`,
      sub: 'Гарантийный пул 15%',
    },
    {
      label: 'Выпуск углеродных единиц',
      value: `${formatInt(qUnits)} ед.`,
      sub: qUnits === 0 ? 'Базовый тренд не превышен' : 'Сертифицированный объём',
      isGrand: true,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 1. Summary Card Header */}
      <div className="liquid-glass-subtle rounded-2xl p-3 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-[#3A4831]/40 p-1.5 text-[#a5b997]">
            <Calculator className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Баланс углеродного счёта</h4>
            <p className="text-[10px] text-zinc-400">Верификация MRV · Методология ОКУВ</p>
          </div>
        </div>

        <div
          className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
            isValid
              ? 'bg-[#3A4831] text-[#c8d4be]'
              : 'bg-zinc-800/80 text-zinc-400'
          }`}
        >
          {isValid ? (
            <>
              <ShieldCheck className="h-3 w-3 text-[#a5b997]" />
              <span>Сертифицирован</span>
            </>
          ) : (
            <>
              <ShieldAlert className="h-3 w-3 text-zinc-400" />
              <span>Аудит MRV</span>
            </>
          )}
        </div>
      </div>

      {/* 2. Key Metrics Table */}
      <div className="liquid-glass-subtle rounded-2xl p-2.5 shadow-xl flex flex-col gap-1 text-xs">
        {summaryRows.map((row, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-between px-2 py-1 rounded-lg transition ${
              row.isGrand
                ? 'bg-[#3A4831] font-bold text-white shadow-sm'
                : idx % 2 === 0
                ? 'bg-zinc-900/50'
                : 'bg-transparent'
            }`}
          >
            <div className="flex flex-col">
              <span className={`text-[11px] ${row.isGrand ? 'text-white font-bold' : 'text-zinc-300'}`}>
                {row.label}
              </span>
              <span className="text-[9px] text-zinc-400">{row.sub}</span>
            </div>
            <span
              className={`font-mono text-xs font-bold ${
                row.isGrand
                  ? 'text-[#c8d4be] text-sm'
                  : row.color || 'text-zinc-100'
              }`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* 5. CTA: Open Full 17-Step Audit & Report Modal */}
      {onOpenReport && (
        <button
          onClick={onOpenReport}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#3A4831] hover:bg-[#485c3e] text-white font-semibold py-2.5 px-4 text-xs transition shadow-md"
        >
          <FileText className="h-4 w-4" />
          <span>Подробнее: Полный 17-шаговый аудит и отчёт</span>
        </button>
      )}
    </div>
  );
};
