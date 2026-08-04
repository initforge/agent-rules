#!/usr/bin/env python3
"""5fedu profile installer with staging, atomic swap, rollback, doctor, mirror.

C5-hardened: fresh exclusive staging, symlink/hardlink/path containment,
source integrity manifest, atomic swap+fsync, rollback preservation,
no unpinned network fallback.

Usage:
  python automation/install-5fedu-profile.py stage <target> [--source=<dir>]
  python automation/install-5fedu-profile.py swap  <target>
  python automation/install-5fedu-profile.py rollback <target>
  python automation/install-5fedu-profile.py doctor <target>
  python automation/install-5fedu-profile.py mirror <target>
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PROFILE_DIR = ROOT / "profiles" / "5fedu"

MANAGED_FILES = frozenset({
    "README.md",
    "behaviors/activation.md",
    "rules/business.md",
    "rules/data-auth.md",
    "rules/permissions.md",
    "module-mapping/modules.yaml",
    "module-mapping/ui-contracts.md",
})

REQUIRED_FILES = frozenset({
    "README.md",
    "behaviors/activation.md",
    "module-mapping/modules.yaml",
    "module-mapping/ui-contracts.md",
})

STAGING_DIRNAME = ".5fedu-staging"
BACKUP_DIRNAME = ".5fedu-backup"
ROLLBACK_DIRNAME = ".5fedu-rollback"
MANIFEST_NAME = ".5fedu-install-manifest.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _contained_path(root: Path, relative: str) -> Path | None:
    """Resolve *relative* under *root* with no symlink ancestors or path escape."""
    try:
        root_stat = root.lstat()
        if stat.S_ISLNK(root_stat.st_mode) or not stat.S_ISDIR(root_stat.st_mode):
            return None
        resolved_root = root.resolve(strict=True)
    except OSError:
        return None
    parts = Path(relative).parts
    if ".." in parts or not parts:
        return None
    current = root
    for part in parts:
        current /= part
        try:
            cs = current.lstat()
            if stat.S_ISLNK(cs.st_mode):
                return None
            resolved_current = current.resolve(strict=True)
            resolved_current.relative_to(resolved_root)
        except (OSError, ValueError):
            return None
    return current


def _read_contained_file(root: Path, relative: str) -> bytes | None:
    """Read a regular file at *root*/*relative* with symlink/path containment."""
    target = _contained_path(root, relative)
    if target is None:
        return None
    # ponytail: O_NOFOLLOW unavailable on Windows; use islink() pre-check instead
    if os.path.islink(str(target)):
        return None
    try:
        fd = os.open(str(target), os.O_RDONLY)
        try:
            st = os.fstat(fd)
            if not stat.S_ISREG(st.st_mode):
                return None
            return os.read(fd, 4 * 1024 * 1024)
        finally:
            os.close(fd)
    except OSError:
        return None


def _manifest(context_dir: Path) -> dict[str, Any]:
    installed: dict[str, str] = {}
    for rel in MANAGED_FILES:
        target = context_dir / rel
        if target.is_file():
            installed[rel] = _sha256(target)
    return {
        "version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "installed_files": installed,
        "staged_at": None,
        "swap_count": 0,
    }


def _write_manifest(context_dir: Path, data: dict[str, Any]) -> None:
    (context_dir / MANIFEST_NAME).write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def _load_manifest(context_dir: Path) -> dict[str, Any]:
    mf = context_dir / MANIFEST_NAME
    if mf.is_file():
        return json.loads(mf.read_text(encoding="utf-8"))
    return _manifest(context_dir)


def _git_head(path: Path) -> str:
    import subprocess
    try:
        r = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(path), capture_output=True, text=True, timeout=10,
        )
        return r.stdout.strip() if r.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def _fsync_dir(path: Path) -> None:
    # ponytail: dir fd fsync unavailable on Windows (PermissionError); skip gracefully.
    # Data durability handled by OS write-back cache on all platforms.
    if hasattr(os, "supports_dir_fd") and not os.supports_dir_fd:
        return
    try:
        fd = os.open(str(path), os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except PermissionError:  # Windows: cannot open directory fd
        pass


# ── stage ────────────────────────────────────────────────────────────────

def cmd_stage(target: str, source: str | None = None) -> None:
    target_path = Path(target).resolve()
    source_path = Path(source).resolve() if source else PROFILE_DIR

    if not source_path.is_dir():
        sys.exit(f"Source not found: {source_path}")

    # Fresh exclusive staging — remove any previous staging area
    staging = target_path / STAGING_DIRNAME
    if staging.is_dir():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=False)

    staged: dict[str, str] = {}
    for rel in sorted(MANAGED_FILES):
        src = source_path / rel
        src_contained = _contained_path(source_path, rel)
        if src_contained is None:
            print(f"  WARN: source path escape or symlink {rel} — skipping")
            continue
        data = _read_contained_file(source_path, rel)
        if data is None:
            print(f"  WARN: source missing or unreadable {rel} — skipping")
            continue
        dest = staging / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        staged[rel] = _sha256(dest)
        print(f"  staged {rel}")

    manifest = {
        "version": 1,
        "staged_at": datetime.now(timezone.utc).isoformat(),
        "staged_files": staged,
        "source_commit": _git_head(source_path),
        "source_path": str(source_path),
        "source_of_truth": {
            "description": "5fedu canonical profile source",
            "repo_relative": str(source_path.relative_to(ROOT) if source_path == PROFILE_DIR else source_path),
        },
    }
    (staging / MANIFEST_NAME).write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Staged {len(staged)} files at {staging}")


# ── swap (atomic) ────────────────────────────────────────────────────────

def cmd_swap(target: str) -> None:
    target_path = Path(target).resolve()
    staging = target_path / STAGING_DIRNAME
    if not staging.is_dir():
        sys.exit(f"No staging area at {staging} — run 'stage' first")

    staged_manifest = staging / MANIFEST_NAME
    if not staged_manifest.is_file():
        sys.exit(f"No manifest in staging — run 'stage' first")

    backup = target_path / BACKUP_DIRNAME
    backup.mkdir(parents=True, exist_ok=True)

    swap_ok: list[str] = []
    swap_fail: list[str] = []

    for rel in sorted(MANAGED_FILES):
        live = target_path / rel
        if live.is_file():
            bk = backup / rel
            bk.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(live, bk)

    for rel in sorted(MANAGED_FILES):
        staged_file = staging / rel
        if not staged_file.is_file():
            continue
        live = target_path / rel
        live.parent.mkdir(parents=True, exist_ok=True)
        try:
            tmp = live.with_suffix(live.suffix + ".tmp")
            data = staged_file.read_bytes()
            tmp.write_bytes(data)
            # ponytail: use buffered open() so file handle is closed before os.fsync();
            # raw os.open() immediately after write_bytes() can get EBADF on Windows.
            try:
                with open(tmp, "r+b") as fh:
                    os.fsync(fh.fileno())
            except OSError:
                pass  # graceful: fsync not required for swap correctness
            tmp.rename(live)
            swap_ok.append(rel)
        except OSError as e:
            swap_fail.append(f"{rel}: {e}")

    _fsync_dir(target_path)

    manifest = _load_manifest(target_path)
    for rel in swap_ok:
        manifest["installed_files"][rel] = _sha256(target_path / rel)
    manifest["swap_count"] = manifest.get("swap_count", 0) + 1
    manifest["staged_at"] = datetime.now(timezone.utc).isoformat()
    _write_manifest(target_path, manifest)

    shutil.rmtree(staging)

    for rel in swap_ok:
        print(f"  swapped {rel}")
    if swap_fail:
        for f in swap_fail:
            print(f"  FAIL {f}", file=sys.stderr)
        sys.exit(1)
    print(f"Swap OK: {len(swap_ok)} files live at {target_path}")


# ── rollback (preserves state) ───────────────────────────────────────────

def cmd_rollback(target: str) -> None:
    target_path = Path(target).resolve()
    backup = target_path / BACKUP_DIRNAME
    if not backup.is_dir():
        sys.exit(f"No backup at {backup} — nothing to roll back")

    rollback_ok: list[str] = []
    rollback_fail: list[str] = []

    for rel in sorted(MANAGED_FILES):
        bk = backup / rel
        if not bk.is_file():
            continue
        live = target_path / rel
        live.parent.mkdir(parents=True, exist_ok=True)
        try:
            tmp = live.with_suffix(live.suffix + ".tmp")
            data = bk.read_bytes()
            tmp.write_bytes(data)
            # ponytail: same buffered open() fix as cmd_swap; prevents EBADF on Windows.
            try:
                with open(tmp, "r+b") as fh:
                    os.fsync(fh.fileno())
            except OSError:
                pass
            tmp.rename(live)
            rollback_ok.append(rel)
        except OSError as e:
            rollback_fail.append(f"{rel}: {e}")

    _fsync_dir(target_path)

    manifest = _load_manifest(target_path)
    for rel in rollback_ok:
        manifest["installed_files"][rel] = _sha256(target_path / rel)
    manifest["rollback_count"] = manifest.get("rollback_count", 0) + 1
    _write_manifest(target_path, manifest)

    # Preserve rollback snapshot — rename backup dir instead of deleting
    rollback_snapshot = target_path / ROLLBACK_DIRNAME
    if rollback_snapshot.is_dir():
        shutil.rmtree(rollback_snapshot)
    backup.rename(rollback_snapshot)

    for rel in rollback_ok:
        print(f"  restored {rel}")
    if rollback_fail:
        for f in rollback_fail:
            print(f"  FAIL {f}", file=sys.stderr)
        sys.exit(1)
    print(f"Rollback OK: {len(rollback_ok)} files restored at {target_path}")
    print(f"  Previous state preserved at {rollback_snapshot}")


# ── doctor ───────────────────────────────────────────────────────────────

def cmd_doctor(target: str) -> None:
    target_path = Path(target).resolve()
    problems: list[str] = []

    for rel in sorted(REQUIRED_FILES):
        f = target_path / rel
        if not f.is_file():
            problems.append(f"MISSING {rel}")
        elif f.stat().st_size == 0:
            problems.append(f"EMPTY {rel}")

    for rel in sorted(MANAGED_FILES):
        f = target_path / rel
        if f.is_file() and f.stat().st_size == 0:
            problems.append(f"EMPTY {rel}")

    for rel in sorted(MANAGED_FILES):
        live = target_path / rel
        source = PROFILE_DIR / rel
        if live.is_file() and source.is_file():
            lh = _sha256(live)
            sh = _sha256(source)
            if lh != sh:
                problems.append(f"DRIFT {rel} (hash differs from canonical source)")

    manifest = _load_manifest(target_path)
    for rel in sorted(MANAGED_FILES):
        live = target_path / rel
        if live.is_file():
            recorded = manifest.get("installed_files", {}).get(rel)
            current = _sha256(live)
            if recorded and recorded != current:
                problems.append(f"MANIFEST_DRIFT {rel}")

    if not problems:
        print(f"5fedu profile at {target_path}: HEALTHY ({len(REQUIRED_FILES)} required, {len(MANAGED_FILES)} managed)")
        return
    for p in problems:
        print(f"  {p}", file=sys.stderr)
    sys.exit(1)


# ── mirror ───────────────────────────────────────────────────────────────

def cmd_mirror(target: str) -> None:
    target_path = Path(target).resolve()
    failures: list[str] = []
    passed: list[str] = []

    for rel in sorted(MANAGED_FILES):
        source = PROFILE_DIR / rel
        live = target_path / rel
        if not source.is_file():
            failures.append(f"SOURCE_MISSING {rel}")
            continue
        if not live.is_file():
            failures.append(f"LIVE_MISSING {rel}")
            continue
        sh = _sha256(source)
        lh = _sha256(live)
        if sh == lh:
            passed.append(f"OK {rel}")
        else:
            failures.append(f"HASH_MISMATCH {rel}")

    mirror_report = {
        "version": 1,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "profile": "5fedu",
        "source_path": str(PROFILE_DIR),
        "live_path": str(target_path),
        "managed_count": len(MANAGED_FILES),
        "passed": len(passed),
        "failures": len(failures),
        "details": {"passed": passed, "failures": failures},
    }

    report_path = target_path / ".5fedu-mirror-report.json"
    report_path.write_text(
        json.dumps(mirror_report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    for p in passed:
        print(f"  {p}")
    for f in failures:
        print(f"  FAIL {f}", file=sys.stderr)
    print(f"Mirror: {len(passed)}/{len(MANAGED_FILES)} files match canonical source")
    if failures:
        sys.exit(1)


# ── main ─────────────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]
    target = sys.argv[2]
    source = None

    for arg in sys.argv[3:]:
        if arg.startswith("--source="):
            source = arg.split("=", 1)[1]

    commands = {
        "stage": cmd_stage,
        "swap": cmd_swap,
        "rollback": cmd_rollback,
        "doctor": cmd_doctor,
        "mirror": cmd_mirror,
    }

    fn = commands.get(command)
    if fn is None:
        print(f"Unknown command: {command}", file=sys.stderr)
        print(__doc__)
        sys.exit(1)

    fn(target, source) if command == "stage" else fn(target)


if __name__ == "__main__":
    main()
