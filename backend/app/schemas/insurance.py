"""backend/app/schemas/insurance.py

Pydantic v2 Schemas for Kosmo·MRV Parametric Smart-Insurance Module:
- Parametric Burn Trigger Evaluation (/api/insurance/evaluate)
- Smart-Insurance Claim Settlement (/api/insurance/claim)
- Permanence Buffer Pool Reserve & Solvency Audit (/api/insurance/buffer-pool)
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator


class InsuranceEvaluationRequest(BaseModel):
    """Request payload to evaluate parametric insurance trigger condition."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(
        default=None, description="Preset site ID (e.g. RU_MORDOVIA_03, RU_TVER_01)"
    )
    polygon_geojson: Optional[Union[Dict[str, Any], Any]] = Field(
        default=None, description="Custom GeoJSON polygon feature or geometry"
    )
    burn_threshold_percent: float = Field(
        default=10.0, ge=0.1, le=90.0, description="Parametric trigger threshold in percent (default 10.0%)"
    )
    carbon_price_rub: float = Field(
        default=1500.0, gt=0, description="Applied scenario carbon price in RUB/t CO2e (500, 1500, 4000)"
    )

    @model_validator(mode="before")
    @classmethod
    def handle_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "polygon" in d and "polygon_geojson" not in d:
            d["polygon_geojson"] = d["polygon"]
        if "burn_threshold_pct" in d and "burn_threshold_percent" not in d:
            d["burn_threshold_percent"] = d["burn_threshold_pct"]
        if "carbon_price_scenario" in d and "carbon_price_rub" not in d:
            d["carbon_price_rub"] = d["carbon_price_scenario"]
        return d


class InsuranceEvaluationResponse(BaseModel):
    """Diagnostic evaluation of parametric trigger without state mutation."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(default=None, description="Project site identifier")
    polygon_area_ha: float = Field(..., description="Total verified WGS84 polygon area in hectares")
    area_ha: float = Field(..., description="WGS84 polygon area in ha (alias)")
    burn_area_ha: float = Field(..., description="Detected wildfire burn scar area in hectares")
    burn_percentage: float = Field(..., description="Burned area percentage of total polygon surface (%)")
    burned_fraction_pct: float = Field(..., description="Burned fraction percentage (alias)")
    burn_threshold_percent: float = Field(..., description="Configured trigger activation threshold (%)")
    trigger_activated: bool = Field(
        ..., description="True if burned percentage strictly exceeds the trigger threshold (> 10.0%)"
    )
    telemetry_source: str = Field(
        ..., description="Source satellite telemetry sensor (e.g. MODIS MCD64A1, Sentinel-2 dNBR)"
    )
    total_buffer_pool_units: int = Field(
        ..., description="Total available 15% permanence buffer pool units backing the site"
    )
    payout_eligible_units: int = Field(
        ..., description="Proportional credit impairment eligible for buffer pool indemnity"
    )
    payout_amount_rub: float = Field(
        ..., description="Total estimated insurance payout in RUB at the scenario price"
    )
    solvency_status: Literal["SOLVENT", "PARTIALLY_DEFICIT", "NORMAL_BELOW_TRIGGER"] = Field(
        ..., description="Buffer pool capital reserve solvency status"
    )
    status: Literal["TRIGGER_ACTIVATED", "NORMAL_BELOW_THRESHOLD", "NO_DISTURBANCE_DETECTED"] = Field(
        ..., description="Parametric evaluation categorical result"
    )
    calculation_hash: str = Field(
        ..., description="Deterministic SHA-256 cryptographic audit seal"
    )
    message: str = Field(..., description="Human-readable evaluation summary and telemetry explanation")


class InsuranceClaimRequest(BaseModel):
    """Request payload to submit and settle a parametric smart-insurance claim."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: str = Field(..., description="Target site identifier with active insurance policy")
    claimant_account: str = Field(
        default="ProjectProponent", description="Destination ledger account for indemnity credits"
    )
    carbon_price_rub: float = Field(
        default=1500.0, gt=0, description="Settlement valuation price (500, 1500, 4000 RUB/unit)"
    )
    burn_threshold_percent: float = Field(
        default=10.0, ge=0.1, le=90.0, description="Parametric threshold percentage"
    )
    incident_description: Optional[str] = Field(
        default="Catastrophic wildfire disturbance verified via satellite telemetry",
        description="Formal claim incident memorandum",
    )
    polygon_geojson: Optional[Union[Dict[str, Any], Any]] = Field(
        default=None, description="Optional custom GeoJSON polygon override"
    )

    @model_validator(mode="before")
    @classmethod
    def handle_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "carbon_price_scenario" in d and "carbon_price_rub" not in d:
            d["carbon_price_rub"] = d["carbon_price_scenario"]
        if "burn_threshold_pct" in d and "burn_threshold_percent" not in d:
            d["burn_threshold_percent"] = d["burn_threshold_pct"]
        if "polygon" in d and "polygon_geojson" not in d:
            d["polygon_geojson"] = d["polygon"]
        return d


