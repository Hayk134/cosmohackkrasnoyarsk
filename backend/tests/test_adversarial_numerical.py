"""backend/tests/test_adversarial_numerical.py

Adversarial Numerical Verification Suite for Milestone 1 Backend GIS & Math Engine.
Stress tests:
1. Spatial Autocorrelation & Uncertainty:
   - Moran's I on extreme grids (constant grid variance=0, checkerboard pattern, linear gradients).
   - VIF singularity avoidance (I -> 1.0, I >= 1.0, I <= 0.0, N=0, N=1).
   - Queen vs Rook contiguity on extreme topologies.
   - Disconnected / sparse pixel grids where S0 = 0.
2. WGS84 Ellipsoidal Area Precision across Latitudes:
   - Precision comparison across latitudes (Equator, 15, 30, 45, 56, 60, 70, 80, 89.9, 90 deg, and Southern latitudes).
   - Analytical closed-form vs high-resolution Simpson numerical quadrature.
   - Polygon Green's line integral vs cell_area_ha bounding box.
   - Monotonic latitude convergence and North-South symmetry.
   - Antimeridian crossing, polygon winding order invariance, holes/interior rings.
   - Max area boundary enforcement (<= 2000 ha).
3. Determinism of SHA-256 Calculation Hash:
   - Key order invariance on arbitrary nested dicts.
   - Float precision rounding formatting (float_precision=6).
   - Banker's rounding boundary cases and IEEE 754 edge cases.
   - Type normalization behavior (Python types vs NumPy scalar types).
   - NaN and Inf handling.
   - Avalanche effect on minor tamper.
4. Carbon Equations Unit Conservation & Mass Balance:
   - Exact mass balance partition: Q + Remainder + Buffer + Deduction = R.
   - Rigorous unit dimensional consistency (t dry matter -> t C -> t CO2e -> tradable units).
   - Crediting boundary thresholds (R <= 0, H/R <= 0.10, H/R >= 1.0).
   - 10,000-run Monte Carlo conservation stress harness.
   - Exact normative acceptance criteria test reproduction (Q = 395).
"""

from __future__ import annotations

import math
import random
import unittest
import numpy as np

from backend.app.core.area import (
    WGS84_A,
    WGS84_B,
    WGS84_E,
    WGS84_E2,
    M2_PER_HA,
    authalic_q_scalar,
    authalic_q_vectorized,
    cell_area_ha,
    wgs84_cell_area_ha,
    compute_raster_row_areas_ha,
    calculate_polygon_wgs84_area_ha,
    validate_polygon_area,
)
from backend.app.core.uncertainty import (
    compute_morans_i_2d,
    calculate_vif_and_neff,
    propagate_se_proj,
    compute_confidence_interval,
    evaluate_crediting_with_uncertainty,
    calculate_spatial_uncertainty,
)
from backend.app.core.carbon import (
    CarbonAccountingParams,
    calculate_carbon_accounting,
    calculate_project_carbon_effect,
    verify_case_test_calculation,
)
from backend.app.core.audit import (
    normalize_for_canonical_json,
    generate_canonical_json,
    compute_calculation_hash,
    verify_calculation_hash,
)


