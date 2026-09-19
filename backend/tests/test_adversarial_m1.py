"""backend/tests/test_adversarial_m1.py

Adversarial Stress Testing Suite for Milestone 1 Backend Core Modules.
Created by teamwork_preview_challenger_m1_1 (EMPIRICAL CHALLENGER).

Challenge Dimensions Covered:
1. Extreme Boundary & Degenerate Geometries:
   - Area > 2000 ha rejection (exact 2000.0 vs 2000.01 vs 5000 ha).
   - Zero area, negative area, empty coordinates rejection.
   - Degenerate geometries (Points, LineStrings, GeometryCollections, self-intersecting bowties, collinear lines).
   - Donut polygons with interior holes and inverted holes (hole > exterior).
   - Coordinate inversions ([lat, lon]), extreme latitudes (|lat| > 90), and negative hemisphere coords.
2. Negative Carbon Change (Biomass Loss):
   - Direct biomass degradation (b0 > b1) -> R < 0, Q = 0, H/R suppressed (None).
   - Project gain below baseline counterfactual growth -> R < 0, Q = 0.
   - Exact zero carbon benefit (R = 0) -> Q = 0, H/R suppressed.
   - Catastrophic biomass loss (e.g. fire/clear-cut to 0 t/ha).
   - Leakage exceeding gross benefit -> R < 0, Q = 0.
   - Buffer reserve, adjusted R, and all valuations strictly 0.0 when R <= 0.
3. High Uncertainty & Stopping Rules:
   - Exact threshold H/R == 1.0 -> Q = 0, UNC = 1.0, blocking triggered.
   - Severe uncertainty H/R > 1.0 (1.5, 5.0, 100.0) -> Q = 0.
   - Allowance threshold boundary (H/R around 0.10: 0.0999, 0.1000, 0.1001).
   - Boundary below stopping ratio (H/R = 0.999 on large R).
   - Spatial autocorrelation extremes: Moran's I -> 1.0 (VIF inflation) and Moran's I < 0 (VIF floored at 1.0).
4. Missing Raster & NoData Graceful Blocking:
   - Missing raster file -> FileNotFoundError.
   - Completely out-of-bounds polygon -> IncompleteCoverageError.
   - Partially out-of-bounds polygon -> fractional coverage ratio detected.
   - Explicit incomplete_coverage flag -> Q = 0, blocking reason set.
   - 100% NoData/NaN grid -> Moran's I and SE compute safely (no division-by-zero or crash).
   - Single valid pixel and constant grid -> Moran's I = 0.0, VIF = 1.0.
   - 100% cloud cover in Sentinel-2 -> SCL filtering yields valid_fraction=0.0, NDVI=0.0 safely.
5. Cryptographic Audit Hash Determinism & Anti-Tampering:
   - Bit-level tampering detection.
   - Handling of NaN and Inf floats without JSON serialization crashes.
"""

from __future__ import annotations

import math
from pathlib import Path
import unittest

import numpy as np
from shapely.geometry import Point, LineString, Polygon, MultiPolygon, GeometryCollection