class InsuranceClaimResponse(BaseModel):
    """Institutional claim receipt with deterministic SHA-256 seal and buffer debit."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    claim_id: str = Field(..., description="Unique immutable insurance claim serial identifier")
    status: Literal["APPROVED_AND_SETTLED", "REJECTED_THRESHOLD_NOT_MET", "SOLVENCY_EXCEEDED"] = Field(
        ..., description="Final claim settlement verdict"
    )
    site_id: str = Field(..., description="Insured project site ID")
    burn_area_ha: float = Field(..., description="Verified fire scar area in hectares")
    burned_area_ha: float = Field(..., description="Verified fire scar area in ha (alias)")
    burn_percentage: float = Field(..., description="Verified burned fraction percentage (%)")
    burned_fraction_pct: float = Field(..., description="Verified burned fraction % (alias)")
    credits_damaged: int = Field(..., description="Gross damaged carbon units caused by fire impairment")
    indemnity_credits_awarded: int = Field(
        ..., description="Net indemnity credits issued from the 15% permanence buffer pool"
    )
    payout_amount_rub: float = Field(
        ..., description="Financial compensation in RUB transferred to claimant"
    )
    payout_rub: float = Field(..., description="Payout in RUB (alias)")
    carbon_price_applied_rub: float = Field(
        ..., description="Carbon price applied for monetary settlement (RUB/unit)"
    )
    buffer_pool_initial_units: int = Field(
        ..., description="Buffer pool reserve units prior to claim settlement"
    )
    buffer_pool_remaining_units: int = Field(
        ..., description="Remaining buffer pool reserve units after indemnity debit"
    )
    claim_timestamp: str = Field(..., description="ISO 8601 UTC timestamp of claim execution")
    calculation_hash: str = Field(
        ..., description="Deterministic SHA-256 calculation seal over claim parameters"
    )
    cryptographic_audit_seal: str = Field(
        ..., description="Cryptographic HMAC/SHA-256 proof of claim authenticity and settlement"
    )
    message: str = Field(..., description="Settlement explanation and audit trail details")


class BufferPoolStatusResponse(BaseModel):
    """Stateful buffer pool reserve balance and system solvency audit."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(default=None, description="Filtered site ID, or None for system-wide")
    total_buffer_reserve_units: int = Field(
        ..., description="Total active units held in the 15% permanence buffer pool reserve"
    )
    buffer_pool_value_rub_500: float = Field(
        ..., description="Monetary capitalization of buffer reserve at 500 RUB/unit"
    )
    buffer_pool_value_rub_1500: float = Field(
        ..., description="Monetary capitalization of buffer reserve at 1,500 RUB/unit"
    )
    buffer_pool_value_rub_4000: float = Field(
        ..., description="Monetary capitalization of buffer reserve at 4,000 RUB/unit"
    )
    solvency_status: Literal["FULLY_SOLVENT", "PARTIALLY_COMMITTED", "CRITICAL_DEFICIT"] = Field(
        ..., description="Systemic solvency tier of the permanence buffer pool"
    )
    active_claims_count: int = Field(..., description="Number of approved parametric claims settled to date")
    total_claims_paid_units: int = Field(..., description="Cumulative buffer pool units disbursed to claimants")
    total_claims_paid_rub: float = Field(..., description="Cumulative monetary compensation disbursed in RUB")
    sites: Dict[str, Dict[str, Any]] = Field(
        ..., description="Detailed per-site buffer pool balance and claims history"
    )
