"""backend/app/api/routes_climate.py

REST API Endpoint for CMIP6 Climate Risk Projections to 2050:
- POST /api/climate-risks
"""

from __future__ import annotations

from typing import Any, Dict, Union
from fastapi import APIRouter, HTTPException, status

from backend.app.core.climate_risks import project_climate_risks_to_2050
from backend.app.schemas.climate import (
    ClimateRiskRequest,
    ClimateRiskResponse,
)

router = APIRouter(prefix="/climate-risks", tags=["Climate Risk Projections to 2050"])


@router.post(
    "",
    response_model=ClimateRiskResponse,
    summary="Project long-term CMIP6 climate risks and stress-test buffer pool solvency to 2050",
    description=(
        "Simulates IPCC CMIP6 climate trajectories under SSP2-4.5 (moderate) and SSP5-8.5 (extreme) "
        "emission pathways across 2025-2050. Evaluates Nesterov fire hazard multipliers, SPEI drought "
        "severity anomalies, annual mortality rates, and permanence buffer pool solvency."
    ),
)
def evaluate_climate_risks(
    request: Union[ClimateRiskRequest, Dict[str, Any]],
) -> ClimateRiskResponse:
    try:
        return project_climate_risks_to_2050(request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Climate risk projection failed: {str(exc)}",
        ) from exc
