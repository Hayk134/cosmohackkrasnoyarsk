"""backend/app/api/__init__.py

FastAPI router module packaging all MRV verification endpoints:
- Sites & Polygon validation
- MRV Calculation, Timeseries, & Disturbances
- Dynamic Raster Overlays
- Demo Credit Registry
- Verifiable Audit Reports
"""

from backend.app.api.routes_mrv import router as mrv_router
from backend.app.api.routes_raster import router as raster_router
from backend.app.api.routes_registry import router as registry_router
from backend.app.api.routes_report import router as report_router
from backend.app.api.routes_sites import router as sites_router

__all__ = [
    "sites_router",
    "mrv_router",
    "raster_router",
    "registry_router",
    "report_router",
]
