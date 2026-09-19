"""backend/app/main.py

FastAPI Application Entry Point for KosmoHackathon 2026:
Satellite Verification of Forest Carbon Projects and Credit Issuance (MRV).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.routes_baseline import router as baseline_router
from backend.app.api.routes_climate import router as climate_router
from backend.app.api.routes_fintech import router as fintech_router
from backend.app.api.routes_gost import router as gost_router
from backend.app.api.routes_insurance import router as insurance_router
from backend.app.api.routes_land_scout import router as land_scout_router
from backend.app.api.routes_mrv import router as mrv_router
from backend.app.api.routes_passport import router as passport_router
from backend.app.api.routes_radar import router as radar_router
from backend.app.api.routes_raster import router as raster_router
from backend.app.api.routes_registry import router as registry_router
from backend.app.api.routes_report import router as report_router
from backend.app.api.routes_sites import router as sites_router
from backend.app.api.routes_species import router as species_router
from backend.app.api.routes_super_accuracy import router as accuracy_router
from backend.app.api.routes_open_data import router as open_data_router
from backend.app.api.routes_ai import router as ai_router
from backend.app.api.routes_stress_test import router as stress_test_router
from backend.app.config import load_parameters

app = FastAPI(
    title="Kosmo MRV Satellite Verification API",
    description=(
        "Production REST API for satellite verification of forest climate projects "
        "and carbon credit accounting using ESA CCI Biomass, Sentinel-2 L2A, MODIS MCD64A1, "
        "and Hansen Global Forest Change."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure Cross-Origin Resource Sharing (CORS) for Vite / React local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Bbox-West",
        "X-Bbox-South",
        "X-Bbox-East",
        "X-Bbox-North",
        "X-Bounding-Box",
    ],
)

# Register API Routers under /api
app.include_router(sites_router, prefix="/api")
app.include_router(mrv_router, prefix="/api")
app.include_router(raster_router, prefix="/api")
app.include_router(registry_router, prefix="/api")
app.include_router(report_router, prefix="/api")
app.include_router(fintech_router, prefix="/api")
app.include_router(insurance_router, prefix="/api")
app.include_router(baseline_router, prefix="/api")
app.include_router(species_router, prefix="/api")
app.include_router(radar_router, prefix="/api")
app.include_router(climate_router, prefix="/api")
app.include_router(land_scout_router, prefix="/api")
app.include_router(passport_router, prefix="/api")
app.include_router(gost_router, prefix="/api")
app.include_router(accuracy_router, prefix="/api")
app.include_router(open_data_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(stress_test_router, prefix="/api")


@app.get("/api/health", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check() -> Dict[str, Any]:
    """Service health and operational status check."""
    return {
        "status": "ok",
        "service": "kosmo-mrv-api",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/config", tags=["Configuration"])
def get_methodology_config() -> Dict[str, Any]:
    """Returns official IPCC and methodology parameters from parameters.csv."""
    return load_parameters()


@app.get("/", tags=["Root"])
def root_status() -> Dict[str, Any]:
    """Root entry point with documentation links and service metadata."""
    return {
        "name": "Kosmo MRV Satellite Verification Web Service",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "endpoints": {
            "sites": "/api/sites",
            "mrv_calculate": "/api/mrv/calculate",
            "timeseries": "/api/mrv/timeseries",
            "disturbances": "/api/mrv/disturbances",
            "raster_overlay": "/api/raster/overlay",
            "registry_summary": "/api/registry/summary",
            "report_generate": "/api/report/generate",
            "roi": "/api/roi",
            "insurance_evaluate": "/api/insurance/evaluate",
            "insurance_claim": "/api/insurance/claim",
            "insurance_buffer_pool": "/api/insurance/buffer-pool",
            "baseline_match": "/api/baseline/match",
            "baseline_comparison": "/api/baseline/reference-comparison",
            "species_classify": "/api/species/classify",
            "radar_firms": "/api/radar/firms-alerts",
            "radar_sar": "/api/radar/sar-monitoring",
            "climate_risks": "/api/climate-risks",
            "land_scout": "/api/land-scout/evaluate",
            "passport": "/api/passport/{site_id}",
            "passport_generate": "/api/passport/generate",
            "passport_verify": "/api/passport/verify",
            "export_gost": "/api/registry/export-gost",
            "open_data_sentinel2": "/api/open-data/sentinel2/search",
            "open_data_sources": "/api/open-data/sources",
            "open_data_status": "/api/open-data/status",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
