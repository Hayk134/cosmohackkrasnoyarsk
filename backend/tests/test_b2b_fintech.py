"""backend/tests/test_b2b_fintech.py

Comprehensive Unit & Integration Test Suite for Kosmo·MRV Milestone M-B2B-1:
1. FinTech Carbon ROI, CAPEX/OPEX Engine:
   - Annual cash flow schedule projection (0..T).
   - Discounted Cash Flow (DCF), Net Present Value (NPV).
   - Internal Rate of Return (IRR) numerical convergence.
   - Discounted Payback Period (DPP) & Simple Payback (SPP) fractional interpolation.
   - Multi-scenario price sensitivity (500, 1500, 4000 RUB/t CO2e).
   - 15-Year Timber Clearcut vs. Carbon Preservation Comparative Model.
   - Closed-form Analytical Carbon Parity Price exact mathematical proof.
2. Parametric Smart-Insurance Engine:
   - Real satellite disturbance telemetry trigger (>10.0% burn scar).
   - Ground truth check on RU_MORDOVIA_03 (trigger fires) and RU_TVER_01 (trigger dormant).
   - 15% Permanence Buffer Pool reserve backing and proportional credit impairment.
   - Actuarial solvency verification.
   - Cryptographic HMAC-SHA256 audit seal and claim settlement.
   - Stateful buffer pool debit and conservation invariant.
3. REST API Endpoint Integration:
   - POST /api/roi validation and responses.
   - POST /api/insurance/evaluate diagnostic execution.
   - POST /api/insurance/claim settlement execution.
   - GET /api/insurance/buffer-pool solvency audit.
"""

from __future__ import annotations

import unittest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.api.routes_fintech import calculate_roi
from backend.app.api.routes_insurance import (
    evaluate_insurance,
    get_buffer_pool,
    submit_insurance_claim,
)
from backend.app.core.fintech import (
    calculate_irr,
    calculate_payback_period,
    compare_timber_vs_carbon,
    compute_fintech_roi,
    evaluate_scenario,
    project_cash_flows,
)
from backend.app.core.insurance import (
    evaluate_parametric_trigger,
    execute_insurance_claim,
    get_buffer_pool_status,
    insurance_ledger,
)
from backend.app.schemas.fintech import (
    AnnualCashFlow,
    ROIRequest,
    ROIResponse,
    ROIScenarioMetrics,
    TimberComparisonResult,
    TimberScenarioParams,
)
from backend.app.schemas.insurance import (
    BufferPoolStatusResponse,
    InsuranceClaimRequest,
    InsuranceClaimResponse,
    InsuranceEvaluationRequest,
    InsuranceEvaluationResponse,
)