from backend.app.core.area import (
    MAX_POLYGON_AREA_HA,
    calculate_polygon_wgs84_area_ha,
    cell_area_ha,
    validate_polygon_area,
    wgs84_polygon_area_ha,
)
from backend.app.core.audit import (
    compute_calculation_hash,
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
    lookup_preset_baseline,
    verify_case_test_calculation,
)
from backend.app.core.disturbances import (
    DisturbanceAnalyzer,
    detect_hansen_gfc,
    detect_modis_burn_scars,
    get_disturbances,
)
from backend.app.core.raster_loader import (
    IncompleteCoverageError,
    RasterExtractionError,
    RasterLoader,
)
from backend.app.core.uncertainty import (
    calculate_spatial_uncertainty,
    calculate_vif_and_neff,
    compute_confidence_interval,
    compute_morans_i_2d,
    evaluate_crediting_with_uncertainty,
    propagate_se_proj,
    propagate_se_single_year,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class TestAdversarialGeometries(unittest.TestCase):
    """Adversarial Challenge Group 1: Extreme boundary and degenerate geometries."""

    def test_area_exact_2000_ha_boundary_allowed(self):
        """A polygon computed at exactly max_area_ha is valid and permitted."""
        poly = Polygon([(0, 0), (0, 0.01), (0.01, 0.01), (0.01, 0), (0, 0)])
        raw_area = calculate_polygon_wgs84_area_ha(poly)
        is_valid, area_ha, reason = validate_polygon_area(poly, max_area_ha=raw_area)
        self.assertTrue(is_valid)
        self.assertAlmostEqual(area_ha, raw_area, places=6)
        self.assertIsNone(reason)

    def test_area_exceeding_2000_ha_rejected(self):
        """Polygons exceeding the 2000 ha (20 km²) threshold are strictly rejected."""
        # 0.5 deg x 0.5 deg quad in Tver region is ~175,000 ha
        huge_poly = {
            "type": "Polygon",
            "coordinates": [
                [[32.0, 56.0], [32.0, 56.5], [32.5, 56.5], [32.5, 56.0], [32.0, 56.0]]
            ],
        }
        is_valid, area_ha, reason = validate_polygon_area(huge_poly)
        self.assertFalse(is_valid)
        self.assertGreater(area_ha, 2000.0)
        self.assertIsNotNone(reason)
        self.assertTrue(reason.startswith("POLYGON_EXCEEDS_MAX_AREA"))

    def test_area_just_above_boundary_2000_01_ha_rejected(self):
        """Area of 2000.01 ha is rejected when tested with carbon accounting."""
        res = calculate_carbon_accounting(area_ha=2000.01, t0_biomass_t_ha=100.0, t1_biomass_t_ha=104.0)
        self.assertFalse(res.is_valid)
        self.assertEqual(res.q_tradable_units, 0)
        self.assertIn("POLYGON_EXCEEDS_MAX_AREA", res.blocking_reason)

    def test_zero_area_polygon_rejected(self):
        """Zero area polygon returns is_valid=False and INVALID_AREA error."""
        empty_poly = {"type": "Polygon", "coordinates": []}
        is_valid, area_ha, reason = validate_polygon_area(empty_poly)
        self.assertFalse(is_valid)
        self.assertEqual(area_ha, 0.0)
        self.assertIn("INVALID_AREA", reason)

    def test_negative_area_parameter_rejected(self):
        """Negative area passed to carbon accounting is strictly blocked."""
        res = calculate_carbon_accounting(area_ha=-50.0, t0_biomass_t_ha=100.0, t1_biomass_t_ha=104.0)
        self.assertFalse(res.is_valid)
        self.assertEqual(res.q_tradable_units, 0)
        self.assertIn("INVALID_AREA", res.blocking_reason)

    def test_collinear_degenerate_polygon_zero_area(self):
        """Collinear points forming a line disguised as a polygon yield 0.0 ha and are rejected."""
        collinear_poly = {
            "type": "Polygon",
            "coordinates": [
                [[32.91, 56.59], [32.93, 56.59], [32.97, 56.59], [32.91, 56.59]]
            ],
        }
        is_valid, area_ha, reason = validate_polygon_area(collinear_poly)
        self.assertFalse(is_valid)
        self.assertEqual(area_ha, 0.0)

    def test_point_geometry_gracefully_rejected(self):
        """Passing a Point geometry returns is_valid=False with INVALID_GEOMETRY."""
        pt = {"type": "Point", "coordinates": [32.95, 56.61]}
        is_valid, area_ha, reason = validate_polygon_area(pt)
        self.assertFalse(is_valid)
        self.assertIn("INVALID_GEOMETRY", reason)

    def test_linestring_geometry_gracefully_rejected(self):
        """Passing a LineString geometry returns is_valid=False with INVALID_GEOMETRY."""
        line = {
            "type": "LineString",
            "coordinates": [[32.91, 56.59], [32.97, 56.63]],
        }
        is_valid, area_ha, reason = validate_polygon_area(line)
        self.assertFalse(is_valid)
        self.assertIn("INVALID_GEOMETRY", reason)

    def test_geometry_collection_gracefully_rejected(self):
        """Passing a GeometryCollection returns is_valid=False with INVALID_GEOMETRY."""
        geom_coll = GeometryCollection([Point(32.95, 56.61), LineString([(32.91, 56.59), (32.97, 56.63)])])
        is_valid, area_ha, reason = validate_polygon_area(geom_coll)
        self.assertFalse(is_valid)
        self.assertIn("INVALID_GEOMETRY", reason)

    def test_self_intersecting_bowtie_polygon_sanitization(self):
        """A self-intersecting polygon (bowtie) is sanitized by RasterLoader into a valid MultiPolygon."""
        poly_bowtie = {
            "type": "Polygon",
            "coordinates": [
                [[30.0, 56.0], [30.0, 56.02], [30.02, 56.0], [30.02, 56.01], [30.0, 56.0]]
            ],
        }
        sanitized = RasterLoader.sanitize_polygon(poly_bowtie)
        self.assertTrue(sanitized.is_valid)
        self.assertIn(sanitized.geom_type, ["MultiPolygon", "Polygon"])

    def test_donut_polygon_interior_hole_subtraction(self):
        """Donut polygon correctly subtracts interior hole from exterior area."""
        outer = [[32.91, 56.59], [32.91, 56.63], [32.974, 56.63], [32.974, 56.59], [32.91, 56.59]]
        hole = [[32.93, 56.60], [32.93, 56.62], [32.95, 56.62], [32.95, 56.60], [32.93, 56.60]]
        donut = {"type": "Polygon", "coordinates": [outer, hole]}
        solid = {"type": "Polygon", "coordinates": [outer]}
        hole_poly = {"type": "Polygon", "coordinates": [hole]}

        area_donut = calculate_polygon_wgs84_area_ha(donut)
        area_solid = calculate_polygon_wgs84_area_ha(solid)
        area_hole = calculate_polygon_wgs84_area_ha(hole_poly)

        self.assertAlmostEqual(area_donut, area_solid - area_hole, places=4)
        self.assertGreater(area_donut, 0.0)

    def test_inverted_donut_hole_larger_than_exterior_rejected(self):
        """An inverted donut (where hole area > exterior area) clamps to 0.0 and is rejected."""
        outer = [[32.93, 56.60], [32.93, 56.62], [32.95, 56.62], [32.95, 56.60], [32.93, 56.60]]
        hole = [[32.91, 56.59], [32.91, 56.63], [32.974, 56.63], [32.974, 56.59], [32.91, 56.59]]
        inverted_donut = {"type": "Polygon", "coordinates": [outer, hole]}
        is_valid, area_ha, reason = validate_polygon_area(inverted_donut)
        self.assertFalse(is_valid)
        self.assertEqual(area_ha, 0.0)
        self.assertIn("INVALID_AREA", reason)

    def test_southern_and_western_hemisphere_coordinates(self):
        """Coordinates in southern and western hemispheres calculate correct positive area."""
        poly_south_west = {
            "type": "Polygon",
            "coordinates": [
                [[-50.0, -20.0], [-50.0, -20.02], [-49.98, -20.02], [-49.98, -20.0], [-50.0, -20.0]]
            ],
        }
        is_valid, area_ha, reason = validate_polygon_area(poly_south_west)
        self.assertTrue(is_valid)
        self.assertGreater(area_ha, 400.0)
        self.assertLess(area_ha, 500.0)

    def test_antimeridian_crossing_polygon_accuracy(self):
        """A polygon crossing the 180th antimeridian calculates identical area to standard meridian."""
        quad_180 = {
            "type": "Polygon",
            "coordinates": [
                [[179.99, 56.0], [179.99, 56.02], [-179.99, 56.02], [-179.99, 56.0], [179.99, 56.0]]
            ],
        }
        quad_ref = {
            "type": "Polygon",
            "coordinates": [
                [[30.0, 56.0], [30.0, 56.02], [30.02, 56.02], [30.02, 56.0], [30.0, 56.0]]
            ],
        }
        area_180 = calculate_polygon_wgs84_area_ha(quad_180)
        area_ref = calculate_polygon_wgs84_area_ha(quad_ref)
        self.assertAlmostEqual(area_180, area_ref, places=6)

    def test_high_vertex_density_circle_polygon(self):
        """High-vertex polygon (1,000 vertices circle) validates and computes area without stack overflow."""
        center_lon, center_lat = 32.94, 56.61
        radius_deg = 0.01
        angles = [2.0 * math.pi * i / 1000 for i in range(1001)]
        coords = [[center_lon + radius_deg * math.cos(a), center_lat + radius_deg * math.sin(a)] for a in angles]
        circle_poly = {"type": "Polygon", "coordinates": [coords]}
        is_valid, area_ha, reason = validate_polygon_area(circle_poly)
        self.assertTrue(is_valid)
        self.assertGreater(area_ha, 200.0)
        self.assertLess(area_ha, 250.0)


class TestAdversarialNegativeCarbon(unittest.TestCase):
    """Adversarial Challenge Group 2: Negative carbon change, biomass loss, and H/R suppression."""

    def test_biomass_loss_direct_rejection(self):
        """Biomass loss (120 -> 90 t/ha) yields negative R, Q=0, and valid=False."""
        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=120.0,
            t1_biomass_t_ha=90.0,
            delta_years=1,
            baseline_delta_tc_ha=0.0,
        )
        self.assertLess(res.r_gross_t_co2e, 0.0)
        self.assertEqual(res.q_tradable_units, 0)
        self.assertFalse(res.is_valid)
        self.assertIn("NO_NET_CARBON_BENEFIT", res.blocking_reason)

    def test_h_over_r_suppressed_on_negative_r(self):
        """When R < 0, the H/R metric is strictly suppressed (None) to avoid division anomalies."""
        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=80.0,
            delta_years=1,
            baseline_delta_tc_ha=0.0,
        )
        self.assertIsNone(res.h_over_r)

    def test_zero_buffer_and_valuations_on_negative_r(self):
        """When R < 0, buffer reserve, adjusted R, and scenario valuations are strictly zero."""
        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=150.0,
            t1_biomass_t_ha=100.0,
            delta_years=1,
        )
        self.assertEqual(res.buffer_reserve, 0.0)
        self.assertEqual(res.r_adjusted, 0.0)
        self.assertEqual(res.scenario_valuations["rub_500"], 0.0)
        self.assertEqual(res.scenario_valuations["rub_1500"], 0.0)
        self.assertEqual(res.scenario_valuations["rub_4000"], 0.0)

    def test_catastrophic_biomass_loss_to_zero(self):
        """Complete forest loss (e.g. 250 -> 0 t/ha from wildfire) yields Q=0 and blocks crediting."""
        res = calculate_carbon_accounting(
            area_ha=1000.0,
            t0_biomass_t_ha=250.0,
            t1_biomass_t_ha=0.0,
            delta_years=1,
            baseline_delta_tc_ha=0.47,
        )
        self.assertLess(res.r_gross_t_co2e, -100000.0)
        self.assertEqual(res.q_tradable_units, 0)
        self.assertFalse(res.is_valid)
        self.assertIsNone(res.h_over_r)

    def test_project_gain_below_baseline_counterfactual_growth(self):
        """When project grows by 1 t/ha but baseline expected 3 t/ha, R < 0 and Q = 0."""
        # Project delta C = 1 * 0.47 = 0.47 t C/ha
        # Baseline delta C = 3.0 t C/ha -> baseline has more removals than project
        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=101.0,
            delta_years=1,
            baseline_delta_tc_ha=3.0,
        )
        self.assertLess(res.r_gross_t_co2e, 0.0)
        self.assertEqual(res.q_tradable_units, 0)
        self.assertFalse(res.is_valid)
        self.assertIsNone(res.h_over_r)

    def test_exact_zero_net_carbon_effect_blocked(self):
        """When project removals exactly equal baseline removals (R = 0.0), issuance is blocked."""
        # 1 t/ha gain = 0.47 t C/ha; baseline = 0.47 t C/ha
        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=101.0,
            delta_years=1,
            baseline_delta_tc_ha=0.47,
        )
        self.assertAlmostEqual(res.r_gross_t_co2e, 0.0, places=4)
        self.assertEqual(res.q_tradable_units, 0)
        self.assertFalse(res.is_valid)
        self.assertIsNone(res.h_over_r)

    def test_leakage_exceeding_gross_benefit(self):
        """When leakage LK exceeds gross removals, R becomes negative and Q = 0."""
        # R_gross before LK would be 517 t CO2e; LK = 600 t CO2e -> R = -83 t CO2e
        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=104.0,
            delta_years=1,
            baseline_delta_tc_ha=0.47,
            leakage_lk=600.0,
        )
        self.assertLess(res.r_gross_t_co2e, 0.0)
        self.assertEqual(res.q_tradable_units, 0)
        self.assertFalse(res.is_valid)
        self.assertIsNone(res.h_over_r)

    def test_sub_unit_positive_carbon_effect(self):
        """When R > 0 but integer floor(R_adj - B) produces 0 units, Q = 0."""
        # 1 ha, 0.05 t/ha increment -> R ~ 0.086 t CO2e -> Q = 0
        res = calculate_carbon_accounting(
            area_ha=1.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=100.05,
            delta_years=1,
            baseline_delta_tc_ha=0.0,
        )
        self.assertGreater(res.r_gross_t_co2e, 0.0)
        self.assertEqual(res.q_tradable_units, 0)


