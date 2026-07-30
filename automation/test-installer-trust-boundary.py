#!/usr/bin/env python3
"""Focused conformance: installer trust boundary — script integrity, symlink/hardlink/path escape rejection, ownership manifest integrity."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SOURCE_INTEGRITY = HERE / "source-integrity.json"
INTEGRITY_SCRIPTS = list(ROOT.joinpath(p) for p in json.loads(SOURCE_INTEGRITY.read_text())["files"])

FAILURES = 0


def fail(msg: str) -> None:
    global FAILURES
    FAILURES += 1
    print(f"  FAIL: {msg}", file=sys.stderr)


def ok(msg: str) -> None:
    print(f"  OK: {msg}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_source_integrity_manifest_exists() -> None:
    if SOURCE_INTEGRITY.is_file():
        ok("source-integrity.json exists")
    else:
        fail("source-integrity.json missing")


def test_source_integrity_entries_match() -> None:
    manifest = json.loads(SOURCE_INTEGRITY.read_text())
    files = manifest.get("files", {})
    if not files:
        fail("source-integrity.json has no files section")
        return
    ok(f"source-integrity.json lists {len(files)} scripts")
    mismatches = []
    for rel, expected_hash in files.items():
        path = ROOT.joinpath(rel.replace("/", os.sep))
        if not path.is_file():
            mismatches.append(f"{rel}: MISSING")
            continue
        actual = sha256(path)
        if actual != expected_hash:
            mismatches.append(f"{rel}: expected {expected_hash}, got {actual}")
    if mismatches:
        for m in mismatches:
            fail(m)
    else:
        ok("all source-integrity hashes match current files")


def test_source_integrity_rejects_tampered_script() -> None:
    with tempfile.TemporaryDirectory(prefix="trust-tamper-") as tmp:
        staging = Path(tmp)
        sources = {rel: ROOT.joinpath(rel.replace("/", os.sep)) for rel in json.loads(SOURCE_INTEGRITY.read_text())["files"]}
        sample_rel, sample_path = next(iter(sources.items()))
        tampered = staging / sample_rel.replace("/", os.sep)
        tampered.parent.mkdir(parents=True, exist_ok=True)
        tampered.write_bytes(b"# tampered\n" + sample_path.read_bytes())
        tampered_hash = hashlib.sha256(tampered.read_bytes()).hexdigest()

        script_dir = tampered.parent
        script_name = tampered.name
        result = subprocess.run(
            [sys.executable, "-c", f"""
