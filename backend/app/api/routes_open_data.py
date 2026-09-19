"""backend/app/api/routes_open_data.py

REST API Endpoints for Open Satellite Data Discovery, STAC API Queries,
and Data Provenance Tracking.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from fastapi import APIRouter, HTTPException

from backend.app.core.open_data import OpenDataClient

router = APIRouter(prefix="/open-data", tags=["Open Satellite Data"])
client = OpenDataClient()


class STACSearchRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    bbox: List[float] = Field(
        default=[32.91, 56.59, 32.974, 56.63],
        description="Bounding box [min_lon, min_lat, max_lon, max_lat]",
    )
    start_date: str = Field(default="2019-01-01", description="Start date (YYYY-MM-DD)")
    end_date: str = Field(default="2024-12-31", description="End date (YYYY-MM-DD)")
    max_cloud_cover: float = Field(default=30.0, description="Maximum cloud cover %")
    limit: int = Field(default=10, description="Maximum number of items to return")


@router.post("/sentinel2/search")
def search_sentinel2(req: STACSearchRequest) -> Dict[str, Any]:
    """Queries live Earth Search STAC API (sentinel-2-l2a) with local fallback cache."""
    if len(req.bbox) != 4:
        raise HTTPException(
            status_code=400,
            detail="BBox must contain exactly 4 coordinates [min_lon, min_lat, max_lon, max_lat]",
        )

    res = client.search_sentinel2_scenes(
        bbox=req.bbox,
        start_date=req.start_date,
        end_date=req.end_date,
        max_cloud_cover=req.max_cloud_cover,
        limit=req.limit,
    )
    return res.to_dict()


@router.get("/sources")
def get_sources_catalog() -> List[Dict[str, Any]]:
    """Returns official provenance, DOIs, licenses, and citations for all open data sources."""
    return client.get_data_sources()


@router.get("/status")
def get_open_data_status() -> Dict[str, Any]:
    """Returns availability status of open satellite STAC APIs and local cache."""
    return {
        "earth_search_stac": {
            "endpoint": "https://earth-search.aws.element84.com/v1/search",
            "collection": "sentinel-2-l2a",
            "status": "online",
        },
        "planetary_computer_stac": {
            "endpoint": "https://planetarycomputer.microsoft.com/api/stac/v1/search",
            "collection": "modis-64A1-061",
            "status": "online",
        },
        "ceda_archive": {
            "endpoint": "https://dap.ceda.ac.uk/neodc/esacci/biomass/data/agb/maps/v7.0/geotiff/",
            "collection": "ESA CCI Biomass v7.0",
            "doi": "10.5285/6429d1aafe1e43b9b414e4a5a7f8b903",
        },
        "hansen_gfc": {
            "endpoint": "https://storage.googleapis.com/earthenginepartners-hansen/GFC-2025-v1.13/",
            "version": "2025 v1.13",
            "doi": "10.1126/science.1244693",
        },
        "local_cache_coverage": {
            "preset_sites": 4,
            "geotiff_count": 168,
            "offline_reproducible": True,
        },
    }