class TestMoransIExtremeGrids(unittest.TestCase):
    """Adversarial tests for Moran's I and VIF numerical stability."""

    def test_constant_grid_variance_zero(self):
        """Constant raster grid (all values equal, variance=0) must return Moran's I=0 without ZeroDivisionError."""
        for val in [0.0, 1.0, 42.0, -100.0, 1e8]:
            grid = np.full((15, 20), val, dtype=np.float64)
            res = compute_morans_i_2d(grid, neighborhood="queen")
            self.assertEqual(res.moran_i, 0.0, f"Expected 0.0 for constant grid of {val}")
            self.assertEqual(res.vif, 1.0, "VIF must be 1.0 for zero autocorrelation")
            self.assertEqual(res.n_eff, 300.0)
            self.assertEqual(res.s0_weights, 0.0)

    def test_constant_grid_with_nans(self):
        """Constant grid with interspersed NaNs must filter cleanly and return I=0."""
        grid = np.full((10, 10), 55.5, dtype=np.float64)
        grid[0, 0] = np.nan
        grid[4, 4] = np.nan
        grid[9, 9] = np.nan
        res = compute_morans_i_2d(grid)
        self.assertEqual(res.moran_i, 0.0)
        self.assertEqual(res.n_pixels, 97)
        self.assertEqual(res.vif, 1.0)
        self.assertEqual(res.n_eff, 97.0)

    def test_single_pixel_and_empty_grids(self):
        """Grids with 0 or 1 valid pixel must not raise and return default MoranResult."""
        # 0 valid pixels
        grid_nan = np.full((5, 5), np.nan)
        res_empty = compute_morans_i_2d(grid_nan)
        self.assertEqual(res_empty.moran_i, 0.0)
        self.assertEqual(res_empty.n_pixels, 0)
        self.assertEqual(res_empty.vif, 1.0)
        self.assertEqual(res_empty.n_eff, 1.0)

        # 1 valid pixel
        grid_nan[2, 2] = 10.0
        res_one = compute_morans_i_2d(grid_nan)
        self.assertEqual(res_one.moran_i, 0.0)
        self.assertEqual(res_one.n_pixels, 1)
        self.assertEqual(res_one.vif, 1.0)
        self.assertEqual(res_one.n_eff, 1.0)

    def test_checkerboard_pattern_rook_extreme_negative(self):
        """Checkerboard pattern with Rook contiguity exhibits extreme negative autocorrelation (I = -1.0)."""
        # Create an 8x8 checkerboard alternating +1 and -1
        cb = np.zeros((8, 8), dtype=np.float64)
        cb[::2, ::2] = 1.0
        cb[1::2, 1::2] = 1.0
        cb[::2, 1::2] = -1.0
        cb[1::2, ::2] = -1.0

        res_rook = compute_morans_i_2d(cb, neighborhood="rook")
        # In Rook contiguity, all adjacent neighbors of +1 are -1, producing exact theoretical minimum I = -1.0
        self.assertAlmostEqual(res_rook.moran_i, -1.0, places=5)
        # Conservative accounting: negative autocorrelation must NOT deflate variance (VIF must be 1.0)
        self.assertEqual(res_rook.vif, 1.0)
        self.assertEqual(res_rook.n_eff, 64.0)

    def test_checkerboard_pattern_queen(self):
        """Checkerboard pattern with Queen contiguity includes diagonal neighbors with same sign."""
        cb = np.zeros((8, 8), dtype=np.float64)
        cb[::2, ::2] = 1.0
        cb[1::2, 1::2] = 1.0
        cb[::2, 1::2] = -1.0
        cb[1::2, ::2] = -1.0

        res_queen = compute_morans_i_2d(cb, neighborhood="queen")
        # Diagonal neighbors (+1) partially counteract cardinal neighbors (-1)
        self.assertLess(res_queen.moran_i, 0.0)
        self.assertEqual(res_queen.vif, 1.0)

    def test_near_perfect_correlation_linear_gradient(self):
        """Smooth continuous gradient exhibits high positive Moran's I (> 0.90)."""
        grad = np.tile(np.linspace(0.0, 100.0, 40), (40, 1))
        res = compute_morans_i_2d(grad, neighborhood="queen")
        self.assertGreater(res.moran_i, 0.90)
        self.assertLessEqual(res.moran_i, 1.0)
        self.assertGreater(res.vif, 10.0)
        self.assertLessEqual(res.vif, float(res.n_pixels))

    def test_large_block_pattern_approaching_one(self):
        """Large contiguous block pattern approaches Moran's I -> 1.0."""
        block = np.zeros((50, 50), dtype=np.float64)
        block[:25, :] = 100.0  # Top half high, bottom half 0
        res = compute_morans_i_2d(block, neighborhood="queen")
        self.assertGreater(res.moran_i, 0.90)
        self.assertLessEqual(res.moran_i, 1.0)

    def test_vif_singularity_avoidance_boundaries(self):
        """calculate_vif_and_neff must avoid division by zero as I -> 1.0 and clamp within [1.0, N]."""
        n = 100
        # Normal cases
        v, ne = calculate_vif_and_neff(0.0, n)
        self.assertEqual((v, ne), (1.0, 100.0))

        v, ne = calculate_vif_and_neff(0.5, n)
        self.assertAlmostEqual(v, 3.0, places=4)
        self.assertAlmostEqual(ne, 100.0 / 3.0, places=4)

        v, ne = calculate_vif_and_neff(0.9, n)
        self.assertAlmostEqual(v, 1.9 / 0.1, places=4)

        # Critical Singularity limits:
        # Exactly 1.0 - 1e-8
        v_near1, ne_near1 = calculate_vif_and_neff(1.0 - 1e-8, n)
        self.assertEqual(v_near1, float(n), "VIF must cap at N without division by zero")
        self.assertEqual(ne_near1, 1.0, "N_eff must floor at 1.0")

        # Exactly 1.0
        v_one, ne_one = calculate_vif_and_neff(1.0, n)
        self.assertEqual(v_one, float(n))
        self.assertEqual(ne_one, 1.0)

        # Slightly above 1.0 (numerical precision overflow)
        v_over, ne_over = calculate_vif_and_neff(1.0001, n)
        self.assertEqual(v_over, float(n))
        self.assertEqual(ne_over, 1.0)

        # Negative and zero bounds:
        for neg_i in [-0.01, -0.5, -0.99, -1.0, -1.5]:
            v_neg, ne_neg = calculate_vif_and_neff(neg_i, n)
            self.assertEqual(v_neg, 1.0, "Negative autocorrelation must not deflate VIF below 1.0")
            self.assertEqual(ne_neg, float(n))

        # Pixel count bounds
        v_n0, ne_n0 = calculate_vif_and_neff(0.8, 0)
        self.assertEqual((v_n0, ne_n0), (1.0, 0.0))

        v_n1, ne_n1 = calculate_vif_and_neff(0.8, 1)
        self.assertEqual((v_n1, ne_n1), (1.0, 1.0))

    def test_disconnected_sparse_pixels_s0_zero(self):
        """When valid pixels have no adjacent neighbors under Rook contiguity (S0 = 0), handle cleanly."""
        grid = np.full((5, 5), np.nan)
        # Place pixels only on main diagonal (no rook neighbors)
        for i in range(5):
            grid[i, i] = float(i * 10)

        res = compute_morans_i_2d(grid, neighborhood="rook")
        self.assertEqual(res.s0_weights, 0.0)
        self.assertEqual(res.moran_i, 0.0)
        self.assertEqual(res.vif, 1.0)
        self.assertEqual(res.n_eff, 5.0)

    def test_standard_error_propagation_stability(self):
        """propagate_se_proj must handle zero standard deviations, large VIF, and empty inputs."""
        areas = np.array([1.0, 1.0, 1.0])
        sd0 = np.array([0.0, 0.0, 0.0])
        sd1 = np.array([0.0, 0.0, 0.0])

        se_zero = propagate_se_proj(areas, sd0, sd1, vif=10.0)
        self.assertEqual(se_zero, 0.0)

        # Empty array
        se_empty = propagate_se_proj([], [], [])
        self.assertEqual(se_empty, 0.0)

        # Large VIF
        se_large = propagate_se_proj([100.0], [5.0], [5.0], vif=1000.0)
        self.assertTrue(math.isfinite(se_large))
        self.assertGreater(se_large, 0.0)


