"""backend/app/core/carbon.py

IPCC Stock-Difference Aboveground Biomass (AGB) Carbon Accounting and Credit Allocation Module.

Provides:
- IPCC stock-difference AGB carbon accounting (CF=0.47, 44/12 CO2e conversion).
- Baseline rate lookup from baseline.csv for preset sites and dynamic baseline calculation for arbitrary polygons.
- Project net carbon effect R = E_base - E_proj - LK.
- Uncertainty deduction UNC = min(1.0, max(0.0, H/R - 0.10)).
- Adjusted project effect R_adj = R * (1.0 - UNC).
- Permanence buffer reserve B = 0.15 * R_adj.
- Tradable units Q = floor(R_adj - B) or 0 if R <= 0 or H/R >= 1.0.
- Conservative, base, and optimistic scenario valuations (Q * 500, Q * 1500, Q * 4000 RUB).
- Acceptance test verification reproducing criteria from ORIGINAL_REQUEST.md.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Default Constants (from data/methodology/parameters.csv and IPCC 2006)
# ---------------------------------------------------------------------------
DEFAULT_CF_AGB: float = 0.47  # IPCC 2006, Vol 4, Ch 4, Table 4.3 (t C / t dry matter)
DEFAULT_CO2_PER_C: float = 44.0 / 12.0  # Molar mass ratio of CO2 to C (~3.6666666667)
DEFAULT_UNC_ALLOWANCE: float = 0.10  # 10% uncertainty tolerance without deduction (CASE_RULES_V1)
DEFAULT_UNC_STOP_RATIO: float = 1.0  # H/R >= 1.0 halts unit issuance (Q = 0)
DEFAULT_BUFFER_RATE: float = 0.15  # 15% permanence buffer reserve
DEFAULT_LEAKAGE_LK: float = 0.0  # Zero leakage assumption for project boundaries
DEFAULT_PRICE_LOW: float = 500.0  # Conservative price scenario (RUB / unit)
DEFAULT_PRICE_BASE: float = 1500.0  # Base price scenario (RUB / unit)
DEFAULT_PRICE_HIGH: float = 4000.0  # Optimistic price scenario (RUB / unit)
MAX_POLYGON_AREA_HA: float = 2000.0  # 20 km² limit

# Project root resolution
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _resolve_data_path(relative_path: Union[str, Path]) -> Path:
    """Resolves data paths against project root and local cwd."""
    p = Path(relative_path)
    if p.exists():
        return p
    candidate = PROJECT_ROOT / p
    if candidate.exists():
        return candidate
    return p


@dataclass(frozen=True)
class CarbonAccountingParams:
    """Configurable parameters for carbon accounting, initialized from methodology defaults."""

    cf_agb: float = DEFAULT_CF_AGB
    co2_per_c: float = DEFAULT_CO2_PER_C
    unc_allowance: float = DEFAULT_UNC_ALLOWANCE
    unc_stop_ratio: float = DEFAULT_UNC_STOP_RATIO
    buffer_rate: float = DEFAULT_BUFFER_RATE
    leakage_lk: float = DEFAULT_LEAKAGE_LK
    price_low: float = DEFAULT_PRICE_LOW
    price_base: float = DEFAULT_PRICE_BASE
    price_high: float = DEFAULT_PRICE_HIGH
    max_polygon_area_ha: float = MAX_POLYGON_AREA_HA


@dataclass
class CarbonAccountingResult:
    """Complete results of the MRV carbon accounting and unit issuance pipeline."""

    area_ha: float
    delta_years: int

    # Biomass and Carbon stocks
    t0_biomass_t_ha: float
    t1_biomass_t_ha: float
    delta_biomass_t_ha: float
    c0_t_c_ha: float
    c1_t_c_ha: float
    delta_c_t_c_ha: float
    delta_c_total_t: float

    # Project emissions / removals
    e_proj_t_co2e: float
    e_proj_rate_t_co2e_ha_yr: float

    # Baseline counterfactual
    baseline_delta_tc_ha: float
    delta_c_base_total_t: float
    e_base_t_co2e: float
    e_base_rate_t_co2e_ha_yr: float

    # Net Project Carbon Effect
    leakage_lk: float
    r_gross_t_co2e: float

    # Uncertainty and Deductions
    half_width_h: Optional[float]
    h_over_r: Optional[float]
    unc_deduction: float
    r_adjusted: float
    buffer_reserve: float
    q_tradable_units: int

    # Scenario Valuations
    scenario_valuations: Dict[str, float]

    # Audit & Status
    is_valid: bool
    blocking_reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Converts result dataclass to a JSON-serializable dictionary."""
        return {
            "area_ha": round(self.area_ha, 4),
            "delta_years": self.delta_years,
            "t0_biomass_t_ha": round(self.t0_biomass_t_ha, 4),
            "t1_biomass_t_ha": round(self.t1_biomass_t_ha, 4),
            "delta_biomass_t_ha": round(self.delta_biomass_t_ha, 4),
            "c0_t_c_ha": round(self.c0_t_c_ha, 4),
            "c1_t_c_ha": round(self.c1_t_c_ha, 4),
            "delta_c_t_c_ha": round(self.delta_c_t_c_ha, 4),
            "delta_c_total_t": round(self.delta_c_total_t, 4),
            "e_proj_t_co2e": round(self.e_proj_t_co2e, 4),
            "e_proj_rate_t_co2e_ha_yr": round(self.e_proj_rate_t_co2e_ha_yr, 4),
            "baseline_delta_tc_ha": round(self.baseline_delta_tc_ha, 6),
            "delta_c_base_total_t": round(self.delta_c_base_total_t, 4),
            "e_base_t_co2e": round(self.e_base_t_co2e, 4),
            "e_base_rate_t_co2e_ha_yr": round(self.e_base_rate_t_co2e_ha_yr, 4),
            "leakage_lk": round(self.leakage_lk, 4),
            "r_gross_t_co2e": round(self.r_gross_t_co2e, 4),
            "half_width_h": round(self.half_width_h, 4) if self.half_width_h is not None else None,
            "h_over_r": round(self.h_over_r, 4) if self.h_over_r is not None else None,
            "unc_deduction": round(self.unc_deduction, 4),
            "r_adjusted": round(self.r_adjusted, 4),
            "buffer_reserve": round(self.buffer_reserve, 4),
            "q_tradable_units": self.q_tradable_units,
            "scenario_valuations": {
                "rub_500": round(self.scenario_valuations["rub_500"], 2),
                "rub_1500": round(self.scenario_valuations["rub_1500"], 2),
                "rub_4000": round(self.scenario_valuations["rub_4000"], 2),
            },
            "is_valid": self.is_valid,
            "blocking_reason": self.blocking_reason,
        }