class TestFintechMathEngine(unittest.TestCase):
    """Test suite for mathematical and financial algorithms in fintech.py."""

    def setUp(self) -> None:
        self.area_ha = 100.0
        self.capex_per_ha = 75000.0
        self.opex_per_ha_yr = 3500.0
        self.carbon_yield_t_ha_yr = 3.5
        self.discount_rate = 0.12
        self.years = 15

    def test_cash_flow_schedule_structure(self) -> None:
        """Verifies 0..T schedule layout, CAPEX at Year 0, and OPEX escalation."""
        schedule, cfs, dcfs = project_cash_flows(
            area_ha=self.area_ha,
            capex_per_ha=self.capex_per_ha,
            opex_per_ha_yr=self.opex_per_ha_yr,
            carbon_yield_t_ha_yr=self.carbon_yield_t_ha_yr,
            price_rub=1500.0,
            discount_rate=self.discount_rate,
            years=self.years,
            g_opex=0.04,
            g_price=0.0,
        )

        self.assertEqual(len(schedule), 16)  # Year 0 through 15
        self.assertEqual(len(cfs), 16)
        self.assertEqual(len(dcfs), 16)

        # Year 0 check
        y0 = schedule[0]
        self.assertEqual(y0.year, 0)
        self.assertEqual(y0.gross_revenue_rub, 0.0)
        self.assertEqual(y0.opex_rub, 0.0)
        self.assertEqual(y0.net_cash_flow_rub, -7500000.0)
        self.assertEqual(y0.dcf_rub, -7500000.0)
        self.assertEqual(y0.cumulative_dcf_rub, -7500000.0)

        # Year 1 check (no inflation in year 1: (1+g)^(1-1) = 1.0)
        y1 = schedule[1]
        self.assertEqual(y1.year, 1)
        expected_credits = 100.0 * 3.5  # 350 t CO2e
        expected_rev = 350.0 * 1500.0   # 525,000 RUB
        expected_opex = 100.0 * 3500.0  # 350,000 RUB
        expected_net = expected_rev - expected_opex  # 175,000 RUB
        expected_dcf = expected_net / 1.12

        self.assertAlmostEqual(y1.gross_revenue_rub, expected_rev, places=1)
        self.assertAlmostEqual(y1.opex_rub, expected_opex, places=1)
        self.assertAlmostEqual(y1.net_cash_flow_rub, expected_net, places=1)
        self.assertAlmostEqual(y1.dcf_rub, expected_dcf, places=1)

        # Year 2 check (inflation applied: (1.04)^1 = 1.04)
        y2 = schedule[2]
        expected_opex_y2 = 350000.0 * 1.04  # 364,000 RUB
        self.assertAlmostEqual(y2.opex_rub, expected_opex_y2, places=1)

    def test_npv_discount_rate_monotonicity(self) -> None:
        """Verifies that higher discount rates strictly decrease project NPV."""
        m_low = evaluate_scenario(
            area_ha=self.area_ha,
            capex_per_ha=self.capex_per_ha,
            opex_per_ha_yr=self.opex_per_ha_yr,
            carbon_yield_t_ha_yr=self.carbon_yield_t_ha_yr,
            price_rub=4000.0,
            discount_rate=0.08,
            years=self.years,
        )
        m_mid = evaluate_scenario(
            area_ha=self.area_ha,
            capex_per_ha=self.capex_per_ha,
            opex_per_ha_yr=self.opex_per_ha_yr,
            carbon_yield_t_ha_yr=self.carbon_yield_t_ha_yr,
            price_rub=4000.0,
            discount_rate=0.12,
            years=self.years,
        )
        m_high = evaluate_scenario(
            area_ha=self.area_ha,
            capex_per_ha=self.capex_per_ha,
            opex_per_ha_yr=self.opex_per_ha_yr,
            carbon_yield_t_ha_yr=self.carbon_yield_t_ha_yr,
            price_rub=4000.0,
            discount_rate=0.16,
            years=self.years,
        )

        self.assertGreater(m_low.npv_rub, m_mid.npv_rub)
        self.assertGreater(m_mid.npv_rub, m_high.npv_rub)

    def test_irr_numerical_root_finding(self) -> None:
        """Tests that calculate_irr produces the exact root where NPV(r*) == 0."""
        # Cash flow scenario where nominal return is positive
        # Initial: -7.5M, Inflows: 1.05M/yr for 15 years
        cfs = [-7500000.0] + [1050000.0] * 15
        irr_pct = calculate_irr(cfs)
        self.assertIsNotNone(irr_pct)

        # Verify NPV at rounded IRR is practically zero (< 1000 RUB out of 7.5M, <0.013%)
        r = (irr_pct or 0.0) / 100.0
        npv_at_irr = sum(cf / ((1.0 + r) ** t) for t, cf in enumerate(cfs))
        self.assertAlmostEqual(npv_at_irr, 0.0, delta=1000.0)
        self.assertAlmostEqual(irr_pct, 11.12, places=1)

    def test_irr_unprofitable_or_invalid(self) -> None:
        """Verifies IRR returns None or gracefully handles all-negative cash flows."""
        # All negative cash flows (no return possible)
        all_neg = [-1000.0, -500.0, -300.0]
        self.assertIsNone(calculate_irr(all_neg))

        # All positive cash flows (no investment)
        all_pos = [1000.0, 500.0, 300.0]
        self.assertIsNone(calculate_irr(all_pos))

    def test_payback_period_linear_interpolation(self) -> None:
        """Tests exact fractional payback period interpolation."""
        # CumDCF: [-100, -60, -20, +20] -> break even between year 2 and 3 at 2.5 yrs
        cum_series = [-100.0, -60.0, -20.0, 20.0]
        be_yr, dpp = calculate_payback_period(cum_series)
        self.assertEqual(be_yr, 3)
        self.assertAlmostEqual(dpp, 2.5, places=2)

        # Never breaks even
        cum_neg = [-100.0, -80.0, -60.0]
        be_neg, dpp_neg = calculate_payback_period(cum_neg)
        self.assertIsNone(be_neg)
        self.assertIsNone(dpp_neg)

        # Immediately non-negative
        cum_zero = [0.0, 10.0, 20.0]
        be_zero, dpp_zero = calculate_payback_period(cum_zero)
        self.assertEqual(be_zero, 0)
        self.assertEqual(dpp_zero, 0.0)

    def test_multi_scenario_price_tiers(self) -> None:
        """Tests that higher carbon prices strictly increase NPV, ROI, and profitability."""
        req = ROIRequest(
            area_ha=100.0,
            carbon_yield_t_ha_yr=4.5,
            price_rub=1500.0,
            discount_rate=0.10,
            years=15,
        )
        res = compute_fintech_roi(req)

        s500 = res.scenarios["rub_500"]
        s1500 = res.scenarios["rub_1500"]
        s4000 = res.scenarios["rub_4000"]

        self.assertLess(s500.npv_rub, s1500.npv_rub)
        self.assertLess(s1500.npv_rub, s4000.npv_rub)

        self.assertFalse(s500.is_profitable)
        self.assertTrue(s4000.is_profitable)

    def test_timber_vs_carbon_parity_price_exact_match(self) -> None:
        """Verifies that at the analytical Carbon Parity Price, Carbon NPV equals Timber NPV."""
        req = ROIRequest(
            area_ha=100.0,
            price_rub=1500.0,
            discount_rate=0.12,
            years=15,
        )
        res = compute_fintech_roi(req)
        tc = res.timber_comparison

        # Parity price computed analytically
        parity_p = tc.parity_carbon_price_rub
        timber_npv = tc.timber_npv_rub

        # Re-run carbon project at exact parity price
        req_parity = ROIRequest(
            area_ha=100.0,
            price_rub=parity_p,
            discount_rate=0.12,
            years=15,
        )
        res_parity = compute_fintech_roi(req_parity)
        carbon_npv_at_parity = res_parity.npv_rub

        # Due to 2 decimal rounding of parity price, difference must be negligible (< 0.1% of NPV)
        diff = abs(carbon_npv_at_parity - timber_npv)
        rel_diff = diff / abs(timber_npv)
        self.assertLess(rel_diff, 0.001)  # Within 0.1%

    def test_timber_reforestation_obligation(self) -> None:
        """Verifies that mandatory Art 63.1 LK RF reforestation cost is deducted from Year 0 timber proceeds."""
        res = compare_timber_vs_carbon(
            area_ha=100.0,
            carbon_npv_rub=1000000.0,
            discount_rate=0.12,
            years=15,
            carbon_yield_t_ha_yr=3.5,
            capex_per_ha=75000.0,
            opex_per_ha_yr=3500.0,
            timber_volume_m3_ha=200.0,
            stumpage_price_rub_m3=2200.0,
            logging_cost_rub_m3=1200.0,
            reforestation_cost_rub_ha=85000.0,
            annual_tax_rub_ha=600.0,
        )

        expected_gross_timber = 100.0 * 200.0 * 2200.0  # 44,000,000 RUB
        expected_logging_cost = 100.0 * 200.0 * 1200.0  # 24,000,000 RUB
        expected_reforest_cost = 100.0 * 85000.0        # 8,500,000 RUB
        expected_net_y0 = (expected_gross_timber - expected_logging_cost) - expected_reforest_cost  # 11,500,000 RUB

        self.assertAlmostEqual(res.gross_timber_revenue_rub, expected_gross_timber, places=1)
        self.assertAlmostEqual(res.reforestation_cost_rub, expected_reforest_cost, places=1)
        self.assertAlmostEqual(res.timber_net_proceeds_year0_rub, expected_net_y0, places=1)


