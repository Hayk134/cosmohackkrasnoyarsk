"""backend/app/schemas/species.py

Pydantic v2 Schemas for Kosmo·MRV AI Tree Species Classifier & Adaptive Carbon Fraction:
- Multispectral Sentinel-2 Forest Typing (/api/species/classify)
- Adaptive Carbon Fraction (CF in [0.45, 0.51])
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator


class SpeciesClassificationRequest(BaseModel):
    """Request payload for multispectral tree species classification."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(
        default=None, description="Preset site ID (e.g. RU_TVER_01, RU_MORDOVIA_03)"
    )
    polygon_geojson: Optional[Union[Dict[str, Any], Any]] = Field(
        default=None, description="Custom GeoJSON polygon geometry or feature"
    )
    scene_id: Optional[str] = Field(
        default=None, description="Optional specific Sentinel-2 scene identifier"
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


class SpeciesClassificationResponse(BaseModel):
    """Result of Sentinel-2 multispectral species classification and adaptive CF derivation."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(default=None, description="Classified project site ID if applicable")
    coniferous_share: float = Field(
        ..., ge=0.0, le=1.0, description="Fractional canopy area share of coniferous species (Pine, Spruce)"
    )
    small_leaved_share: float = Field(
        ..., ge=0.0, le=1.0, description="Fractional canopy area share of small-leaved deciduous (Birch, Aspen)"
    )
    broadleaved_share: float = Field(
        ..., ge=0.0, le=1.0, description="Fractional canopy area share of broadleaved hardwood species (Oak, Linden)"
    )
    adaptive_cf: float = Field(
        ..., ge=0.45, le=0.51, description="Dynamic carbon fraction CF = 0.51*s_conifer + 0.45*s_small + 0.47*s_broad"
    )
    default_cf: float = Field(
        default=0.47, description="IPCC default static carbon fraction (0.47 t C / t d.m.)"
    )
    cf_delta_percent: float = Field(
        ..., description="Percentage shift of adaptive CF relative to default 0.47 (%)"
    )
    dominant_species_group: Literal[
        "CONIFEROUS", "SMALL_LEAVED_DECIDUOUS", "BROADLEAVED"
    ] = Field(..., description="Highest-density taxonomic canopy group")
    confidence_score: float = Field(
        ..., ge=0.0, le=1.0, description="Classification statistical confidence index"
    )
    total_valid_pixels: int = Field(
        ..., ge=0, description="Count of clear, cloud-free canopy pixels evaluated"
    )
    carbon_effect_adjustment_pct: float = Field(
        ..., description="Net crediting yield percentage adjustment resulting from species-specific CF"
    )
    calculation_hash: Optional[str] = Field(default=None, description="Cryptographic SHA-256 audit seal")
