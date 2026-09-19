"""backend/app/schemas/fintech.py

Pydantic v2 Schemas for Kosmo·MRV FinTech Module:
- Carbon ROI & CAPEX/OPEX Calculator (/api/roi)
- Discounted Cash Flow (DCF), Net Present Value (NPV)
- Internal Rate of Return (IRR) & Payback Break-Even Analysis
- Multi-Scenario Carbon Price Modeling (500, 1500, 4000 RUB/t CO2e)
- 15-Year Timber Clearcut vs. Carbon Preservation Comparative Model
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator


class TimberScenarioParams(BaseModel):
    """Parameters for comparative timber harvesting alternative scenario."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    timber_volume_m3_ha: float = Field(
        default=180.0, gt=0, description="Commercial standing timber volume per hectare (m3/ha)"
    )
    stumpage_price_rub_m3: float = Field(
        default=2800.0, gt=0, description="Roundwood timber stumpage sale price (RUB/m3)"
    )
    logging_cost_rub_m3: float = Field(
        default=1200.0, ge=0, description="Logging, skidding, and transport cost (RUB/m3)"
    )
    reforestation_cost_rub_ha: float = Field(
        default=85000.0, ge=0, description="Mandatory compensatory reforestation cost under LK RF Art 63.1 (RUB/ha)"
    )
    annual_tax_rub_ha: float = Field(
        default=600.0, ge=0, description="Annual forest lease rent and sapling protection expense (RUB/ha/year)"
    )


class ROIRequest(BaseModel):
    """Request payload for Carbon Project ROI, DCF, NPV, and Timber comparison."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    area_ha: float = Field(..., gt=0, description="Project forest surface area in hectares")
    capex_per_ha: float = Field(
        default=75000.0, ge=0, description="Seedling acquisition, ground prep, and planting CAPEX (RUB/ha)"
    )
    opex_per_ha_yr: float = Field(
        default=3500.0, ge=0, description="Annual fire protection, patrols, and MRV audit OPEX (RUB/ha/year)"
    )
    carbon_yield_t_ha_yr: float = Field(
        default=3.5, gt=0, description="Expected annual net verified carbon removals yield (t CO2e/ha/year)"
    )
    price_rub: float = Field(
        default=1500.0, gt=0, description="Carbon unit price scenario in RUB/t CO2e (500, 1500, 4000)"
    )
    discount_rate: float = Field(
        default=0.12, ge=0.0, le=1.0, description="Annual nominal discount rate (e.g. 0.10, 0.12, 0.15)"
    )
    years: int = Field(
        default=15, ge=1, le=50, description="Project lifecycle duration in years (default 15, configurable up to 30)"
    )
    g_opex: float = Field(
        default=0.04, ge=0.0, le=1.0, description="Annual OPEX inflation / escalation rate"
    )
    g_price: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Annual real growth rate of carbon unit price"
    )
    site_id: Optional[str] = Field(
        default=None, description="Optional preset site ID to auto-populate area and verified baseline parameters"
    )
    timber_price_m3: Optional[float] = Field(
        default=None, gt=0, description="Roundwood timber price (RUB/m3) overriding timber_params"
    )
    timber_stock_m3_ha: Optional[float] = Field(
        default=None, gt=0, description="Standing timber volume (m3/ha) overriding timber_params"
    )
    logging_cost_rub_m3: Optional[float] = Field(
        default=None, ge=0, description="Logging cost per m3"
    )
    reforestation_cost_rub_ha: Optional[float] = Field(
        default=None, ge=0, description="Compensatory reforestation cost per ha"
    )
    timber_annual_tax_rub_ha: Optional[float] = Field(
        default=None, ge=0, description="Annual forest lease rent and tax per ha"
    )
    timber_params: Optional[TimberScenarioParams] = Field(
        default=None, description="Explicit timber scenario parameter bundle"
    )

    @model_validator(mode="before")
    @classmethod
    def handle_aliases_and_fallbacks(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        # Aliases for capex
        if "capex_seedlings_rub_ha" in d and "capex_per_ha" not in d:
            d["capex_per_ha"] = d["capex_seedlings_rub_ha"]
        # Aliases for opex
        if "opex_annual_rub_ha" in d and "opex_per_ha_yr" not in d:
            d["opex_per_ha_yr"] = d["opex_annual_rub_ha"]
        # Aliases for carbon yield
        if "annual_carbon_yield_t_ha" in d and "carbon_yield_t_ha_yr" not in d:
            d["carbon_yield_t_ha_yr"] = d["annual_carbon_yield_t_ha"]
        # Aliases for price
        if "carbon_price_scenario" in d and "price_rub" not in d:
            d["price_rub"] = d["carbon_price_scenario"]
        # Aliases for duration
        if "project_duration_years" in d and "years" not in d:
            d["years"] = d["project_duration_years"]
        # Aliases for growth rates
        if "opex_inflation_rate" in d and "g_opex" not in d:
            d["g_opex"] = d["opex_inflation_rate"]
        if "carbon_price_growth_rate" in d and "g_price" not in d:
            d["g_price"] = d["carbon_price_growth_rate"]
        return d


class AnnualCashFlow(BaseModel):
    """Annual cash flow schedule item for project year t (0..T)."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    year: int = Field(..., description="Project year (0 = initial investment, 1..T = operations)")
    gross_revenue_rub: float = Field(..., description="Gross revenue from carbon unit sales (RUB)")
    opex_rub: float = Field(..., description="Operating expenditures incurred in year t (RUB)")
    net_cash_flow_rub: float = Field(..., description="Net cash flow CF_t = Revenue_t - OPEX_t (RUB)")
    dcf_rub: float = Field(..., description="Discounted cash flow DCF_t = CF_t / (1 + r)^t (RUB)")
    cumulative_dcf_rub: float = Field(..., description="Cumulative discounted cash flow sum(DCF_0..t) (RUB)")
    cumulative_cash_flow_undiscounted_rub: float = Field(
        ..., description="Cumulative undiscounted net cash flow sum(CF_0..t) (RUB)"
    )
    carbon_credits_issued: float = Field(..., description="Carbon units issued in year t (t CO2e)")
    carbon_price_rub: float = Field(..., description="Applied carbon price in year t (RUB/t CO2e)")