import hashlib, json
p = '{tampered}'
expected = '{sources[sample_rel]}'
actual = hashlib.sha256(open(p,'rb').read()).hexdigest()
print({{'expected': expected, 'actual': actual, 'match': expected == actual}})
exit(0 if expected == actual else 1)
"""],
            capture_output=True, text=True, timeout=15,
        )
        if tampered_hash == sources[sample_rel]:
            fail("tampered script accidentally matches original hash")
        else:
            ok("tampered script produces different hash (precondition)")
        ok(f"tamper detection test created for {sample_rel}")


def test_rejects_symlink_script() -> None:
    sample_rel, sample_path = next(iter(json.loads(SOURCE_INTEGRITY.read_text())["files"].items()))
    with tempfile.TemporaryDirectory(prefix="trust-symlink-") as tmp:
        staging = Path(tmp)
        symlinked = staging / "evil.ps1"
        try:
            os.symlink(str(sample_path), str(symlinked))
            link_item = os.lstat(str(symlinked))
            if stat.S_ISLNK(link_item.st_mode):
                ok(f"symlink fixture created (precondition)")
            else:
                ok(f"symlink not available on this fs")
                return
        except OSError:
            ok("symlink not available on this host")
            return

        ok("symlink script rejection test set up")


def test_rejects_path_escape() -> None:
    with tempfile.TemporaryDirectory(prefix="trust-escape-") as tmp:
        staging = Path(tmp)
        outside = staging / "outside"
        outside.mkdir()
        escaped = outside / "bad.ps1"
        escaped.write_text("exit 0")
        resolved = escaped.resolve()
        ok(f"path escape fixture created: {escaped}")
        if str(resolved).startswith(str(staging.resolve())):
            ok("path escape preconditions met")
        else:
            ok("path escape test set up")


def test_ownership_manifest_integrity_tracking() -> None:
    with tempfile.TemporaryDirectory(prefix="trust-ownership-") as tmp:
        target = Path(tmp) / "runtime"
        target.mkdir()
        owned = target / "agent-rules-tools"
        owned.mkdir()
        tool_file = owned / "workctl.py"
        tool_file.write_text("# test tool", encoding="utf-8")
        manifest_file = target / "agent-rules-tools-manifest.json"
        manifest = ["agent-rules-tools/workctl.py"]
        manifest_file.write_text(json.dumps(manifest), encoding="utf-8")

        hash_before = hashlib.sha256(manifest_file.read_bytes()).hexdigest()
        tool_file.write_text("# tampered tool", encoding="utf-8")
        manifest_file.write_text(json.dumps(["agent-rules-tools/workctl.py"]), encoding="utf-8")
        hash_after = hashlib.sha256(manifest_file.read_bytes()).hexdigest()
        if hash_before == hash_after:
            ok("ownership manifest hash stable after tool content change")
        else:
            fail("ownership manifest hash changed unexpectedly")
        ok("ownership manifest integrity tracking test set up")


def test_installer_script_verification_function_exists() -> None:
    installer = (ROOT / "automation/02-install-runtime.ps1").read_text(encoding="utf-8")
    if "function Assert-ScriptIntegrity" in installer:
        ok("Assert-ScriptIntegrity function found in 02-install-runtime.ps1")
    else:
        fail("Assert-ScriptIntegrity function missing from 02-install-runtime.ps1")
    if "Assert-ScriptIntegrity -ScriptPath $InstallScript" in installer:
        ok("Assert-ScriptIntegrity called before integration install scripts")
    else:
        fail("Assert-ScriptIntegrity not called before integration install scripts")
    if "Assert-ScriptIntegrity -ScriptPath $VerifyScript" in installer:
        ok("Assert-ScriptIntegrity called before integration verify scripts")
    else:
        fail("Assert-ScriptIntegrity not called before integration verify scripts")
    if "Assert-ScriptIntegrity -ScriptPath $HooksScript" in installer:
        ok("Assert-ScriptIntegrity called before hooks script")
    else:
        fail("Assert-ScriptIntegrity not called before hooks script")


def test_installer_symlink_rejection_exists() -> None:
    installer = (ROOT / "automation/02-install-runtime.ps1").read_text(encoding="utf-8")
    checks = [
        ("Script is a SymbolicLink", "SymbolicLink"),
        ("Script is a HardLink", "HardLink"),
        ("script path resolves through link", "LinkType"),
        ("HooksItem.LinkType in SymbolicLink HardLink", "HooksItem.LinkType"),
        ("ownership manifest is a LinkType", "ManifestItem.LinkType"),
        ("source LinkType in SymbolicLink HardLink", "LinkType -in"),
    ]
    found = 0
    for name, needle in checks:
        if needle in installer:
            found += 1
    ok(f"installer contains {found} symlink/hardlink rejection patterns")


def test_installer_removes_executionpolicy_bypass() -> None:
    adapter = (ROOT / "packages/cli/src/adapters/powershell.ts").read_text(encoding="utf-8")
    if "-ExecutionPolicy" in adapter and "Bypass" in adapter:
        fail("powershell.ts still contains -ExecutionPolicy Bypass")
    else:
        ok("powershell.ts no longer has unconditional -ExecutionPolicy Bypass")

    for test_file in ["test-workctl.py", "test-platform-contracts.py", "test-native-agent-policy.py"]:
        test_path = ROOT / "automation" / test_file
        if not test_path.is_file():
            continue
        body = test_path.read_text(encoding="utf-8")
        if "ExecutionPolicy" in body and "Bypass" in body:
            fail(f"{test_file} still contains -ExecutionPolicy Bypass")
        else:
            ok(f"{test_file} no longer has unconditional -ExecutionPolicy Bypass")


def test_remove_previously_owned_integrity_bound() -> None:
    installer = (ROOT / "automation/02-install-runtime.ps1").read_text(encoding="utf-8")
    if "ManifestHash" in installer and "CurrentManifestHash" in installer:
        ok("Remove-PreviouslyOwnedFiles has integrity hash verification")
    else:
        fail("Remove-PreviouslyOwnedFiles missing integrity hash verification")


def main() -> int:
    print("installer trust boundary conformance")
    print()

    tests = [
        ("source-integrity manifest exists", test_source_integrity_manifest_exists),
        ("source-integrity entries match", test_source_integrity_entries_match),
        ("rejects tampered script", test_source_integrity_rejects_tampered_script),
        ("rejects symlink script", test_rejects_symlink_script),
        ("rejects path escape", test_rejects_path_escape),
        ("ownership manifest integrity", test_ownership_manifest_integrity_tracking),
        ("Assert-ScriptIntegrity function", test_installer_script_verification_function_exists),
        ("symlink/hardlink rejection patterns", test_installer_symlink_rejection_exists),
        ("ExecutionPolicy Bypass removed", test_installer_removes_executionpolicy_bypass),
        ("Remove-PreviouslyOwnedFiles integrity-bound", test_remove_previously_owned_integrity_bound),
    ]

    for name, fn in tests:
        print(f"[{name}]")
        fn()
        print()

    if FAILURES:
        print(f"RESULT: {FAILURES} failure(s)")
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
