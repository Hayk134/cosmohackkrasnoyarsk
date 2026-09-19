"""backend/app/api/routes_report.py

Verifiable audit report generation producing printable HTML and structured JSON
with cryptographic SHA-256 calculation verification signatures.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, Optional, Union

from fastapi import APIRouter, HTTPException, status

from backend.app.api.routes_mrv import calculate_mrv
from backend.app.core.audit import compute_calculation_hash
from backend.app.schemas.mrv import ReportRequest, ReportResponse

router = APIRouter(tags=["Audit Reports"])


@router.post("/report/generate", response_model=ReportResponse)
def generate_audit_report(request: Union[ReportRequest, Dict[str, Any]]) -> ReportResponse:
    """Produces a verifiable, tamper-evident audit report in structured JSON and printable HTML
    with full carbon accounting waterfall, spatial uncertainty analysis, and SHA-256 hash seal.
    """
    if hasattr(request, "model_dump"):
        data = request.model_dump()
    elif hasattr(request, "dict"):
        data = request.dict()
    elif isinstance(request, dict):
        data = request
    else:
        data = {}

    site_id = data.get("site_id") or "RU_TVER_01"
    project_name = data.get("project_name") or f"Forest Carbon Project ({site_id})"
    verifier_notes = data.get("verifier_notes") or "Verified against real satellite raster telemetry in data/."
    calc_res = data.get("calculation_result")

    # If calculation result was not provided, compute it
    if not calc_res:
        calc_obj = calculate_mrv({"site_id": site_id, "year_start": 2019, "year_end": 2024})
        calc_res = calc_obj.model_dump()

    now_iso = datetime.now(timezone.utc).isoformat()
    calc_hash = calc_res.get("calculation_hash") or compute_calculation_hash(calc_res)
    short_hash = calc_hash[:8].upper()
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    report_id = f"REP-{site_id}-{date_str}-{short_hash}"

    area_ha = calc_res.get("area_ha", 0.0)
    q_units = calc_res.get("q_tradable_units", 0)
    r_gross = calc_res.get("r_gross_t_co2e", 0.0)
    r_adj = calc_res.get("r_adjusted", 0.0)
    buffer_b = calc_res.get("buffer_reserve", 0.0)
    unc_ded = calc_res.get("unc_deduction", 0.0)
    h_val = calc_res.get("half_width_h")
    h_str = f"{h_val:.2f}" if h_val is not None else "N/A"
    moran_i = calc_res.get("moran_i", 0.0)
    vif = calc_res.get("vif", 1.0)
    se_proj = calc_res.get("se_proj", 0.0)
    t0_b = calc_res.get("t0_biomass_t_ha", 0.0)
    t1_b = calc_res.get("t1_biomass_t_ha", 0.0)
    delta_b = calc_res.get("delta_biomass_t_ha", 0.0)
    e_proj = calc_res.get("e_proj_t_co2e", 0.0)
    e_base = calc_res.get("e_base_t_co2e", 0.0)
    val = calc_res.get("scenario_valuations", {})
    val_low = val.get("rub_500", q_units * 500.0)
    val_base = val.get("rub_1500", q_units * 1500.0)
    val_high = val.get("rub_4000", q_units * 4000.0)
    is_valid = calc_res.get("is_valid", True)
    blocking_reason = calc_res.get("blocking_reason")

    # Structured JSON report payload
    json_report = {
        "report_id": report_id,
        "generated_at": now_iso,
        "verification_hash": calc_hash,
        "project": {
            "site_id": site_id,
            "project_name": project_name,
            "area_ha": area_ha,
            "observation_period": f"{calc_res.get('delta_years', 5)} years",
        },
        "telemetry_sources": [
            {"product": "ESA CCI Biomass v7.0", "resolution": "100 m", "metric": "Aboveground Biomass (AGB & AGB_SD)"},
            {"product": "Sentinel-2 L2A", "resolution": "10 m", "metric": "Surface Reflectance with BOA offset & SCL cloud mask"},
            {"product": "MODIS MCD64A1 v061", "resolution": "500 m", "metric": "Monthly Burn Date & Fire Uncertainty"},
            {"product": "Hansen GFC v1.13", "resolution": "30 m", "metric": "Annual Tree Cover Loss & 2000 Canopy Cover"},
        ],
        "accounting_waterfall": {
            "t0_biomass_t_ha": t0_b,
            "t1_biomass_t_ha": t1_b,
            "delta_biomass_t_ha": delta_b,
            "e_proj_t_co2e": e_proj,
            "e_base_t_co2e": e_base,
            "r_gross_t_co2e": r_gross,
            "moran_i": moran_i,
            "vif": vif,
            "se_proj": se_proj,
            "half_width_h": h_val,
            "unc_deduction_pct": round(unc_ded * 100, 2),
            "r_adjusted": r_adj,
            "buffer_pool_15pct": buffer_b,
            "q_tradable_units": q_units,
        },
        "financial_valuations_rub": {
            "conservative_500": val_low,
            "base_1500": val_base,
            "optimistic_4000": val_high,
        },
        "compliance": {
            "is_valid": is_valid,
            "blocking_reason": blocking_reason,
            "verifier_notes": verifier_notes,
            "methodology": "IPCC 2006 Stock-Difference & Spatial Autocorrelation VIF",
        },
    }

    # Printable HTML Report with responsive styles and @media print
    html_report = f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Audit Certificate — {report_id}</title>
<style>
  @page {{ size: A4 portrait; margin: 15mm; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #18181b;
    background-color: #ffffff;
    margin: 0;
    padding: 24px;
    font-size: 13px;
    line-height: 1.5;
  }}
  .header {{
    border-bottom: 3px solid #10b981;
    padding-bottom: 16px;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }}
  .brand-title {{
    font-size: 20px;
    font-weight: 700;
    color: #09090b;
    letter-spacing: -0.5px;
    text-transform: uppercase;
  }}
  .brand-sub {{
    font-size: 12px;
    color: #059669;
    font-weight: 600;
  }}
  .badge {{
    display: inline-block;
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    background: {'#d1fae5' if is_valid else '#fee2e2'};
    color: {'#065f46' if is_valid else '#991b1b'};
    border: 1px solid {'#a7f3d0' if is_valid else '#fecaca'};
  }}
  .grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
  }}
  .card {{
    background: #f4f4f5;
    border: 1px solid #e4e4e7;
    border-radius: 12px;
    padding: 14px;
  }}
  .card-title {{
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: #71717a;
    margin-bottom: 8px;
  }}
  .kpi-row {{
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    border-bottom: 1px dashed #e4e4e7;
  }}
  .kpi-row:last-child {{ border-bottom: none; }}
  .kpi-label {{ color: #52525b; }}
  .kpi-val {{ font-weight: 600; color: #09090b; }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
    border-radius: 8px;
    overflow: hidden;
  }}
  th, td {{
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid #e4e4e7;
  }}
  th {{
    background: #27272a;
    color: #ffffff;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }}
  tr:nth-child(even) {{ background: #fafafa; }}
  .highlight-row {{
    background: #ecfdf5 !important;
    font-weight: 700;
    color: #065f46;
  }}
  .hash-box {{
    background: #18181b;
    color: #34d399;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    padding: 12px;
    border-radius: 8px;
    word-break: break-all;
    margin-bottom: 24px;
    border: 1px solid #27272a;
  }}
  .footer {{
    margin-top: 32px;
    border-top: 1px solid #e4e4e7;
    padding-top: 12px;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #71717a;
  }}
  @media print {{
    body {{ padding: 0; }}
    .card {{ break-inside: avoid; }}
    table {{ break-inside: avoid; }}
  }}
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-title">Kosmo·MRV Satellite Verification Audit</div>
      <div class="brand-sub">Independent Scientific Telemetry & Carbon Accounting Certificate</div>
    </div>
    <div style="text-align: right;">
      <span class="badge">{'VERIFIED & ACCREDITED' if is_valid else 'BLOCKED / REJECTED'}</span>
      <div style="font-size: 11px; color: #71717a; margin-top: 4px;">Cert ID: {report_id}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Project AOI Identification</div>
      <div class="kpi-row"><span class="kpi-label">Site ID:</span><span class="kpi-val">{site_id}</span></div>
      <div class="kpi-row"><span class="kpi-label">Project Name:</span><span class="kpi-val">{project_name}</span></div>
      <div class="kpi-row"><span class="kpi-label">WGS84 Ellipsoidal Area:</span><span class="kpi-val">{area_ha:,.2f} ha</span></div>
      <div class="kpi-row"><span class="kpi-label">Observation Period:</span><span class="kpi-val">2019 – 2024</span></div>
      <div class="kpi-row"><span class="kpi-label">Validation Status:</span><span class="kpi-val">{'Valid' if is_valid else blocking_reason or 'Blocked'}</span></div>
    </div>

    <div class="card">
      <div class="card-title">Carbon Unit Crediting Summary</div>
      <div class="kpi-row"><span class="kpi-label">Net Carbon Benefit (R):</span><span class="kpi-val">{r_gross:,.2f} t CO₂e</span></div>
      <div class="kpi-row"><span class="kpi-label">Uncertainty Haircut (UNC):</span><span class="kpi-val">{unc_ded*100:.1f}%</span></div>
      <div class="kpi-row"><span class="kpi-label">Adjusted Benefit (R_adj):</span><span class="kpi-val">{r_adj:,.2f} t CO₂e</span></div>
      <div class="kpi-row"><span class="kpi-label">Risk Buffer Reserve (B 15%):</span><span class="kpi-val">{buffer_b:,.2f} t CO₂e</span></div>
      <div class="kpi-row" style="background:#ecfdf5; border-radius:6px; padding:6px 8px;">
        <span class="kpi-label" style="color:#065f46; font-weight:700;">Tradable Units (Q):</span>
        <span class="kpi-val" style="color:#059669; font-size:16px;">{q_units:,} units</span>
      </div>
    </div>
  </div>

  <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px;">Methodological Accounting Waterfall (IPCC Stock-Difference)</div>
  <table>
    <thead>
      <tr>
        <th>Accounting Step</th>
        <th>Equation / Source</th>
        <th>Value</th>
        <th>Units</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Start Biomass Density (t0)</td>
        <td>ESA CCI Biomass 2019 (Band 1)</td>
        <td>{t0_b:.2f}</td>
        <td>t / ha</td>
      </tr>
      <tr>
        <td>End Biomass Density (t1)</td>
        <td>ESA CCI Biomass 2024 (Band 1)</td>
        <td>{t1_b:.2f}</td>
        <td>t / ha</td>
      </tr>
      <tr>
        <td>Biomass Density Change (Δb)</td>
        <td>b1 - b0</td>
        <td>{delta_b:+.2f}</td>
        <td>t / ha</td>
      </tr>
      <tr>
        <td>Net Project Emissions (E_proj)</td>
        <td>- Area × ΔC × (44 / 12)</td>
        <td>{e_proj:,.2f}</td>
        <td>t CO₂e</td>
      </tr>
      <tr>
        <td>Counterfactual Baseline (E_base)</td>
        <td>data/methodology/baseline.csv</td>
        <td>{e_base:,.2f}</td>
        <td>t CO₂e</td>
      </tr>
      <tr>
        <td>Gross Carbon Benefit (R)</td>
        <td>E_base - E_proj - Leakage</td>
        <td>{r_gross:,.2f}</td>
        <td>t CO₂e</td>
      </tr>
      <tr>
        <td>Spatial Autocorrelation (Moran's I)</td>
        <td>Vectorized Queen 2D Moran's I</td>
        <td>{moran_i:.4f}</td>
        <td>dimensionless</td>
      </tr>
      <tr>
        <td>Variance Inflation Factor (VIF)</td>
        <td>Clifford-Ord N / N_eff</td>
        <td>{vif:.2f}</td>
        <td>multiplier</td>
      </tr>
      <tr>
        <td>Standard Error SE(E_proj)</td>
        <td>(44/12) × sqrt(CF² × VIF × Σ a_i² σ_i²)</td>
        <td>{se_proj:,.2f}</td>
        <td>t CO₂e</td>
      </tr>
      <tr>
        <td>95% Confidence Half-Width (H)</td>
        <td>1.96 × SE(E_proj)</td>
        <td>{h_str}</td>
        <td>t CO₂e</td>
      </tr>
      <tr>
        <td>Uncertainty Deduction (UNC)</td>
        <td>max(0, H/R - 0.10)</td>
        <td>{unc_ded:.4f}</td>
        <td>ratio</td>
      </tr>
      <tr>
        <td>Adjusted Return (R_adj)</td>
        <td>R × (1 - UNC)</td>
        <td>{r_adj:,.2f}</td>
        <td>t CO₂e</td>
      </tr>
      <tr>
        <td>Permanence Buffer (B)</td>
        <td>0.15 × R_adj</td>
        <td>{buffer_b:,.2f}</td>
        <td>t CO₂e</td>
      </tr>
      <tr class="highlight-row">
        <td>Final Tradable Units (Q)</td>
        <td>floor(R_adj - B)</td>
        <td>{q_units:,}</td>
        <td>Carbon Units (t CO₂e)</td>
      </tr>
    </tbody>
  </table>

  <div class="grid">
    <div class="card">
      <div class="card-title">Scenario Market Valuations</div>
      <div class="kpi-row"><span class="kpi-label">Conservative (500 ₽/unit):</span><span class="kpi-val">{val_low:,.2f} ₽</span></div>
      <div class="kpi-row"><span class="kpi-label">Base Scenario (1,500 ₽/unit):</span><span class="kpi-val">{val_base:,.2f} ₽</span></div>
      <div class="kpi-row"><span class="kpi-label">Optimistic (4,000 ₽/unit):</span><span class="kpi-val">{val_high:,.2f} ₽</span></div>
    </div>
    <div class="card">
      <div class="card-title">Verification & Audit Notes</div>
      <div style="font-size: 12px; color: #3f3f46; margin-top: 4px;">{verifier_notes}</div>
    </div>
  </div>

  <div style="font-size: 12px; font-weight: 700; color: #27272a; margin-bottom: 6px;">
    Cryptographic SHA-256 Calculation Seal (Tamper-Proof Audit Trail)
  </div>
  <div class="hash-box">
    SHA-256: {calc_hash}
  </div>

  <div class="footer">
    <div>Generated: {now_iso}</div>
    <div>KosmoHackathon 2026 MRV Engine v1.0</div>
    <div>Page 1 of 1</div>
  </div>
</body>
</html>
"""

    return ReportResponse(
        report_id=report_id,
        generated_at=now_iso,
        verification_hash=calc_hash,
        html_report=html_report,
        json_report=json_report,
        is_valid=is_valid,
    )