def lookup_preset_baseline(
    aoi_id: str,
    year_start: int,
    year_end: int,
    baseline_csv_path: Union[str, Path] = "data/methodology/baseline.csv",
) -> Tuple[float, float, float]:
    """Retrieves baseline stocks and historical rate for a preset site from baseline.csv.

    Args:
        aoi_id: Preset AOI identifier (e.g. 'RU_TVER_01', 'RU_VOLOGDA_02').
        year_start: Start year (2019..2029).
        year_end: End year (2019..2029).
        baseline_csv_path: Path to baseline.csv.

    Returns:
        Tuple of (stock_start_tc_ha, stock_end_tc_ha, historical_rate_tc_ha_yr).
    """
    resolved_path = _resolve_data_path(baseline_csv_path)
    df = pd.read_csv(resolved_path)
    sub = df[df["aoi_id"] == aoi_id]
    if sub.empty:
        raise ValueError(f"Preset AOI '{aoi_id}' not found in {resolved_path}")

    # Look up starting stock
    match_start = sub[sub["year_start"] == year_start]
    if not match_start.empty:
        stock_start = float(match_start.iloc[0]["baseline_stock_start_tc_ha"])
    else:
        match_prev = sub[sub["year_end"] == year_start]
        if not match_prev.empty:
            stock_start = float(match_prev.iloc[0]["baseline_stock_end_tc_ha"])
        else:
            raise ValueError(f"No baseline data for AOI '{aoi_id}' at year_start {year_start}")

    # Look up ending stock
    match_end = sub[sub["year_end"] == year_end]
    if not match_end.empty:
        stock_end = float(match_end.iloc[0]["baseline_stock_end_tc_ha"])
    else:
        match_next = sub[sub["year_start"] == year_end]
        if not match_next.empty:
            stock_end = float(match_next.iloc[0]["baseline_stock_start_tc_ha"])
        else:
            raise ValueError(f"No baseline data for AOI '{aoi_id}' at year_end {year_end}")

    rate = float(sub.iloc[0]["historical_rate_tc_ha_yr"])
    return stock_start, stock_end, rate


