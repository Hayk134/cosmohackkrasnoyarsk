"""backend/app/api/routes_gost.py

REST API Endpoints for Module 9: Russian Federation Carbon Units Registry Export.
Complies with GOST R ISO 14064-2:2019 (ГОСТ Р ИСО 14064-2:2019) and Federal Law No. 296-FZ:
- GET /api/registry/export-gost?site_id=...&format=xml|json
  Returns downloadable XML/JSON attachment with Content-Disposition header.
- POST /api/registry/export-gost
  Exports compliance package for custom polygons or arbitrary calculation results.
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional, Union

from fastapi import APIRouter, HTTPException, Query, Response, status

from backend.app.api.routes_sites import SITE_METADATA, load_preset_sites
from backend.app.core.gost_export import (
    PRESET_BENCHMARKS,
    generate_gost_export_package,
)

router = APIRouter(tags=["Compliance & Registry Export"])


@router.get(
    "/registry/export-gost",
    summary="Export compliance submission package according to GOST R ISO 14064-2:2019",
    response_class=Response,
)
def export_gost_package_get(
    site_id: str = Query(..., description="Project site ID (e.g. RU_TVER_01)"),
    format: str = Query("xml", pattern="^(xml|json|XML|JSON)$", description="Export file format: xml or json"),
) -> Response:
    """Streams machine-readable export file compliant with GOST R ISO 14064-2:2019.

    Sets Content-Disposition attachment header and appropriate media type:
    - application/xml; charset=utf-8
    - application/json; charset=utf-8
    """
    clean_id = site_id.strip()
    preset_keys = set(PRESET_BENCHMARKS.keys()) | {s.id for s in load_preset_sites()}

    if clean_id not in preset_keys:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Site '{clean_id}' not found. Available preset sites: {sorted(list(preset_keys))}",
        )

    clean_fmt = format.lower().strip()
    content, media_type, filename = generate_gost_export_package(
        site_id=clean_id,
        export_format=clean_fmt,
    )

    return Response(
        content=content.encode("utf-8") if isinstance(content, str) else content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Standard-Compliance": "GOST-R-ISO-14064-2:2019",
            "X-Registry-Operator": "AO-Kontur",
        },
    )


@router.post(
    "/registry/export-gost",
    summary="Export compliance submission package for custom calculation results or polygon",
    response_class=Response,
)
def export_gost_package_post(
    payload: Optional[Dict[str, Any]] = None,
    format: str = Query("xml", pattern="^(xml|json|XML|JSON)$", description="Export file format: xml or json"),
) -> Response:
    """Generates machine-readable GOST R ISO 14064-2:2019 export for custom input data."""
    data = payload or {}

    site_id = data.get("site_id") or "CUSTOM_PROJECT"
    polygon = data.get("polygon") or data.get("custom_polygon") or data.get("geojson")
    calc_data = data.get("calculation_data") or data.get("calculation_result") or data.get("result")
    proponent_data = data.get("proponent") or data.get("proponent_data")
    export_fmt = data.get("format") or format or "xml"
    clean_fmt = str(export_fmt).lower().strip()

    content, media_type, filename = generate_gost_export_package(
        site_id=site_id,
        export_format=clean_fmt,
        polygon=polygon,
        calculation_data=calc_data,
        proponent_data=proponent_data,
    )

    return Response(
        content=content.encode("utf-8") if isinstance(content, str) else content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Standard-Compliance": "GOST-R-ISO-14064-2:2019",
            "X-Registry-Operator": "AO-Kontur",
        },
    )
