"""backend/app/api/routes_sites.py

Preset forest carbon project sites and custom GeoJSON polygon validation endpoints.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, HTTPException, status
from shapely.geometry import shape
from shapely.validation import make_valid

from backend.app.core.area import MAX_POLYGON_AREA_HA, wgs84_polygon_area_ha
from backend.app.schemas.mrv import (
    PolygonValidationRequest,
    PolygonValidationResponse,
    SiteInfo,
)

router = APIRouter(tags=["Sites"])

# Data directories resolution
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"

# Authoritative descriptive metadata for preset sites
SITE_METADATA: Dict[str, Dict[str, Any]] = {
    "RU_TVER_01": {
        "name": "Тверская область (Контрольный)",
        "region": "Тверская область",
        "role": "Контрольный участок",
        "project_status": "Действующий",
        "baseline_id": "HIST-AGB-2015-2019-v1",
        "year_start": 2019,
        "year_end": 2024,
    },
    "RU_VOLOGDA_02": {
        "name": "Вологодская область (Потери)",
        "region": "Вологодская область",
        "role": "Потери покрова",
        "project_status": "На проверке",
        "baseline_id": "HIST-AGB-2015-2019-v1",
        "year_start": 2019,
        "year_end": 2024,
    },
    "RU_MORDOVIA_03": {
        "name": "Республика Мордовия (Пожар 2021)",
        "region": "Республика Мордовия",
        "role": "Пожар 2021",
        "project_status": "Приостановлен",
        "baseline_id": "HIST-AGB-2015-2019-v1",
        "year_start": 2019,
        "year_end": 2024,
    },
    "RU_MORDOVIA_04": {
        "name": "Республика Мордовия (Ранняя потеря/пожар)",
        "region": "Республика Мордовия",
        "role": "Ранняя потеря и пожар",
        "project_status": "Приостановлен",
        "baseline_id": "HIST-AGB-2015-2019-v1",
        "year_start": 2019,
        "year_end": 2024,
    },
    "CHECK_TRANSFER_01": {
        "name": "Вологодская область (Подучасток передачи)",
        "region": "Вологодская область",
        "role": "Подучасток передачи прав",
        "project_status": "Действующий",
        "baseline_id": "HIST-AGB-2015-2019-v1",
        "year_start": 2020,
        "year_end": 2024,
    },
}

_cached_sites: Optional[List[SiteInfo]] = None


def load_preset_sites() -> List[SiteInfo]:
    """Loads preset sites from data/areas.geojson and data/sample_requests.geojson."""
    global _cached_sites
    if _cached_sites is not None:
        return _cached_sites

    sites: List[SiteInfo] = []

    # 1. Load primary 4 sites
    areas_path = DATA_DIR / "areas.geojson"
    if areas_path.exists():
        with open(areas_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            for feat in data.get("features", []):
                p = feat.get("properties", {})
                aid = p.get("aoi_id")
                geo = feat.get("geometry", {})
                if not aid or not geo:
                    continue
                area_ha = round(wgs84_polygon_area_ha(geo), 2)
                geom_shape = shape(geo)
                bounds = [round(b, 5) for b in geom_shape.bounds]
                meta = SITE_METADATA.get(aid, {})

                sites.append(
                    SiteInfo(
                        id=aid,
                        name=meta.get("name", aid),
                        area_ha=area_ha,
                        bounds=bounds,
                        geojson=geo,
                        region=meta.get("region"),
                        role=meta.get("role"),
                        project_status=meta.get("project_status"),
                        baseline_id=meta.get("baseline_id"),
                        year_start=meta.get("year_start", 2019),
                        year_end=meta.get("year_end", 2024),
                    )
                )

    # 2. Load CHECK_TRANSFER_01
    sample_path = DATA_DIR / "sample_requests.geojson"
    if sample_path.exists():
        with open(sample_path, "r", encoding="utf-8") as f:
            data2 = json.load(f)
            for feat in data2.get("features", []):
                p = feat.get("properties", {})
                req_id = p.get("request_id")
                geo = feat.get("geometry", {})
                if req_id == "CHECK_TRANSFER_01" and geo:
                    area_ha = round(wgs84_polygon_area_ha(geo), 2)
                    geom_shape = shape(geo)
                    bounds = [round(b, 5) for b in geom_shape.bounds]
                    meta = SITE_METADATA.get(req_id, {})

                    sites.append(
                        SiteInfo(
                            id=req_id,
                            name=meta.get("name", req_id),
                            area_ha=area_ha,
                            bounds=bounds,
                            geojson=geo,
                            region=meta.get("region"),
                            role=meta.get("role"),
                            project_status=meta.get("project_status"),
                            baseline_id=meta.get("baseline_id"),
                            year_start=meta.get("year_start", 2020),
                            year_end=meta.get("year_end", 2024),
                        )
                    )

    _cached_sites = sites
    return sites


@router.get("/sites", response_model=List[SiteInfo])
def get_sites() -> List[SiteInfo]:
    """Returns preset sites (RU_TVER_01, RU_VOLOGDA_02, RU_MORDOVIA_03, RU_MORDOVIA_04, CHECK_TRANSFER_01)
    with exact WGS84 area, bounds, and GeoJSON geometry.
    """
    return load_preset_sites()


@router.get("/sites/{site_id}", response_model=SiteInfo)
def get_site_by_id(site_id: str) -> SiteInfo:
    """Returns a specific preset site by its identifier."""
    sites = load_preset_sites()
    for s in sites:
        if s.id.lower() == site_id.lower():
            return s
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Site '{site_id}' not found. Available sites: {[s.id for s in sites]}",
    )


@router.post("/sites/validate", response_model=PolygonValidationResponse)
@router.post("/sites/validate-polygon", response_model=PolygonValidationResponse)
def validate_polygon(request: Union[PolygonValidationRequest, Dict[str, Any]]) -> PolygonValidationResponse:
    """Validates an arbitrary custom GeoJSON polygon, enforcing topological validity
    and the area <= 2000 ha (20 km²) limit.
    """
    if hasattr(request, "model_dump"):
        raw_req = request.model_dump()
    elif hasattr(request, "dict"):
        raw_req = request.dict()
    elif isinstance(request, dict):
        raw_req = request
    else:
        raw_req = {}

    geo = raw_req.get("geojson") if "geojson" in raw_req else raw_req
    if hasattr(geo, "model_dump"):
        geo = geo.model_dump()
    elif hasattr(geo, "dict"):
        geo = geo.dict()

    if isinstance(geo, dict) and geo.get("type") == "Feature":
        geo = geo.get("geometry", {})
    if hasattr(geo, "model_dump"):
        geo = geo.model_dump()

    if not isinstance(geo, dict) or not geo.get("coordinates"):
        return PolygonValidationResponse(
            is_valid=False,
            area_ha=0.0,
            blocking_reason="INVALID_GEOMETRY: Empty or missing coordinate ring",
            error="Missing GeoJSON geometry or coordinates.",
        )

    try:
        geom = shape(geo)
        if not geom.is_valid:
            geom = make_valid(geom)
        if geom.is_empty or geom.area <= 0:
            return PolygonValidationResponse(
                is_valid=False,
                area_ha=0.0,
                blocking_reason="INVALID_GEOMETRY: Zero or degenerate area",
                error="Polygon has zero or negative surface area.",
            )

        area_ha = round(wgs84_polygon_area_ha(geom), 4)
        bounds = [round(b, 5) for b in geom.bounds]

        if area_ha > MAX_POLYGON_AREA_HA:
            return PolygonValidationResponse(
                is_valid=False,
                area_ha=area_ha,
                bounds=bounds,
                blocking_reason=f"POLYGON_EXCEEDS_MAX_AREA: {area_ha:.2f} ha > {MAX_POLYGON_AREA_HA:.2f} ha (20 km² limit)",
                message=f"Polygon exceeds maximum allowed project size of {MAX_POLYGON_AREA_HA:.0f} ha.",
            )

        return PolygonValidationResponse(
            is_valid=True,
            area_ha=area_ha,
            bounds=bounds,
            message="Polygon is valid and conforms to size limits.",
        )
    except Exception as exc:
        return PolygonValidationResponse(
            is_valid=False,
            area_ha=0.0,
            blocking_reason=f"GEOMETRY_PARSING_ERROR: {str(exc)}",
            error=str(exc),
        )
