/**
 * API client and types for Kosmo·MRV Satellite Verification Service
 */

export interface SiteInfo {
  id: string;
  name: string;
  area_ha: number;
  bounds: [number, number, number, number]; // [min_lon, min_lat, max_lon, max_lat]
  geojson: any;
  region?: string;
  role?: string;
  project_status?: string;
  baseline_id?: string;
  year_start?: number;
  year_end?: number;
}

export interface PolygonValidationResponse {
  is_valid: boolean;
  area_ha: number;
  bounds?: [number, number, number, number];
  message?: string;
  blocking_reason?: string;
  error?: string;
}

export interface CalculationResponse {
  site_id?: string;
  area_ha: number;
  delta_years: number;
  t0_biomass_t_ha: number;
  t1_biomass_t_ha: number;
  delta_biomass_t_ha: number;
  c0_t_c_ha: number;
  c1_t_c_ha: number;
  delta_c_t_c_ha: number;
  delta_c_total_t: number;
  delta_carbon_t: number;
  e_proj_t_co2e: number;
  e_proj_rate_t_co2e_ha_yr: number;
  baseline_delta_tc_ha: number;
  delta_c_base_total_t: number;
  e_base_t_co2e: number;
  e_base_rate_t_co2e_ha_yr: number;
  leakage_lk: number;
  r_gross_t_co2e: number;
  moran_i: number;
  vif: number;
  n_eff: number;
  se_proj: number;
  half_width_h?: number;
  ci_lower_l?: number;
  ci_upper_u?: number;
  h_over_r?: number;
  unc_deduction: number;
  r_adjusted: number;
  buffer_reserve: number;
  q_tradable_units: number;
  scenario_valuations: {
    rub_500: number;
    rub_1500: number;
    rub_4000: number;
  };
  is_valid: boolean;
  blocking_reason?: string;
  calculation_hash: string;
  timestamp?: string;
}

export interface TimeseriesItem {
  year: number;
  biomass_t_ha: number;
  carbon_stock_t: number;
  sd?: number;
  ci_lower?: number;
  ci_upper?: number;
}

export interface ProjectionItem {
  year: number;
  e_base: number;
  e_proj_est: number;
  ci_lower: number;
  ci_upper: number;
}

export interface TimeseriesResponse {
  site_id?: string;
  retrospective: TimeseriesItem[];
  projections: ProjectionItem[];
}

export interface DisturbanceResponse {
  site_id?: string;
  modis_fire_detected: boolean;
  burned_area_ha: number;
  burn_dates: string[];
  hansen_loss_detected: boolean;
  loss_pixels_recent: number;
  canopy_cover_avg: number;
  sentinel2_ndvi: number;
  sentinel2_nbr: number;
  cloud_filtered: boolean;
  burn_severity_dnbr?: number;
  details?: Record<string, any>;
}

export interface RegistryTransaction {
  tx_id: string;
  type: string;
  action: string;
  from: string;
  from_account?: string;
  to: string;
  to_account?: string;
  units: number;
  batch_id?: string;
  calculation_hash?: string;
  beneficiary?: string;
  reason?: string;
  timestamp: string;
}

export interface RegistryBatch {
  batch_id: string;
  aoi_id: string;
  year: number;
  count: number;
  owner: string;
  serial_range: string;
  calculation_hash: string;
  status: string;
  issued_at: string;
}

export interface RegistrySummary {
  total_issued: number;
  total_retired: number;
  active_balances: Record<string, number>;
  batches: RegistryBatch[];
  transactions: RegistryTransaction[];
  conservation_verified: boolean;
}

export interface TransactionResponse {
  tx_id: string;
  action: string;
  units: number;
  status: string;
  message?: string;
  from_account?: string;
  to_account?: string;
  batch_id?: string;
  details?: any;
}

export interface ReportResponse {
  report_id: string;
  generated_at: string;
  verification_hash: string;
  html_report: string;
  json_report: Record<string, any>;
  is_valid: boolean;
}

export interface OverlayBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const rawBase = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' && window.location.hostname.includes('github.io') ? 'https://213.176.118.9.sslip.io' : '');
const API_BASE = rawBase
  ? `${rawBase.replace(/\/+$/, '')}/api`
  : '/api';

export async function fetchSites(): Promise<SiteInfo[]> {
  const res = await fetch(`${API_BASE}/sites`);
  if (!res.ok) throw new Error(`Failed to load sites: ${res.statusText}`);
  return res.json();
}

