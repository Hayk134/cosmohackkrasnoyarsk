"""backend/app/core/uncertainty.py

Spatial autocorrelation modeling, error propagation, confidence intervals,
and carbon credit crediting / uncertainty deduction rules for satellite MRV.

Implements:
- Vectorized 2D Moran's I on regular pixel grids (Queen and Rook neighborhood)
- Clifford-Ord Variance Inflation Factor (VIF) and Effective Sample Size (N_eff)
- IPCC-compliant standard error propagation SE(E_proj)
- 95% confidence intervals [L, U] and half-width H
- Uncertainty deduction (UNC), permanence buffer (B), and integer tradable units (Q)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, Literal, Optional, Tuple, Union

import numpy as np


@dataclass(frozen=True)
class MoranResult:
    """Statistical summary of 2D Moran's I computation."""

    moran_i: float
    n_pixels: int
    s0_weights: float
    neighborhood: str
    vif: float
    n_eff: float


@dataclass(frozen=True)
class UncertaintyResult:
    """Full uncertainty and carbon crediting analysis result."""

    moran_i: float
    vif: float
    n_eff: float
    se_proj: float
    half_width_h: float
    ci_lower_l: float
    ci_upper_u: float
    h_over_r: Optional[float]
    unc_deduction: float
    r_adjusted: float
    buffer_reserve: float
    q_tradable_units: int
    is_valid: bool
    blocking_reason: Optional[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "moran_i": round(self.moran_i, 6),
            "vif": round(self.vif, 4),
            "n_eff": round(self.n_eff, 2),
            "se_proj": round(self.se_proj, 4),
            "half_width_h": round(self.half_width_h, 4),
            "ci_lower_l": round(self.ci_lower_l, 4),
            "ci_upper_u": round(self.ci_upper_u, 4),
            "h_over_r": round(self.h_over_r, 4) if self.h_over_r is not None else None,
            "unc_deduction": round(self.unc_deduction, 4),
            "r_adjusted": round(self.r_adjusted, 4),
            "buffer_reserve": round(self.buffer_reserve, 4),
            "q_tradable_units": self.q_tradable_units,
            "is_valid": self.is_valid,
            "blocking_reason": self.blocking_reason,
        }


def compute_morans_i_2d(
    grid: np.ndarray,
    mask: Optional[np.ndarray] = None,
    neighborhood: Literal["queen", "rook"] = "queen",
) -> MoranResult:
    """Compute Global Moran's I for a 2D raster grid using vectorized array slices.

    Operates in pure NumPy without heavy external GIS libraries (no PySAL / SciPy).
    Execution time is sub-millisecond (< 0.3 ms for 50x80 grids).

    Parameters:
        grid: 2D numpy array of values (e.g. biomass delta, residuals, or errors).
        mask: Optional 2D boolean array (True for valid pixels inside AOI).
              If None, ~np.isnan(grid) is used.
        neighborhood: Spatial contiguity scheme: "queen" (8 neighbors) or "rook" (4 neighbors).

    Returns:
        MoranResult containing Moran's I, pixel count N, weight sum S0, VIF, and N_eff.
    """
    if not isinstance(grid, np.ndarray):
        grid = np.asarray(grid, dtype=np.float64)
    else:
        grid = grid.astype(np.float64, copy=False)

    if grid.ndim != 2:
        raise ValueError(f"grid must be a 2D array, got shape {grid.shape}")

    if mask is None:
        valid_mask = ~np.isnan(grid)
    else:
        valid_mask = mask.astype(bool, copy=False) & (~np.isnan(grid))

    n_pixels = int(np.sum(valid_mask))
    if n_pixels < 2:
        return MoranResult(
            moran_i=0.0,
            n_pixels=n_pixels,
            s0_weights=0.0,
            neighborhood=neighborhood,
            vif=1.0,
            n_eff=float(max(1, n_pixels)),
        )

    vals = grid[valid_mask]
    z_bar = float(np.mean(vals))
    dz = vals - z_bar
    ss = float(np.sum(dz**2))

    # Edge Case: Constant grid (zero spatial variance)
    if ss < 1e-12:
        return MoranResult(
            moran_i=0.0,
            n_pixels=n_pixels,
            s0_weights=0.0,
            neighborhood=neighborhood,
            vif=1.0,
            n_eff=float(n_pixels),
        )

    height, width = grid.shape
    dz_grid = np.zeros_like(grid, dtype=np.float64)
    dz_grid[valid_mask] = dz

    if neighborhood == "rook":
        directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]
    elif neighborhood == "queen":
        directions = [
            (-1, -1),
            (-1, 0),
            (-1, 1),
            (0, -1),
            (0, 1),
            (1, -1),
            (1, 0),
            (1, 1),
        ]
    else:
        raise ValueError(f"Unsupported neighborhood '{neighborhood}'. Must be 'queen' or 'rook'.")

    s0 = 0.0
    cross_sum = 0.0

    for dr, dc in directions:
        r_orig_s = max(0, -dr)
        r_orig_e = height - max(0, dr)
        c_orig_s = max(0, -dc)
        c_orig_e = width - max(0, dc)

        r_shift_s = r_orig_s + dr
        r_shift_e = r_orig_e + dr
        c_shift_s = c_orig_s + dc
        c_shift_e = c_orig_e + dc

        pair_mask = (
            valid_mask[r_orig_s:r_orig_e, c_orig_s:c_orig_e]
            & valid_mask[r_shift_s:r_shift_e, c_shift_s:c_shift_e]
        )
        cnt = int(np.sum(pair_mask))
        if cnt > 0:
            s0 += float(cnt)
            cross_sum += float(
                np.sum(
                    dz_grid[r_orig_s:r_orig_e, c_orig_s:c_orig_e][pair_mask]
                    * dz_grid[r_shift_s:r_shift_e, c_shift_s:c_shift_e][pair_mask]
                )
            )

    if s0 == 0.0:
        return MoranResult(
            moran_i=0.0,
            n_pixels=n_pixels,
            s0_weights=0.0,
            neighborhood=neighborhood,
            vif=1.0,
            n_eff=float(n_pixels),
        )

    raw_i = (float(n_pixels) / s0) * (cross_sum / ss)
    moran_i = float(np.clip(raw_i, -1.0, 1.0))
    vif, n_eff = calculate_vif_and_neff(moran_i, n_pixels)

    return MoranResult(
        moran_i=moran_i,
        n_pixels=n_pixels,
        s0_weights=s0,
        neighborhood=neighborhood,
        vif=vif,
        n_eff=n_eff,
    )


