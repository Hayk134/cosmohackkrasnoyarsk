import React from 'react';
import {
  Trees,
  Flame,
  Activity,
  Layers,
  Sliders,
  EyeOff,
  Calendar,
  Split,
  Zap,
} from 'lucide-react';
import { SwipeLayerId } from './b2b/SwipeToolPanel';

export type RasterLayerType = 'none' | 'biomass' | 'fire' | 'loss' | 'ndvi' | 'nbr' | 'change' | 'satellite';

interface FloatingBottomBarProps {
  activeLayer: RasterLayerType;
  onChangeLayer: (layer: RasterLayerType) => void;
  opacity: number;
  onChangeOpacity: (opacity: number) => void;
  baseMap?: 'dark' | 'satellite';
  onChangeBaseMap?: (baseMap: 'dark' | 'satellite') => void;
  yearStart: number;
  yearEnd: number;
  onChangeYears: (start: number, end: number) => void;
  loadingRaster: boolean;
  isSwipeActive?: boolean;
  onToggleSwipe?: () => void;
  onOpenStressTestModal?: () => void;
  swipePosition?: number;
  onChangeSwipePosition?: (pos: number) => void;
  swipeLeftLayer?: SwipeLayerId;
  onChangeLeftLayer?: (layer: SwipeLayerId) => void;
  swipeRightLayer?: SwipeLayerId;
  onChangeRightLayer?: (layer: SwipeLayerId) => void;
  swipeLeftYear?: number;
  onChangeLeftYear?: (year: number) => void;
  swipeRightYear?: number;
  onChangeRightYear?: (year: number) => void;
}

const ALL_YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

const SWIPE_RIGHT_YEARS = [
  { year: 2015, label: '2015' },
  { year: 2016, label: '2016' },
  { year: 2017, label: '2017' },
  { year: 2018, label: '2018' },
  { year: 2019, label: '2019' },
  { year: 2020, label: '2020' },
  { year: 2021, label: '2021' },
  { year: 2022, label: '2022' },
  { year: 2023, label: '2023' },
  { year: 2024, label: '2024 (Базовый факт)' },
  { year: 2025, label: '2025 (Прогноз +1г)' },
  { year: 2026, label: '2026 (Пик полога)' },
  { year: 2027, label: '2027 (⚡ Шок засухи IPCC)' },
  { year: 2028, label: '2028 (Остаточный шок)' },
  { year: 2030, label: '2030 (Регенерация)' },
  { year: 2035, label: '2035 (Восстановление)' },
];

const RASTER_LAYERS: { id: RasterLayerType; label: string; icon: any; color: string }[] = [
  { id: 'biomass', label: 'Биомасса', icon: Trees, color: 'text-emerald-500' },
  { id: 'satellite', label: 'Спутник S2', icon: Layers, color: 'text-sky-400' },
  { id: 'loss', label: 'Потери', icon: Flame, color: 'text-rose-400' },
  { id: 'fire', label: 'Пожары', icon: Flame, color: 'text-orange-400' },
  { id: 'ndvi', label: 'NDVI', icon: Activity, color: 'text-emerald-600' },
  { id: 'nbr', label: 'NBR', icon: Layers, color: 'text-amber-500' },
  { id: 'change', label: 'Динамика Δ', icon: Activity, color: 'text-lime-400' },
  { id: 'none', label: 'Без слоя', icon: EyeOff, color: 'text-zinc-400' },
];

const PRESET_PERIODS = [
  { label: '2019–2024', start: 2019, end: 2024 },
  { label: '2020–2022 (Пожар)', start: 2020, end: 2022 },
];

