"""backend/app/api/routes_radar.py

REST API Endpoints for Fire Early Warning Radar & All-Weather SAR Monitoring:
- GET /api/radar/firms-alerts
- POST /api/radar/sar-monitoring
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Union
from fastapi import APIRouter, HTTPException, Query, status

from backend.app.core.radar import get_firms_hotspot_alerts, monitor_sar_disturbance
from backend.app.schemas.radar import (
    FIRMSAlertsResponse,
    SARMonitoringRequest,
    SARMonitoringResponse,
)

router = APIRouter(prefix="/radar", tags=["Fire Radar & Cloud Penetration"])


@router.get(
    "/firms-alerts",
    response_model=FIRMSAlertsResponse,
    summary="Get NASA FIRMS thermal anomaly telemetry and early fire threat alerts",
    description=(
        "Queries thermal anomaly detections from NASA FIRMS (MODIS/VIIRS) within the specified "
        "surveillance buffer radius. Returns geodesic distance, forward bearing, and tiered alert levels "
        "(CRITICAL <5km, HIGH <15km, MEDIUM <30km, LOW >=30km)."
    ),
)
def get_firms_alerts(
    site_id: Optional[str] = Query(
        default=None,
        description="Preset project site ID (e.g. RU_MORDOVIA_03, RU_TVER_01)",
    ),
    lat: Optional[float] = Query(default=None, description="Custom latitude coordinate (WGS84)"),
    lon: Optional[float] = Query(default=None, description="Custom longitude coordinate (WGS84)"),
    radius_km: float = Query(
        default=50.0, ge=1.0, le=500.0, description="Radial surveillance search buffer in kilometers"
    ),
) -> FIRMSAlertsResponse:
    try:
        return get_firms_hotspot_alerts(site_id=site_id, lat=lat, lon=lon, radius_km=radius_km)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"FIRMS alert retrieval failed: {str(exc)}",
        ) from exc


@router.post(
    "/sar-monitoring",
    response_model=SARMonitoringResponse,
    summary="Analyze all-weather Sentinel-1 C-band SAR backscatter and InSAR coherence",
    description=(
        "Detects forest canopy disturbances under heavy overcast skies and wildfire smoke where "
        "optical Sentinel-2 is blinded. Flags logging/collapse when cross-polarization backscatter "
        "drops by >=3.0 dB (delta VH <= -3.0 dB) or InSAR coherence surges by >=+0.35."
    ),
)
def monitor_sar(
    request: Union[SARMonitoringRequest, Dict[str, Any]],
) -> SARMonitoringResponse:
    try:
        return monitor_sar_disturbance(request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SAR monitoring execution failed: {str(exc)}",
        ) from exc