def compute_morans_i(grid: np.ndarray) -> float:
    """Scalar convenience wrapper for Moran's I (Queen neighborhood).

    Compatible with test_utils.compute_morans_i.
    """
    res = compute_morans_i_2d(grid, neighborhood="queen")
    return res.moran_i


def calculate_vif_and_neff(moran_i: float, n_pixels: int) -> Tuple[float, float]:
    """Calculate Variance Inflation Factor (VIF) and Effective Sample Size (N_eff).

    Formulas:
        N_eff = N * (1 - I) / (1 + I)
        VIF   = max(1.0, min(N, (1 + I) / (1 - I)))

    Protections:
        - I <= 0 -> VIF = 1.0 (no variance deflation in conservative accounting)
        - I >= 1.0 - 1e-7 -> VIF capped at float(N), N_eff floored at 1.0
        - N <= 0 -> VIF = 1.0, N_eff = 0.0
        - N == 1 -> VIF = 1.0, N_eff = 1.0
    """
    if n_pixels <= 0:
        return 1.0, 0.0
    if n_pixels == 1 or moran_i <= 0.0:
        return 1.0, float(n_pixels)

    if moran_i >= 1.0 - 1e-7:
        return float(n_pixels), 1.0

    vif_raw = (1.0 + moran_i) / (1.0 - moran_i)
    vif = max(1.0, min(float(n_pixels), vif_raw))

    neff_raw = float(n_pixels) * (1.0 - moran_i) / (1.0 + moran_i)
    neff = max(1.0, min(float(n_pixels), neff_raw))

    return float(vif), float(neff)


def propagate_se_proj(
    areas_ha: Union[np.ndarray, list[float]],
    sd_t0: Union[np.ndarray, list[float]],
    sd_t1: Union[np.ndarray, list[float]],
    vif: float = 1.0,
    cf: float = 0.47,
    mask: Optional[np.ndarray] = None,
) -> float:
    """Propagate standard error of net project emissions SE(E_proj) in t CO2e.

    Formula:
        SE(E_proj) = (44/12) * sqrt(CF^2 * VIF * sum(a_i^2 * (sd_t0^2 + sd_t1^2)))

    Parameters:
        areas_ha: 1D or 2D array of pixel intersection areas in hectares.
        sd_t0: Standard deviations of AGB biomass at t0 (Mg/ha dry matter).
        sd_t1: Standard deviations of AGB biomass at t1 (Mg/ha dry matter).
        vif: Variance Inflation Factor (>= 1.0).
        cf: Carbon fraction of dry matter (default 0.47).
        mask: Optional boolean mask matching array shapes.

    Returns:
        Total propagated standard error in metric tons CO2-equivalent.
    """
    a = np.asarray(areas_ha, dtype=np.float64)
    s0 = np.asarray(sd_t0, dtype=np.float64)
    s1 = np.asarray(sd_t1, dtype=np.float64)

    if mask is not None:
        m = mask.astype(bool, copy=False)
        a = a[m]
        s0 = s0[m]
        s1 = s1[m]
    else:
        valid = (~np.isnan(a)) & (~np.isnan(s0)) & (~np.isnan(s1))
        a = a[valid]
        s0 = s0[valid]
        s1 = s1[valid]

    if a.size == 0:
        return 0.0

    # Variance sum across valid pixels
    var_sum = float(np.sum((a**2) * (s0**2 + s1**2)))
    safe_vif = max(1.0, float(vif))

    # SE(E_proj) in t CO2e
    se_proj = (44.0 / 12.0) * math.sqrt((cf**2) * safe_vif * max(0.0, var_sum))
    return float(se_proj)


