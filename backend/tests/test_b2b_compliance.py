"""backend/tests/test_b2b_compliance.py

Comprehensive Unit & Integration Test Suite for Kosmo·MRV Milestone M-B2B-3:
1. Public Green Passport Engine (Module 8):
   - Certificate generation for preset project sites (RU_TVER_01, RU_VOLOGDA_02, etc.).
   - Certificate generation for arbitrary custom GeoJSON polygons.
   - ESG co-benefits evaluation (wildfire resistance, biodiversity index, water protection).
   - Dynamic vector SVG QR code generation and verification URL structure.
   - Cryptographic SHA-256 tamper-evident calculation seal determinism.
   - HMAC-SHA256 digital signature token generation and verification.
   - Tamper detection: hash mismatch, corrupt signature, unknown certificates.
2. RF Carbon Units Registry Export Engine (Module 9):
   - Machine-readable export conforming to GOST R ISO 14064-2:2019 (ГОСТ Р ИСО 14064-2:2019).
   - Valid XML generation with XML declaration, namespace, and standard section hierarchy:
     <GostISO14064Project>, <ProjectHeader>, <GeographicBoundary>,
     <BaselineAndAdditionality>, <GHGQuantification>, <VerificationAttestation>.
   - Standardized JSON generation adhering to schema gost-r-iso-14064-2:2019-v1.
   - Mathematical quantification consistency: Gross removals R, UNC (10%), Radj, Buffer B (15%), Net units Q.
3. REST API Route Integration:
   - get_site_passport (GET /api/passport/{site_id})
   - generate_custom_passport (POST /api/passport/generate)
   - verify_passport_public (GET /api/passport/verify)
   - verify_passport_post (POST /api/passport/verify)
   - export_gost_package_get (GET /api/registry/export-gost)
   - export_gost_package_post (POST /api/registry/export-gost)
"""

from __future__ import annotations

import json
import unittest
import xml.etree.ElementTree as ET

from fastapi import HTTPException, Response

from backend.app.api.routes_gost import (
    export_gost_package_get,
    export_gost_package_post,
)
from backend.app.api.routes_passport import (
    generate_custom_passport,
    get_site_passport,
    verify_passport_post,
    verify_passport_public,
)
from backend.app.core.gost_export import (
    PRESET_BENCHMARKS,
    generate_gost_export_package,
    generate_gost_json,
    generate_gost_xml,
)
from backend.app.core.passport import (
    GLOBAL_PASSPORT_REGISTRY,
    compute_digital_signature,
    compute_passport_hash,
    generate_green_passport,
    generate_passport_serial,
    verify_passport,
)
from backend.app.core.qr_generator import (
    generate_qr_matrix,
    generate_qr_svg,
    generate_qr_svg_base64,
)
from backend.app.schemas.passport import (
    GreenPassportResponse,
    PassportGenerateRequest,
    PassportVerificationRequest,
    PassportVerificationResponse,
)


