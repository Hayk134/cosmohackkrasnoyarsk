"""backend/app/api/routes_super_accuracy.py

FastAPI Routes for Tier 3 Ultra-Precision MRV Engine:
- /api/accuracy/pipeline: Unified calibration run
- /api/accuracy/sma: Sub-pixel spectral unmixing
- /api/accuracy/bayesian: Drone LiDAR Bayesian calibration
- /api/accuracy/five-pools: IPCC 5-Pool carbon stocks
"""

from __future__ import annotations

from typing import Any, Dict
from fastapi import APIRouter, HTTPException, Query

from backend.app.core.super_accuracy import (
    calculate_bayesian_calibration,
    calculate_five_pools_carbon,
    run_ultra_precision_pipeline,
    unmix_pixel_sma,
)
from backend.app.schemas.super_accuracy import (
    BayesianCalibrationRequest,
    BayesianCalibrationResponse,
    FivePoolsRequest,
    FivePoolsResponse,
    SMARequest,
    SMAResponse,
    UltraPrecisionPipelineRequest,
    UltraPrecisionPipelineResponse,
)

router = APIRouter(prefix="/accuracy", tags=["Tier 3 Ultra-Precision MRV"])


@router.post("/pipeline", response_model=UltraPrecisionPipelineResponse)
def execute_ultra_precision_pipeline(request: UltraPrecisionPipelineRequest) -> Dict[str, Any]:
    """Runs the unified Tier 3 MRV pipeline for a target polygon/site."""
    area = request.area_ha or 100.0
    baseline_agb = request.baseline_agb_t_ha or 105.0

    try:
        res = run_ultra_precision_pipeline(
            site_id=request.site_id,
            area_ha=area,
            baseline_agb_t_ha=baseline_agb,
            uav_coverage_pct=request.uav_coverage_pct,
            uav_point_density=request.uav_point_density,
            dominant_species=request.dominant_species,
            soil_type=request.soil_type,
        )
        return res
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ultra-precision pipeline execution error: {str(exc)}")


@router.post("/sma", response_model=SMAResponse)
def execute_subpixel_sma(request: SMARequest) -> Dict[str, float]:
    """Performs Sub-pixel Spectral Mixture Analysis (SMA) on 6-band Sentinel-2 reflectance."""
    sample = request.reflectance_bands or [0.024, 0.041, 0.030, 0.295, 0.145, 0.075]
    if len(sample) != 6:
        raise HTTPException(status_code=400, detail="Reflectance vector must contain exactly 6 bands (B02, B03, B04, B8A, B11, B12)")
    return unmix_pixel_sma(sample)


@router.post("/bayesian", response_model=BayesianCalibrationResponse)
def execute_bayesian_calibration(request: BayesianCalibrationRequest) -> Dict[str, Any]:
    """Computes Hierarchical Bayesian calibration combining satellite prior with UAV-LiDAR likelihood."""
    std = request.satellite_agb_std or (request.satellite_agb_mean * 0.09)
    return calculate_bayesian_calibration(
        satellite_agb_mean=request.satellite_agb_mean,
        satellite_agb_std=std,
        uav_coverage_pct=request.uav_coverage_pct,
        uav_point_density_pts_m2=request.uav_point_density_pts_m2,
    )


@router.post("/five-pools", response_model=FivePoolsResponse)
def execute_five_pools_accounting(request: FivePoolsRequest) -> Dict[str, Any]:
    """Computes full IPCC 5-Pool forest carbon stock (AGB, BGB, Deadwood, Litter, SOC)."""
    return calculate_five_pools_carbon(
        agb_t_ha=request.agb_t_ha,
        area_ha=request.area_ha,
        dominant_species=request.dominant_species,
        soil_type=request.soil_type,
    )
