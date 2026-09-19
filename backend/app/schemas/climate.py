"""backend/app/schemas/climate.py

Pydantic v2 Schemas for Kosmo·MRV CMIP6 Climate Risk Projections to 2050:
- IPCC SSP2-4.5 vs SSP5-8.5 Scenarios
- Fire Hazard Multiplier (Nesterov / KBDI), SPEI Drought Anomaly & Stand Mortality
- Buffer Pool Solvency Stress Testing (/api/climate-risks)
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ScenarioProjection(BaseModel):
    """Annualized or decadal climate indicator milestone projection."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    year: int = Field(..., description="Projection milestone year (2025..2050)")
    temperature_anomaly_c: float = Field(..., description="Surface temperature anomaly relative to baseline (°C)")
    fire_hazard_multiplier: float = Field(
        ..., description="Nesterov / Keetch-Byram fire weather multiplier M_fire(t) (1.0 = baseline)"
    )
    spei_drought_anomaly: float = Field(
        ..., description="Standardised Precipitation-Evapotranspiration Index anomaly (negative = severe drought)"
    )
    annual_mortality_rate_pct: float = Field(
        ..., description="Projected annual forest biomass mortality rate R_annual (%)"
    )
    cumulative_loss_pct: float = Field(
        ..., description="Cumulative permanence biomass loss percentage from 2025 to year t (%)"
    )


class ClimateScenarioResult(BaseModel):
    """Comprehensive IPCC CMIP6 projection trajectory for a specific emission pathway."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    scenario_name: Literal["SSP2-4.5", "SSP5-8.5"] = Field(..., description="IPCC CMIP6 scenario identifier")
    description: str = Field(..., description="Scenario narrative description")
    projections: List[ScenarioProjection] = Field(..., description="Timeline projections for 2025..2050")
    cumulative_permanence_risk_2050_pct: float = Field(
        ..., description="Total projected cumulative permanence risk by 2050 (%)"
    )
    buffer_adequacy_status: Literal["ADEQUATE", "DEFICIT"] = Field(
        ..., description="Whether the 15% permanence buffer pool withstands 2050 losses"
    )
    recommended_buffer_rate_pct: float = Field(
        ..., description="Actuarially recommended permanence buffer pool deduction rate (%)"
    )


class ClimateRiskRequest(BaseModel):
    """Request payload for CMIP6 climate risk projections to 2050."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(default=None, description="Preset site ID")
    polygon_geojson: Optional[Union[Dict[str, Any], Any]] = Field(
        default=None, description="Custom GeoJSON polygon geometry or feature"
    )
    buffer_reserve_pct: float = Field(
        default=15.0, ge=5.0, le=50.0, description="Project permanence buffer pool allocation rate (%)"
    )

    @model_validator(mode="before")
    @classmethod
    def handle_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "polygon" in d and "polygon_geojson" not in d:
            d["polygon_geojson"] = d["polygon"]
        return d


class ClimateRiskResponse(BaseModel):
    """Result of CMIP6 2050 climate risk stress testing across SSP2-4.5 and SSP5-8.5."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(default=None, description="Assessed site identifier")
    scenarios: Dict[str, ClimateScenarioResult] = Field(
        ..., description="Trajectories for SSP2-4.5 and SSP5-8.5"
    )
    buffer_pool_adequacy_2050: str = Field(
        ..., description="Overall 2050 buffer solvency verdict (e.g. ADEQUATE_UNDER_SSP245_DEFICIT_UNDER_SSP585)"
    )
    baseline_year: int = Field(default=2025, description="Projection starting baseline year")
    horizon_year: int = Field(default=2050, description="Long-term permanence evaluation horizon")
    executive_summary: str = Field(..., description="Actionable institutional summary for carbon investors")
    calculation_hash: Optional[str] = Field(default=None, description="SHA-256 audit hash")
