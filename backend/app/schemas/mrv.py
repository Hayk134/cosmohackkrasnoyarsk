"""backend/app/schemas/mrv.py

Pydantic v2 schemas for MRV satellite verification, spatial accounting,
disturbance detection, reporting, and credit registry APIs.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field


class GeoJSONGeometry(BaseModel):
    """GeoJSON geometry representation (Polygon or MultiPolygon)."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    type: str = Field(default="Polygon", description="Geometry type, typically 'Polygon' or 'MultiPolygon'")
    coordinates: List[Any] = Field(..., description="Array of coordinate rings or multi-rings")


class SiteInfo(BaseModel):
    """Preset or registered forest carbon project site."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str = Field(..., description="Unique site identifier (e.g. RU_TVER_01)")
    name: str = Field(..., description="Human-readable site name")
    area_ha: float = Field(..., description="Exact analytical WGS84 ellipsoidal area in hectares")
    bounds: List[float] = Field(..., description="Bounding box [min_lon, min_lat, max_lon, max_lat]")
    geojson: Union[GeoJSONGeometry, Dict[str, Any]] = Field(..., description="GeoJSON geometry object")
    region: Optional[str] = Field(default=None, description="Administrative region")
    role: Optional[str] = Field(default=None, description="Role / classification of site in analysis")
    project_status: Optional[str] = Field(default=None, description="Current operational status")
    baseline_id: Optional[str] = Field(default=None, description="Methodological baseline identifier")
    year_start: Optional[int] = Field(default=2019, description="Default start year")
    year_end: Optional[int] = Field(default=2024, description="Default end year")


class PolygonValidationRequest(BaseModel):
    """Request payload to validate arbitrary custom GeoJSON polygon."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    geojson: Union[GeoJSONGeometry, Dict[str, Any]] = Field(..., description="GeoJSON polygon or feature")


class PolygonValidationResponse(BaseModel):
    """Validation response for custom polygon."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    is_valid: bool = Field(..., description="True if polygon is topologically valid and within limits")
    area_ha: float = Field(..., description="WGS84 area in hectares")
    bounds: Optional[List[float]] = Field(default=None, description="Bounding box [min_lon, min_lat, max_lon, max_lat]")
    message: Optional[str] = Field(default=None, description="Informational message or validation summary")
    blocking_reason: Optional[str] = Field(default=None, description="Rejection reason if is_valid is False")
    error: Optional[str] = Field(default=None, description="Detailed error description if invalid")


class CalculationRequest(BaseModel):
    """Request payload for MRV stock-difference carbon accounting."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(default=None, description="Preset site ID (e.g. RU_TVER_01)")
    aoi_id: Optional[str] = Field(default=None, description="Alias for site_id")
    polygon: Optional[Union[GeoJSONGeometry, Dict[str, Any]]] = Field(default=None, description="Custom GeoJSON polygon")
    custom_polygon: Optional[Union[GeoJSONGeometry, Dict[str, Any]]] = Field(default=None, description="Alias for polygon")
    geojson: Optional[Union[GeoJSONGeometry, Dict[str, Any]]] = Field(default=None, description="Alias for polygon")
    year_start: int = Field(default=2019, description="Initial observation year")
    year_end: int = Field(default=2024, description="Ending observation year")
    baseline_rate: Optional[float] = Field(default=None, description="Custom counterfactual baseline rate (t C/ha/yr)")
    leakage_lk: float = Field(default=0.0, description="Project leakage deduction in t CO2e (default 0.0)")
    spatial_model: Optional[str] = Field(default="queen", description="Spatial contiguity scheme: queen or rook")