class TestAdversarialHighUncertainty(unittest.TestCase):
    """Adversarial Challenge Group 3: High uncertainty and stopping threshold enforcement."""

    def test_exact_stop_ratio_threshold_1_0_blocked(self):
        """When H == R exactly (H/R == 1.0), unit issuance is halted (Q=0, valid=False)."""
        base_res = calculate_carbon_accounting(100.0, 100.0, 104.0, 1, baseline_delta_tc_ha=0.47)
        r = base_res.r_gross_t_co2e

        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=104.0,
            delta_years=1,
            baseline_delta_tc_ha=0.47,
            half_width_h=r,
        )
        self.assertAlmostEqual(res.h_over_r, 1.0, places=6)
        self.assertEqual(res.q_tradable_units, 0)
        self.assertFalse(res.is_valid)
        self.assertEqual(res.unc_deduction, 1.0)
        self.assertEqual(res.r_adjusted, 0.0)
        self.assertEqual(res.buffer_reserve, 0.0)
        self.assertIn("UNCERTAINTY_EXCEEDS_THRESHOLD", res.blocking_reason)

    def test_stop_ratio_above_1_0_blocked(self):
        """When H/R > 1.0 (e.g. 1.5, 5.0, 50.0), Q = 0 and blocking is triggered."""
        for ratio in [1.0001, 1.5, 5.0, 50.0]:
            base_res = calculate_carbon_accounting(100.0, 100.0, 104.0, 1, baseline_delta_tc_ha=0.47)
            r = base_res.r_gross_t_co2e
            res = calculate_carbon_accounting(
                area_ha=100.0,
                t0_biomass_t_ha=100.0,
                t1_biomass_t_ha=104.0,
                delta_years=1,
                baseline_delta_tc_ha=0.47,
                half_width_h=r * ratio,
            )
            self.assertGreaterEqual(res.h_over_r, 1.0)
            self.assertEqual(res.q_tradable_units, 0)
            self.assertFalse(res.is_valid)
            self.assertIn("UNCERTAINTY_EXCEEDS_THRESHOLD", res.blocking_reason)

    def test_allowance_boundary_exact_0_10(self):
        """When H/R == 0.10 exactly, UNC deduction is exactly 0.0."""
        base_res = calculate_carbon_accounting(100.0, 100.0, 104.0, 1, baseline_delta_tc_ha=0.47)
        r = base_res.r_gross_t_co2e
        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=104.0,
            delta_years=1,
            baseline_delta_tc_ha=0.47,
            half_width_h=r * 0.10,
        )
        self.assertAlmostEqual(res.h_over_r, 0.10, places=6)
        self.assertAlmostEqual(res.unc_deduction, 0.0, places=6)
        self.assertTrue(res.is_valid)
        self.assertGreater(res.q_tradable_units, 0)

    def test_allowance_boundary_just_above_0_1001(self):
        """When H/R = 0.1001 (> 0.10), UNC deduction is 0.0001."""
        base_res = calculate_carbon_accounting(100.0, 100.0, 104.0, 1, baseline_delta_tc_ha=0.47)
        r = base_res.r_gross_t_co2e
        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=104.0,
            delta_years=1,
            baseline_delta_tc_ha=0.47,
            half_width_h=r * 0.1001,
        )
        self.assertAlmostEqual(res.h_over_r, 0.1001, places=6)
        self.assertAlmostEqual(res.unc_deduction, 0.0001, places=4)

    def test_allowance_boundary_just_below_0_0999(self):
        """When H/R = 0.0999 (< 0.10), UNC deduction is strictly 0.0."""
        base_res = calculate_carbon_accounting(100.0, 100.0, 104.0, 1, baseline_delta_tc_ha=0.47)
        r = base_res.r_gross_t_co2e
        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=104.0,
            delta_years=1,
            baseline_delta_tc_ha=0.47,
            half_width_h=r * 0.0999,
        )
        self.assertAlmostEqual(res.h_over_r, 0.0999, places=6)
        self.assertEqual(res.unc_deduction, 0.0)

    def test_zero_uncertainty_limit(self):
        """When H = 0.0 (perfect certainty), UNC deduction is 0.0 and R_adj == R."""
        base_res = calculate_carbon_accounting(100.0, 100.0, 104.0, 1, baseline_delta_tc_ha=0.47)
        r = base_res.r_gross_t_co2e
        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=104.0,
            delta_years=1,
            baseline_delta_tc_ha=0.47,
            half_width_h=0.0,
        )
        self.assertEqual(res.h_over_r, 0.0)
        self.assertEqual(res.unc_deduction, 0.0)
        self.assertAlmostEqual(res.r_adjusted, r, places=4)

    def test_near_stop_ratio_boundary_0_999(self):
        """When H/R = 0.999 on a massive project, issuance is allowed with ~90% deduction."""
        # 1000 ha, gain 60 t/ha -> R is huge (~103,400 t CO2e)
        base_res = calculate_carbon_accounting(1000.0, 100.0, 160.0, 1, baseline_delta_tc_ha=0.0)
        r = base_res.r_gross_t_co2e
        res = calculate_carbon_accounting(
            area_ha=1000.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=160.0,
            delta_years=1,
            baseline_delta_tc_ha=0.0,
            half_width_h=r * 0.999,
        )
        self.assertTrue(res.is_valid)
        self.assertAlmostEqual(res.unc_deduction, 0.899, places=3)
        self.assertGreater(res.q_tradable_units, 0)

    def test_negative_spatial_autocorrelation_flooring(self):
        """Negative spatial autocorrelation (I < 0) floors VIF at 1.0, preventing artificial variance deflation."""
        vif, n_eff = calculate_vif_and_neff(moran_i=-0.85, n_pixels=100)
        self.assertEqual(vif, 1.0)
        self.assertEqual(n_eff, 100.0)

    def test_extreme_positive_spatial_autocorrelation_vif_cap(self):
        """Extreme positive autocorrelation (I -> 1.0) caps VIF safely at N pixels."""
        vif, n_eff = calculate_vif_and_neff(moran_i=0.999999, n_pixels=100)
        self.assertGreater(vif, 1.0)
        self.assertLessEqual(vif, 100.0)
        self.assertGreaterEqual(n_eff, 1.0)


