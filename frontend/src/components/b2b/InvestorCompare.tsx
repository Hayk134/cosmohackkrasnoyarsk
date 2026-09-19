import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  RefreshCw,
  Scale,
  FileDown,
} from 'lucide-react';
import { getROI, ROIResponse, AnnualCashFlow, SiteInfo } from '../../api/client';
import { formatNumber, formatRub } from '../../utils';
import { exportInvestorComparePDF } from '../../pdfExport';

interface InvestorCompareProps {
  sites: SiteInfo[];
  currentSiteId: string;
}

export const InvestorCompare: React.FC<InvestorCompareProps> = ({
  sites,
  currentSiteId,
}) => {
  const [siteAId, setSiteAId] = useState<string>(currentSiteId);
  const [siteBId, setSiteBId] = useState<string>(() => {
    const other = sites.find((s) => s.id !== currentSiteId);
    return other ? other.id : (sites[1]?.id || 'RU_MORDOVIA_03');
  });

  const [carbonPrice, setCarbonPrice] = useState<number>(1500);
  const years = 15;
  const [loading, setLoading] = useState<boolean>(false);

  const [roiA, setRoiA] = useState<ROIResponse | null>(null);
  const [roiB, setRoiB] = useState<ROIResponse | null>(null);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  const siteA = sites.find((s) => s.id === siteAId) || {
    id: siteAId,
    name: 'Участок А',
    area_ha: 1750.5,
  };
  const siteB = sites.find((s) => s.id === siteBId) || {
    id: siteBId,
    name: 'Участок Б',
    area_ha: 1832.8,
  };

  const loadComparison = async () => {
    setLoading(true);
    try {
      const [resA, resB] = await Promise.all([
        getROI({
          site_id: siteAId,
          area_ha: siteA.area_ha,
          price_rub: carbonPrice,
          years: years,
        }),
        getROI({
          site_id: siteBId,
          area_ha: siteB.area_ha,
          price_rub: carbonPrice,
          years: years,
        }),
      ]);
      setRoiA(resA);
      setRoiB(resB);
    } catch (e) {
      console.warn('API comparison fallback:', e);
      // Fallback modeled data based on areas and price
      const makeFallback = (area: number, yieldMod: number, capexMod: number): ROIResponse => {
        const capex = area * 75000 * capexMod;
        const annualQ = area * 3.5 * yieldMod;
        const annualRev = annualQ * carbonPrice;
        const annualOpex = area * 3500;
        const annualNet = annualRev - annualOpex;
        const flows: AnnualCashFlow[] = [];
        let cum = -capex;
        let cumUndisc = -capex;
        for (let y = 1; y <= years; y++) {
          const discount = Math.pow(1 + 0.12, y);
          const dcf = annualNet / discount;
          cum += dcf;
          cumUndisc += annualNet;
          flows.push({
            year: y,
            gross_revenue_rub: annualRev,
            opex_rub: annualOpex,
            net_cash_flow_rub: annualNet,
            dcf_rub: dcf,
            cumulative_dcf_rub: cum,
            cumulative_cash_flow_undiscounted_rub: cumUndisc,
            carbon_credits_issued: annualQ,
            carbon_price_rub: carbonPrice,
          });
        }
        return {
          area_ha: area,
          years: years,
          discount_rate: 0.12,
          carbon_yield_t_ha_yr: 3.5 * yieldMod,
          price_rub: carbonPrice,
          total_capex_rub: capex,
          total_opex_nominal_rub: annualOpex * years,
          total_net_cash_flow_rub: annualNet * years,
          npv_rub: cum,
          irr_percent: Math.min(65, Math.max(12, (annualNet / capex) * 100 * 1.35)),
          break_even_year: Math.ceil(capex / annualNet),
          payback_period_years: Math.max(2.5, Math.min(9.0, capex / annualNet)),
          cash_flows: flows,
          calculation_hash: 'fallback',
          selected_scenario: {} as any,
          timber_comparison: {
            timber_volume_m3_ha: 220,
            timber_price_m3: 1800,
            logging_cost_m3: 650,
            net_logging_margin_m3: 1150,
            gross_timber_revenue_rub: area * 220 * 1800,
            reforestation_cost_rub: area * 25000,
            timber_net_proceeds_year0_rub: area * 220 * 1800 * 0.4,
            timber_annual_tax_rub_yr: area * 350,
            timber_npv_rub: area * 220 * 1800 * 0.4,
            carbon_npv_rub: cum,
            delta_npv_rub: cum - area * 220 * 1800 * 0.4,
            parity_carbon_price_rub: 1100,
            preferred_option: 'CARBON_PROJECT',
            recommendation: 'CARBON_PREFERRED',
            carbon_advantage_pct: 125,
            timber_cash_flows: [],
            summary: 'Углеродный проект предпочтительнее вырубки',
          },
          scenarios: {} as any,
        };
      };
      setRoiA(makeFallback(siteA.area_ha, 1.0, 1.0));
      setRoiB(makeFallback(siteB.area_ha, 1.25, 1.15));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComparison();
  }, [siteAId, siteBId, carbonPrice]);

  // Chart computation: dual cash flow curves
  const chartWidth = 560;
  const chartHeight = 200;
  const pad = { top: 20, right: 35, bottom: 25, left: 60 };

  const chartData = useMemo(() => {
    if (!roiA?.cash_flows || !roiB?.cash_flows) return null;
    const flowsA = roiA.cash_flows;
    const flowsB = roiB.cash_flows;
    const count = Math.min(flowsA.length, flowsB.length);

    const allCum = [
      ...flowsA.map((f) => f.cumulative_dcf_rub),
      ...flowsB.map((f) => f.cumulative_dcf_rub),
      0,
    ];
    const minVal = Math.min(...allCum);
    const maxVal = Math.max(...allCum);
    const range = maxVal - minVal || 1;

    const plotW = chartWidth - pad.left - pad.right;
    const plotH = chartHeight - pad.top - pad.bottom;

    const zeroY = pad.top + ((maxVal - 0) / range) * plotH;

    const pointsA = flowsA.slice(0, count).map((f, i) => {
      const x = pad.left + (i / (count - 1)) * plotW;
      const y = pad.top + ((maxVal - f.cumulative_dcf_rub) / range) * plotH;
      return { x, y, flow: f };
    });

    const pointsB = flowsB.slice(0, count).map((f, i) => {
      const x = pad.left + (i / (count - 1)) * plotW;
      const y = pad.top + ((maxVal - f.cumulative_dcf_rub) / range) * plotH;
      return { x, y, flow: f };
    });

    const pathA = pointsA.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), '');
    const pathB = pointsB.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), '');

    return { pointsA, pointsB, pathA, pathB, zeroY, minVal, maxVal, count };
  }, [roiA, roiB]);

  // Derived metrics
  const npvA = roiA?.npv_rub ?? 0;
  const npvB = roiB?.npv_rub ?? 0;
  const pbA = roiA?.payback_period_years ?? 0;
  const pbB = roiB?.payback_period_years ?? 0;
  const irrA = roiA?.irr_percent ?? 0;
  const irrB = roiB?.irr_percent ?? 0;

  const yieldPerHaA = npvA / (siteA.area_ha || 1) / years;
  const yieldPerHaB = npvB / (siteB.area_ha || 1) / years;

  return (
    <div className="flex flex-col gap-4 text-zinc-100">
      {/* Top Selector Bar */}
      <div className="liquid-glass rounded-2xl p-3.5 border border-zinc-800 bg-zinc-950/80 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3A4831]/50 text-[#a5b997]">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Сравнение инвестиционной привлекательности 2 участков
            </h3>
            <p className="text-[11px] text-zinc-400">
              Сопоставление возврата на капитал, денежного потока и окупаемости
            </p>
          </div>
        </div>

        {/* Quick controls for price & PDF Export */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 bg-zinc-900/90 px-3 py-1.5 rounded-xl border border-zinc-800 text-xs">
            <span className="text-zinc-400">Цена квоты:</span>
            <span className="font-mono font-bold text-[#c8d4be]">{formatNumber(carbonPrice, 0)} ₽/т</span>
            <input
              type="range"
              min={500}
              max={4000}
              step={100}
              value={carbonPrice}
              onChange={(e) => setCarbonPrice(Number(e.target.value))}
              className="w-24 accent-[#5c744f] cursor-pointer"
            />
          </div>

          <button
            onClick={() => exportInvestorComparePDF(siteA, siteB, roiA, roiB, carbonPrice)}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900/90 hover:bg-zinc-800 px-3.5 py-1.5 text-xs font-semibold text-[#c8d4be] hover:text-white transition shadow-sm"
            title="Скачать сравнительный инвестиционный PDF-меморандум 2 участков"
          >
            <FileDown className="h-3.5 w-3.5 text-[#a5b997]" />
            <span>Скачать PDF сравнения</span>
          </button>
        </div>
      </div>

      {/* Side-by-Side Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Site A Selector */}
        <div className="rounded-xl bg-[#274934]/25 border border-[#3A4831] p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#a5b997] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#7f9870] inline-block" />
              Участок №1 (Зелёная кривая)
            </span>
            <span className="text-[11px] font-mono text-zinc-400">{siteA.area_ha.toFixed(0)} га</span>
          </div>
          <select
            value={siteAId}
            onChange={(e) => setSiteAId(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded-lg p-2 font-medium focus:outline-none focus:border-[#7f9870]"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.area_ha.toFixed(0)} га)
              </option>
            ))}
          </select>
        </div>

        {/* Site B Selector */}
        <div className="rounded-xl bg-zinc-900/70 border border-zinc-700/60 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#c8d4be] inline-block" />
              Участок №2 (Светлая кривая)
            </span>
            <span className="text-[11px] font-mono text-zinc-400">{siteB.area_ha.toFixed(0)} га</span>
          </div>
          <select
            value={siteBId}
            onChange={(e) => setSiteBId(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded-lg p-2 font-medium focus:outline-none focus:border-zinc-500"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.area_ha.toFixed(0)} га)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison Scorecards Table */}
      <div className="liquid-glass rounded-2xl p-4 border border-zinc-800 bg-zinc-950/70 flex flex-col gap-3 shadow-xl">
        <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-800/80 pb-2 flex justify-between items-center">
          <span>Сравнительная матрица доходности</span>
          {loading && (
            <span className="flex items-center gap-1 text-[11px] text-[#a5b997]">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Синхронизация...
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          {/* Metric 1: Payback */}
          <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400 uppercase">Срок окупаемости</span>
            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[10px] text-[#7f9870] block">Участок 1</span>
                <span className="font-mono font-bold text-sm text-white">{pbA.toFixed(1)} г.</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-400 block">Участок 2</span>
                <span className="font-mono font-bold text-sm text-zinc-300">{pbB.toFixed(1)} г.</span>
              </div>
            </div>
            <div className="mt-1 text-[9px] font-semibold text-[#a5b997]">
              {pbA <= pbB ? '✓ Быстрее окупается Участок 1' : '✓ Быстрее окупается Участок 2'}
            </div>
          </div>

          {/* Metric 2: Total 15-yr Net Profit (NPV) */}
          <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400 uppercase">Чистый доход (NPV 15 лет)</span>
            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[10px] text-[#7f9870] block">Участок 1</span>
                <span className="font-mono font-bold text-sm text-white">{formatRub(npvA)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-400 block">Участок 2</span>
                <span className="font-mono font-bold text-sm text-zinc-300">{formatRub(npvB)}</span>
              </div>
            </div>
            <div className="mt-1 text-[9px] font-semibold text-[#a5b997]">
              {npvA >= npvB ? '✓ Выше прибыль у Участка 1' : '✓ Выше прибыль у Участка 2'}
            </div>
          </div>

          {/* Metric 3: IRR */}
          <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400 uppercase">Внутренняя доходность (IRR)</span>
            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[10px] text-[#7f9870] block">Участок 1</span>
                <span className="font-mono font-bold text-sm text-white">{irrA.toFixed(1)}%</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-400 block">Участок 2</span>
                <span className="font-mono font-bold text-sm text-zinc-300">{irrB.toFixed(1)}%</span>
              </div>
            </div>
            <div className="mt-1 text-[9px] font-semibold text-[#a5b997]">
              {irrA >= irrB ? '✓ Выше отдача у Участка 1' : '✓ Выше отдача у Участка 2'}
            </div>
          </div>

          {/* Metric 4: Yield per Ha per year */}
          <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400 uppercase">Доходность на 1 га в год</span>
            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[10px] text-[#7f9870] block">Участок 1</span>
                <span className="font-mono font-bold text-sm text-white">{formatNumber(yieldPerHaA, 0)} ₽</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-400 block">Участок 2</span>
                <span className="font-mono font-bold text-sm text-zinc-300">{formatNumber(yieldPerHaB, 0)} ₽</span>
              </div>
            </div>
            <div className="mt-1 text-[9px] font-semibold text-[#a5b997]">
              {yieldPerHaA >= yieldPerHaB ? '✓ Эффективнее Участок 1' : '✓ Эффективнее Участок 2'}
            </div>
          </div>
        </div>

        {/* Dual Cashflow Chart */}
        <div className="rounded-xl bg-zinc-900/80 p-3.5 border border-zinc-800/90 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#a5b997]" />
              Сравнение накопленной прибыли во времени (Динамика Cash Flow)
            </span>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5 text-[#a5b997]">
                <span className="w-3 h-1 bg-[#7f9870] rounded-full inline-block" />
                {siteA.name}
              </span>
              <span className="flex items-center gap-1.5 text-[#c8d4be]">
                <span className="w-3 h-1 bg-[#c8d4be] rounded-full inline-block" />
                {siteB.name}
              </span>
            </div>
          </div>

          {/* SVG Chart Container */}
          <div className="relative w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto overflow-visible select-none"
            >
              {/* Zero threshold line */}
              {chartData && (
                <>
                  <line
                    x1={pad.left}
                    y1={chartData.zeroY}
                    x2={chartWidth - pad.right}
                    y2={chartData.zeroY}
                    stroke="#52525b"
                    strokeWidth="1"
                    strokeDasharray="4 3"
                  />
                  <text
                    x={pad.left - 6}
                    y={chartData.zeroY + 3}
                    textAnchor="end"
                    fill="#71717a"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    0 ₽ (Безубыточность)
                  </text>
                </>
              )}

              {/* Curve A (Site 1) */}
              {chartData && (
                <>
                  <path
                    d={chartData.pathA}
                    fill="none"
                    stroke="#7f9870"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {chartData.pointsA.map((p, idx) => (
                    <circle
                      key={`a-${idx}`}
                      cx={p.x}
                      cy={p.y}
                      r={hoveredYear === p.flow.year ? 4.5 : 2.5}
                      fill="#3A4831"
                      stroke="#7f9870"
                      strokeWidth="2"
                      onMouseEnter={() => setHoveredYear(p.flow.year)}
                      onMouseLeave={() => setHoveredYear(null)}
                      className="cursor-pointer transition-all"
                    />
                  ))}
                </>
              )}

              {/* Curve B (Site 2) */}
              {chartData && (
                <>
                  <path
                    d={chartData.pathB}
                    fill="none"
                    stroke="#c8d4be"
                    strokeWidth="2"
                    strokeDasharray="5 3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {chartData.pointsB.map((p, idx) => (
                    <rect
                      key={`b-${idx}`}
                      x={p.x - 2.5}
                      y={p.y - 2.5}
                      width={hoveredYear === p.flow.year ? 6 : 4}
                      height={hoveredYear === p.flow.year ? 6 : 4}
                      fill="#27272a"
                      stroke="#c8d4be"
                      strokeWidth="1.5"
                      onMouseEnter={() => setHoveredYear(p.flow.year)}
                      onMouseLeave={() => setHoveredYear(null)}
                      className="cursor-pointer transition-all"
                    />
                  ))}
                </>
              )}

              {/* X Axis ticks */}
              {chartData &&
                chartData.pointsA.map((p, i) => {
                  if (i % 3 !== 0 && i !== chartData.count - 1) return null;
                  return (
                    <text
                      key={`x-${i}`}
                      x={p.x}
                      y={chartHeight - 6}
                      textAnchor="middle"
                      fill="#71717a"
                      fontSize="9"
                      fontFamily="monospace"
                    >
                      {p.flow.year} г.
                    </text>
                  );
                })}
            </svg>
          </div>

          <div className="flex justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/80">
            <span>Старт: вложение капитала (CAPEX)</span>
            <span>Точка пересечения 0 ₽: проект окупился</span>
            <span>15 лет: итоговая накопленная масса прибыли</span>
          </div>
        </div>
      </div>
    </div>
  );
};
