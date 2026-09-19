import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { Maximize2, ChevronsLeftRight, X } from 'lucide-react';
import { SiteInfo, fetchRasterOverlayWithBounds } from '../api/client';

export type RasterLayerType = 'none' | 'biomass' | 'fire' | 'loss' | 'ndvi' | 'nbr' | 'change' | 'satellite';

interface MapViewerProps {
  site: SiteInfo | null;
  geojson: any;
  siteId: string;
  activeLayer?: RasterLayerType;
  activeYear?: number;
  opacity?: number;
  baseMap?: 'dark' | 'satellite';
  onLoadingChange?: (loading: boolean) => void;
  // Swipe mode props
  isSwipeActive?: boolean;
  swipePosition?: number; // 0 to 100
  onSwipePositionChange?: (pos: number) => void;
  swipeLeftLayer?: string;
  swipeRightLayer?: string;
  swipeLeftYear?: number;
  swipeRightYear?: number;
  onToggleSwipe?: () => void;
}

export const MapViewer: React.FC<MapViewerProps> = ({
  site,
  geojson,
  siteId,
  activeLayer: propActiveLayer,
  activeYear: propActiveYear,
  opacity: propOpacity,
  baseMap: propBaseMap,
  onLoadingChange,
  isSwipeActive = false,
  swipePosition = 50,
  onSwipePositionChange,
  swipeLeftLayer = 'biomass',
  swipeRightLayer = 'biomass',
  swipeLeftYear = 2019,
  swipeRightYear = 2024,
  onToggleSwipe,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null);
  const imageOverlayRef = useRef<L.ImageOverlay | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);

  // Dual overlay refs for swipe mode
  const leftOverlayRef = useRef<L.ImageOverlay | null>(null);
  const rightOverlayRef = useRef<L.ImageOverlay | null>(null);
  const leftBoundsRef = useRef<L.LatLngBounds | null>(null);
  const rightBoundsRef = useRef<L.LatLngBounds | null>(null);

  const activeLayer = propActiveLayer ?? 'biomass';
  const opacity = propOpacity ?? 0.8;
  const baseMap = propBaseMap ?? 'satellite';
  const [, setLoadingRaster] = useState<boolean>(false);
  const [, setRasterError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Initialize Leaflet map with NO attribution control
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      center: [56.6, 32.95],
      zoom: 12,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Initial base tile layer
    const tileUrl =
      baseMap === 'satellite'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    const baseLayer = L.tileLayer(tileUrl, {
      attribution:
        baseMap === 'satellite'
          ? '&copy; Esri &mdash; Source: Esri'
          : '&copy; <a href="https://carto.com/">CARTO</a> dark_all',
      maxZoom: 19,
    }).addTo(map);

    baseTileLayerRef.current = baseLayer;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update base map layer when toggled
  useEffect(() => {
    if (!mapInstanceRef.current || !baseTileLayerRef.current) return;

    mapInstanceRef.current.removeLayer(baseTileLayerRef.current);

    const tileUrl =
      baseMap === 'satellite'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    const newBase = L.tileLayer(tileUrl, {
      attribution:
        baseMap === 'satellite'
          ? '&copy; Esri World Imagery'
          : '&copy; CARTO Dark Matter',
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);

    baseTileLayerRef.current = newBase;
  }, [baseMap]);

  // Update GeoJSON polygon and fit bounds
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !geojson) return;

    // Clear previous geojson layer
    if (geojsonLayerRef.current) {
      map.removeLayer(geojsonLayerRef.current);
      geojsonLayerRef.current = null;
    }

    try {
      const gLayer = L.geoJSON(geojson, {
        style: {
          color: '#7f9870', // #3A4831 high-contrast border
          weight: 2.5,
          opacity: 0.95,
          fillColor: '#3A4831',
          fillOpacity: 0.20,
          dashArray: '4, 4',
        },
      }).addTo(map);

      geojsonLayerRef.current = gLayer;

      const bounds = gLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    } catch (e) {
      console.error('Error rendering GeoJSON boundary:', e);
    }
  }, [geojson, siteId]);

  // Swipe clipping function with robust inset clipping
  const updateSwipeClips = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !isSwipeActive) return;

    const leftEl = leftOverlayRef.current?.getElement();
    const rightEl = rightOverlayRef.current?.getElement();

    if (!leftEl && !rightEl) return;

    const size = map.getSize();
    const splitContainerX = size.x * (swipePosition / 100);
    const splitLayerPoint = map.containerPointToLayerPoint([splitContainerX, 0]);

    if (leftEl && leftBoundsRef.current) {
      const nwPoint = map.latLngToLayerPoint(leftBoundsRef.current.getNorthWest());
      const clipX = splitLayerPoint.x - nwPoint.x;
      const imgWidth = leftEl.clientWidth || leftEl.width || 500;
      const rightCut = Math.max(0, imgWidth - clipX);
      leftEl.style.clipPath = `inset(0px ${rightCut}px 0px 0px)`;
      (leftEl.style as any).webkitClipPath = `inset(0px ${rightCut}px 0px 0px)`;
    }

    if (rightEl && rightBoundsRef.current) {
      const nwPoint = map.latLngToLayerPoint(rightBoundsRef.current.getNorthWest());
      const clipX = splitLayerPoint.x - nwPoint.x;
      const leftCut = Math.max(0, clipX);
      rightEl.style.clipPath = `inset(0px 0px 0px ${leftCut}px)`;
      (rightEl.style as any).webkitClipPath = `inset(0px 0px 0px ${leftCut}px)`;
    }
  }, [isSwipeActive, swipePosition]);

  // Synchronize swipe clips with map pan, zoom, and swipePosition
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isSwipeActive) return;

    map.on('move', updateSwipeClips);
    map.on('zoom', updateSwipeClips);
    map.on('viewreset', updateSwipeClips);

    updateSwipeClips();

    return () => {
      map.off('move', updateSwipeClips);
      map.off('zoom', updateSwipeClips);
      map.off('viewreset', updateSwipeClips);
    };
  }, [isSwipeActive, updateSwipeClips]);

  useEffect(() => {
    if (isSwipeActive) {
      updateSwipeClips();
    }
  }, [swipePosition, isSwipeActive, updateSwipeClips]);

  // Manage Raster Overlays: Single mode vs Swipe dual mode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear all existing overlays
    if (imageOverlayRef.current) {
      map.removeLayer(imageOverlayRef.current);
      imageOverlayRef.current = null;
    }
    if (leftOverlayRef.current) {
      map.removeLayer(leftOverlayRef.current);
      leftOverlayRef.current = null;
    }
    if (rightOverlayRef.current) {
      map.removeLayer(rightOverlayRef.current);
      rightOverlayRef.current = null;
    }

    let isMounted = true;
    const targetSite = siteId || site?.id || 'RU_TVER_01';

    const getLeafletBounds = (bounds: { west: number; south: number; east: number; north: number }): L.LatLngBounds => {
      if (bounds.west && bounds.south && bounds.east && bounds.north) {
        return L.latLngBounds([bounds.south, bounds.west], [bounds.north, bounds.east]);
      } else if (site?.bounds) {
        return L.latLngBounds([site.bounds[1], site.bounds[0]], [site.bounds[3], site.bounds[2]]);
      } else {
        return L.latLngBounds([56.59, 32.91], [56.63, 32.974]);
      }
    };

    if (isSwipeActive) {
      // Swipe Mode: Fetch Left and Right layers with their respective selected years
      setLoadingRaster(true);
      onLoadingChange?.(true);

      const leftYr = swipeLeftYear || 2019;
      const rightYr = swipeRightYear || 2024;

      const fetchLeft =
        swipeLeftLayer !== 'none'
          ? fetchRasterOverlayWithBounds(targetSite, swipeLeftLayer, leftYr)
          : Promise.resolve(null);

      const fetchRight =
        swipeRightLayer !== 'none'
          ? fetchRasterOverlayWithBounds(
              targetSite,
              swipeRightLayer,
              rightYr,
              swipeRightLayer === 'change' ? leftYr : undefined
            )
          : Promise.resolve(null);

      Promise.all([fetchLeft, fetchRight])
        .then(([leftRes, rightRes]) => {
          if (!isMounted) return;

          if (leftRes) {
            const lBounds = getLeafletBounds(leftRes.bounds);
            leftBoundsRef.current = lBounds;
            const lOverlay = L.imageOverlay(leftRes.url, lBounds, {
              opacity,
              interactive: false,
              zIndex: 350,
            }).addTo(map);
            lOverlay.on('load', () => {
              if (isMounted) updateSwipeClips();
            });
            leftOverlayRef.current = lOverlay;
          }

          if (rightRes) {
            const rBounds = getLeafletBounds(rightRes.bounds);
            rightBoundsRef.current = rBounds;
            const rOverlay = L.imageOverlay(rightRes.url, rBounds, {
              opacity,
              interactive: false,
              zIndex: 351,
            }).addTo(map);
            rOverlay.on('load', () => {
              if (isMounted) updateSwipeClips();
            });
            rightOverlayRef.current = rOverlay;
          }

          setTimeout(() => {
            if (isMounted) updateSwipeClips();
          }, 50);

          setLoadingRaster(false);
          onLoadingChange?.(false);
        })
        .catch((err) => {
          if (!isMounted) return;
          console.warn('Swipe raster overlays failed:', err);
          setLoadingRaster(false);
          onLoadingChange?.(false);
        });
    } else {
      // Normal Single Raster Overlay Mode
      if (activeLayer === 'none') return;

      setLoadingRaster(true);
      onLoadingChange?.(true);
      setRasterError(null);

      fetchRasterOverlayWithBounds(targetSite, activeLayer, propActiveYear || 2024)
        .then(({ url, bounds }) => {
          if (!isMounted) return;

          const leafletBounds = getLeafletBounds(bounds);
          const overlay = L.imageOverlay(url, leafletBounds, {
            opacity,
            interactive: false,
          }).addTo(map);

          imageOverlayRef.current = overlay;
          setLoadingRaster(false);
          onLoadingChange?.(false);
        })
        .catch((err) => {
          if (!isMounted) return;
          console.warn('Raster overlay failed to load:', err);
          setRasterError('Слой недоступен для данного участка');
          setLoadingRaster(false);
          onLoadingChange?.(false);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [siteId, activeLayer, propActiveYear, site, isSwipeActive, swipeLeftLayer, swipeRightLayer, swipeLeftYear, swipeRightYear, onLoadingChange]);

  // Update opacity for active overlays
  useEffect(() => {
    if (imageOverlayRef.current) {
      imageOverlayRef.current.setOpacity(opacity);
    }
    if (leftOverlayRef.current) {
      leftOverlayRef.current.setOpacity(opacity);
    }
    if (rightOverlayRef.current) {
      rightOverlayRef.current.setOpacity(opacity);
    }
  }, [opacity]);

  // Mouse & Touch Drag Handlers for Swipe Divider
  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newPct = Math.round(Math.min(95, Math.max(5, (moveEvent.clientX / window.innerWidth) * 100)));
      onSwipePositionChange?.(newPct);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleDividerTouchStart = (_e: React.TouchEvent) => {
    setIsDragging(true);

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length > 0) {
        const touch = moveEvent.touches[0];
        const newPct = Math.round(Math.min(95, Math.max(5, (touch.clientX / window.innerWidth) * 100)));
        onSwipePositionChange?.(newPct);
      }
    };

    const onTouchEnd = () => {
      setIsDragging(false);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };

    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
  };

  const handleFitBounds = () => {
    if (mapInstanceRef.current && geojsonLayerRef.current) {
      const bounds = geojsonLayerRef.current.getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [80, 80] });
      }
    }
  };

  const getLayerName = (id: string, yr: number) => {
    if (id === 'biomass') {
      if (yr > 2024) return `Биомасса (Прогноз ${yr})`;
      return `Биомасса (${yr})`;
    }
    if (id === 'stress') return `⚡ Стресс-шок (${yr >= 2025 ? yr : 2027})`;
    if (id === 'fire') return 'Гари MODIS (2021)';
    if (id === 'loss') return 'Потери Hansen GFC';
    if (id === 'ndvi') return `NDVI (${yr})`;
    if (id === 'nbr') return `NBR (${yr})`;
    if (id === 'change') return `Разность (${swipeLeftYear || 2019} → ${yr})`;
    if (id === 'satellite' || id === 'rgb') return `Спутник Sentinel-2 (${yr})`;
    return `${id} (${yr})`;
  };

  return (
    <div className="fixed inset-0 w-screen h-screen z-0 overflow-hidden bg-zinc-950 pointer-events-auto">
      {/* 100% Fullscreen Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Recenter Button */}
      <div className="fixed bottom-24 right-6 z-20">
        <button
          onClick={handleFitBounds}
          className="liquid-glass rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 hover:text-white transition flex items-center gap-1.5 shadow-xl hover:border-emerald-400/50"
          title="Центрировать карту по границам полигона"
        >
          <Maximize2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="hidden sm:inline">По центру</span>
        </button>
      </div>

      {/* Swipe Mode Interactive Divider Overlay */}
      {isSwipeActive && (
        <div className="fixed inset-0 pointer-events-none z-30 select-none">
          {/* Top Status Capsule */}
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-2">
            <div className="liquid-glass rounded-full px-4 py-1.5 border border-emerald-500/50 shadow-2xl flex items-center gap-3 backdrop-blur-2xl">
              {/* Left Pill */}
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{getLayerName(swipeLeftLayer, swipeLeftYear || 2019)}</span>
              </div>

              <div className="px-2 py-0.5 rounded bg-zinc-900/90 border border-zinc-700 text-[11px] font-mono font-bold text-zinc-300">
                {Math.round(swipePosition)}%
              </div>

              {/* Right Pill */}
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-300">
                <span>{getLayerName(swipeRightLayer, swipeRightYear || 2024)}</span>
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              </div>

              {/* Exit Button */}
              {onToggleSwipe && (
                <button
                  onClick={onToggleSwipe}
                  className="ml-1 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-white p-1 border border-zinc-700 transition"
                  title="Выйти из режима шторки"
                >
                  <X className="h-3.5 w-3.5 text-rose-400" />
                </button>
              )}
            </div>
          </div>

          {/* Vertical Divider Glowing Line */}
          <div
            className="absolute top-0 bottom-0 pointer-events-auto cursor-ew-resize z-40 transition-none w-12 -ml-6 flex items-center justify-center group"
            style={{ left: `${swipePosition}%` }}
            onMouseDown={handleDividerMouseDown}
            onTouchStart={handleDividerTouchStart}
          >
            {/* The Line */}
            <div
              className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-1 bg-gradient-to-b from-[#7f9870] via-[#5c744f] to-[#3A4831] shadow-lg transition-all ${
                isDragging ? 'w-1.5 shadow-[#7f9870]/50' : 'group-hover:w-1.5'
              }`}
              style={{
                boxShadow: '0 0 10px rgba(127, 152, 112, 0.6), 0 0 20px rgba(58, 72, 49, 0.4)',
              }}
            />

            {/* Center Draggable Knob */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-11 h-11 rounded-full liquid-glass flex items-center justify-center text-zinc-100 shadow-2xl transition-transform hover:scale-110 active:scale-95 ${
                isDragging ? 'scale-115 text-white' : ''
              }`}
              style={{
                boxShadow: '0 0 16px rgba(58, 72, 49, 0.6), inset 0 0 8px rgba(255, 255, 255, 0.15)',
              }}
            >
              <ChevronsLeftRight className="h-5 w-5 animate-pulse text-[#a5b997]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