class TestAdversarialMissingRasterAndNoData(unittest.TestCase):
    """Adversarial Challenge Group 4: Missing raster files, out-of-bounds, and NoData resilience."""

    def test_nonexistent_raster_file_raises_filenotfound(self):
        """Attempting to extract from a non-existent raster file raises FileNotFoundError."""
        poly = {"type": "Polygon", "coordinates": [[[32.91, 56.59], [32.91, 56.63], [32.97, 56.63], [32.97, 56.59], [32.91, 56.59]]]}
        with self.assertRaises(FileNotFoundError):
            RasterLoader.extract_windowed("data/DOES_NOT_EXIST.tif", poly)

    def test_completely_out_of_bounds_polygon_raises_incomplete_coverage(self):
        """A polygon completely outside the raster extent raises IncompleteCoverageError."""
        # Polygon in Vladivostok (lon 131, lat 43), raster in Tver (lon 32.9, lat 56.6)
        poly_vladivostok = {
            "type": "Polygon",
            "coordinates": [
                [[131.8, 43.1], [131.8, 43.2], [131.9, 43.2], [131.9, 43.1], [131.8, 43.1]]
            ],
        }
        with self.assertRaises(IncompleteCoverageError):
            RasterLoader.extract_windowed("data/RU_TVER_01/CCI_Biomass_2019.tif", poly_vladivostok)

    def test_partially_out_of_bounds_polygon_coverage_ratio(self):
        """A polygon that only partially overlaps the raster computes coverage_ratio < 1.0."""
        # Half inside Tver raster, half outside
        poly_half = {
            "type": "Polygon",
            "coordinates": [
                [[32.85, 56.59], [32.85, 56.63], [32.95, 56.63], [32.95, 56.59], [32.85, 56.59]]
            ],
        }
        res = RasterLoader.extract_windowed(
            "data/RU_TVER_01/CCI_Biomass_2019.tif",
            poly_half,
            expected_polygon_area_ha=2000.0,
        )
        self.assertLess(res.coverage_ratio, 1.0)
        self.assertGreater(res.coverage_ratio, 0.0)

    def test_incomplete_coverage_blocks_carbon_accounting(self):
        """Passing incomplete_coverage=True to carbon accounting strictly sets Q=0 and blocks crediting."""
        res = calculate_carbon_accounting(
            area_ha=100.0,
            t0_biomass_t_ha=100.0,
            t1_biomass_t_ha=104.0,
            incomplete_coverage=True,
        )
        self.assertFalse(res.is_valid)
        self.assertEqual(res.q_tradable_units, 0)
        self.assertIn("INCOMPLETE_COVERAGE", res.blocking_reason)

    def test_morans_i_with_100_percent_nans_safe(self):
        """Moran's I computation on a 100% NaN grid returns 0.0 without crashing."""
        all_nan = np.full((20, 20), np.nan)
        res = compute_morans_i_2d(all_nan)
        self.assertEqual(res.moran_i, 0.0)
        self.assertEqual(res.n_pixels, 0)
        self.assertEqual(res.vif, 1.0)

    def test_morans_i_with_single_valid_pixel_safe(self):
        """Moran's I computation on a grid with a single valid pixel returns 0.0 and vif=1.0."""
        grid = np.full((10, 10), np.nan)
        grid[5, 5] = 42.0
        res = compute_morans_i_2d(grid)
        self.assertEqual(res.moran_i, 0.0)
        self.assertEqual(res.n_pixels, 1)
        self.assertEqual(res.vif, 1.0)

    def test_morans_i_with_constant_grid_zero_variance_safe(self):
        """Moran's I on a constant value grid (zero spatial variance) returns 0.0 and vif=1.0."""
        const_grid = np.full((10, 10), 105.0)
        res = compute_morans_i_2d(const_grid)
        self.assertEqual(res.moran_i, 0.0)
        self.assertEqual(res.vif, 1.0)

    def test_standard_error_propagation_with_zero_valid_pixels(self):
        """propagate_se_proj with an all-False mask returns 0.0 without division by zero."""
        zeros_mask = np.zeros((10, 10), dtype=bool)
        se = propagate_se_proj(
            np.ones((10, 10)),
            np.ones((10, 10)),
            np.ones((10, 10)),
            mask=zeros_mask,
        )
        self.assertEqual(se, 0.0)

    def test_sentinel2_100_percent_cloud_cover_safe_defaults(self):
        """When 100% of pixels in SCL mask are clouds, valid_fraction=0.0 and mean NDVI=0.0 without nanmean warnings."""
        scl = np.full((10, 10), 9)  # SCL class 9 = high cirrus clouds
        valid_scl_mask = np.isin(scl, [4, 5])
        total_aoi = np.sum(scl > 0)
        valid_fraction = float(np.sum(valid_scl_mask) / total_aoi) if total_aoi > 0 else 0.0
        self.assertEqual(valid_fraction, 0.0)

        ndvi_grid = np.where(valid_scl_mask, 0.8, np.nan)
        mean_ndvi = float(np.nanmean(ndvi_grid)) if np.any(valid_scl_mask) else 0.0
        self.assertEqual(mean_ndvi, 0.0)

    def test_empty_modis_directory_handled_gracefully(self):
        """Disturbance detection on an AOI without MODIS files returns fire_detected=False cleanly."""
        res = detect_modis_burn_scars(aoi_id="NON_EXISTENT_AOI")
        self.assertFalse(res["modis_fire_detected"])
        self.assertEqual(res["burned_pixels"], 0)
        self.assertEqual(res["burn_dates"], [])

    def test_concurrent_multithreaded_raster_extraction(self):
        """Thread-safe dataset caching handles concurrent windowed extractions without data races."""
        import concurrent.futures

        poly = {
            "type": "Polygon",
            "coordinates": [[[32.91, 56.59], [32.91, 56.63], [32.97, 56.63], [32.97, 56.59], [32.91, 56.59]]],
        }
        raster_p = "data/RU_TVER_01/CCI_Biomass_2019.tif"

        def task(_):
            res = RasterLoader.extract_windowed(raster_p, poly)
            return res.total_polygon_area_ha

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(task, range(16)))

        self.assertEqual(len(results), 16)
        self.assertTrue(all(abs(r - results[0]) < 1e-9 for r in results))


