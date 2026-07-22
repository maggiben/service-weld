"""Unit tests for cylinder capacity parsing (PROPIOS headers / sales METROS)."""

from __future__ import annotations

import unittest

from weld_migration.normalize import (
    extract_cylinder_capacity,
    is_weight_cell,
    parse_capacity,
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
                self.assertEqual(parse_capacity(raw), expected)

    def test_rejects_weight(self) -> None:
        for raw in ("10 KG", "20 kgr", "25 k", "25 kgs", "6 KGRS", "7 kilos", "4kg", "20k"):
            with self.subTest(raw=raw):
                self.assertTrue(is_weight_cell(raw))
                self.assertIsNone(parse_capacity(raw))

    def test_bare_known_only(self) -> None:
        self.assertEqual(parse_capacity(6), 6.0)
        self.assertEqual(parse_capacity("10"), 10.0)
        self.assertIsNone(parse_capacity("14"))  # serial-like, not a known size
        self.assertIsNone(parse_capacity("591"))
        self.assertIsNone(parse_capacity("N/P"))


class TestExtractCylinderCapacity(unittest.TestCase):
    def test_prefers_explicit_over_serial_echo(self) -> None:
        # Sheet "14": atal | 14 | 6 mt
        self.assertEqual(
            extract_cylinder_capacity(["atal", 14.0, "6 mt"], serial="14"),
            6.0,
        )

    def test_six_m_without_t(self) -> None:
        self.assertEqual(
            extract_cylinder_capacity(["atal", "873 ceres", "6 m"], serial="873"),
            6.0,
        )

    def test_spaced_m_t(self) -> None:
        self.assertEqual(
            extract_cylinder_capacity(["atal", 36.0, "6 m t"], serial="36"),
            6.0,
        )

    def test_bare_capacity_not_serial(self) -> None:
        # Sheet "6": atal | 6 | 7  → capacity is 7
        self.assertEqual(
            extract_cylinder_capacity(["atal", 6.0, 7.0], serial="6"),
            7.0,
        )

    def test_weight_only_no_capacity(self) -> None:
        # Sheet "10": CO2 | 10 | 25 k — no volume
        self.assertIsNone(
            extract_cylinder_capacity(["CO2", 10.0, "25 k"], serial="10")
        )

    def test_rejects_kg_header(self) -> None:
        self.assertIsNone(
            extract_cylinder_capacity(["ATAL", 0.41, "10 KG"], serial="41")
        )

    def test_ceres_explicit(self) -> None:
        self.assertEqual(
            extract_cylinder_capacity(["o2", "55 ceres", "10 mts"], serial="55"),
            10.0,
        )

    def test_sanitize(self) -> None:
        self.assertEqual(sanitize_capacity_m3(6), 6.0)
        self.assertIsNone(sanitize_capacity_m3(14))
        self.assertIsNone(sanitize_capacity_m3(825))


if __name__ == "__main__":
    unittest.main()
