#!/usr/bin/env python3
"""Focused P1 conformance for the lean 5fedu module-mapping pack."""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "profiles" / "5fedu" / "module-mapping"
SKILL = ROOT / "skills" / "5fedu-module-parity" / "SKILL.md"
INDEX = ROOT / "skills" / "5fedu-module-parity" / "references" / "index.md"


class ModuleMappingConformance(unittest.TestCase):
    def setUp(self) -> None:
        self.modules_path = PACK / "modules.yaml"
        self.contracts_path = PACK / "ui-contracts.md"
        self.modules = json.loads(self.modules_path.read_text(encoding="utf-8"))

    def test_source_lock_is_fail_closed_and_has_no_placeholder_revision(self) -> None:
        source = self.modules["source_repositories"]["shared-template"]
        self.assertEqual(source["verification_state"], "BLOCKED")
        self.assertTrue(source["repository_url"].startswith("https://"))
        self.assertIsNone(source["commit_sha"])
        self.assertIsNone(source["integrity_sha256"])
        serialized = json.dumps(source).lower()
        self.assertNotIn("0" * 40, serialized)
        self.assertNotIn("default" + " branch", serialized)

    def test_module_roles_preserve_shell_and_variable_boundaries(self) -> None:
        roles = self.modules["module_roles"]
        self.assertTrue({"nhan-vien", "phong-ban", "chuc-vu", "phan-quyen", "thong-tin-cong-ty"} <= set(roles))
        self.assertEqual(self.modules["contract_split"]["shell_owner"], "ui-contracts.md")
        self.assertIn("active project schema/spec", self.modules["contract_split"]["variable_slot_owner"])
        self.assertIn("parent-child", roles["phong-ban"]["role"])
        self.assertIn("permission-matrix", roles["phan-quyen"]["surfaces"])

    def test_routed_pack_fits_budget_and_is_portable(self) -> None:
        files = [self.modules_path, self.contracts_path, SKILL, INDEX]
        total_tokens = sum((len(path.read_text(encoding="utf-8")) + 3) // 4 for path in files)
        self.assertLessEqual(total_tokens, self.modules["routed_context"]["max_tokens"])
        for path in files:
            body = path.read_text(encoding="utf-8")
            self.assertNotRegex(body, r"(?i)[A-Z]:\\")
            self.assertNotIn(chr(47) + "home" + chr(47), body)
            self.assertNotIn(chr(92) + "Users" + chr(92), body)
        skill_body = SKILL.read_text(encoding="utf-8")
        budget = re.search(r'"max_route_tokens":(\d+)', skill_body)
        self.assertIsNotNone(budget)
        self.assertLessEqual(int(budget.group(1)), 8000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