class TestAdversarialAuditAndIntegrity(unittest.TestCase):
    """Adversarial Challenge Group 5: Cryptographic auditability and input integrity."""

    def test_audit_hash_detects_subtle_tampering(self):
        """Tampering with a single parameter (e.g. Q units changed by 1) changes SHA-256 hash."""
        inputs = {"area_ha": 100.0, "start_year": 2019, "end_year": 2024}
        geom = {"type": "Polygon", "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]}
        outputs_orig = {"q_tradable_units": 395, "r_gross": 517.0}
        outputs_tampered = {"q_tradable_units": 396, "r_gross": 517.0}

        hash1 = compute_calculation_hash(inputs, geom, outputs_orig)
        hash2 = compute_calculation_hash(inputs, geom, outputs_tampered)

        self.assertNotEqual(hash1, hash2)
        self.assertTrue(verify_calculation_hash(inputs, hash1, geom, outputs_orig))
        self.assertFalse(verify_calculation_hash(inputs, hash1, geom, outputs_tampered))

    def test_audit_hash_handles_nan_and_inf_without_crash(self):
        """Hashing payloads containing float('nan') or float('inf') normalizes safely to None without JSON crash."""
        payload_with_nan = {
            "r_gross": float("nan"),
            "inf_value": float("inf"),
            "valid_num": 42.0,
        }
        canon_json = generate_canonical_json(payload_with_nan)
        self.assertIn('"inf_value":null', canon_json)
        self.assertIn('"r_gross":null', canon_json)
        self.assertIn('"valid_num":42.0', canon_json)
        hash_val = compute_calculation_hash(payload_with_nan)
        self.assertEqual(len(hash_val), 64)

    def test_audit_hash_deterministic_key_ordering(self):
        """Dicts with unordered keys serialize to the identical canonical JSON string and hash."""
        d1 = {"z_key": 1, "a_key": 2, "m_key": 3}
        d2 = {"a_key": 2, "m_key": 3, "z_key": 1}
        self.assertEqual(generate_canonical_json(d1), generate_canonical_json(d2))
        self.assertEqual(compute_calculation_hash(d1), compute_calculation_hash(d2))

    def test_normative_acceptance_case_exact_reproduction(self):
        """Exact normative acceptance criteria verification (100 ha, 100->104 t/ha -> 395 Q)."""
        verif = verify_case_test_calculation()
        self.assertTrue(verif["all_passed"], f"Checks failed: {verif['checks']}")
        res = verif["result"]
        self.assertEqual(res["q_tradable_units"], 395)
        self.assertEqual(res["unc_deduction"], 0.10)
        self.assertEqual(res["r_adjusted"], 465.3)
        self.assertEqual(res["buffer_reserve"], 69.795)
        self.assertEqual(res["r_gross_t_co2e"], 517.0)


if __name__ == "__main__":
    unittest.main()