export async function validatePolygon(geojson: any): Promise<PolygonValidationResponse> {
  const res = await fetch(`${API_BASE}/sites/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify({ geojson }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Validation failed');
  }
  return res.json();
}

export async function calculateMRV(payload: {
  site_id?: string;
  polygon?: any;
  year_start?: number;
  year_end?: number;
  leakage_lk?: number;
  spatial_model?: string;
}): Promise<CalculationResponse> {
  const res = await fetch(`${API_BASE}/mrv/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Calculation failed');
  }
  return res.json();
}

export async function fetchTimeseries(payload: {
  site_id?: string;
  polygon?: any;
}): Promise<TimeseriesResponse> {
  const res = await fetch(`${API_BASE}/mrv/timeseries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Timeseries calculation failed');
  }
  return res.json();
}

export async function fetchDisturbances(payload: {
  site_id?: string;
  polygon?: any;
}): Promise<DisturbanceResponse> {
  const res = await fetch(`${API_BASE}/mrv/disturbances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Disturbance analysis failed');
  }
  return res.json();
}

export function getRasterOverlayUrl(site: string, layer: string, year: number = 2024, year_start?: number): string {
  // Map UI layer names to backend query params
  const layerMap: Record<string, string> = {
    biomass: 'biomass',
    fire: 'fire',
    hansen_loss: 'loss',
    loss: 'loss',
    ndvi: 'ndvi',
    nbr: 'nbr',
    change: 'change',
    satellite: 'satellite',
    rgb: 'satellite',
  };
  const resolvedLayer = layerMap[layer] || layer;
  let url = `${API_BASE}/raster/overlay?site_id=${encodeURIComponent(site)}&layer=${encodeURIComponent(resolvedLayer)}&year=${year}`;
  if (year_start) {
    url += `&year_start=${year_start}`;
  }
  return url;
}

export async function fetchRasterOverlayWithBounds(
  site: string,
  layer: string,
  year: number = 2024,
  year_start?: number
): Promise<{ url: string; bounds: OverlayBounds }> {
  let url = getRasterOverlayUrl(site, layer, year, year_start);
  url += `&_t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch raster: ${res.statusText}`);

  const west = parseFloat(res.headers.get('x-bbox-west') || '0');
  const south = parseFloat(res.headers.get('x-bbox-south') || '0');
  const east = parseFloat(res.headers.get('x-bbox-east') || '0');
  const north = parseFloat(res.headers.get('x-bbox-north') || '0');

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  return {
    url: blobUrl,
    bounds: { west, south, east, north },
  };
}

export async function fetchRegistrySummary(): Promise<RegistrySummary> {
  const res = await fetch(`${API_BASE}/registry/summary`);
  if (!res.ok) throw new Error(`Failed to fetch registry summary: ${res.statusText}`);
  return res.json();
}

export async function fetchTransactions(): Promise<RegistryTransaction[]> {
  const res = await fetch(`${API_BASE}/registry/transactions`);
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.statusText}`);
  return res.json();
}

export async function transact(payload: {
  action: 'issue' | 'transfer' | 'retire';
  units: number;
  account?: string;
  from_account?: string;
  to_account?: string;
  site_id?: string;
  year?: number;
  calculation_hash?: string;
  beneficiary?: string;
  reason?: string;
}): Promise<TransactionResponse> {
  const res = await fetch(`${API_BASE}/registry/transact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Transaction failed');
  }
  return res.json();
}

export async function resetRegistry(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/registry/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`Reset failed: ${res.statusText}`);
  return res.json();
}

