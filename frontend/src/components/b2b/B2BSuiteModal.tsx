import React, { useState } from 'react';
import {
  X,
  Calculator,
  Scale,
  Target,
  Briefcase,
  Microscope,
  Trees,
} from 'lucide-react';
import { CalculationResponse, SiteInfo } from '../../api/client';
import { ROICalculator } from './ROICalculator';
import { SpeciesPanel } from './SpeciesPanel';
import { RadarPanel } from './RadarPanel';
import { SuperAccuracyPanel } from './SuperAccuracyPanel';
import { InvestorCompare } from './InvestorCompare';
import { EcologistCompare } from './EcologistCompare';
import { UserPlotPanel } from './UserPlotPanel';

export type PersonaMode = 'investor' | 'ecologist' | 'user';

interface B2BSuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  selectedSite: SiteInfo | null;
  calculation: CalculationResponse | null;
  sites?: SiteInfo[];
  initialPersona?: PersonaMode;
}

export const B2BSuiteModal: React.FC<B2BSuiteModalProps> = ({
  isOpen,
  onClose,
  siteId,
  selectedSite,
  calculation,
  sites = [],
  initialPersona = 'investor',
}) => {
  const persona = initialPersona;
  const [activeSiteId, setActiveSiteId] = useState<string>(siteId);
  const [investorView, setInvestorView] = useState<'site' | 'compare'>('site');
  const [ecologistView, setEcologistView] = useState<'site' | 'compare'>('site');

  React.useEffect(() => {
    if (siteId) {
      setActiveSiteId(siteId);
    }
  }, [siteId]);

  if (!isOpen) return null;

  const activeSite = sites.find((s) => s.id === activeSiteId) || selectedSite;
  const currentAreaHa = activeSite?.area_ha ?? calculation?.area_ha ?? 100.0;
  const siteDisplayName = activeSite?.name || activeSiteId.replace(/^RU_/, '').replace(/_/g, ' ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-950/85 backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] liquid-glass rounded-2xl shadow-2xl flex flex-col overflow-hidden bg-zinc-950/95">
        {/* Шапка модального окна */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80 bg-zinc-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3A4831]/50 text-[#a5b997] shadow-sm">
              {persona === 'investor' && <Briefcase className="h-5 w-5" />}
              {persona === 'ecologist' && <Microscope className="h-5 w-5" />}
              {persona === 'user' && <Trees className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {persona === 'investor'
                    ? 'Инвестиционный анализ проекта'
                    : persona === 'ecologist'
                    ? 'Биофизический аудит и ГОСТ'
                    : 'Мои участки и мониторинг угодий'}
                </h2>
                <span className="rounded-full bg-[#3A4831] px-2.5 py-0.5 text-[10px] font-medium text-[#c8d4be]">
                  {persona === 'investor'
                    ? 'Профиль: Инвестор'
                    : persona === 'ecologist'
                    ? 'Профиль: Эколог'
                    : 'Профиль: Землепользователь'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {persona === 'investor'
                  ? 'Калькулятор окупаемости (ROI), дисконтированные потоки (DCF) и сравнение участков'
                  : persona === 'ecologist'
                  ? '5 пулов биомассы по ГОСТ Р 58973 / IPCC, породный состав и радарный анализ'
                  : 'Кадастровый контур, динамика полога и расчет выпуска углеродных квот'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900/90 text-zinc-400 hover:text-white transition"
            title="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* УНИВЕРСАЛЬНАЯ ПАНЕЛЬ ВЫБОРА: АКТИВНЫЙ УЧАСТОК + КНОПКИ (УЧАСТОК / СРАВНИТЬ) */}
        {persona !== 'user' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80 text-xs shrink-0 gap-3">
            {/* Выбор текущего рабочего участка */}
            <div className="flex items-center gap-2.5">
              <span className="text-zinc-400 font-medium whitespace-nowrap">Участок в работе:</span>
              <select
                value={activeSiteId}
                onChange={(e) => setActiveSiteId(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 text-xs text-[#c8d4be] font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#7f9870] cursor-pointer shadow-sm"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id} className="bg-zinc-950 text-zinc-200">
                    {s.name} ({s.area_ha.toFixed(0)} га)
                  </option>
                ))}
              </select>
            </div>

            {/* Кнопки: «Участок» и «Сравнить участки» */}
            {persona === 'investor' ? (
              <div className="flex items-center gap-1.5 bg-zinc-950/70 p-1 rounded-xl border border-zinc-800">
                <button
                  onClick={() => setInvestorView('site')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    investorView === 'site'
                      ? 'bg-[#3A4831] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Calculator className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Участок</span>
                </button>
                <button
                  onClick={() => setInvestorView('compare')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    investorView === 'compare'
                      ? 'bg-[#3A4831] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Scale className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Сравнить участки</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-zinc-950/70 p-1 rounded-xl border border-zinc-800">
                <button
                  onClick={() => setEcologistView('site')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    ecologistView === 'site'
                      ? 'bg-[#3A4831] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Target className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Участок</span>
                </button>
                <button
                  onClick={() => setEcologistView('compare')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    ecologistView === 'compare'
                      ? 'bg-[#3A4831] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Scale className="h-3.5 w-3.5 text-[#a5b997]" />
                  <span>Сравнить участки</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* КОНТЕЙНЕР КОНТЕНТА */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
          {/* Инвестор: вся инфа в одну плашку или сравнение */}
          {persona === 'investor' && investorView === 'site' && (
            <ROICalculator siteId={activeSiteId} defaultAreaHa={currentAreaHa} />
          )}

          {persona === 'investor' && investorView === 'compare' && (
            <InvestorCompare sites={sites} currentSiteId={activeSiteId} />
          )}

          {/* Эколог: вся инфа в одну плашку или сравнение */}
          {persona === 'ecologist' && ecologistView === 'site' && (
            <div className="flex flex-col gap-4">
              {/* Блок 1: Биомасса, 5 пулов и LiDAR-калибровка ГОСТ */}
              <SuperAccuracyPanel
                siteId={activeSiteId}
                siteName={siteDisplayName}
                areaHa={currentAreaHa}
                baselineAgb={calculation?.t1_biomass_t_ha ?? 105.0}
              />

              {/* Блок 2: Породный состав и коэффициенты CF */}
              <SpeciesPanel siteId={activeSiteId} polygonGeojson={activeSite?.geojson} />

              {/* Блок 3: Радар Sentinel-1 и термоточки FIRMS */}
              <RadarPanel siteId={activeSiteId} polygonGeojson={activeSite?.geojson} />
            </div>
          )}

          {persona === 'ecologist' && ecologistView === 'compare' && (
            <EcologistCompare sites={sites} currentSiteId={activeSiteId} />
          )}

          {/* Пользователь: добавление поля из госреестра, понятная сводка и графики */}
          {persona === 'user' && (
            <UserPlotPanel
              sites={sites}
              currentSiteId={activeSiteId}
              onSelectSite={(id) => setActiveSiteId(id)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
