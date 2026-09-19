import React from 'react';
import {
  X,
  Printer,
  Download,
  FileText,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { ReportResponse } from '../api/client';
import { formatNumber, formatInt, formatRub } from '../utils';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ReportResponse | null;
  loading: boolean;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  report,
  loading,
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    if (!report?.html_report) return;
    // Open in a print popup window
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(report.html_report);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 300);
    }
  };

  const handleDownloadJSON = () => {
    if (!report?.json_report) return;
    const jsonStr = JSON.stringify(report.json_report, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.report_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const jsonRep = report?.json_report;
  const waterfall = jsonRep?.accounting_waterfall;
  const project = jsonRep?.project;
  const valuations = jsonRep?.financial_valuations_rub;
  const isValid = report?.is_valid ?? true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">
                  Официальный сертификат верификации (MRV Audit)
                </h3>
                <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/20">
                  {report?.report_id || 'AUDIT-CERT'}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Независимое экспертное заключение на основе спутниковой телеметрии
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body - Printable Preview */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && !report ? (
            <div className="h-96 animate-pulse rounded-xl bg-zinc-900/60" />
          ) : report ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-6 text-zinc-200">
              {/* Top Banner */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-4">
                <div>
                  <div className="text-xs font-mono text-emerald-400 uppercase tracking-wider font-semibold">
                    Kosmo·MRV Satellite Verification Audit
                  </div>
                  <h2 className="text-xl font-bold text-white mt-0.5">
                    Сертификат верификации углеродных единиц
                  </h2>
                  <div className="text-xs text-zinc-400 mt-1">
                    Сгенерировано: {report.generated_at.replace('T', ' ').slice(0, 19)} UTC
                  </div>
                </div>

                <div
                  className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold border ${
                    isValid
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}
                >
                  {isValid ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-rose-400" />
                  )}
                  <span>{isValid ? 'VERIFIED & ACCREDITED' : 'BLOCKED / REJECTED'}</span>
                </div>
              </div>

              {/* Project & Satellite Provenance Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Project identification */}
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-2">
                  <div className="font-semibold uppercase tracking-wider text-zinc-400 text-[11px]">
                    Идентификация проекта
                  </div>
                  <div className="flex justify-between border-b border-zinc-850 pb-1">
                    <span className="text-zinc-400">Участок:</span>
                    <span className="font-bold text-white font-mono">{project?.site_id}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-850 pb-1">
                    <span className="text-zinc-400">Площадь WGS 84:</span>
                    <span className="font-mono font-bold text-zinc-100">
                      {formatNumber(project?.area_ha, 2)} га
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-850 pb-1">
                    <span className="text-zinc-400">Период учёта:</span>
                    <span className="text-zinc-100">{project?.observation_period}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Методология:</span>
                    <span className="text-emerald-400 font-medium">Балансовый метод (Stock-Difference)</span>
                  </div>
                </div>

                {/* Satellite Provenance */}
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-2">
                  <div className="font-semibold uppercase tracking-wider text-zinc-400 text-[11px]">
                    Спутниковый прованс данных
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-zinc-300 font-medium">ESA CCI Biomass v7.0 (100 м)</span>
                      <span className="text-zinc-400">Плотность AGB & AGB_SD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-300 font-medium">Sentinel-2 L2A (10 м)</span>
                      <span className="text-zinc-400">BOA Offset + SCL Mask</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-300 font-medium">MODIS MCD64A1 v061 (500 м)</span>
                      <span className="text-zinc-400">Burn Date гарей 2021</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-300 font-medium">Hansen GFC v1.13 (30 м)</span>
                      <span className="text-zinc-400">Потери покрова 2000-2024</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Waterfall summary table */}
              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/90 text-zinc-400 uppercase text-[10px] tracking-wider">
                    <tr className="border-b border-zinc-800">
                      <th className="py-2 px-3 font-semibold">Параметр</th>
                      <th className="py-2 px-3 font-semibold">Источник / Формула</th>
                      <th className="py-2 px-3 text-right font-semibold">Значение</th>
                      <th className="py-2 px-3 font-semibold">Ед. изм.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850 font-mono text-[11px]">
                    <tr>
                      <td className="py-1.5 px-3 text-zinc-300">Плотность биомассы 2019</td>
                      <td className="py-1.5 px-3 text-zinc-400">CCI Biomass 2019</td>
                      <td className="py-1.5 px-3 text-right text-white">
                        {formatNumber(waterfall?.t0_biomass_t_ha, 2)}
                      </td>
                      <td className="py-1.5 px-3 text-zinc-400">т/га</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-zinc-300">Плотность биомассы 2024</td>
                      <td className="py-1.5 px-3 text-zinc-400">CCI Biomass 2024</td>
                      <td className="py-1.5 px-3 text-right text-white">
                        {formatNumber(waterfall?.t1_biomass_t_ha, 2)}
                      </td>
                      <td className="py-1.5 px-3 text-zinc-400">т/га</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-zinc-300">Проектный углеродный эффект (R)</td>
                      <td className="py-1.5 px-3 text-zinc-400">E_base - E_proj - Leakage</td>
                      <td className="py-1.5 px-3 text-right text-emerald-400 font-bold">
                        {formatNumber(waterfall?.r_gross_t_co2e, 2)}
                      </td>
                      <td className="py-1.5 px-3 text-zinc-400">т CO₂e</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-zinc-300">Пространственный Moran's I</td>
                      <td className="py-1.5 px-3 text-zinc-400">Queen 2D Contiguity</td>
                      <td className="py-1.5 px-3 text-right text-white">
                        {formatNumber(waterfall?.moran_i, 4)}
                      </td>
                      <td className="py-1.5 px-3 text-zinc-400">—</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-zinc-300">Инфляция дисперсии VIF</td>
                      <td className="py-1.5 px-3 text-zinc-400">Clifford-Ord N/N_eff</td>
                      <td className="py-1.5 px-3 text-right text-white">
                        {formatNumber(waterfall?.vif, 2)}
                      </td>
                      <td className="py-1.5 px-3 text-zinc-400">множ.</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-zinc-300">Вычет за неопределённость (UNC)</td>
                      <td className="py-1.5 px-3 text-zinc-400">max(0, H/R - 0.10)</td>
                      <td className="py-1.5 px-3 text-right text-amber-400">
                        {formatNumber(waterfall?.unc_deduction_pct, 1)}%
                      </td>
                      <td className="py-1.5 px-3 text-zinc-400">%</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-zinc-300">Буфер перманентности (B)</td>
                      <td className="py-1.5 px-3 text-zinc-400">0.15 × R_adj</td>
                      <td className="py-1.5 px-3 text-right text-zinc-300">
                        {formatNumber(waterfall?.buffer_pool_15pct, 2)}
                      </td>
                      <td className="py-1.5 px-3 text-zinc-400">т CO₂e</td>
                    </tr>
                    <tr className="bg-emerald-950/30">
                      <td className="py-2 px-3 text-emerald-300 font-bold">
                        Торгуемые углеродные единицы (Q)
                      </td>
                      <td className="py-2 px-3 text-emerald-400">floor(R_adj - B)</td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-extrabold text-sm">
                        {formatInt(waterfall?.q_tradable_units)}
                      </td>
                      <td className="py-2 px-3 text-emerald-300 font-semibold">угл. единиц</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Scenarios Valuations */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
                  Сценарная финансовая оценка
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="border border-zinc-800/80 rounded-xl p-3 bg-zinc-900/70">
                    <span className="text-[11px] text-zinc-400">Консервативный (500 ₽/т)</span>
                    <div className="font-mono font-bold text-zinc-100 text-sm mt-1">
                      {formatRub(valuations?.conservative_500)}
                    </div>
                  </div>
                  <div className="border border-zinc-800/80 rounded-xl p-3 bg-zinc-900/70">
                    <span className="text-[11px] text-zinc-300">Базовый (1 500 ₽/т)</span>
                    <div className="font-mono font-bold text-emerald-300 text-sm mt-1">
                      {formatRub(valuations?.base_1500)}
                    </div>
                  </div>
                  <div className="border border-zinc-800/80 rounded-xl p-3 bg-zinc-900/70">
                    <span className="text-[11px] text-zinc-400">Оптимистичный (4 000 ₽/т)</span>
                    <div className="font-mono font-bold text-zinc-100 text-sm mt-1">
                      {formatRub(valuations?.optimistic_4000)}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          ) : null}
        </div>

        {/* Footer with action buttons */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950 px-6 py-3">
          <div className="text-xs text-zinc-500">
            Формат А4 с полной проектной атрибуцией
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadJSON}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200 hover:border-emerald-500/40 hover:bg-zinc-800 transition"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span>Экспорт JSON</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-zinc-950 hover:bg-emerald-400 transition shadow-md shadow-emerald-500/20"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Печать / Экспорт PDF (A4)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
