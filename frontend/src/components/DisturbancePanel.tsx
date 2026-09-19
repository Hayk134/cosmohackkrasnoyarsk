import React from 'react';
import {
  Flame,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { DisturbanceResponse } from '../api/client';
import { formatNumber } from '../utils';

interface DisturbancePanelProps {
  disturbances: DisturbanceResponse | null;
  loading: boolean;
}

export const DisturbancePanel: React.FC<DisturbancePanelProps> = ({
  disturbances,
  loading,
}) => {
  if (loading && !disturbances) {
    return (
      <div className="h-44 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5" />
    );
  }

  if (!disturbances) return null;

  const hasFire = disturbances.modis_fire_detected;
  const hasLoss = disturbances.hansen_loss_detected;

  return (
    <div className="liquid-glass rounded-2xl p-3 shadow-xl border border-emerald-900/50">
      <div className="mb-2.5 flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-orange-500/10 p-1.5 text-orange-400">
            <Flame className="h-3.5 w-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Контроль нарушений (Пожары и рубки)</h4>
            <p className="text-[10px] text-zinc-400">Спутниковый анализ Sentinel-2 и MODIS</p>
          </div>
        </div>

        {/* Global disturbance status badge */}
        <div
          className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
            hasFire || hasLoss
              ? 'bg-orange-500/10 text-orange-400'
              : 'bg-[#3A4831] text-[#c8d4be]'
          }`}
        >
          {hasFire || hasLoss ? (
            <>
              <AlertTriangle className="h-3 w-3 text-orange-400" />
              <span>Нарушения</span>
            </>
          ) : (
            <>
              <ShieldCheck className="h-3 w-3 text-[#a5b997]" />
              <span>Норма</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {/* Card 1: Fire & Thermal anomalies */}
        <div className="rounded-xl bg-zinc-900/60 p-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-zinc-300">Пожары и термоточки</span>
            <span className={`font-semibold ${hasFire ? 'text-orange-400' : 'text-[#a5b997]'}`}>
              {hasFire ? 'Обнаружены очаги' : 'Очагов нет'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-400">
            <span>Площадь пожаров: <strong className="text-zinc-200">{formatNumber(disturbances.burned_area_ha, 1)} га</strong></span>
            <span>Даты: <strong className="text-zinc-200">{disturbances.burn_dates.length > 0 ? disturbances.burn_dates.slice(0, 2).join(', ') : 'Нет'}</strong></span>
          </div>
        </div>

        {/* Card 2: Canopy Integrity & Loss */}
        <div className="rounded-xl bg-zinc-900/60 p-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-zinc-300">Потери лесного покрова</span>
            <span className={`font-semibold ${hasLoss ? 'text-rose-400' : 'text-[#a5b997]'}`}>
              {hasLoss ? 'Обнаружены потери' : 'Покров стабилен'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-400">
            <span>Потери полога: <strong className="text-zinc-200">{disturbances.loss_pixels_recent > 0 ? `${disturbances.loss_pixels_recent} пикс.` : '0'}</strong></span>
            <span>Сомкнутость: <strong className="text-zinc-200">{disturbances.canopy_cover_avg.toFixed(1)}%</strong></span>
          </div>
        </div>

        {/* Card 3: Vegetation Indices */}
        <div className="rounded-xl bg-zinc-900/60 p-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-zinc-300">Вегетационные индексы</span>
            <div className="flex items-center gap-2">
              <span>NDVI: <strong className="text-[#a5b997] font-mono">{disturbances.sentinel2_ndvi.toFixed(3)}</strong></span>
              <span>NBR: <strong className="text-amber-400 font-mono">{disturbances.sentinel2_nbr.toFixed(3)}</strong></span>
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-400">
            <span>Фильтрация облачности: <strong className="text-zinc-200">{disturbances.cloud_filtered ? 'Активна' : 'Выкл'}</strong></span>
            <span>Атмосферная коррекция: <strong className="text-zinc-200">Выполнена</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
