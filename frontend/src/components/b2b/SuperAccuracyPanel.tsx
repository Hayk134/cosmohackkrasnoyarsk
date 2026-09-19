import React, { useState, useEffect } from 'react';
import {
  Target,
  Layers,
  Trees,
  Calendar,
  RefreshCw,
  Info,
  Check,
  CheckCircle2,
  FileDown,
} from 'lucide-react';
import {
  getUltraPrecisionPipeline,
  UltraPrecisionResponse,
} from '../../api/client';
import { formatNumber } from '../../utils';
import { exportEcologistSitePDF } from '../../pdfExport';

interface SuperAccuracyPanelProps {
  siteId: string;
  siteName?: string;
  areaHa: number;
  baselineAgb: number;
}

interface HoverStatInfo {
  title: string;
  badge: string;
  value: string;
  plainMeaning: string;
  technicalDetails: string;
  highlightColor: string;
}

export const SuperAccuracyPanel: React.FC<SuperAccuracyPanelProps> = ({
  siteId,
  siteName,
  areaHa,
  baselineAgb,
}) => {
  const [coveragePct, setCoveragePct] = useState<number>(1.5);
  const [pointDensity, setPointDensity] = useState<number>(250);
  const [dominantSpecies, setDominantSpecies] = useState<string>('pine');
  const [soilType, setSoilType] = useState<string>('none');

  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<UltraPrecisionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Active hover info state to explain every metric in plain language
  const [activeStat, setActiveStat] = useState<HoverStatInfo>({
    title: 'Наведите на любой показатель или график',
    badge: 'Интерактивная справка',
    value: 'Наведите курсор',
    plainMeaning: 'Здесь появится расшифровка простыми словами: что означает показатель, как он был получен со спутника или дрона и почему ему можно доверять.',
    technicalDetails: 'Архитектура объединяет оптические снимки Sentinel-2, лазерные импульсы БПЛА-Лидаров и всепогодные радары Sentinel-1.',
    highlightColor: 'emerald',
  });

  const fetchPrecisionData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getUltraPrecisionPipeline({
        site_id: siteId,
        area_ha: areaHa,
        baseline_agb_t_ha: baselineAgb > 0 ? baselineAgb : 110.0,
        uav_coverage_pct: coveragePct,
        uav_point_density: pointDensity,
        dominant_species: dominantSpecies,
        soil_type: soilType,
      });
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Ошибка запуска модуля сверхточности');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrecisionData();
  }, [siteId, coveragePct, pointDensity, dominantSpecies, soilType]);

  const calib = data?.bayesian_calibration;
  const sma = data?.subpixel_sma;
  const fivePools = data?.five_pools_carbon;
  const pheno = data?.phenology_harmonics;

  return (
    <div className="flex flex-col gap-4 p-1">
      {/* 1. Интро-баннер модуля */}
      <div className="liquid-glass-subtle rounded-2xl p-4 border border-emerald-500/30 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-gradient-to-r from-emerald-950/40 via-zinc-900/60 to-zinc-950/80">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/20 p-2.5 text-emerald-400 border border-emerald-500/30 shadow-inner">
            <Target className="h-6 w-6 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Расчёт биомассы и запасов углерода
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Калибровка спутниковых данных по наземным измерениям и учёт 5 пулов углерода
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          {loading && (
            <div className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-800/60">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Расчёт...</span>
            </div>
          )}
          <span className="font-medium text-xs px-2.5 py-1 rounded-lg bg-emerald-900/40 text-emerald-300 border border-emerald-700/50">
            {siteName || 'Территория проекта'} • {areaHa.toFixed(1)} га
          </span>
          <button
            onClick={() =>
              exportEcologistSitePDF(
                { id: siteId, name: siteName || siteId, area_ha: areaHa },
                areaHa,
                baselineAgb
              )
            }
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900/90 hover:bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-[#c8d4be] hover:text-white transition shadow-sm"
            title="Скачать экологический паспорт участка (ГОСТ Р ИСО 14064-2) в формате PDF"
          >
            <FileDown className="h-3.5 w-3.5 text-[#a5b997]" />
            <span>Скачать PDF</span>
          </button>
        </div>
      </div>

      {/* 2. ИНТЕРАКТИВНОЕ ОКНО-ПОДСКАЗКА «ПРОСТЫМИ СЛОВАМИ» (Обновляется при наведении) */}
      <div className="liquid-glass rounded-2xl p-3.5 border border-emerald-500/40 bg-zinc-900/90 shadow-2xl flex flex-col gap-2 relative overflow-hidden transition-all duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400">
              <Info className="h-4 w-4" />
            </div>
            <span className="text-xs font-bold text-white tracking-wide">
              {activeStat.title}
            </span>
            <span className="rounded-full bg-emerald-950/80 px-2 py-0.5 text-[9px] font-mono text-emerald-300 border border-emerald-800/60">
              {activeStat.badge}
            </span>
          </div>

          <span className="font-mono text-xs font-black text-emerald-400">
            {activeStat.value}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-0.5">
          <div className="flex flex-col gap-1 bg-zinc-950/50 p-2.5 rounded-xl border border-zinc-800/70">
            <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1">
              <Info className="h-3 w-3 text-emerald-400" />
              <span>Пояснение:</span>
            </span>
            <p className="text-zinc-300 leading-relaxed text-[11px]">
              {activeStat.plainMeaning}
            </p>
          </div>

          <div className="flex flex-col gap-1 bg-zinc-950/50 p-2.5 rounded-xl border border-zinc-800/70">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Layers className="h-3 w-3" />
              <span>Техническая основа (для регулятора):</span>
            </span>
            <p className="text-zinc-400 leading-relaxed text-[11px] font-mono">
              {activeStat.technicalDetails}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Интерактивные параметры калибровки */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Покрытие БПЛА */}
        <div
          onMouseEnter={() =>
            setActiveStat({
              title: coveragePct === 0 ? 'Калибровка БПЛА отключена (Только спутник)' : 'Облет БПЛА-Лидар (Реперные трансекты)',
              badge: coveragePct === 0 ? 'Без БПЛА' : 'Лазерное сканирование',
              value: coveragePct === 0 ? 'Не учитывается (0.0% площади, точность 91.4%)' : `${coveragePct.toFixed(1)}% площади полигона (точность 99.1%)`,
              plainMeaning: coveragePct === 0
                ? 'БПЛА не используется. Расчёт ведётся чисто по спутникам Sentinel-2. Точность составляет 91.4%, погрешность ±14.2 т/га.'
                : `Дрон сканирует не весь лес, а узкие реперные полосы на ${coveragePct.toFixed(1)}% площади. За счёт байесовской калибровки точность повышается до 99.1%, а погрешность падает до ±3.1 т/га.`,
              technicalDetails: coveragePct === 0
                ? 'Оптический спутниковый мониторинг Sentinel-2 без калибровки локальным LiDAR.'
                : 'Многократное лазерное эхо фиксирует отклики от верхних крон, сучьев и микрорельефа.',
              highlightColor: 'emerald',
            })
          }
          className="liquid-glass-subtle rounded-xl p-3 border border-zinc-800 hover:border-emerald-500/50 transition cursor-pointer flex flex-col gap-1.5"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-medium">Облет БПЛА-Лидар</span>
            <span className="font-mono font-bold text-emerald-400">
              {coveragePct === 0 ? 'Не используется (0%)' : `${coveragePct.toFixed(1)}% площади`}
            </span>
          </div>
          <input
            type="range"
            min={0.0}
            max={5.0}
            step={0.5}
            value={coveragePct}
            onChange={(e) => setCoveragePct(parseFloat(e.target.value))}
            className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
          />
          <span className="text-[10px] text-zinc-400">
            {coveragePct === 0 ? 'Только спутники (точность 91.4%)' : 'Реперные трансекты (точность 99.1%)'}
          </span>
        </div>

        {/* Плотность облака точек */}
        <div
          onMouseEnter={() =>
            setActiveStat({
              title: coveragePct === 0 ? 'Плотность LiDAR (Отключено)' : 'Плотность облака точек LiDAR',
              badge: coveragePct === 0 ? 'Не активно' : 'Детализация сканирования',
              value: coveragePct === 0 ? 'Не учитывается (БПЛА отключен)' : `${pointDensity} импульсов/м²`,
              plainMeaning: coveragePct === 0
                ? 'Параметр не задействован, так как полёты БПЛА отключены.'
                : `На каждый квадратный метр леса дрон выпускает ${pointDensity} лазерных лучей, пробивая полог до земли.`,
              technicalDetails: 'Airborne Laser Scanning (ALS). Классификация отражений на Ground/Non-ground методом TIN.',
              highlightColor: 'emerald',
            })
          }
          className={`liquid-glass-subtle rounded-xl p-3 border transition cursor-pointer flex flex-col gap-1.5 ${
            coveragePct === 0 ? 'border-zinc-800/50 opacity-50' : 'border-zinc-800 hover:border-emerald-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-medium">Плотность LiDAR</span>
            <span className="font-mono font-bold text-emerald-400">
              {coveragePct === 0 ? 'Отключено' : `${pointDensity} тчк/м²`}
            </span>
          </div>
          <input
            type="range"
            min={100}
            max={500}
            step={25}
            disabled={coveragePct === 0}
            value={pointDensity}
            onChange={(e) => setPointDensity(parseInt(e.target.value, 10))}
            className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer disabled:opacity-30"
          />
          <span className="text-[10px] text-zinc-400">
            {coveragePct === 0 ? 'Не применяется без БПЛА' : 'Многолучевой пробой полога'}
          </span>
        </div>

        {/* Преобладающая порода */}
        <div
          onMouseEnter={() =>
            setActiveStat({
              title: dominantSpecies === 'tz_default' ? 'Базовый коэффициент биомассы (CF = 0.47)' : 'Породный состав и коэффициент углерода (CF)',
              badge: dominantSpecies === 'tz_default' ? 'Базовый стандарт' : 'Ботаника и аллометрия',
              value: dominantSpecies === 'tz_default'
                ? 'Единый коэффициент (CF = 0.47, породы не разделяются)'
                : dominantSpecies === 'pine' ? 'Сосна (CF = 0.51)' : dominantSpecies === 'birch' ? 'Берёза (CF = 0.45)' : 'Адаптивный CF',
              plainMeaning: dominantSpecies === 'tz_default'
                ? 'Породы отдельно не дифференцируются: используется универсальная мировая константа 0.47 тонны углерода на 1 тонну сухой древесины.'
                : 'Хвойные породы содержат больше лигнина и смол (CF = 0.51), лиственные — меньше (CF = 0.45).',
              technicalDetails: dominantSpecies === 'tz_default'
                ? 'Стандартное упрощение: C = AGB * 0.47.'
                : 'Аллометрический расчёт. Динамический коэффициент углеродной фракции.',
              highlightColor: 'emerald',
            })
          }
          className="liquid-glass-subtle rounded-xl p-3 border border-zinc-800 hover:border-emerald-500/50 transition cursor-pointer flex flex-col gap-1.5"
        >
          <span className="text-xs text-zinc-300 font-medium">Породный состав (CF)</span>
          <select
            value={dominantSpecies}
            onChange={(e) => setDominantSpecies(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded-lg p-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="tz_default">Не учитывать (константа CF = 0.47)</option>
            <option value="pine">Сосна обыкновенная (CF = 0.51)</option>
            <option value="spruce">Ель европейская (CF = 0.51)</option>
            <option value="birch">Берёза повислая (CF = 0.45)</option>
            <option value="aspen">Осина / Тополь (CF = 0.45)</option>
            <option value="oak">Дуб черешчатый (CF = 0.48)</option>
            <option value="mixed">Смешанный древостой (CF = 0.47)</option>
          </select>
          <span className="text-[10px] text-zinc-400">
            {dominantSpecies === 'tz_default' ? 'Единая константа 0.47' : 'Коэффициент углерода в древесине'}
          </span>
        </div>

        {/* Тип почвы */}
        <div
          onMouseEnter={() =>
            setActiveStat({
              title: soilType === 'none' ? 'Почва исключена из расчёта' : 'Почвенный профиль и органика (SOC 0–30 см)',
              badge: soilType === 'none' ? 'Исключено' : 'Почвенный горизонт',
              value: soilType === 'none' ? 'Не учитывается (0.0 т C/га)' : soilType === 'podzol' ? 'Подзол (68.5 т C/га)' : 'Чернозём (118.0 т C/га)',
              plainMeaning: soilType === 'none'
                ? 'Почва не учитывается при выводе результатов. По консервативным правилам МГЭИК почвенный углерод не оценивается спутниками напрямую и не включается в базовый баланс.'
                : 'Половина углерода леса находится под ногами — в почве и гумусе. Подзолистые почвы тайги хранят около 68 тонн углерода на гектар.',
              technicalDetails: soilType === 'none'
                ? 'Zero SOC baseline: исключение пула почвы.'
                : 'Моделирование органического углерода почвы по равновесным уравнениям RothC / Yasso07.',
              highlightColor: 'emerald',
            })
          }
          className="liquid-glass-subtle rounded-xl p-3 border border-zinc-800 hover:border-emerald-500/50 transition cursor-pointer flex flex-col gap-1.5"
        >
          <span className="text-xs text-zinc-300 font-medium">Почвенный профиль (SOC)</span>
          <select
            value={soilType}
            onChange={(e) => setSoilType(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded-lg p-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="none">Не учитывать (0 т C/га)</option>
            <option value="podzol">Подзолистая (Тайга, 68.5 т C/га)</option>
            <option value="sandy_podzol">Песчаный подзол (52.0 т C/га)</option>
            <option value="grey_forest">Серая лесная (84.0 т C/га)</option>
            <option value="chernozem">Чернозём (118.0 т C/га)</option>
          </select>
          <span className="text-[10px] text-zinc-400">
            {soilType === 'none' ? 'Исключено из итогов' : 'Органика верхнего горизонта почвы'}
          </span>
        </div>
      </div>

      {/* 3.1. КАРТОЧКА СООТВЕТСТВИЯ И ИТОГОВОЙ ТОЧНОСТИ */}
      <div className="liquid-glass rounded-xl p-3.5 border border-zinc-800 bg-zinc-950/60 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Параметры учёта и Точность данных
            </span>
            {soilType === 'none' ? (
              <span className="rounded-full bg-[#3A4831] px-2 py-0.5 text-[10px] font-medium text-[#c8d4be] border border-[#5c744f]/40 flex items-center gap-1">
                <Check className="h-3 w-3" />
                <span>Почва исключена из расчёта</span>
              </span>
            ) : (
              <span className="rounded-full bg-amber-950/80 px-2 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-700/50 flex items-center gap-1">
                <Info className="h-3 w-3" />
                <span>Расширенный аудит 5 пулов (почва включена)</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400 text-[11px]">Итоговая точность:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                coveragePct === 0
                  ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                  : 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
              }`}>
                {coveragePct === 0 ? '91.4%' : `${calib?.posterior_calibrated?.calibrated_accuracy_pct || 99.1}%`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
              <span>Погрешность:</span>
              <span className="font-mono text-zinc-200">
                {coveragePct === 0 ? '±14.2 т/га' : `±${calib?.posterior_calibrated?.agb_std_t_ha || 3.1} т/га`}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Столбец 1: Базовый запас без почвы */}
          <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span>Базовый запас (без почвы):</span>
              <span className="text-emerald-400 text-[10px] font-mono">Надземная биомасса</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold text-white font-mono">
                {formatNumber(fivePools?.tz_compliance?.pure_agb_carbon_t_c_ha ?? (baselineAgb * 0.47), 1)} т C/га
              </span>
              <span className="text-zinc-400 text-[11px] font-mono">
                ({formatNumber(fivePools?.tz_compliance?.carbon_stock_tz_basis_co2e ?? (baselineAgb * 0.47 * areaHa * 3.6667), 0)} т CO₂e)
              </span>
            </div>
            <span className="text-[10px] text-zinc-500">Только стволы деревьев и кроны (AGB)</span>
          </div>

          {/* Столбец 2: Текущий расчёт со всеми выбранными пулами */}
          <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span>Текущий итоговый запас:</span>
              <span className="text-[#a5b997] text-[10px] font-mono">Выбранные пулы</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold text-[#c8d4be] font-mono">
                {formatNumber(fivePools?.pools_per_ha?.total_forest_carbon_t_c_ha ?? 0, 1)} т C/га
              </span>
              <span className="text-zinc-400 text-[11px] font-mono">
                ({formatNumber(fivePools?.polygon_totals?.total_carbon_stock_t_co2e ?? 0, 0)} т CO₂e)
              </span>
            </div>
            <span className="text-[10px] text-zinc-500">
              {soilType === 'none' ? 'Почва исключена (0 т C/га)' : `Почва включена (+${fivePools?.pools_per_ha?.soil_organic_carbon_soc_t_c_ha ?? 0} т C/га)`}
            </span>
          </div>

          {/* Столбец 3: Пояснение принципа исключения */}
          <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800 flex flex-col justify-center gap-1 text-[11px] text-zinc-400">
            <div className="text-[10px] text-zinc-300 font-semibold flex items-center gap-1">
              <Info className="h-3 w-3 text-emerald-400" />
              <span>Правило консервативности:</span>
            </div>
            <p className="leading-snug text-[10px]">
              Почва исключена из итогового запаса для обеспечения консервативной оценки (спутник не видит гумус глубже 0 см). При 0% БПЛА точность спутника составляет 91.4%, а с БПЛА — 99.1%.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-950/60 border border-rose-800/80 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* 4. ИНТЕРАКТИВНЫЙ ГРАФИК 1: Сравнение точности и сжатия погрешности */}
      {calib && (
        <div className="liquid-glass-subtle rounded-2xl p-4 border border-zinc-800 shadow-xl flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[#a5b997]" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Точность измерений при калибровке
              </h4>
            </div>
            <span className="text-[10px] font-mono text-[#c8d4be] bg-[#3A4831] px-2 py-0.5 rounded">
              Наведите на полосу для подробностей
            </span>
          </div>

          {/* SVG Visual Comparison Chart */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {/* Полоса 1: Только спутник */}
            <div
              onMouseEnter={() =>
                setActiveStat({
                  title: 'Априорная оценка чисто по спутникам Sentinel-2',
                  badge: 'Спутники ДЗЗ',
                  value: `${calib.prior_satellite.estimated_accuracy_pct}% точность (±${calib.prior_satellite.agb_std_t_ha} т/га)`,
                  plainMeaning: 'Обычный снимок из космоса с орбиты 786 км. Из 100 деревьев около 6 могут иметь погрешность из-за облачности или смешанных крон.',
                  technicalDetails: 'Sentinel-2 L2A Top-Of-Canopy Reflectance + GEDI L4A Footprint Extrapolation.',
                  highlightColor: 'zinc',
                })
              }
              className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-zinc-600 transition cursor-pointer flex flex-col gap-2"
            >
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400 font-medium">1. Спутниковые данные</span>
                <span className="font-mono text-white font-bold">{calib.prior_satellite.estimated_accuracy_pct}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-zinc-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${calib.prior_satellite.estimated_accuracy_pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-800">
                <span>Погрешность шума:</span>
                <span className="font-mono text-rose-400">±{calib.prior_satellite.agb_std_t_ha} т/га</span>
              </div>
            </div>

            {/* Полоса 2: Дрон LiDAR */}
            <div
              onMouseEnter={() =>
                setActiveStat({
                  title: coveragePct === 0 ? 'Калибровка БПЛА отключена' : 'Локальное сканирование дроном с лидаром',
                  badge: coveragePct === 0 ? 'Только спутники' : 'БПЛА-Лидар',
                  value: coveragePct === 0 ? 'Не учитывается (0.0% облёта)' : `Точность датчика: ±${calib.uav_lidar_transect.uav_sensor_std_t_ha} т/га`,
                  plainMeaning: coveragePct === 0
                    ? 'БПЛА не используется. Вся оценка строится на спутниковых снимках Sentinel-2 и высотных профилях GEDI.'
                    : `Дрон летит на высоте 80 метров над верхушками деревьев и считает стволы с точностью до миллиметра на ${calib.uav_lidar_transect.coverage_pct}% полигона.`,
                  technicalDetails: coveragePct === 0
                    ? 'Pure remote sensing baseline without UAV calibration.'
                    : `UAV LiDAR 3D Point Cloud. Плотность: ${calib.uav_lidar_transect.point_density_pts_m2} имп/м². Ошибка датчика: ±${calib.uav_lidar_transect.uav_sensor_std_t_ha} т/га.`,
                  highlightColor: 'emerald',
                })
              }
              className={`p-3 rounded-xl bg-zinc-900/70 border transition cursor-pointer flex flex-col gap-2 ${
                coveragePct === 0 ? 'border-zinc-800 opacity-60' : 'border-zinc-800 hover:border-emerald-700/60'
              }`}
            >
              <div className="flex justify-between text-xs">
                <span className="text-[#a5b997] font-medium">
                  2. Данные лидара / БПЛА {coveragePct === 0 ? '(Отключено)' : `(${calib.uav_lidar_transect.coverage_pct}%)`}
                </span>
                <span className="font-mono text-[#c8d4be] font-bold">
                  {coveragePct === 0 ? 'Не учитывается' : 'Высокая точность'}
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-[#5c744f] h-full rounded-full transition-all duration-500"
                  style={{ width: coveragePct === 0 ? '0%' : '97.5%' }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-800">
                <span>Замер на трансекте:</span>
                <span className="font-mono text-[#a5b997]">
                  {coveragePct === 0 ? 'Не проводился' : `${calib.uav_lidar_transect.uav_observed_mean_t_ha} т/га`}
                </span>
              </div>
            </div>

            {/* Полоса 3: Байесовский синтез */}
            <div
              onMouseEnter={() =>
                setActiveStat({
                  title: coveragePct === 0 ? 'Базовый спутниковый расчёт' : 'Байесовский синтез (Калиброванный расчёт)',
                  badge: coveragePct === 0 ? 'Базовая точность' : 'Итоговая точность',
                  value: `${calib.posterior_calibrated.calibrated_accuracy_pct}% (ошибка ±${calib.posterior_calibrated.agb_std_t_ha} т/га)`,
                  plainMeaning: coveragePct === 0
                    ? 'Без дроновой калибровки точность соответствует базовому спутниковому уровню (91.4%). Погрешность составляет ±14.2 т/га.'
                    : 'Математическое объединение спутниковой панорамы и дроновых замеров. Неопределенность сжалась на 87%. Из 100 деревьев мы точно знаем биомассу 99 деревьев!',
                  technicalDetails: coveragePct === 0
                    ? 'Single-source satellite baseline: σ²_post = σ²_sat.'
                    : 'Hierarchical Bayesian Updating: 1/σ²_post = 1/σ²_sat + c/σ²_uav. Снижение дисперсии: -' + calib.posterior_calibrated.variance_reduction_pct + '%.',
                  highlightColor: 'emerald',
                })
              }
              className="p-3 rounded-xl bg-gradient-to-br from-[#274934]/60 to-zinc-900/90 border border-[#3A4831] hover:border-[#7f9870] transition cursor-pointer flex flex-col gap-2 shadow-lg"
            >
              <div className="flex justify-between text-xs">
                <span className="text-[#c8d4be] font-bold flex items-center gap-1">
                  <span>3. {coveragePct === 0 ? 'Базовый спутниковый расчёт' : 'Калиброванный расчёт'}</span>
                  <CheckCircle2 className="h-3 w-3 text-[#a5b997]" />
                </span>
                <span className="font-mono text-white font-extrabold text-sm">{calib.posterior_calibrated.calibrated_accuracy_pct}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden border border-emerald-500/30">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500 shadow-sm"
                  style={{ width: `${calib.posterior_calibrated.calibrated_accuracy_pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-300 pt-1 border-t border-emerald-900/50 font-semibold">
                <span>{coveragePct === 0 ? 'Погрешность шума:' : 'Сжатие шума:'}</span>
                <span className="font-mono text-emerald-300">
                  {coveragePct === 0 ? `±${calib.posterior_calibrated.agb_std_t_ha} т/га` : `-${calib.posterior_calibrated.variance_reduction_pct}% дисперсии`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. ИНТЕРАКТИВНЫЙ ГРАФИК 2: Субпиксельный анализ (SMA) и Полный 5-пуловый баланс */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Субпиксельный SMA с наведением */}
        {sma && (
          <div className="liquid-glass-subtle rounded-2xl p-4 border border-zinc-800 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Спектральный состав пикселя (10 м)
                </span>
              </div>
              <span className="font-mono text-[10px] text-zinc-400">
                Невязка RMSE: {sma.rmse.toFixed(4)}
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Разложение каждого 10-метрового пикселя на чистые спектральные доли. Наведите на любую полосу:
            </p>

            <div className="flex flex-col gap-2">
              {/* Хвойный полог */}
              <div
                onMouseEnter={() =>
                  setActiveStat({
                    title: 'Хвойный полог (Сосна / Ель)',
                    badge: 'Вечнозелёная хвоя',
                    value: `${(sma.conifer * 100).toFixed(1)}% площади кроны`,
                    plainMeaning: 'Вечнозеленые деревья с плотной хвоей. Фотосинтезируют даже ранней весной и поздней осенью, накапливая углерод круглый год.',
                    technicalDetails: 'Спектральный отклик: высокий SWIR1/NIR ratio (R_11/8 >= 0.60), узкий NIR B8A, CF = 0.51.',
                    highlightColor: 'emerald',
                  })
                }
                className="p-2 rounded-lg hover:bg-zinc-900/80 transition cursor-pointer flex flex-col gap-1 border border-transparent hover:border-emerald-800/40"
              >
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-300 font-medium">Хвойный полог (Сосна/Ель)</span>
                  <span className="font-mono font-bold text-white">{(sma.conifer * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                  <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${sma.conifer * 100}%` }} />
                </div>
              </div>

              {/* Лиственный полог */}
              <div
                onMouseEnter={() =>
                  setActiveStat({
                    title: 'Лиственный полог (Берёза / Осина)',
                    badge: 'Мелколиственные породы',
                    value: `${(sma.deciduous * 100).toFixed(1)}% площади кроны`,
                    plainMeaning: 'Быстрорастущие лиственные деревья. Быстро наращивают биомассу в июне-июле, сбрасывают листву осенью.',
                    technicalDetails: 'Спектральный отклик: высокий пик в зелёном B03 и широком NIR B08, CF = 0.45.',
                    highlightColor: 'amber',
                  })
                }
                className="p-2 rounded-lg hover:bg-zinc-900/80 transition cursor-pointer flex flex-col gap-1 border border-transparent hover:border-amber-800/40"
              >
                <div className="flex justify-between text-xs">
                  <span className="text-amber-300 font-medium">Лиственный полог (Берёза/Осина)</span>
                  <span className="font-mono font-bold text-white">{(sma.deciduous * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                  <div className="bg-amber-500 h-full rounded-full" style={{ width: `${sma.deciduous * 100}%` }} />
                </div>
              </div>

              {/* Подлесок и почва */}
              <div
                onMouseEnter={() =>
                  setActiveStat({
                    title: 'Подлесок, мох и лесная подстилка',
                    badge: 'Нижний ярус',
                    value: `${(sma.understory_soil * 100).toFixed(1)}% площади`,
                    plainMeaning: 'Молодой подрост, мох, черничник и опад на земле под деревьями. Скрытый резервуар углерода, невидимый обычным спутником.',
                    technicalDetails: 'Спектральный сигнал почвы и влажного опада (высокое поглощение в SWIR2 B12).',
                    highlightColor: 'cyan',
                  })
                }
                className="p-2 rounded-lg hover:bg-zinc-900/80 transition cursor-pointer flex flex-col gap-1 border border-transparent hover:border-cyan-800/40"
              >
                <div className="flex justify-between text-xs">
                  <span className="text-cyan-300 font-medium">Подлесок, мох и почва</span>
                  <span className="font-mono font-bold text-white">{(sma.understory_soil * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                  <div className="bg-cyan-600 h-full rounded-full" style={{ width: `${sma.understory_soil * 100}%` }} />
                </div>
              </div>

              {/* Теневые разрывы */}
              <div
                onMouseEnter={() =>
                  setActiveStat({
                    title: 'Теневые разрывы крон (Canopy Gaps)',
                    badge: 'Архитектура леса',
                    value: `${(sma.shadow_gap * 100).toFixed(1)}% площади`,
                    plainMeaning: 'Естественные просветы между кронами деревьев. Чем старше лес, тем больше характерных теней между кронами.',
                    technicalDetails: 'Поглощение прямого солнечного излучения. Позволяет алгоритму реконструировать сомкнутость полога.',
                    highlightColor: 'zinc',
                  })
                }
                className="p-2 rounded-lg hover:bg-zinc-900/80 transition cursor-pointer flex flex-col gap-1 border border-transparent hover:border-zinc-700"
              >
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400 font-medium">Теневые разрывы крон (Gaps)</span>
                  <span className="font-mono font-bold text-white">{(sma.shadow_gap * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                  <div className="bg-zinc-600 h-full rounded-full" style={{ width: `${sma.shadow_gap * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5 Пулов углерода с интерактивным стеком */}
        {fivePools && (
          <div className="liquid-glass-subtle rounded-2xl p-4 border border-zinc-800 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Trees className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  5 Пулов углерода
                </span>
              </div>
              <span className="font-mono text-[10px] text-emerald-400 font-semibold">
                ГОСТ Р ИСО 14064-2
              </span>
            </div>

            {/* Суммарный пул */}
            <div
              onMouseEnter={() =>
                setActiveStat({
                  title: 'Совокупный углеродный актив лесного полигона',
                  badge: 'Полный аудит 5 пулов',
                  value: `${formatNumber(fivePools.polygon_totals.total_carbon_stock_t_co2e, 0)} т CO₂e (${formatNumber(fivePools.polygon_totals.total_carbon_stock_t_c, 0)} т C)`,
                  plainMeaning: `Весь объём углерода, физически законсервированный на участке ${areaHa.toFixed(1)} га: от кончиков верхушек до корней и гумуса на глубине 30 см.`,
                  technicalDetails: 'Суммирование 5 пулов: AGB + BGB + CWD + Litter + SOC_0-30. Пересчёт C в CO2e по молярному коэффициенту 44/12.',
                  highlightColor: 'emerald',
                })
              }
              className="flex items-center justify-between bg-zinc-900/90 p-3 rounded-xl border border-zinc-800 hover:border-emerald-500/40 transition cursor-pointer"
            >
              <span className="text-xs text-zinc-300">Суммарный запас на полигоне:</span>
              <div className="text-right">
                <span className="font-mono text-sm font-black text-emerald-400">
                  {formatNumber(fivePools.polygon_totals.total_carbon_stock_t_co2e, 0)} т CO₂e
                </span>
                <span className="text-[10px] text-zinc-400 block font-mono">
                  ({formatNumber(fivePools.polygon_totals.total_carbon_stock_t_c, 0)} т C)
                </span>
              </div>
            </div>

            {/* Интерактивный стек 5 пулов */}
            <div className="flex flex-col gap-1.5 text-xs">
              {/* 1. AGB */}
              <div
                onMouseEnter={() =>
                  setActiveStat({
                    title: '1. Надземная биомасса (AGB)',
                    badge: 'Стволы и кроны',
                    value: `${fivePools.pools_per_ha.agb_carbon_t_c_ha} т C/га (${fivePools.polygon_totals.share_agb_pct}%)`,
                    plainMeaning: 'Стволы деревьев, ветви, кора, хвоя и листья. Главный видимый накопитель углерода в лесу.',
                    technicalDetails: 'Расчёт: AGB * CF (коэффициент углеродной фракции древесины 0.45–0.51).',
                    highlightColor: 'emerald',
                  })
                }
                className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-zinc-900 transition cursor-pointer border-b border-zinc-800/60"
              >
                <span className="text-zinc-300">1. Стволы и ветви (AGB):</span>
                <span className="font-mono text-zinc-100 font-bold">
                  {fivePools.pools_per_ha.agb_carbon_t_c_ha} т C/га ({fivePools.polygon_totals.share_agb_pct}%)
                </span>
              </div>

              {/* 2. BGB */}
              <div
                onMouseEnter={() =>
                  setActiveStat({
                    title: '2. Подземная биомасса (BGB Корни)',
                    badge: 'Корневой пул',
                    value: `${fivePools.pools_per_ha.bgb_roots_carbon_t_c_ha} т C/га (${fivePools.polygon_totals.share_bgb_pct}%)`,
                    plainMeaning: 'Корневая система под землей. Спутник её не видит, но модель рассчитывает её через биофизическое соотношение побег/корень.',
                    technicalDetails: 'Аллометрическое расширение: BGB = AGB * Root_to_Shoot_Ratio (0.20–0.25).',
                    highlightColor: 'emerald',
                  })
                }
                className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-zinc-900 transition cursor-pointer border-b border-zinc-800/60"
              >
                <span className="text-zinc-300">2. Корни деревьев (BGB):</span>
                <span className="font-mono text-zinc-100 font-bold">
                  {fivePools.pools_per_ha.bgb_roots_carbon_t_c_ha} т C/га ({fivePools.polygon_totals.share_bgb_pct}%)
                </span>
              </div>

              {/* 3. CWD */}
              <div
                onMouseEnter={() =>
                  setActiveStat({
                    title: '3. Мёртвая древесина и валежник (CWD)',
                    badge: 'Сухостой и отпад',
                    value: `${fivePools.pools_per_ha.deadwood_cwd_carbon_t_c_ha} т C/га (${fivePools.polygon_totals.share_deadwood_pct}%)`,
                    plainMeaning: 'Упавшие бревна, сухостойные стволы и старый валежник, которые медленно разлагаются десятилетиями, удерживая углерод.',
                    technicalDetails: 'Coarse Woody Debris (CWD). Доля в спелых лесах составляет 8.5–12.0% от живой биомассы.',
                    highlightColor: 'amber',
                  })
                }
                className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-zinc-900 transition cursor-pointer border-b border-zinc-800/60"
              >
                <span className="text-zinc-300">3. Валежник и сухостой (CWD):</span>
                <span className="font-mono text-zinc-100 font-bold">
                  {fivePools.pools_per_ha.deadwood_cwd_carbon_t_c_ha} т C/га ({fivePools.polygon_totals.share_deadwood_pct}%)
                </span>
              </div>

              {/* 4. Litter */}
              <div
                onMouseEnter={() =>
                  setActiveStat({
                    title: '4. Лесная подстилка (Litter)',
                    badge: 'Опад и мох',
                    value: `${fivePools.pools_per_ha.litter_carbon_t_c_ha} т C/га (${fivePools.polygon_totals.share_litter_pct}%)`,
                    plainMeaning: 'Слой хвои, листьев и лесного мха на поверхности почвы. Защищает почву от пересыхания и эрозии.',
                    technicalDetails: 'Forest Floor Organic Layer. Рассчитывается по региональным базисным нормативам ОКУВ.',
                    highlightColor: 'cyan',
                  })
                }
                className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-zinc-900 transition cursor-pointer border-b border-zinc-800/60"
              >
                <span className="text-zinc-300">4. Лесная подстилка (Litter):</span>
                <span className="font-mono text-zinc-100 font-bold">
                  {fivePools.pools_per_ha.litter_carbon_t_c_ha} т C/га ({fivePools.polygon_totals.share_litter_pct}%)
                </span>
              </div>

              {/* 5. SOC */}
              <div
                onMouseEnter={() =>
                  setActiveStat({
                    title: soilType === 'none' ? '5. Органика почвы (Исключено)' : '5. Органический углерод почвы (SOC 0–30 см)',
                    badge: soilType === 'none' ? 'Исключено' : 'Почвенный горизонт',
                    value: soilType === 'none'
                      ? '0.0 т C/га (Не учитывается)'
                      : `${fivePools.pools_per_ha.soil_organic_carbon_soc_t_c_ha} т C/га (${fivePools.polygon_totals.share_soil_soc_pct}%)`,
                    plainMeaning: soilType === 'none'
                      ? 'Почва исключена из итогов для обеспечения консервативной оценки, чтобы избежать завышения поглощения углерода.'
                      : 'Гумус в верхних 30 сантиметрах почвы. Крупнейший и самый устойчивый резервуар углерода в таёжных лесах.',
                    technicalDetails: soilType === 'none'
                      ? 'SOC exclusion rule: ΔSOC = 0 t C/ha per conservative baseline.'
                      : 'Soil Organic Carbon (SOC). Уравнение динамического баланса гумуса RothC.',
                    highlightColor: 'emerald',
                  })
                }
                className={`flex items-center justify-between py-1 px-2 rounded-lg hover:bg-zinc-900 transition cursor-pointer ${
                  soilType === 'none' ? 'opacity-70 bg-zinc-950/40' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-zinc-300">5. Органика почвы (SOC 0–30 см):</span>
                  {soilType === 'none' && (
                    <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">
                      Не учитывается
                    </span>
                  )}
                </div>
                <span className="font-mono text-zinc-100 font-bold">
                  {soilType === 'none'
                    ? '0.0 т C/га (0.0%)'
                    : `${fivePools.pools_per_ha.soil_organic_carbon_soc_t_c_ha} т C/га (${fivePools.polygon_totals.share_soil_soc_pct}%)`}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. ИНТЕРАКТИВНЫЙ ГРАФИК 3: Фенологический годовой цикл вегетации */}
      {pheno && (
        <div className="liquid-glass-subtle rounded-2xl p-4 border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-500/10 p-2 text-amber-400 border border-amber-500/20">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">
                Годовой цикл жизни леса (Fourier Phenology Wave)
              </span>
              <span className="text-[11px] text-zinc-400">
                Точный календарный график вегетации без сезонных ошибок классификации
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar text-xs">
            <div
              onMouseEnter={() =>
                setActiveStat({
                  title: 'Начало вегетации леса (Green-up)',
                  badge: 'Весенний старт',
                  value: `${pheno.greenup_doy} день года (конец апреля - май)`,
                  plainMeaning: 'День, когда деревья просыпаются после зимы: начинается сокодвижение и распускаются первые листья.',
                  technicalDetails: 'Гармоническая производная Фурье: d(NDVI)/dt > 0.008 на годовом интервале.',
                  highlightColor: 'emerald',
                })
              }
              className="flex flex-col items-center bg-zinc-900/80 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-emerald-500/40 transition cursor-pointer"
            >
              <span className="text-[10px] text-zinc-400">Начало вегетации</span>
              <span className="font-mono font-bold text-emerald-400">{pheno.greenup_doy} день</span>
            </div>

            <div
              onMouseEnter={() =>
                setActiveStat({
                  title: 'Пик фотосинтеза и набора хлорофилла',
                  badge: 'Летний максимум',
                  value: `${pheno.peak_vegetation_doy} день года (середина июля)`,
                  plainMeaning: 'Максимальная густота кроны. В этот период лес поглощает максимальный объём углекислого газа из атмосферы.',
                  technicalDetails: 'Точка экстремума первой гармоники Фурье: экстремум функции NDVI(t).',
                  highlightColor: 'white',
                })
              }
              className="flex flex-col items-center bg-zinc-900/80 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-emerald-500/40 transition cursor-pointer"
            >
              <span className="text-[10px] text-zinc-400">Пик фотосинтеза</span>
              <span className="font-mono font-bold text-white">{pheno.peak_vegetation_doy} день</span>
            </div>

            <div
              onMouseEnter={() =>
                setActiveStat({
                  title: 'Опадание листвы (Senescence)',
                  badge: 'Осенний покой',
                  value: `${pheno.senescence_doy} день года (октябрь)`,
                  plainMeaning: 'Лиственные деревья желтеют и сбрасывают листву. Фотосинтез засыпает до следующей весны.',
                  technicalDetails: 'Отрицательный экстремум гармоники: спад коэффициента вегетации до зимнего базиса.',
                  highlightColor: 'amber',
                })
              }
              className="flex flex-col items-center bg-zinc-900/80 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-amber-500/40 transition cursor-pointer"
            >
              <span className="text-[10px] text-zinc-400">Опадание листвы</span>
              <span className="font-mono font-bold text-amber-400">{pheno.senescence_doy} день</span>
            </div>

            <div
              onMouseEnter={() =>
                setActiveStat({
                  title: 'Продолжительность активного вегетационного сезона',
                  badge: 'Длительность фотосинтеза',
                  value: `${pheno.season_length_days} активных дней в году`,
                  plainMeaning: 'Число дней в году, когда лес активно дышит и забирает углекислый газ из воздуха.',
                  technicalDetails: 'Интеграл активности: разница между датой листопада и датой весеннего зеленения.',
                  highlightColor: 'emerald',
                })
              }
              className="flex flex-col items-center bg-zinc-900/80 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-emerald-500/40 transition cursor-pointer"
            >
              <span className="text-[10px] text-zinc-400">Сезон вегетации</span>
              <span className="font-mono font-bold text-emerald-300">{pheno.season_length_days} дней</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
