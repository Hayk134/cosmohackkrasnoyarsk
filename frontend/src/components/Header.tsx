import React, { useState, useRef, useEffect } from 'react';
import {
  MapPin,
  Coins,
  Eye,
  EyeOff,
  FileCheck2,
  ChevronDown,
  UploadCloud,
  Briefcase,
  Microscope,
  Trees,
  Sparkles,
} from 'lucide-react';
import { SiteInfo } from '../api/client';

export type PersonaMode = 'investor' | 'ecologist' | 'user';

interface HeaderProps {
  sites: SiteInfo[];
  selectedSiteId: string;
  isCustomPolygon: boolean;
  onSelectSite: (siteId: string) => void;
  onOpenCustomPolygonModal: () => void;
  loading: boolean;
  onRefresh: () => void;
  onOpenRegistry: () => void;
  onOpenReport: () => void;
  onOpenAIModal?: () => void;
  showPanels?: boolean;
  onTogglePanels?: () => void;
  currentPersona?: PersonaMode;
  onSelectPersona?: (persona: PersonaMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  sites,
  selectedSiteId,
  isCustomPolygon,
  onSelectSite,
  onOpenCustomPolygonModal,
  loading: _loading,
  onRefresh: _onRefresh,
  onOpenRegistry,
  onOpenReport,
  onOpenAIModal,
  showPanels = true,
  onTogglePanels,
  currentPersona = 'investor',
  onSelectPersona,
}) => {
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);
  const [personaDropdownOpen, setPersonaDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const personaDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setZoneDropdownOpen(false);
      }
      if (personaDropdownRef.current && !personaDropdownRef.current.contains(event.target as Node)) {
        setPersonaDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentSiteName = isCustomPolygon
    ? 'Свой полигон'
    : sites.find((s) => s.id === selectedSiteId)?.name || selectedSiteId.replace('RU_', '');

  return (
    <>
      {/* 1. Левая верхняя плашка: адаптивная ширина на мобильных, 350px на десктопе */}
      <div className="fixed top-2.5 left-2 sm:left-3 z-30 h-11 w-[calc(100vw-170px)] sm:w-[300px] md:w-[350px] liquid-glass rounded-xl shadow-xl px-2 sm:px-2.5 flex items-center justify-between gap-1.5 sm:gap-2 pointer-events-auto transition-all">
        {/* Значок локации, открывающий название/выбор зоны */}
        <div className="relative flex-1 min-w-0" ref={dropdownRef}>
          <button
            onClick={() => setZoneDropdownOpen(!zoneDropdownOpen)}
            className="w-full flex items-center justify-between gap-1.5 sm:gap-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800/80 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition shadow-sm"
            title="Выбрать территорию проекта"
          >
            <div className="flex items-center gap-1.5 truncate">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-950/70 text-emerald-400 shrink-0">
                <MapPin className="h-3.5 w-3.5" />
              </div>
              <span className="font-semibold text-zinc-100 truncate text-[11px]">
                {currentSiteName}
              </span>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 text-zinc-400 shrink-0 transition-transform ${
                zoneDropdownOpen ? 'rotate-180 text-emerald-400' : ''
              }`}
            />
          </button>

          {/* Выпадающий список зон */}
          {zoneDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-72 rounded-xl liquid-glass p-1.5 shadow-2xl z-50 flex flex-col gap-1 backdrop-blur-2xl">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800/60 mb-0.5">
                Территория проекта
              </div>
              {sites.map((s) => {
                const isSelected = !isCustomPolygon && selectedSiteId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      onSelectSite(s.id);
                      setZoneDropdownOpen(false);
                    }}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition ${
                      isSelected
                        ? 'bg-emerald-800 text-white font-semibold shadow-sm'
                        : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="font-mono text-[10px] opacity-70 ml-2">
                      {s.area_ha.toFixed(0)} га
                    </span>
                  </button>
                );
              })}

              <div className="h-px bg-zinc-800/60 my-0.5" />

              <button
                onClick={() => {
                  onOpenCustomPolygonModal();
                  setZoneDropdownOpen(false);
                }}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                  isCustomPolygon
                    ? 'bg-emerald-800 text-white font-semibold shadow-sm'
                    : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                }`}
              >
                <UploadCloud className="h-3.5 w-3.5 text-emerald-400" />
                <span>+ Загрузить свой GeoJSON</span>
              </button>
            </div>
          )}
        </div>

        {/* Выбор профиля аналитики: Инвестор / Эколог / Пользователь */}
        <div className="relative shrink-0" ref={personaDropdownRef}>
          <button
            onClick={() => setPersonaDropdownOpen(!personaDropdownOpen)}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 px-2 py-1.5 text-xs font-semibold text-zinc-200 transition border border-zinc-700/60 shadow-sm"
            title="Выбрать профиль: Инвестор / Эколог / Пользователь"
          >
            {currentPersona === 'investor' && <Briefcase className="h-3.5 w-3.5 text-[#a5b997]" />}
            {currentPersona === 'ecologist' && <Microscope className="h-3.5 w-3.5 text-[#a5b997]" />}
            {currentPersona === 'user' && <Trees className="h-3.5 w-3.5 text-[#a5b997]" />}
            <span className="text-[11px] font-medium hidden sm:inline">
              {currentPersona === 'investor'
                ? 'Инвестор'
                : currentPersona === 'ecologist'
                ? 'Эколог'
                : 'Пользователь'}
            </span>
            <ChevronDown
              className={`h-3 w-3 text-zinc-400 transition-transform ${
                personaDropdownOpen ? 'rotate-180 text-emerald-400' : ''
              }`}
            />
          </button>

          {/* Выпадающее меню профилей */}
          {personaDropdownOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-52 rounded-xl liquid-glass p-1.5 shadow-2xl z-50 flex flex-col gap-1 backdrop-blur-2xl border border-zinc-800">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800/60 mb-0.5">
                Профиль аналитики
              </div>
              <button
                onClick={() => {
                  onSelectPersona?.('investor');
                  setPersonaDropdownOpen(false);
                }}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                  currentPersona === 'investor'
                    ? 'bg-[#3A4831] text-white font-semibold shadow-sm'
                    : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                }`}
              >
                <Briefcase className="h-3.5 w-3.5 text-[#a5b997]" />
                <div className="flex flex-col text-left">
                  <span className="font-semibold">Инвестор</span>
                  <span className="text-[10px] text-zinc-400">Доходность и окупаемость</span>
                </div>
              </button>

              <button
                onClick={() => {
                  onSelectPersona?.('ecologist');
                  setPersonaDropdownOpen(false);
                }}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                  currentPersona === 'ecologist'
                    ? 'bg-[#3A4831] text-white font-semibold shadow-sm'
                    : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                }`}
              >
                <Microscope className="h-3.5 w-3.5 text-[#a5b997]" />
                <div className="flex flex-col text-left">
                  <span className="font-semibold">Эколог</span>
                  <span className="text-[10px] text-zinc-400">Биомасса и ГОСТ аудит</span>
                </div>
              </button>

              <button
                onClick={() => {
                  onSelectPersona?.('user');
                  setPersonaDropdownOpen(false);
                }}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                  currentPersona === 'user'
                    ? 'bg-[#3A4831] text-white font-semibold shadow-sm'
                    : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                }`}
              >
                <Trees className="h-3.5 w-3.5 text-[#a5b997]" />
                <div className="flex flex-col text-left">
                  <span className="font-semibold">Пользователь</span>
                  <span className="text-[10px] text-zinc-400">Мое поле в Госреестре</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Правая верхняя плашка: адаптивные кнопки для телефонов и десктопа */}
      <div className="fixed top-2.5 right-2 sm:right-3 z-30 h-11 w-auto max-w-[160px] sm:max-w-none liquid-glass rounded-xl shadow-xl px-1.5 sm:px-2 flex items-center gap-1 sm:gap-1.5 pointer-events-auto transition-all">
        {/* Кнопка AI */}
        {onOpenAIModal && (
          <button
            onClick={onOpenAIModal}
            className="flex items-center gap-1 rounded-lg bg-[#3A4831] hover:bg-[#485c3e] px-2 sm:px-2.5 py-1.5 text-xs font-semibold text-white transition shadow-sm border border-[#5c744f]/40 shrink-0"
            title="Спросить AI о климате, засухе 2027 и рисках"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#c8d4be]" />
            <span className="text-[11px] sm:text-xs">AI</span>
          </button>
        )}

        {/* Кнопка Реестр */}
        <button
          onClick={onOpenRegistry}
          className="flex items-center gap-1 rounded-lg bg-zinc-900/80 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800/90 hover:text-white shadow-sm shrink-0"
          title="Реестр углеродных единиц проекта"
        >
          <Coins className="h-3.5 w-3.5 text-[#a5b997]" />
          <span className="hidden sm:inline text-[11px] sm:text-xs">Реестр</span>
        </button>

        {/* Кнопка Скрыть / Показать панели */}
        {onTogglePanels && (
          <button
            onClick={onTogglePanels}
            className={`flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-medium transition shadow-sm shrink-0 ${
              showPanels
                ? 'bg-[#3A4831] text-[#c8d4be]'
                : 'bg-zinc-900/80 text-zinc-400 hover:text-white'
            }`}
            title={showPanels ? 'Скрыть панели' : 'Показать панели'}
          >
            {showPanels ? (
              <EyeOff className="h-3.5 w-3.5 text-[#a5b997]" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            <span className="hidden md:inline text-[11px] sm:text-xs">{showPanels ? 'Скрыть' : 'Панели'}</span>
          </button>
        )}

        {/* Кнопка Полный отчёт */}
        <button
          onClick={onOpenReport}
          className="flex items-center gap-1 rounded-lg bg-[#3A4831] hover:bg-[#485c3e] text-white px-2 sm:px-3 py-1.5 text-xs font-semibold transition shadow-md shrink-0"
          title="Открыть отчёт верификации углеродного баланса"
        >
          <FileCheck2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-[11px] sm:text-xs">Отчёт</span>
        </button>
      </div>
    </>
  );
};