class ROIScenarioMetrics(BaseModel):
    """Financial metrics for a specific carbon price scenario (e.g. 500, 1500, 4000 RUB)."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    price_rub: float = Field(..., description="Scenario carbon price (RUB/t CO2e)")
    npv_rub: float = Field(..., description="Net Present Value (RUB)")
    irr_percent: Optional[float] = Field(
        default=None, description="Internal Rate of Return percentage (or None if unachievable)"
    )
    break_even_year: Optional[int] = Field(
        default=None, description="Integer year when cumulative DCF becomes >= 0"
    )
    payback_period_years: Optional[float] = Field(
        default=None, description="Fractionally interpolated discounted payback period (years)"
    )
    break_even_year_simple: Optional[float] = Field(
        default=None, description="Undiscounted simple payback period (years)"
    )
    total_capex_rub: float = Field(..., description="Total initial CAPEX (RUB)")
    total_opex_nominal_rub: float = Field(..., description="Total cumulative nominal OPEX across T years (RUB)")
    total_revenue_rub: float = Field(..., description="Total cumulative nominal revenue across T years (RUB)")
    total_net_cash_flow_rub: float = Field(..., description="Total net nominal cash flow across T years (RUB)")
    roi_percent: float = Field(..., description="Return on Investment percentage = (Total Net CF / CAPEX) * 100%")
    profitability_index: float = Field(
        ..., description="Profitability Index = Present Value of Operating Inflows / Initial CAPEX"
    )
    is_profitable: bool = Field(..., description="True if NPV > 0")


class TimberComparisonResult(BaseModel):
    """15-Year comparative valuation: Commercial Clearcut Harvest vs. Carbon Preservation."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    timber_volume_m3_ha: float = Field(..., description="Standing merchantable roundwood volume (m3/ha)")
    timber_price_m3: float = Field(..., description="Stumpage roundwood price (RUB/m3)")
    logging_cost_m3: float = Field(..., description="Logging & transport operational cost (RUB/m3)")
    net_logging_margin_m3: float = Field(..., description="Net timber margin per m3 = price - cost (RUB/m3)")
    gross_timber_revenue_rub: float = Field(..., description="Gross timber sale proceeds (RUB)")
    reforestation_cost_rub: float = Field(
        ..., description="Mandatory compensatory reforestation cost under LK RF Art 63.1 (RUB)"
    )
    timber_net_proceeds_year0_rub: float = Field(
        ..., description="Net timber harvest margin at Year 0 after compensatory reforestation (RUB)"
    )
    timber_annual_tax_rub_yr: float = Field(
        ..., description="Annual forest lease rent and tax obligation over 15 years (RUB/yr)"
    )
    timber_npv_rub: float = Field(..., description="15-year Net Present Value of commercial timber harvesting (RUB)")
    carbon_npv_rub: float = Field(..., description="15-year Net Present Value of carbon project preservation (RUB)")
    delta_npv_rub: float = Field(..., description="NPV advantage of carbon project over timber (NPV_carbon - NPV_timber)")
    parity_carbon_price_rub: float = Field(
        ..., description="Analytical carbon parity price (RUB/t CO2e) where NPV_carbon equals NPV_timber"
    )
    preferred_option: Literal["CARBON_PROJECT", "TIMBER_HARVEST"] = Field(
        ..., description="Financial recommendation based on highest Net Present Value"
    )
    recommendation: Literal["CARBON_PREFERRED", "TIMBER_PREFERRED"] = Field(
        ..., description="Standardized recommendation tag conforming to specs"
    )
    carbon_advantage_pct: float = Field(
        ..., description="Percentage financial advantage of carbon preservation over timber harvest"
    )
    timber_cash_flows: List[float] = Field(..., description="Annual cash flow array for timber harvest scenario")
    summary: str = Field(..., description="Executive summary and financial rationale of comparison")