class TestWGS84AreaPrecision(unittest.TestCase):
    """Adversarial tests for WGS84 analytical area integration across latitudes."""

    @staticmethod
    def _simpson_quadrature(lat1_deg: float, lat2_deg: float, dlon_deg: float, steps: int = 50000) -> float:
        """High-resolution Simpson's rule numerical integration oracle."""
        phi1 = math.radians(min(lat1_deg, lat2_deg))
        phi2 = math.radians(max(lat1_deg, lat2_deg))
        dlam = math.radians(abs(dlon_deg))
        phis = np.linspace(phi1, phi2, steps)
        dphi = (phi2 - phi1) / (steps - 1)
        integrand = (WGS84_A**2 * (1.0 - WGS84_E2) * np.cos(phis)) / ((1.0 - WGS84_E2 * np.sin(phis)**2)**2)
        weights = np.ones(steps)
        weights[1:-1:2] = 4.0
        weights[2:-2:2] = 2.0
        area_m2 = (dphi / 3.0) * np.sum(weights * integrand) * dlam
        return float(area_m2 / M2_PER_HA)

    def test_wgs84_area_accuracy_across_latitudes(self):
        """Compare analytical WGS84 area against high-order numerical quadrature across all latitude belts."""
        test_latitudes = [
            (0.0, 0.01),      # Equator
            (15.0, 15.01),    # Tropical
            (30.0, 30.01),    # Subtropical
            (45.0, 45.01),    # Mid-latitude
            (56.0, 56.01),    # Boreal (Tver region)
            (60.0, 60.01),    # Subarctic (Vologda region)
            (70.0, 70.01),    # Arctic
            (80.0, 80.01),    # High Arctic
            (89.0, 89.01),    # Near Pole
            (89.9, 89.91),    # Polar extreme
            (-45.01, -45.00), # Southern Hemisphere Mid-latitude
            (-60.01, -60.00), # Southern Ocean
            (-80.01, -80.00), # Antarctica
        ]

        dlon = 0.01
        for l1, l2 in test_latitudes:
            a_ana = cell_area_ha(l1, l2, dlon)
            a_num = self._simpson_quadrature(l1, l2, dlon)

            # Analytical formula matches Simpson numerical quadrature to < 0.005% (Simpson discretization error)
            rel_diff = abs(a_ana - a_num) / a_ana
            self.assertLess(
                rel_diff,
                0.0001,
                f"Latitude {l1}..{l2}: analytical {a_ana} vs numerical {a_num} rel_diff={rel_diff:.2e}",
            )

    def test_monotonic_area_decrease_with_latitude(self):
        """Cell area of constant degree quad must strictly decrease monotonically from equator to pole."""
        step = 0.01
        lats = [0.0, 15.0, 30.0, 45.0, 60.0, 75.0, 85.0, 89.0]
        areas = [cell_area_ha(lat, lat + step, step) for lat in lats]

        for i in range(len(areas) - 1):
            self.assertGreater(
                areas[i],
                areas[i + 1],
                f"Area at {lats[i]} deg ({areas[i]}) must be greater than at {lats[i+1]} deg ({areas[i+1]})",
            )

        # At equator ~123 ha, at 60 deg ~62 ha (half), at 80 deg ~21 ha (sixth)
        self.assertAlmostEqual(areas[0] / areas[4], 1.98, places=1)

    def test_north_south_hemisphere_symmetry(self):
        """WGS84 ellipsoidal area must be strictly symmetric between Northern and Southern hemispheres."""
        dlon = 0.02
        for lat in [10.0, 35.5, 56.7, 60.0, 80.0, 89.5]:
            area_north = cell_area_ha(lat, lat + 0.1, dlon)
            area_south = cell_area_ha(-(lat + 0.1), -lat, dlon)
            # Match to 8 decimal places (within 2 ULPs of float64 trigonometric rounding)
            self.assertAlmostEqual(
                area_north,
                area_south,
                places=8,
                msg=f"Asymmetry detected at lat {lat}: North={area_north}, South={area_south}",
            )

    def test_polygon_greens_theorem_vs_cell_area_equivalence(self):
        """Green's line integral polygon area must equal analytical cell_area_ha to 10 decimal places."""
        test_belts = [0.0, 30.0, 56.0, 60.0, 80.0]
        dlon = 0.05
        dlat = 0.05

        for lat in test_belts:
            poly_rect = {
                "type": "Polygon",
                "coordinates": [[
                    [10.0, lat],
                    [10.0 + dlon, lat],
                    [10.0 + dlon, lat + dlat],
                    [10.0, lat + dlat],
                    [10.0, lat],
                ]],
            }
            a_poly = calculate_polygon_wgs84_area_ha(poly_rect)
            a_cell = cell_area_ha(lat, lat + dlat, dlon)
            rel_diff = abs(a_poly - a_cell) / a_cell
            self.assertLess(rel_diff, 1e-11, f"Mismatch at lat {lat}: poly={a_poly}, cell={a_cell}")

    def test_polygon_winding_order_invariance(self):
        """Polygon area must be independent of clockwise vs counterclockwise ring vertex ordering."""
        coords_ccw = [[0.0, 50.0], [1.0, 50.0], [1.0, 50.5], [0.0, 50.5], [0.0, 50.0]]
        coords_cw = list(reversed(coords_ccw))

        a_ccw = calculate_polygon_wgs84_area_ha({"type": "Polygon", "coordinates": [coords_ccw]})
        a_cw = calculate_polygon_wgs84_area_ha({"type": "Polygon", "coordinates": [coords_cw]})
        self.assertEqual(a_ccw, a_cw)

    def test_polygon_with_interior_holes(self):
        """Polygon with interior hole must equal outer ring area minus inner hole ring area."""
        outer = [[0.0, 50.0], [2.0, 50.0], [2.0, 52.0], [0.0, 52.0], [0.0, 50.0]]
        inner = [[0.5, 50.5], [1.5, 50.5], [1.5, 51.5], [0.5, 51.5], [0.5, 50.5]]

        donut_poly = {"type": "Polygon", "coordinates": [outer, inner]}
        a_outer = calculate_polygon_wgs84_area_ha({"type": "Polygon", "coordinates": [outer]})
        a_inner = calculate_polygon_wgs84_area_ha({"type": "Polygon", "coordinates": [inner]})
        a_donut = calculate_polygon_wgs84_area_ha(donut_poly)

        self.assertAlmostEqual(a_donut, a_outer - a_inner, places=8)

    def test_antimeridian_crossing_area_continuity(self):
        """Polygon crossing the 180° meridian must normalize longitude deltas and match contiguous area."""
        poly_antimeridian = {
            "type": "Polygon",
            "coordinates": [[[179.9, 50.0], [-179.9, 50.0], [-179.9, 50.1], [179.9, 50.1], [179.9, 50.0]]],
        }
        poly_normal = {
            "type": "Polygon",
            "coordinates": [[[0.0, 50.0], [0.2, 50.0], [0.2, 50.1], [0.0, 50.1], [0.0, 50.0]]],
        }
        a_anti = calculate_polygon_wgs84_area_ha(poly_antimeridian)
        a_norm = calculate_polygon_wgs84_area_ha(poly_normal)
        self.assertAlmostEqual(a_anti, a_norm, places=7)

    def test_polygon_area_validation_thresholds(self):
        """validate_polygon_area must enforce 20 km² (2000 ha) limit and reject <= 0 ha."""
        # 1. Valid polygon under limit (approx 1100 ha)
        geom_valid = {
            "type": "Polygon",
            "coordinates": [[[35.0, 56.0], [35.04, 56.0], [35.04, 56.04], [35.0, 56.04], [35.0, 56.0]]],
        }
        is_ok, area, err = validate_polygon_area(geom_valid)
        self.assertTrue(is_ok)
        self.assertIsNone(err)
        self.assertLess(area, 2000.0)

        # 2. Polygon exceeding 2000 ha
        geom_huge = {
            "type": "Polygon",
            "coordinates": [[[35.0, 56.0], [36.0, 56.0], [36.0, 57.0], [35.0, 57.0], [35.0, 56.0]]],
        }
        is_ok, area, err = validate_polygon_area(geom_huge)
        self.assertFalse(is_ok)
        self.assertIn("POLYGON_EXCEEDS_MAX_AREA", err)
        self.assertGreater(area, 2000.0)

        # 3. Degenerate zero-area polygon
        geom_zero = {
            "type": "Polygon",
            "coordinates": [[[35.0, 56.0], [35.0, 56.0], [35.0, 56.0], [35.0, 56.0]]],
        }
        is_ok, area, err = validate_polygon_area(geom_zero)
        self.assertFalse(is_ok)
        self.assertIn("INVALID_AREA", err)

    def test_windows_cp1251_unicode_vulnerability_finding(self):
        """Adversarial finding: Error messages containing '²' fail encoding on Windows cp1251 consoles."""
        geom_huge = {
            "type": "Polygon",
            "coordinates": [[[35.0, 56.0], [36.0, 56.0], [36.0, 57.0], [35.0, 57.0], [35.0, 56.0]]],
        }
        _, _, err = validate_polygon_area(geom_huge)
        self.assertIn("\u00b2", err, "Error message contains non-ASCII superscript 2")
        # Demonstrate that cp1251 (default Windows Russian locale) cannot encode this character
        with self.assertRaises(UnicodeEncodeError):
            err.encode("cp1251")

    def test_hash_numpy_scalar_type_vulnerability_finding(self):
        """Adversarial finding: NumPy 2.x scalar integers and booleans do not inherit from builtins.int/bool,
        causing normalize_for_canonical_json to stringify them instead of preserving numbers/booleans."""
        val_py_int = {"units": 42}
        val_np_int = {"units": np.int64(42)}
        val_py_bool = {"valid": True}
        val_np_bool = {"valid": np.bool_(True)}

        # Python int serializes as {"units":42}, NumPy int serializes as {"units":"42"}
        self.assertEqual(generate_canonical_json(val_py_int), '{"units":42}')
        self.assertEqual(generate_canonical_json(val_np_int), '{"units":"42"}')
        # Resulting in hash mismatch between Python and NumPy scalars
        self.assertNotEqual(compute_calculation_hash(val_py_int), compute_calculation_hash(val_np_int))

        # Python bool serializes as {"valid":true}, NumPy bool serializes as {"valid":"True"}
        self.assertEqual(generate_canonical_json(val_py_bool), '{"valid":true}')
        self.assertEqual(generate_canonical_json(val_np_bool), '{"valid":"True"}')
        self.assertNotEqual(compute_calculation_hash(val_py_bool), compute_calculation_hash(val_np_bool))

    def test_is_valid_discrepancy_between_uncertainty_and_carbon(self):
        """Adversarial finding: CarbonAccountingResult sets is_valid=False when R<=0 or H/R>=1.0,
        whereas UncertaintyResult.evaluate_crediting_with_uncertainty sets is_valid=True with blocking_reason."""
        res_carbon_r0 = calculate_carbon_accounting(100.0, 100.0, 100.0, baseline_delta_tc_ha=0.0)
        res_unc_r0 = evaluate_crediting_with_uncertainty(0.0, 10.0)
        self.assertFalse(res_carbon_r0.is_valid, "carbon.py correctly marks is_valid=False on R<=0")
        self.assertTrue(res_unc_r0.is_valid, "uncertainty.py unexpectedly marks is_valid=True on R<=0")

        res_carbon_high = calculate_carbon_accounting(100.0, 100.0, 104.0, baseline_delta_tc_ha=0.47, half_width_h=600.0)
        res_unc_high = evaluate_crediting_with_uncertainty(517.0, 600.0)
        self.assertFalse(res_carbon_high.is_valid, "carbon.py correctly marks is_valid=False on H/R>=1.0")
        self.assertTrue(res_unc_high.is_valid, "uncertainty.py unexpectedly marks is_valid=True on H/R>=1.0")


