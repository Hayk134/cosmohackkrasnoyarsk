"""backend/tests/test_b2b_geoai.py

Comprehensive Unit & Integration Test Suite for Kosmo·MRV Milestone M-B2B-2:
GeoAI, Climate & Environmental Engine

Covers:
1. Module 4: Dynamic Baseline Matching & Additionality Verification (/api/baseline)
   - Synthetic control / mirror site matching (RU_MORDOVIA_03 vs RU_MORDOVIA_04, RU_TVER_01 vs RU_VOLOGDA_02).
   - Match quality score Q_match in [0, 100] (>85% for Mordovia pair).
   - Additionality divergence delta (>1.15) and net CO2e benefit.
   - POST /api/baseline/match and GET /api/baseline/reference-comparison.
2. Module 5: AI Tree Species Classifier & Adaptive Carbon Fraction (/api/species)
   - Pure conifer stand (CF = 0.5100), pure birch stand (CF = 0.4500), broadleaved (CF = 0.4700).
   - Dynamic adaptive CF formula bounded in [0.45, 0.51].
   - Real Sentinel-2 multispectral classification with SCL cloud masking.
   - POST /api/species/classify.
3. Module 6: Fire Early Warning Radar & All-Weather SAR Monitoring (/api/radar)
   - NASA FIRMS thermal anomaly telemetry, Haversine distance, forward bearing, tiered alerts.
   - Sentinel-1 SAR C-band cloud-penetrating disturbance detection (delta VH <= -3.0 dB, delta gamma >= +0.35).
   - Optical blind days avoided (>10 days), 100% all-weather coverage.
   - GET /api/radar/firms-alerts and POST /api/radar/sar-monitoring.
4. Module 7: Climate Risk Projections to 2050 (/api/climate-risks)
   - IPCC CMIP6 SSP2-4.5 vs SSP5-8.5 trajectories across 2025..2050.
   - Nesterov fire multiplier (1.00 at 2025), SPEI drought anomaly, stand mortality.
   - 15% permanence buffer pool solvency stress testing (ADEQUATE under SSP2-4.5, DEFICIT under SSP5-8.5).
   - POST /api/climate-risks.
5. Module 10: AI Land Scout for Carbon Farms (/api/land-scout)
   - 5-factor composite Land Suitability Index (LSI in [0, 100]).
   - Classification: HIGH_POTENTIAL (>=75), MODERATE (50..75), NOT_RECOMMENDED (<50).
   - 15-year pre-feasibility tradable carbon credits (Q_15), CAPEX, NPV, and payback period.
   - POST /api/land-scout/evaluate.
"""

from __future__ import annotations

import unittest
from typing import Any, Dict
import numpy as np

from backend.app.api.routes_baseline import (
    get_reference_comparison,
    match_baseline,
)
from backend.app.api.routes_climate import evaluate_climate_risks
from backend.app.api.routes_land_scout import evaluate_candidate_land
from backend.app.api.routes_radar import get_firms_alerts, monitor_sar
from backend.app.api.routes_species import classify_species
from backend.app.core.baseline_matcher import (
    compute_similarity_distance,
    get_preset_reference_comparison,
    match_baseline_sites,
)
from backend.app.core.climate_risks import (
    compute_cmip6_scenario,
    project_climate_risks_to_2050,
)
from backend.app.core.land_scout import (
    compute_land_suitability_index,
    evaluate_land_scout,
)
from backend.app.core.radar import (
    bearing_to_cardinal,
    forward_azimuth_bearing,
    get_firms_hotspot_alerts,
    haversine_distance_km,
    monitor_sar_disturbance,
)
from backend.app.core.species import (
    classify_forest_species,
    classify_multispectral_pixels,
    compute_adaptive_cf,
)
from backend.app.schemas.baseline import (
    BaselineMatchingRequest,
    BaselineMatchingResponse,
    ReferenceComparisonResponse,
)
from backend.app.schemas.climate import (
    ClimateRiskRequest,
    ClimateRiskResponse,
)
from backend.app.schemas.land_scout import (
    LandScoutRequest,
    LandScoutResponse,
)
from backend.app.schemas.radar import (
    FIRMSAlertsResponse,
    SARMonitoringRequest,
    SARMonitoringResponse,
)
from backend.app.schemas.species import (
    SpeciesClassificationRequest,
    SpeciesClassificationResponse,
)


