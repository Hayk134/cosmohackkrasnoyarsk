import React from 'react';
import {
  Split,
  Layers,
  Activity,
  Flame,
  Trees,
  CheckCircle2,
  Sliders,
  ExternalLink,
  ChevronsLeftRight,
  Info,
  Zap,
} from 'lucide-react';

export type SwipeLayerId = 'biomass' | 'fire' | 'loss' | 'ndvi' | 'nbr' | 'change' | 'satellite' | 'stress';

interface SwipeToolPanelProps {
  isSwipeActive: boolean;
  onToggleSwipe: () => void;
  swipePosition: number;
  onChangeSwipePosition: (pos: number) => void;
  leftLayer: SwipeLayerId;
  onChangeLeftLayer: (layer: SwipeLayerId) => void;
  rightLayer: SwipeLayerId;
  onChangeRightLayer: (layer: SwipeLayerId) => void;
  onCloseModal?: () => void;
}

export const SwipeToolPanel: React.FC<SwipeToolPanelProps> = ({
  isSwipeActive,
  onToggleSwipe,
  swipePosition,
  onChangeSwipePosition,
  leftLayer,
  onChangeLeftLayer,
  rightLayer,
  onChangeRightLayer,
  onCloseModal,
}) => {
  const LEFT_OPTIONS: { id: SwipeLayerId; label: string; year: number; icon: any }[] = [
    { id: 'biomass', label: 'Биомасса AGB (2019)', year: 2019, icon: Trees },
    { id: 'satellite', label: 'Оптический спутник (2019)', year: 2019, icon: Layers },
    { id: 'ndvi', label: 'NDVI Растительность (2019)', year: 2019, icon: Activity },
  ];

  const RIGHT_OPTIONS: { id: SwipeLayerId; label: string; year: number; icon: any }[] = [
    { id: 'biomass', label: 'Биомасса AGB (2024)', year: 2024, icon: Trees },
    { id: 'stress', label: 'Катастрофа (Стресс-сценарий)', year: 2027, icon: Zap },
    { id: 'fire', label: 'Пожары (MODIS 2021)', year: 2021, icon: Flame },
    { id: 'loss', label: 'Потери леса (Hansen 2024)', year: 2024, icon: Flame },
    { id: 'ndvi', label: 'Индекс NDVI (2024)', year: 2024, icon: Activity },
    { id: 'nbr', label: 'Индекс NBR (2024)', year: 2024, icon: Flame },
    { id: 'change', label: 'Динамика биомассы (Δ 2019–2024)', year: 2024, icon: Layers },
  ];

  return (
    <div className="flex flex-col gap-4 text-zinc-100">
      {/* Header Banner */}
      <div className="liquid-glass rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#3A4831]/40 text-[#a5b997]">
            <Split className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Инструмент сравнения снимков (Шторка)
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${
                  isSwipeActive
                    ? 'bg-[#3A4831] text-[#c8d4be]'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {isSwipeActive ? 'АКТИВНА НА КАРТЕ' : 'ОТКЛЮЧЕНА'}
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Синхронное попиксельное сравнение лесного массива: 2019 г. и 2024 г.
            </p>
          </div>
        </div>

        <button
          onClick={onToggleSwipe}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg ${
            isSwipeActive
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20'
              : 'bg-[#3A4831] hover:bg-[#485c3e] text-white shadow-[#3A4831]/20'
          }`}
        >
          <ChevronsLeftRight className="h-4 w-4" />
          <span>{isSwipeActive ? 'Выключить шторку' : 'Включить шторку на карте'}</span>
        </button>
      </div>

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Side (2019 Baseline) */}
        <div className="liquid-glass rounded-2xl p-4 shadow-xl flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#a5b997] flex items-center gap-1.5">
              <span className="rounded bg-[#3A4831]/60 text-[#c8d4be] px-1.5 py-0.5 font-mono text-[10px]">
                ЛЕВАЯ СТОРОНА
              </span>
              2019: Базовое состояние
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {LEFT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = leftLayer === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => onChangeLeftLayer(opt.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition text-left ${
                    isSelected
                      ? 'bg-[#3A4831] text-white shadow-md'
                      : 'bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`p-1.5 rounded-lg ${
                        isSelected ? 'bg-black/30 text-[#c8d4be]' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold">{opt.label}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">Год: {opt.year}</div>
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-[#a5b997] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side (2024 Current / Disturbances) */}
        <div className="liquid-glass rounded-2xl p-4 shadow-xl flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#a5b997] flex items-center gap-1.5">
              <span className="rounded bg-[#3A4831]/60 text-[#c8d4be] px-1.5 py-0.5 font-mono text-[10px]">
                ПРАВАЯ СТОРОНА
              </span>
              2024: Текущее состояние / Нарушения
            </span>
          </div>

          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
            {RIGHT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = rightLayer === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => onChangeRightLayer(opt.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition text-left ${
                    isSelected
                      ? 'bg-[#3A4831] text-white shadow-md'
                      : 'bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`p-1.5 rounded-lg ${
                        isSelected ? 'bg-black/30 text-[#c8d4be]' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold">{opt.label}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">Спутниковый сенсор</div>
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-[#a5b997] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Position Slider & Instructions */}
      <div className="liquid-glass rounded-2xl p-4 shadow-xl flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-[#a5b997]" />
            Положение разделителя шторки на экране
          </span>
          <span className="font-mono font-bold text-[#a5b997] text-sm">{Math.round(swipePosition)}%</span>
        </div>

        <input
          type="range"
          min="5"
          max="95"
          step="1"
          value={swipePosition}
          onChange={(e) => onChangeSwipePosition(parseFloat(e.target.value))}
          className="accent-[#3A4831] cursor-pointer h-2"
        />

        <div className="flex justify-between text-[10px] font-mono text-zinc-500">
          <span>5% (Больше 2024)</span>
          <span>50% (Равный сплит)</span>
          <span>95% (Больше 2019)</span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Info className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span>На самой карте можно перемещать вертикальный разделитель курсором в реальном времени.</span>
          </div>
          {isSwipeActive && onCloseModal && (
            <button
              onClick={onCloseModal}
              className="text-xs text-[#a5b997] hover:text-white font-semibold flex items-center gap-1"
            >
              <span>Перейти к карте</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
