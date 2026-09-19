"""backend/app/api/routes_land_scout.py

REST API Endpoint for AI Land Scout for Carbon Farms:
- POST /api/land-scout/evaluate
"""

from __future__ import annotations

from typing import Any, Dict, Union
from fastapi import APIRouter, HTTPException, status

from backend.app.core.land_scout import evaluate_land_scout
from backend.app.schemas.land_scout import (
    LandScoutRequest,
    LandScoutResponse,
)

router = APIRouter(prefix="/land-scout", tags=["AI Land Scout for Carbon Farms"])


@router.post(
    "/evaluate",
    response_model=LandScoutResponse,
    summary="Evaluate abandoned land suitability, carbon sequestration potential, and 15-year financials",
    description=(
        "Executes 5-factor composite Land Suitability Index (LSI in [0, 100]) scoring based on "
        "bioclimatic productivity, sequestration rate potential, water accessibility, transport access, "
        "and fire risk penalty. Classifies into HIGH_POTENTIAL, MODERATE, or NOT_RECOMMENDED, and generates "
        "15-year pre-feasibility tradable carbon units, CAPEX, gross revenue, NPV, and payback period."
    ),
)
def evaluate_candidate_land(
    request: Union[LandScoutRequest, Dict[str, Any]],
) -> LandScoutResponse:
    try:
        return evaluate_land_scout(request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Land scout evaluation failed: {str(exc)}",
        ) from exc