export async function generateReport(payload: {
  site_id?: string;
  project_name?: string;
  calculation_result?: any;
  verifier_notes?: string;
}): Promise<ReportResponse> {
  const res = await fetch(`${API_BASE}/report/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Report generation failed');
  }
  return res.json();
}

/* ==========================================================================
 * B2B Institutional Suite Interfaces & Functions
 * ========================================================================== */

export interface AnnualCashFlow {
  year: number;
  gross_revenue_rub: number;
  opex_rub: number;
  net_cash_flow_rub: number;
  dcf_rub: number;
  cumulative_dcf_rub: number;
  cumulative_cash_flow_undiscounted_rub: number;
  carbon_credits_issued: number;
  carbon_price_rub: number;
}

export interface ROIScenarioMetrics {
  price_rub: number;
  npv_rub: number;
  irr_percent?: number | null;
  break_even_year?: number | null;
  payback_period_years?: number | null;
  break_even_year_simple?: number | null;
  total_capex_rub: number;
  total_opex_nominal_rub: number;
  total_revenue_rub: number;
  total_net_cash_flow_rub: number;
  roi_percent: number;
  profitability_index: number;
  is_profitable: boolean;
}

export interface TimberComparisonResult {
  timber_volume_m3_ha: number;
  timber_price_m3: number;
  logging_cost_m3: number;
  net_logging_margin_m3: number;
  gross_timber_revenue_rub: number;
  reforestation_cost_rub: number;
  timber_net_proceeds_year0_rub: number;
  timber_annual_tax_rub_yr: number;
  timber_npv_rub: number;
  carbon_npv_rub: number;
  delta_npv_rub: number;
  parity_carbon_price_rub: number;
  preferred_option: 'CARBON_PROJECT' | 'TIMBER_HARVEST';
  recommendation: 'CARBON_PREFERRED' | 'TIMBER_PREFERRED';
  carbon_advantage_pct: number;
  timber_cash_flows: number[];
  summary: string;
}

export interface ROIRequest {
  area_ha: number;
  capex_per_ha?: number;
  opex_per_ha_yr?: number;
  carbon_yield_t_ha_yr?: number;
  price_rub?: number;
  discount_rate?: number;
  years?: number;
  g_opex?: number;
  g_price?: number;
  site_id?: string;
  timber_price_m3?: number;
  timber_stock_m3_ha?: number;
  logging_cost_rub_m3?: number;
  reforestation_cost_rub_ha?: number;
  timber_annual_tax_rub_ha?: number;
}

export interface ROIResponse {
  area_ha: number;
  years: number;
  discount_rate: number;
  carbon_yield_t_ha_yr: number;
  price_rub: number;
  total_capex_rub: number;
  total_opex_nominal_rub: number;
  total_net_cash_flow_rub: number;
  npv_rub: number;
  irr_percent?: number | null;
  break_even_year?: number | null;
  payback_period_years?: number | null;
  selected_scenario: ROIScenarioMetrics;
  scenarios: Record<string, ROIScenarioMetrics>;
  cash_flows: AnnualCashFlow[];
  timber_comparison: TimberComparisonResult;
  calculation_hash: string;
}

export interface InsuranceEvaluationRequest {
  site_id?: string;
  polygon_geojson?: any;
  burn_threshold_percent?: number;
  carbon_price_rub?: number;
}

export interface InsuranceEvaluationResponse {
  site_id?: string;
  polygon_area_ha: number;
  area_ha: number;
  burn_area_ha: number;
  burn_percentage: number;
  burned_fraction_pct: number;
  burn_threshold_percent: number;
  trigger_activated: boolean;
  telemetry_source: string;
  total_buffer_pool_units: number;
  payout_eligible_units: number;
  payout_amount_rub: number;
  solvency_status: 'SOLVENT' | 'PARTIALLY_DEFICIT' | 'NORMAL_BELOW_TRIGGER';
  status: 'TRIGGER_ACTIVATED' | 'NORMAL_BELOW_THRESHOLD' | 'NO_DISTURBANCE_DETECTED';
  calculation_hash: string;
  message: string;
}

export interface InsuranceClaimRequest {
  site_id: string;
  claimant_account?: string;
  carbon_price_rub?: number;
  burn_threshold_percent?: number;
  incident_description?: string;
  polygon_geojson?: any;
}

export interface InsuranceClaimResponse {
  claim_id: string;
  status: 'APPROVED_AND_SETTLED' | 'REJECTED_THRESHOLD_NOT_MET' | 'SOLVENCY_EXCEEDED';
  site_id: string;
  burn_area_ha: number;
  burned_area_ha: number;
  burn_percentage: number;
  burned_fraction_pct: number;
  credits_damaged: number;
  indemnity_credits_awarded: number;
  payout_amount_rub: number;
  payout_rub: number;
  carbon_price_applied_rub: number;
  buffer_pool_initial_units: number;
  buffer_pool_remaining_units: number;
  claim_timestamp: string;
  calculation_hash: string;
  cryptographic_audit_seal: string;
  message: string;
}

export interface BufferPoolStatusResponse {
  site_id?: string;
  total_buffer_reserve_units: number;
  buffer_pool_value_rub_500: number;
  buffer_pool_value_rub_1500: number;
  buffer_pool_value_rub_4000: number;
  solvency_status: 'FULLY_SOLVENT' | 'PARTIALLY_COMMITTED' | 'CRITICAL_DEFICIT';
  active_claims_count: number;
  total_claims_paid_units: number;
  total_claims_paid_rub: number;
  sites: Record<string, any>;
}

export interface BaselineMatchingRequest {
  site_id?: string;
  polygon_geojson?: any;
  reference_site_id?: string;
  buffer_radius_km?: number;
}

export interface BaselineMatchingResponse {
  project_site_id: string;
  reference_site_id: string;
  match_quality_score: number;
  initial_biomass_diff_pct: number;
  project_agb_2019: number;
  project_agb_2024: number;
  reference_agb_2019: number;
  reference_agb_2024: number;
  project_delta_agb: number;
  reference_delta_agb: number;
  additionality_net_t_ha: number;
  additionality_co2e_t: number;
  divergence_ratio: number;
  verdict: 'ADDITIONALITY_VERIFIED' | 'NON_ADDITIONAL_RISK';
  similarity_distance: number;
  feature_weights?: Record<string, number>;
  calculation_hash?: string;
}

export interface SpeciesClassificationRequest {
  site_id?: string;
  polygon_geojson?: any;
  scene_id?: string;
}

export interface SpeciesClassificationResponse {
  site_id?: string;
  coniferous_share: number;
  small_leaved_share: number;
  broadleaved_share: number;
  adaptive_cf: number;
  default_cf: number;
  cf_delta_percent: number;
  dominant_species_group: 'CONIFEROUS' | 'SMALL_LEAVED_DECIDUOUS' | 'BROADLEAVED';
  confidence_score: number;
  total_valid_pixels: number;
  carbon_effect_adjustment_pct: number;
  calculation_hash?: string;
}

export interface HotspotAlert {
  latitude: number;
  longitude: number;
  brightness_temp_kelvin: number;
  confidence_pct: number;
  distance_km: number;
  bearing_deg: number;
  cardinal_direction: string;
  alert_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  detection_timestamp: string;
  sensor: string;
}

export interface FIRMSAlertsResponse {
  site_id?: string;
  target_lat: number;
  target_lon: number;
  surveillance_radius_km: number;
  hotspots_detected: number;
  closest_distance_km: number;
  max_confidence_pct: number;
  threat_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE';
  alerts: HotspotAlert[];
}

export interface SARMonitoringRequest {
  site_id?: string;
  polygon_geojson?: any;
  start_date?: string;
  end_date?: string;
}

export interface SARMonitoringResponse {
  site_id?: string;
  cloud_penetration_status: string;
  optical_cloud_blind_days_avoided: number;
  all_weather_coverage_pct: number;
  backscatter_delta_vh_db: number;
  coherence_delta: number;
  disturbance_detected: boolean;
  confidence: number;
  detected_clear_cuts_ha: number;
  recommendation: string;
  calculation_hash?: string;
}

export interface ScenarioProjection {
  year: number;
  temperature_anomaly_c: number;
  fire_hazard_multiplier: number;
  spei_drought_anomaly: number;
  annual_mortality_rate_pct: number;
  cumulative_loss_pct: number;
}

export interface ClimateScenarioResult {
  scenario_name: 'SSP2-4.5' | 'SSP5-8.5';
  description: string;
  projections: ScenarioProjection[];
  cumulative_permanence_risk_2050_pct: number;
  buffer_adequacy_status: 'ADEQUATE' | 'DEFICIT';
  recommended_buffer_rate_pct: number;
}

export interface ClimateRiskRequest {
  site_id?: string;
  polygon_geojson?: any;
  buffer_reserve_pct?: number;
}

export interface ClimateRiskResponse {
  site_id?: string;
  scenarios: Record<string, ClimateScenarioResult>;
  buffer_pool_adequacy_2050: string;
  baseline_year: number;
  horizon_year: number;
  executive_summary: string;
  calculation_hash?: string;
}

export interface LandScoutRequest {
  polygon_geojson?: any;
  site_id?: string;
  target_species?: string;
  seedling_cost_rub_ha?: number;
  carbon_price_rub?: number;
  discount_rate?: number;
  opex_per_ha_yr?: number;
}

export interface LandScoutResponse {
  land_suitability_index: number;
  recommendation: 'HIGH_POTENTIAL' | 'MODERATE' | 'NOT_RECOMMENDED';
  area_ha: number;
  annual_carbon_sequestration_t_ha_yr: number;
  fifteen_yr_tradable_credits_est: number;
  estimated_npv_rub: number;
  fire_risk_penalty: number;
  component_scores: Record<string, number>;
  estimated_capex_rub: number;
  estimated_15yr_revenue_rub: number;
  simple_payback_years?: number | null;
  target_species: string;
  calculation_hash?: string;
}

export interface GreenPassportResponse {
  passport_id: string;
  site_id: string;
  site_name: string;
  wgs84_area_ha: number;
  verified_carbon_stock_removal_t_co2e: number;
  tradable_units_q: number;
  verified_units_t_co2e: number;
  buffer_pool_reserve_units_b: number;
  buffer_units: number;
  monitoring_period: string;
  standard: string;
  esg_co_benefits: Record<string, any>;
  esg_attributes: Record<string, any>;
  issuance_timestamp: string;
  issuance_date: string;
  valid_until: string;
  calculation_hash: string;
  digital_signature: string;
  qr_verification_url: string;
  public_verification_url?: string;
  qr_code_svg?: string;
  qr_code_svg_base64?: string;
}

export interface PassportVerificationRequest {
  passport_id?: string;
  calculation_hash?: string;
  digital_signature?: string;
  site_id?: string;
}

export interface PassportVerificationResponse {
  is_authentic: boolean;
  is_valid: boolean;
  verification_status: 'VERIFIED_VALID' | 'HASH_MISMATCH' | 'INVALID_SIGNATURE' | 'NOT_FOUND';
  passport_id?: string;
  site_id?: string;
  calculation_hash?: string;
  digital_signature?: string;
  tradable_units_q?: number;
  verified_at: string;
  signer_node: string;
  details?: Record<string, any>;
}

// B2B API Methods
export async function getROI(params: ROIRequest): Promise<ROIResponse> {
  const res = await fetch(`${API_BASE}/roi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to calculate ROI');
  }
  return res.json();
}

