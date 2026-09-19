"""backend/app/api/routes_mrv.py

MRV Stock-Difference Carbon Accounting, Time-Series Trajectories, and Disturbance Endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from fastapi import APIRouter, HTTPException, status
import numpy as np
from shapely.geometry import shape

from backend.app.api.routes_sites import load_preset_sites
from backend.app.core.area import MAX_POLYGON_AREA_HA, wgs84_polygon_area_ha
from backend.app.core.audit import compute_calculation_hash
from backend.app.core.carbon import (
    CarbonAccountingParams,
    calculate_carbon_accounting,
    calculate_dynamic_baseline,
    lookup_preset_baseline,
)
from backend.app.core.disturbances import DisturbanceAnalyzer
from backend.app.core.raster_loader import IncompleteCoverageError, RasterLoader
from backend.app.core.uncertainty import calculate_spatial_uncertainty
from backend.app.schemas.mrv import (
    CalculationRequest,
    CalculationResponse,
    DisturbanceRequest,
    DisturbanceResponse,
    ProjectionItem,
    TimeseriesItem,
    TimeseriesRequest,
    TimeseriesResponse,
)

router = APIRouter(tags=["MRV Analytics"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"

PRESET_BBOXES = {
    "RU_TVER_01": (32.91, 56.59, 32.974, 56.63),
    "RU_VOLOGDA_02": (40.66975, 59.43, 40.73375, 59.47),
    "RU_MORDOVIA_03": (43.17, 54.85025, 43.234, 54.89025),
    "RU_MORDOVIA_04": (43.18, 54.78025, 43.244, 54.82025),
    "CHECK_TRANSFER_01": (40.66975, 59.43, 40.70175, 59.47),
}


def _resolve_geometry_and_site(
    req: Union[CalculationRequest, TimeseriesRequest, DisturbanceRequest, Dict[str, Any]],
) -> Tuple[Dict[str, Any], float, Optional[str], Path]:
    """Resolves GeoJSON geometry, ellipsoidal area, site_id, and data directory from request."""
    if hasattr(req, "model_dump"):
        data = req.model_dump()
    elif hasattr(req, "dict"):
        data = req.dict()
    elif isinstance(req, dict):
        data = req
    else:
        data = {}

    site_id = data.get("site_id") or data.get("aoi_id")
    geo = data.get("polygon") or data.get("custom_polygon") or data.get("geojson")

    if hasattr(geo, "model_dump"):
        geo = geo.model_dump()
    elif hasattr(geo, "dict"):
        geo = geo.dict()

    if isinstance(geo, dict) and geo.get("type") == "Feature":
        geo = geo.get("geometry", {})
    if hasattr(geo, "model_dump"):
        geo = geo.model_dump()

    preset_sites = {s.id: s for s in load_preset_sites()}

    # Case 1: Preset site ID provided without explicit custom polygon
    if site_id and (not geo or not geo.get("coordinates")):
        if site_id not in preset_sites:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Site '{site_id}' not found. Available: {list(preset_sites.keys())}",
            )
        target_site = preset_sites[site_id]
        geo = target_site.geojson if isinstance(target_site.geojson, dict) else target_site.geojson.model_dump()
        area_ha = target_site.area_ha
        data_subfolder = "RU_VOLOGDA_02" if site_id == "CHECK_TRANSFER_01" else site_id
        return geo, area_ha, site_id, DATA_DIR / data_subfolder

    # Case 2: Custom polygon provided (or both polygon and site_id provided)
    if geo and isinstance(geo, dict) and geo.get("coordinates"):
        area_ha = round(wgs84_polygon_area_ha(geo), 4)

        if site_id:
            data_subfolder = "RU_VOLOGDA_02" if site_id == "CHECK_TRANSFER_01" else site_id
            return geo, area_ha, site_id, DATA_DIR / data_subfolder

        # Match custom polygon against preset site bounding boxes
        geom_shape = shape(geo)
        b = geom_shape.bounds
        matched_site = None
        for sid, bbox in PRESET_BBOXES.items():
            if not (b[2] < bbox[0] or b[0] > bbox[2] or b[3] < bbox[1] or b[1] > bbox[3]):
                matched_site = sid
                break

        if matched_site:
            data_subfolder = "RU_VOLOGDA_02" if matched_site == "CHECK_TRANSFER_01" else matched_site
            return geo, area_ha, matched_site, DATA_DIR / data_subfolder

        # Default fallback to RU_TVER_01 data root if within range, else TVER
        return geo, area_ha, None, DATA_DIR / "RU_TVER_01"

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Must provide either 'site_id' or valid GeoJSON 'polygon' coordinates.",
    )


@router.post("/mrv/calculate", response_model=CalculationResponse)
def calculate_mrv(request: Union[CalculationRequest, Dict[str, Any]]) -> CalculationResponse:
    """Computes full stock-difference MRV carbon accounting, spatial autocorrelation (Moran's I),
    standard error propagation, 95% confidence intervals [L, U], uncertainty haircut (UNC),
    permanence buffer (15%), integer tradable units (Q), valuations, and SHA-256 seal.
    """
    if hasattr(request, "model_dump"):
        data = request.model_dump()
    elif hasattr(request, "dict"):
        data = request.dict()
    elif isinstance(request, dict):
        data = request
    else:
        data = {}

    year_start = int(data.get("year_start") or 2019)
    year_end = int(data.get("year_end") or 2024)
    delta_years = max(1, year_end - year_start)
    baseline_rate = data.get("baseline_rate")
    leakage_lk = float(data.get("leakage_lk") or 0.0)
    spatial_model = data.get("spatial_model") or "queen"

    geo, area_ha, site_id, site_dir = _resolve_geometry_and_site(request)

    # 1. Boundary Checks: Max area and positive area
    if area_ha > MAX_POLYGON_AREA_HA:
        return _create_blocked_calculation_response(
            area_ha=area_ha,
            delta_years=delta_years,
            site_id=site_id,
            reason=f"POLYGON_EXCEEDS_MAX_AREA: {area_ha:.2f} ha > {MAX_POLYGON_AREA_HA:.2f} ha (20 km² limit)",
        )

    if area_ha <= 0.0:
        return _create_blocked_calculation_response(
            area_ha=area_ha,
            delta_years=delta_years,
            site_id=site_id,
            reason="INVALID_AREA: Area must be positive",
        )

    # 2. Locate raster files
    raster_start = site_dir / f"CCI_Biomass_{year_start}.tif"
    raster_end = site_dir / f"CCI_Biomass_{year_end}.tif"

    if not raster_start.exists() or not raster_end.exists():
        # Missing raster data blocks crediting
        return _create_blocked_calculation_response(
            area_ha=area_ha,
            delta_years=delta_years,
            site_id=site_id,
            reason=f"INCOMPLETE_COVERAGE: Raster files for {year_start} or {year_end} not available.",
        )

    # 3. Extract raster data via RasterLoader
    try:
        res0 = RasterLoader.extract_windowed(raster_start, geo)
        res1 = RasterLoader.extract_windowed(raster_end, geo)
    except IncompleteCoverageError as ice:
        return _create_blocked_calculation_response(
            area_ha=area_ha,
            delta_years=delta_years,
            site_id=site_id,
            reason=f"INCOMPLETE_COVERAGE: {str(ice)}",
        )
    except Exception as exc:
        return _create_blocked_calculation_response(
            area_ha=area_ha,
            delta_years=delta_years,
            site_id=site_id,
            reason=f"RASTER_EXTRACTION_ERROR: {str(exc)}",
        )

    # Band 1: AGB (t/ha), Band 2: AGB_SD (t/ha)
    agb0 = res0.data[0]
    sd0 = res0.data[1]
    agb1 = res1.data[0]
    sd1 = res1.data[1]

    mask = res0.valid_mask & res1.valid_mask
    w_area = res0.weights * res0.cell_areas_ha
    tot_valid_area = float(np.sum(w_area[mask]))

    if tot_valid_area <= 0.0:
        return _create_blocked_calculation_response(
            area_ha=area_ha,
            delta_years=delta_years,
            site_id=site_id,
            reason="INCOMPLETE_COVERAGE: Zero valid raster pixels inside polygon",
        )

    t0_b = float(np.sum(agb0[mask] * w_area[mask]) / tot_valid_area)
    t1_b = float(np.sum(agb1[mask] * w_area[mask]) / tot_valid_area)
    delta_b = t1_b - t0_b

    # 4. Biomass to Carbon Conversion (CF = 0.47, 44/12)
    c0 = t0_b * 0.47
    c1 = t1_b * 0.47
    delta_c = c1 - c0
    delta_c_total = area_ha * delta_c

    e_proj = -delta_c_total * (44.0 / 12.0)
    e_proj_rate = e_proj / (area_ha * delta_years)

    # 5. Baseline counterfactual determination
    if baseline_rate is not None:
        baseline_delta_tc_ha = float(baseline_rate) * delta_years
        rate_yr = float(baseline_rate)
    elif site_id in PRESET_BBOXES:
        ref_site = "RU_VOLOGDA_02" if site_id == "CHECK_TRANSFER_01" else site_id
        stock_start, stock_end, rate_yr = lookup_preset_baseline(ref_site, year_start, year_end)
        baseline_delta_tc_ha = stock_end - stock_start
    else:
        # Dynamic baseline from 2015 to 2019
        try:
            r15 = RasterLoader.extract_windowed(site_dir / "CCI_Biomass_2015.tif", geo)
            r19 = RasterLoader.extract_windowed(site_dir / "CCI_Biomass_2019.tif", geo)
            m15 = r15.valid_mask & r19.valid_mask
            w15 = r15.weights * r15.cell_areas_ha
            tot15 = float(np.sum(w15[m15]))
            b15 = float(np.sum(r15.data[0][m15] * w15[m15]) / tot15) if tot15 > 0 else t0_b
            b19 = float(np.sum(r19.data[0][m15] * w15[m15]) / tot15) if tot15 > 0 else t0_b
            _, _, rate_yr = calculate_dynamic_baseline(b15 * 0.47, b19 * 0.47, year_start, year_end)
            baseline_delta_tc_ha = rate_yr * delta_years
        except Exception:
            rate_yr = 0.47
            baseline_delta_tc_ha = rate_yr * delta_years

    delta_c_base_total = area_ha * baseline_delta_tc_ha
    e_base = -delta_c_base_total * (44.0 / 12.0)
    e_base_rate = e_base / (area_ha * delta_years)

    # 6. Project net carbon benefit R
    r_gross = e_base - e_proj - leakage_lk

    # 7. Spatial Autocorrelation & Uncertainty Propagation
    unc = calculate_spatial_uncertainty(
        b_t0=agb0,
        b_t1=agb1,
        sd_t0=sd0,
        sd_t1=sd1,
        areas_ha=w_area,
        mask=mask,
        e_proj=e_proj,
        r_gross=r_gross,
        neighborhood="rook" if spatial_model == "rook" else "queen",
    )

    q_units = unc.q_tradable_units
    is_valid = unc.is_valid and (r_gross > 0.0)
    blocking_reason = unc.blocking_reason
    if r_gross <= 0.0:
        is_valid = False
        blocking_reason = "NO_NET_CARBON_BENEFIT"
        q_units = 0

    scenario_valuations = {
        "rub_500": round(q_units * 500.0, 2),
        "rub_1500": round(q_units * 1500.0, 2),
        "rub_4000": round(q_units * 4000.0, 2),
    }

    # 8. Cryptographic Calculation Hash (SHA-256)
    audit_dict = {
        "area_ha": round(area_ha, 4),
        "delta_years": delta_years,
        "t0_biomass_t_ha": round(t0_b, 4),
        "t1_biomass_t_ha": round(t1_b, 4),
        "delta_biomass_t_ha": round(delta_b, 4),
        "delta_c_total_t": round(delta_c_total, 4),
        "e_proj_t_co2e": round(e_proj, 4),
        "e_base_t_co2e": round(e_base, 4),
        "r_gross_t_co2e": round(r_gross, 4),
        "moran_i": round(unc.moran_i, 6),
        "vif": round(unc.vif, 4),
        "se_proj": round(unc.se_proj, 4),
        "half_width_h": round(unc.half_width_h, 4) if unc.half_width_h is not None else None,
        "h_over_r": round(unc.h_over_r, 4) if unc.h_over_r is not None else None,
        "unc_deduction": round(unc.unc_deduction, 4),
        "r_adjusted": round(unc.r_adjusted, 4),
        "buffer_reserve": round(unc.buffer_reserve, 4),
        "q_tradable_units": q_units,
        "scenario_valuations": scenario_valuations,
        "site_id": site_id,
        "year_start": year_start,
        "year_end": year_end,
    }
    calc_hash = compute_calculation_hash(audit_dict)

    return CalculationResponse(
        site_id=site_id,
        area_ha=round(area_ha, 4),
        delta_years=delta_years,
        t0_biomass_t_ha=round(t0_b, 4),
        t1_biomass_t_ha=round(t1_b, 4),
        delta_biomass_t_ha=round(delta_b, 4),
        c0_t_c_ha=round(c0, 4),
        c1_t_c_ha=round(c1, 4),
        delta_c_t_c_ha=round(delta_c, 4),
        delta_c_total_t=round(delta_c_total, 4),
        delta_carbon_t=round(delta_c_total, 4),
        e_proj_t_co2e=round(e_proj, 4),
        e_proj_rate_t_co2e_ha_yr=round(e_proj_rate, 4),
        baseline_delta_tc_ha=round(baseline_delta_tc_ha, 6),
        delta_c_base_total_t=round(delta_c_base_total, 4),
        e_base_t_co2e=round(e_base, 4),
        e_base_rate_t_co2e_ha_yr=round(e_base_rate, 4),
        leakage_lk=round(leakage_lk, 4),
        r_gross_t_co2e=round(r_gross, 4),
        moran_i=round(unc.moran_i, 6),
        vif=round(unc.vif, 4),
        n_eff=round(unc.n_eff, 2),
        se_proj=round(unc.se_proj, 4),
        half_width_h=round(unc.half_width_h, 4) if unc.half_width_h is not None else None,
        ci_lower_l=round(unc.ci_lower_l, 4) if unc.ci_lower_l is not None else None,
        ci_upper_u=round(unc.ci_upper_u, 4) if unc.ci_upper_u is not None else None,
        h_over_r=round(unc.h_over_r, 4) if unc.h_over_r is not None else None,
        unc_deduction=round(unc.unc_deduction, 4),
        r_adjusted=round(unc.r_adjusted, 4),
        buffer_reserve=round(unc.buffer_reserve, 4),
        q_tradable_units=q_units,
        scenario_valuations=scenario_valuations,
        is_valid=is_valid,
        blocking_reason=blocking_reason,
        calculation_hash=calc_hash,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


def _create_blocked_calculation_response(
    area_ha: float,
    delta_years: int,
    site_id: Optional[str],
    reason: str,
) -> CalculationResponse:
    """Helper to return an uncreditable or blocked CalculationResponse."""
    empty_valuations = {"rub_500": 0.0, "rub_1500": 0.0, "rub_4000": 0.0}
    blocked_dict = {
        "area_ha": round(area_ha, 4),
        "delta_years": delta_years,
        "is_valid": False,
        "blocking_reason": reason,
        "q_tradable_units": 0,
        "site_id": site_id,
    }
    calc_hash = compute_calculation_hash(blocked_dict)

    return CalculationResponse(
        site_id=site_id,
        area_ha=round(area_ha, 4),
        delta_years=delta_years,
        t0_biomass_t_ha=0.0,
        t1_biomass_t_ha=0.0,
        delta_biomass_t_ha=0.0,
        c0_t_c_ha=0.0,
        c1_t_c_ha=0.0,
        delta_c_t_c_ha=0.0,
        delta_c_total_t=0.0,
        delta_carbon_t=0.0,
        e_proj_t_co2e=0.0,
        e_proj_rate_t_co2e_ha_yr=0.0,
        baseline_delta_tc_ha=0.0,
        delta_c_base_total_t=0.0,
        e_base_t_co2e=0.0,
        e_base_rate_t_co2e_ha_yr=0.0,
        leakage_lk=0.0,
        r_gross_t_co2e=0.0,
        moran_i=0.0,
        vif=1.0,
        n_eff=1.0,
        se_proj=0.0,
        half_width_h=None,
        ci_lower_l=None,
        ci_upper_u=None,
        h_over_r=None,
        unc_deduction=0.0,
        r_adjusted=0.0,
        buffer_reserve=0.0,
        q_tradable_units=0,
        scenario_valuations=empty_valuations,
        is_valid=False,
        blocking_reason=reason,
        calculation_hash=calc_hash,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/mrv/timeseries", response_model=TimeseriesResponse)
def get_timeseries(request: Union[TimeseriesRequest, Dict[str, Any]]) -> TimeseriesResponse:
    """Returns retrospective historical carbon trajectory (2015-2024) from real GeoTIFFs
    and counterfactual projection (2025-2029) with 95% confidence intervals.
    """
    geo, area_ha, site_id, site_dir = _resolve_geometry_and_site(request)

    retrospective: List[Dict[str, Any]] = []
    biomass_history: Dict[int, float] = {}

    # 1. Extract 2015-2024 annual retrospective from real ESA CCI Biomass GeoTIFFs
    for y in range(2015, 2025):
        raster_p = site_dir / f"CCI_Biomass_{y}.tif"
        if not raster_p.exists():
            continue
        try:
            r = RasterLoader.extract_windowed(raster_p, geo)
            w_a = r.weights * r.cell_areas_ha
            m = r.valid_mask
            tot_a = float(np.sum(w_a[m]))
            if tot_a > 0:
                b_val = float(np.sum(r.data[0][m] * w_a[m]) / tot_a)
                sd_val = float(np.sum(r.data[1][m] * w_a[m]) / tot_a)
                c_stock = area_ha * b_val * 0.47
                biomass_history[y] = b_val
                retrospective.append({
                    "year": y,
                    "biomass_t_ha": round(b_val, 2),
                    "carbon_stock_t": round(c_stock, 1),
                    "sd": round(sd_val, 2),
                    "ci_lower": round(c_stock - 1.96 * sd_val * 0.47 * area_ha / math.sqrt(max(1, tot_a)), 1),
                    "ci_upper": round(c_stock + 1.96 * sd_val * 0.47 * area_ha / math.sqrt(max(1, tot_a)), 1),
                })
        except Exception:
            continue

    # 2. Determine baseline and project continuation trajectories (2025-2029)
    # Baseline rate from baseline.csv
    base_rate_yr = 0.34375
    if site_id:
        ref_site = "RU_VOLOGDA_02" if site_id == "CHECK_TRANSFER_01" else site_id
        try:
            _, _, r_hist = lookup_preset_baseline(ref_site, 2019, 2024)
            base_rate_yr = r_hist
        except Exception:
            pass

    # Project growth rate (2019-2024 observed continuation)
    b2019 = biomass_history.get(2019, 180.0)
    b2024 = biomass_history.get(2024, b2019)
    proj_rate_c_yr = ((b2024 - b2019) * 0.47) / 5.0

    projections: List[Dict[str, Any]] = []
    for y in range(2025, 2030):
        years_from_2019 = y - 2019
        c_base_delta = base_rate_yr * years_from_2019
        e_base_val = -area_ha * c_base_delta * (44.0 / 12.0)

        c_proj_delta = (b2024 - b2019) * 0.47 + proj_rate_c_yr * (y - 2024)
        e_proj_est = -area_ha * c_proj_delta * (44.0 / 12.0)

        uncertainty_h = 0.20 * abs(e_proj_est) * math.sqrt(years_from_2019 / 5.0)

        projections.append({
            "year": y,
            "e_base": round(e_base_val, 1),
            "e_proj_est": round(e_proj_est, 1),
            "ci_lower": round(e_proj_est - uncertainty_h, 1),
            "ci_upper": round(e_proj_est + uncertainty_h, 1),
        })

    return TimeseriesResponse(
        site_id=site_id,
        retrospective=retrospective,
        projections=projections,
    )


@router.post("/mrv/disturbances", response_model=DisturbanceResponse)
def get_disturbances_analysis(request: Union[DisturbanceRequest, Dict[str, Any]]) -> DisturbanceResponse:
    """Executes multi-sensor disturbance detection: MODIS MCD64A1 August 2021 fires,
    Hansen Global Forest Change (GFC v1.13) cover loss, and Sentinel-2 L2A NDVI/NBR.
    """
    geo, area_ha, site_id, site_dir = _resolve_geometry_and_site(request)

    analyzer = DisturbanceAnalyzer(data_root=DATA_DIR)
    dist_res = analyzer.get_disturbances(geo, site_id=site_id)

    return DisturbanceResponse(
        site_id=site_id,
        modis_fire_detected=dist_res.modis_fire_detected,
        burned_area_ha=round(dist_res.burned_area_ha, 2),
        burn_dates=dist_res.burn_dates,
        hansen_loss_detected=dist_res.hansen_loss_detected,
        loss_pixels_recent=dist_res.loss_pixels_recent,
        canopy_cover_avg=round(dist_res.canopy_cover_avg, 2),
        sentinel2_ndvi=round(dist_res.sentinel2_ndvi, 4),
        sentinel2_nbr=round(dist_res.sentinel2_nbr, 4),
        cloud_filtered=dist_res.cloud_filtered,
        burn_severity_dnbr=dist_res.burn_severity_dnbr,
        details=dist_res.details,
    )