export const FloatingBottomBar: React.FC<FloatingBottomBarProps> = ({
  activeLayer,
  onChangeLayer,
  opacity,
  onChangeOpacity,
  yearStart,
  yearEnd,
  onChangeYears,
  loadingRaster,
  isSwipeActive = false,
  onToggleSwipe,
  onOpenStressTestModal,
  swipeLeftLayer = 'biomass',
  onChangeLeftLayer,
  swipeRightLayer = 'biomass',
  onChangeRightLayer,
  swipeLeftYear = 2019,
  onChangeLeftYear,
  swipeRightYear = 2024,
  onChangeRightYear,
}) => {
  return (
    <>
      {/* Плавающая панель выбора шторки прямо в интерфейсе карты */}
      {isSwipeActive && (
        <div className="fixed bottom-[54px] left-1/2 -translate-x-1/2 z-30 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[calc(100vw-16px)] w-max">
          <div className="h-10 liquid-glass rounded-xl px-2 sm:px-2.5 py-1 flex items-center justify-start sm:justify-center gap-1.5 sm:gap-2 shadow-2xl whitespace-nowrap overflow-x-auto custom-scrollbar">
            {/* Левая сторона: Выбор года и слоя */}
            <div className="flex items-center gap-1 bg-[#274934]/40 p-0.5 rounded-lg">
              <select
                value={swipeLeftYear}
                onChange={(e) => onChangeLeftYear?.(parseInt(e.target.value, 10))}
                className="rounded bg-zinc-900/90 px-1.5 py-0.5 text-xs text-[#a5b997] font-bold focus:outline-none cursor-pointer border-none"
                title="Год"
              >
                {ALL_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select
                value={swipeLeftLayer}
                onChange={(e) => onChangeLeftLayer?.(e.target.value as SwipeLayerId)}
                className="rounded bg-zinc-900/90 px-2 py-0.5 text-xs text-zinc-200 font-medium hover:text-white transition focus:outline-none cursor-pointer border-none"
                title="Слой"
              >
                <option value="biomass">Биомасса AGB</option>
                <option value="satellite">Снимок Sentinel-2 (Цветной)</option>
                <option value="ndvi">NDVI Растительность</option>
                <option value="nbr">NBR Ожоги</option>
              </select>
            </div>

            {/* Разделитель */}
            <span className="text-zinc-500 font-bold text-[11px] px-0.5">vs</span>

            {/* Правая сторона: Выбор года (включая будущие стресс-года) и слоя */}
            <div className="flex items-center gap-1 bg-amber-950/40 p-0.5 rounded-lg">
              <select
                value={swipeRightYear}
                onChange={(e) => onChangeRightYear?.(parseInt(e.target.value, 10))}
                className="rounded bg-zinc-900/90 px-1.5 py-0.5 text-xs text-amber-300 font-bold focus:outline-none cursor-pointer border-none"
                title="Год для стресс-тестирования"
              >
                {SWIPE_RIGHT_YEARS.map((opt) => (
                  <option key={opt.year} value={opt.year}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={swipeRightLayer}
                onChange={(e) => onChangeRightLayer?.(e.target.value as SwipeLayerId)}
                className="rounded bg-zinc-900/90 px-2 py-0.5 text-xs text-zinc-200 font-medium hover:text-white transition focus:outline-none cursor-pointer border-none"
                title="Слой"
              >
                <option value="biomass">Биомасса AGB (Прогноз/Факт)</option>
                <option value="stress">⚡ Стресс-шок (Карта потерь)</option>
                <option value="satellite">Снимок Sentinel-2 (Цветной)</option>
                <option value="ndvi">NDVI Растительность</option>
                <option value="nbr">NBR Ожоги</option>
                <option value="fire">Гари MODIS (2021)</option>
                <option value="loss">Потери Hansen GFC</option>
                <option value="change">Разность (Динамика Δ)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Основной нижний бар управления */}
      <div className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-[calc(100vw-16px)] w-max">
        <div className="h-10 liquid-glass rounded-xl px-2.5 sm:px-3 py-1 flex items-center justify-start gap-1.5 sm:gap-2.5 shadow-xl whitespace-nowrap overflow-x-auto custom-scrollbar">
          {/* 1. Выбор периода */}
          <div className="flex items-center gap-1.5 pr-2 shrink-0">
            <div className="flex items-center gap-1 text-[10px] text-zinc-400">
              <Calendar className="h-3 w-3 text-[#7f9870]" />
              <span className="font-semibold uppercase tracking-wider hidden sm:inline">Период:</span>
            </div>

            <div className="flex items-center gap-0.5 bg-zinc-900/90 p-0.5 rounded-lg">
              {PRESET_PERIODS.map((p, idx) => {
                const isSelected = yearStart === p.start && yearEnd === p.end;
                return (
                  <button
                    key={p.label}
                    onClick={() => onChangeYears(p.start, p.end)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                      idx > 0 ? 'hidden 2xl:inline-block' : ''
                    } ${
                      isSelected
                        ? 'bg-[#3A4831] text-white font-bold shadow-sm'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Произвольный выбор лет с - по */}
            <div className="flex items-center gap-1 text-[10px] text-zinc-300 bg-zinc-900/90 px-1.5 py-0.5 rounded-lg">
              <select
                value={yearStart}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (val < yearEnd) onChangeYears(val, yearEnd);
                }}
                className="bg-transparent font-bold text-[#a5b997] focus:outline-none cursor-pointer text-[10px] border-none"
                title="Начальный год периода"
              >
                {ALL_YEARS.filter((y) => y < yearEnd).map((y) => (
                  <option key={y} value={y} className="bg-zinc-900 text-zinc-200">
                    {y}
                  </option>
                ))}
              </select>
              <span className="text-zinc-500 font-mono">→</span>
              <select
                value={yearEnd}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (val > yearStart) onChangeYears(yearStart, val);
                }}
                className="bg-transparent font-bold text-[#a5b997] focus:outline-none cursor-pointer text-[10px] border-none"
                title="Конечный год периода"
              >
                {ALL_YEARS.filter((y) => y > yearStart).map((y) => (
                  <option key={y} value={y} className="bg-zinc-900 text-zinc-200">
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="h-4 w-px bg-zinc-800/80 shrink-0" />

          {/* 2. Растровые слои */}
          <div className="flex items-center gap-1 pr-1.5 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hidden 2xl:inline mr-0.5">
              Слои:
            </span>
            <div className="flex items-center gap-0.5">
              {RASTER_LAYERS.map((layer) => {
                const Icon = layer.icon;
                const isActive = activeLayer === layer.id;
                return (
                  <button
                    key={layer.id}
                    onClick={() => onChangeLayer(layer.id)}
                    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition ${
                      isActive
                        ? 'bg-[#3A4831] text-zinc-100 font-bold shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                  >
                    <Icon className={`h-3 w-3 ${layer.color}`} />
                    <span>{layer.label}</span>
                    {isActive && loadingRaster && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#7f9870] animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-4 w-px bg-zinc-800/80 shrink-0" />

          {/* 3. Слайдер прозрачности */}
          {activeLayer !== 'none' && (
            <>
              <div className="flex items-center gap-1.5 pr-2 shrink-0">
                <Sliders className="h-3 w-3 text-zinc-400" />
                <span className="text-[10px] text-zinc-400 hidden md:inline">
                  Прозр:
                </span>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => onChangeOpacity(parseFloat(e.target.value))}
                  className="w-14 cursor-pointer accent-[#3A4831] h-1"
                />
                <span className="font-mono text-[10px] text-[#a5b997] w-7">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
              <div className="h-4 w-px bg-zinc-800/80 shrink-0" />
            </>
          )}

          {/* 5. Кнопка шторки сравнения 2019 vs 2024 */}
          {onToggleSwipe && (
            <button
              onClick={onToggleSwipe}
              className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold transition shrink-0 ${
                isSwipeActive
                  ? 'bg-[#3A4831] text-white font-bold shadow-sm'
                  : 'bg-zinc-900/90 text-zinc-300 hover:bg-[#3A4831]/60 hover:text-white'
              }`}
              title="Интерактивная шторка сравнения 2019 vs 2024"
            >
              <Split className="h-3 w-3 text-[#7f9870]" />
              <span>Шторка</span>
            </button>
          )}

          {/* 6. Кнопка Стресс-Тест */}
          {onOpenStressTestModal && (
            <button
              onClick={onOpenStressTestModal}
              className="flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-[10px] font-semibold transition shrink-0 bg-zinc-900/90 text-[#c8d4be] hover:bg-[#3A4831] hover:text-white border border-[#5c744f]/40 shadow-sm"
              title="Климатический стресс-тест и симулятор рисков (TCFD Black Swan)"
            >
              <Zap className="h-3 w-3 text-amber-400" />
              <span>Стресс-тест</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};