export async function evaluateInsurance(params: InsuranceEvaluationRequest): Promise<InsuranceEvaluationResponse> {
  const res = await fetch(`${API_BASE}/insurance/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Insurance evaluation failed');
  }
  return res.json();
}

export async function claimInsurance(params: InsuranceClaimRequest): Promise<InsuranceClaimResponse> {
  const res = await fetch(`${API_BASE}/insurance/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Insurance claim execution failed');
  }
  return res.json();
}

export async function getBufferPoolStatus(siteId?: string): Promise<BufferPoolStatusResponse> {
  const url = siteId
    ? `${API_BASE}/insurance/buffer-pool?site_id=${encodeURIComponent(siteId)}`
    : `${API_BASE}/insurance/buffer-pool`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch buffer pool status: ${res.statusText}`);
  return res.json();
}

export async function getBaselineMatch(params: BaselineMatchingRequest): Promise<BaselineMatchingResponse> {
  const res = await fetch(`${API_BASE}/baseline/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Baseline matching failed');
  }
  return res.json();
}

export async function classifySpecies(params: SpeciesClassificationRequest): Promise<SpeciesClassificationResponse> {
  const res = await fetch(`${API_BASE}/species/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Species classification failed');
  }
  return res.json();
}

export async function getFIRMSAlerts(siteId?: string): Promise<FIRMSAlertsResponse> {
  const url = siteId
    ? `${API_BASE}/radar/firms-alerts?site_id=${encodeURIComponent(siteId)}`
    : `${API_BASE}/radar/firms-alerts`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch FIRMS alerts: ${res.statusText}`);
  return res.json();
}

