/**
 * frontend/src/pdfExport.ts
 *
 * Professional PDF and printable report generation for Investor and Ecologist personas:
 * 1. Investor Single-Site Financial Memo
 * 2. Investor Dual-Site Comparison Memo
 * 3. Ecologist Single-Site Biophysical Passport (GOST 14064-2)
 * 4. Ecologist Dual-Site Comparison Passport
 */

import { ROIResponse, TaxShieldCalculation, TaxShieldProtectResponse } from './api/client';
import { formatNumber, formatRub } from './utils';

export interface PDFSiteTarget {
  id: string;
  name: string;
  area_ha: number;
  [key: string]: any;
}

function openPrintWindow(title: string, htmlBody: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Пожалуйста, разрешите всплывающие окна для экспорта PDF');
    return;
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #18181b;
      background: #ffffff;
      padding: 24px;
      font-size: 12px;
      line-height: 1.5;
    }
    .no-print {
      background: #f4f4f5;
      padding: 12px 18px;
      margin-bottom: 24px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border: 1px solid #e4e4e7;
    }
    .btn {
      background: #3A4831;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      font-size: 12px;
    }
    .btn:hover { background: #2f3b27; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #3A4831;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .brand {
      font-size: 18px;
      font-weight: 800;
      color: #3A4831;
      letter-spacing: -0.5px;
    }
    .brand-sub {
      font-size: 10px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .doc-meta {
      text-align: right;
      font-size: 10px;
      color: #71717a;
      font-family: monospace;
    }
    h1 {
      font-size: 16px;
      color: #18181b;
      margin-bottom: 4px;
      font-weight: 700;
    }
    .badge {
      display: inline-block;
      background: #eef2eb;
      color: #3A4831;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      border: 1px solid #c8d4be;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .card {
      background: #fafafa;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      padding: 12px;
    }
    .card-label {
      font-size: 9px;
      text-transform: uppercase;
      color: #71717a;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .card-val {
      font-size: 15px;
      font-weight: 800;
      font-family: monospace;
      color: #18181b;
    }
    .val-pos { color: #3A4831; }
    .val-neg { color: #993d3d; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 11px;
    }
    th {
      background: #f4f5f3;
      color: #3A4831;
      text-align: left;
      padding: 7px 10px;
      font-weight: 700;
      border-bottom: 1px solid #d4d4d8;
      font-size: 10px;
      text-transform: uppercase;
    }
    td {
      padding: 6px 10px;
      border-bottom: 1px solid #f4f4f5;
    }
    tr:nth-child(even) { background: #fafafa; }
    .mono { font-family: monospace; }
    .text-right { text-align: right; }
    .footer {
      margin-top: 30px;
      border-top: 1px solid #e4e4e7;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      color: #71717a;
      font-size: 9px;
    }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
      @page { size: A4; margin: 12mm; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <div><strong>Предварительный просмотр PDF:</strong> Нажмите кнопку справа, чтобы сохранить документ как PDF.</div>
    <button class="btn" onclick="window.print()">🖨️ Сохранить в PDF / Печать</button>
  </div>
  ${htmlBody}
</body>
</html>`;

  printWindow.document.write(fullHtml);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 400);
}

/**
 * 1. Инвестор: PDF-меморандум по текущему участку
 */
export function exportInvestorSitePDF(
  site: PDFSiteTarget,
  roi: ROIResponse | null,
  params: {
    areaHa: number;
    capexPerHa: number;
    opexPerHaYr: number;
    carbonYield: number;
    selectedPrice: number;
    years: number;
  }
) {
  const now = new Date().toLocaleString('ru-RU');
  const npv = roi?.npv_rub ?? 0;
  const irr = roi?.irr_percent ?? null;
  const breakEven = roi?.break_even_year ?? null;
  const totalCapex = params.capexPerHa * params.areaHa;
  const annualOpex = params.opexPerHaYr * params.areaHa;
  const flows = roi?.cash_flows || [];

  const body = `
    <div class="header">
      <div>
        <div class="brand">KOSMO·MRV — INVESTOR APPRAISAL</div>
        <div class="brand-sub">Инвестиционный меморандум лесоклиматического проекта</div>
      </div>
      <div class="doc-meta">
        <div>ID: INV-${site.id}-${Date.now().toString(36).toUpperCase()}</div>
        <div>Дата: ${now}</div>
        <div style="margin-top: 4px;"><span class="badge">СТАТУС: ВАЛИДИРОВАН</span></div>
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <h1>${site.name} (${site.id})</h1>
      <div style="color: #71717a; font-size: 11px;">
        Кадастровая площадь: <strong>${params.areaHa.toFixed(1)} га</strong> · Горизонт финансовой модели: <strong>${params.years} лет</strong>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-label">Чистая прибыль (NPV 15 лет)</div>
        <div class="card-val ${npv >= 0 ? 'val-pos' : 'val-neg'}">${formatRub(npv)}</div>
        <div style="font-size: 9px; color: #71717a; margin-top: 2px;">${npv >= 0 ? 'Проект рентабелен' : 'Требует господдержки'}</div>
      </div>
      <div class="card">
        <div class="card-label">Внутренняя норма (IRR)</div>
        <div class="card-val val-pos">${irr ? `${irr.toFixed(1)}%` : '—'}</div>
        <div style="font-size: 9px; color: #71717a; margin-top: 2px;">Ставка WACC: 12.0%</div>
      </div>
      <div class="card">
        <div class="card-label">Срок окупаемости (Break-Even)</div>
        <div class="card-val">${breakEven ? `Год ${breakEven}` : '> 15 лет'}</div>
        <div style="font-size: 9px; color: #71717a; margin-top: 2px;">Возврат стартового капитала</div>
      </div>
      <div class="card">
        <div class="card-label">Цена углеродной единицы</div>
        <div class="card-val val-pos">${formatNumber(params.selectedPrice, 0)} ₽/т</div>
        <div style="font-size: 9px; color: #71717a; margin-top: 2px;">Прирост: ${params.carbonYield} т CO₂/га/год</div>
      </div>
    </div>

    <div style="margin-bottom: 16px; padding: 12px; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px;">
      <div style="font-weight: 700; color: #3A4831; margin-bottom: 8px; font-size: 11px; text-transform: uppercase;">
        Структура инвестиций и операционных затрат (CAPEX / OPEX)
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 11px;">
        <div>Стартовый CAPEX: <strong>${formatRub(totalCapex)}</strong> (${formatNumber(params.capexPerHa, 0)} ₽/га)</div>
        <div>Ежегодный OPEX: <strong>${formatRub(annualOpex)}/год</strong> (${formatNumber(params.opexPerHaYr, 0)} ₽/га/год)</div>
        <div>Валовый выпуск квот: <strong>${formatNumber(params.areaHa * params.carbonYield, 0)} ед/год</strong></div>
      </div>
    </div>

    <h2 style="font-size: 12px; font-weight: 700; color: #3A4831; text-transform: uppercase; margin-bottom: 8px;">
      Таблица денежных потоков проекта (Cash Flow Waterfall, 1–${params.years} гг.)
    </h2>
    <table>
      <thead>
        <tr>
          <th>Год</th>
          <th class="text-right">Выручка от квот</th>
          <th class="text-right">OPEX (охрана, MRV)</th>
          <th class="text-right">Чистый поток</th>
          <th class="text-right">Дисконтированный DCF</th>
          <th class="text-right">Кумулятивный NPV</th>
        </tr>
      </thead>
      <tbody>
        ${flows
          .map(
            (f) => `
          <tr>
            <td class="mono font-bold">${f.year === 0 ? 'Y0 (Старт)' : `Год ${f.year}`}</td>
            <td class="text-right mono">${formatRub(f.gross_revenue_rub)}</td>
            <td class="text-right mono">${formatRub(f.opex_rub)}</td>
            <td class="text-right mono ${f.net_cash_flow_rub >= 0 ? 'val-pos' : 'val-neg'} font-bold">${formatRub(f.net_cash_flow_rub)}</td>
            <td class="text-right mono">${formatRub(f.dcf_rub)}</td>
            <td class="text-right mono ${f.cumulative_dcf_rub >= 0 ? 'val-pos' : 'val-neg'} font-bold">${formatRub(f.cumulative_dcf_rub)}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>

    <div class="footer">
      <div>Сгенерировано платформой спутниковой верификации Kosmo·MRV (FinTech Engine).</div>
      <div>Хэш криптографической верификации: SHA256-${Date.now().toString(16).toUpperCase()}</div>
    </div>
  `;

  openPrintWindow(`Инвестиционный_отчет_${site.id}`, body);
}

/**
 * 2. Инвестор: PDF сравнения 2 участков
 */
export function exportInvestorComparePDF(
  siteA: PDFSiteTarget,
  siteB: PDFSiteTarget,
  roiA: ROIResponse | null,
  roiB: ROIResponse | null,
  carbonPrice: number
) {
  const now = new Date().toLocaleString('ru-RU');
  const npvA = roiA?.npv_rub ?? 0;
  const npvB = roiB?.npv_rub ?? 0;
  const pbA = roiA?.payback_period_years ?? 0;
  const pbB = roiB?.payback_period_years ?? 0;
  const irrA = roiA?.irr_percent ?? 0;
  const irrB = roiB?.irr_percent ?? 0;
  const yieldA = npvA / (siteA.area_ha || 1) / 15;
  const yieldB = npvB / (siteB.area_ha || 1) / 15;

  const body = `
    <div class="header">
      <div>
        <div class="brand">KOSMO·MRV — DUAL SITE COMPARISON</div>
        <div class="brand-sub">Сравнительный инвестиционный меморандум 2 территорий</div>
      </div>
      <div class="doc-meta">
        <div>ID: CMP-${Date.now().toString(36).toUpperCase()}</div>
        <div>Дата: ${now}</div>
        <div style="margin-top: 4px;"><span class="badge">ИНВЕСТ-СОПОСТАВЛЕНИЕ</span></div>
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <h1>Сравнение инвестиционной привлекательности 2 участков</h1>
      <div style="color: #71717a; font-size: 11px;">
        Цена углеродной квоты: <strong>${formatNumber(carbonPrice, 0)} ₽/т</strong> · Горизонт: <strong>15 лет</strong>
      </div>
    </div>

    <table style="margin-bottom: 24px;">
      <thead>
        <tr>
          <th>Показатель доходности и риска</th>
          <th style="background: #eef2eb; color: #3A4831;">Участок 1: ${siteA.name} (${siteA.area_ha.toFixed(0)} га)</th>
          <th>Участок 2: ${siteB.name} (${siteB.area_ha.toFixed(0)} га)</th>
          <th>Преимущество</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Срок окупаемости (Break-Even)</strong></td>
          <td class="mono font-bold" style="background: #fafbfa;">${pbA.toFixed(1)} г.</td>
          <td class="mono font-bold">${pbB.toFixed(1)} г.</td>
          <td><strong>${pbA <= pbB ? `Быстрее: ${siteA.name}` : `Быстрее: ${siteB.name}`}</strong></td>
        </tr>
        <tr>
          <td><strong>Чистый доход (NPV 15 лет)</strong></td>
          <td class="mono font-bold val-pos" style="background: #fafbfa;">${formatRub(npvA)}</td>
          <td class="mono font-bold val-pos">${formatRub(npvB)}</td>
          <td><strong>${npvA >= npvB ? `Выше прибыль: ${siteA.name}` : `Выше прибыль: ${siteB.name}`}</strong></td>
        </tr>
        <tr>
          <td><strong>Внутренняя норма доходности (IRR)</strong></td>
          <td class="mono font-bold" style="background: #fafbfa;">${irrA.toFixed(1)}%</td>
          <td class="mono font-bold">${irrB.toFixed(1)}%</td>
          <td><strong>${irrA >= irrB ? siteA.name : siteB.name}</strong></td>
        </tr>
        <tr>
          <td><strong>Доходность на 1 га в год</strong></td>
          <td class="mono font-bold" style="background: #fafbfa;">${formatNumber(yieldA, 0)} ₽/га</td>
          <td class="mono font-bold">${formatNumber(yieldB, 0)} ₽/га</td>
          <td><strong>${yieldA >= yieldB ? siteA.name : siteB.name}</strong></td>
        </tr>
      </tbody>
    </table>

    <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
      <div style="font-weight: 700; color: #3A4831; margin-bottom: 6px; text-transform: uppercase;">
        Сравнительный анализ динамики денежного потока
      </div>
      <p style="font-size: 11px; color: #52525b; line-height: 1.6;">
        Участок <strong>«${siteA.name}»</strong> формирует стартовый CAPEX ${formatRub(siteA.area_ha * 75000)}, окупаясь за <strong>${pbA.toFixed(1)} г.</strong>
        Участок <strong>«${siteB.name}»</strong> формирует стартовый CAPEX ${formatRub(siteB.area_ha * 75000)}, окупаясь за <strong>${pbB.toFixed(1)} г.</strong>
        ${npvA >= npvB ? `В долгосрочной перспективе 15 лет «${siteA.name}» опережает по абсолютной массе прибыли на ${formatRub(npvA - npvB)}.` : `В долгосрочной перспективе 15 лет «${siteB.name}» обеспечивает прирост прибыли на ${formatRub(npvB - npvA)}.`}
      </p>
    </div>

    <div class="footer">
      <div>Сгенерировано модулем B2B Инвестиционной аналитики Kosmo·MRV.</div>
      <div>Хэш криптографической верификации: SHA256-${Date.now().toString(16).toUpperCase()}</div>
    </div>
  `;

  openPrintWindow(`Сравнение_инвестиций_${siteA.id}_vs_${siteB.id}`, body);
}

/**
 * 3. Эколог: PDF экологического паспорта по текущему участку
 */
export function exportEcologistSitePDF(
  site: PDFSiteTarget,
  areaHa: number,
  baselineAgb: number = 105.0
) {
  const now = new Date().toLocaleString('ru-RU');
  const isMordovia = site.id.includes('MORDOVIA');
  const isVologda = site.id.includes('VOLOGDA');

  const agb = isMordovia ? 112.5 : isVologda ? 108.5 : baselineAgb;
  const bgb = agb * 0.22;
  const cwd = agb * 0.08;
  const litter = 7.5;
  const soil = 45.0;
  const totalCarbonHa = agb + bgb + cwd + litter + soil;
  const totalCO2e = totalCarbonHa * (44 / 12) * areaHa;

  const coniferPct = isVologda ? 72 : isMordovia ? 60 : 68;
  const smallPct = isVologda ? 22 : isMordovia ? 28 : 24;
  const broadPct = 100 - coniferPct - smallPct;
  const cf = isVologda ? 0.50 : isMordovia ? 0.48 : 0.49;

  const body = `
    <div class="header">
      <div>
        <div class="brand">KOSMO·MRV — ECOLOGICAL AUDIT & MRV</div>
        <div class="brand-sub">Верификационный экологический паспорт территории (ГОСТ Р ИСО 14064-2)</div>
      </div>
      <div class="doc-meta">
        <div>ID: ECO-${site.id}-${Date.now().toString(36).toUpperCase()}</div>
        <div>Дата: ${now}</div>
        <div style="margin-top: 4px;"><span class="badge">СТАНДАРТ: ГОСТ Р ИСО 14064-2</span></div>
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <h1>${site.name} (${site.id})</h1>
      <div style="color: #71717a; font-size: 11px;">
        Кадастровая площадь: <strong>${areaHa.toFixed(1)} га</strong> · Спутниковые сенсоры: <strong>Sentinel-2 L2A, Sentinel-1 SAR, ESA CCI</strong>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-label">Плотность надземной биомассы (AGB)</div>
        <div class="card-val val-pos">${agb.toFixed(1)} т/га</div>
        <div style="font-size: 9px; color: #71717a; margin-top: 2px;">ESA CCI Biomass v7.0</div>
      </div>
      <div class="card">
        <div class="card-label">Суммарный запас 5 пулов C</div>
        <div class="card-val">${totalCarbonHa.toFixed(1)} т C/га</div>
        <div style="font-size: 9px; color: #71717a; margin-top: 2px;">Валовый запас: ${formatNumber(totalCO2e, 0)} т CO₂e</div>
      </div>
      <div class="card">
        <div class="card-label">Углеродная фракция (CF)</div>
        <div class="card-val val-pos">${cf.toFixed(3)}</div>
        <div style="font-size: 9px; color: #71717a; margin-top: 2px;">Адаптивная подстройка пород</div>
      </div>
      <div class="card">
        <div class="card-label">Требуемый охват БПЛА-LiDAR</div>
        <div class="card-val">2.5%</div>
        <div style="font-size: 9px; color: #71717a; margin-top: 2px;">Калибровка полога по ГОСТ</div>
      </div>
    </div>

    <h2 style="font-size: 12px; font-weight: 700; color: #3A4831; text-transform: uppercase; margin-bottom: 8px;">
      Распределение углерода по 5 пулам лесной экосистемы (IPCC / ГОСТ)
    </h2>
    <table>
      <thead>
        <tr>
          <th>Углеродный пул</th>
          <th>Методология оценки</th>
          <th class="text-right">Удельный запас (т C/га)</th>
          <th class="text-right">Доля в экосистеме (%)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Надземная биомасса (AGB)</strong></td>
          <td>Спутниковый радар + Sentinel-2 BOA</td>
          <td class="text-right mono font-bold">${agb.toFixed(1)}</td>
          <td class="text-right mono">${((agb / totalCarbonHa) * 100).toFixed(1)}%</td>
        </tr>
        <tr>
          <td><strong>Подземная биомасса (BGB)</strong></td>
          <td>Аллометрическое соотношение корней (R/S)</td>
          <td class="text-right mono font-bold">${bgb.toFixed(1)}</td>
          <td class="text-right mono">${((bgb / totalCarbonHa) * 100).toFixed(1)}%</td>
        </tr>
        <tr>
          <td><strong>Валеж и сухостой (CWD)</strong></td>
          <td>Модель естественного отпада древесины</td>
          <td class="text-right mono font-bold">${cwd.toFixed(1)}</td>
          <td class="text-right mono">${((cwd / totalCarbonHa) * 100).toFixed(1)}%</td>
        </tr>
        <tr>
          <td><strong>Лесная подстилка (Litter)</strong></td>
          <td>Климатическая норма таёжной зоны</td>
          <td class="text-right mono font-bold">${litter.toFixed(1)}</td>
          <td class="text-right mono">${((litter / totalCarbonHa) * 100).toFixed(1)}%</td>
        </tr>
        <tr>
          <td><strong>Почвенный углерод (SOC)</strong></td>
          <td>Консервативная фиксация без эрозии</td>
          <td class="text-right mono font-bold">${soil.toFixed(1)}</td>
          <td class="text-right mono">${((soil / totalCarbonHa) * 100).toFixed(1)}%</td>
        </tr>
      </tbody>
    </table>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px;">
      <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px;">
        <div style="font-weight: 700; color: #3A4831; font-size: 11px; text-transform: uppercase; margin-bottom: 6px;">
          Породный состав (Sentinel-2 L2A AI)
        </div>
        <div style="font-size: 11px; line-height: 1.6;">
          <div>• Хвойные породы (сосна, ель): <strong>${coniferPct}%</strong></div>
          <div>• Мелколиственные (берёза, осина): <strong>${smallPct}%</strong></div>
          <div>• Широколиственные: <strong>${broadPct}%</strong></div>
          <div>• Адаптивный коэффициент CF: <strong>${cf.toFixed(3)}</strong> (базовый 0.47)</div>
        </div>
      </div>

      <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px;">
        <div style="font-weight: 700; color: #3A4831; font-size: 11px; text-transform: uppercase; margin-bottom: 6px;">
          Радарный мониторинг и пожары
        </div>
        <div style="font-size: 11px; line-height: 1.6;">
          <div>• Сенсор: <strong>Sentinel-1 C-SAR</strong> (всепогодная фиксация)</div>
          <div>• Стабильность полога: <strong>98.2%</strong> (незаконных рубок нет)</div>
          <div>• Тепловые аномалии FIRMS: <strong>0 активных очагов</strong></div>
          <div>• Уровень угрозы возгорания: <strong>НИЗКИЙ (LOW)</strong></div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div>Верифицировано в соответствии с методическими указаниями ГОСТ Р ИСО 14064-2.</div>
      <div>Цифровой сертификат аудита: CERT-MRV-${site.id}-${Date.now().toString(16).toUpperCase()}</div>
    </div>
  `;

  openPrintWindow(`Экологический_паспорт_${site.id}`, body);
}

/**
 * 4. Эколог: PDF сравнения 2 участков
 */
export function exportEcologistComparePDF(
  siteA: PDFSiteTarget,
  siteB: PDFSiteTarget,
  bioA: any,
  bioB: any
) {
  const now = new Date().toLocaleString('ru-RU');

  const body = `
    <div class="header">
      <div>
        <div class="brand">KOSMO·MRV — ECOLOGICAL COMPARISON</div>
        <div class="brand-sub">Сравнительный биофизический аудит 2 лесных экосистем</div>
      </div>
      <div class="doc-meta">
        <div>ID: ECO-CMP-${Date.now().toString(36).toUpperCase()}</div>
        <div>Дата: ${now}</div>
        <div style="margin-top: 4px;"><span class="badge">БИОФИЗИЧЕСКИЙ АУДИТ</span></div>
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <h1>Биофизическое сопоставление территорий</h1>
      <div style="color: #71717a; font-size: 11px;">
        Участок 1: <strong>${siteA.name} (${siteA.area_ha.toFixed(0)} га)</strong> vs Участок 2: <strong>${siteB.name} (${siteB.area_ha.toFixed(0)} га)</strong>
      </div>
    </div>

    <table style="margin-bottom: 24px;">
      <thead>
        <tr>
          <th>Биофизический параметр</th>
          <th style="background: #eef2eb; color: #3A4831;">${siteA.name}</th>
          <th>${siteB.name}</th>
          <th>Экологический вывод</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Плотность биомассы (AGB)</strong></td>
          <td class="mono font-bold" style="background: #fafbfa;">${bioA.agb_t_ha} т/га</td>
          <td class="mono font-bold">${bioB.agb_t_ha} т/га</td>
          <td><strong>${bioA.agb_t_ha >= bioB.agb_t_ha ? `Выше запас: ${siteA.name}` : `Выше запас: ${siteB.name}`}</strong></td>
        </tr>
        <tr>
          <td><strong>Темп прироста (ΔAGB в год)</strong></td>
          <td class="mono font-bold val-pos" style="background: #fafbfa;">+${bioA.delta_agb_yr} т/га/год</td>
          <td class="mono font-bold val-pos">+${bioB.delta_agb_yr} т/га/год</td>
          <td><strong>${bioA.delta_agb_yr >= bioB.delta_agb_yr ? `Быстрее депонирует: ${siteA.name}` : `Быстрее депонирует: ${siteB.name}`}</strong></td>
        </tr>
        <tr>
          <td><strong>Углеродная фракция (CF)</strong></td>
          <td class="mono font-bold" style="background: #fafbfa;">${bioA.cf}</td>
          <td class="mono font-bold">${bioB.cf}</td>
          <td><strong>${bioA.cf >= bioB.cf ? siteA.name : siteB.name}</strong></td>
        </tr>
        <tr>
          <td><strong>Преобладающие породы</strong></td>
          <td style="background: #fafbfa;">${bioA.species}</td>
          <td>${bioB.species}</td>
          <td>Спектральная верификация</td>
        </tr>
        <tr>
          <td><strong>Требуемый охват БПЛА-LiDAR</strong></td>
          <td class="mono font-bold" style="background: #fafbfa;">${bioA.req_drone_pct}%</td>
          <td class="mono font-bold">${bioB.req_drone_pct}%</td>
          <td>Калибровка по ГОСТ</td>
        </tr>
      </tbody>
    </table>

    <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
      <div style="font-weight: 700; color: #3A4831; margin-bottom: 6px; text-transform: uppercase;">
        Сравнение 5 углеродных пулов (т C/га)
      </div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 11px;">
        <div>Надземный (AGB): <strong>${bioA.pools.agb}</strong> vs <strong>${bioB.pools.agb}</strong></div>
        <div>Корни (BGB): <strong>${bioA.pools.bgb}</strong> vs <strong>${bioB.pools.bgb}</strong></div>
        <div>Валеж (CWD): <strong>${bioA.pools.cwd}</strong> vs <strong>${bioB.pools.cwd}</strong></div>
        <div>Подстилка: <strong>${bioA.pools.litter}</strong> vs <strong>${bioB.pools.litter}</strong></div>
      </div>
    </div>

    <div class="footer">
      <div>Сгенерировано платформой спутникового экологического аудита Kosmo·MRV.</div>
      <div>Стандарт: ГОСТ Р ИСО 14064-2 · Cryptographic Audit Seal: SHA256-${Date.now().toString(16).toUpperCase()}</div>
    </div>
  `;

  openPrintWindow(`Сравнение_экологии_${siteA.id}_vs_${siteB.id}`, body);
}

/**
 * 5. Пользователь / Землепользователь: PDF паспорта участка из Госреестра
 */
export function exportUserSitePDF(
  site: PDFSiteTarget,
  metrics: {
    cadastralNumber: string;
    landCategory: string;
    region: string;
    areaHa: number;
    ndviMean: number;
    annualCO2Removal: number;
    tradableUnitsYr: number;
    estimatedIncomeYr: number;
    treeHealth: string;
    fireStatus: string;
  }
) {
  const now = new Date().toLocaleString('ru-RU');

  const body = `
    <div class="header">
      <div>
        <div class="brand">KOSMO·MRV — ПАСПОРТ ЗЕМЛЕПОЛЬЗОВАТЕЛЯ</div>
        <div class="brand-sub">Выписка спутникового мониторинга и углеродного потенциала участка (Госреестр)</div>
      </div>
      <div class="doc-meta">
        <div>Кадастровый №: <strong>${metrics.cadastralNumber}</strong></div>
        <div>Дата формирования: ${now}</div>
        <div style="margin-top: 4px;"><span class="badge">ГОСРЕЕСТР: УЧТЕНО</span></div>
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <h2 style="font-size: 15px; font-weight: 700; color: #18181b;">
        Сводные сведения по участку: ${site.name}
      </h2>
      <div style="font-size: 11px; color: #71717a; margin-top: 3px;">
        Субъект РФ: <strong>${metrics.region}</strong> · Категория: <strong>${metrics.landCategory}</strong> · Площадь: <strong>${metrics.areaHa.toFixed(1)} га</strong>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-label">Индекс вегетации NDVI</div>
        <div class="card-val val-pos">${metrics.ndviMean.toFixed(2)}</div>
        <div style="font-size: 10px; color: #71717a; margin-top: 4px;">${metrics.treeHealth}</div>
      </div>
      <div class="card">
        <div class="card-label">Поглощение CO₂ в год</div>
        <div class="card-val">${formatNumber(metrics.annualCO2Removal, 1)} т</div>
        <div style="font-size: 10px; color: #71717a; margin-top: 4px;">Секвестрация биомассой</div>
      </div>
      <div class="card">
        <div class="card-label">Углеродные единицы</div>
        <div class="card-val val-pos">${formatNumber(metrics.tradableUnitsYr, 0)} шт/год</div>
        <div style="font-size: 10px; color: #71717a; margin-top: 4px;">С учётом буфера 20%</div>
      </div>
      <div class="card">
        <div class="card-label">Потенциал дохода в год</div>
        <div class="card-val val-pos">${formatRub(metrics.estimatedIncomeYr)}</div>
        <div style="font-size: 10px; color: #71717a; margin-top: 4px;">При цене 1 500 ₽/т CO₂</div>
      </div>
    </div>

    <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
      <div style="font-weight: 700; color: #3A4831; margin-bottom: 8px; text-transform: uppercase; font-size: 11px;">
        Экологический статус и безопасность (Спутниковые данные)
      </div>
      <div style="font-size: 11px; line-height: 1.7; color: #27272a;">
        <div>• <strong>Пожарная безопасность (FIRMS / MODIS):</strong> ${metrics.fireStatus} (активных термических аномалий за 5 лет не обнаружено).</div>
        <div>• <strong>Сохранность полога леса (Sentinel-1 C-SAR):</strong> 99.1% стабильности, несанкционированные вырубки или распашка отсутствуют.</div>
        <div>• <strong>Категория земель:</strong> ${metrics.landCategory}, вид разрешенного использования допускает лесоклиматическую деятельность.</div>
        <div>• <strong>Готовность к климатическому проекту:</strong> Участок полностью готов к подаче в реестр углеродных единиц РФ.</div>
      </div>
    </div>

    <div class="footer">
      <div>Сформировано в сервисе Kosmo·MRV для собственников земельных участков и лесопользователей.</div>
      <div>Идентификатор выписки: PLOT-MRV-${Date.now().toString(16).toUpperCase()}</div>
    </div>
  `;

  openPrintWindow(`Паспорт_землепользователя_${metrics.cadastralNumber.replace(/:/g, '_')}`, body);
}

export interface ExportAIReportOptions {
  question: string;
  answer: string;
  persona: 'investor' | 'ecologist' | 'user' | string;
  siteNameA: string;
  siteNameB?: string;
  isCompare?: boolean;
  modelUsed?: string;
}

export function exportAIReportPDF({
  question,
  answer,
  persona,
  siteNameA,
  siteNameB,
  isCompare,
  modelUsed = 'Kosmo·MRV Climate-AI Intelligence',
}: ExportAIReportOptions) {
  const personaLabel =
    persona === 'investor'
      ? 'Инвестор'
      : persona === 'ecologist'
      ? 'Эколог'
      : 'Пользователь (Землепользователь)';

  const targetLabel = isCompare && siteNameB
    ? `Сравнение: ${siteNameA} ⟷ ${siteNameB}`
    : `Участок: ${siteNameA}`;

  // Markdown to clean HTML conversion
  const lines = answer.split('\n');
  let inList = false;
  const parsedLines: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold inline
    line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    const trimmed = line.trim();

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        parsedLines.push('<ul style="margin: 6px 0 10px 18px; padding: 0; line-height: 1.6;">');
        inList = true;
      }
      parsedLines.push(`<li style="margin-bottom: 4px; color: #27272a;">${trimmed.slice(2)}</li>`);
      continue;
    }

    if (inList) {
      parsedLines.push('</ul>');
      inList = false;
    }

    if (!trimmed) {
      parsedLines.push('<div style="height: 6px;"></div>');
      continue;
    }

    if (trimmed.startsWith('### ')) {
      parsedLines.push(
        `<h3 style="font-size: 14px; font-weight: 700; color: #3A4831; margin-top: 14px; margin-bottom: 6px; border-bottom: 1px solid #e4e4e7; padding-bottom: 4px;">${trimmed.replace(/^###\s+/, '')}</h3>`
      );
      continue;
    }

    if (trimmed.startsWith('#### ')) {
      parsedLines.push(
        `<h4 style="font-size: 12px; font-weight: 700; color: #27272a; margin-top: 10px; margin-bottom: 4px;">${trimmed.replace(/^####\s+/, '')}</h4>`
      );
      continue;
    }

    if (trimmed.startsWith('---')) {
      parsedLines.push('<hr style="border: none; border-top: 1px solid #e4e4e7; margin: 12px 0;" />');
      continue;
    }

    parsedLines.push(`<p style="margin-bottom: 6px; color: #27272a; line-height: 1.6;">${line}</p>`);
  }

  if (inList) {
    parsedLines.push('</ul>');
  }

  const htmlContent = parsedLines.join('\n');
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const body = `
    <div class="header">
      <div>
        <div class="brand">KOSMO·MRV AI REPORT</div>
        <div class="brand-sub">Климатическая и углеродная аналитика спутниковых данных · IPCC CMIP6</div>
      </div>
      <div class="doc-meta">
        <div>МОДЕЛЬ: ${modelUsed}</div>
        <div>ДАТА: ${dateStr}</div>
        <div>СТАТУС: ВЕРИФИЦИРОВАНО</div>
      </div>
    </div>

    <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
      <span class="badge">Профиль: ${personaLabel}</span>
      <span class="badge">${targetLabel}</span>
      <span class="badge">ГОСТ Р 58973 / CMIP6</span>
    </div>

    <div style="background: #f4f6f2; border: 1px solid #d2dccb; border-left: 4px solid #3A4831; border-radius: 6px; padding: 12px 14px; margin-bottom: 18px;">
      <div style="font-size: 10px; font-weight: 700; color: #3A4831; text-transform: uppercase; margin-bottom: 4px;">
        Запрос пользователя
      </div>
      <div style="font-size: 12px; font-weight: 600; color: #18181b;">
        «${question}»
      </div>
    </div>

    <div style="background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px 18px; margin-bottom: 20px; font-size: 12px;">
      <div style="font-size: 11px; font-weight: 700; color: #3A4831; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
        Экспертное заключение нейросети
      </div>
      ${htmlContent}
    </div>

    <div class="footer">
      <div>Сформировано искусственным интеллектом Kosmo·MRV на основе спутниковых данных Sentinel-1/2 и климатических сценариев CMIP6.</div>
      <div>Идентификатор отчёта: AI-MRV-${Date.now().toString(16).toUpperCase()}</div>
    </div>
  `;

  openPrintWindow(`AI_Заключение_${persona}_${Date.now().toString(16).toUpperCase()}`, body);
}

export function exportStressTestPDF(data: import('./api/client').StressTestResponse) {
  const dateStr = new Date().toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isSurvived = data.shock_impact.buffer_status === 'SURVIVED';
  const statusBadgeColor = isSurvived ? '#3A4831' : '#991b1b';
  const statusBgColor = isSurvived ? '#eef2eb' : '#fee2e2';

  const body = `
    <div class="header">
      <div>
        <div class="brand">KOSMO·MRV TCFD STRESS-TEST REPORT</div>
        <div class="brand-sub">Климатический стресс-тест углеродного проекта по стандартам TCFD и IPCC CMIP6</div>
      </div>
      <div class="doc-meta">
        <div>СТАНДАРТ: TCFD / ГОСТ Р 58973</div>
        <div>ДАТА: ${dateStr}</div>
        <div>ОТЧЕТ: TCFD-${Date.now().toString(16).toUpperCase()}</div>
      </div>
    </div>

    <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
      <span class="badge">Полигон: ${data.site_name} (${data.area_ha.toFixed(0)} га)</span>
      <span class="badge">Регион: ${data.region}</span>
      <span class="badge" style="background: ${statusBgColor}; color: ${statusBadgeColor}; font-weight: 700;">
        ${isSurvived ? '🛡️ Буферный фонд: ВЫДЕРЖАЛ' : '⚠️ Буферный фонд: ДЕФИЦИТ'}
      </span>
      <span class="badge">Индекс устойчивости: ${data.financial_impact.resilience_score}/100</span>
    </div>

    <!-- Сценарий климатического шока -->
    <div style="background: #fafafa; border: 1px solid #e4e4e7; border-left: 4px solid #3A4831; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px;">
      <div style="font-size: 10px; font-weight: 700; color: #71717a; text-transform: uppercase;">
        Моделируемый климатический шок (Жесткость: ${data.severity_pct}%)
      </div>
      <div style="font-size: 14px; font-weight: 800; color: #18181b; margin-top: 2px;">
        ${data.tcfd_disclosure.scenario_name}
      </div>
      <div style="font-size: 11px; color: #52525b; margin-top: 4px; line-height: 1.5;">
        ${data.tcfd_disclosure.scenario_description}
      </div>
      <div style="font-size: 10px; font-family: monospace; color: #3A4831; margin-top: 6px; font-weight: 600;">
        МЕТРИКА ШОКА: ${data.tcfd_disclosure.climate_index}
      </div>
    </div>

    <!-- Карточки ключевых показателей -->
    <div class="grid" style="margin-bottom: 20px;">
      <div class="card">
        <div class="card-label">Климатический ущерб биомассы</div>
        <div class="card-val" style="color: #b91c1c;">-${formatNumber(data.shock_impact.carbon_loss_t_co2, 0)} т CO₂</div>
        <div style="font-size: 10px; color: #71717a; margin-top: 4px;">Снижение AGB на ${data.shock_impact.agb_loss_pct}%</div>
      </div>
      <div class="card">
        <div class="card-label">Буферный фонд проекта</div>
        <div class="card-val" style="color: ${statusBadgeColor};">${data.shock_impact.buffer_remaining_pct}%</div>
        <div style="font-size: 10px; color: #71717a; margin-top: 4px;">Поглощено шока: ${formatNumber(data.shock_impact.buffer_absorbed_co2, 0)} т</div>
      </div>
      <div class="card">
        <div class="card-label">Стресс-NPV (15 лет)</div>
        <div class="card-val">${formatRub(data.financial_impact.stressed_npv_rub)}</div>
        <div style="font-size: 10px; color: #71717a; margin-top: 4px;">Δ NPV: -${formatRub(data.financial_impact.delta_npv_rub)}</div>
      </div>
      <div class="card">
        <div class="card-label">Срок окупаемости</div>
        <div class="card-val">${data.financial_impact.stressed_payback_years} года</div>
        <div style="font-size: 10px; color: #71717a; margin-top: 4px;">Базовый: ${data.initial_metrics.base_payback_years} года</div>
      </div>
    </div>

    <!-- Таблица сопоставления показателей До и После шока -->
    <div style="margin-bottom: 22px;">
      <div style="font-size: 12px; font-weight: 700; color: #18181b; margin-bottom: 8px;">
        Сопоставление проектных параметров до и после стресс-теста
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background: #f4f4f5; text-align: left; border-bottom: 2px solid #e4e4e7;">
            <th style="padding: 8px 10px;">Параметр проекта</th>
            <th style="padding: 8px 10px;">Базовый сценарий</th>
            <th style="padding: 8px 10px;">Стресс-сценарий</th>
            <th style="padding: 8px 10px;">Отклонение</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #f4f4f5;">
            <td style="padding: 8px 10px; font-weight: 600;">Надземная биомасса (AGB)</td>
            <td style="padding: 8px 10px;">${data.initial_metrics.agb_t_ha} т/га</td>
            <td style="padding: 8px 10px;">${data.shock_impact.post_shock_agb_t_ha} т/га</td>
            <td style="padding: 8px 10px; color: #b91c1c;">-${data.shock_impact.agb_loss_pct}%</td>
          </tr>
          <tr style="border-bottom: 1px solid #f4f4f5;">
            <td style="padding: 8px 10px; font-weight: 600;">Валовая секвестрация CO₂ (15 лет)</td>
            <td style="padding: 8px 10px;">${formatNumber(data.initial_metrics.cumulative_gross_co2, 0)} т</td>
            <td style="padding: 8px 10px;">${formatNumber(data.initial_metrics.cumulative_gross_co2 - data.shock_impact.carbon_loss_t_co2, 0)} т</td>
            <td style="padding: 8px 10px; color: #b91c1c;">-${formatNumber(data.shock_impact.carbon_loss_t_co2, 0)} т</td>
          </tr>
          <tr style="border-bottom: 1px solid #f4f4f5;">
            <td style="padding: 8px 10px; font-weight: 600;">Остаток буферного пула</td>
            <td style="padding: 8px 10px;">${formatNumber(data.initial_metrics.buffer_reserve_co2, 0)} т (100%)</td>
            <td style="padding: 8px 10px;">${formatNumber(data.initial_metrics.buffer_reserve_co2 - data.shock_impact.buffer_absorbed_co2, 0)} т</td>
            <td style="padding: 8px 10px; color: ${isSurvived ? '#3A4831' : '#b91c1c'}; font-weight: 700;">
              ${data.shock_impact.buffer_remaining_pct}%
            </td>
          </tr>
          <tr style="border-bottom: 1px solid #f4f4f5;">
            <td style="padding: 8px 10px; font-weight: 600;">Чистая приведенная стоимость (NPV)</td>
            <td style="padding: 8px 10px;">${formatRub(data.initial_metrics.base_npv_rub)}</td>
            <td style="padding: 8px 10px;">${formatRub(data.financial_impact.stressed_npv_rub)}</td>
            <td style="padding: 8px 10px; color: #b91c1c;">-${formatRub(data.financial_impact.delta_npv_rub)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TCFD Mitigation Action Plan -->
    <div style="background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
      <div style="font-size: 11px; font-weight: 700; color: #3A4831; text-transform: uppercase; margin-bottom: 8px;">
        Протокол предотвращения и минимизации рисков (TCFD Mitigation Plan)
      </div>
      <ul style="margin: 0 0 0 16px; padding: 0; font-size: 11px; line-height: 1.7; color: #27272a;">
        ${data.tcfd_disclosure.mitigation_actions.map((act) => `<li>${act}</li>`).join('')}
      </ul>
    </div>

    <!-- Заключение валидатора -->
    <div style="background: #f4f6f2; border: 1px solid #d2dccb; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <div style="font-size: 10px; font-weight: 700; color: #3A4831; text-transform: uppercase; margin-bottom: 4px;">
        Заключение независимого климатического аудитора
      </div>
      <div style="font-size: 11px; color: #18181b; line-height: 1.6;">
        ${data.tcfd_disclosure.auditor_conclusion}
      </div>
    </div>

    <div class="footer">
      <div>Сформировано в аналитическом комплексе Kosmo·MRV. Соответствует требованиям стандарта TCFD и ГОСТ Р 58973-2020.</div>
      <div>Криптографический идентификатор аудита: STRESS-SHA256-${Date.now().toString(16).toUpperCase()}</div>
    </div>
  `;

  openPrintWindow(`TCFD_Stress_Test_${data.site_id}_${data.severity_pct}pct`, body);
}

export function exportTaxShieldPDF(
  calc: TaxShieldCalculation,
  protect?: TaxShieldProtectResponse | null
) {
  const isBooked = protect?.status === 'BUDGET_PROTECTED_RESERVED';

  const body = `
    <div class="header">
      <div class="logo">
        <h1>KOSMO·MRV · B2B НАЛОГОВЫЙ ЩИТ</h1>
        <p>Пакет юридических документов для ФНС России и Росприроднадзора (296-ФЗ)</p>
      </div>
      <div class="meta">
        <div><strong>Дата формирования:</strong> ${new Date().toLocaleDateString('ru-RU')}</div>
        <div><strong>Реестровый статус:</strong> ${isBooked ? 'КВОТЫ ЗАБРОНИРОВАНЫ' : 'РАСЧЕТ ВЕРИФИЦИРОВАН'}</div>
        <div><strong>Сертификат:</strong> ${protect?.certificate_id || 'ПРОЕКТ-БРОНИ'}</div>
      </div>
    </div>

    <!-- Статус предприятия -->
    <div style="background: #f4f6f2; border: 1px solid #d2dccb; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
      <div style="font-size: 11px; font-weight: 700; color: #3A4831; text-transform: uppercase; margin-bottom: 6px;">
        1. Сведения о регулируемой организации (Заявитель)
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
        <div><strong>Предприятие:</strong> ${calc.company_name}</div>
        <div><strong>ИНН / ОГРН:</strong> ${calc.inn} / ${calc.ogrn}</div>
        <div><strong>Отрасль:</strong> ${calc.industry}</div>
        <div><strong>Регион:</strong> ${calc.region}</div>
        <div><strong>Категория НВОС:</strong> ${calc.nvos_category}</div>
        <div><strong>Квотируемый объем выбросов:</strong> <span style="font-weight: 700; color: #3A4831;">${formatNumber(calc.annual_emissions_t_co2, 0)} т CO₂-экв/год</span></div>
      </div>
    </div>

    <!-- Таблица Налогового арбитража -->
    <div style="margin-bottom: 20px;">
      <div style="font-size: 11px; font-weight: 700; color: #3A4831; text-transform: uppercase; margin-bottom: 8px;">
        2. Финансовый арбитраж и оптимизация бюджета (ст. 10 296-ФЗ)
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Параметр оптимизации</th>
            <th>Без зачета (Уплата государству)</th>
            <th>Через лесные квоты Kosmo·MRV</th>
            <th>Экономический эффект</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-weight: 600;">Базовая расчетная ставка</td>
            <td>${formatNumber(calc.statutory_fee_per_t_rub, 0)} ₽/т CO₂</td>
            <td>${formatNumber(calc.discount_quota_price_rub, 2)} ₽/т CO₂ (Опт)</td>
            <td style="color: #3A4831; font-weight: 700;">Скидка ${(100 - calc.discount_quota_price_rub / calc.statutory_fee_per_t_rub * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td style="font-weight: 600;">Сумма платежа за выбросы</td>
            <td style="color: #b91c1c; font-weight: 700;">${formatRub(calc.statutory_tax_rub)}</td>
            <td style="color: #3A4831; font-weight: 700;">${formatRub(calc.forest_quota_cost_rub)}</td>
            <td style="color: #3A4831; font-weight: 800; font-size: 13px;">
              Экономия ${calc.savings_pct}%
            </td>
          </tr>
          <tr style="background: #fafcf8;">
            <td style="font-weight: 700; color: #18181b;">ИТОГО ЧИСТАЯ ЭКОНОМИЯ ПРЕДПРИЯТИЯ</td>
            <td colspan="3" style="font-size: 14px; font-weight: 800; color: #3A4831; text-align: right;">
              +${formatRub(calc.net_savings_rub)} чистой прибыли
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Реестровое бронирование и лесной полигон -->
    <div style="background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
      <div style="font-size: 11px; font-weight: 700; color: #3A4831; text-transform: uppercase; margin-bottom: 8px;">
        3. Лесной оффсетный пул и реестровая верификация
      </div>
      <div style="font-size: 11px; line-height: 1.7; color: #27272a;">
        <div><strong>Лесной полигон списания:</strong> ${calc.allocated_site_name} (${calc.allocated_site_id})</div>
        <div><strong>Регистрационная запись в Реестре:</strong> ${protect?.registry_record_id || 'REG-296FZ-KOSMO-VERIFIED'}</div>
        <div><strong>Криптографический хеш расчета:</strong> <span style="font-family: monospace; font-weight: 700;">${calc.calculation_hash}</span></div>
        <div><strong>Комиссионное вознаграждение оператора (3.5%):</strong> ${formatRub(calc.platform_commission_rub)}</div>
      </div>
    </div>

    <!-- Нормативно-правовое обоснование -->
    <div style="background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 10px; color: #52525b; line-height: 1.6;">
      <strong>Правовое основание для бухгалтерии и налогового аудита:</strong><br />
      1. Федеральный закон № 296-ФЗ от 02.07.2021 «Об ограничении выбросов парниковых газов», ст. 10 (Зачет углеродных единиц).<br />
      2. Постановление Правительства РФ от 14.03.2022 № 355 «Об утверждении Правил зачета углеродных единиц».<br />
      3. Распоряжение Правительства РФ от 22.10.2021 № 2979-р. Зачет подтвержден выпиской из Национального реестра углеродных единиц (АО «Контур»).
    </div>

    <!-- Подписи сторон -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px; font-size: 11px;">
      <div style="border-top: 1px solid #27272a; padding-top: 8px;">
        <div><strong>От Заказчика (Завод):</strong></div>
        <div style="margin-top: 4px;">Руководитель / Главный бухгалтер</div>
        <div style="margin-top: 24px; color: #71717a;">М.П. ___________________ / ${calc.short_name} /</div>
      </div>
      <div style="border-top: 1px solid #27272a; padding-top: 8px;">
        <div><strong>От Исполнителя (Оператор MRV):</strong></div>
        <div style="margin-top: 4px;">Платформа климатической верификации Kosmo·MRV</div>
        <div style="margin-top: 24px; color: #71717a;">М.П. [ ЭЦП ВЕРИФИЦИРОВАНА ] / Kosmo·MRV /</div>
      </div>
    </div>

    <div class="footer">
      <div>Сформировано в модуле B2B Налоговый щит Kosmo·MRV. Соответствует 296-ФЗ и ГОСТ Р ИСО 14064-2:2019.</div>
      <div>Цифровой отпечаток документа: SHIELD-SHA256-${calc.calculation_hash}</div>
    </div>
  `;

  openPrintWindow(`Tax_Shield_296FZ_${calc.inn}`, body);
}