class TestDynamicBaselineMatching(unittest.TestCase):
    """Module 4: Dynamic Baseline Matching & Additionality Verification."""

    def test_mordovia_mirror_site_match_quality(self):
        """RU_MORDOVIA_03 matched with mirror site RU_MORDOVIA_04 yields Q_match > 85% and delta > 1.15."""
        req = BaselineMatchingRequest(site_id="RU_MORDOVIA_03", reference_site_id="RU_MORDOVIA_04")
        res = match_baseline_sites(req)

        self.assertIsInstance(res, BaselineMatchingResponse)
        self.assertEqual(res.project_site_id, "RU_MORDOVIA_03")
        self.assertEqual(res.reference_site_id, "RU_MORDOVIA_04")
        self.assertGreater(res.match_quality_score, 85.0)
        self.assertGreater(res.divergence_ratio, 1.15)
        self.assertEqual(res.verdict, "ADDITIONALITY_VERIFIED")
        self.assertGreater(res.additionality_co2e_t, 0.0)
        self.assertIsNotNone(res.calculation_hash)
        self.assertEqual(len(res.calculation_hash), 64)

    def test_tver_vologda_additionality_divergence(self):
        """RU_TVER_01 (protected) vs RU_VOLOGDA_02 (disturbed) yields positive net additionality."""
        req = BaselineMatchingRequest(site_id="RU_TVER_01", reference_site_id="RU_VOLOGDA_02")
        res = match_baseline_sites(req)

        self.assertGreater(res.additionality_net_t_ha, 0.0)
        self.assertGreater(res.divergence_ratio, 1.0)
        self.assertEqual(res.verdict, "ADDITIONALITY_VERIFIED")
        self.assertGreater(res.match_quality_score, 80.0)
        self.assertGreater(res.additionality_co2e_t, 10000.0)

    def test_custom_polygon_matching(self):
        """Arbitrary polygon evaluates correctly against reference forest."""
        poly = {
            "type": "Polygon",
            "coordinates": [[[32.91, 56.59], [32.91, 56.63], [32.97, 56.63], [32.97, 56.59], [32.91, 56.59]]],
        }
        req = BaselineMatchingRequest(polygon_geojson=poly)
        res = match_baseline_sites(req)

        self.assertIsInstance(res, BaselineMatchingResponse)
        self.assertGreater(res.match_quality_score, 0.0)
        self.assertIn(res.verdict, ["ADDITIONALITY_VERIFIED", "NON_ADDITIONAL_RISK"])

    def test_baseline_endpoints(self):
        """REST API routes for matching and quick reference comparison return valid schemas."""
        req = BaselineMatchingRequest(site_id="RU_MORDOVIA_03")
        res = match_baseline(req)
        self.assertEqual(res.project_site_id, "RU_MORDOVIA_03")

        comp = get_reference_comparison("RU_MORDOVIA_03")
        self.assertIsInstance(comp, ReferenceComparisonResponse)
        self.assertEqual(comp.site_id, "RU_MORDOVIA_03")
        self.assertEqual(comp.reference_site_id, "RU_MORDOVIA_04")
        self.assertGreater(comp.distance_km, 0.0)


