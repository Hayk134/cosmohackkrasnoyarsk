"""backend/tests/test_super_accuracy.py

Automated Test Suite for Tier 3 Ultra-Precision MRV Engine using standard unittest.
"""

import unittest
import numpy as np
from fastapi.testclient import TestClient

from backend.app.core.super_accuracy import (
    calculate_bayesian_calibration,
    calculate_five_pools_carbon,
    compute_phenology_harmonics,
    run_ultra_precision_pipeline,
    unmix_pixel_sma,
)
from backend.app.main import app

client = TestClient(app)


class TestSuperAccuracyEngine(unittest.TestCase):

    def test_sma_unmixing_constraints(self):
        sample_reflectance = [0.024, 0.041, 0.030, 0.295, 0.145, 0.075]
        res = unmix_pixel_sma(sample_reflectance)

        self.assertIn("conifer", res)
        self.assertIn("deciduous", res)
        self.assertIn("understory_soil", res)
        self.assertIn("shadow_gap", res)
        self.assertIn("rmse", res)

        total_fraction = res["conifer"] + res["deciduous"] + res["understory_soil"] + res["shadow_gap"]
        self.assertAlmostEqual(total_fraction, 1.0, places=2)

        for k in ["conifer", "deciduous", "understory_soil", "shadow_gap"]:
            self.assertGreaterEqual(res[k], 0.0)

    def test_bayesian_calibration_variance_reduction(self):
        res = calculate_bayesian_calibration(
            satellite_agb_mean=120.0,
            satellite_agb_std=11.0,
            uav_coverage_pct=1.5,
            uav_point_density_pts_m2=250.0,
        )

        prior = res["prior_satellite"]
        post = res["posterior_calibrated"]

        self.assertGreater(post["variance_reduction_pct"], 80.0)
        self.assertLess(post["agb_std_t_ha"], prior["agb_std_t_ha"])
        self.assertGreaterEqual(post["calibrated_accuracy_pct"], 98.0)
        self.assertGreater(post["accuracy_boost_pct"], 0.0)

    def test_phenology_harmonics_extraction(self):
        doy = np.linspace(1, 365, 36)
        ndvi = 0.40 + 0.35 * np.cos((doy - 200) * (2 * np.pi / 365))
        res = compute_phenology_harmonics(doy, ndvi)

        self.assertIn("peak_vegetation_doy", res)
        self.assertIn("greenup_doy", res)
        self.assertIn("senescence_doy", res)
        self.assertGreater(res["season_length_days"], 60)

    def test_five_pools_carbon_conservation(self):
        res = calculate_five_pools_carbon(
            agb_t_ha=100.0,
            area_ha=50.0,
            dominant_species="pine",
            soil_type="podzol",
        )

        pools = res["pools_per_ha"]
        totals = res["polygon_totals"]

        self.assertEqual(pools["agb_carbon_t_c_ha"], 51.0)
        self.assertAlmostEqual(pools["bgb_roots_carbon_t_c_ha"], 51.0 * 0.22, places=2)
        self.assertGreater(pools["deadwood_cwd_carbon_t_c_ha"], 0)
        self.assertEqual(pools["soil_organic_carbon_soc_t_c_ha"], 68.5)

        share_sum = (
            totals["share_agb_pct"]
            + totals["share_bgb_pct"]
            + totals["share_deadwood_pct"]
            + totals["share_litter_pct"]
            + totals["share_soil_soc_pct"]
        )
        self.assertAlmostEqual(share_sum, 100.0, delta=0.5)

    def test_api_accuracy_pipeline(self):
        response = client.post(
            "/api/accuracy/pipeline",
            json={
                "site_id": "RU_TVER_01",
                "area_ha": 150.0,
                "baseline_agb_t_ha": 115.0,
                "uav_coverage_pct": 2.0,
                "uav_point_density": 300.0,
                "dominant_species": "pine",
                "soil_type": "podzol",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["site_id"], "RU_TVER_01")
        self.assertIn("subpixel_sma", data)
        self.assertIn("bayesian_calibration", data)
        self.assertIn("five_pools_carbon", data)
        self.assertEqual(len(data["cryptographic_seal"]), 64)


if __name__ == "__main__":
    unittest.main()
