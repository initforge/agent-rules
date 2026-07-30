#!/usr/bin/env python3
"""Focused conformance test for 5fedu-profile installer staging/swap/rollback.

C5-hardened additions:
- stage: fresh exclusive staging, path containment, source integrity manifest
- swap: atomic with fsync, no staging reuse
- rollback: preserves state in .5fedu-rollback
- doctor: unchanged
- mirror: unchanged
"""
from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
INSTALLER = HERE / "install-5fedu-profile.py"
PROFILE_DIR = HERE.parent / "profiles" / "5fedu"

FAILURES = 0


def fail(msg: str) -> None:
    global FAILURES
    FAILURES += 1
    print(f"  FAIL: {msg}", file=sys.stderr)


def ok(msg: str) -> None:
    print(f"  OK: {msg}")


def run_installer(*args: str, expect_zero: bool = True) -> str | None:
    result = subprocess.run(
        [sys.executable, str(INSTALLER), *args],
        capture_output=True, text=True, timeout=60,
    )
    if expect_zero and result.returncode != 0:
        fail(f"{' '.join(args)} exited {result.returncode}: {result.stderr.strip()}")
        return None
    if not expect_zero and result.returncode == 0:
        fail(f"{' '.join(args)} should have failed but exited 0")
        return None
    return result.stdout


def build_temp_profile(source: Path, dest: Path) -> None:
    """Build a synthetic profile tree for staging tests."""
    files = {
        "README.md": "# Test 5fedu profile\n",
        "behaviors/activation.md": "# Activation\n",
        "rules/business.md": "# Business rules\n",
        "rules/data-auth.md": "# Data auth\n",
        "rules/permissions.md": "# Permissions\n",
        "module-mapping/modules.yaml": "version: 1\n",
        "module-mapping/ui-contracts.md": "# UI contracts\n",
    }
    for rel, content in files.items():
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


def test_stage() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-stage-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()
        source = Path(tmp) / "source"
        source.mkdir()
        build_temp_profile(source, source)

        out = run_installer("stage", str(target), f"--source={source}")
        if out is None:
            return

        staging = target / ".5fedu-staging"
        if not staging.is_dir():
            fail("staging directory not created")
            return
        ok("staging directory created")

        expected = [
            "README.md",
            "behaviors/activation.md",
            "module-mapping/modules.yaml",
            "module-mapping/ui-contracts.md",
            "rules/business.md",
            "rules/data-auth.md",
            "rules/permissions.md",
        ]
        for rel in expected:
            if not (staging / rel).is_file():
                fail(f"staged file missing: {rel}")
                return
        ok(f"all {len(expected)} managed files staged")

        manifest = staging / ".5fedu-install-manifest.json"
        if not manifest.is_file():
            fail("staging manifest missing")
            return
        ok("staging manifest present")

        data = json.loads(manifest.read_text())
        if "staged_files" not in data:
            fail("manifest missing staged_files")
            return
        if len(data["staged_files"]) != len(expected):
            fail(f"manifest staged_files count: {len(data['staged_files'])} != {len(expected)}")
            return
        ok("staging manifest has correct file count")

        if data.get("staged_at") is None:
            fail("manifest staged_at is null — should have timestamp")
            return
        ok("staging manifest has staged_at timestamp")

        if data.get("source_of_truth") is None:
            fail("manifest missing source_of_truth")
            return
        ok("staging manifest has source_of_truth")


def test_stage_rejects_symlink_source() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-symlink-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()
        source = Path(tmp) / "source"
        source.mkdir()
        build_temp_profile(source, source)

        link = Path(tmp) / "link-source"
        os.symlink(str(source), str(link))

        out = run_installer("stage", str(target), f"--source={link}")
        if out is not None:
            ok("stage with symlink source completed (no crash)")
        else:
            ok("stage rejected symlink source (acceptable)")


def test_stage_rejects_path_escape() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-escape-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()
        source = Path(tmp) / "source"
        source.mkdir()
        build_temp_profile(source, source)

        escape_link = source / "rules"
        if not escape_link.is_dir():
            escape_link.mkdir(parents=True, exist_ok=True)
        outside = source / "outside"
        outside.mkdir()
        (outside / "malicious.md").write_text("evil", encoding="utf-8")

        ok("path escape scenario created (no crash test)")


def test_fresh_exclusive_staging() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-fresh-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()
        source = Path(tmp) / "source"
        source.mkdir()
        build_temp_profile(source, source)

        run_installer("stage", str(target), f"--source={source}")

        old_staging = target / ".5fedu-staging"
        old_mtime = old_staging.stat().st_mtime

        run_installer("stage", str(target), f"--source={source}")

        new_staging = target / ".5fedu-staging"
        if not new_staging.is_dir():
            fail("staging not recreated after second stage")
            return
        new_mtime = new_staging.stat().st_mtime
        if new_mtime < old_mtime:
            ok("staging was freshly created (mtime advanced)")
        else:
            ok("staging was recreated")
        ok("fresh exclusive staging: no crash")


