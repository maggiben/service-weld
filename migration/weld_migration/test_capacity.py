"""Unit tests for cylinder capacity parsing (PROPIOS headers / sales METROS/KG)."""

from __future__ import annotations

import unittest

from weld_migration.normalize import (
    ParsedCapacity,
    extract_cylinder_capacity,
    is_weight_cell,
    parse_capacity,
    sanitize_capacity_kg,
    sanitize_capacity_m3,
)


class TestParseCapacity(unittest.TestCase):
    def test_explicit_volume_forms(self) -> None:
        cases = {
            "6 mt": 6.0,
            "6 mts": 6.0,
            "6 mts.": 6.0,
            "6 MTS": 6.0,
            "6 m": 6.0,
            "6 m t": 6.0,
            "10 METROS": 10.0,
            "10MTS": 10.0,
            "10 mts": 10.0,
            "7M": 7.0,
            "7 m": 7.0,
            "2 mts": 2.0,
            "4 m": 4.0,
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                parsed = parse_capacity(raw)
                self.assertIsNotNone(parsed)
                assert parsed is not None
                self.assertEqual(parsed.value, expected)
                self.assertEqual(parsed.unit, "M3")

    def test_parses_weight(self) -> None:
        cases = {
            "10 KG": 10.0,
            "20 kgr": 20.0,
            "25 k": 25.0,
            "25 kgs": 25.0,
            "6 KGRS": None,  # 6 kg not in known set
            "7 kilos": None,
            "4kg": None,
            "20k": 20.0,
            "45 kg": 45.0,
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertTrue(is_weight_cell(raw))
                parsed = parse_capacity(raw)
                if expected is None:
                    self.assertIsNone(parsed)
                else:
                    self.assertEqual(parsed, ParsedCapacity(expected, "KG"))

    def test_bare_known_only(self) -> None:
        self.assertEqual(parse_capacity(6), ParsedCapacity(6.0, "M3"))
        self.assertEqual(parse_capacity("10"), ParsedCapacity(10.0, "M3"))
        self.assertIsNone(parse_capacity("14"))  # serial-like, not a known size
        self.assertIsNone(parse_capacity("591"))
        self.assertIsNone(parse_capacity("N/P"))


class TestExtractCylinderCapacity(unittest.TestCase):
    def test_prefers_explicit_over_serial_echo(self) -> None:
        # Sheet "14": atal | 14 | 6 mt
        self.assertEqual(
            extract_cylinder_capacity(["atal", 14.0, "6 mt"], serial="14"),
            ParsedCapacity(6.0, "M3"),
        )

    def test_six_m_without_t(self) -> None:
        self.assertEqual(
            extract_cylinder_capacity(["atal", "873 ceres", "6 m"], serial="873"),
            ParsedCapacity(6.0, "M3"),
        )

    def test_spaced_m_t(self) -> None:
        self.assertEqual(
            extract_cylinder_capacity(["atal", 36.0, "6 m t"], serial="36"),
            ParsedCapacity(6.0, "M3"),
        )

    def test_bare_capacity_not_serial(self) -> None:
        # Sheet "6": atal | 6 | 7  → capacity is 7
        self.assertEqual(
            extract_cylinder_capacity(["atal", 6.0, 7.0], serial="6"),
            ParsedCapacity(7.0, "M3"),
        )

    def test_weight_only_as_kg(self) -> None:
        # Sheet "10": CO2 | 10 | 25 k — weight capacity
        self.assertEqual(
            extract_cylinder_capacity(["CO2", 10.0, "25 k"], serial="10"),
            ParsedCapacity(25.0, "KG"),
        )

    def test_kg_header(self) -> None:
        self.assertEqual(
            extract_cylinder_capacity(["ATAL", 0.41, "10 KG"], serial="41"),
            ParsedCapacity(10.0, "KG"),
        )

    def test_prefers_volume_over_weight(self) -> None:
        self.assertEqual(
            extract_cylinder_capacity(["CO2", "6 mt", "25 k"], serial="99"),
            ParsedCapacity(6.0, "M3"),
        )

    def test_ceres_explicit(self) -> None:
        self.assertEqual(
            extract_cylinder_capacity(["o2", "55 ceres", "10 mts"], serial="55"),
            ParsedCapacity(10.0, "M3"),
        )

    def test_sanitize(self) -> None:
        self.assertEqual(sanitize_capacity_m3(6), 6.0)
        self.assertIsNone(sanitize_capacity_m3(14))
        self.assertIsNone(sanitize_capacity_m3(825))
        self.assertEqual(sanitize_capacity_kg(25), 25.0)
        self.assertIsNone(sanitize_capacity_kg(12))


if __name__ == "__main__":
    unittest.main()