def propagate_se_single_year(
    areas_ha: Union[np.ndarray, list[float]],
    sd_t: Union[np.ndarray, list[float]],
    vif: float = 1.0,
    cf: float = 0.47,
    mask: Optional[np.ndarray] = None,
) -> float:
    """Propagate standard error of total carbon stock for a single observation year.

    Used for retrospective uncertainty envelope charts [L_y, U_y].

    Returns:
        Standard error in metric tons CO2-equivalent.
    """
    a = np.asarray(areas_ha, dtype=np.float64)
    st = np.asarray(sd_t, dtype=np.float64)

    if mask is not None:
        m = mask.astype(bool, copy=False)
        a = a[m]
        st = st[m]
    else:
        valid = (~np.isnan(a)) & (~np.isnan(st))
        a = a[valid]
        st = st[valid]

    if a.size == 0:
        return 0.0

    var_sum = float(np.sum((a**2) * (st**2)))
    safe_vif = max(1.0, float(vif))
    se_stock = (44.0 / 12.0) * math.sqrt((cf**2) * safe_vif * max(0.0, var_sum))
    return float(se_stock)


def compute_confidence_interval(
    e_proj: float,
    se_proj: float,
    confidence_z: float = 1.959963984540054,
) -> Tuple[float, float, float]:
    """Compute confidence interval [L, U] and half-width H.

    Parameters:
        e_proj: Net project emissions in t CO2e (negative for removals).
        se_proj: Standard error of net project emissions.
        confidence_z: Two-tailed normal quantile (1.96 for 95% CI).

    Returns:
        Tuple of (ci_lower_l, ci_upper_u, half_width_h).
    """
    h = confidence_z * max(0.0, se_proj)
    ci_lower = e_proj - h
    ci_upper = e_proj + h
    return float(ci_lower), float(ci_upper), float(h)


def compute_uncertainty_bounds(
    area_ha: float,
    pixel_count: int,
    mean_sd_t0: float,
    mean_sd_t1: float,
    moran_i: float,
    e_proj_tco2e: float,
    confidence_level: float = 0.95,
) -> Dict[str, float]:
    """Propagates standard errors with Moran's I spatial autocorrelation and VIF.

    Compatible with test_utils.compute_uncertainty_bounds.
    """
    clamped_i = max(-0.95, min(0.95, moran_i))

    if clamped_i > 0:
        n_eff = max(1.0, pixel_count * (1.0 - clamped_i) / (1.0 + clamped_i))
    else:
        n_eff = float(pixel_count)

    vif = pixel_count / n_eff
    avg_pixel_ha = area_ha / max(1, pixel_count)
    var_delta_b = (mean_sd_t0**2) + (mean_sd_t1**2)
    sum_a2 = pixel_count * (avg_pixel_ha**2)
    var_delta_c = (0.47**2) * vif * sum_a2 * var_delta_b
    se_tco2e = (44.0 / 12.0) * math.sqrt(var_delta_c)

    z = 1.959963984540054
    half_width_h = z * se_tco2e
    ci_lower = e_proj_tco2e - half_width_h
    ci_upper = e_proj_tco2e + half_width_h

    return {
        "moran_i": moran_i,
        "n_eff": n_eff,
        "vif": vif,
        "se_tco2e": se_tco2e,
        "half_width_h": half_width_h,
        "ci_lower_l": ci_lower,
        "ci_upper_u": ci_upper,
    }


