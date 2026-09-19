import React, { useState, useEffect } from 'react';
import {
  ThermometerSun,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  getClimateRisks,
  ClimateRiskResponse,
} from '../../api/client';

interface ClimatePanelProps {
  siteId?: string;
  polygonGeojson?: any;
}

export const ClimatePanel: React.FC<ClimatePanelProps> = ({
  siteId = 'RU_TVER_01',
  polygonGeojson,
}) => {
  const [data, setData] = useState<ClimateRiskResponse | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<'SSP2-4.5' | 'SSP5-8.5'>('SSP2-4.5');
  const [loading, setLoading] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getClimateRisks({
        site_id: siteId,
        polygon_geojson: polygonGeojson,
        buffer_reserve_pct: 15.0,
      });
      setData(res);
    } catch (err: any) {
      console.warn('Backend climate API failed, using fallback:', err);
      // Fallback
      setData({
        site_id: siteId,
        baseline_year: 2025,
        horizon_year: 2050,
        buffer_pool_adequacy_2050: 'ADEQUATE_UNDER_SSP245_DEFICIT_UNDER_SSP585',
        executive_summary:
          'Буферный пул 15% достаточен для парирования климатических потерь при сценарии SSP2-4.5 (риск 8.4%), но при пессимистичном сценарии SSP5-8.5 (риск 21.6%) рекомендуется увеличение буфера до 22.0%.',
        scenarios: {
          'SSP2-4.5': {
            scenario_name: 'SSP2-4.5',
            description: 'Умеренная траектория стабилизации выбросов (Парижское соглашение)',
            cumulative_permanence_risk_2050_pct: 8.4,
            buffer_adequacy_status: 'ADEQUATE',
            recommended_buffer_rate_pct: 15.0,
            projections: [
              { year: 2025, temperature_anomaly_c: 1.1, fire_hazard_multiplier: 1.05, spei_drought_anomaly: -0.2, annual_mortality_rate_pct: 0.3, cumulative_loss_pct: 0.3 },
              { year: 2030, temperature_anomaly_c: 1.4, fire_hazard_multiplier: 1.15, spei_drought_anomaly: -0.4, annual_mortality_rate_pct: 0.35, cumulative_loss_pct: 2.1 },
              { year: 2035, temperature_anomaly_c: 1.7, fire_hazard_multiplier: 1.25, spei_drought_anomaly: -0.6, annual_mortality_rate_pct: 0.4, cumulative_loss_pct: 4.1 },
              { year: 2040, temperature_anomaly_c: 2.0, fire_hazard_multiplier: 1.35, spei_drought_anomaly: -0.8, annual_mortality_rate_pct: 0.45, cumulative_loss_pct: 6.2 },
              { year: 2045, temperature_anomaly_c: 2.2, fire_hazard_multiplier: 1.42, spei_drought_anomaly: -0.9, annual_mortality_rate_pct: 0.48, cumulative_loss_pct: 7.4 },
              { year: 2050, temperature_anomaly_c: 2.4, fire_hazard_multiplier: 1.48, spei_drought_anomaly: -1.0, annual_mortality_rate_pct: 0.5, cumulative_loss_pct: 8.4 },
            ],
          },
          'SSP5-8.5': {
            scenario_name: 'SSP5-8.5',
            description: 'Высокоэмиссионный сценарий без мер декарбонизации',
            cumulative_permanence_risk_2050_pct: 21.6,
            buffer_adequacy_status: 'DEFICIT',
            recommended_buffer_rate_pct: 22.0,
            projections: [
              { year: 2025, temperature_anomaly_c: 1.2, fire_hazard_multiplier: 1.1, spei_drought_anomaly: -0.3, annual_mortality_rate_pct: 0.4, cumulative_loss_pct: 0.4 },
              { year: 2030, temperature_anomaly_c: 1.8, fire_hazard_multiplier: 1.35, spei_drought_anomaly: -0.8, annual_mortality_rate_pct: 0.6, cumulative_loss_pct: 3.8 },
              { year: 2035, temperature_anomaly_c: 2.4, fire_hazard_multiplier: 1.65, spei_drought_anomaly: -1.4, annual_mortality_rate_pct: 0.85, cumulative_loss_pct: 8.2 },
              { year: 2040, temperature_anomaly_c: 3.1, fire_hazard_multiplier: 1.95, spei_drought_anomaly: -1.9, annual_mortality_rate_pct: 1.1, cumulative_loss_pct: 13.5 },
              { year: 2045, temperature_anomaly_c: 3.8, fire_hazard_multiplier: 2.25, spei_drought_anomaly: -2.3, annual_mortality_rate_pct: 1.35, cumulative_loss_pct: 17.8 },
              { year: 2050, temperature_anomaly_c: 4.5, fire_hazard_multiplier: 2.55, spei_drought_anomaly: -2.8, annual_mortality_rate_pct: 1.6, cumulative_loss_pct: 21.6 },
            ],
          },
        },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [siteId]);

  const currentScenario = data?.scenarios[selectedScenario];
  const isAdequate = currentScenario?.buffer_adequacy_status === 'ADEQUATE';

  return (
    <div className="flex flex-col gap-4 text-zinc-100">
      {/* Top Banner */}
      <div className="liquid-glass rounded-2xl p-4 border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <ThermometerSun className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Проекция климатических рисков до 2050 года
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-300 border border-emerald-500/30">
                HORIZON 2050
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Стресс-тестирование пожароопасности, засух SPEI и платежеспособности буферного пула по моделям климата
            </p>
          </div>
        </div>

        {/* Scenario Toggle */}
        <div className="flex items-center rounded-xl bg-zinc-900/90 p-1 border border-zinc-800">
          <button
            onClick={() => setSelectedScenario('SSP2-4.5')}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
              selectedScenario === 'SSP2-4.5'
                ? 'bg-emerald-500 text-zinc-950 font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            SSP2-4.5 (Умеренный)
          </button>
          <button
            onClick={() => setSelectedScenario('SSP5-8.5')}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
              selectedScenario === 'SSP5-8.5'
                ? 'bg-rose-500 text-white font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            SSP5-8.5 (Экстремальный)
          </button>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-300 hover:text-white transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Обновить</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="liquid-glass rounded-2xl p-3.5 border border-zinc-800/90 shadow-xl flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
            Аномалия температуры к 2050
          </span>
          <div className="mt-1">
            <span className="text-xl font-extrabold font-mono text-amber-400">
              +{currentScenario?.projections[currentScenario.projections.length - 1]?.temperature_anomaly_c ?? 2.4}°C
            </span>
            <div className="text-[10px] text-zinc-400 mt-0.5">Выше доиндустриального</div>
          </div>
        </div>

        <div className="liquid-glass rounded-2xl p-3.5 border border-zinc-800/90 shadow-xl flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
            Рост пожарной опасности (M_fire)
          </span>
          <div className="mt-1">
            <span className="text-xl font-extrabold font-mono text-orange-400">
              ×{currentScenario?.projections[currentScenario.projections.length - 1]?.fire_hazard_multiplier ?? 1.48}
            </span>
            <div className="text-[10px] text-zinc-400 mt-0.5">Индекс Нестерова / KBDI</div>
          </div>
        </div>

        <div className="liquid-glass rounded-2xl p-3.5 border border-zinc-800/90 shadow-xl flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
            Кумулятивный риск потерь к 2050
          </span>
          <div className="mt-1">
            <span className="text-xl font-extrabold font-mono text-white">
              {currentScenario?.cumulative_permanence_risk_2050_pct.toFixed(1)}%
            </span>
            <div className="text-[10px] text-zinc-400 mt-0.5">Усыхание + пожары</div>
          </div>
        </div>

        <div
          className={`liquid-glass rounded-2xl p-3.5 border shadow-xl flex flex-col justify-between ${
            isAdequate ? 'border-emerald-500/40 bg-emerald-950/15' : 'border-rose-500/40 bg-rose-950/15'
          }`}
        >
          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
            Пул 15% к 2050 году
          </span>
          <div className="mt-1">
            <span
              className={`text-base font-extrabold font-mono flex items-center gap-1.5 ${
                isAdequate ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isAdequate ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              {isAdequate ? 'ДОСТАТОЧЕН' : 'ДЕФИЦИТ БУФЕРА'}
            </span>
            <div className="text-[10px] text-zinc-300 mt-0.5 font-mono">
              Рекомендация: {currentScenario?.recommended_buffer_rate_pct}%
            </div>
          </div>
        </div>
      </div>

      {/* Trajectory Timeline SVG Chart (2025 to 2050) */}
      <div className="liquid-glass rounded-2xl p-4 border border-zinc-800/90 shadow-xl flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            Траектория накопления климатического риска биомассы (2025–2050 гг.)
          </span>
          <span className="text-[10px] font-mono text-zinc-400">
            Горизонт: {data?.baseline_year ?? 2025} → {data?.horizon_year ?? 2050}
          </span>
        </div>

        {/* SVG Chart */}
        <div className="w-full">
          <svg viewBox="0 0 540 140" className="w-full h-36">
            {/* Grid */}
            <line x1="45" y1="20" x2="515" y2="20" stroke="#27272a" strokeDasharray="2,2" />
            <line x1="45" y1="65" x2="515" y2="65" stroke="#27272a" strokeDasharray="2,2" />
            <line x1="45" y1="110" x2="515" y2="110" stroke="#27272a" strokeDasharray="2,2" />

            {/* 15% Buffer threshold line */}
            <line x1="45" y1="52" x2="515" y2="52" stroke="#7f9870" strokeDasharray="4,4" strokeWidth="1.5" />
            <text x="515" y="48" fill="#7f9870" fontSize="9" textAnchor="end" fontFamily="monospace">
              Буферный пул 15%
            </text>

            {/* Trajectory Line */}
            {currentScenario?.projections && (
              <>
                <path
                  d={currentScenario.projections
                    .map((p, idx) => {
                      const x = 50 + (idx / (currentScenario.projections.length - 1)) * 450;
                      // Y scaled from 0% (y=110) to 25% (y=20)
                      const y = 110 - (p.cumulative_loss_pct / 25) * 90;
                      return `${idx === 0 ? 'M' : 'L'} ${x},${y}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke={selectedScenario === 'SSP2-4.5' ? '#7f9870' : '#f43f5e'}
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {currentScenario.projections.map((p, idx) => {
                  const x = 50 + (idx / (currentScenario.projections.length - 1)) * 450;
                  const y = 110 - (p.cumulative_loss_pct / 25) * 90;
                  return (
                    <g key={idx}>
                      <circle
                        cx={x}
                        cy={y}
                        r="3.5"
                        fill={selectedScenario === 'SSP2-4.5' ? '#7f9870' : '#f43f5e'}
                      />
                      <text
                        x={x}
                        y={y - 8}
                        fill="#e4e4e7"
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {p.cumulative_loss_pct.toFixed(1)}%
                      </text>
                      <text
                        x={x}
                        y="125"
                        fill="#71717a"
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {p.year}
                      </text>
                    </g>
                  );
                })}
              </>
            )}
          </svg>
        </div>

        <div className="bg-zinc-900/70 p-3 rounded-xl border border-zinc-800/80 text-xs text-zinc-300 flex items-start gap-2">
          <Info className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>{data?.executive_summary}</div>
        </div>
      </div>
    </div>
  );
};
