"""backend/app/schemas/land_scout.py

Pydantic v2 Schemas for Kosmo·MRV AI Land Scout for Carbon Farms:
- Multi-factor Land Suitability Index (LSI in [0, 100])
- Pre-feasibility 15-Year Financial & Carbon Sequestration Modeling (/api/land-scout/evaluate)
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator


class LandScoutRequest(BaseModel):
    """Request payload for evaluating abandoned agricultural land suitability."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    polygon_geojson: Optional[Union[Dict[str, Any], Any]] = Field(
        default=None, description="Custom GeoJSON polygon boundary of candidate land tract"
    )
    site_id: Optional[str] = Field(
        default=None, description="Preset site ID if evaluating a known territory"
    )
    target_species: str = Field(
        default="PINE_SPRUCE", description="Planned afforestation species (PINE_SPRUCE, BIRCH, OAK_MIX)"
    )
    seedling_cost_rub_ha: float = Field(
        default=75000.0, ge=1000.0, description="Afforestation planting CAPEX per hectare in RUB"
    )
    carbon_price_rub: float = Field(
        default=1500.0, gt=0, description="Carbon unit valuation scenario in RUB/t CO2e"
    )
    discount_rate: float = Field(
        default=0.12, ge=0.01, le=0.50, description="Annual financial discount rate"
    )
    opex_per_ha_yr: float = Field(
        default=3500.0, ge=0.0, description="Annual maintenance and monitoring OPEX per ha in RUB"
    )

    @model_validator(mode="before")
    @classmethod
    def handle_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "polygon" in d and "polygon_geojson" not in d:
            d["polygon_geojson"] = d["polygon"]
        if "capex_per_ha" in d and "seedling_cost_rub_ha" not in d:
            d["seedling_cost_rub_ha"] = d["capex_per_ha"]
        return d


class LandScoutResponse(BaseModel):
    """Evaluation result for candidate carbon farm parcel."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    land_suitability_index: float = Field(
        ..., ge=0.0, le=100.0, description="Composite Land Suitability Index (LSI in [0, 100])"
    )
    recommendation: Literal["HIGH_POTENTIAL", "MODERATE", "NOT_RECOMMENDED"] = Field(
        ..., description="Afforestation potential categorization"
    )
    area_ha: float = Field(..., description="Evaluated parcel surface area in hectares (WGS84)")
    annual_carbon_sequestration_t_ha_yr: float = Field(
        ..., description="Projected mean annual carbon sequestration rate (t CO2e/ha/yr)"
    )
    fifteen_yr_tradable_credits_est: int = Field(
        ..., description="Estimated 15-year tradable carbon units Q_15 after 15% permanence buffer"
    )
    estimated_npv_rub: float = Field(
        ..., description="15-year pre-feasibility Net Present Value in RUB"
    )
    fire_risk_penalty: float = Field(
        ..., ge=0.0, description="Deduction penalty applied for historical fire recurrence"
    )
    component_scores: Dict[str, float] = Field(
        ..., description="Detailed breakdown: bioclimatic, sequestration, water, infrastructure, fire"
    )
    estimated_capex_rub: float = Field(..., description="Initial planting and fencing capital expenditure (RUB)")
    estimated_15yr_revenue_rub: float = Field(..., description="Gross undiscounted 15-year carbon unit revenue (RUB)")
    simple_payback_years: Optional[float] = Field(
        default=None, description="Simple payback period in years"
    )
    target_species: str = Field(default="PINE_SPRUCE", description="Target species evaluated")
    calculation_hash: Optional[str] = Field(default=None, description="SHA-256 audit seal")