def evaluate_crediting_with_uncertainty(
    r_gross: float,
    half_width_h: float,
    e_proj: float = 0.0,
    moran_i: float = 0.0,
    vif: float = 1.0,
    n_eff: float = 0.0,
    unc_allowance: float = 0.10,
    unc_stop_ratio: float = 1.0,
    buf_rate: float = 0.15,
) -> UncertaintyResult:
    """Apply carbon accounting crediting rules and blocking criteria.

    Rules:
        1. If R <= 0: Q = 0, H/R is None, blocking_reason = "NO_NET_CARBON_BENEFIT".
        2. If H/R >= 1.0: Q = 0, UNC = 1.0, blocking_reason = "UNCERTAINTY_EXCEEDS_THRESHOLD".
        3. If 0.10 < H/R < 1.0: UNC = H/R - 0.10.
        4. If H/R <= 0.10: UNC = 0.0 (allowance).
        5. R_adj = R * (1.0 - UNC)
        6. Buffer B = 0.15 * R_adj
        7. Tradable units Q = floor(R_adj - B)

    Returns:
        UncertaintyResult populated with all audit metrics.
    """
    se_proj = half_width_h / 1.959963984540054 if half_width_h > 0 else 0.0
    ci_lower = e_proj - half_width_h
    ci_upper = e_proj + half_width_h

    # Case 1: Non-positive carbon benefit R <= 0
    if r_gross <= 0.0:
        return UncertaintyResult(
            moran_i=float(moran_i),
            vif=float(vif),
            n_eff=float(n_eff),
            se_proj=float(se_proj),
            half_width_h=float(half_width_h),
            ci_lower_l=float(ci_lower),
            ci_upper_u=float(ci_upper),
            h_over_r=None,
            unc_deduction=0.0,
            r_adjusted=0.0,
            buffer_reserve=0.0,
            q_tradable_units=0,
            is_valid=True,
            blocking_reason="NO_NET_CARBON_BENEFIT",
        )

    h_over_r = half_width_h / r_gross

    # Case 2: Uncertainty ratio exceeds stopping threshold (H/R >= 1.0)
    if h_over_r >= unc_stop_ratio:
        return UncertaintyResult(
            moran_i=float(moran_i),
            vif=float(vif),
            n_eff=float(n_eff),
            se_proj=float(se_proj),
            half_width_h=float(half_width_h),
            ci_lower_l=float(ci_lower),
            ci_upper_u=float(ci_upper),
            h_over_r=float(h_over_r),
            unc_deduction=1.0,
            r_adjusted=0.0,
            buffer_reserve=0.0,
            q_tradable_units=0,
            is_valid=True,
            blocking_reason="UNCERTAINTY_EXCEEDS_THRESHOLD",
        )

    # Case 3: Valid crediting with possible uncertainty deduction
    if h_over_r <= unc_allowance or abs(h_over_r - unc_allowance) < 1e-9:
        unc_deduction = 0.0
    else:
        unc_deduction = min(1.0, h_over_r - unc_allowance)

    r_adj = r_gross * (1.0 - unc_deduction)
    buf = r_adj * buf_rate
    q_units = math.floor(max(0.0, r_adj - buf))

    return UncertaintyResult(
        moran_i=float(moran_i),
        vif=float(vif),
        n_eff=float(n_eff),
        se_proj=float(se_proj),
        half_width_h=float(half_width_h),
        ci_lower_l=float(ci_lower),
        ci_upper_u=float(ci_upper),
        h_over_r=float(h_over_r),
        unc_deduction=float(unc_deduction),
        r_adjusted=float(r_adj),
        buffer_reserve=float(buf),
        q_tradable_units=int(q_units),
        is_valid=True,
        blocking_reason=None,
    )


def calculate_spatial_uncertainty(
    b_t0: np.ndarray,
    b_t1: np.ndarray,
    sd_t0: np.ndarray,
    sd_t1: np.ndarray,
    areas_ha: np.ndarray,
    mask: Optional[np.ndarray] = None,
    e_proj: float = 0.0,
    r_gross: float = 0.0,
    neighborhood: Literal["queen", "rook"] = "queen",
    cf: float = 0.47,
    unc_allowance: float = 0.10,
    unc_stop_ratio: float = 1.0,
    buf_rate: float = 0.15,
) -> UncertaintyResult:
    """High-level orchestrator: computes spatial autocorrelation on biomass delta grid,
    propagates pixel standard deviations, and evaluates crediting metrics.
    """
    delta_b = b_t1.astype(np.float64) - b_t0.astype(np.float64)

    moran = compute_morans_i_2d(delta_b, mask=mask, neighborhood=neighborhood)
    se_proj = propagate_se_proj(areas_ha, sd_t0, sd_t1, vif=moran.vif, cf=cf, mask=mask)
    ci_lower, ci_upper, half_width_h = compute_confidence_interval(e_proj, se_proj)

    return evaluate_crediting_with_uncertainty(
        r_gross=r_gross,
        half_width_h=half_width_h,
        e_proj=e_proj,
        moran_i=moran.moran_i,
        vif=moran.vif,
        n_eff=moran.n_eff,
        unc_allowance=unc_allowance,
        unc_stop_ratio=unc_stop_ratio,
        buf_rate=buf_rate,
    )
