"""backend/app/core/__init__.py

Core GIS, carbon accounting, uncertainty, disturbance analytics, and audit engine.
"""

from backend.app.core.area import (
    MAX_POLYGON_AREA_HA,
    WGS84_A,
    WGS84_B,
    WGS84_E,
    WGS84_E2,
    WGS84_F,
    WGS84_SEMI_MAJOR_A,
    WGS84_SEMI_MINOR_B,
    calculate_polygon_wgs84_area_ha,
    cell_area_ha,
    compute_raster_pixel_areas_ha,
    compute_raster_row_areas_ha,
    validate_polygon_area,
    wgs84_cell_area_ha,
    wgs84_polygon_area_ha,
)
from backend.app.core.audit import (
    compute_calculation_hash,
    compute_calculation_hash_with_json,
    generate_canonical_json,
    normalize_for_canonical_json,
    verify_calculation_hash,
)
from backend.app.core.carbon import (
    CarbonAccountingParams,
    CarbonAccountingResult,
    calculate_carbon_accounting,
    calculate_dynamic_baseline,
    calculate_project_carbon_effect,
    compute_carbon_accounting,
    lookup_preset_baseline,
    verify_case_test_calculation,
)
from backend.app.core.disturbances import (
    DisturbanceAnalyzer,
    DisturbanceResult,
    HansenGFCResult,
    MODISFireResult,
    Sentinel2IndexResult,
    compute_sentinel2_spectral_indices,
    detect_hansen_gfc,
    detect_modis_burn_scars,
    get_disturbances,
)
from backend.app.core.raster_loader import (
    IncompleteCoverageError,
    RasterExtractionError,
    RasterExtractionResult,
    RasterLoader,
    authalic_q,
    compute_wgs84_cell_area_ha,
)
from backend.app.core.uncertainty import (
    MoranResult,
    UncertaintyResult,
    calculate_spatial_uncertainty,
    calculate_vif_and_neff,
    compute_confidence_interval,
    compute_morans_i,
    compute_morans_i_2d,
    compute_uncertainty_bounds,
    evaluate_crediting_with_uncertainty,
    propagate_se_proj,
    propagate_se_single_year,
)
from backend.app.core.baseline_matcher import (
    compute_similarity_distance,
    get_preset_reference_comparison,
    match_baseline_sites,
)
from backend.app.core.species import (
    classify_forest_species,
    classify_multispectral_pixels,
    compute_adaptive_cf,
)
from backend.app.core.radar import (
    forward_azimuth_bearing,
    get_firms_hotspot_alerts,
    haversine_distance_km,
    monitor_sar_disturbance,
)
from backend.app.core.climate_risks import (
    compute_cmip6_scenario,
    project_climate_risks_to_2050,
)
from backend.app.core.land_scout import (
    compute_land_suitability_index,
    evaluate_land_scout,
)
from backend.app.core.qr_generator import (
    generate_qr_matrix,
    generate_qr_svg,
    generate_qr_svg_base64,
)
from backend.app.core.passport import (
    GLOBAL_PASSPORT_REGISTRY,
    PRESET_BENCHMARKS,
    GreenPassportRegistry,
    compute_digital_signature,
    compute_passport_hash,
    generate_green_passport,
    generate_passport_serial,
    verify_passport,
)
from backend.app.core.gost_export import (
    generate_gost_export_package,
    generate_gost_json,
    generate_gost_xml,
)

__all__ = [
    # Area
    "WGS84_A",
    "WGS84_B",
    "WGS84_SEMI_MAJOR_A",
    "WGS84_SEMI_MINOR_B",
    "WGS84_F",
    "WGS84_E2",
    "WGS84_E",
    "MAX_POLYGON_AREA_HA",
    "cell_area_ha",
    "wgs84_cell_area_ha",
    "compute_raster_row_areas_ha",
    "compute_raster_pixel_areas_ha",
    "calculate_polygon_wgs84_area_ha",
    "wgs84_polygon_area_ha",
    "validate_polygon_area",
    # Carbon
    "CarbonAccountingParams",
    "CarbonAccountingResult",
    "lookup_preset_baseline",
    "calculate_dynamic_baseline",
    "calculate_project_carbon_effect",
    "calculate_carbon_accounting",
    "compute_carbon_accounting",
    "verify_case_test_calculation",
    # Uncertainty
    "MoranResult",
    "UncertaintyResult",
    "compute_morans_i_2d",
    "compute_morans_i",
    "calculate_vif_and_neff",
    "propagate_se_proj",
    "propagate_se_single_year",
    "compute_confidence_interval",
    "compute_uncertainty_bounds",
    "evaluate_crediting_with_uncertainty",
    "calculate_spatial_uncertainty",
    # Raster Loader
    "RasterExtractionResult",
    "RasterLoader",
    "RasterExtractionError",
    "IncompleteCoverageError",
    "authalic_q",
    "compute_wgs84_cell_area_ha",
    # Disturbances
    "MODISFireResult",
    "HansenGFCResult",
    "Sentinel2IndexResult",
    "DisturbanceResult",
    "DisturbanceAnalyzer",
    "get_disturbances",
    "detect_modis_burn_scars",
    "detect_hansen_gfc",
    "compute_sentinel2_spectral_indices",
    # Audit
    "normalize_for_canonical_json",
    "generate_canonical_json",
    "compute_calculation_hash",
    "compute_calculation_hash_with_json",
    "verify_calculation_hash",
    # M-B2B-2 GeoAI
    "compute_similarity_distance",
    "match_baseline_sites",
    "get_preset_reference_comparison",
    "classify_multispectral_pixels",
    "compute_adaptive_cf",
    "classify_forest_species",
    "haversine_distance_km",
    "forward_azimuth_bearing",
    "get_firms_hotspot_alerts",
    "monitor_sar_disturbance",
    "compute_cmip6_scenario",
    "project_climate_risks_to_2050",
    "compute_land_suitability_index",
    "evaluate_land_scout",
    # M-B2B-3 Compliance & Green Passport
    "generate_qr_matrix",
    "generate_qr_svg",
    "generate_qr_svg_base64",
    "PRESET_BENCHMARKS",
    "GreenPassportRegistry",
    "GLOBAL_PASSPORT_REGISTRY",
    "compute_passport_hash",
    "compute_digital_signature",
    "generate_passport_serial",
    "generate_green_passport",
    "verify_passport",
    # M-B2B-3 GOST Export
    "generate_gost_xml",
    "generate_gost_json",
    "generate_gost_export_package",
]
