"""Unit tests for locality normalization (BR-15 / Excel DOMICILIO bleed)."""

from __future__ import annotations

import unittest

from weld_migration.normalize import (
    fold_locality_key,
    normalize_locality,
)


class TestNormalizeLocality(unittest.TestCase):
    def test_canonical_and_accents(self) -> None:
        self.assertEqual(normalize_locality("Chacabuco"), "Chacabuco")
        self.assertEqual(normalize_locality("COLON"), "Colón")
        self.assertEqual(normalize_locality("JUNIN"), "Junín")
        self.assertEqual(normalize_locality("Colón"), "Colón")
        self.assertEqual(normalize_locality("junín"), "Junín")

    def test_cpa_prefix(self) -> None:
        self.assertEqual(normalize_locality("6740 CHACABUCO"), "Chacabuco")
        self.assertEqual(normalize_locality("6000 Junin"), "Junín")
        self.assertEqual(normalize_locality("6740 OCHACABUCO"), "Chacabuco")
        self.assertIsNone(normalize_locality("6740"))

    def test_rejects_phones_labels_addresses(self) -> None:
        self.assertIsNone(normalize_locality("telefono:"))
        self.assertIsNone(normalize_locality("2478-442540"))
        self.assertIsNone(normalize_locality("11 E 63/64"))
        self.assertIsNone(normalize_locality("20 ENTRE 45/46"))
        self.assertIsNone(normalize_locality("AV ALSINA 721"))
        self.assertIsNone(normalize_locality("Casa Nª 3"))
        self.assertIsNone(normalize_locality("Castiglioni 12 barrio trocha"))
        self.assertIsNone(normalize_locality("FRIAS 161"))
        self.assertIsNone(normalize_locality("ESTACIONFOOD"))

    def test_fold_collides_accentless(self) -> None:
        self.assertEqual(fold_locality_key("Colón"), fold_locality_key("COLON"))
        self.assertEqual(fold_locality_key("Junín"), fold_locality_key("JUNIN"))

    def test_known_names_passthrough(self) -> None:
        self.assertEqual(
            normalize_locality("PERGAMINO", known_names=["Pergamino"]),
            "Pergamino",
        )
        self.assertIsNone(normalize_locality("PERGAMINO"))


if __name__ == "__main__":
    unittest.main()
