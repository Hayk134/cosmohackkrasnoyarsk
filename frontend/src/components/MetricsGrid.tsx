import React from 'react';
import {
  Globe2,
  TreeDeciduous,
  Activity,
  Award,
  CircleDollarSign,
  ShieldAlert,
} from 'lucide-react';
import { CalculationResponse, SiteInfo } from '../api/client';
import { formatNumber, formatInt, formatRub, formatPercent } from '../utils';

interface MetricsGridProps {
  calculation: CalculationResponse | null;
  site: SiteInfo | null;
  loading: boolean;
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({ calculation, site, loading }) => {
  if (loading && !calculation) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
          />
        ))}
      </div>
    );
  }

  const [showGross, setShowGross] = React.useState<boolean>(true);
  const areaHa = calculation?.area_ha ?? site?.area_ha ?? 0;
  const rGross = calculation?.r_gross_t_co2e ?? 0;
  const qUnits = calculation?.q_tradable_units ?? 0;
  const uncRatio = calculation?.unc_deduction ?? 0;
  const bufferReserve = calculation?.buffer_reserve ?? 0;
  const moranI = calculation?.moran_i ?? 0;
  const vif = calculation?.vif ?? 1;

  const val500 = calculation?.scenario_valuations?.rub_500 ?? qUnits * 500;
  const val1500 = calculation?.scenario_valuations?.rub_1500 ?? qUnits * 1500;
  const val4000 = calculation?.scenario_valuations?.rub_4000 ?? qUnits * 4000;

  const isValid = calculation?.is_valid ?? true;
  const blockingReason = calculation?.blocking_reason;

  return (
    <div className="space-y-3">
      {/* Blocking Alert Banner if invalid */}
      {!isValid && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-300">
          <ShieldAlert className="h-6 w-6 shrink-0 text-rose-400" />
          <div className="text-sm">
            <span className="font-semibold text-rose-200">Выпуск единиц заблокирован: </span>
            {blockingReason || 'Проект не удовлетворяет критериям углеродной валидации'}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Card 1: Ellipsoidal Area */}
        <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/80 p-5 transition hover:border-zinc-700">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Площадь WGS 84</span>
            <div className="rounded-xl bg-zinc-800/80 p-2 text-zinc-300">
              <Globe2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-white">
              {formatNumber(areaHa, 2)}{' '}
              <span className="text-sm font-normal text-zinc-400">га</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-300">
                {(areaHa / 100).toFixed(2)} км²
              </span>
              <span>эллипсоид WGS84</span>
            </div>
          </div>
        </div>

        {/* Card 2: Carbon Benefit (R) */}
        <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/80 p-5 transition hover:border-zinc-700">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Эффект проекта (R)</span>
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-400">
              <TreeDeciduous className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-white">
              {formatNumber(rGross, 1)}{' '}
              <span className="text-sm font-normal text-zinc-400">т CO₂e</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
              <span>ΔAGB:</span>
              <span className="font-mono text-emerald-400 font-semibold">
                {formatNumber(calculation?.delta_biomass_t_ha, 2)} т/га
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Spatial Uncertainty */}
        <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/80 p-5 transition hover:border-zinc-700">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Неопределённость</span>
            <div className="rounded-xl bg-amber-500/10 p-2 text-amber-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-white">
              {formatPercent(uncRatio)}{' '}
              <span className="text-sm font-normal text-zinc-400">вычет</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
              <span title="Пространственный автокорреляционный коэффициент Moran's I">
                I: <span className="font-mono text-zinc-300">{moranI.toFixed(3)}</span>
              </span>
              <span>•</span>
              <span title="Variance Inflation Factor (Clifford-Ord)">
                VIF: <span className="font-mono text-zinc-300">{vif.toFixed(2)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Tradable Credits (Q) */}
        <div className="group relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-zinc-900/90 to-zinc-900/90 p-5 shadow-lg shadow-emerald-500/5 transition hover:border-emerald-500/60">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Углеродные единицы (Q)
            </span>
            <div className="rounded-xl bg-emerald-500/20 p-2 text-emerald-300">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold tracking-tight text-emerald-400">
              {formatInt(qUnits)}{' '}
              <span className="text-sm font-semibold text-emerald-300">ед.</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
              <span>Буфер 15%:</span>
              <span className="font-mono text-zinc-300">{formatNumber(bufferReserve, 1)} т</span>
            </div>
          </div>
        </div>

        {/* Card 5: Valuation Scenarios */}
        {(() => {
          const eProj = calculation?.e_proj_t_co2e ?? 0;
          const grossAbs = Math.max(0, -eProj);
          const isNetBlocked = qUnits === 0;
          const isDisplayingGross = isNetBlocked && showGross;
          const activeVal1500 = isDisplayingGross
            ? (grossAbs > 0 ? grossAbs * 1500 : Math.abs(eProj) * 1500)
            : val1500;
          const activeVal500 = isDisplayingGross
            ? (grossAbs > 0 ? grossAbs * 500 : Math.abs(eProj) * 500)
            : val500;
          const activeVal4000 = isDisplayingGross
            ? (grossAbs > 0 ? grossAbs * 4000 : Math.abs(eProj) * 4000)
            : val4000;

          return (
            <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/80 p-5 transition hover:border-zinc-700">
              <div className="flex items-center justify-between text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {isDisplayingGross ? 'Валовая ценность' : 'Оценка (Базовый)'}
                  </span>
                  {isNetBlocked && (
                    <button
                      onClick={() => setShowGross(!showGross)}
                      className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/20 hover:bg-zinc-700 transition"
                      title="Переключить между валовой ценностью CO₂ и сертифицированным выпуском Net Q"
                    >
                      {showGross ? 'CO₂ Вал' : 'Net Q'}
                    </button>
                  )}
                </div>
                <div className="rounded-xl bg-zinc-800/80 p-2 text-emerald-400">
                  <CircleDollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold tracking-tight text-emerald-400">
                  {formatRub(activeVal1500)}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>500₽: {formatNumber(activeVal500 / 1000, 0)}k</span>
                  <span>4000₽: {formatNumber(activeVal4000 / 1000, 0)}k</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