class CalculationResponse(BaseModel):
    """Authoritative result of the MRV carbon accounting and unit issuance pipeline."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(default=None, description="Site identifier if applicable")
    area_ha: float = Field(..., description="Evaluated WGS84 area in hectares")
    delta_years: int = Field(default=1, description="Observation interval in years")

    # Biomass and carbon stock densities & totals
    t0_biomass_t_ha: float = Field(..., description="Initial aboveground biomass density (t/ha)")
    t1_biomass_t_ha: float = Field(..., description="Final aboveground biomass density (t/ha)")
    delta_biomass_t_ha: float = Field(..., description="Difference in biomass density (t/ha)")
    c0_t_c_ha: float = Field(..., description="Initial carbon stock density (t C/ha)")
    c1_t_c_ha: float = Field(..., description="Final carbon stock density (t C/ha)")
    delta_c_t_c_ha: float = Field(..., description="Change in carbon density (t C/ha)")
    delta_c_total_t: float = Field(..., description="Total actual carbon stock change (t C)")
    delta_carbon_t: float = Field(..., description="Alias for delta_c_total_t")

    # Project net emissions
    e_proj_t_co2e: float = Field(..., description="Net project emissions in t CO2e (negative = removals)")
    e_proj_rate_t_co2e_ha_yr: float = Field(..., description="Specific project emission rate (t CO2e/ha/yr)")

    # Baseline counterfactual
    baseline_delta_tc_ha: float = Field(..., description="Baseline carbon stock change per ha (t C/ha)")
    delta_c_base_total_t: float = Field(..., description="Total baseline carbon stock change (t C)")
    e_base_t_co2e: float = Field(..., description="Baseline emissions in t CO2e")
    e_base_rate_t_co2e_ha_yr: float = Field(..., description="Baseline emission rate (t CO2e/ha/yr)")

    # Project net benefit & spatial uncertainty
    leakage_lk: float = Field(default=0.0, description="Leakage deduction (t CO2e)")
    r_gross_t_co2e: float = Field(..., description="Net carbon benefit R = E_base - E_proj - LK (t CO2e)")
    moran_i: float = Field(default=0.0, description="Global Moran's I spatial autocorrelation coefficient")
    vif: float = Field(default=1.0, description="Variance Inflation Factor (Clifford-Ord)")
    n_eff: float = Field(default=1.0, description="Effective sample size accounting for autocorrelation")
    se_proj: float = Field(default=0.0, description="Propagated standard error of project emissions (t CO2e)")
    half_width_h: Optional[float] = Field(default=None, description="95% confidence interval half-width H (t CO2e)")
    ci_lower_l: Optional[float] = Field(default=None, description="Lower 95% confidence bound (t CO2e)")
    ci_upper_u: Optional[float] = Field(default=None, description="Upper 95% confidence bound (t CO2e)")
    h_over_r: Optional[float] = Field(default=None, description="Relative uncertainty ratio H/R")

    # Deductions & Units
    unc_deduction: float = Field(..., description="Uncertainty haircut deduction factor UNC in [0.0, 1.0]")
    r_adjusted: float = Field(..., description="Adjusted carbon benefit R_adj = R * (1 - UNC) (t CO2e)")
    buffer_reserve: float = Field(..., description="15% permanence buffer reserve B (t CO2e)")
    q_tradable_units: int = Field(..., description="Issued tradable carbon units Q = floor(R_adj - B)")

    # Valuations & cryptographic seal
    scenario_valuations: Dict[str, float] = Field(..., description="Valuations at 500, 1500, 4000 RUB per unit")
    is_valid: bool = Field(..., description="True if calculation meets all verification criteria")
    blocking_reason: Optional[str] = Field(default=None, description="Reason if issuance is blocked")
    calculation_hash: str = Field(..., description="Deterministic 64-char SHA-256 calculation seal")
    timestamp: Optional[str] = Field(default=None, description="Calculation UTC timestamp")


class TimeseriesItem(BaseModel):
    """Historical or retrospective annual biomass and carbon data point."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    year: int
    biomass_t_ha: float
    carbon_stock_t: float
    sd: Optional[float] = None
    ci_lower: Optional[float] = None
    ci_upper: Optional[float] = None


class ProjectionItem(BaseModel):
    """Projected counterfactual baseline vs project continuation data point."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    year: int
    e_base: float
    e_proj_est: float
    ci_lower: float
    ci_upper: float


class TimeseriesRequest(BaseModel):
    """Request for historical and projected carbon trajectory."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = None
    aoi_id: Optional[str] = None
    polygon: Optional[Union[GeoJSONGeometry, Dict[str, Any]]] = None
    custom_polygon: Optional[Union[GeoJSONGeometry, Dict[str, Any]]] = None
    geojson: Optional[Union[GeoJSONGeometry, Dict[str, Any]]] = None


class TimeseriesResponse(BaseModel):
    """Dual-period time series: 2015-2024 retrospective and 2025-2029 projection."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = None
    retrospective: List[Dict[str, Any]]
    projections: List[Dict[str, Any]]


class DisturbanceRequest(BaseModel):
    """Request for multi-source disturbance detection."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = None
    aoi_id: Optional[str] = None
    polygon: Optional[Union[GeoJSONGeometry, Dict[str, Any]]] = None
    custom_polygon: Optional[Union[GeoJSONGeometry, Dict[str, Any]]] = None
    geojson: Optional[Union[GeoJSONGeometry, Dict[str, Any]]] = None


class DisturbanceResponse(BaseModel):
    """Multi-source disturbance detection summary."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = None
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
    details: Optional[Dict[str, Any]] = None


class ReportRequest(BaseModel):
    """Request to generate verifiable audit certificate."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = None
    calculation_id: Optional[str] = None
    calculation_hash: Optional[str] = None
    project_name: Optional[str] = None
    calculation_result: Optional[Dict[str, Any]] = None
    verifier_notes: Optional[str] = None


class ReportResponse(BaseModel):
    """Verifiable audit report with cryptographic signature."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    report_id: str
    generated_at: str
    verification_hash: str
    html_report: str
    json_report: Dict[str, Any]
    is_valid: bool


class TransactionRequest(BaseModel):
    """Request to execute a carbon credit registry operation."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    action: str = Field(..., description="'issue', 'transfer', or 'retire'")
    units: int = Field(..., description="Integer number of credit units")
    account: Optional[str] = Field(default=None, description="Primary account name")
    from_account: Optional[str] = Field(default=None, description="Source account for transfer/retire")
    to_account: Optional[str] = Field(default=None, description="Destination account for transfer")
    site_id: Optional[str] = Field(default=None, description="Associated site ID")
    aoi_id: Optional[str] = Field(default=None, description="Alias for site_id")
    year: Optional[int] = Field(default=2024, description="Vintage year")
    calculation_hash: Optional[str] = Field(default=None, description="SHA-256 seal from calculation")
    beneficiary: Optional[str] = Field(default=None, description="Retirement beneficiary entity")
    reason: Optional[str] = Field(default=None, description="Retirement reason / ESG justification")


class TransactionResponse(BaseModel):
    """Transaction confirmation."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    tx_id: str
    action: str
    units: int
    status: str
    message: Optional[str] = None
    from_account: Optional[str] = None
    to_account: Optional[str] = None
    batch_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class RegistrySummary(BaseModel):
    """Aggregated state and integrity audit of the demo credit registry."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    total_issued: int
    total_retired: int
    active_balances: Dict[str, int]
    batches: List[Dict[str, Any]]
    transactions: List[Dict[str, Any]]
    conservation_verified: bool