def calculate_dynamic_baseline(
    ref_mean_2015_tc_ha: float,
    ref_mean_2019_tc_ha: float,
    year_start: int,
    year_end: int,
) -> Tuple[float, float, float]:
    """Calculates dynamic baseline trajectory for an arbitrary polygon from historical 2015-2019 data.

    Formula:
      g = (c_2019 - c_2015) / 4.0
      c_base(y) = max(0.0, c_2019 + g * (y - 2019))
      delta_c_base = c_base(year_end) - c_base(year_start)

    Args:
        ref_mean_2015_tc_ha: Area-weighted mean carbon stock in 2015 (t C / ha).
        ref_mean_2019_tc_ha: Area-weighted mean carbon stock in 2019 (t C / ha).
        year_start: Project start year.
        year_end: Project end year.

    Returns:
        Tuple of (stock_start_tc_ha, stock_end_tc_ha, rate_tc_ha_yr).
    """
    g = (ref_mean_2019_tc_ha - ref_mean_2015_tc_ha) / 4.0

    stock_start = max(0.0, ref_mean_2019_tc_ha + g * (year_start - 2019))
    stock_end = max(0.0, ref_mean_2019_tc_ha + g * (year_end - 2019))

    return stock_start, stock_end, g


def calculate_project_carbon_effect(
    delta_carbon_t: float,
    delta_c_base_tc_ha: float,
    area_ha: float,
    params: Optional[CarbonAccountingParams] = None,
) -> Tuple[float, float, float]:
    """Computes project emissions, baseline emissions, and net carbon benefit R.

    Args:
        delta_carbon_t: Total actual carbon stock change over project area (t C).
        delta_c_base_tc_ha: Unit carbon stock change in baseline scenario (t C / ha).
        area_ha: Project area in hectares.
        params: Optional accounting parameters.

    Returns:
        Tuple of (e_proj_t_co2e, e_base_t_co2e, r_gross_t_co2e).
    """
    p = params or CarbonAccountingParams()
    e_proj = -delta_carbon_t * p.co2_per_c
    delta_c_base_total = area_ha * delta_c_base_tc_ha
    e_base = -delta_c_base_total * p.co2_per_c
    r_gross = e_base - e_proj - p.leakage_lk
    return e_proj, e_base, r_gross


