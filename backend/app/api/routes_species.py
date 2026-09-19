"""backend/app/api/routes_species.py

REST API Endpoint for AI Tree Species Classification & Adaptive Carbon Fraction:
- POST /api/species/classify
"""

from __future__ import annotations

from typing import Any, Dict, Union
from fastapi import APIRouter, HTTPException, status

from backend.app.core.species import classify_forest_species
from backend.app.schemas.species import (
    SpeciesClassificationRequest,
    SpeciesClassificationResponse,
)

router = APIRouter(prefix="/species", tags=["AI Tree Species Classifier"])


@router.post(
    "/classify",
    response_model=SpeciesClassificationResponse,
    summary="Classify tree species composition and compute adaptive carbon fraction",
    description=(
        "Executes Sentinel-2 6-band multispectral reflectance classification with SCL cloud masking. "
        "Separates coniferous (CF=0.51), small-leaved deciduous (CF=0.45), and broadleaved (CF=0.47) "
        "canopy shares, and outputs dynamic adaptive carbon fraction bounded in [0.45, 0.51]."
    ),
)
def classify_species(
    request: Union[SpeciesClassificationRequest, Dict[str, Any]],
) -> SpeciesClassificationResponse:
    try:
        return classify_forest_species(request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Species classification failed: {str(exc)}",
        ) from exc