class TestAITreeSpeciesClassifier(unittest.TestCase):
    """Module 5: AI Tree Species Classifier & Adaptive Carbon Fraction."""

    def test_pure_conifer_stand_carbon_fraction(self):
        """Pure coniferous stand (pine/spruce) yields CF = 0.5100."""
        cf, delta, dominant = compute_adaptive_cf(s_conifer=1.0, s_small_leaved=0.0, s_broadleaved=0.0)
        self.assertAlmostEqual(cf, 0.5100, places=4)
        self.assertEqual(dominant, "CONIFEROUS")
        self.assertGreater(delta, 0.0)  # +8.51% over 0.47

    def test_pure_birch_stand_carbon_fraction(self):
        """Pure small-leaved deciduous stand (birch/aspen) yields CF = 0.4500."""
        cf, delta, dominant = compute_adaptive_cf(s_conifer=0.0, s_small_leaved=1.0, s_broadleaved=0.0)
        self.assertAlmostEqual(cf, 0.4500, places=4)
        self.assertEqual(dominant, "SMALL_LEAVED_DECIDUOUS")
        self.assertLess(delta, 0.0)  # -4.26% relative to 0.47

    def test_pure_broadleaved_stand_carbon_fraction(self):
        """Pure broadleaved hardwood stand (oak/linden) yields CF = 0.4700."""
        cf, delta, dominant = compute_adaptive_cf(s_conifer=0.0, s_small_leaved=0.0, s_broadleaved=1.0)
        self.assertAlmostEqual(cf, 0.4700, places=4)
        self.assertEqual(dominant, "BROADLEAVED")
        self.assertAlmostEqual(delta, 0.0, places=2)

    def test_mixed_stand_weighted_cf(self):
        """Mixed stand computes exact weighted linear combination of species carbon fractions."""
        # 50% conifer (0.51), 30% birch (0.45), 20% oak (0.47) -> 0.51*0.5 + 0.45*0.3 + 0.47*0.2 = 0.4840
        cf, delta, dominant = compute_adaptive_cf(s_conifer=0.50, s_small_leaved=0.30, s_broadleaved=0.20)
        expected = 0.51 * 0.50 + 0.45 * 0.30 + 0.47 * 0.20
        self.assertAlmostEqual(cf, expected, places=4)
        self.assertEqual(dominant, "CONIFEROUS")

    def test_bounds_strict_containment(self):
        """Adaptive CF is mathematically bounded within [0.45, 0.51]."""
        for s_c in [0.0, 0.2, 0.5, 0.8, 1.0]:
            for s_s in [0.0, 0.2, 0.5, 0.8, 1.0]:
                s_b = max(0.0, 1.0 - s_c - s_s)
                tot = s_c + s_s + s_b
                if tot > 0:
                    cf, _, _ = compute_adaptive_cf(s_c / tot, s_s / tot, s_b / tot)
                    self.assertGreaterEqual(cf, 0.450)
                    self.assertLessEqual(cf, 0.510)

    def test_multispectral_spectral_decision_rules(self):
        """Multispectral pixel classifier categorizes pixels per spectral ratios."""
        # Synthetic Conifer: R11/8 = 0.18 / 0.25 = 0.72 >= 0.60, NIR = 0.25 <= 0.30
        b02 = np.array([0.03])
        b03 = np.array([0.05])
        b04 = np.array([0.03])
        b8a = np.array([0.25])
        b11 = np.array([0.18])
        scl = np.array([4])

        s_c, s_s, s_b, valid, conf = classify_multispectral_pixels(b02, b03, b04, b8a, b11, scl=scl)
        self.assertEqual(valid, 1)
        self.assertEqual(s_c, 1.0)
        self.assertEqual(s_s, 0.0)
        self.assertEqual(s_b, 0.0)

        # Synthetic Birch: R11/8 = 0.12 / 0.35 = 0.34 < 0.60, R4/3 = 0.025 / 0.05 = 0.50 <= 0.62
        b8a_birch = np.array([0.35])
        b11_birch = np.array([0.12])
        b03_birch = np.array([0.05])
        b04_birch = np.array([0.025])
        s_c2, s_s2, s_b2, valid2, _ = classify_multispectral_pixels(
            b02, b03_birch, b04_birch, b8a_birch, b11_birch, scl=scl
        )
        self.assertEqual(valid2, 1)
        self.assertEqual(s_c2, 0.0)
        self.assertEqual(s_s2, 1.0)
        self.assertEqual(s_b2, 0.0)

    def test_real_sentinel2_classification_tver(self):
        """Full classification execution on RU_TVER_01 Sentinel-2 raster."""
        res = classify_species(SpeciesClassificationRequest(site_id="RU_TVER_01"))
        self.assertIsInstance(res, SpeciesClassificationResponse)
        self.assertGreaterEqual(res.adaptive_cf, 0.45)
        self.assertLessEqual(res.adaptive_cf, 0.51)
        self.assertGreater(res.total_valid_pixels, 1000)
        self.assertIsNotNone(res.calculation_hash)


