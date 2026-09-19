"""backend/app/schemas/radar.py

Pydantic v2 Schemas for Kosmo·MRV Radar Early Warning & Cloud Penetration Engine:
- NASA FIRMS Thermal Anomalies Telemetry (/api/radar/firms-alerts)
- Sentinel-1 SAR C-band Coherence & Backscatter Monitoring (/api/radar/sar-monitoring)
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator


class HotspotAlert(BaseModel):
    """Telemetry record for an individual active thermal hotspot detected by FIRMS (MODIS/VIIRS)."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    latitude: float = Field(..., description="Hotspot centroid latitude (WGS84)")
    longitude: float = Field(..., description="Hotspot centroid longitude (WGS84)")
    brightness_temp_kelvin: float = Field(..., description="Sensor brightness temperature in Kelvin")
    confidence_pct: float = Field(..., ge=0.0, le=100.0, description="Detection confidence percentage (%)")
    distance_km: float = Field(..., ge=0.0, description="Geodesic distance to project polygon perimeter (km)")
    bearing_deg: float = Field(..., ge=0.0, le=360.0, description="Forward azimuth bearing in degrees (0=N, 90=E)")
    cardinal_direction: str = Field(..., description="Compass cardinal direction (e.g. N, NE, E, SE, S, SW, W, NW)")
    alert_level: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"] = Field(
        ..., description="Tier: CRITICAL <5km, HIGH <15km, MEDIUM <30km, LOW >=30km"
    )
    detection_timestamp: str = Field(..., description="Acquisition ISO-8601 timestamp")
    sensor: str = Field(default="VIIRS/MODIS", description="Satellite sensor source")


class FIRMSAlertsResponse(BaseModel):
    """Summary of active wildfire telemetry within the surveillance zone."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(default=None, description="Monitored site identifier")
    target_lat: float = Field(..., description="Center latitude of query region")
    target_lon: float = Field(..., description="Center longitude of query region")
    surveillance_radius_km: float = Field(default=50.0, description="Radial search buffer in kilometers")
    hotspots_detected: int = Field(..., ge=0, description="Number of active hotspots identified")
    closest_distance_km: float = Field(..., ge=0.0, description="Proximity to nearest thermal anomaly (km)")
    max_confidence_pct: float = Field(..., ge=0.0, le=100.0, description="Maximum hotspot confidence detected (%)")
    threat_level: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "SAFE"] = Field(
        ..., description="Overall fire threat assessment"
    )
    alerts: List[HotspotAlert] = Field(default_factory=list, description="List of individual active hotspot alerts")


class SARMonitoringRequest(BaseModel):
    """Request payload for all-weather Sentinel-1 C-band SAR disturbance analysis."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(default=None, description="Preset site ID")
    polygon_geojson: Optional[Union[Dict[str, Any], Any]] = Field(
        default=None, description="Custom GeoJSON polygon geometry or feature"
    )
    start_date: Optional[str] = Field(default=None, description="Pre-event baseline SAR date")
    end_date: Optional[str] = Field(default=None, description="Post-event target SAR date")

    @model_validator(mode="before")
    @classmethod
    def handle_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "polygon" in d and "polygon_geojson" not in d:
            d["polygon_geojson"] = d["polygon"]
        return d


class SARMonitoringResponse(BaseModel):
    """Result of radar cloud-penetration disturbance monitoring."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    site_id: Optional[str] = Field(default=None, description="Monitored site identifier")
    cloud_penetration_status: str = Field(
        default="PENETRATING_OVERCAST", description="Operating radar atmospheric penetration status"
    )
    optical_cloud_blind_days_avoided: int = Field(
        ..., description="Number of days optical Sentinel-2 was blinded by overcast skies but SAR succeeded"
    )
    all_weather_coverage_pct: float = Field(
        default=100.0, description="Radar temporal spatial coverage percentage (100.0% through clouds/fog/smoke)"
    )
    backscatter_delta_vh_db: float = Field(
        ..., description="Cross-polarization backscatter change delta_sigma0_VH in dB (disturbed if <= -3.0 dB)"
    )
    coherence_delta: float = Field(
        ..., description="Interferometric InSAR coherence surge delta_gamma (disturbed if >= +0.35)"
    )
    disturbance_detected: bool = Field(
        ..., description="True if radar signatures confirm forest canopy logging/collapse under overcast skies"
    )
    confidence: float = Field(..., ge=0.0, le=1.0, description="Radar analytical confidence score")
    detected_clear_cuts_ha: float = Field(..., ge=0.0, description="Estimated canopy disturbance area in hectares")
    recommendation: str = Field(..., description="Actionable verification recommendation")
    calculation_hash: Optional[str] = Field(default=None, description="SHA-256 audit hash")
