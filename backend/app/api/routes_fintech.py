"""backend/app/api/routes_fintech.py

REST API Endpoints for FinTech & Financial Engineering:
- POST /api/roi: Comprehensive Carbon ROI, CAPEX/OPEX, DCF, NPV, IRR, and Timber Comparison.
"""

from __future__ import annotations

from typing import Any, Dict, Union

from fastapi import APIRouter, HTTPException, status

from backend.app.api.routes_sites import load_preset_sites
from backend.app.core.fintech import compute_fintech_roi
from backend.app.schemas.fintech import ROIRequest, ROIResponse

router = APIRouter(tags=["FinTech & Financial Engineering"])


@router.post(
    "/roi",
    response_model=ROIResponse,
    summary="Carbon Project ROI, DCF, NPV, IRR & Timber Harvest Comparison",
    description=(
        "Computes full annual cash flow schedule (Years 0..T), discounted cash flows (DCF), "
        "Net Present Value (NPV), Internal Rate of Return (IRR), discounted and simple payback "
        "break-even periods, multi-scenario sensitivity (500, 1500, 4000 RUB/t CO2e), and "
        "an analytical 15-year comparative valuation against commercial timber harvesting "
        "including closed-form Carbon Parity Price under Russian Forestry Code (Art 63.1 LK RF)."
    ),
)
def calculate_roi(request: Union[ROIRequest, Dict[str, Any]]) -> ROIResponse:
    """Calculates project ROI, DCF, NPV, IRR, break-even payback, and timber comparison."""
    if isinstance(request, dict):
        try:
            req = ROIRequest(**request)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid ROI calculation request: {str(exc)}",
            )
    else:
        req = request

    # Auto-seed area from preset site if site_id provided and area is default or unseeded
    if req.site_id:
        preset_sites = {s.id: s for s in load_preset_sites()}
        if req.site_id not in preset_sites:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Site '{req.site_id}' not found. Available preset sites: {list(preset_sites.keys())}",
            )

    if req.area_ha <= 0.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Project surface area must be positive (received {req.area_ha} ha).",
        )

    try:
        response = compute_fintech_roi(req)
        return response
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error executing FinTech ROI calculation: {str(exc)}",
        )
