"""backend/app/core/area.py

Analytical WGS84 ellipsoidal area calculation module.

Provides:
- Exact analytical ellipsoidal latitude-dependent area calculation for individual cells.
- Vectorized raster row and full grid pixel area calculators in hectares.
- Arbitrary GeoJSON Polygon / MultiPolygon analytical area calculation via Green's theorem on WGS84 ellipsoid.
- Strict 20 km² (2000 ha) geometry area validation.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

# ---------------------------------------------------------------------------
# Geodetic Constants for WGS84 Ellipsoid
# ---------------------------------------------------------------------------
WGS84_A: float = 6378137.0  # Semi-major axis in meters
WGS84_B: float = 6356752.314245  # Semi-minor axis in meters (derived from 1/f = 298.257223563)
WGS84_SEMI_MAJOR_A: float = WGS84_A
WGS84_SEMI_MINOR_B: float = WGS84_B
WGS84_F: float = 1.0 / 298.257223563  # Flattening
WGS84_E2: float = 1.0 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A)  # First eccentricity squared (~0.00669437999014)
WGS84_E: float = math.sqrt(WGS84_E2)  # Eccentricity (~0.0818191908426)
M2_PER_HA: float = 10000.0  # 1 hectare = 10,000 square meters
MAX_POLYGON_AREA_HA: float = 2000.0  # Upper limit for arbitrary polygons (20 km² = 2000 ha)


def authalic_q_scalar(u: float) -> float:
    """Evaluates the authalic integral kernel q(u) = u / (1 - u^2) + 0.5 * ln((1 + u) / (1 - u)).

    Args:
        u: Value of e * sin(phi), where phi is latitude in radians.

    Returns:
        Scalar value of the authalic kernel.
    """
    # Clamp u to prevent singularity near poles
    u_c = max(-0.999999999, min(0.999999999, u))
    return u_c / (1.0 - u_c * u_c) + 0.5 * math.log((1.0 + u_c) / (1.0 - u_c))


def authalic_q_vectorized(u: np.ndarray) -> np.ndarray:
    """Vectorized evaluation of the authalic integral kernel q(u).

    Args:
        u: NumPy array of e * sin(phi).

    Returns:
        NumPy array of the authalic kernel.
    """
    u_c = np.clip(u, -0.999999999, 0.999999999)
    return u_c / (1.0 - u_c * u_c) + 0.5 * np.log((1.0 + u_c) / (1.0 - u_c))


def cell_area_ha(lat1_deg: float, lat2_deg: float, dlon_deg: float) -> float:
    """Computes exact analytical WGS84 ellipsoidal area in hectares of a lat/lon quad.

    Reproduces reference mean values from baseline.csv to 7 decimal places.

    Args:
        lat1_deg: First latitude boundary in degrees (-90 to 90).
        lat2_deg: Second latitude boundary in degrees (-90 to 90).
        dlon_deg: Longitude difference in degrees.

    Returns:
        Area of the quad in hectares (always non-negative).
    """
    phi1 = math.radians(min(lat1_deg, lat2_deg))
    phi2 = math.radians(max(lat1_deg, lat2_deg))
    dlam = math.radians(abs(dlon_deg))

    u1 = WGS84_E * math.sin(phi1)
    u2 = WGS84_E * math.sin(phi2)

    # Analytical integral of dS = M(phi)*N(phi)*cos(phi) dlambda dphi
    # S = (a^2 * (1 - e^2) * dlambda / (2 * e)) * [ q(u2) - q(u1) ]
    area_m2 = (WGS84_A * WGS84_A * (1.0 - WGS84_E2) * dlam / (2.0 * WGS84_E)) * (
        authalic_q_scalar(u2) - authalic_q_scalar(u1)
    )
    return abs(area_m2) / M2_PER_HA


def wgs84_cell_area_ha(lat1_deg: float, lat2_deg: float, lon1_deg: float, lon2_deg: float) -> float:
    """Computes exact analytical WGS84 ellipsoidal area in hectares of a lat/lon quad given 4 coordinates.

    Compatible with test_utils.wgs84_cell_area_ha signature.
    """
    return cell_area_ha(lat1_deg, lat2_deg, lon2_deg - lon1_deg)


def compute_raster_row_areas_ha(lat_edges_deg: np.ndarray, dlon_deg: float) -> np.ndarray:
    """Computes a 1D array of pixel areas in hectares for all rows in a geographic raster.

    Args:
        lat_edges_deg: 1D array of length H + 1 containing the northern and southern
                       latitude boundaries of each row in degrees.
        dlon_deg: Pixel longitude width in degrees (e.g., 0.0008888888888888889 for ESA CCI).

    Returns:
        1D array of length H with pixel area in hectares for each row.
    """
    phi = np.radians(lat_edges_deg)
    u = WGS84_E * np.sin(phi)
    q = authalic_q_vectorized(u)
    dlam = math.radians(abs(dlon_deg))
    factor = (WGS84_A * WGS84_A * (1.0 - WGS84_E2) * dlam / (2.0 * WGS84_E)) / M2_PER_HA
    return np.abs(np.diff(q)) * factor


def compute_raster_pixel_areas_ha(transform: Any, width: int, height: int) -> np.ndarray:
    """Generates a 2D array of exact ellipsoidal pixel areas for a geographic raster.

    Args:
        transform: Affine transform mapping (col, row) to geographic coordinates (EPSG:4326).
        width: Number of columns (raster width).
        height: Number of rows (raster height).

    Returns:
        2D numpy array of shape (height, width) with pixel areas in hectares.
    """
    row_indices = np.arange(height + 1)
    # y coordinate at each row boundary (x can be arbitrary, say 0)
    lat_edges = np.array([transform * (0, r) for r in row_indices])[:, 1]
    dlon = abs(transform.a)

    row_areas = compute_raster_row_areas_ha(lat_edges, dlon)
    return np.repeat(row_areas[:, np.newaxis], width, axis=1)


def _ring_area_ha(coords: List[Tuple[float, float]]) -> float:
    """Computes WGS84 ellipsoidal area of a closed coordinate ring using Green's line integral.

    Args:
        coords: List of (lon, lat) tuples defining the closed ring.

    Returns:
        Ring area in hectares.
    """
    if len(coords) < 3:
        return 0.0

    area_m2 = 0.0
    n = len(coords)
    for i in range(n):
        lon1, lat1 = coords[i]
        lon2, lat2 = coords[(i + 1) % n]

        dlam = math.radians(lon2 - lon1)
        # Normalize dlam to [-pi, pi]
        while dlam > math.pi:
            dlam -= 2.0 * math.pi
        while dlam < -math.pi:
            dlam += 2.0 * math.pi

        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        u1 = WGS84_E * math.sin(phi1)
        u2 = WGS84_E * math.sin(phi2)

        q1 = authalic_q_scalar(u1)
        q2 = authalic_q_scalar(u2)
        area_m2 += dlam * (q1 + q2) / 2.0

    area_m2 = abs(area_m2 * (WGS84_A * WGS84_A * (1.0 - WGS84_E2) / (2.0 * WGS84_E)))
    return area_m2 / M2_PER_HA


def calculate_polygon_wgs84_area_ha(geometry: Union[Dict[str, Any], BaseGeometry]) -> float:
    """Calculates the exact analytical WGS84 area in hectares for any GeoJSON geometry or Shapely shape.

    Handles Polygons, MultiPolygons, and holes (interior rings).

    Args:
        geometry: GeoJSON geometry dictionary or Shapely geometry object.

    Returns:
        Area in hectares.
    """
    if isinstance(geometry, dict):
        geom = shape(geometry)
    else:
        geom = geometry

    if geom.is_empty:
        return 0.0

    if geom.geom_type == "Polygon":
        polys = [geom]
    elif geom.geom_type == "MultiPolygon":
        polys = list(geom.geoms)
    else:
        raise ValueError(f"Unsupported geometry type for area calculation: {geom.geom_type}")

    total_area_ha = 0.0
    for p in polys:
        ext_area = _ring_area_ha(list(p.exterior.coords))
        int_area = sum(_ring_area_ha(list(interior.coords)) for interior in p.interiors)
        total_area_ha += max(0.0, ext_area - int_area)

    return total_area_ha


def wgs84_polygon_area_ha(geojson_geometry: Dict[str, Any]) -> float:
    """Alias for calculate_polygon_wgs84_area_ha for compatibility with test utilities."""
    return calculate_polygon_wgs84_area_ha(geojson_geometry)


def validate_polygon_area(
    geometry: Union[Dict[str, Any], BaseGeometry],
    max_area_ha: float = MAX_POLYGON_AREA_HA,
) -> Tuple[bool, float, Optional[str]]:
    """Validates that a polygon geometry has a valid, non-zero area and does not exceed the maximum allowed size.

    Args:
        geometry: GeoJSON dict or Shapely geometry.
        max_area_ha: Maximum permitted area in hectares (default 2000 ha = 20 km²).

    Returns:
        Tuple of (is_valid, computed_area_ha, error_message_or_none).
    """
    try:
        area_ha = calculate_polygon_wgs84_area_ha(geometry)
    except Exception as exc:
        return False, 0.0, f"INVALID_GEOMETRY: Failed to calculate area: {str(exc)}"

    if area_ha <= 0.0:
        return False, 0.0, "INVALID_AREA: Calculated polygon area must be greater than zero"

    if area_ha > max_area_ha:
        return False, area_ha, (
            f"POLYGON_EXCEEDS_MAX_AREA: Polygon area {area_ha:.2f} ha exceeds maximum "
            f"allowed size of {max_area_ha:.2f} ha (20 km² limit)"
        )

    return True, area_ha, None