class TestGreenPassportCore(unittest.TestCase):
    """Unit tests for Public Green Passport generator and cryptographic verification."""

    def test_generate_green_passport_preset_tver(self) -> None:
        """Verifies Green Passport generation for benchmark site RU_TVER_01."""
        passport = generate_green_passport(site_id="RU_TVER_01")
        self.assertIsInstance(passport, GreenPassportResponse)
        self.assertEqual(passport.site_id, "RU_TVER_01")
        self.assertEqual(passport.tradable_units_q, 395)
        self.assertEqual(passport.verified_units_t_co2e, 395)
        self.assertEqual(passport.buffer_pool_reserve_units_b, 70)
        self.assertEqual(passport.buffer_units, 70)
        self.assertEqual(passport.wgs84_area_ha, 100.0)
        self.assertEqual(passport.verified_carbon_stock_removal_t_co2e, 517.0)
        self.assertTrue(passport.passport_id.startswith("GP-RU-RU_TVER_01-"))
        self.assertEqual(len(passport.calculation_hash), 64)
        self.assertEqual(len(passport.digital_signature), 64)
        self.assertIn("https://kosmo-mrv.ru/verify/passport", passport.qr_verification_url)
        self.assertIn(f"id={passport.passport_id}", passport.qr_verification_url)
        self.assertIn(f"hash={passport.calculation_hash}", passport.qr_verification_url)

    def test_generate_green_passport_all_preset_sites(self) -> None:
        """Verifies passport generation for all registered preset sites."""
        preset_sites = ["RU_VOLOGDA_02", "RU_MORDOVIA_03", "RU_MORDOVIA_04", "CHECK_TRANSFER_01"]
        for sid in preset_sites:
            p = generate_green_passport(site_id=sid)
            self.assertEqual(p.site_id, sid)
            self.assertGreater(p.tradable_units_q, 0)
            self.assertGreater(p.buffer_pool_reserve_units_b, 0)
            self.assertGreater(p.wgs84_area_ha, 0.0)
            self.assertEqual(len(p.calculation_hash), 64)
            self.assertEqual(len(p.digital_signature), 64)
            self.assertIn("wildfire_resistance", p.esg_co_benefits)
            self.assertIn("biodiversity_index", p.esg_co_benefits)
            self.assertIn("water_protection", p.esg_co_benefits)

    def test_generate_green_passport_custom_polygon(self) -> None:
        """Verifies passport issuance for custom GeoJSON polygon."""
        custom_poly = {
            "type": "Polygon",
            "coordinates": [
                [
                    [32.92, 56.60],
                    [32.96, 56.60],
                    [32.96, 56.62],
                    [32.92, 56.62],
                    [32.92, 56.60],
                ]
            ],
        }
        passport = generate_green_passport(
            site_id="CUSTOM_FOREST_99",
            polygon=custom_poly,
            site_name="Пользовательский лесной массив",
        )
        self.assertEqual(passport.site_id, "CUSTOM_FOREST_99")
        self.assertEqual(passport.site_name, "Пользовательский лесной массив")
        self.assertGreater(passport.wgs84_area_ha, 0.0)
        self.assertGreater(passport.tradable_units_q, 0)
        self.assertGreater(passport.buffer_pool_reserve_units_b, 0)
        self.assertEqual(len(passport.calculation_hash), 64)

    def test_generate_green_passport_custom_calculation_result(self) -> None:
        """Verifies passport generation when precalculated calculation_result is supplied."""
        calc_result = {
            "site_name": "Тестовый карбоновый полигон",
            "area_ha": 250.0,
            "r_gross_t_co2e": 1292.5,
            "r_adjusted": 1163.25,
            "buffer_reserve": 174.49,
            "q_tradable_units": 988,
        }
        passport = generate_green_passport(
            site_id="CALC_SITE_01",
            calculation_result=calc_result,
        )
        self.assertEqual(passport.site_id, "CALC_SITE_01")
        self.assertEqual(passport.site_name, "Тестовый карбоновый полигон")
        self.assertEqual(passport.wgs84_area_ha, 250.0)
        self.assertEqual(passport.tradable_units_q, 988)
        self.assertEqual(passport.buffer_pool_reserve_units_b, 174)

    def test_qr_code_svg_generation(self) -> None:
        """Verifies pure vector SVG QR code generation without external binaries."""
        test_url = "https://kosmo-mrv.ru/verify/passport?id=GP-TEST&hash=abc123def456"
        svg = generate_qr_svg(test_url, foreground="#059669")
        self.assertTrue(svg.startswith("<svg"))
        self.assertTrue(svg.endswith("</svg>"))
        self.assertIn('xmlns="http://www.w3.org/2000/svg"', svg)
        self.assertIn('fill="#059669"', svg)
        self.assertIn("viewBox=", svg)

        b64 = generate_qr_svg_base64(test_url)
        self.assertTrue(b64.startswith("data:image/svg+xml;base64,"))

    def test_cryptographic_seal_determinism(self) -> None:
        """Ensures calculation hash is strictly deterministic over identical canonical inputs."""
        hash1 = compute_passport_hash(
            passport_id="GP-RU-RU_TVER_01-20260919-A1B2C3",
            site_id="RU_TVER_01",
            site_name="Тверская область",
            wgs84_area_ha=100.0,
            verified_carbon_stock_removal_t_co2e=517.0,
            tradable_units_q=395,
            buffer_pool_reserve_units_b=70,
            monitoring_period="2019–2024",
            standard="GOST R ISO 14064-2:2019 / IPCC 2006 Tier 2",
        )
        hash2 = compute_passport_hash(
            passport_id="GP-RU-RU_TVER_01-20260919-A1B2C3",
            site_id="RU_TVER_01",
            site_name="Тверская область",
            wgs84_area_ha=100.0,
            verified_carbon_stock_removal_t_co2e=517.0,
            tradable_units_q=395,
            buffer_pool_reserve_units_b=70,
            monitoring_period="2019–2024",
            standard="GOST R ISO 14064-2:2019 / IPCC 2006 Tier 2",
        )
        self.assertEqual(hash1, hash2)

        # Altering any field mutates hash
        hash_altered = compute_passport_hash(
            passport_id="GP-RU-RU_TVER_01-20260919-A1B2C3",
            site_id="RU_TVER_01",
            site_name="Тверская область",
            wgs84_area_ha=100.1,  # Altered
            verified_carbon_stock_removal_t_co2e=517.0,
            tradable_units_q=395,
            buffer_pool_reserve_units_b=70,
            monitoring_period="2019–2024",
            standard="GOST R ISO 14064-2:2019 / IPCC 2006 Tier 2",
        )
        self.assertNotEqual(hash1, hash_altered)

    def test_verify_passport_valid(self) -> None:
        """Verifies authentic passport validation succeeds."""
        passport = generate_green_passport(site_id="RU_TVER_01")
        verification = verify_passport(
            passport_id=passport.passport_id,
            calculation_hash=passport.calculation_hash,
            digital_signature=passport.digital_signature,
        )
        self.assertTrue(verification.is_authentic)
        self.assertTrue(verification.is_valid)
        self.assertEqual(verification.verification_status, "VERIFIED_VALID")
        self.assertEqual(verification.tradable_units_q, 395)

    def test_verify_passport_hash_tampering_detected(self) -> None:
        """Verifies tampering with calculation hash is detected and rejected."""
        passport = generate_green_passport(site_id="RU_TVER_01")
        tampered_hash = "f" * 64
        verification = verify_passport(
            passport_id=passport.passport_id,
            calculation_hash=tampered_hash,
            digital_signature=passport.digital_signature,
        )
        self.assertFalse(verification.is_authentic)
        self.assertFalse(verification.is_valid)
        self.assertEqual(verification.verification_status, "HASH_MISMATCH")

    def test_verify_passport_invalid_signature_detected(self) -> None:
        """Verifies forgery of HMAC digital signature token is detected."""
        passport = generate_green_passport(site_id="RU_TVER_01")
        corrupted_signature = "0" * 64
        verification = verify_passport(
            passport_id=passport.passport_id,
            calculation_hash=passport.calculation_hash,
            digital_signature=corrupted_signature,
        )
        self.assertFalse(verification.is_authentic)
        self.assertFalse(verification.is_valid)
        self.assertEqual(verification.verification_status, "INVALID_SIGNATURE")

    def test_verify_passport_not_found(self) -> None:
        """Verifies lookup of completely unknown passport returns NOT_FOUND."""
        verification = verify_passport(
            passport_id="GP-RU-UNKNOWN-20260919-000000",
            calculation_hash="e" * 64,
            digital_signature="d" * 64,
        )
        self.assertFalse(verification.is_authentic)
        self.assertEqual(verification.verification_status, "NOT_FOUND")


