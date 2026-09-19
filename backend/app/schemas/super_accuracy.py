"""backend/app/schemas/super_accuracy.py

Pydantic Schemas for Ultra-Precision Tier 3 MRV Engine.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SMARequest(BaseModel):
    reflectance_bands: Optional[List[float]] = Field(
        None,
        description="Optional 6-band reflectance vector [B02, B03, B04, B8A, B11, B12]",
    )


class SMAResponse(BaseModel):
    conifer: float
    deciduous: float
    understory_soil: float
    shadow_gap: float
    rmse: float


class BayesianCalibrationRequest(BaseModel):
    satellite_agb_mean: float = Field(..., ge=1.0, le=600.0, description="Satellite initial mean AGB (t/ha)")
    satellite_agb_std: Optional[float] = Field(None, ge=0.1, le=100.0, description="Satellite standard deviation")
    uav_coverage_pct: float = Field(1.5, ge=0.0, le=20.0, description="Percentage of area covered by drone transects")
    uav_point_density_pts_m2: float = Field(250.0, ge=20.0, le=1000.0, description="Drone LiDAR point cloud density (pts/m2)")


class BayesianCalibrationResponse(BaseModel):
    prior_satellite: Dict[str, Any]
    uav_lidar_transect: Dict[str, Any]
    posterior_calibrated: Dict[str, Any]


class FivePoolsRequest(BaseModel):
    agb_t_ha: float = Field(..., ge=1.0, le=600.0)
    area_ha: float = Field(..., ge=0.1)
    dominant_species: str = Field("pine", description="Dominant tree species (tz_default, pine, spruce, birch, aspen, oak, mixed)")
    soil_type: str = Field("none", description="Dominant soil type (none, podzol, sandy_podzol, grey_forest, chernozem)")


class FivePoolsResponse(BaseModel):
    area_ha: float
    dominant_species: str
    carbon_fraction_cf: float
    root_to_shoot_ratio: float
    pools_per_ha: Dict[str, float]
    polygon_totals: Dict[str, float]
    tz_compliance: Optional[Dict[str, Any]] = None


class UltraPrecisionPipelineRequest(BaseModel):
    site_id: str = Field(..., description="Target site identifier or polygon ID")
    area_ha: Optional[float] = Field(None, ge=0.1)
    baseline_agb_t_ha: Optional[float] = Field(None, ge=1.0, le=600.0)
    uav_coverage_pct: float = Field(1.5, ge=0.0, le=20.0)
    uav_point_density: float = Field(250.0, ge=20.0, le=1000.0)
    dominant_species: str = Field("pine")
    soil_type: str = Field("none")


class UltraPrecisionPipelineResponse(BaseModel):
    site_id: str
    timestamp: str
    framework: str
    subpixel_sma: Dict[str, float]
    bayesian_calibration: Dict[str, Any]
    phenology_harmonics: Dict[str, Any]
    five_pools_carbon: Dict[str, Any]
    cryptographic_seal: str
