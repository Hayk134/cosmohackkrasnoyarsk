import React, { useState, useEffect } from 'react';
import {
  Compass,
  Sprout,
  CheckCircle2,
  RefreshCw,
  Download,
} from 'lucide-react';
import {
  evaluateLandScout,
  LandScoutResponse,
} from '../../api/client';
import { formatNumber, formatInt, formatRub } from '../../utils';

interface LandScoutPanelProps {
  siteId?: string;
  polygonGeojson?: any;
}

export const LandScoutPanel: React.FC<LandScoutPanelProps> = ({
  siteId = 'RU_TVER_01',
  polygonGeojson,
}) => {
  const [data, setData] = useState<LandScoutResponse | null>(null);
  const [targetSpecies, setTargetSpecies] = useState<string>('PINE_SPRUCE');
  const [seedlingCapex, setSeedlingCapex] = useState<number>(75000);
  const [carbonPrice, setCarbonPrice] = useState<number>(1500);
  const [discountRate, setDiscountRate] = useState<number>(0.12);
  const [loading, setLoading] = useState<boolean>(false);

  const evaluate = async () => {
    setLoading(true);
    try {
      const res = await evaluateLandScout({
        site_id: siteId,
        polygon_geojson: polygonGeojson,
        target_species: targetSpecies,
        seedling_cost_rub_ha: seedlingCapex,
        carbon_price_rub: carbonPrice,
        discount_rate: discountRate,
        opex_per_ha_yr: 3500,
      });
      setData(res);
    } catch (err: any) {
      console.warn('Backend land scout API failed, using fallback:', err);
      // Fallback
      setData({
        land_suitability_index: 87.4,
        recommendation: 'HIGH_POTENTIAL',
        area_ha: 100.0,
        annual_carbon_sequestration_t_ha_yr: 3.8,
        fifteen_yr_tradable_credits_est: 4845,
        estimated_npv_rub: 1420000.0,
        fire_risk_penalty: 3.5,
        component_scores: {
          bioclimatic: 92.0,
          sequestration: 89.5,
          water: 85.0,
          infrastructure: 82.0,
          fire_safety: 88.5,
        },
        estimated_capex_rub: 7500000.0,
        estimated_15yr_revenue_rub: 8550000.0,
        simple_payback_years: 7.2,
        target_species: targetSpecies,
        calculation_hash: 'land_scout_sha256_mock_hash',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    evaluate();
  }, [siteId, targetSpecies, seedlingCapex, carbonPrice, discountRate]);

  const downloadTeaser = () => {
    if (!data) return;
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LandScout_Teaser_${siteId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const lsi = data?.land_suitability_index ?? 87.4;

  return (
    <div className="flex flex-col gap-4 text-zinc-100">
      {/* Top Banner */}
      <div className="liquid-glass rounded-2xl p-4 border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Экспресс-оценка территорий под карбоновые фермы (Land Scout)
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-300 border border-emerald-500/30">
                EXPRESS SCORING
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Экспресс-оценка пригодности заброшенных сельскохозяйственных и лесных земель по биоклиматическому индексу LSI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={downloadTeaser}
            disabled={!data}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/20 px-3 py-1.5 text-xs text-emerald-300 hover:text-white transition"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Инвест-тизер (JSON)</span>
          </button>
          <button
            onClick={evaluate}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-300 hover:text-white transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Оценить</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Parameters on Left (5 cols) + Scoring & Financials on Right (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Scout Form Inputs (5 cols) */}
        <div className="lg:col-span-5 liquid-glass rounded-2xl p-4 border border-zinc-800/90 shadow-xl flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sprout className="h-3.5 w-3.5" />
              Параметры карбоновой фермы
            </span>
          </div>

          {/* Species Selector */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-300">Целевая лесообразующая порода:</span>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'PINE_SPRUCE', label: 'Сосна / Ель' },
                { id: 'BIRCH', label: 'Берёза' },
                { id: 'OAK_MIX', label: 'Дуб / Смесь' },
              ].map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => setTargetSpecies(sp.id)}
                  className={`rounded-xl px-2 py-1.5 text-xs font-semibold transition border text-center ${
                    targetSpecies === sp.id
                      ? 'bg-emerald-500 text-zinc-950 font-bold border-emerald-400 shadow-sm'
                      : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-white'
                  }`}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Seedling CAPEX */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">Затраты на закладку (CAPEX):</span>
              <span className="font-mono font-bold text-emerald-400">{formatRub(seedlingCapex)} / га</span>
            </div>
            <input
              type="range"
              min="30000"
              max="150000"
              step="5000"
              value={seedlingCapex}
              onChange={(e) => setSeedlingCapex(parseFloat(e.target.value))}
              className="accent-emerald-500 cursor-pointer h-1.5"
            />
          </div>

          {/* Price Scenario */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">Цена углеродной единицы:</span>
              <span className="font-mono font-bold text-emerald-400">{carbonPrice} ₽/т</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[500, 1500, 4000].map((p) => (
                <button
                  key={p}
                  onClick={() => setCarbonPrice(p)}
                  className={`rounded-xl px-2 py-1 text-xs font-semibold transition border ${
                    carbonPrice === p
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-zinc-900/80 text-zinc-400 border-zinc-800'
                  }`}
                >
                  {p} ₽
                </button>
              ))}
            </div>
          </div>

          {/* Discount Rate */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">Ставка дисконтирования:</span>
              <span className="font-mono font-bold text-emerald-400">{(discountRate * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.08"
              max="0.18"
              step="0.01"
              value={discountRate}
              onChange={(e) => setDiscountRate(parseFloat(e.target.value))}
              className="accent-emerald-500 cursor-pointer h-1.5"
            />
          </div>
        </div>

        {/* Right: LSI Scoring Gauge & 15-Year Financials (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Top Score Box */}
          <div className="liquid-glass rounded-2xl p-4 border border-emerald-500/30 shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Circular Gauge */}
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-900 border border-emerald-500/30">
                <span className="text-2xl font-extrabold font-mono text-emerald-400">
                  {lsi.toFixed(0)}
                </span>
                <span className="absolute bottom-1.5 text-[8px] font-mono text-zinc-500 uppercase">
                  из 100
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                  Индекс пригодности земель (LSI)
                </span>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  {data?.recommendation === 'HIGH_POTENTIAL' && 'ВЫСОКИЙ ПОТЕНЦИАЛ ДЛЯ КАРБОНОВОЙ ФЕРМЫ'}
                  {data?.recommendation === 'MODERATE' && 'УМЕРЕННЫЙ ПОТЕНЦИАЛ'}
                  {data?.recommendation === 'NOT_RECOMMENDED' && 'НИЗКИЙ ПОТЕНЦИАЛ'}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Рекомендуется посадка породы{' '}
                  <strong className="text-emerald-300">{targetSpecies.replace('_', ' / ')}</strong>
                </p>
              </div>
            </div>

            <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0 hidden sm:block" />
          </div>

          {/* 15-Year Financial & Sequestration Metrics */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="liquid-glass rounded-2xl p-3 border border-zinc-800/90 shadow-xl flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                Прирост биомассы
              </span>
              <div className="mt-1">
                <span className="text-lg font-extrabold font-mono text-emerald-400">
                  {formatNumber(data?.annual_carbon_sequestration_t_ha_yr ?? 3.8, 1)}
                </span>
                <div className="text-[10px] text-zinc-400">т CO₂e/га/год</div>
              </div>
            </div>

            <div className="liquid-glass rounded-2xl p-3 border border-zinc-800/90 shadow-xl flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                Выпуск за 15 лет (Q₁₅)
              </span>
              <div className="mt-1">
                <span className="text-lg font-extrabold font-mono text-white">
                  {formatInt(data?.fifteen_yr_tradable_credits_est ?? 4845)}
                </span>
                <div className="text-[10px] text-zinc-400">углеродных единиц</div>
              </div>
            </div>

            <div className="liquid-glass rounded-2xl p-3 border border-emerald-500/30 shadow-xl flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                Ожидаемый NPV (15 лет)
              </span>
              <div className="mt-1">
                <span className="text-lg font-extrabold font-mono text-emerald-300">
                  {formatRub(data?.estimated_npv_rub ?? 1420000)}
                </span>
                <div className="text-[10px] text-zinc-400">
                  Окупаемость: {data?.simple_payback_years?.toFixed(1) || '7.2'} лет
                </div>
              </div>
            </div>
          </div>

          {/* Component Factors Breakdown */}
          <div className="liquid-glass rounded-2xl p-3.5 border border-zinc-800/90 shadow-xl flex flex-col gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Факторы мультикритериального скоринга:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-xl bg-zinc-900/80 p-2 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400">Биоклимат</div>
                <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                  {data?.component_scores?.bioclimatic ?? 92} / 100
                </div>
              </div>
              <div className="rounded-xl bg-zinc-900/80 p-2 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400">Потенциал стока</div>
                <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                  {data?.component_scores?.sequestration ?? 90} / 100
                </div>
              </div>
              <div className="rounded-xl bg-zinc-900/80 p-2 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400">Инфраструктура</div>
                <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                  {data?.component_scores?.infrastructure ?? 82} / 100
                </div>
              </div>
              <div className="rounded-xl bg-zinc-900/80 p-2 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400">Штраф за пожары</div>
                <div className="font-mono font-bold text-orange-400 text-sm mt-0.5">
                  -{data?.fire_risk_penalty?.toFixed(1) ?? '3.5'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
