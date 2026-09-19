"""backend/app/core/disturbances.py

Comprehensive disturbance detection engine:
1. MODIS MCD64A1 2021 fire detection & burn date mapping (Sinusoidal projection).
2. Hansen Global Forest Change (GFC) canopy cover & annual loss detection.
3. Sentinel-2 L2A radiometric offset restoration, SCL cloud masking, NDVI, NBR, and dNBR.
"""

from __future__ import annotations

import datetime
import glob
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import rasterio
from rasterio.mask import mask
from rasterio.warp import transform_geom
import shapely
from shapely.geometry import MultiPolygon, Polygon, shape

from backend.app.core.raster_loader import RasterLoader

# Project root resolution
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DEFAULT_DATA_DIR = PROJECT_ROOT / "data" if (PROJECT_ROOT / "data").exists() else Path("data")


def _resolve_data_dir(data_dir: Optional[Union[str, Path]] = None) -> Path:
    if data_dir is not None:
        p = Path(data_dir)
        if p.exists():
            return p
        candidate = PROJECT_ROOT / p
        if candidate.exists():
            return candidate
        return p
    return DEFAULT_DATA_DIR


@dataclass
class MODISFireResult:
    fire_detected: bool
    burned_area_ha: float
    burned_pixel_count: int
    burn_dates: List[str]  # Sorted ISO date strings ("YYYY-MM-DD")
    burn_day_min: Optional[int] = None
    burn_day_max: Optional[int] = None
    mean_uncertainty_days: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class HansenGFCResult:
    canopy_cover_2000_avg: float
    recent_loss_detected: bool
    recent_loss_pixels: int
    recent_loss_area_ha: float
    annual_loss_ha: Dict[int, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Sentinel2IndexResult:
    scene_id: str
    acquisition_date: str
    mean_ndvi: float
    mean_nbr: float
    cloud_filtered_fraction: float  # Fraction of AOI pixels in SCL classes 4 & 5
    processing_baseline: str
    radiometric_offset_applied: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DisturbanceResult:
    """Standardized API contract result conforming to PROJECT.md."""

    modis_fire_detected: bool
    burned_area_ha: float
    burn_dates: List[str]
    hansen_loss_detected: bool
    loss_pixels_recent: int
    canopy_cover_avg: float
    sentinel2_ndvi: float
    sentinel2_nbr: float
    cloud_filtered: bool
    burn_severity_dnbr: Optional[float] = None
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Direct Standalone Analysis Functions (Compatible with test_utils)
# ---------------------------------------------------------------------------


def detect_modis_burn_scars(
    aoi_id: str,
    year: int = 2021,
    month: int = 8,
    data_root: Optional[Union[str, Path]] = None,
) -> Dict[str, Any]:
    """Extracts MODIS MCD64A1 burned area information from data/ directory."""
    data_dir = _resolve_data_dir(data_root)
    aoi_dir = data_dir / aoi_id / "MODIS"
    if not aoi_dir.exists():
        return {
            "modis_fire_detected": False,
            "burned_pixels": 0,
            "total_pixels": 0,
            "burn_dates": [],
            "date_uncertainty_days_min": 0,
            "date_uncertainty_days_max": 0,
        }

    # Match Burn_Date GeoTIFF
    burn_date_files = list(aoi_dir.glob(f"MCD64A1.A{year}*_Burn_Date.tif"))
    if not burn_date_files:
        return {
            "modis_fire_detected": False,
            "burned_pixels": 0,
            "total_pixels": 0,
            "burn_dates": [],
        }

    burn_file = burn_date_files[0]
    qa_file = aoi_dir / burn_file.name.replace("_Burn_Date.tif", "_QA.tif")
    unc_file = aoi_dir / burn_file.name.replace("_Burn_Date.tif", "_Burn_Date_Uncertainty.tif")

    with rasterio.open(burn_file) as src:
        burn_arr = src.read(1)

    # Mask valid burns (day of year > 0)
    burned_mask = burn_arr > 0
    burned_count = int(np.sum(burned_mask))
    total_pixels = int(burn_arr.size)

    burn_doy = burn_arr[burned_mask].tolist() if burned_count > 0 else []

    unc_min, unc_max = 0, 0
    if unc_file.exists() and burned_count > 0:
        with rasterio.open(unc_file) as src_unc:
            unc_arr = src_unc.read(1)
            unc_vals = unc_arr[burned_mask]
            if len(unc_vals) > 0:
                unc_min = int(np.min(unc_vals))
                unc_max = int(np.max(unc_vals))

    return {
        "modis_fire_detected": burned_count > 0,
        "burned_pixels": burned_count,
        "total_pixels": total_pixels,
        "burn_doy_min": int(min(burn_doy)) if burn_doy else None,
        "burn_doy_max": int(max(burn_doy)) if burn_doy else None,
        "date_uncertainty_days_min": unc_min,
        "date_uncertainty_days_max": unc_max,
    }


def detect_hansen_gfc(
    aoi_id: str,
    start_year: int = 2020,
    end_year: int = 2024,
    data_root: Optional[Union[str, Path]] = None,
) -> Dict[str, Any]:
    """Reads Hansen GFC raster and calculates tree cover and loss pixels."""
    data_dir = _resolve_data_dir(data_root)
    gfc_file = data_dir / aoi_id / "GFC_2025_v1_13.tif"
    if not gfc_file.exists():
        return {
            "hansen_loss_detected": False,
            "loss_pixels": 0,
            "mean_treecover_pct": 0.0,
            "datamask_valid_pixels": 0,
        }

    with rasterio.open(gfc_file) as src:
        treecover = src.read(1)
        lossyear = src.read(2)
        datamask = src.read(3)

    land_mask = datamask == 1
    mean_cover = float(np.mean(treecover[land_mask])) if np.sum(land_mask) > 0 else 0.0

    y_start_idx = start_year % 100
    y_end_idx = end_year % 100
    loss_in_range_mask = (lossyear >= y_start_idx) & (lossyear <= y_end_idx) & land_mask
    loss_pixels = int(np.sum(loss_in_range_mask))

    early_loss_mask = (lossyear >= 10) & (lossyear <= 12) & land_mask
    early_loss_pixels = int(np.sum(early_loss_mask))

    return {
        "hansen_loss_detected": loss_pixels > 0,
        "loss_pixels_recent": loss_pixels,
        "loss_pixels_early": early_loss_pixels,
        "mean_treecover_pct": mean_cover,
        "datamask_valid_pixels": int(np.sum(land_mask)),
    }


def compute_sentinel2_spectral_indices(
    reflectance_path: Union[str, Path],
    scl_path: Union[str, Path],
    offset: float = -0.1,
) -> Dict[str, Any]:
    """Corrects radiometric offset and SCL cloud masking for Sentinel-2 L2A."""
    p_ref = Path(reflectance_path)
    p_scl = Path(scl_path)
    if not p_ref.exists():
        p_ref = _resolve_data_dir() / reflectance_path
    if not p_scl.exists():
        p_scl = _resolve_data_dir() / scl_path

    with rasterio.open(p_ref) as src_ref, rasterio.open(p_scl) as src_scl:
        b04 = src_ref.read(3)  # Red
        b8a = src_ref.read(4)  # Narrow NIR
        b12 = src_ref.read(6)  # SWIR 2
        scl = src_scl.read(1)

    # Physical reflectance restoration: rho = band - offset
    rho_b04 = b04 - offset
    rho_b8a = b8a - offset
    rho_b12 = b12 - offset

    # SCL cloud masking: classes 4 (vegetation) and 5 (not-vegetated soil) are clear
    clear_mask = (scl == 4) | (scl == 5)
    cloud_mask = (scl == 8) | (scl == 9) | (scl == 10)

    denom_ndvi = rho_b8a + rho_b04
    denom_ndvi = np.where(np.abs(denom_ndvi) < 1e-6, 1e-6, denom_ndvi)
    ndvi = (rho_b8a - rho_b04) / denom_ndvi

    denom_nbr = rho_b8a + rho_b12
    denom_nbr = np.where(np.abs(denom_nbr) < 1e-6, 1e-6, denom_nbr)
    nbr = (rho_b8a - rho_b12) / denom_nbr

    mean_ndvi = float(np.mean(ndvi[clear_mask])) if np.sum(clear_mask) > 0 else 0.0
    mean_nbr = float(np.mean(nbr[clear_mask])) if np.sum(clear_mask) > 0 else 0.0
    cloud_fraction = float(np.sum(cloud_mask)) / float(scl.size) if scl.size > 0 else 0.0

    return {
        "mean_ndvi": mean_ndvi,
        "mean_nbr": mean_nbr,
        "cloud_fraction": cloud_fraction,
        "clear_pixels": int(np.sum(clear_mask)),
        "total_pixels": int(scl.size),
    }


# ---------------------------------------------------------------------------
# High-Level Disturbance Analysis Class
# ---------------------------------------------------------------------------


class DisturbanceAnalyzer:
    """Core analysis engine for satellite-based forest disturbance verification."""

    def __init__(self, data_root: Optional[Union[str, Path]] = None):
        self.data_root = _resolve_data_dir(data_root)
        self._scene_metadata_cache: Optional[Dict[str, Any]] = None

    def _load_scene_metadata(self) -> Dict[str, Any]:
        """Lazy loader for scene_metadata.json."""
        if self._scene_metadata_cache is None:
            meta_path = self.data_root / "scene_metadata.json"
            if meta_path.exists():
                with open(meta_path, "r", encoding="utf-8") as f:
                    self._scene_metadata_cache = json.load(f)
            else:
                self._scene_metadata_cache = {"scenes": []}
        return self._scene_metadata_cache

    def get_scene_radiometric_offset(self, scene_id: str) -> float:
        """Retrieves the radiometric BOA offset for a Sentinel-2 scene.
        Returns -0.1 for PB >= 04.00, or 0.0 for older baselines.
        """
        metadata = self._load_scene_metadata()
        for sc in metadata.get("scenes", []):
            stac = sc.get("source_stac_item", {})
            if stac.get("id") == scene_id or sc.get("scene_key", "").endswith(scene_id):
                assets = stac.get("assets", {})
                red_bands = assets.get("red", {}).get("raster:bands", [])
                if red_bands and "offset" in red_bands[0]:
                    return float(red_bands[0]["offset"])

                pb = stac.get("properties", {}).get("s2:processing_baseline", "00.00")
                try:
                    if float(pb) >= 4.0:
                        return -0.1
                except ValueError:
                    pass
                return 0.0
        return -0.1

    def detect_modis_fires(
        self, polygon_geojson: dict, site_id: Optional[str] = None
    ) -> MODISFireResult:
        """Detects 2021 burned areas from MODIS MCD64A1 August & September products."""
        poly_geom = shape(polygon_geojson)
        burn_files: List[Path] = []

        if site_id:
            burn_files = sorted(self.data_root.glob(f"{site_id}/MODIS/*_Burn_Date.tif"))
        else:
            burn_files = sorted(self.data_root.glob("*/MODIS/*_Burn_Date.tif"))

        if not burn_files:
            return MODISFireResult(
                fire_detected=False,
                burned_area_ha=0.0,
                burned_pixel_count=0,
                burn_dates=[],
            )

        all_burned_days: List[int] = []
        all_uncertainties: List[float] = []
        total_burned_area_ha = 0.0

        for burn_path in burn_files:
            qa_path = Path(str(burn_path).replace("_Burn_Date.tif", "_QA.tif"))
            unc_path = Path(str(burn_path).replace("_Burn_Date.tif", "_Burn_Date_Uncertainty.tif"))

            with rasterio.open(burn_path) as src_burn:
                # Transform polygon to Sinusoidal CRS
                geom_sinu = shape(transform_geom("EPSG:4326", src_burn.crs, polygon_geojson))

                # Check spatial overlap
                bounds_box = shapely.geometry.box(*src_burn.bounds)
                geom_wgs_box = shape(transform_geom(src_burn.crs, "EPSG:4326", shapely.geometry.mapping(bounds_box)))
                if not poly_geom.intersects(geom_wgs_box):
                    continue

                try:
                    burn_arr, _ = mask(src_burn, [geom_sinu], crop=True)
                except ValueError:
                    continue

                burn_data = burn_arr[0]
                qa_data = np.zeros_like(burn_data)
                unc_data = np.zeros_like(burn_data)

                if qa_path.exists():
                    with rasterio.open(qa_path) as src_qa:
                        qa_arr, _ = mask(src_qa, [geom_sinu], crop=True)
                        qa_data = qa_arr[0]

                if unc_path.exists():
                    with rasterio.open(unc_path) as src_unc:
                        unc_arr, _ = mask(src_unc, [geom_sinu], crop=True)
                        unc_data = unc_arr[0]

                # Burn detection criteria: day between 1 and 366
                # QA check: Bit 0 (land) must be 1
                is_burned = (burn_data > 0) & (burn_data <= 366)
                if qa_path.exists():
                    is_burned = is_burned & ((qa_data & 1) != 0)

                burned_indices = np.where(is_burned)
                burned_count = len(burned_indices[0])

                if burned_count > 0:
                    pixel_area_ha = abs(src_burn.res[0] * src_burn.res[1]) / 10000.0
                    total_burned_area_ha += burned_count * pixel_area_ha
                    days = burn_data[is_burned].tolist()
                    all_burned_days.extend(days)
                    if unc_path.exists():
                        all_uncertainties.extend(unc_data[is_burned].tolist())

        if not all_burned_days:
            return MODISFireResult(
                fire_detected=False,
                burned_area_ha=0.0,
                burned_pixel_count=0,
                burn_dates=[],
            )

        unique_days = sorted(list(set(all_burned_days)))
        # Convert Julian Day of Year 2021 to Gregorian calendar date
        burn_dates = [
            (datetime.date(2021, 1, 1) + datetime.timedelta(days=int(d) - 1)).isoformat()
            for d in unique_days
        ]

        mean_unc = float(np.mean(all_uncertainties)) if all_uncertainties else 0.0

        return MODISFireResult(
            fire_detected=True,
            burned_area_ha=float(round(total_burned_area_ha, 2)),
            burned_pixel_count=len(all_burned_days),
            burn_dates=burn_dates,
            burn_day_min=min(unique_days),
            burn_day_max=max(unique_days),
            mean_uncertainty_days=float(round(mean_unc, 2)),
        )

    def detect_hansen_loss(
        self, polygon_geojson: dict, site_id: Optional[str] = None
    ) -> HansenGFCResult:
        """Evaluates baseline canopy cover and detects annual forest loss from Hansen GFC 2025."""
        poly_geom = shape(polygon_geojson)
        gfc_files: List[Path] = []

        if site_id:
            gfc_files = [self.data_root / site_id / "GFC_2025_v1_13.tif"]
        else:
            gfc_files = sorted(self.data_root.glob("*/GFC_2025_v1_13.tif"))

        selected_file: Optional[Path] = None
        for f in gfc_files:
            if f.exists():
                with rasterio.open(f) as src:
                    if poly_geom.intersects(shapely.geometry.box(*src.bounds)):
                        selected_file = f
                        break

        if not selected_file or not selected_file.exists():
            return HansenGFCResult(
                canopy_cover_2000_avg=0.0,
                recent_loss_detected=False,
                recent_loss_pixels=0,
                recent_loss_area_ha=0.0,
            )

        extraction = RasterLoader.extract_windowed(selected_file, polygon_geojson)
        treecover = extraction.data[0]
        lossyear = extraction.data[1]
        datamask = extraction.data[2]
        weights = extraction.weights
        cell_areas = extraction.cell_areas_ha

        land_mask = (datamask == 1) & (weights > 0.0)
        if np.sum(land_mask) == 0:
            return HansenGFCResult(
                canopy_cover_2000_avg=0.0,
                recent_loss_detected=False,
                recent_loss_pixels=0,
                recent_loss_area_ha=0.0,
            )

        effective_weights = weights * land_mask
        avg_canopy = float(
            np.sum(effective_weights * treecover) / np.sum(effective_weights)
        )

        recent_loss_mask = np.isin(lossyear, list(range(20, 25))) & land_mask
        recent_loss_pixels = int(np.sum(lossyear[recent_loss_mask] > 0))
        recent_loss_area_ha = float(
            np.sum(weights[recent_loss_mask] * cell_areas[recent_loss_mask])
        )

        annual_loss: Dict[int, float] = {}
        for yr_code in range(1, 25):
            cal_year = 2000 + yr_code
            yr_mask = (lossyear == yr_code) & land_mask
            annual_loss[cal_year] = float(
                round(np.sum(weights[yr_mask] * cell_areas[yr_mask]), 2)
            )

        return HansenGFCResult(
            canopy_cover_2000_avg=float(round(avg_canopy, 2)),
            recent_loss_detected=(recent_loss_pixels > 0),
            recent_loss_pixels=recent_loss_pixels,
            recent_loss_area_ha=float(round(recent_loss_area_ha, 2)),
            annual_loss_ha=annual_loss,
        )

    def process_sentinel2_scene(
        self,
        reflectance_path: Union[str, Path],
        scl_path: Union[str, Path],
        polygon_geojson: dict,
        scene_id: Optional[str] = None,
    ) -> Sentinel2IndexResult:
        """Processes a Sentinel-2 L2A scene:
        1. Restores physical reflectance via radiometric offset.
        2. Applies SCL cloud and shadow filtering (classes 4 and 5).
        3. Computes mean NDVI and NBR over valid vegetation pixels.
        """
        refl_path = Path(reflectance_path)
        scl_p = Path(scl_path)
        if not refl_path.exists():
            refl_path = self.data_root / reflectance_path
        if not scl_p.exists():
            scl_p = self.data_root / scl_path

        if not refl_path.exists() or not scl_p.exists():
            raise FileNotFoundError(f"Sentinel-2 files not found: {refl_path}, {scl_p}")

        extracted_id = scene_id or refl_path.name.replace("_reflectance.tif", "")
        offset = self.get_scene_radiometric_offset(extracted_id)

        with rasterio.open(refl_path) as src_refl, rasterio.open(scl_p) as src_scl:
            geom_utm = shape(transform_geom("EPSG:4326", src_refl.crs, polygon_geojson))

            refl_data, _ = mask(src_refl, [geom_utm], crop=True)
            scl_data, _ = mask(src_scl, [geom_utm], crop=True)

            scl = scl_data[0]

            # Cloud & shadow filtering: keep vegetation (4) and bare soil (5)
            valid_scl_mask = np.isin(scl, [4, 5])
            total_aoi_pixels = np.sum(scl > 0)
            valid_fraction = (
                float(np.sum(valid_scl_mask) / total_aoi_pixels)
                if total_aoi_pixels > 0
                else 0.0
            )

            red_raw = refl_data[2]
            nir_raw = refl_data[3]
            swir2_raw = refl_data[5]

            rho_red = np.clip(red_raw - offset, 0.0, 1.0)
            rho_nir = np.clip(nir_raw - offset, 0.0, 1.0)
            rho_swir2 = np.clip(swir2_raw - offset, 0.0, 1.0)

            eps = 1e-6
            denom_ndvi = rho_nir + rho_red + eps
            ndvi_grid = np.where(valid_scl_mask, (rho_nir - rho_red) / denom_ndvi, np.nan)

            denom_nbr = rho_nir + rho_swir2 + eps
            nbr_grid = np.where(valid_scl_mask, (rho_nir - rho_swir2) / denom_nbr, np.nan)

            mean_ndvi = float(np.nanmean(ndvi_grid)) if np.any(valid_scl_mask) else 0.0
            mean_nbr = float(np.nanmean(nbr_grid)) if np.any(valid_scl_mask) else 0.0

            acq_date = src_refl.tags().get("acquisition_datetime", "")
            if not acq_date and len(extracted_id) >= 19:
                parts = extracted_id.split("_")
                for p in parts:
                    if len(p) == 8 and p.isdigit() and p.startswith("20"):
                        acq_date = f"{p[:4]}-{p[4:6]}-{p[6:8]}"
                        break

            return Sentinel2IndexResult(
                scene_id=extracted_id,
                acquisition_date=acq_date,
                mean_ndvi=float(round(mean_ndvi, 4)),
                mean_nbr=float(round(mean_nbr, 4)),
                cloud_filtered_fraction=float(round(valid_fraction, 4)),
                processing_baseline=">=04.00" if offset < 0 else "<04.00",
                radiometric_offset_applied=offset,
            )

    def get_disturbances(
        self, polygon_geojson: dict, site_id: Optional[str] = None
    ) -> DisturbanceResult:
        """Comprehensive disturbance analysis orchestrator for a given polygon."""
        modis = self.detect_modis_fires(polygon_geojson, site_id=site_id)
        hansen = self.detect_hansen_loss(polygon_geojson, site_id=site_id)

        # Look for available Sentinel-2 scenes for site
        s2_result: Optional[Sentinel2IndexResult] = None
        s2_files: List[Path] = []
        if site_id:
            s2_files = sorted(self.data_root.glob(f"{site_id}/**/*_reflectance.tif"))
        else:
            s2_files = sorted(self.data_root.glob("**/*_reflectance.tif"))

        if s2_files:
            refl_p = s2_files[-1]  # Take latest scene
            scl_p = Path(str(refl_p).replace("_reflectance.tif", "_SCL.tif"))
            if scl_p.exists():
                try:
                    s2_result = self.process_sentinel2_scene(refl_p, scl_p, polygon_geojson)
                except Exception:
                    pass

        mean_ndvi = s2_result.mean_ndvi if s2_result else 0.0
        mean_nbr = s2_result.mean_nbr if s2_result else 0.0
        cloud_filtered = s2_result.cloud_filtered_fraction > 0.0 if s2_result else False

        return DisturbanceResult(
            modis_fire_detected=modis.fire_detected,
            burned_area_ha=modis.burned_area_ha,
            burn_dates=modis.burn_dates,
            hansen_loss_detected=hansen.recent_loss_detected,
            loss_pixels_recent=hansen.recent_loss_pixels,
            canopy_cover_avg=hansen.canopy_cover_2000_avg,
            sentinel2_ndvi=mean_ndvi,
            sentinel2_nbr=mean_nbr,
            cloud_filtered=cloud_filtered,
            details={
                "modis": modis.to_dict(),
                "hansen": hansen.to_dict(),
                "sentinel2": s2_result.to_dict() if s2_result else None,
            },
        )


def get_disturbances(
    polygon_geojson: dict,
    site_id: Optional[str] = None,
    data_root: Optional[Union[str, Path]] = None,
) -> DisturbanceResult:
    """Convenience module function conforming to PROJECT.md."""
    analyzer = DisturbanceAnalyzer(data_root=data_root)
    return analyzer.get_disturbances(polygon_geojson, site_id=site_id)