def calculate_carbon_accounting(
    area_ha: float,
    t0_biomass_t_ha: float,
    t1_biomass_t_ha: float,
    delta_years: int = 1,
    baseline_delta_tc_ha: Optional[float] = None,
    half_width_h: Optional[float] = None,
    leakage_lk: float = 0.0,
    incomplete_coverage: bool = False,
    params: Optional[CarbonAccountingParams] = None,
) -> CarbonAccountingResult:
    """Executes the complete MRV carbon accounting waterfall, deduction, and credit unit issuance.

    Accounting Waterfall:
      1. c0 = b0 * CF, c1 = b1 * CF
      2. Delta C = Area * (c1 - c0)
      3. E_proj = - Delta C * (44 / 12)
      4. E_base = - Area * baseline_delta_tc_ha * (44 / 12)
      5. R = E_base - E_proj - LK
      6. If R <= 0 -> Q = 0, H/R suppressed, blocked.
      7. If H/R >= 1.0 -> Q = 0, blocked due to high uncertainty.
      8. UNC = min(1.0, max(0.0, H/R - 0.10))
      9. R_adj = R * (1 - UNC)
      10. Buffer B = 0.15 * R_adj
      11. Q = floor(R_adj - B)
      12. Price valuations = Q * (500, 1500, 4000)

    Args:
        area_ha: Project area in hectares.
        t0_biomass_t_ha: Initial biomass density at t0 (t/ha dry matter).
        t1_biomass_t_ha: Final biomass density at t1 (t/ha dry matter).
        delta_years: Number of years in period (default 1).
        baseline_delta_tc_ha: Counterfactual carbon stock change per hectare.
                              If None, defaults to 0.47 * delta_years.
        half_width_h: Half-width of 95% confidence interval for project emissions in t CO2e.
                      If None, defaults to 0.20 * R.
        leakage_lk: Carbon leakage in t CO2e (default 0.0).
        incomplete_coverage: Flag indicating whether polygon partially lacks raster data.
        params: Optional accounting parameters.

    Returns:
        CarbonAccountingResult dataclass.
    """
    p = params or CarbonAccountingParams()

    # Base validation: Polygon size limit
    if area_ha > p.max_polygon_area_ha:
        return _make_invalid_result(
            area_ha=area_ha,
            delta_years=delta_years,
            t0_b=t0_biomass_t_ha,
            t1_b=t1_biomass_t_ha,
            p=p,
            reason=f"POLYGON_EXCEEDS_MAX_AREA: {area_ha:.2f} ha > {p.max_polygon_area_ha:.2f} ha (20 km² limit)",
        )

    if area_ha <= 0.0:
        return _make_invalid_result(
            area_ha=area_ha,
            delta_years=delta_years,
            t0_b=t0_biomass_t_ha,
            t1_b=t1_biomass_t_ha,
            p=p,
            reason="INVALID_AREA: Area must be positive",
        )

    # Incomplete raster coverage check
    if incomplete_coverage:
        return _make_invalid_result(
            area_ha=area_ha,
            delta_years=delta_years,
            t0_b=t0_biomass_t_ha,
            t1_b=t1_biomass_t_ha,
            p=p,
            reason="INCOMPLETE_COVERAGE: Polygon extends beyond available raster coverage",
        )

    # Biomass to Carbon stocks
    c0 = t0_biomass_t_ha * p.cf_agb
    c1 = t1_biomass_t_ha * p.cf_agb
    delta_c = c1 - c0
    delta_c_total = area_ha * delta_c

    e_proj = -delta_c_total * p.co2_per_c
    e_proj_rate = e_proj / (area_ha * max(1, delta_years))

    # Baseline counterfactual
    if baseline_delta_tc_ha is None:
        baseline_delta_tc_ha = 0.47 * delta_years

    delta_c_base_total = area_ha * baseline_delta_tc_ha
    e_base = -delta_c_base_total * p.co2_per_c
    e_base_rate = e_base / (area_ha * max(1, delta_years))

    # Net Project Carbon Effect R
    r_gross = e_base - e_proj - leakage_lk

    # Blocking rule 1: Non-positive carbon effect
    if r_gross <= 0.0:
        return CarbonAccountingResult(
            area_ha=area_ha,
            delta_years=delta_years,
            t0_biomass_t_ha=t0_biomass_t_ha,
            t1_biomass_t_ha=t1_biomass_t_ha,
            delta_biomass_t_ha=t1_biomass_t_ha - t0_biomass_t_ha,
            c0_t_c_ha=c0,
            c1_t_c_ha=c1,
            delta_c_t_c_ha=delta_c,
            delta_c_total_t=delta_c_total,
            e_proj_t_co2e=e_proj,
            e_proj_rate_t_co2e_ha_yr=e_proj_rate,
            baseline_delta_tc_ha=baseline_delta_tc_ha,
            delta_c_base_total_t=delta_c_base_total,
            e_base_t_co2e=e_base,
            e_base_rate_t_co2e_ha_yr=e_base_rate,
            leakage_lk=leakage_lk,
            r_gross_t_co2e=r_gross,
            half_width_h=half_width_h,
            h_over_r=None,  # Ratio suppressed when R <= 0
            unc_deduction=0.0,
            r_adjusted=0.0,
            buffer_reserve=0.0,
            q_tradable_units=0,
            scenario_valuations={"rub_500": 0.0, "rub_1500": 0.0, "rub_4000": 0.0},
            is_valid=False,
            blocking_reason="NO_NET_CARBON_BENEFIT: Project removals did not exceed baseline (R <= 0)",
        )

    # Uncertainty half-width H
    if half_width_h is None:
        half_width_h = 0.20 * r_gross

    h_over_r = half_width_h / r_gross

    # Blocking rule 2: High uncertainty H/R >= 1.0
    if h_over_r >= p.unc_stop_ratio:
        return CarbonAccountingResult(
            area_ha=area_ha,
            delta_years=delta_years,
            t0_biomass_t_ha=t0_biomass_t_ha,
            t1_biomass_t_ha=t1_biomass_t_ha,
            delta_biomass_t_ha=t1_biomass_t_ha - t0_biomass_t_ha,
            c0_t_c_ha=c0,
            c1_t_c_ha=c1,
            delta_c_t_c_ha=delta_c,
            delta_c_total_t=delta_c_total,
            e_proj_t_co2e=e_proj,
            e_proj_rate_t_co2e_ha_yr=e_proj_rate,
            baseline_delta_tc_ha=baseline_delta_tc_ha,
            delta_c_base_total_t=delta_c_base_total,
            e_base_t_co2e=e_base,
            e_base_rate_t_co2e_ha_yr=e_base_rate,
            leakage_lk=leakage_lk,
            r_gross_t_co2e=r_gross,
            half_width_h=half_width_h,
            h_over_r=h_over_r,
            unc_deduction=1.0,
            r_adjusted=0.0,
            buffer_reserve=0.0,
            q_tradable_units=0,
            scenario_valuations={"rub_500": 0.0, "rub_1500": 0.0, "rub_4000": 0.0},
            is_valid=False,
            blocking_reason=f"UNCERTAINTY_EXCEEDS_THRESHOLD: H/R ratio {h_over_r:.4f} >= {p.unc_stop_ratio}",
        )

    # Deduction for uncertainty UNC = min(1.0, max(0.0, H/R - 0.10))
    if h_over_r <= p.unc_allowance or abs(h_over_r - p.unc_allowance) < 1e-9:
        unc_deduction = 0.0
    else:
        unc_deduction = min(1.0, h_over_r - p.unc_allowance)

    r_adjusted = r_gross * (1.0 - unc_deduction)

    # Permanence buffer reserve B = 0.15 * R_adj
    buffer_reserve = r_adjusted * p.buffer_rate

    # Tradable units Q = floor(R_adj - B) = floor(R_adj * 0.85)
    net_units = r_adjusted - buffer_reserve
    q_tradable = int(math.floor(net_units))

    scenario_valuations = {
        "rub_500": q_tradable * p.price_low,
        "rub_1500": q_tradable * p.price_base,
        "rub_4000": q_tradable * p.price_high,
    }

    return CarbonAccountingResult(
        area_ha=area_ha,
        delta_years=delta_years,
        t0_biomass_t_ha=t0_biomass_t_ha,
        t1_biomass_t_ha=t1_biomass_t_ha,
        delta_biomass_t_ha=t1_biomass_t_ha - t0_biomass_t_ha,
        c0_t_c_ha=c0,
        c1_t_c_ha=c1,
        delta_c_t_c_ha=delta_c,
        delta_c_total_t=delta_c_total,
        e_proj_t_co2e=e_proj,
        e_proj_rate_t_co2e_ha_yr=e_proj_rate,
        baseline_delta_tc_ha=baseline_delta_tc_ha,
        delta_c_base_total_t=delta_c_base_total,
        e_base_t_co2e=e_base,
        e_base_rate_t_co2e_ha_yr=e_base_rate,
        leakage_lk=leakage_lk,
        r_gross_t_co2e=r_gross,
        half_width_h=half_width_h,
        h_over_r=h_over_r,
        unc_deduction=unc_deduction,
        r_adjusted=r_adjusted,
        buffer_reserve=buffer_reserve,
        q_tradable_units=q_tradable,
        scenario_valuations=scenario_valuations,
        is_valid=True,
        blocking_reason=None,
    )