class TestGOSTExportCore(unittest.TestCase):
    """Unit tests for GOST R ISO 14064-2 XML and JSON export generator."""

    def test_gost_xml_valid_syntax_and_root(self) -> None:
        """Ensures generated GOST XML is valid, well-formed XML with declaration and namespace."""
        xml_text = generate_gost_xml(site_id="RU_TVER_01")
        self.assertTrue(xml_text.startswith("<?xml version=\"1.0\""))
        root = ET.fromstring(xml_text)
        self.assertEqual(root.tag, "{urn:gost:iso:14064-2:2019:climate-project}GostISO14064Project")
        self.assertEqual(root.attrib.get("schemaVersion"), "1.0")

    def test_gost_xml_all_required_sections(self) -> None:
        """Verifies existence and correctness of all 5 mandatory GOST sections in XML."""
        xml_text = generate_gost_xml(site_id="RU_TVER_01")
        root = ET.fromstring(xml_text)
        ns = {"gost": "urn:gost:iso:14064-2:2019:climate-project"}

        header = root.find("gost:ProjectHeader", ns)
        self.assertIsNotNone(header)
        self.assertIn("Тверская область", header.find("gost:ProjectTitle", ns).text)
        self.assertEqual(header.find("gost:RegistrationAuthority", ns).text, "АО «Контур» (Оператор Реестра углеродных единиц РФ)")

        geo = root.find("gost:GeographicBoundary", ns)
        self.assertIsNotNone(geo)
        self.assertEqual(geo.find("gost:SiteId", ns).text, "RU_TVER_01")
        self.assertEqual(geo.find("gost:Region", ns).text, "Тверская область")
        self.assertEqual(float(geo.find("gost:PolygonAreaHa", ns).text), 100.0)

        base = root.find("gost:BaselineAndAdditionality", ns)
        self.assertIsNotNone(base)
        self.assertIn("HIST-AGB-2015-2019-v1", base.find("gost:BaselineMethodology", ns).text)

        ghg = root.find("gost:GHGQuantification", ns)
        self.assertIsNotNone(ghg)
        self.assertEqual(float(ghg.find("gost:GrossRemovals_R_tCO2e", ns).text), 517.0)
        self.assertEqual(float(ghg.find("gost:UncertaintyHaircut_UNC_pct", ns).text), 10.0)
        self.assertEqual(float(ghg.find("gost:AdjustedRemovals_Radj_tCO2e", ns).text), 465.3)
        self.assertEqual(float(ghg.find("gost:BufferDeduction_B_tCO2e", ns).text), 69.795)
        self.assertEqual(int(ghg.find("gost:NetVerifiedUnits_Q", ns).text), 395)

        att = root.find("gost:VerificationAttestation", ns)
        self.assertIsNotNone(att)
        self.assertEqual(len(att.find("gost:CalculationHash", ns).text), 64)
        self.assertEqual(len(att.find("gost:DigitalSignature", ns).text), 64)

    def test_gost_json_structure_and_schema(self) -> None:
        """Verifies generated GOST JSON adheres to standardized schema structure."""
        json_data = generate_gost_json(site_id="RU_TVER_01")
        self.assertEqual(json_data["standard_name"], "ГОСТ Р ИСО 14064-2:2019")
        self.assertIn("296-ФЗ", json_data["regulatory_framework"])
        self.assertIn("project_header", json_data)
        self.assertIn("geographic_boundary", json_data)
        self.assertIn("baseline_and_additionality", json_data)
        self.assertIn("ghg_quantification", json_data)
        self.assertIn("verification_attestation", json_data)

        quant = json_data["ghg_quantification"]
        self.assertEqual(quant["gross_removals_r_t_co2e"], 517.0)
        self.assertEqual(quant["uncertainty_haircut_unc_pct"], 10.0)
        self.assertEqual(quant["adjusted_removals_radj_t_co2e"], 465.3)
        self.assertEqual(quant["buffer_deduction_b_t_co2e"], 69.795)
        self.assertEqual(quant["net_verified_units_q"], 395)
        self.assertEqual(quant["buffer_rate_pct"], 15.0)

    def test_gost_export_package_helper(self) -> None:
        """Verifies export packaging for XML and JSON streams with MIME types and filenames."""
        # XML format
        xml_str, xml_mime, xml_name = generate_gost_export_package(site_id="RU_TVER_01", export_format="xml")
        self.assertEqual(xml_name, "GOST_R_ISO_14064_2_RU_TVER_01.xml")
        self.assertIn("application/xml", xml_mime)
        self.assertIn("<GostISO14064Project", xml_str)

        # JSON format
        json_str, json_mime, json_name = generate_gost_export_package(site_id="RU_TVER_01", export_format="json")
        self.assertEqual(json_name, "GOST_R_ISO_14064_2_RU_TVER_01.json")
        self.assertIn("application/json", json_mime)
        parsed_json = json.loads(json_str)
        self.assertEqual(parsed_json["standard_name"], "ГОСТ Р ИСО 14064-2:2019")