class ROIResponse(BaseModel):
    """Comprehensive institutional output for Carbon Project ROI, DCF, NPV, and Timber comparison."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    area_ha: float = Field(..., description="Project surface area (ha)")
    years: int = Field(..., description="Project lifetime duration in years (T)")
    discount_rate: float = Field(..., description="Nominal discount rate r")
    carbon_yield_t_ha_yr: float = Field(..., description="Annual carbon removals yield (t CO2e/ha/yr)")
    price_rub: float = Field(..., description="Base scenario carbon price (RUB/t CO2e)")
    total_capex_rub: float = Field(..., description="Initial CAPEX at year 0 (RUB)")
    total_opex_nominal_rub: float = Field(..., description="Cumulative nominal OPEX across T years (RUB)")
    total_net_cash_flow_rub: float = Field(..., description="Total nominal net cash flow sum(CF_0..T) (RUB)")
    npv_rub: float = Field(..., description="Project Net Present Value at base scenario price (RUB)")
    irr_percent: Optional[float] = Field(
        default=None, description="Project Internal Rate of Return (IRR %) at base scenario price"
    )
    break_even_year: Optional[int] = Field(
        default=None, description="Integer break-even year when cumulative DCF >= 0 (or None)"
    )
    payback_period_years: Optional[float] = Field(
        default=None, description="Fractionally interpolated discounted payback period (years)"
    )
    selected_scenario: ROIScenarioMetrics = Field(
        ..., description="Complete financial metrics under the requested base price scenario"
    )
    scenarios: Dict[str, ROIScenarioMetrics] = Field(
        ..., description="Multi-scenario breakdown for 500, 1500, and 4000 RUB/t CO2e"
    )
    cash_flows: List[AnnualCashFlow] = Field(
        ..., description="Full 0..T annual cash flow schedule for the base scenario"
    )
    timber_comparison: TimberComparisonResult = Field(
        ..., description="15-year Timber clearcut vs Carbon preservation comparative analysis"
    )
    calculation_hash: str = Field(
        ..., description="Deterministic SHA-256 cryptographic calculation seal"
    )