def compute_carbon_accounting(
    area_ha: float,
    t0_biomass_t_ha: float,
    t1_biomass_t_ha: float,
    delta_years: int = 1,
    baseline_delta_tc_ha: Optional[float] = None,
    half_width_h: Optional[float] = None,
    leakage_lk: float = 0.0,
    incomplete_coverage: bool = False,
) -> Dict[str, Any]:
    """Compatibility dictionary wrapper for test_utils.compute_carbon_accounting."""
    res = calculate_carbon_accounting(
        area_ha=area_ha,
        t0_biomass_t_ha=t0_biomass_t_ha,
        t1_biomass_t_ha=t1_biomass_t_ha,
        delta_years=delta_years,
        baseline_delta_tc_ha=baseline_delta_tc_ha,
        half_width_h=half_width_h,
        leakage_lk=leakage_lk,
        incomplete_coverage=incomplete_coverage,
    )
    return res.to_dict()


def _make_invalid_result(
    area_ha: float,
    delta_years: int,
    t0_b: float,
    t1_b: float,
    p: CarbonAccountingParams,
    reason: str,
) -> CarbonAccountingResult:
    """Helper to create a cleanly typed invalid CarbonAccountingResult."""
    c0 = t0_b * p.cf_agb
    c1 = t1_b * p.cf_agb
    delta_c = c1 - c0
    delta_c_total = area_ha * delta_c
    e_proj = -delta_c_total * p.co2_per_c

    return CarbonAccountingResult(
        area_ha=area_ha,
        delta_years=delta_years,
        t0_biomass_t_ha=t0_b,
        t1_biomass_t_ha=t1_b,
        delta_biomass_t_ha=t1_b - t0_b,
        c0_t_c_ha=c0,
        c1_t_c_ha=c1,
        delta_c_t_c_ha=delta_c,
        delta_c_total_t=delta_c_total,
        e_proj_t_co2e=e_proj,
        e_proj_rate_t_co2e_ha_yr=0.0,
        baseline_delta_tc_ha=0.0,
        delta_c_base_total_t=0.0,
        e_base_t_co2e=0.0,
        e_base_rate_t_co2e_ha_yr=0.0,
        leakage_lk=0.0,
        r_gross_t_co2e=0.0,
        half_width_h=None,
        h_over_r=None,
        unc_deduction=0.0,
        r_adjusted=0.0,
        buffer_reserve=0.0,
        q_tradable_units=0,
        scenario_valuations={"rub_500": 0.0, "rub_1500": 0.0, "rub_4000": 0.0},
        is_valid=False,
        blocking_reason=reason,
    )