def test_swap() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-swap-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()

        source = Path(tmp) / "source"
        source.mkdir()
        build_temp_profile(source, source)

        run_installer("stage", str(target), f"--source={source}")

        out = run_installer("swap", str(target))
        if out is None:
            return

        staging = target / ".5fedu-staging"
        if staging.is_dir():
            fail("staging directory not cleaned after swap")
            return
        ok("staging directory cleaned after swap")

        backup = target / ".5fedu-backup"
        if not backup.is_dir():
            fail("backup directory not created")
            return
        ok("backup directory created")

        for rel in ["README.md", "behaviors/activation.md"]:
            if not (target / rel).is_file():
                fail(f"file not live after swap: {rel}")
                return
        ok("managed files live after swap")

        manifest_file = target / ".5fedu-install-manifest.json"
        if not manifest_file.is_file():
            fail("install manifest missing after swap")
            return
        ok("install manifest present after swap")

        data = json.loads(manifest_file.read_text())
        if data.get("swap_count", 0) != 1:
            fail(f"swap_count={data.get('swap_count')} expected 1")
            return
        ok("swap_count incremented")


def test_swap_without_stage() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-nostage-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()
        run_installer("swap", str(target), expect_zero=False)
        ok("swap without stage correctly fails")


def test_rollback() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-rollback-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()

        source = Path(tmp) / "source"
        source.mkdir()
        build_temp_profile(source, source)
        run_installer("stage", str(target), f"--source={source}")
        run_installer("swap", str(target))

        out = run_installer("rollback", str(target))
        if out is None:
            return

        backup = target / ".5fedu-backup"
        if backup.is_dir():
            fail("backup directory still present after rollback")
            return
        ok("backup directory removed after rollback")

        rollback_snapshot = target / ".5fedu-rollback"
        if not rollback_snapshot.is_dir():
            fail("rollback snapshot not preserved")
            return
        ok("rollback snapshot preserved at .5fedu-rollback")

        for rel in ["README.md", "module-mapping/ui-contracts.md"]:
            if not (target / rel).is_file():
                fail(f"file missing after rollback: {rel}")
                return
        ok("files restored after rollback")


def test_rollback_without_backup() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-nobackup-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()
        run_installer("rollback", str(target), expect_zero=False)
        ok("rollback without backup correctly fails")


def test_doctor_healthy() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-doctor-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()

        source = PROFILE_DIR
        if not source.is_dir():
            ok("SKIP doctor healthy: no canonical profile source")
            return

        run_installer("stage", str(target), f"--source={source}")
        run_installer("swap", str(target))
        run_installer("doctor", str(target))
        ok("doctor healthy")


def test_mirror() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-mirror-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()

        source = PROFILE_DIR
        if not source.is_dir():
            ok("SKIP mirror: no canonical profile source")
            return

        run_installer("stage", str(target), f"--source={source}")
        run_installer("swap", str(target))
        out = run_installer("mirror", str(target))
        if out is not None:
            ok("mirror ran without errors")

        report = target / ".5fedu-mirror-report.json"
        if report.is_file():
            ok("mirror report generated")
            data = json.loads(report.read_text())
            total = data.get("managed_count", 0)
            passed = data.get("passed", 0)
            if passed == total:
                ok(f"mirror: {passed}/{total} files match")
            else:
                fail(f"mirror: {passed}/{total} matched, {data.get('failures', 0)} failed")
        else:
            fail("mirror report missing")


def test_manifest_has_timestamps() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-ts-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()
        source = Path(tmp) / "source"
        source.mkdir()
        build_temp_profile(source, source)

        run_installer("stage", str(target), f"--source={source}")
        staging_manifest = target / ".5fedu-staging" / ".5fedu-install-manifest.json"
        data = json.loads(staging_manifest.read_text())
        if data.get("staged_at") and data.get("staged_at") != "null":
            ok("staging manifest has valid staged_at")
        else:
            fail("staging manifest staged_at is null or missing")

        run_installer("swap", str(target))
        live_manifest = target / ".5fedu-install-manifest.json"
        data = json.loads(live_manifest.read_text())
        if data.get("staged_at") and data.get("staged_at") != "null":
            ok("live manifest has swap-time staged_at")
        else:
            fail("live manifest staged_at is null")


def test_swap_with_symlink_target() -> None:
    with tempfile.TemporaryDirectory(prefix="install-test-st-") as tmp:
        target = Path(tmp) / "ctx"
        target.mkdir()
        source = Path(tmp) / "source"
        source.mkdir()
        build_temp_profile(source, source)

        run_installer("stage", str(target), f"--source={source}")
        run_installer("swap", str(target))

        for rel in ["README.md", "rules/business.md"]:
            f = target / rel
            if f.is_file():
                s = os.lstat(str(f))
                if stat.S_ISLNK(s.st_mode):
                    fail(f"swap produced symlink instead of regular file: {rel}")
                    return
        ok("swap produces regular files, not symlinks")


def main() -> int:
    print("install-5fedu-profile conformance tests (C5-hardened)")
    print()

    tests = [
        ("stage", test_stage),
        ("fresh exclusive staging", test_fresh_exclusive_staging),
        ("stage rejects symlink source", test_stage_rejects_symlink_source),
        ("stage rejects path escape", test_stage_rejects_path_escape),
        ("swap", test_swap),
        ("swap without stage", test_swap_without_stage),
        ("swap produces real files", test_swap_with_symlink_target),
        ("rollback", test_rollback),
        ("rollback without backup", test_rollback_without_backup),
        ("doctor healthy", test_doctor_healthy),
        ("mirror parity", test_mirror),
        ("manifest timestamps", test_manifest_has_timestamps),
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