class TestComplianceRESTAPIRoutes(unittest.TestCase):
    """Integration tests for Compliance REST API route handler functions."""

    def test_get_passport_preset_site_200(self) -> None:
        """Tests get_site_passport route function for preset site."""
        res = get_site_passport(site_id="RU_TVER_01")
        self.assertIsInstance(res, GreenPassportResponse)
        self.assertEqual(res.site_id, "RU_TVER_01")
        self.assertEqual(res.tradable_units_q, 395)
        self.assertEqual(res.buffer_pool_reserve_units_b, 70)
        self.assertEqual(len(res.calculation_hash), 64)
        self.assertEqual(len(res.digital_signature), 64)
        self.assertIn("<svg", res.qr_code_svg)

    def test_get_passport_not_found_404(self) -> None:
        """Tests get_site_passport raises HTTPException 404 for unknown site."""
        with self.assertRaises(HTTPException) as ctx:
            get_site_passport(site_id="NON_EXISTENT_SITE_ID")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_post_passport_generate_route(self) -> None:
        """Tests generate_custom_passport route function."""
        payload = {
            "site_id": "CUSTOM_SITE_ABC",
            "site_name": "Пользовательский участок для ESG отчета",
            "polygon": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [32.92, 56.60],
                        [32.96, 56.60],
                        [32.96, 56.62],
                        [32.92, 56.62],
                        [32.92, 56.60],
                    ]
                ],
            },
        }
        res = generate_custom_passport(payload)
        self.assertIsInstance(res, GreenPassportResponse)
        self.assertEqual(res.site_id, "CUSTOM_SITE_ABC")
        self.assertEqual(res.site_name, "Пользовательский участок для ESG отчета")
        self.assertGreater(res.tradable_units_q, 0)
        self.assertEqual(len(res.calculation_hash), 64)

    def test_verify_passport_public_route(self) -> None:
        """Tests verify_passport_public route function."""
        passport = get_site_passport(site_id="RU_TVER_01")
        res = verify_passport_public(
            id=passport.passport_id,
            hash=passport.calculation_hash,
            sig=passport.digital_signature,
        )
        self.assertIsInstance(res, PassportVerificationResponse)
        self.assertTrue(res.is_authentic)
        self.assertTrue(res.is_valid)
        self.assertEqual(res.verification_status, "VERIFIED_VALID")
        self.assertEqual(res.tradable_units_q, 395)

    def test_verify_passport_post_route(self) -> None:
        """Tests verify_passport_post route function."""
        passport = get_site_passport(site_id="RU_VOLOGDA_02")
        req = PassportVerificationRequest(
            passport_id=passport.passport_id,
            calculation_hash=passport.calculation_hash,
            digital_signature=passport.digital_signature,
            site_id=passport.site_id,
        )
        res = verify_passport_post(req)
        self.assertIsInstance(res, PassportVerificationResponse)
        self.assertTrue(res.is_authentic)
        self.assertEqual(res.verification_status, "VERIFIED_VALID")
        self.assertEqual(res.tradable_units_q, 850)

    def test_export_gost_package_get_xml(self) -> None:
        """Tests export_gost_package_get returns XML Response with headers."""
        res = export_gost_package_get(site_id="RU_TVER_01", format="xml")
        self.assertIsInstance(res, Response)
        content_str = res.body.decode("utf-8")
        self.assertTrue(content_str.startswith("<?xml version=\"1.0\""))
        self.assertIn("GostISO14064Project", content_str)
        self.assertIn('attachment; filename="GOST_R_ISO_14064_2_RU_TVER_01.xml"', res.headers.get("Content-Disposition", ""))
        self.assertIn("application/xml", res.media_type)

    def test_export_gost_package_get_json(self) -> None:
        """Tests export_gost_package_get returns JSON Response with headers."""
        res = export_gost_package_get(site_id="RU_TVER_01", format="json")
        self.assertIsInstance(res, Response)
        content_str = res.body.decode("utf-8")
        json_data = json.loads(content_str)
        self.assertEqual(json_data["standard_name"], "ГОСТ Р ИСО 14064-2:2019")
        self.assertEqual(json_data["ghg_quantification"]["net_verified_units_q"], 395)
        self.assertIn('attachment; filename="GOST_R_ISO_14064_2_RU_TVER_01.json"', res.headers.get("Content-Disposition", ""))
        self.assertIn("application/json", res.media_type)

    def test_export_gost_package_get_not_found(self) -> None:
        """Tests export_gost_package_get raises 404 for unknown site."""
        with self.assertRaises(HTTPException) as ctx:
            export_gost_package_get(site_id="NON_EXISTENT_SITE", format="xml")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_export_gost_package_post_custom(self) -> None:
        """Tests export_gost_package_post with custom calculation payload."""
        payload = {
            "site_id": "CUSTOM_PROJECT_77",
            "format": "xml",
            "calculation_data": {
                "site_name": "Карельский сосновый массив",
                "region": "Республика Карелия",
                "area_ha": 300.0,
                "r_gross_t_co2e": 1551.0,
                "r_adjusted": 1395.9,
                "buffer_reserve": 209.385,
                "q_tradable_units": 1186,
            },
        }
        res = export_gost_package_post(payload=payload, format="xml")
        self.assertIsInstance(res, Response)
        content_str = res.body.decode("utf-8")
        self.assertIn("Карельский сосновый массив", content_str)
        self.assertIn("<NetVerifiedUnits_Q>1186</NetVerifiedUnits_Q>", content_str)


if __name__ == "__main__":
    unittest.main()
