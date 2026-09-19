"""backend/tests/test_open_data.py
Tests for open satellite data and STAC API discovery endpoints.
"""

import unittest
from fastapi.testclient import TestClient
from backend.app.main import app


class TestOpenDataEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_open_data_status(self):
        resp = self.client.get("/api/open-data/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("earth_search_stac", data)
        self.assertIn("local_cache_coverage", data)
        self.assertTrue(data["local_cache_coverage"]["offline_reproducible"])

    def test_open_data_sources_catalog(self):
        resp = self.client.get("/api/open-data/sources")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)
        # Check that ESA CCI Biomass is present in sources
        found_cci = any("CCI" in s.get("product", "") or "ESA" in s.get("product", "") for s in data)
        self.assertTrue(found_cci)

    def test_sentinel2_stac_search(self):
        payload = {
            "bbox": [32.91, 56.59, 32.974, 56.63],
            "start_date": "2019-01-01",
            "end_date": "2024-12-31",
            "max_cloud_cover": 50.0,
            "limit": 5,
        }
        resp = self.client.post("/api/open-data/sentinel2/search", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["collection"], "sentinel-2-l2a")
        self.assertIn("items", data)
        self.assertGreater(len(data["items"]), 0)


if __name__ == "__main__":
    unittest.main()
