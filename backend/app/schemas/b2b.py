"""backend/app/schemas/b2b.py

Centralized exports of all Pydantic v2 schemas for Kosmo·MRV Institutional B2B Suite:
- FinTech & ROI (backend.app.schemas.fintech)
- Parametric Insurance (backend.app.schemas.insurance)
- Dynamic Baseline Matching (backend.app.schemas.baseline)
- AI Tree Species & Adaptive CF (backend.app.schemas.species)
- Fire Radar & Sentinel-1 SAR (backend.app.schemas.radar)
- CMIP6 Climate Risk Projections (backend.app.schemas.climate)
- AI Land Scout for Carbon Farms (backend.app.schemas.land_scout)
- Public Green Passport & Compliance (backend.app.schemas.passport)
"""

from backend.app.schemas.passport import (
    ESGCoBenefits,
    GreenPassportResponse,
    PassportGenerateRequest,
    PassportVerificationRequest,
    PassportVerificationResponse,
)

from backend.app.schemas.baseline import (
    BaselineMatchingRequest,
    BaselineMatchingResponse,
    ReferenceComparisonResponse,
)
from backend.app.schemas.climate import (
    ClimateRiskRequest,
    ClimateRiskResponse,
    ClimateScenarioResult,
    ScenarioProjection,
)
from backend.app.schemas.fintech import (
    AnnualCashFlow,
    ROIRequest,
    ROIResponse,
    ROIScenarioMetrics,
    TimberComparisonResult,
    TimberScenarioParams,
)
from backend.app.schemas.insurance import (
    BufferPoolStatusResponse,
    InsuranceClaimRequest,
    InsuranceClaimResponse,
    InsuranceEvaluationRequest,
    InsuranceEvaluationResponse,
)
from backend.app.schemas.land_scout import (
    LandScoutRequest,
    LandScoutResponse,
)
from backend.app.schemas.radar import (
    FIRMSAlertsResponse,
    HotspotAlert,
    SARMonitoringRequest,
    SARMonitoringResponse,
)
from backend.app.schemas.species import (
    SpeciesClassificationRequest,
    SpeciesClassificationResponse,
)

__all__ = [
    # FinTech
    "ROIRequest",
    "ROIResponse",
    "ROIScenarioMetrics",
    "AnnualCashFlow",
    "TimberScenarioParams",
    "TimberComparisonResult",
    # Insurance
    "InsuranceEvaluationRequest",
    "InsuranceEvaluationResponse",
    "InsuranceClaimRequest",
    "InsuranceClaimResponse",
    "BufferPoolStatusResponse",
    # Baseline
    "BaselineMatchingRequest",
    "BaselineMatchingResponse",
    "ReferenceComparisonResponse",
    # Species
    "SpeciesClassificationRequest",
    "SpeciesClassificationResponse",
    # Radar
    "HotspotAlert",
    "FIRMSAlertsResponse",
    "SARMonitoringRequest",
    "SARMonitoringResponse",
    # Climate
    "ScenarioProjection",
    "ClimateScenarioResult",
    "ClimateRiskRequest",
    "ClimateRiskResponse",
    # Land Scout
    "LandScoutRequest",
    "LandScoutResponse",
    # Compliance & Green Passport
    "ESGCoBenefits",
    "GreenPassportResponse",
    "PassportVerificationRequest",
    "PassportVerificationResponse",
    "PassportGenerateRequest",
]
