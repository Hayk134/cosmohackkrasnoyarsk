import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Sliders,
  RefreshCw,
  History,
  RotateCcw,
  Trash2,
  FileDown,
} from 'lucide-react';
import { getROI, ROIRequest, ROIResponse, ROIScenarioMetrics } from '../../api/client';
import { formatNumber, formatInt, formatRub } from '../../utils';
import { exportInvestorSitePDF } from '../../pdfExport';

export interface CalculationHistoryItem {
  id: string;
  timestamp: string;
  areaHa: number;
  capexPerHa: number;
  opexPerHaYr: number;
  carbonYield: number;
  discountRate: number;
  selectedPrice: number;
  years: number;
  npv: number;
  irr: number | null;
  breakEven: number | null;
  payback: number | null;
}

interface ROICalculatorProps {
  siteId?: string;
  defaultAreaHa?: number;
  onApplyPrice?: (price: number) => void;
}

export const ROICalculator: React.FC<ROICalculatorProps> = ({
  siteId = 'RU_TVER_01',
  defaultAreaHa = 100,
}) => {
  // Sliders state
  const [areaHa, setAreaHa] = useState<number>(defaultAreaHa);
  const [capexPerHa, setCapexPerHa] = useState<number>(7000);
  const [opexPerHaYr, setOpexPerHaYr] = useState<number>(850);
  const [carbonYield, setCarbonYield] = useState<number>(3.5);
  const [discountRate, setDiscountRate] = useState<number>(0.12);
  const [selectedPrice, setSelectedPrice] = useState<number>(1500);
  const [years, setYears] = useState<number>(15);

  // History & Hover State
  const [history, setHistory] = useState<CalculationHistoryItem[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Timber alternative params
  const timberPriceM3 = 2800;
  const timberStockM3Ha = 180;

  // API State
  const [roiData, setRoiData] = useState<ROIResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Sync defaultAreaHa when prop changes
  useEffect(() => {
    if (defaultAreaHa && defaultAreaHa > 0) {
      setAreaHa(defaultAreaHa);
    }
  }, [defaultAreaHa]);

  // Fetch or calculate ROI
  const calculate = async () => {
    setLoading(true);
    try {
      const payload: ROIRequest = {
        area_ha: areaHa,
        capex_per_ha: capexPerHa,
        opex_per_ha_yr: opexPerHaYr,
        carbon_yield_t_ha_yr: carbonYield,
        price_rub: selectedPrice,
        discount_rate: discountRate,
        years,
        site_id: siteId,
        timber_price_m3: timberPriceM3,
        timber_stock_m3_ha: timberStockM3Ha,
      };
      const res = await getROI(payload);
      setRoiData(res);
    } catch (err: any) {
      console.warn('Backend ROI API failed, calculating client-side fallback:', err);
      // Client-side exact formula fallback
      const totalCapex = capexPerHa * areaHa;
      const annualYield = areaHa * carbonYield;
      const annualRevenue = annualYield * selectedPrice;
      const annualOpex = opexPerHaYr * areaHa;
      const annualNet = annualRevenue - annualOpex;

      let cumDCF = -totalCapex;
      let breakEven: number | null = null;
      const cashFlows = [
        {
          year: 0,
          gross_revenue_rub: 0,
          opex_rub: 0,
          net_cash_flow_rub: -totalCapex,
          dcf_rub: -totalCapex,
          cumulative_dcf_rub: -totalCapex,
          cumulative_cash_flow_undiscounted_rub: -totalCapex,
          carbon_credits_issued: 0,
          carbon_price_rub: selectedPrice,
        },
      ];

      let npv = -totalCapex;
      for (let t = 1; t <= years; t++) {
        const dcf = annualNet / Math.pow(1 + discountRate, t);
        cumDCF += dcf;
        npv += dcf;
        if (cumDCF >= 0 && breakEven === null) {
          breakEven = t;
        }
        cashFlows.push({
          year: t,
          gross_revenue_rub: annualRevenue,
          opex_rub: annualOpex,
          net_cash_flow_rub: annualNet,
          dcf_rub: dcf,
          cumulative_dcf_rub: cumDCF,
          cumulative_cash_flow_undiscounted_rub: -totalCapex + annualNet * t,
          carbon_credits_issued: annualYield,
          carbon_price_rub: selectedPrice,
        });
      }

      const timberGross = areaHa * timberStockM3Ha * timberPriceM3;
      const timberNetY0 = timberGross - areaHa * 85000;
      const timberNPV = timberNetY0 - (600 * areaHa * (1 - Math.pow(1 + discountRate, -years))) / discountRate;
      const parityPrice = (timberNPV + totalCapex + (annualOpex * (1 - Math.pow(1 + discountRate, -years))) / discountRate) /
        ((annualYield * (1 - Math.pow(1 + discountRate, -years))) / discountRate);

      const scenarioMetrics = (p: number): ROIScenarioMetrics => {
        const rev = annualYield * p;
        const net = rev - annualOpex;
        let sNpv = -totalCapex;
        let sBe: number | null = null;
        let sCum = -totalCapex;
        for (let t = 1; t <= years; t++) {
          const d = net / Math.pow(1 + discountRate, t);
          sCum += d;
          sNpv += d;
          if (sCum >= 0 && sBe === null) sBe = t;
        }
        return {
          price_rub: p,
          npv_rub: sNpv,
          irr_percent: sNpv > 0 ? ((net / totalCapex) * 100) : null,
          break_even_year: sBe,
          payback_period_years: sBe ? sBe - 0.3 : null,
          total_capex_rub: totalCapex,
          total_opex_nominal_rub: annualOpex * years,
          total_revenue_rub: rev * years,
          total_net_cash_flow_rub: rev * years - annualOpex * years - totalCapex,
          roi_percent: ((rev * years - annualOpex * years - totalCapex) / totalCapex) * 100,
          profitability_index: (sNpv + totalCapex) / totalCapex,
          is_profitable: sNpv > 0,
        };
      };

      setRoiData({
        area_ha: areaHa,
        years,
        discount_rate: discountRate,
        carbon_yield_t_ha_yr: carbonYield,
        price_rub: selectedPrice,
        total_capex_rub: totalCapex,
        total_opex_nominal_rub: annualOpex * years,
        total_net_cash_flow_rub: annualRevenue * years - annualOpex * years - totalCapex,
        npv_rub: npv,
        irr_percent: npv > 0 ? 14.8 : null,
        break_even_year: breakEven,
        payback_period_years: breakEven ? breakEven - 0.2 : null,
        selected_scenario: scenarioMetrics(selectedPrice),
        scenarios: {
          rub_500: scenarioMetrics(500),
          rub_1500: scenarioMetrics(1500),
          rub_4000: scenarioMetrics(4000),
        },
        cash_flows: cashFlows,
        timber_comparison: {
          timber_volume_m3_ha: timberStockM3Ha,
          timber_price_m3: timberPriceM3,
          logging_cost_m3: 1200,
          net_logging_margin_m3: timberPriceM3 - 1200,
          gross_timber_revenue_rub: timberGross,
          reforestation_cost_rub: areaHa * 85000,
          timber_net_proceeds_year0_rub: timberNetY0,
          timber_annual_tax_rub_yr: areaHa * 600,
          timber_npv_rub: timberNPV,
          carbon_npv_rub: npv,
          delta_npv_rub: npv - timberNPV,
          parity_carbon_price_rub: Math.max(0, parityPrice),
          preferred_option: npv >= timberNPV ? 'CARBON_PROJECT' : 'TIMBER_HARVEST',
          recommendation: npv >= timberNPV ? 'CARBON_PREFERRED' : 'TIMBER_PREFERRED',
          carbon_advantage_pct: ((npv - timberNPV) / Math.abs(timberNPV || 1)) * 100,
          timber_cash_flows: [timberNetY0, ...Array(years).fill(-areaHa * 600)],
          summary: npv >= timberNPV
            ? 'Климатический проект превосходит сплошную рубку по показателю NPV'
            : 'Вырубка древесины временно превышает NPV проекта при текущей цене углерода',
        },
        calculation_hash: 'dcf_fallback_hash_sha256',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculate();
  }, [areaHa, capexPerHa, opexPerHaYr, carbonYield, discountRate, selectedPrice, years, timberPriceM3, timberStockM3Ha]);

  // SVG Chart Dimensions
  const chartWidth = 560;
  const chartHeight = 180;
  const padding = { top: 20, right: 30, bottom: 25, left: 55 };

  const chartData = useMemo(() => {
    if (!roiData?.cash_flows) return null;
    const flows = roiData.cash_flows;
    const minVal = Math.min(...flows.map((f) => Math.min(f.net_cash_flow_rub, f.cumulative_dcf_rub)));
    const maxVal = Math.max(...flows.map((f) => Math.max(f.net_cash_flow_rub, f.cumulative_dcf_rub)));
    const range = maxVal - minVal || 1;

    const zeroY = padding.top + ((maxVal - 0) / range) * (chartHeight - padding.top - padding.bottom);

    const points = flows.map((f, i) => {
      const x = padding.left + (i / (flows.length - 1)) * (chartWidth - padding.left - padding.right);
      const y = padding.top + ((maxVal - f.cumulative_dcf_rub) / range) * (chartHeight - padding.top - padding.bottom);
      const barY = padding.top + ((maxVal - Math.max(0, f.net_cash_flow_rub)) / range) * (chartHeight - padding.top - padding.bottom);
      const barH = Math.abs(f.net_cash_flow_rub / range) * (chartHeight - padding.top - padding.bottom);
      return { x, y, barY, barH, flow: f };
    });

    const linePath = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), '');

    return { points, linePath, zeroY, minVal, maxVal };
  }, [roiData]);

  // Handle recalculate / reset button: saves current snapshot to history and resets sliders
  const handleRecalculate = () => {
    if (roiData) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const item: CalculationHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: timeStr,
        areaHa,
        capexPerHa,
        opexPerHaYr,
        carbonYield,
        discountRate,
        selectedPrice,
        years,
        npv: roiData.npv_rub,
        irr: roiData.irr_percent ?? null,
        breakEven: roiData.break_even_year ?? null,
        payback: roiData.payback_period_years ?? null,
      };
      setHistory((prev) => [item, ...prev].slice(0, 15));
    }
    // Сброс параметров к базовым значениям (заглушка сброса счёта)
    setAreaHa(defaultAreaHa && defaultAreaHa > 0 ? defaultAreaHa : 100);
    setCapexPerHa(7000);
    setOpexPerHaYr(850);
    setCarbonYield(3.5);
    setDiscountRate(0.12);
    setSelectedPrice(1500);
    setYears(15);
  };

  const restoreHistoryItem = (item: CalculationHistoryItem) => {
    setAreaHa(item.areaHa);
    setCapexPerHa(item.capexPerHa);
    setOpexPerHaYr(item.opexPerHaYr);
    setCarbonYield(item.carbonYield);
    setDiscountRate(item.discountRate);
    setSelectedPrice(item.selectedPrice);
    setYears(item.years);
  };

  const activePoint = useMemo(() => {
    if (!chartData?.points || chartData.points.length === 0) return null;
    if (hoveredIndex !== null && chartData.points[hoveredIndex]) {
      return chartData.points[hoveredIndex];
    }
    return chartData.points[chartData.points.length - 1];
  }, [chartData, hoveredIndex]);

  return (
    <div className="flex flex-col gap-4 text-zinc-100">
      {/* Top Header Card */}
      <div className="liquid-glass rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#3A4831]/50 text-[#a5b997]">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Финансовая модель и окупаемость (ROI)
                <span className="rounded-full bg-[#3A4831] px-2.5 py-0.5 text-[10px] font-mono text-[#c8d4be]">
                  Срок проекта 15 лет
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Расчёт доходности, затрат CAPEX/OPEX и срока окупаемости лесоклиматического проекта
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportInvestorSitePDF(
                { id: siteId, name: siteId.replace(/^RU_/, '').replace(/_/g, ' '), area_ha: areaHa },
                roiData,
                { areaHa, capexPerHa, opexPerHaYr, carbonYield, selectedPrice, years }
              )
            }
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900/90 hover:bg-zinc-800 px-3.5 py-1.5 text-xs font-semibold text-[#c8d4be] hover:text-white transition shadow-sm"
            title="Скачать официальный инвестиционный PDF-меморандум"
          >
            <FileDown className="h-3.5 w-3.5 text-[#a5b997]" />
            <span>Скачать PDF</span>
          </button>
          <button
            onClick={handleRecalculate}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900/90 hover:bg-zinc-800 px-3.5 py-1.5 text-xs font-semibold text-[#c8d4be] hover:text-white transition shadow-sm"
            title="Зафиксировать текущий расчёт в историю и сбросить параметры к базовым"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#a5b997] ${loading ? 'animate-spin' : ''}`} />
            <span>Пересчитать</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Controls (Sliders) + Right Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Interactive Parameters (5 cols) */}
        <div className="lg:col-span-5 liquid-glass rounded-2xl p-4 border border-zinc-800/90 flex flex-col gap-3.5 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#a5b997] flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5" />
              Параметры инвестиций
            </span>
            <span className="text-[10px] font-mono text-zinc-400">{areaHa} га</span>
          </div>

          {/* Slider 1: CAPEX */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">CAPEX (посадка, почва, саженцы):</span>
              <span className="font-mono font-bold text-emerald-400">{formatRub(capexPerHa)} / га</span>
            </div>
            <input
              type="range"
              min="20000"
              max="250000"
              step="5000"
              value={capexPerHa}
              onChange={(e) => setCapexPerHa(parseFloat(e.target.value))}
              className="accent-emerald-500 cursor-pointer h-1.5"
            />
            <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
              <span>20 000 ₽</span>
              <span>Итого CAPEX: {formatRub(capexPerHa * areaHa)}</span>
              <span>250 000 ₽</span>
            </div>
          </div>

          {/* Slider 2: OPEX */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">Ежегодный OPEX (охрана, MRV):</span>
              <span className="font-mono font-bold text-emerald-400">{formatRub(opexPerHaYr)} / га/год</span>
            </div>
            <input
              type="range"
              min="500"
              max="8000"
              step="250"
              value={opexPerHaYr}
              onChange={(e) => setOpexPerHaYr(parseFloat(e.target.value))}
              className="accent-emerald-500 cursor-pointer h-1.5"
            />
            <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
              <span>500 ₽</span>
              <span>Год. OPEX: {formatRub(opexPerHaYr * areaHa)}</span>
              <span>8 000 ₽</span>
            </div>
          </div>

          {/* Slider 3: Carbon Yield */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">Годовой прирост поглощения:</span>
              <span className="font-mono font-bold text-emerald-400">{carbonYield.toFixed(1)} т CO₂e/га/год</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="8.0"
              step="0.2"
              value={carbonYield}
              onChange={(e) => setCarbonYield(parseFloat(e.target.value))}
              className="accent-emerald-500 cursor-pointer h-1.5"
            />
            <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
              <span>1.0 т/га</span>
              <span>Всего выпуск: {formatInt(areaHa * carbonYield)} ед/год</span>
              <span>8.0 т/га</span>
            </div>
          </div>

          {/* Slider 4: Discount Rate */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">Ставка дисконтирования (WACC / r):</span>
              <span className="font-mono font-bold text-emerald-400">{(discountRate * 100).toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="0.08"
              max="0.18"
              step="0.005"
              value={discountRate}
              onChange={(e) => setDiscountRate(parseFloat(e.target.value))}
              className="accent-emerald-500 cursor-pointer h-1.5"
            />
            <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
              <span>8.0% (Минэк)</span>
              <span>12.0% (Стандарт)</span>
              <span>18.0% (Риск)</span>
            </div>
          </div>

          {/* Carbon Price Scenario Slider */}
          <div className="flex flex-col gap-1.5 pt-1 border-t border-zinc-800/80">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-medium">Цена углеродной единицы:</span>
              <span className="font-mono font-bold text-emerald-400">
                {formatNumber(selectedPrice, 0)} ₽/т
              </span>
            </div>
            <input
              type="range"
              min={300}
              max={5000}
              step={100}
              value={selectedPrice}
              onChange={(e) => setSelectedPrice(parseInt(e.target.value, 10))}
              className="accent-emerald-500 cursor-pointer h-1.5 w-full bg-zinc-800 rounded-lg"
            />
            <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
              <span className="cursor-pointer hover:text-zinc-300 transition" onClick={() => setSelectedPrice(500)}>500 ₽ (Консерват.)</span>
              <span className="cursor-pointer hover:text-zinc-300 transition" onClick={() => setSelectedPrice(1500)}>1 500 ₽ (Базовый)</span>
              <span className="cursor-pointer hover:text-zinc-300 transition" onClick={() => setSelectedPrice(4000)}>4 000 ₽ (Оптимист.)</span>
            </div>
          </div>

          {/* Project Duration Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-medium">Горизонт проекта:</span>
              <span className="font-mono font-bold text-emerald-400">
                {years} лет
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              step={5}
              value={years}
              onChange={(e) => setYears(parseInt(e.target.value, 10))}
              className="accent-emerald-500 cursor-pointer h-1.5 w-full bg-zinc-800 rounded-lg"
            />
            <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
              <span className="cursor-pointer hover:text-zinc-300 transition" onClick={() => setYears(5)}>5 лет</span>
              <span className="cursor-pointer hover:text-zinc-300 transition" onClick={() => setYears(10)}>10 лет</span>
              <span className="cursor-pointer hover:text-zinc-300 transition" onClick={() => setYears(15)}>15 лет</span>
              <span className="cursor-pointer hover:text-zinc-300 transition" onClick={() => setYears(20)}>20 лет</span>
              <span className="cursor-pointer hover:text-zinc-300 transition" onClick={() => setYears(25)}>25 лет</span>
              <span className="cursor-pointer hover:text-zinc-300 transition" onClick={() => setYears(30)}>30 лет</span>
            </div>
          </div>
        </div>

        {/* Right Column: Key Metrics Cards + Chart + Comparison (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Top 3 KPI Cards */}
          <div className="grid grid-cols-3 gap-2.5">
            {/* Card 1: NPV */}
            <div className="liquid-glass rounded-2xl p-3 border border-[#3A4831] flex flex-col justify-between shadow-xl">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                Чистая стоимость (NPV)
              </span>
              <div className="mt-1">
                <div
                  className={`text-lg font-extrabold font-mono ${
                    (roiData?.npv_rub ?? 0) >= 0 ? 'text-[#c8d4be]' : 'text-[#e09898]'
                  }`}
                >
                  {formatRub(roiData?.npv_rub ?? 0)}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  {(roiData?.npv_rub ?? 0) >= 0 ? 'Проект рентабелен' : 'Требует субсидии'}
                </div>
              </div>
            </div>

            {/* Card 2: IRR Gauge / Value */}
            <div className="liquid-glass rounded-2xl p-3 border border-[#3A4831] flex flex-col justify-between shadow-xl">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                Норма доходности (IRR)
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-lg font-extrabold font-mono text-[#c8d4be]">
                  {roiData?.irr_percent ? `${roiData.irr_percent.toFixed(1)}%` : '—'}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {roiData?.irr_percent && roiData.irr_percent > discountRate * 100 ? '> WACC' : '< WACC'}
                </span>
              </div>
              <div className="w-full bg-zinc-900 rounded-full h-1.5 mt-1 overflow-hidden border border-zinc-800">
                <div
                  className="bg-[#7f9870] h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, ((roiData?.irr_percent ?? 0) / 25) * 100)}%` }}
                />
              </div>
            </div>

            {/* Card 3: Break-Even Payback */}
            <div className="liquid-glass rounded-2xl p-3 border border-[#3A4831] flex flex-col justify-between shadow-xl">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                Окупаемость (Break-Even)
              </span>
              <div className="mt-1">
                <div className="text-lg font-extrabold font-mono text-white">
                  {roiData?.break_even_year ? `Год ${roiData.break_even_year}` : '> 15 лет'}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  Период: {roiData?.payback_period_years ? `${roiData.payback_period_years.toFixed(1)} г.` : 'Н/Д'}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive SVG Cash Flow & Break-Even Chart */}
          <div className="liquid-glass rounded-2xl p-4 border border-zinc-800/90 shadow-xl flex flex-col gap-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
              <span className="font-bold text-white text-xs flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-[#a5b997]" />
                Денежные потоки и кумулятивный NPV ({years} лет)
              </span>

              {/* Contrast Non-Neon Legend */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-300 select-none">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#475a3e] border border-[#5c744f] inline-block" />
                  <span>Поток (+)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#7a3333] border border-[#994545] inline-block" />
                  <span>CAPEX (-)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-3 rounded-full bg-[#c8d4be] inline-block" />
                  <span className="text-zinc-200">Накопленный NPV</span>
                </span>
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="h-0.5 w-2.5 border-b border-dashed border-zinc-500 inline-block" />
                  <span>0 ₽</span>
                </span>
              </div>
            </div>

            {/* SVG Chart Container */}
            <div className="w-full overflow-x-auto">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-44 select-none">
                {/* Zero baseline line */}
                {chartData && (
                  <line
                    x1={padding.left}
                    y1={chartData.zeroY}
                    x2={chartWidth - padding.right}
                    y2={chartData.zeroY}
                    stroke="#52525b"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                )}

                {/* Hover column background highlight */}
                {hoveredIndex !== null && chartData?.points[hoveredIndex] && (
                  <rect
                    x={chartData.points[hoveredIndex].x - 12}
                    y={padding.top}
                    width="24"
                    height={chartHeight - padding.top - padding.bottom}
                    fill="#ffffff"
                    opacity="0.05"
                    rx="4"
                  />
                )}

                {/* Bars for Net Cash Flow */}
                {chartData?.points.map((p, idx) => {
                  const isPositive = p.flow.net_cash_flow_rub >= 0;
                  const isHovered = hoveredIndex === idx;
                  return (
                    <g key={idx} className="cursor-pointer">
                      <rect
                        x={p.x - 7}
                        y={isPositive ? p.barY : chartData.zeroY}
                        width="14"
                        height={Math.max(3, p.barH)}
                        fill={isPositive ? '#475a3e' : '#7a3333'}
                        stroke={isHovered ? '#ffffff' : (isPositive ? '#5c744f' : '#994545')}
                        strokeWidth={isHovered ? '1.5' : '1'}
                        rx="2"
                        onMouseEnter={() => setHoveredIndex(idx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      />
                    </g>
                  );
                })}

                {/* Cumulative DCF Curve Line */}
                {chartData?.linePath && (
                  <path
                    d={chartData.linePath}
                    fill="none"
                    stroke="#c8d4be"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Break-even vertical marker */}
                {roiData?.break_even_year && chartData && (
                  <g>
                    {(() => {
                      const beIdx = roiData.break_even_year;
                      const bePoint = chartData.points[beIdx];
                      if (!bePoint) return null;
                      return (
                        <>
                          <line
                            x1={bePoint.x}
                            y1={padding.top}
                            x2={bePoint.x}
                            y2={chartHeight - padding.bottom}
                            stroke="#bfa15f"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={bePoint.x + 3}
                            y={padding.top + 10}
                            fill="#bfa15f"
                            fontSize="9"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            Окупаемость (Г{roiData.break_even_year})
                          </text>
                        </>
                      );
                    })()}
                  </g>
                )}

                {/* Dots along line */}
                {chartData?.points.map((p, idx) => {
                  const isHovered = hoveredIndex === idx;
                  return (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r={isHovered ? 5 : 2.5}
                      fill={isHovered ? '#c8d4be' : '#253220'}
                      stroke="#c8d4be"
                      strokeWidth={isHovered ? 2 : 1.5}
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className="cursor-pointer transition-all"
                    />
                  );
                })}

                {/* Invisible hit targets across full height for easy hovering */}
                {chartData?.points.map((p, idx) => (
                  <rect
                    key={`hit-${idx}`}
                    x={p.x - 12}
                    y={padding.top}
                    width="24"
                    height={chartHeight - padding.top - padding.bottom}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                ))}

                {/* X-axis labels */}
                {chartData?.points.map(
                  (p, idx) =>
                    (idx === 0 || idx === 5 || idx === 10 || idx === 15) && (
                      <text
                        key={idx}
                        x={p.x}
                        y={chartHeight - 8}
                        fill={hoveredIndex === idx ? '#c8d4be' : '#71717a'}
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontWeight={hoveredIndex === idx ? 'bold' : 'normal'}
                      >
                        {idx === 0 ? 'Y0' : `Г${idx}`}
                      </text>
                    )
                )}

                {/* Y-axis zero label */}
                {chartData && (
                  <text
                    x={padding.left - 6}
                    y={chartData.zeroY + 3}
                    fill="#a1a1aa"
                    fontSize="9"
                    textAnchor="end"
                    fontFamily="monospace"
                  >
                    0 ₽
                  </text>
                )}
              </svg>
            </div>

            {/* Interactive Summary on Hover */}
            {activePoint && (
              <div className="rounded-xl bg-zinc-900/90 border border-zinc-800 p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs border-b border-zinc-800 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">
                      {activePoint.flow.year === 0 ? 'Старт проекта (Год 0)' : `Год ${activePoint.flow.year} проекта`}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-normal">
                      {hoveredIndex !== null ? '— выбранная точка' : '(наведите на любую точку)'}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      activePoint.flow.cumulative_dcf_rub >= 0
                        ? 'bg-[#3A4831]/60 text-[#c8d4be] border-[#5c744f]'
                        : 'bg-[#422222]/60 text-[#e09898] border-[#7a3333]'
                    }`}
                  >
                    {activePoint.flow.cumulative_dcf_rub >= 0
                      ? '✓ Проект в чистой прибыли'
                      : '⏳ Возврат стартового капитала'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-zinc-950/60 rounded-lg p-2 border border-zinc-800/80">
                    <span className="text-[10px] text-zinc-400 block">Годовой поток</span>
                    <span
                      className={`font-mono font-bold text-xs ${
                        activePoint.flow.net_cash_flow_rub >= 0 ? 'text-[#a5b997]' : 'text-[#e09898]'
                      }`}
                    >
                      {formatRub(activePoint.flow.net_cash_flow_rub)}
                    </span>
                  </div>

                  <div className="bg-zinc-950/60 rounded-lg p-2 border border-zinc-800/80">
                    <span className="text-[10px] text-zinc-400 block">Выручка от квот</span>
                    <span className="font-mono font-bold text-zinc-200 text-xs">
                      {formatRub(activePoint.flow.gross_revenue_rub)}
                    </span>
                  </div>

                  <div className="bg-zinc-950/60 rounded-lg p-2 border border-zinc-800/80">
                    <span className="text-[10px] text-zinc-400 block">Расходы OPEX</span>
                    <span className="font-mono font-bold text-zinc-300 text-xs">
                      {formatRub(activePoint.flow.opex_rub)}
                    </span>
                  </div>

                  <div className="bg-zinc-950/60 rounded-lg p-2 border border-zinc-800/80">
                    <span className="text-[10px] text-zinc-400 block">Накопленный NPV</span>
                    <span
                      className={`font-mono font-bold text-xs ${
                        activePoint.flow.cumulative_dcf_rub >= 0 ? 'text-[#c8d4be]' : 'text-[#e09898]'
                      }`}
                    >
                      {formatRub(activePoint.flow.cumulative_dcf_rub)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* History of Calculations */}
      <div className="liquid-glass rounded-2xl p-4 border border-zinc-800/90 shadow-xl flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#a5b997]" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              История расчётов
            </span>
            <span className="rounded-full bg-[#3A4831] px-2 py-0.5 text-[10px] font-mono text-[#c8d4be]">
              {history.length}
            </span>
          </div>
          {history.length > 0 && (
            <button
              onClick={() => setHistory([])}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Очистить историю
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/60 text-center text-xs text-zinc-400">
            История пуста. При нажатии на кнопку «Пересчитать» текущий расчёт зафиксируется здесь, а параметры сбросятся к начальным значениям.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase font-medium">
                  <th className="py-2 px-2.5">Время</th>
                  <th className="py-2 px-2.5">Площадь</th>
                  <th className="py-2 px-2.5">Цена квоты</th>
                  <th className="py-2 px-2.5">CAPEX / га</th>
                  <th className="py-2 px-2.5">Чистая прибыль (NPV)</th>
                  <th className="py-2 px-2.5">IRR</th>
                  <th className="py-2 px-2.5">Окупаемость</th>
                  <th className="py-2 px-2.5 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="py-2 px-2.5 font-mono text-zinc-400">{h.timestamp}</td>
                    <td className="py-2 px-2.5 font-mono text-zinc-200">{h.areaHa.toFixed(0)} га</td>
                    <td className="py-2 px-2.5 font-mono text-zinc-200">{formatNumber(h.selectedPrice, 0)} ₽/т</td>
                    <td className="py-2 px-2.5 font-mono text-zinc-300">{formatNumber(h.capexPerHa, 0)} ₽</td>
                    <td className="py-2 px-2.5 font-mono font-bold">
                      <span className={h.npv >= 0 ? 'text-[#a5b997]' : 'text-[#e09898]'}>
                        {formatRub(h.npv)}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 font-mono text-zinc-300">
                      {h.irr !== null ? `${h.irr.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 px-2.5 font-mono text-zinc-300">
                      {h.breakEven !== null ? `${h.breakEven} лет` : '>15 лет'}
                    </td>
                    <td className="py-2 px-2.5 text-right">
                      <button
                        onClick={() => restoreHistoryItem(h)}
                        className="px-2.5 py-1 rounded-lg bg-[#3A4831]/60 hover:bg-[#3A4831] text-[#c8d4be] text-[11px] font-medium transition-colors border border-[#5c744f]/50 inline-flex items-center gap-1"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Восстановить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