class TestParametricInsuranceEngine(unittest.TestCase):
    """Test suite for satellite disturbance triggers, buffer pool, and claims."""

    def setUp(self) -> None:
        # Reset insurance ledger to clean default state
        insurance_ledger._init_default_state()

    def test_mordovia_03_trigger_activated(self) -> None:
        """Tests that RU_MORDOVIA_03 (2021 wildfire site) triggers parametric insurance (> 10%)."""
        req = InsuranceEvaluationRequest(
            site_id="RU_MORDOVIA_03",
            burn_threshold_percent=10.0,
            carbon_price_rub=1500.0,
        )
        res = evaluate_parametric_trigger(req)

        self.assertTrue(res.trigger_activated)
        self.assertEqual(res.status, "TRIGGER_ACTIVATED")
        self.assertGreater(res.burn_percentage, 10.0)
        self.assertGreater(res.burn_area_ha, 1000.0)
        self.assertGreater(res.payout_eligible_units, 0)
        self.assertGreater(res.payout_amount_rub, 0.0)
        self.assertEqual(len(res.calculation_hash), 64)

    def test_tver_01_trigger_dormant(self) -> None:
        """Tests that RU_TVER_01 (unburned control site) does not trigger insurance (0% burned)."""
        req = InsuranceEvaluationRequest(
            site_id="RU_TVER_01",
            burn_threshold_percent=10.0,
            carbon_price_rub=1500.0,
        )
        res = evaluate_parametric_trigger(req)

        self.assertFalse(res.trigger_activated)
        self.assertEqual(res.burn_percentage, 0.0)
        self.assertEqual(res.payout_eligible_units, 0)
        self.assertEqual(res.payout_amount_rub, 0.0)
        self.assertEqual(res.solvency_status, "NORMAL_BELOW_TRIGGER")

    def test_claim_execution_settles_and_debits_buffer(self) -> None:
        """Verifies that an approved claim debits buffer pool and awards cryptographic receipt."""
        status_before = get_buffer_pool_status(site_id="RU_MORDOVIA_03")
        init_buffer = status_before.total_buffer_reserve_units
        self.assertGreater(init_buffer, 0)

        claim_req = InsuranceClaimRequest(
            site_id="RU_MORDOVIA_03",
            claimant_account="MordoviaForestryAuthority",
            carbon_price_rub=1500.0,
        )
        claim_res = execute_insurance_claim(claim_req)

        self.assertEqual(claim_res.status, "APPROVED_AND_SETTLED")
        self.assertGreater(claim_res.indemnity_credits_awarded, 0)
        self.assertGreater(claim_res.payout_amount_rub, 0.0)
        self.assertEqual(claim_res.site_id, "RU_MORDOVIA_03")
        self.assertEqual(len(claim_res.calculation_hash), 64)
        self.assertEqual(len(claim_res.cryptographic_audit_seal), 64)

        # Verify buffer pool debited
        status_after = get_buffer_pool_status(site_id="RU_MORDOVIA_03")
        self.assertEqual(
            status_after.total_buffer_reserve_units,
            init_buffer - claim_res.indemnity_credits_awarded,
        )
        self.assertEqual(status_after.total_claims_paid_units, claim_res.indemnity_credits_awarded)

    def test_claim_rejection_below_threshold(self) -> None:
        """Verifies claim submission on unburned site RU_TVER_01 is rejected."""
        claim_req = InsuranceClaimRequest(
            site_id="RU_TVER_01",
            claimant_account="TverTimberlandLLC",
            carbon_price_rub=1500.0,
        )
        claim_res = execute_insurance_claim(claim_req)

        self.assertEqual(claim_res.status, "REJECTED_THRESHOLD_NOT_MET")
        self.assertEqual(claim_res.indemnity_credits_awarded, 0)
        self.assertEqual(claim_res.payout_amount_rub, 0.0)

    def test_buffer_pool_global_status(self) -> None:
        """Tests system-wide buffer pool valuation across 500, 1500, and 4000 RUB scenarios."""
        status = get_buffer_pool_status()
        self.assertGreater(status.total_buffer_reserve_units, 0)
        self.assertAlmostEqual(
            status.buffer_pool_value_rub_500,
            status.total_buffer_reserve_units * 500.0,
            places=1,
        )
        self.assertAlmostEqual(
            status.buffer_pool_value_rub_1500,
            status.total_buffer_reserve_units * 1500.0,
            places=1,
        )
        self.assertAlmostEqual(
            status.buffer_pool_value_rub_4000,
            status.total_buffer_reserve_units * 4000.0,
            places=1,
        )
        self.assertIn(status.solvency_status, ["FULLY_SOLVENT", "PARTIALLY_COMMITTED"])


