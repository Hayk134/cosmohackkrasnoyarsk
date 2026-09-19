"""backend/app/api/routes_passport.py

REST API Endpoints for Module 8: Public Green Passport & Cryptographic Verification.
- GET /api/passport/{site_id}: Retrieve or generate Green Passport certificate for a project site.
- POST /api/passport/generate: Generate official Green Passport for arbitrary custom polygons or calculation results.
- GET /api/passport/verify: Public verification endpoint to audit certificate hash and digital signature.
- POST /api/passport/verify: Programmatic verification endpoint for registry nodes and smart contracts.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Union

from fastapi import APIRouter, HTTPException, Query, status

from backend.app.api.routes_sites import SITE_METADATA, load_preset_sites
from backend.app.core.passport import (
    PRESET_BENCHMARKS,
    generate_green_passport,
    verify_passport,
)
from backend.app.schemas.passport import (
    GreenPassportResponse,
    PassportGenerateRequest,
    PassportVerificationRequest,
    PassportVerificationResponse,
)

router = APIRouter(tags=["Compliance & Green Passport"])


@router.get(
    "/passport/{site_id}",
    response_model=GreenPassportResponse,
    summary="Fetch or generate Green Passport for a project site",
)
def get_site_passport(site_id: str) -> GreenPassportResponse:
    """Returns authoritative Green Passport digital certificate for a site.

    Includes exact WGS84 area, verified carbon units Q, buffer reserve B,
    cryptographic SHA-256 calculation seal, HMAC-SHA256 digital signature,
    ESG co-benefits ratings, and dynamic vector SVG QR code payload.
    """
    clean_id = site_id.strip()
    preset_keys = set(PRESET_BENCHMARKS.keys()) | {s.id for s in load_preset_sites()}

    if clean_id not in preset_keys:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Site '{clean_id}' not found. Available preset sites: {sorted(list(preset_keys))}",
        )

    site_meta = SITE_METADATA.get(clean_id, {})
    site_name = site_meta.get("name")

    return generate_green_passport(
        site_id=clean_id,
        site_name=site_name,
    )


@router.post(
    "/passport/generate",
    response_model=GreenPassportResponse,
    summary="Generate Green Passport for custom polygon or calculation result",
)
def generate_custom_passport(request: Union[PassportGenerateRequest, Dict[str, Any]]) -> GreenPassportResponse:
    """Generates official Green Passport certificate for custom user polygon or precomputed result."""
    if hasattr(request, "model_dump"):
        data = request.model_dump()
    elif isinstance(request, dict):
        data = request
    else:
        data = {}

    site_id = data.get("site_id") or "CUSTOM_POLYGON"
    polygon = data.get("polygon") or data.get("custom_polygon") or data.get("geojson")
    site_name = data.get("site_name") or data.get("project_name")
    monitoring_period = data.get("monitoring_period") or "2019–2024"
    calc_result = data.get("calculation_result")

    return generate_green_passport(
        site_id=site_id,
        polygon=polygon,
        site_name=site_name,
        monitoring_period=monitoring_period,
        calculation_result=calc_result,
    )


@router.get(
    "/passport/verify",
    response_model=PassportVerificationResponse,
    summary="Public verification endpoint auditing passport authenticity",
)
def verify_passport_public(
    id: Optional[str] = Query(None, description="Passport serial ID"),
    passport_id: Optional[str] = Query(None, description="Alias for id"),
    hash: Optional[str] = Query(None, description="SHA-256 calculation seal"),
    calculation_hash: Optional[str] = Query(None, description="Alias for hash"),
    sig: Optional[str] = Query(None, description="HMAC-SHA256 digital signature token"),
    digital_signature: Optional[str] = Query(None, description="Alias for sig"),
    site_id: Optional[str] = Query(None, description="Site identifier"),
) -> PassportVerificationResponse:
    """Verifies passport integrity by checking SHA-256 calculation seal and HMAC digital signature.

    Can be verified by:
    - Serial ID (e.g. `GP-RU-RU_TVER_01-20260919-A4F98B`)
    - Calculation hash
    - Digital signature token
    """
    resolved_id = id or passport_id
    resolved_hash = hash or calculation_hash
    resolved_sig = sig or digital_signature

    return verify_passport(
        passport_id=resolved_id,
        calculation_hash=resolved_hash,
        digital_signature=resolved_sig,
        site_id=site_id,
    )


@router.post(
    "/passport/verify",
    response_model=PassportVerificationResponse,
    summary="Programmatic verification endpoint for registry systems",
)
def verify_passport_post(request: PassportVerificationRequest) -> PassportVerificationResponse:
    """Validates passport integrity from JSON request payload."""
    return verify_passport(
        passport_id=request.passport_id,
        calculation_hash=request.calculation_hash,
        digital_signature=request.digital_signature,
        site_id=request.site_id,
    )