export async function getSARMonitoring(params: SARMonitoringRequest): Promise<SARMonitoringResponse> {
  const res = await fetch(`${API_BASE}/radar/sar-monitoring`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'SAR monitoring failed');
  }
  return res.json();
}

export async function getClimateRisks(params: ClimateRiskRequest): Promise<ClimateRiskResponse> {
  const res = await fetch(`${API_BASE}/climate-risks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Climate risk modeling failed');
  }
  return res.json();
}

export async function evaluateLandScout(params: LandScoutRequest): Promise<LandScoutResponse> {
  const res = await fetch(`${API_BASE}/land-scout/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Land scout evaluation failed');
  }
  return res.json();
}

export async function getGreenPassport(siteId: string): Promise<GreenPassportResponse> {
  const res = await fetch(`${API_BASE}/passport/${encodeURIComponent(siteId)}`);
  if (!res.ok) throw new Error(`Failed to fetch Green Passport: ${res.statusText}`);
  return res.json();
}

export async function verifyPassport(params: PassportVerificationRequest): Promise<PassportVerificationResponse> {
  const res = await fetch(`${API_BASE}/passport/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Passport verification failed');
  }
  return res.json();
}

export async function exportGOST(siteId: string, format: 'xml' | 'json' = 'xml'): Promise<Blob> {
  const res = await fetch(`${API_BASE}/registry/export-gost?site_id=${encodeURIComponent(siteId)}&format=${format}`);
  if (!res.ok) throw new Error(`Failed to export GOST package: ${res.statusText}`);
  return res.blob();
}

export async function downloadGOST(siteId: string, format: 'xml' | 'json' = 'xml'): Promise<void> {
  const blob = await exportGOST(siteId, format);
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `GOST_R_ISO_14064_2_${siteId}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

export interface UltraPrecisionRequest {
  site_id: string;
  area_ha?: number;
  baseline_agb_t_ha?: number;
  uav_coverage_pct?: number;
  uav_point_density?: number;
  dominant_species?: string;
  soil_type?: string;
}

export interface UltraPrecisionResponse {
  site_id: string;
  timestamp: string;
  framework: string;
  subpixel_sma: {
    conifer: number;
    deciduous: number;
    understory_soil: number;
    shadow_gap: number;
    rmse: number;
  };
  bayesian_calibration: {
    prior_satellite: {
      agb_mean_t_ha: number;
      agb_std_t_ha: number;
      estimated_accuracy_pct: number;
    };
    uav_lidar_transect: {
      coverage_pct: number;
      point_density_pts_m2: number;
      uav_observed_mean_t_ha: number;
      uav_sensor_std_t_ha: number;
    };
    posterior_calibrated: {
      agb_mean_t_ha: number;
      agb_std_t_ha: number;
      variance_reduction_pct: number;
      calibrated_accuracy_pct: number;
      accuracy_boost_pct: number;
    };
  };
  phenology_harmonics: {
    base_level_c0: number;
    annual_amplitude: number;
    peak_vegetation_doy: number;
    greenup_doy: number;
    senescence_doy: number;
    season_length_days: number;
    harmonic_coeffs: {
      a1: number;
      b1: number;
      a2: number;
      b2: number;
    };
  };
  five_pools_carbon: {
    area_ha: number;
    dominant_species: string;
    carbon_fraction_cf: number;
    root_to_shoot_ratio: number;
    pools_per_ha: {
      agb_carbon_t_c_ha: number;
      bgb_roots_carbon_t_c_ha: number;
      deadwood_cwd_carbon_t_c_ha: number;
      litter_carbon_t_c_ha: number;
      soil_organic_carbon_soc_t_c_ha: number;
      total_forest_carbon_t_c_ha: number;
      total_forest_co2e_t_co2e_ha: number;
    };
    polygon_totals: {
      total_carbon_stock_t_c: number;
      total_carbon_stock_t_co2e: number;
      share_agb_pct: number;
      share_bgb_pct: number;
      share_deadwood_pct: number;
      share_litter_pct: number;
      share_soil_soc_pct: number;
    };
    tz_compliance?: {
      is_soil_excluded: boolean;
      soil_status_label: string;
      pure_agb_carbon_t_c_ha: number;
      carbon_stock_tz_basis_t_c: number;
      carbon_stock_tz_basis_co2e: number;
      accuracy_with_uav_pct: number;
      accuracy_pure_satellite_pct: number;
    };
  };
  cryptographic_seal: string;
}

export async function getUltraPrecisionPipeline(
  params: UltraPrecisionRequest
): Promise<UltraPrecisionResponse> {
  const res = await fetch(`${API_BASE}/accuracy/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to run Ultra-Precision pipeline');
  }
  return res.json();
}

export interface AIAskRequest {
  question: string;
  site_id: string;
  site_b_id?: string;
  persona: string;
  area_ha?: number;
  is_compare?: boolean;
  inn?: string;
}

export interface AIAskResponse {
  answer: string;
  persona: string;
  site_id: string;
  site_name: string;
  model_used: string;
  status: string;
  timestamp: string;
}

export async function askGeminiAI(params: AIAskRequest): Promise<AIAskResponse> {
  const res = await fetch(`${API_BASE}/ai/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Не удалось получить ответ от нейросети');
  }
  return res.json();
}

export interface TaxShieldCalculation {
  inn: string;
  ogrn: string;
  company_name: string;
  short_name: string;
  industry: string;
  region: string;
  nvos_category: string;
  annual_emissions_t_co2: number;
  statutory_fee_per_t_rub: number;
  discount_quota_price_rub: number;
  statutory_tax_rub: number;
  forest_quota_cost_rub: number;
  net_savings_rub: number;
  savings_pct: number;
  platform_commission_rub: number;
  platform_commission_pct: number;
  allocated_site_id: string;
  allocated_site_name: string;
  regulatory_framework: string;
  status: string;
  calculation_hash: string;
  timestamp: string;
}

export interface TaxShieldProtectResponse {
  success: boolean;
  status: string;
  inn: string;
  company_name: string;
  certificate_id: string;
  reserved_units_co2: number;
  total_deal_value_rub: number;
  net_savings_rub: number;
  allocated_site_id: string;
  registry_record_id: string;
  calculation_hash: string;
  timestamp: string;
  message: string;
}

export async function calculateTaxShield(inn: string, siteId: string = 'RU_TVER_01'): Promise<TaxShieldCalculation> {
  const res = await fetch(`${API_BASE}/ai/tax-shield/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inn, site_id: siteId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Не удалось рассчитать налоговый щит');
  }
  return res.json();
}

export async function protectTaxShieldBudget(inn: string, siteId: string = 'RU_TVER_01'): Promise<TaxShieldProtectResponse> {
  const res = await fetch(`${API_BASE}/ai/tax-shield/protect-budget`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inn, site_id: siteId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Не удалось забронировать квоты под ИНН');
  }
  return res.json();
}

export interface StressTestRequest {
  site_id: string;
  scenario_type: string;
  severity: number;
  buffer_pool_pct: number;
  carbon_price_rub?: number;
  custom_area_ha?: number;
  custom_site_name?: string;
  custom_scenario?: any;
}

export interface GeneratedScenario {
  id: string;
  name: string;
  description: string;
  risk_category: string;
  climate_index: string;
  base_loss_factor: number;
  severity_loss_slope: number;
  mitigation_actions: string[];
}

export async function generateCustomScenario(prompt: string, siteId: string = 'RU_TVER_01'): Promise<GeneratedScenario> {
  const res = await fetch(`${API_BASE}/stress-test/generate-scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, site_id: siteId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Не удалось сгенерировать сценарий через AI');
  }
  return res.json();
}

export interface StressTestResponse {
  site_id: string;
  site_name: string;
  region: string;
  area_ha: number;
  severity: number;
  severity_pct: number;
  initial_metrics: {
    agb_t_ha: number;
    cumulative_gross_co2: number;
    buffer_reserve_co2: number;
    tradable_credits_co2: number;
    base_npv_rub: number;
    base_payback_years: number;
  };
  shock_impact: {
    post_shock_agb_t_ha: number;
    agb_loss_pct: number;
    carbon_loss_t_co2: number;
    damaged_area_ha: number;
    buffer_absorbed_co2: number;
    uncovered_deficit_co2: number;
    buffer_remaining_pct: number;
    buffer_status: 'SURVIVED' | 'DEFICIT' | string;
    buffer_status_label: string;
  };
  financial_impact: {
    stressed_npv_rub: number;
    delta_npv_rub: number;
    stressed_payback_years: number;
    revenue_loss_rub: number;
    resilience_score: number;
    resilience_grade: string;
  };
  tcfd_disclosure: {
    risk_category: string;
    climate_index: string;
    scenario_name: string;
    scenario_description: string;
    mitigation_actions: string[];
    auditor_conclusion: string;
  };
  timestamp: string;
}

export async function runStressTest(params: StressTestRequest): Promise<StressTestResponse> {
  const res = await fetch(`${API_BASE}/stress-test/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Не удалось выполнить стресс-тестирование');
  }
  return res.json();
}

function jsonStringify(obj: any): string {
  return JSON.stringify(obj);
}