class TestFireRadarAndCloudSAR(unittest.TestCase):
    """Module 6: Fire Early Warning Radar & Sentinel-1 SAR Cloud Penetration."""

    def test_haversine_distance_and_bearing_calculation(self):
        """Geodesic distance and forward bearing formulas produce accurate spatial vectors."""
        # Distance from (54.87, 43.20) to (54.87, 43.30) is ~6.4 km due east (bearing ~90 deg)
        dist = haversine_distance_km(54.87, 43.20, 54.87, 43.30)
        self.assertAlmostEqual(dist, 6.42, delta=0.5)

        bearing = forward_azimuth_bearing(54.87, 43.20, 54.87, 43.30)
        self.assertAlmostEqual(bearing, 90.0, delta=2.0)
        self.assertEqual(bearing_to_cardinal(bearing), "E")

    def test_firms_hotspot_telemetry_tiers(self):
        """Hotspot telemetry correctly maps distance to alert tiers."""
        # Mordovia hotspot at ~0.46 km triggers CRITICAL
        alerts_m = get_firms_hotspot_alerts(site_id="RU_MORDOVIA_03", radius_km=50.0)
        self.assertIsInstance(alerts_m, FIRMSAlertsResponse)
        self.assertGreater(alerts_m.hotspots_detected, 0)
        self.assertLess(alerts_m.closest_distance_km, 5.0)
        self.assertEqual(alerts_m.threat_level, "CRITICAL")
        self.assertEqual(alerts_m.alerts[0].alert_level, "CRITICAL")

        # Tver site with 0 nearby hotspots returns SAFE
        alerts_t = get_firms_hotspot_alerts(site_id="RU_TVER_01", radius_km=25.0)
        self.assertEqual(alerts_t.hotspots_detected, 0)
        self.assertEqual(alerts_t.threat_level, "SAFE")

    def test_sar_cloud_penetration_monitoring(self):
        """Sentinel-1 SAR C-band radar detects canopy disturbances under overcast skies."""
        # Mordovia 03 with wildfire disturbance
        res_m = monitor_sar(SARMonitoringRequest(site_id="RU_MORDOVIA_03"))
        self.assertIsInstance(res_m, SARMonitoringResponse)
        self.assertTrue(res_m.disturbance_detected)
        self.assertLessEqual(res_m.backscatter_delta_vh_db, -3.0)
        self.assertGreaterEqual(res_m.coherence_delta, 0.35)
        self.assertEqual(res_m.cloud_penetration_status, "PENETRATING_OVERCAST")
        self.assertEqual(res_m.all_weather_coverage_pct, 100.0)
        self.assertGreater(res_m.optical_cloud_blind_days_avoided, 10)

        # Tver 01 intact control canopy
        res_t = monitor_sar(SARMonitoringRequest(site_id="RU_TVER_01"))
        self.assertFalse(res_t.disturbance_detected)
        self.assertGreater(res_t.backscatter_delta_vh_db, -3.0)
        self.assertLess(res_t.coherence_delta, 0.35)


