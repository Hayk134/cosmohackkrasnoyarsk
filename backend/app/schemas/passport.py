"""backend/app/schemas/passport.py

Pydantic v2 schemas for Module 8: Public Green Passport & Verification:
- GreenPassportResponse: Official tamper-evident Green Passport certificate
- PassportVerificationRequest: Request payload for verifying passport authenticity
- PassportVerificationResponse: Verification report confirming SHA-256 seal and HMAC signature
- PassportGenerateRequest: Request to issue a passport for preset sites or custom polygons
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ESGCoBenefits(BaseModel):
    """ESG and environmental co-benefits evaluated for the forest project."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    wildfire_resistance: Dict[str, Any] = Field(
        default_factory=lambda: {
            "score": 88,
            "rating": "Высокая",
            "monitoring_system": "Sentinel-2 dNBR / MODIS MCD64A1 / FIRMS",
            "description": "Автоматизированный спутниковый контур раннего обнаружения гарей и термических аномалий",
        }
    )
    biodiversity_index: Dict[str, Any] = Field(
        default_factory=lambda: {
            "score": 92,
            "rating": "Высокий",
            "indicator": "Hansen GFC Canopy Density & Shannon Heterogeneity",
            "description": "Сохранение естественной мозаики таёжных и смешанных лесов с древесным покровом >75%",
        }
    )
    water_protection: Dict[str, Any] = Field(
        default_factory=lambda: {
            "score": 85,
            "rating": "Стабильный",
            "indicator": "NDWI / Водоохранная зона",
            "description": "Предотвращение эрозии водосборных бассейнов и стабилизация гидрологического баланса",
        }
    )
    integrity_rating: str = Field(default="AAA", description="ESG rating grade: AAA, AA, A, BBB")
    un_sdg_alignment: List[int] = Field(
        default_factory=lambda: [13, 15, 8, 6],
        description="United Nations Sustainable Development Goals (SDG 13, 15, 8, 6)",
    )
    additionality_verified: bool = Field(
        default=True, description="Confirmed counterfactual additionality"
    )