def verify_case_test_calculation() -> Dict[str, Any]:
    """Verifies the exact specification test case from ORIGINAL_REQUEST.md.

    Test parameters:
      Area = 100 ha, Biomass 100 -> 104 t/ha, Delta t = 1 yr,
      Baseline growth = 0.47 t C/ha, H = 103.4 t CO2e.

    Expected:
      Delta C = 188.0 t C
      E_proj = -689.333 t CO2e
      E_base = -172.333 t CO2e
      R = 517.0 t CO2e
      H / R = 0.20
      UNC = 0.10
      R_adj = 465.3 t CO2e
      B = 69.795 t CO2e
      Q = 395 tradable units
      Valuations: 197,500 / 592,500 / 1,580,000 RUB
    """
    res = calculate_carbon_accounting(
        area_ha=100.0,
        t0_biomass_t_ha=100.0,
        t1_biomass_t_ha=104.0,
        delta_years=1,
        baseline_delta_tc_ha=0.47,
        half_width_h=103.4,
    )

    checks = {
        "delta_c_total_t_match": abs(res.delta_c_total_t - 188.0) < 1e-6,
        "e_proj_match": abs(res.e_proj_t_co2e - (-689.3333333333334)) < 1e-4,
        "e_base_match": abs(res.e_base_t_co2e - (-172.33333333333334)) < 1e-4,
        "r_gross_match": abs(res.r_gross_t_co2e - 517.0) < 1e-4,
        "h_over_r_match": abs((res.h_over_r or 0.0) - 0.20) < 1e-6,
        "unc_deduction_match": abs(res.unc_deduction - 0.10) < 1e-6,
        "r_adjusted_match": abs(res.r_adjusted - 465.3) < 1e-4,
        "buffer_reserve_match": abs(res.buffer_reserve - 69.795) < 1e-4,
        "q_tradable_units_match": res.q_tradable_units == 395,
        "price_low_match": res.scenario_valuations["rub_500"] == 197500.0,
        "price_base_match": res.scenario_valuations["rub_1500"] == 592500.0,
        "price_high_match": res.scenario_valuations["rub_4000"] == 1580000.0,
    }

    all_passed = all(checks.values())
    return {
        "all_passed": all_passed,
        "checks": checks,
        "result": res.to_dict(),
    }