class TestClimateRiskProjections2050(unittest.TestCase):
    """Module 7: IPCC CMIP6 Climate Risk Projections to 2050."""

    def test_baseline_year_2025_indicators(self):
        """Year 2025 baseline exhibits neutral anomaly multipliers."""
        ssp2 = compute_cmip6_scenario("SSP2-4.5")
        base_proj = ssp2.projections[0]
        self.assertEqual(base_proj.year, 2025)
        self.assertEqual(base_proj.fire_hazard_multiplier, 1.000)
        self.assertEqual(base_proj.temperature_anomaly_c, 0.0)
        self.assertEqual(base_proj.spei_drought_anomaly, 0.0)

    def test_ssp245_moderate_pathway_buffer_adequacy(self):
        """Under SSP2-4.5, 2050 cumulative permanence risk is < 15% (ADEQUATE)."""
        ssp2 = compute_cmip6_scenario("SSP2-4.5", buffer_reserve_pct=15.0)
        self.assertLess(ssp2.cumulative_permanence_risk_2050_pct, 15.0)
        self.assertEqual(ssp2.buffer_adequacy_status, "ADEQUATE")
        self.assertEqual(ssp2.recommended_buffer_rate_pct, 15.0)

    def test_ssp585_extreme_pathway_buffer_deficit(self):
        """Under SSP5-8.5, 2050 cumulative permanence risk exceeds 25% (DEFICIT)."""
        ssp5 = compute_cmip6_scenario("SSP5-8.5", buffer_reserve_pct=15.0)
        self.assertGreater(ssp5.cumulative_permanence_risk_2050_pct, 25.0)
        self.assertEqual(ssp5.buffer_adequacy_status, "DEFICIT")
        self.assertGreaterEqual(ssp5.recommended_buffer_rate_pct, 25.0)

    def test_climate_risks_endpoint(self):
        """POST /api/climate-risks returns dual scenario projections and solvency verdict."""
        res = evaluate_climate_risks(ClimateRiskRequest(site_id="RU_TVER_01", buffer_reserve_pct=15.0))
        self.assertIsInstance(res, ClimateRiskResponse)
        self.assertIn("SSP2-4.5", res.scenarios)
        self.assertIn("SSP5-8.5", res.scenarios)
        self.assertEqual(res.buffer_pool_adequacy_2050, "ADEQUATE_UNDER_SSP245_DEFICIT_UNDER_SSP585")
        self.assertIn("Permanence stress test", res.executive_summary)
        self.assertIsNotNone(res.calculation_hash)


class TestAILandScout(unittest.TestCase):
    """Module 10: AI Land Scout for Carbon Farms."""

    def test_lsi_formula_and_recommendation_tiers(self):
        """5-factor LSI scoring correctly maps to HIGH_POTENTIAL, MODERATE, NOT_RECOMMENDED."""
        # High potential: zero fire penalty, strong bio & seq
        lsi_h, rec_h = compute_land_suitability_index(s_bio=85.0, s_seq=90.0, s_water=85.0, s_infra=80.0, p_fire=0.0)
        self.assertGreaterEqual(lsi_h, 75.0)
        self.assertEqual(rec_h, "HIGH_POTENTIAL")

        # Moderate potential
        lsi_m, rec_m = compute_land_suitability_index(s_bio=65.0, s_seq=60.0, s_water=60.0, s_infra=60.0, p_fire=5.0)
        self.assertTrue(50.0 <= lsi_m < 75.0)
        self.assertEqual(rec_m, "MODERATE")

        # Not recommended: high fire penalty, low productivity
        lsi_l, rec_l = compute_land_suitability_index(s_bio=40.0, s_seq=30.0, s_water=30.0, s_infra=30.0, p_fire=25.0)
        self.assertLess(lsi_l, 50.0)
        self.assertEqual(rec_l, "NOT_RECOMMENDED")

    def test_fifteen_year_prefeasibility_financials(self):
        """15-year pre-feasibility modeling produces valid tradable credits, CAPEX, NPV, and payback."""
        poly = {
            "type": "Polygon",
            "coordinates": [[[32.91, 56.59], [32.91, 56.63], [32.97, 56.63], [32.97, 56.59], [32.91, 56.59]]],
        }
        req = LandScoutRequest(
            polygon_geojson=poly,
            target_species="PINE_SPRUCE",
            seedling_cost_rub_ha=75000.0,
            carbon_price_rub=1500.0,
            discount_rate=0.12,
        )
        res = evaluate_candidate_land(req)

        self.assertIsInstance(res, LandScoutResponse)
        self.assertGreater(res.area_ha, 0.0)
        self.assertGreater(res.fifteen_yr_tradable_credits_est, 0)
        self.assertGreater(res.estimated_capex_rub, 0.0)
        self.assertGreater(res.estimated_15yr_revenue_rub, 0.0)
        self.assertIsNotNone(res.simple_payback_years)
        self.assertGreater(res.simple_payback_years, 0.0)
        self.assertIsNotNone(res.calculation_hash)


if __name__ == "__main__":
    unittest.main()