class GreenPassportResponse(BaseModel):
    """Authoritative digital Green Passport certificate payload with dynamic QR code."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    passport_id: str = Field(..., description="Unique passport serial or UUID (e.g. GP-RU-RU_TVER_01-20260919-A4F98B)")
    site_id: str = Field(..., description="Forest site identifier (e.g. RU_TVER_01)")
    site_name: str = Field(..., description="Official project site title")
    wgs84_area_ha: float = Field(..., description="Exact analytical WGS84 ellipsoidal area in hectares")
    verified_carbon_stock_removal_t_co2e: float = Field(
        ..., description="Gross or net verified carbon stock removals (t CO2e)"
    )
    tradable_units_q: int = Field(
        ..., description="Net tradable verified carbon credits Q"
    )
    verified_units_t_co2e: int = Field(
        ..., description="Alias/mirror for tradable carbon credits Q"
    )
    buffer_pool_reserve_units_b: int = Field(
        ..., description="Non-permanence buffer pool reserve units B (15%)"
    )
    buffer_units: int = Field(
        ..., description="Alias/mirror for buffer pool reserve units B"
    )
    monitoring_period: str = Field(
        default="2019–2024", description="Observation baseline and crediting interval"
    )
    standard: str = Field(
        default="GOST R ISO 14064-2:2019 / IPCC 2006 Tier 2",
        description="Applied climate standard and IPCC methodology",
    )
    esg_co_benefits: Dict[str, Any] = Field(
        default_factory=dict,
        description="ESG co-benefits (wildfire resistance, biodiversity index, water protection)",
    )
    esg_attributes: Dict[str, Any] = Field(
        default_factory=dict, description="Alias/mirror for esg_co_benefits"
    )
    issuance_timestamp: str = Field(..., description="ISO 8601 UTC timestamp of certificate issuance")
    issuance_date: str = Field(..., description="Alias/mirror for issuance_timestamp")
    valid_until: str = Field(..., description="ISO 8601 validity end date")
    calculation_hash: str = Field(
        ..., description="Cryptographic SHA-256 tamper-evident calculation seal"
    )
    digital_signature: str = Field(
        ..., description="HMAC-SHA256 digital signature token verifying authenticity"
    )
    qr_verification_url: str = Field(
        ..., description="Dynamic QR verification payload URL"
    )
    public_verification_url: Optional[str] = Field(
        default=None, description="Alias/mirror for qr_verification_url"
    )
    qr_code_svg: Optional[str] = Field(
        default=None, description="Standalone pure vector SVG QR code representation"
    )
    qr_code_svg_base64: Optional[str] = Field(
        default=None, description="Data URI base64-encoded SVG QR code"
    )

    @model_validator(mode="before")
    @classmethod
    def populate_mirrored_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Sync tradable units
            if "tradable_units_q" in data and "verified_units_t_co2e" not in data:
                data["verified_units_t_co2e"] = int(data["tradable_units_q"])
            elif "verified_units_t_co2e" in data and "tradable_units_q" not in data:
                data["tradable_units_q"] = int(data["verified_units_t_co2e"])

            # Sync buffer units
            if "buffer_pool_reserve_units_b" in data and "buffer_units" not in data:
                data["buffer_units"] = int(data["buffer_pool_reserve_units_b"])
            elif "buffer_units" in data and "buffer_pool_reserve_units_b" not in data:
                data["buffer_pool_reserve_units_b"] = int(data["buffer_units"])

            # Sync timestamps
            if "issuance_timestamp" in data and "issuance_date" not in data:
                data["issuance_date"] = str(data["issuance_timestamp"])
            elif "issuance_date" in data and "issuance_timestamp" not in data:
                data["issuance_timestamp"] = str(data["issuance_date"])

            # Sync ESG attributes
            if "esg_co_benefits" in data and not data.get("esg_attributes"):
                data["esg_attributes"] = data["esg_co_benefits"]
            elif "esg_attributes" in data and not data.get("esg_co_benefits"):
                data["esg_co_benefits"] = data["esg_attributes"]

            # Sync verification URLs
            if "qr_verification_url" in data and not data.get("public_verification_url"):
                data["public_verification_url"] = data["qr_verification_url"]
            elif "public_verification_url" in data and not data.get("qr_verification_url"):
                data["qr_verification_url"] = data["public_verification_url"]

        return data


class PassportVerificationRequest(BaseModel):
    """Request payload for public or automated passport verification."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    passport_id: Optional[str] = Field(default=None, description="Passport serial ID")
    calculation_hash: Optional[str] = Field(default=None, description="SHA-256 calculation seal")
    digital_signature: Optional[str] = Field(default=None, description="HMAC-SHA256 signature token")
    site_id: Optional[str] = Field(default=None, description="Site identifier")


class PassportVerificationResponse(BaseModel):
    """Verification outcome verifying SHA-256 seal and digital signature integrity."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    is_authentic: bool = Field(..., description="True if cryptographic seal and signature are authentic")
    is_valid: bool = Field(..., description="True if certificate is active, valid, and uncorrupted")
    verification_status: Literal["VERIFIED_VALID", "HASH_MISMATCH", "INVALID_SIGNATURE", "NOT_FOUND"] = Field(
        ..., description="Detailed verification status code"
    )
    passport_id: Optional[str] = Field(default=None, description="Verified passport ID")
    site_id: Optional[str] = Field(default=None, description="Site identifier")
    calculation_hash: Optional[str] = Field(default=None, description="Verified calculation seal")
    digital_signature: Optional[str] = Field(default=None, description="Verified digital signature")
    tradable_units_q: Optional[int] = Field(default=None, description="Verified tradable credits Q")
    verified_at: str = Field(..., description="Verification timestamp (ISO 8601 UTC)")
    signer_node: str = Field(default="KOSMO-MRV-REGISTRY-NODE-01", description="Attesting validator node")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Additional audit diagnostics")


class PassportGenerateRequest(BaseModel):
    """Payload to trigger dynamic Green Passport generation."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(default=None, description="Preset site ID (e.g. RU_TVER_01)")
    polygon: Optional[Union[Dict[str, Any], Any]] = Field(default=None, description="Custom GeoJSON polygon")
    site_name: Optional[str] = Field(default=None, description="Custom site or project name")
    monitoring_period: Optional[str] = Field(default="2019–2024", description="Observation interval")
    calculation_result: Optional[Dict[str, Any]] = Field(default=None, description="Precomputed calculation result")
