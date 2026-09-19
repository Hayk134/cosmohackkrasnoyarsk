"""backend/app/api/routes_insurance.py

REST API Endpoints for Parametric Smart-Insurance:
- POST /api/insurance/evaluate: Evaluate parametric burn scar trigger condition (>10.0%).
- POST /api/insurance/claim: Settle parametric smart-insurance claim with buffer pool debit.
- GET /api/insurance/buffer-pool: Retrieve buffer pool balance and solvency metrics.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Union

from fastapi import APIRouter, HTTPException, Query, status

from backend.app.core.insurance import (
    evaluate_parametric_trigger,
    execute_insurance_claim,
    get_buffer_pool_status,
)
from backend.app.schemas.insurance import (
    BufferPoolStatusResponse,
    InsuranceClaimRequest,
    InsuranceClaimResponse,
    InsuranceEvaluationRequest,
    InsuranceEvaluationResponse,
)

router = APIRouter(prefix="/insurance", tags=["Parametric Smart-Insurance"])


@router.post(
    "/evaluate",
    response_model=InsuranceEvaluationResponse,
    summary="Evaluate Parametric Wildfire Insurance Trigger",
    description=(
        "Performs automated diagnostic evaluation of the parametric smart-insurance trigger condition. "
        "Extracts real MODIS MCD64A1 burn scar and Sentinel-2 dNBR telemetry. The trigger fires if "
        "burned area strictly exceeds 10.0% of the total polygon surface area. Calculates proportional "
        "credit impairment, available 15% permanence buffer pool backing, and estimated RUB payout."
    ),
)
def evaluate_insurance(
    request: Union[InsuranceEvaluationRequest, Dict[str, Any]],
) -> InsuranceEvaluationResponse:
    """Evaluates whether satellite fire telemetry satisfies parametric insurance policy trigger."""
    if isinstance(request, dict):
        try:
            req = InsuranceEvaluationRequest(**request)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid insurance evaluation request: {str(exc)}",
            )
    else:
        req = request

    try:
        response = evaluate_parametric_trigger(req)
        return response
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error evaluating parametric insurance trigger: {str(exc)}",
        )


@router.post(
    "/claim",
    response_model=InsuranceClaimResponse,
    summary="Submit and Settle Parametric Smart-Insurance Claim",
    description=(
        "Formally executes settlement of a parametric insurance claim backed by the 15% permanence "
        "buffer pool reserve. Automatically validates satellite disturbance telemetry, debits damaged "
        "credits from the buffer pool, transfers monetary compensation in RUB, and generates a "
        "cryptographic HMAC-SHA256 audit seal for legal enforceability."
    ),
)
def submit_insurance_claim(
    request: Union[InsuranceClaimRequest, Dict[str, Any]],
) -> InsuranceClaimResponse:
    """Processes formal parametric insurance claim execution and buffer pool debit."""
    if isinstance(request, dict):
        try:
            req = InsuranceClaimRequest(**request)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid insurance claim request: {str(exc)}",
            )
    else:
        req = request

    try:
        response = execute_insurance_claim(req)
        return response
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error settling parametric insurance claim: {str(exc)}",
        )


@router.get(
    "/buffer-pool",
    response_model=BufferPoolStatusResponse,
    summary="Buffer Pool Capital Reserve & Actuarial Solvency Audit",
    description=(
        "Retrieves real-time permanence buffer pool reserve balances across all insured sites, "
        "historical claim disbursement totals, systemic solvency ratio, and monetary capitalization "
        "under 500, 1500, and 4000 RUB/unit carbon price scenarios."
    ),
)
def get_buffer_pool(
    site_id: Optional[str] = Query(
        default=None,
        description="Optional site identifier to filter buffer pool balance for a specific project.",
    ),
) -> BufferPoolStatusResponse:
    """Returns current buffer pool reserve status and solvency breakdown."""
    try:
        response = get_buffer_pool_status(site_id=site_id)
        return response
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving buffer pool status: {str(exc)}",
        )
