import React, { useState } from 'react';
import {
  X,
  UploadCloud,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { validatePolygon, PolygonValidationResponse } from '../api/client';
import { formatNumber } from '../utils';

interface CustomPolygonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPolygon: (geojson: any, areaHa: number) => void;
}

const SAMPLE_GEOJSON = {
  type: 'Polygon',
  coordinates: [
    [
      [32.92, 56.60],
      [32.96, 56.60],
      [32.96, 56.62],
      [32.92, 56.62],
      [32.92, 56.60],
    ],
  ],
};

const SAMPLE_LARGE_GEOJSON = {
  type: 'Polygon',
  coordinates: [
    [
      [32.5, 56.2],
      [33.5, 56.2],
      [33.5, 56.9],
      [32.5, 56.9],
      [32.5, 56.2],
    ],
  ],
};

export const CustomPolygonModal: React.FC<CustomPolygonModalProps> = ({
  isOpen,
  onClose,
  onApplyPolygon,
}) => {
  const [jsonText, setJsonText] = useState<string>(
    JSON.stringify(SAMPLE_GEOJSON, null, 2)
  );
  const [validating, setValidating] = useState<boolean>(false);
  const [valResult, setValResult] = useState<PolygonValidationResponse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleValidate = async () => {
    setParseError(null);
    setValResult(null);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e: any) {
      setParseError(`Синтаксическая ошибка JSON: ${e.message}`);
      return;
    }

    setValidating(true);
    try {
      const res = await validatePolygon(parsed);
      setValResult(res);
    } catch (err: any) {
      setParseError(err.message || 'Ошибка валидации полигона');
    } finally {
      setValidating(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonText(content);
      setValResult(null);
      setParseError(null);
    };
    reader.readAsText(file);
  };

  const handleApply = () => {
    if (!valResult || !valResult.is_valid) return;
    try {
      const parsed = JSON.parse(jsonText);
      onApplyPolygon(parsed, valResult.area_ha);
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                Загрузка пользовательского GeoJSON полигона
              </h3>
              <p className="text-xs text-zinc-400">
                Лимит площади: до 20 км² (2 000 га) согласно регламенту MRV
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* File dropzone / selector */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/60 px-4 py-2 text-xs font-medium text-zinc-300 hover:border-emerald-500 hover:bg-zinc-900 hover:text-white transition cursor-pointer">
              <UploadCloud className="h-4 w-4 text-emerald-400" />
              <span>Выбрать файл (.geojson, .json)</span>
              <input
                type="file"
                accept=".geojson,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <button
              onClick={() => {
                setJsonText(JSON.stringify(SAMPLE_GEOJSON, null, 2));
                setValResult(null);
              }}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 hover:text-white transition"
            >
              Пример (540 га)
            </button>

            <button
              onClick={() => {
                setJsonText(JSON.stringify(SAMPLE_LARGE_GEOJSON, null, 2));
                setValResult(null);
              }}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 hover:text-white transition"
              title="Тест превышения лимита площади (> 2 000 га)"
            >
              Пример &gt; 2 000 га
            </button>
          </div>

          {/* Textarea for raw JSON */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1">
              GeoJSON Polygon Geometry / Feature:
            </label>
            <textarea
              rows={8}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setValResult(null);
                setParseError(null);
              }}
              className="w-full font-mono text-xs rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 text-zinc-200 focus:border-emerald-500 focus:outline-none"
              placeholder='{"type": "Polygon", "coordinates": [[[lon, lat], ...]]}'
            />
          </div>

          {/* Syntax Error Alert */}
          {parseError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Validation Result Box */}
          {valResult && (
            <div
              className={`rounded-xl border p-4 text-xs ${
                valResult.is_valid
                  ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                  : 'border-rose-500/40 bg-rose-950/20 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {valResult.is_valid ? (
                  <>
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                    <span>Полигон успешно прошёл валидацию!</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-5 w-5 text-rose-400" />
                    <span>Ошибка валидации полигона</span>
                  </>
                )}
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Площадь на эллипсоиде WGS 84:</span>
                  <span className="font-mono font-bold">
                    {formatNumber(valResult.area_ha, 2)} га ({(valResult.area_ha / 100).toFixed(2)} км²)
                  </span>
                </div>
                {valResult.blocking_reason && (
                  <div className="mt-1 text-rose-400 font-semibold">
                    Причина: {valResult.blocking_reason}
                  </div>
                )}
                {valResult.message && (
                  <div className="mt-1 text-zinc-400">{valResult.message}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950 px-6 py-3">
          <button
            onClick={handleValidate}
            disabled={validating || !jsonText.trim()}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-emerald-500 hover:text-white transition disabled:opacity-50"
          >
            {validating ? 'Проверка...' : '1. Проверить геометрию (WGS84)'}
          </button>

          <button
            onClick={handleApply}
            disabled={!valResult || !valResult.is_valid}
            className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-500/20"
          >
            2. Применить полигон к расчёту
          </button>
        </div>
      </div>
    </div>
  );
};
