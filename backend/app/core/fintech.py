"""backend/app/core/fintech.py

Institutional-grade FinTech & Financial Engineering Engine for Kosmo·MRV:
1. Carbon ROI, CAPEX/OPEX cash flow schedule projection (Years 0..T, default T=15).
2. Discounted Cash Flow (DCF), Net Present Value (NPV), Cumulative DCF.
3. High-precision numerical Internal Rate of Return (IRR) solver using hybrid Newton-Raphson & Bisection.
4. Linear fractional interpolation for Discounted Payback Period (DPP) and Simple Payback (SPP).
5. Multi-scenario sensitivity analysis across official carbon price tiers (500, 1500, 4000 RUB/t CO2e).
6. 15-year commercial timber clearcut vs. carbon preservation comparative model with exact analytical parity price.
7. Deterministic SHA-256 cryptographic calculation seal for auditability.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from backend.app.core.audit import compute_calculation_hash
from backend.app.schemas.fintech import (
    AnnualCashFlow,
    ROIRequest,
    ROIResponse,
    ROIScenarioMetrics,
    TimberComparisonResult,
    TimberScenarioParams,
)


def calculate_irr(
    cash_flows: List[float],
    tol: float = 1e-7,
    max_iter: int = 150,
) -> Optional[float]:
    """Calculates Internal Rate of Return (IRR %) using hybrid Newton-Raphson + Bisection.

    Returns:
        IRR as a percentage (e.g. 12.45 for 12.45%), or None if no valid rate exists.
    """
    if not cash_flows or len(cash_flows) < 2:
        return None

    has_positive = any(cf > 0 for cf in cash_flows)
    has_negative = any(cf < 0 for cf in cash_flows)
    if not (has_positive and has_negative):
        return None

    def npv_func(rate: float) -> float:
        if rate <= -1.0:
            return float("inf")
        val = 0.0
        for t, cf in enumerate(cash_flows):
            val += cf / ((1.0 + rate) ** t)
        return val

    def npv_derivative(rate: float) -> float:
        if rate <= -1.0:
            return float("-inf")
        val = 0.0
        for t, cf in enumerate(cash_flows):
            if t > 0:
                val += -t * cf / ((1.0 + rate) ** (t + 1))
        return val

    # Attempt 1: Newton-Raphson starting at standard discount rate guess 0.12
    rate = 0.12
    newton_converged = False
    for _ in range(50):
        f_val = npv_func(rate)
        if abs(f_val) < tol:
            newton_converged = True
            break
        deriv = npv_derivative(rate)
        if abs(deriv) < 1e-12:
            break
        step = f_val / deriv
        rate_next = rate - step
        # Bounds check: realistic IRR domain [-0.50, 10.0]
        if rate_next <= -0.90 or rate_next > 20.0:
            break
        if abs(rate_next - rate) < tol:
            rate = rate_next
            newton_converged = True
            break
        rate = rate_next

    if newton_converged and -0.90 <= rate <= 20.0:
        return round(rate * 100.0, 2)

    # Attempt 2: Grid scan + Bisection on [-0.80, 10.0]
    grid_points = [-0.80 + i * 0.05 for i in range(217)]  # up to 10.0
    bracket: Optional[Tuple[float, float]] = None
    prev_r = grid_points[0]
    prev_val = npv_func(prev_r)

    for r_cand in grid_points[1:]:
        val = npv_func(r_cand)
        if math.isnan(val) or math.isinf(val):
            prev_r, prev_val = r_cand, val
            continue
        if prev_val * val <= 0.0:
            bracket = (prev_r, r_cand)
            break
        prev_r, prev_val = r_cand, val

    if not bracket:
        return None

    low, high = bracket
    f_low, f_high = npv_func(low), npv_func(high)

    for _ in range(max_iter):
        mid = (low + high) / 2.0
        f_mid = npv_func(mid)
        if abs(f_mid) < tol or (high - low) / 2.0 < tol:
            return round(mid * 100.0, 2)
        if f_low * f_mid <= 0.0:
            high = mid
            f_high = f_mid
        else:
            low = mid
            f_low = f_mid

    return round(mid * 100.0, 2)


def calculate_payback_period(
    cumulative_series: List[float],
) -> Tuple[Optional[int], Optional[float]]:
    """Calculates integer break-even year and fractional interpolated payback period.

    Args:
        cumulative_series: Array of cumulative cash flows from year 0 to T.

    Returns:
        (break_even_year, payback_period_years)
    """
    T = len(cumulative_series) - 1
    if T < 1:
        return None, None

    # If already non-negative at year 0
    if cumulative_series[0] >= 0:
        return 0, 0.0

    # If never non-negative by terminal year
    if cumulative_series[-1] < 0:
        return None, None

    for k in range(T):
        c_k = cumulative_series[k]
        c_next = cumulative_series[k + 1]
        if c_k < 0 and c_next >= 0:
            d_cf = c_next - c_k
            fraction = abs(c_k) / d_cf if d_cf > 0 else 0.0
            fractional_payback = round(k + fraction, 2)
            integer_year = k + 1
            return integer_year, fractional_payback

    return None, None


def project_cash_flows(
    area_ha: float,
    capex_per_ha: float,
    opex_per_ha_yr: float,
    carbon_yield_t_ha_yr: float,
    price_rub: float,
    discount_rate: float,
    years: int,
    g_opex: float = 0.04,
    g_price: float = 0.0,
) -> Tuple[List[AnnualCashFlow], List[float], List[float]]:
    """Builds complete annual cash flow schedule from year 0 to T.

    Returns:
        (cash_flows, undiscounted_cf_series, discounted_cf_series)
    """
    schedule: List[AnnualCashFlow] = []
    cf_series: List[float] = []
    dcf_series: List[float] = []

    # Year 0: Initial Capital Expenditure
    capex_total = area_ha * capex_per_ha
    cf_0 = -capex_total
    dcf_0 = cf_0
    cum_dcf = dcf_0
    cum_cf = cf_0

    cf_series.append(cf_0)
    dcf_series.append(dcf_0)

    schedule.append(
        AnnualCashFlow(
            year=0,
            gross_revenue_rub=0.0,
            opex_rub=0.0,
            net_cash_flow_rub=round(cf_0, 2),
            dcf_rub=round(dcf_0, 2),
            cumulative_dcf_rub=round(cum_dcf, 2),
            cumulative_cash_flow_undiscounted_rub=round(cum_cf, 2),
            carbon_credits_issued=0.0,
            carbon_price_rub=round(price_rub, 2),
        )
    )

    # Years 1..T: Operating Cash Flows
    for t in range(1, years + 1):
        credits_issued = area_ha * carbon_yield_t_ha_yr
        price_t = price_rub * ((1.0 + g_price) ** (t - 1))
        revenue_t = credits_issued * price_t
        opex_t = area_ha * opex_per_ha_yr * ((1.0 + g_opex) ** (t - 1))
        net_cf_t = revenue_t - opex_t
        dcf_t = net_cf_t / ((1.0 + discount_rate) ** t)

        cum_cf += net_cf_t
        cum_dcf += dcf_t

        cf_series.append(net_cf_t)
        dcf_series.append(dcf_t)

        schedule.append(
            AnnualCashFlow(
                year=t,
                gross_revenue_rub=round(revenue_t, 2),
                opex_rub=round(opex_t, 2),
                net_cash_flow_rub=round(net_cf_t, 2),
                dcf_rub=round(dcf_t, 2),
                cumulative_dcf_rub=round(cum_dcf, 2),
                cumulative_cash_flow_undiscounted_rub=round(cum_cf, 2),
                carbon_credits_issued=round(credits_issued, 2),
                carbon_price_rub=round(price_t, 2),
            )
        )

    return schedule, cf_series, dcf_series


def evaluate_scenario(
    area_ha: float,
    capex_per_ha: float,
    opex_per_ha_yr: float,
    carbon_yield_t_ha_yr: float,
    price_rub: float,
    discount_rate: float,
    years: int,
    g_opex: float = 0.04,
    g_price: float = 0.0,
) -> ROIScenarioMetrics:
    """Evaluates comprehensive financial metrics for a single carbon price scenario."""
    _, cf_series, dcf_series = project_cash_flows(
        area_ha=area_ha,
        capex_per_ha=capex_per_ha,
        opex_per_ha_yr=opex_per_ha_yr,
        carbon_yield_t_ha_yr=carbon_yield_t_ha_yr,
        price_rub=price_rub,
        discount_rate=discount_rate,
        years=years,
        g_opex=g_opex,
        g_price=g_price,
    )

    total_capex = area_ha * capex_per_ha
    cum_dcf_series: List[float] = []
    curr_dcf = 0.0
    for d in dcf_series:
        curr_dcf += d
        cum_dcf_series.append(curr_dcf)

    cum_cf_series: List[float] = []
    curr_cf = 0.0
    for c in cf_series:
        curr_cf += c
        cum_cf_series.append(curr_cf)

    npv = cum_dcf_series[-1]
    be_yr, dpp = calculate_payback_period(cum_dcf_series)
    _, spp = calculate_payback_period(cum_cf_series)
    irr = calculate_irr(cf_series)

    total_opex = sum(
        area_ha * opex_per_ha_yr * ((1.0 + g_opex) ** (t - 1))
        for t in range(1, years + 1)
    )
    total_revenue = sum(
        (area_ha * carbon_yield_t_ha_yr) * (price_rub * ((1.0 + g_price) ** (t - 1)))
        for t in range(1, years + 1)
    )
    total_net_cf = sum(cf_series)

    roi_pct = (total_net_cf / total_capex * 100.0) if total_capex > 0 else 0.0
    pv_inflows = sum(dcf_series[1:])
    profitability_index = (pv_inflows / total_capex) if total_capex > 0 else 0.0

    return ROIScenarioMetrics(
        price_rub=price_rub,
        npv_rub=round(npv, 2),
        irr_percent=irr,
        break_even_year=be_yr,
        payback_period_years=dpp,
        break_even_year_simple=spp,
        total_capex_rub=round(total_capex, 2),
        total_opex_nominal_rub=round(total_opex, 2),
        total_revenue_rub=round(total_revenue, 2),
        total_net_cash_flow_rub=round(total_net_cf, 2),
        roi_percent=round(roi_pct, 2),
        profitability_index=round(profitability_index, 2),
        is_profitable=(npv > 0.0),
    )


def compare_timber_vs_carbon(
    area_ha: float,
    carbon_npv_rub: float,
    discount_rate: float,
    years: int,
    carbon_yield_t_ha_yr: float,
    capex_per_ha: float,
    opex_per_ha_yr: float,
    g_opex: float = 0.04,
    g_price: float = 0.0,
    timber_volume_m3_ha: float = 180.0,
    stumpage_price_rub_m3: float = 2800.0,
    logging_cost_rub_m3: float = 1200.0,
    reforestation_cost_rub_ha: float = 85000.0,
    annual_tax_rub_ha: float = 600.0,
) -> TimberComparisonResult:
    """Models 15-Year Clearcut Timber Harvest vs. Carbon Preservation and calculates exact parity price.

    Timber Model (Russian Forestry Code / LK RF Art 63.1):
    - Year 0 Net Margin: S * [ V_timber * (P_stumpage - C_logging) - C_reforest ]
    - Years 1..T: - S * Tax_annual
    """
    net_margin_m3 = stumpage_price_rub_m3 - logging_cost_rub_m3
    gross_timber_rev = area_ha * timber_volume_m3_ha * stumpage_price_rub_m3
    reforest_total = area_ha * reforestation_cost_rub_ha
    net_proceeds_y0 = area_ha * (timber_volume_m3_ha * net_margin_m3) - reforest_total
    annual_tax_total = area_ha * annual_tax_rub_ha

    timber_cash_flows: List[float] = [net_proceeds_y0]
    timber_npv = net_proceeds_y0

    for t in range(1, years + 1):
        cf_t = -annual_tax_total
        timber_cash_flows.append(cf_t)
        timber_npv += cf_t / ((1.0 + discount_rate) ** t)

    delta_npv = carbon_npv_rub - timber_npv

    # Exact Analytical Parity Price derivation:
    # NPV_carbon(P*) = NPV_timber
    # - CAPEX + sum( (area * yield * P* * (1+gp)^(t-1) - OPEX_t) / (1+r)^t ) = NPV_timber
    # P* * [ area * yield * sum((1+gp)^(t-1) / (1+r)^t) ] = NPV_timber + CAPEX + sum(OPEX_t / (1+r)^t)
    total_capex = area_ha * capex_per_ha
    pv_opex = sum(
        (area_ha * opex_per_ha_yr * ((1.0 + g_opex) ** (t - 1))) / ((1.0 + discount_rate) ** t)
        for t in range(1, years + 1)
    )
    discounted_yield_sum = sum(
        (area_ha * carbon_yield_t_ha_yr * ((1.0 + g_price) ** (t - 1))) / ((1.0 + discount_rate) ** t)
        for t in range(1, years + 1)
    )

    if discounted_yield_sum > 0:
        parity_price = (timber_npv + total_capex + pv_opex) / discounted_yield_sum
    else:
        parity_price = 0.0

    is_carbon_preferred = delta_npv > 0
    preferred_opt = "CARBON_PROJECT" if is_carbon_preferred else "TIMBER_HARVEST"
    rec_tag = "CARBON_PREFERRED" if is_carbon_preferred else "TIMBER_PREFERRED"

    if timber_npv > 0:
        advantage_pct = round((delta_npv / timber_npv) * 100.0, 2)
    elif timber_npv < 0 and carbon_npv_rub > 0:
        advantage_pct = 100.0
    else:
        advantage_pct = 0.0

    if is_carbon_preferred:
        summary_text = (
            f"Carbon preservation yields superior institutional value with an NPV advantage of "
            f"+{delta_npv:,.2f} RUB ({advantage_pct:+.1f}%) over commercial timber harvesting. "
            f"Clearcutting mandates 100% compensatory reforestation under LK RF Art 63.1 "
            f"({reforest_total:,.2f} RUB), which significantly impairs timber net cash flows. "
            f"The project breaks even against timber harvesting at parity price {parity_price:,.2f} RUB/t CO2e."
        )
    else:
        summary_text = (
            f"Commercial timber clearcutting provides higher immediate liquidity and NPV (+{abs(delta_npv):,.2f} RUB). "
            f"To achieve economic parity with timber harvesting, carbon credit prices must reach at least "
            f"{parity_price:,.2f} RUB/t CO2e (current scenario is below parity threshold)."
        )

    return TimberComparisonResult(
        timber_volume_m3_ha=timber_volume_m3_ha,
        timber_price_m3=stumpage_price_rub_m3,
        logging_cost_m3=logging_cost_rub_m3,
        net_logging_margin_m3=net_margin_m3,
        gross_timber_revenue_rub=round(gross_timber_rev, 2),
        reforestation_cost_rub=round(reforest_total, 2),
        timber_net_proceeds_year0_rub=round(net_proceeds_y0, 2),
        timber_annual_tax_rub_yr=round(annual_tax_total, 2),
        timber_npv_rub=round(timber_npv, 2),
        carbon_npv_rub=round(carbon_npv_rub, 2),
        delta_npv_rub=round(delta_npv, 2),
        parity_carbon_price_rub=round(parity_price, 2),
        preferred_option=preferred_opt,
        recommendation=rec_tag,
        carbon_advantage_pct=advantage_pct,
        timber_cash_flows=[round(cf, 2) for cf in timber_cash_flows],
        summary=summary_text,
    )


def compute_fintech_roi(request: ROIRequest) -> ROIResponse:
    """Executes the full institutional FinTech ROI pipeline for carbon project appraisal."""
    area_ha = float(request.area_ha)
    capex_per_ha = float(request.capex_per_ha)
    opex_per_ha_yr = float(request.opex_per_ha_yr)
    carbon_yield_t_ha_yr = float(request.carbon_yield_t_ha_yr)
    price_rub = float(request.price_rub)
    discount_rate = float(request.discount_rate)
    years = int(request.years)
    g_opex = float(request.g_opex)
    g_price = float(request.g_price)

    # Resolve Timber Parameters
    tp = request.timber_params or TimberScenarioParams()
    timber_vol = request.timber_stock_m3_ha or tp.timber_volume_m3_ha
    timber_price = request.timber_price_m3 or tp.stumpage_price_rub_m3
    logging_cost = request.logging_cost_rub_m3 or tp.logging_cost_rub_m3
    reforest_cost = request.reforestation_cost_rub_ha or tp.reforestation_cost_rub_ha
    timber_tax = request.timber_annual_tax_rub_ha or tp.annual_tax_rub_ha

    # 1. Base Scenario Cash Flows
    cash_flows, cf_series, dcf_series = project_cash_flows(
        area_ha=area_ha,
        capex_per_ha=capex_per_ha,
        opex_per_ha_yr=opex_per_ha_yr,
        carbon_yield_t_ha_yr=carbon_yield_t_ha_yr,
        price_rub=price_rub,
        discount_rate=discount_rate,
        years=years,
        g_opex=g_opex,
        g_price=g_price,
    )

    # 2. Selected Base Scenario Metrics
    selected_metrics = evaluate_scenario(
        area_ha=area_ha,
        capex_per_ha=capex_per_ha,
        opex_per_ha_yr=opex_per_ha_yr,
        carbon_yield_t_ha_yr=carbon_yield_t_ha_yr,
        price_rub=price_rub,
        discount_rate=discount_rate,
        years=years,
        g_opex=g_opex,
        g_price=g_price,
    )

    # 3. Multi-Scenario Analysis for 500, 1500, 4000 RUB/t CO2e
    scenario_prices = {
        "rub_500": 500.0,
        "rub_1500": 1500.0,
        "rub_4000": 4000.0,
    }
    scenarios: Dict[str, ROIScenarioMetrics] = {}
    for key, p in scenario_prices.items():
        scenarios[key] = evaluate_scenario(
            area_ha=area_ha,
            capex_per_ha=capex_per_ha,
            opex_per_ha_yr=opex_per_ha_yr,
            carbon_yield_t_ha_yr=carbon_yield_t_ha_yr,
            price_rub=p,
            discount_rate=discount_rate,
            years=years,
            g_opex=g_opex,
            g_price=g_price,
        )

    # 4. Timber Comparison
    timber_comparison = compare_timber_vs_carbon(
        area_ha=area_ha,
        carbon_npv_rub=selected_metrics.npv_rub,
        discount_rate=discount_rate,
        years=years,
        carbon_yield_t_ha_yr=carbon_yield_t_ha_yr,
        capex_per_ha=capex_per_ha,
        opex_per_ha_yr=opex_per_ha_yr,
        g_opex=g_opex,
        g_price=g_price,
        timber_volume_m3_ha=timber_vol,
        stumpage_price_rub_m3=timber_price,
        logging_cost_rub_m3=logging_cost,
        reforestation_cost_rub_ha=reforest_cost,
        annual_tax_rub_ha=timber_tax,
    )

    # 5. Cryptographic Calculation Hash (SHA-256)
    audit_dict = {
        "area_ha": area_ha,
        "years": years,
        "discount_rate": discount_rate,
        "carbon_yield_t_ha_yr": carbon_yield_t_ha_yr,
        "price_rub": price_rub,
        "total_capex_rub": selected_metrics.total_capex_rub,
        "npv_rub": selected_metrics.npv_rub,
        "irr_percent": selected_metrics.irr_percent,
        "break_even_year": selected_metrics.break_even_year,
        "parity_carbon_price_rub": timber_comparison.parity_carbon_price_rub,
        "site_id": request.site_id,
    }
    calc_hash = compute_calculation_hash(audit_dict)

    return ROIResponse(
        area_ha=area_ha,
        years=years,
        discount_rate=discount_rate,
        carbon_yield_t_ha_yr=carbon_yield_t_ha_yr,
        price_rub=price_rub,
        total_capex_rub=selected_metrics.total_capex_rub,
        total_opex_nominal_rub=selected_metrics.total_opex_nominal_rub,
        total_net_cash_flow_rub=selected_metrics.total_net_cash_flow_rub,
        npv_rub=selected_metrics.npv_rub,
        irr_percent=selected_metrics.irr_percent,
        break_even_year=selected_metrics.break_even_year,
        payback_period_years=selected_metrics.payback_period_years,
        selected_scenario=selected_metrics,
        scenarios=scenarios,
        cash_flows=cash_flows,
        timber_comparison=timber_comparison,
        calculation_hash=calc_hash,
    )
