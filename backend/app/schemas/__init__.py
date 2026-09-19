"""backend/app/schemas/__init__.py"""

from backend.app.schemas.mrv import (
    CalculationRequest,
    CalculationResponse,
    DisturbanceRequest,
    DisturbanceResponse,
    GeoJSONGeometry,
    PolygonValidationRequest,
    PolygonValidationResponse,
    ProjectionItem,
    RegistrySummary,
    ReportRequest,
    ReportResponse,
    SiteInfo,
    TimeseriesItem,
    TimeseriesRequest,
    TimeseriesResponse,
    TransactionRequest,
    TransactionResponse,
)
from backend.app.schemas.baseline import (
    BaselineMatchingRequest,
    BaselineMatchingResponse,
    ReferenceComparisonResponse,
)
from backend.app.schemas.species import (
    SpeciesClassificationRequest,
    SpeciesClassificationResponse,
)
from backend.app.schemas.radar import (
    FIRMSAlertsResponse,
    HotspotAlert,
    SARMonitoringRequest,
    SARMonitoringResponse,
)
from backend.app.schemas.climate import (
    ClimateRiskRequest,
    ClimateRiskResponse,
    ClimateScenarioResult,
    ScenarioProjection,
)
from backend.app.schemas.land_scout import (
    LandScoutRequest,
    LandScoutResponse,
)

__all__ = [
    "GeoJSONGeometry",
    "SiteInfo",
    "PolygonValidationRequest",
    "PolygonValidationResponse",
    "CalculationRequest",
    "CalculationResponse",
    "TimeseriesItem",
    "ProjectionItem",
    "TimeseriesRequest",
    "TimeseriesResponse",
    "DisturbanceRequest",
    "DisturbanceResponse",
    "ReportRequest",
    "ReportResponse",
    "TransactionRequest",
    "TransactionResponse",
    "RegistrySummary",
    # M-B2B-2 Schemas
    "BaselineMatchingRequest",
    "BaselineMatchingResponse",
    "ReferenceComparisonResponse",
    "SpeciesClassificationRequest",
    "SpeciesClassificationResponse",
    "HotspotAlert",
    "FIRMSAlertsResponse",
    "SARMonitoringRequest",
    "SARMonitoringResponse",
    "ScenarioProjection",
    "ClimateScenarioResult",
    "ClimateRiskRequest",
    "ClimateRiskResponse",
    "LandScoutRequest",
    "LandScoutResponse",
]