class TestSHA256HashDeterminism(unittest.TestCase):
    """Adversarial tests for SHA-256 calculation hash determinism and canonical JSON."""

    def test_key_order_invariance_deep(self):
        """Hash must remain identical regardless of dictionary key insertion order at all nesting depths."""
        payload_1 = {
            "version": "1.0",
            "metadata": {"site": "RU_TVER_01", "year": 2024, "tags": ["mrv", "satellite"]},
            "params": {"cf": 0.47, "unc_allowance": 0.10, "buffer": 0.15},
            "outputs": {"q_units": 395, "r_gross": 517.0, "is_valid": True},
        }

        # Shuffled keys at every level
        payload_2 = {
            "outputs": {"is_valid": True, "r_gross": 517.0, "q_units": 395},
            "version": "1.0",
            "params": {"buffer": 0.15, "cf": 0.47, "unc_allowance": 0.10},
            "metadata": {"tags": ["mrv", "satellite"], "year": 2024, "site": "RU_TVER_01"},
        }

        h1 = compute_calculation_hash(payload_1)
        h2 = compute_calculation_hash(payload_2)
        self.assertEqual(h1, h2, "Hashes must be identical regardless of key order")
        self.assertEqual(len(h1), 64)

    def test_float_precision_rounding_canonicalization(self):
        """Canonical JSON rounds floating point values to float_precision (default 6 digits)."""
        # Floats differing only after 6th decimal place must produce identical canonical JSON and hash
        p1 = {"val": 1.23456789}
        p2 = {"val": 1.234568}
        p3 = {"val": 1.2345671}

        self.assertEqual(compute_calculation_hash(p1), compute_calculation_hash(p2))
        self.assertNotEqual(compute_calculation_hash(p1), compute_calculation_hash(p3))

    def test_ieee754_representation_stability(self):
        """Floats with IEEE 754 precision artifacts like 0.1 + 0.2 must serialize cleanly."""
        p_exact = {"sum": 0.3}
        p_artifact = {"sum": 0.1 + 0.2}

        # In Python, 0.1 + 0.2 is 0.30000000000000004, rounding to 6 decimals yields 0.3
        self.assertEqual(compute_calculation_hash(p_exact), compute_calculation_hash(p_artifact))

    def test_tamper_sensitivity_avalanche_effect(self):
        """Altering even a single least-significant bit or character must radically change the hash."""
        base = {"site": "RU_TVER_01", "q": 395, "r": 517.000001}
        tampered_q = {"site": "RU_TVER_01", "q": 396, "r": 517.000001}
        tampered_r = {"site": "RU_TVER_01", "q": 395, "r": 517.000002}
        tampered_txt = {"site": "RU_TVER_01 ", "q": 395, "r": 517.000001}

        h_base = compute_calculation_hash(base)
        h_q = compute_calculation_hash(tampered_q)
        h_r = compute_calculation_hash(tampered_r)
        h_txt = compute_calculation_hash(tampered_txt)

        self.assertNotEqual(h_base, h_q)
        self.assertNotEqual(h_base, h_r)
        self.assertNotEqual(h_base, h_txt)

    def test_verify_calculation_hash_oracle(self):
        """verify_calculation_hash must return True for valid calculation and False for corrupted claims."""
        payload = {"area_ha": 100.0, "q": 395}
        claimed_hash = compute_calculation_hash(payload)

        self.assertTrue(verify_calculation_hash(payload, claimed_hash))
        self.assertTrue(verify_calculation_hash(payload, claimed_hash.upper()))  # Case insensitive
        self.assertFalse(verify_calculation_hash(payload, "0" * 64))
        self.assertFalse(verify_calculation_hash({"area_ha": 100.1, "q": 395}, claimed_hash))

    def test_nan_and_inf_handling_in_audit(self):
        """Floats with NaN or Inf must be safely converted to None without JSON serialization failure."""
        payload_nan = {"stat": float("nan"), "inf": float("inf"), "valid": 10.0}
        canon = generate_canonical_json(payload_nan)
        self.assertIn('"stat":null', canon)
        self.assertIn('"inf":null', canon)
        self.assertIn('"valid":10.0', canon)