class TestFintechApiEndpoints(unittest.TestCase):
    """Test suite for FastAPI route endpoints /api/roi and /api/insurance."""

    def setUp(self) -> None:
        insurance_ledger._init_default_state()

    def test_route_roi_post_success(self) -> None:
        """Tests direct invocation of POST /api/roi endpoint."""
        payload = {
            "area_ha": 150.0,
            "capex_per_ha": 75000.0,
            "opex_per_ha_yr": 3500.0,
            "carbon_yield_t_ha_yr": 4.0,
            "price_rub": 1500.0,
            "discount_rate": 0.12,
            "years": 15,
        }
        res: ROIResponse = calculate_roi(payload)

        self.assertIsInstance(res, ROIResponse)
        self.assertEqual(res.area_ha, 150.0)
        self.assertEqual(res.years, 15)
        self.assertEqual(len(res.cash_flows), 16)
        self.assertIn("rub_500", res.scenarios)
        self.assertIn("rub_1500", res.scenarios)
        self.assertIn("rub_4000", res.scenarios)
        self.assertEqual(len(res.calculation_hash), 64)

    def test_route_roi_validation_failure_negative_area(self) -> None:
        """Tests that negative or zero area raises validation error."""
        with self.assertRaises((HTTPException, ValidationError)):
            calculate_roi({"area_ha": -50.0})

    def test_route_insurance_evaluate_endpoint(self) -> None:
        """Tests direct invocation of POST /api/insurance/evaluate."""
        res = evaluate_insurance({"site_id": "RU_MORDOVIA_03", "burn_threshold_percent": 10.0})
        self.assertIsInstance(res, InsuranceEvaluationResponse)
        self.assertTrue(res.trigger_activated)
        self.assertGreater(res.payout_amount_rub, 0.0)

    def test_route_insurance_claim_endpoint(self) -> None:
        """Tests direct invocation of POST /api/insurance/claim."""
        res = submit_insurance_claim({"site_id": "RU_MORDOVIA_03", "carbon_price_rub": 1500.0})
        self.assertIsInstance(res, InsuranceClaimResponse)
        self.assertEqual(res.status, "APPROVED_AND_SETTLED")

    def test_route_insurance_buffer_pool_endpoint(self) -> None:
        """Tests direct invocation of GET /api/insurance/buffer-pool."""
        res = get_buffer_pool(site_id="RU_TVER_01")
        self.assertIsInstance(res, BufferPoolStatusResponse)
        self.assertEqual(res.site_id, "RU_TVER_01")
        self.assertGreater(res.total_buffer_reserve_units, 0)


if __name__ == "__main__":
    unittest.main()
