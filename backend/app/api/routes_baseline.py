"""backend/app/api/routes_baseline.py

REST API Endpoints for Dynamic Baseline Matching & Additionality Verification:
- POST /api/baseline/match
- GET /api/baseline/reference-comparison
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Union
from fastapi import APIRouter, HTTPException, Query, status

from backend.app.core.baseline_matcher import (
    get_preset_reference_comparison,
    match_baseline_sites,
)
from backend.app.schemas.baseline import (
    BaselineMatchingRequest,
    BaselineMatchingResponse,
    ReferenceComparisonResponse,
)

router = APIRouter(prefix="/baseline", tags=["Dynamic Baseline Matching"])


@router.post(
    "/match",
    response_model=BaselineMatchingResponse,
    summary="Match project forest against a synthetic control / mirror reference forest",
    description=(
        "Computes Mahalanobis/weighted similarity distance on initial 2019 AGB, "
        "pre-project trend (2015-2019), canopy cover, and disturbance history. "
        "Evaluates empirical additionality divergence and net carbon benefits."
    ),
)
def match_baseline(request: Union[BaselineMatchingRequest, Dict[str, Any]]) -> BaselineMatchingResponse:
    try:
        return match_baseline_sites(request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Baseline matching failed: {str(exc)}",
        ) from exc


@router.get(
    "/reference-comparison",
    response_model=ReferenceComparisonResponse,
    summary="Retrieve quick mirror reference comparison for a preset project site",
    description=(
        "Returns reference forest pairing details, geographical separation distance, "
        "historical trajectory correlation, and additionality verification summary."
    ),
)
def get_reference_comparison(
    site_id: str = Query(
        default="RU_MORDOVIA_03",
        description="Preset site ID (e.g. RU_MORDOVIA_03, RU_MORDOVIA_04, RU_TVER_01, RU_VOLOGDA_02)",
    ),
) -> ReferenceComparisonResponse:
    try:
        return get_preset_reference_comparison(site_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Reference comparison failed for site '{site_id}': {str(exc)}",
        ) from exc