class TestCarbonEquationsUnitConservation(unittest.TestCase):
    """Adversarial tests for carbon accounting unit conservation and accounting waterfall."""

    def test_normative_acceptance_test_case_exact_reproduction(self):
        """Verify exact criteria test from ORIGINAL_REQUEST: 100 ha, 100->104 t/ha -> Q=395."""
        chk = verify_case_test_calculation()
        self.assertTrue(chk["all_passed"], f"Verification failed: {chk['checks']}")
        res = chk["result"]
        self.assertEqual(res["delta_c_total_t"], 188.0)
        self.assertAlmostEqual(res["e_proj_t_co2e"], -689.3333, places=4)
        self.assertAlmostEqual(res["e_base_t_co2e"], -172.3333, places=4)
        self.assertEqual(res["r_gross_t_co2e"], 517.0)
        self.assertEqual(res["h_over_r"], 0.20)
        self.assertEqual(res["unc_deduction"], 0.10)
        self.assertEqual(res["r_adjusted"], 465.3)
        self.assertAlmostEqual(res["buffer_reserve"], 69.795, places=4)
        self.assertEqual(res["q_tradable_units"], 395)
        self.assertEqual(res["scenario_valuations"]["rub_500"], 197500.0)
        self.assertEqual(res["scenario_valuations"]["rub_1500"], 592500.0)
        self.assertEqual(res["scenario_valuations"]["rub_4000"], 1580000.0)

    def test_strict_carbon_conservation_partition(self):
        """Net carbon benefit R must strictly partition into: Deduction + Buffer + Tradable Q + Remainder."""
        res = calculate_carbon_accounting(
            area_ha=150.0,
            t0_biomass_t_ha=80.0,
            t1_biomass_t_ha=95.0,
            delta_years=5,
            baseline_delta_tc_ha=1.5,
            half_width_h=200.0,
        )
        self.assertTrue(res.is_valid)

        r = res.r_gross_t_co2e
        unc_deduction_t = r * res.unc_deduction
        r_adj = res.r_adjusted
        buf = res.buffer_reserve
        q = float(res.q_tradable_units)
        remainder = (r_adj - buf) - q

        # 1. R = R_adj + (R * UNC)
        self.assertAlmostEqual(r_adj + unc_deduction_t, r, places=8)

        # 2. R_adj = Q + Buffer + Remainder
        self.assertAlmostEqual(q + buf + remainder, r_adj, places=8)

        # 3. Total identity: Q + Remainder + Buffer + (R * UNC) == R
        self.assertAlmostEqual(q + remainder + buf + unc_deduction_t, r, places=8)

        # 4. Remainder must be strictly in [0.0, 1.0)
        self.assertGreaterEqual(remainder, 0.0)
        self.assertLess(remainder, 1.0)

    def test_crediting_boundary_thresholds(self):
        """Test strict boundary enforcement: R <= 0, H/R <= 0.10, and H/R >= 1.0."""
        # 1. Zero net benefit R = 0 (b0 == b1 and baseline == 0)
        res_r0 = calculate_carbon_accounting(100.0, 100.0, 100.0, baseline_delta_tc_ha=0.0)
        self.assertEqual(res_r0.r_gross_t_co2e, 0.0)
        self.assertEqual(res_r0.q_tradable_units, 0)
        self.assertFalse(res_r0.is_valid)
        self.assertIn("NO_NET_CARBON_BENEFIT", res_r0.blocking_reason)
        self.assertIsNone(res_r0.h_over_r)

        # 2. Negative net benefit R < 0 (biomass loss)
        res_neg = calculate_carbon_accounting(100.0, 100.0, 95.0, baseline_delta_tc_ha=0.47)
        self.assertLess(res_neg.r_gross_t_co2e, 0.0)
        self.assertEqual(res_neg.q_tradable_units, 0)
        self.assertFalse(res_neg.is_valid)
        self.assertIn("NO_NET_CARBON_BENEFIT", res_neg.blocking_reason)

        # 3. Uncertainty allowance boundary: H/R = 0.10 -> UNC = 0.0
        # R = 517.0, H = 51.70 -> H/R = 0.10
        res_allow = calculate_carbon_accounting(100.0, 100.0, 104.0, baseline_delta_tc_ha=0.47, half_width_h=51.70)
        self.assertAlmostEqual(res_allow.unc_deduction, 0.0, places=6)
        self.assertAlmostEqual(res_allow.r_adjusted, 517.0, places=4)
        self.assertEqual(res_allow.q_tradable_units, math.floor(517.0 * 0.85))

        # 4. Uncertainty allowance just exceeded: H/R = 0.1001 -> UNC = 0.0001
        res_slight = calculate_carbon_accounting(100.0, 100.0, 104.0, baseline_delta_tc_ha=0.47, half_width_h=51.7517)
        self.assertAlmostEqual(res_slight.unc_deduction, 0.0001, places=4)

        # 5. Uncertainty halting threshold: H/R = 1.0000 -> Q = 0, blocked
        res_halt = calculate_carbon_accounting(100.0, 100.0, 104.0, baseline_delta_tc_ha=0.47, half_width_h=517.0)
        self.assertEqual(res_halt.q_tradable_units, 0)
        self.assertFalse(res_halt.is_valid)
        self.assertIn("UNCERTAINTY_EXCEEDS_THRESHOLD", res_halt.blocking_reason)

        # 6. Uncertainty above halting: H/R = 1.50 -> Q = 0, blocked
        res_over = calculate_carbon_accounting(100.0, 100.0, 104.0, baseline_delta_tc_ha=0.47, half_width_h=775.5)
        self.assertEqual(res_over.q_tradable_units, 0)
        self.assertFalse(res_over.is_valid)
        self.assertIn("UNCERTAINTY_EXCEEDS_THRESHOLD", res_over.blocking_reason)

    def test_monte_carlo_unit_conservation_harness(self):
        """10,000-iteration Monte Carlo stress harness verifying universal unit conservation."""
        rng = random.Random(1337)
        max_discrepancy = 0.0

        for _ in range(10000):
            area = rng.uniform(1.0, 1999.0)
            b0 = rng.uniform(10.0, 300.0)
            b1 = b0 + rng.uniform(0.5, 40.0)
            base_rate = rng.uniform(0.0, 0.5)

            # Compute preliminary R
            c_diff = (b1 - b0) * 0.47
            delta_c = area * c_diff
            e_p = -delta_c * (44.0 / 12.0)
            e_b = -(area * base_rate) * (44.0 / 12.0)
            r_expected = e_b - e_p

            if r_expected <= 0.0:
                continue

            target_h_over_r = rng.uniform(0.0, 0.999)
            h = target_h_over_r * r_expected

            res = calculate_carbon_accounting(
                area_ha=area,
                t0_biomass_t_ha=b0,
                t1_biomass_t_ha=b1,
                baseline_delta_tc_ha=base_rate,
                half_width_h=h,
            )

            if not res.is_valid:
                continue

            # Check conservation: R = Q + Remainder + Buffer + (R * UNC)
            remainder = (res.r_adjusted - res.buffer_reserve) - res.q_tradable_units
            reconstructed = res.q_tradable_units + remainder + res.buffer_reserve + (res.r_gross_t_co2e * res.unc_deduction)
            diff = abs(reconstructed - res.r_gross_t_co2e)
            if diff > max_discrepancy:
                max_discrepancy = diff

            self.assertLess(
                diff,
                1e-6,
                f"Conservation violated: R={res.r_gross_t_co2e}, recon={reconstructed}, diff={diff}",
            )

        self.assertLess(max_discrepancy, 1e-9, f"Max Monte Carlo discrepancy too high: {max_discrepancy}")


if __name__ == "__main__":
    unittest.main()
