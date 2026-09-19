"""backend/tests/test_b2b_tax_shield.py

Unit tests for B2B Tax Shield (296-FZ) Engine and API endpoints.
Verifies:
1. Preset enterprise resolution (Severstal, Nornickel, T Plus, NLMK, EuroChem, Gazprom Neft).
2. Arbitrary 10-digit INN fallback resolution.
3. Tax arbitrage financial math (Statutory fee vs Forest quota vs Net savings vs 3.5% commission).
4. One-click budget protection (certificate ID, registry record, hash generation).
5. FastAPI endpoint integration (/api/ai/tax-shield/calculate, /api/ai/tax-shield/protect-budget, /api/ai/ask with inn).
"""

import unittest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.tax_shield import (
    calculate_tax_shield,
    protect_enterprise_budget,
    resolve_enterprise_profile,
    clean_inn,
    PRESET_ENTERPRISES,
)


class TestB2BTaxShield(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_severstal_preset_resolution(self):
        profile = resolve_enterprise_profile("3528000597")
        self.assertEqual(profile.inn, "3528000597")
        self.assertIn("Северсталь", profile.company_name)
        self.assertEqual(profile.annual_emissions_t_co2, 80000.0)

    def test_severstal_tax_arbitrage_math(self):
        calc = calculate_tax_shield("3528000597")
        # 80,000 t * 1,500 = 120,000,000
        self.assertEqual(calc.statutory_tax_rub, 120000000.0)
        # 80,000 t * 562.5 = 45,000,000
        self.assertEqual(calc.forest_quota_cost_rub, 45000000.0)
        # Net savings = 75,000,000
        self.assertEqual(calc.net_savings_rub, 75000000.0)
        # Commission 3.5% = 2,625,000
        self.assertAlmostEqual(calc.platform_commission_rub, 2625000.0, places=2)
        self.assertAlmostEqual(calc.savings_pct, 62.5, places=1)
        self.assertTrue(len(calc.calculation_hash) > 8)

    def test_invalid_inn_length_raises_error(self):
        # 76876788 from user request (8 digits instead of 10)
        invalid_inn = "76876788"
        with self.assertRaises(ValueError) as ctx:
            calculate_tax_shield(invalid_inn)
        self.assertIn("Неверный ИНН", str(ctx.exception))
        self.assertIn("10 цифр", str(ctx.exception))

        # API must return 400 Bad Request with clear detail
        res = self.client.post("/api/ai/tax-shield/calculate", json={"inn": invalid_inn})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Неверный ИНН", res.json()["detail"])

        res_ask = self.client.post(
            "/api/ai/ask",
            json={"question": "Расчет", "inn": invalid_inn, "persona": "tax_shield"},
        )
        self.assertEqual(res_ask.status_code, 400)
        self.assertIn("Неверный ИНН", res_ask.json()["detail"])

    def test_invalid_checksum_raises_error(self):
        # 10 digits but invalid FNS checksum
        bad_checksum_inn = "1234567890"
        with self.assertRaises(ValueError) as ctx:
            calculate_tax_shield(bad_checksum_inn)
        self.assertIn("Неверный ИНН", str(ctx.exception))
        self.assertIn("контрольный разряд", str(ctx.exception))

        res = self.client.post("/api/ai/tax-shield/calculate", json={"inn": bad_checksum_inn})
        self.assertEqual(res.status_code, 400)
        self.assertIn("контрольный разряд", res.json()["detail"])

    def test_unknown_inn_not_in_registry_raises_error(self):
        # Valid 10-digit INN with valid checksum (7701998870: check digit 0)
        # but not an authorized 296-FZ industrial emitter in registry
        unknown_valid_inn = "7701998870"
        with self.assertRaises(KeyError) as ctx:
            resolve_enterprise_profile(unknown_valid_inn)
        self.assertIn("не найдено в государственном реестре", str(ctx.exception))

        res = self.client.post("/api/ai/tax-shield/calculate", json={"inn": unknown_valid_inn})
        self.assertEqual(res.status_code, 400)
        self.assertIn("не найдено в государственном реестре", res.json()["detail"])

    def test_verified_real_enterprises(self):
        # Verify Gazprom Neft (5504036333), Rosneft (7706107510), Sberbank (7707083893)
        for real_inn in ["5504036333", "7706107510", "7707083893"]:
            calc = calculate_tax_shield(real_inn)
            self.assertTrue(calc.net_savings_rub > 0)
            self.assertTrue(calc.forest_quota_cost_rub < calc.statutory_tax_rub)

    def test_protect_budget_execution(self):
        res = protect_enterprise_budget("3528000597")
        self.assertTrue(res.success)
        self.assertEqual(res.status, "BUDGET_PROTECTED_RESERVED")
        self.assertTrue(res.certificate_id.startswith("KOSMO-SHIELD-"))
        self.assertTrue(res.registry_record_id.startswith("REG-296FZ-TX-"))

    def test_api_calculate_endpoint(self):
        response = self.client.post("/api/ai/tax-shield/calculate", json={"inn": "3528000597"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["net_savings_rub"], 75000000.0)
        self.assertEqual(data["statutory_tax_rub"], 120000000.0)
        self.assertEqual(data["forest_quota_cost_rub"], 45000000.0)

    def test_api_protect_budget_endpoint(self):
        response = self.client.post("/api/ai/tax-shield/protect-budget", json={"inn": "3528000597"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertTrue(data["certificate_id"].startswith("KOSMO-SHIELD-"))

    def test_api_ask_with_inn(self):
        response = self.client.post(
            "/api/ai/ask",
            json={
                "question": "Рассчитать налоговую оптимизацию по 296-ФЗ",
                "inn": "3528000597",
                "persona": "tax_shield",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["persona"], "tax_shield")
        self.assertTrue("B2B" in data["answer"] or "296-ФЗ" in data["answer"])
        self.assertTrue("75,000,000" in data["answer"] or "75 000 000" in data["answer"])


if __name__ == "__main__":
    unittest.main()
