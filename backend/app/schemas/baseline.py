"""backend/app/schemas/baseline.py

Pydantic v2 Schemas for Kosmo·MRV Dynamic Baseline Matching & Additionality Divergence:
- Synthetic Control / Mirror Site Matching (/api/baseline/match)
- Preset Reference Comparison (/api/baseline/reference-comparison)
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator


class BaselineMatchingRequest(BaseModel):
    """Request payload for matching a project forest with a synthetic control / mirror reference forest."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(
        default=None, description="Project site ID (e.g. RU_MORDOVIA_03, RU_TVER_01)"
    )
    polygon_geojson: Optional[Union[Dict[str, Any], Any]] = Field(
        default=None, description="Custom GeoJSON polygon geometry or feature"
    )
    reference_site_id: Optional[str] = Field(
        default=None, description="Optional target reference mirror site ID (e.g. RU_MORDOVIA_04)"
    )
    buffer_radius_km: float = Field(
        default=10.0, ge=1.0, le=50.0, description="Annular buffer ring radius in km for non-preset polygons"
    )

    @model_validator(mode="before")
    @classmethod
    def handle_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "polygon" in d and "polygon_geojson" not in d:
            d["polygon_geojson"] = d["polygon"]
        if "project_site_id" in d and "site_id" not in d:
            d["site_id"] = d["project_site_id"]
        return d


class BaselineMatchingResponse(BaseModel):
    """Result of dynamic baseline synthetic control matching and additionality divergence."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    project_site_id: str = Field(..., description="Target project forest identifier")
    reference_site_id: str = Field(..., description="Matched mirror reference forest identifier")
    match_quality_score: float = Field(
        ..., ge=0.0, le=100.0, description="Mirror site similarity match quality Q_match in [0, 100]"
    )
    initial_biomass_diff_pct: float = Field(
        ..., description="Percentage difference in initial 2019 AGB between project and reference (%)"
    )
    project_agb_2019: float = Field(..., description="Project initial AGB in 2019 (t d.m./ha)")
    project_agb_2024: float = Field(..., description="Project final AGB in 2024 (t d.m./ha)")
    reference_agb_2019: float = Field(..., description="Reference initial AGB in 2019 (t d.m./ha)")
    reference_agb_2024: float = Field(..., description="Reference final AGB in 2024 (t d.m./ha)")
    project_delta_agb: float = Field(..., description="Project biomass change delta_AGB_P = AGB_2024 - AGB_2019")
    reference_delta_agb: float = Field(..., description="Reference biomass change delta_AGB_R = AGB_2024 - AGB_2019")
    additionality_net_t_ha: float = Field(
        ..., description="Empirical additionality divergence delta_AGB_P - delta_AGB_R (t d.m./ha)"
    )
    additionality_co2e_t: float = Field(
        ..., description="Net additionality climate benefit in tonnes of CO2 equivalent (t CO2e)"
    )
    divergence_ratio: float = Field(
        ..., description="Dynamic baseline trajectory divergence ratio delta = (AGB_P_2024/AGB_P_2019)/(AGB_R_2024/AGB_R_2019)"
    )
    verdict: Literal["ADDITIONALITY_VERIFIED", "NON_ADDITIONAL_RISK"] = Field(
        ..., description="Standard additionality verification determination"
    )
    similarity_distance: float = Field(..., description="Mahalanobis / Euclidean weighted feature distance D(P, R)")
    feature_weights: Dict[str, float] = Field(
        default_factory=lambda: {"agb_2019": 0.45, "trend_2015_2019": 0.25, "canopy_cover": 0.20, "disturbance": 0.10},
        description="Weights applied in matching distance function",
    )
    calculation_hash: Optional[str] = Field(default=None, description="SHA-256 audit hash")


class ReferenceComparisonResponse(BaseModel):
    """Summary of preset mirror reference forest pairings and baseline trajectories."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: str
    site_name: str
    reference_site_id: str
    reference_site_name: str
    distance_km: float
    historical_correlation: float
    additionality_status: str
    matching_summary: BaselineMatchingResponse
