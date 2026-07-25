#!/usr/bin/env python3
"""Validate documentation against canonical sources to detect drift.

Exit codes: 0 = no drift, 1 = drift detected.

Checks:
1. Generated references match canonical data (regenerate and diff)
2. README integration table matches registry
3. All referenced docs paths exist
4. No stale Gemini CLI product references in guides
5. Capability statuses match canonical definitions
6. Platform claims include verification state
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path


def main():
    root = Path(os.environ.get("AGENT_RULES_ROOT", Path(__file__).resolve().parent.parent))
    errors = []
    warnings = []

    # ── 0. Regenerate references and check drift ──────────────────────
    gen_script = root / "automation" / "generate-doc-references.py"
    ref_dir = root / "05-generated" / "references"

    if gen_script.exists():
        # Capture pre-generation state
        pre_state = {}
        if ref_dir.exists():
            for f in ref_dir.glob("*.md"):
                pre_state[f.name] = f.read_text(encoding="utf-8")

        # Regenerate
        result = subprocess.run(
            [sys.executable, str(gen_script)],
            capture_output=True, text=True, cwd=root
        )
        if result.returncode != 0:
            errors.append(f"Reference regeneration failed: {result.stderr.strip()}")
        else:
            # Compare
            for f in ref_dir.glob("*.md"):
                current = f.read_text(encoding="utf-8")
                if f.name in pre_state and pre_state[f.name] != current:
                    # Check if only timestamp changed
                    old_stripped = re.sub(r"Last generated:.*", "", pre_state[f.name])
                    new_stripped = re.sub(r"Last generated:.*", "", current)
                    if old_stripped != new_stripped:
                        rel = f.relative_to(root).as_posix()
                        errors.append(
                            f"Generated reference differs from canonical data: {rel}. "
                            f"Run `python automation/generate-doc-references.py` to update."
                        )
    else:
        warnings.append("generate-doc-references.py not found, skipping regeneration check")

    # ── 1. README integration table vs registry ───────────────────────
    readme_path = root / "README.md"
    reg_path = root / "integrations" / "registry.json"

    if readme_path.exists() and reg_path.exists():
        readme_text = readme_path.read_text(encoding="utf-8")
        registry = json.loads(reg_path.read_text(encoding="utf-8"))

        # Extract integration IDs from README table
        readme_ids = set(re.findall(r"^\| (`[^`]+`|[a-z][a-z0-9_-]*) \|", readme_text, re.MULTILINE))
        readme_ids = {s.strip("`") for s in readme_ids}

        # Extract integration IDs from registry
        reg_ids = {t["id"] for t in registry["integrations"]}

        # Check if README lists all integrations (look for an "Integrations" section table)
        in_table = False
        readme_table_ids = set()
        for line in readme_text.split("\n"):
            if line.startswith("| Name | Policy |") or line.startswith("| ID | Policy |"):
                in_table = True
                continue
            if in_table:
                if line.startswith("|---"):
                    continue
                if not line.startswith("|"):
                    in_table = False
                    continue
                parts = [p.strip() for p in line.split("|")[1:-1]]
                if parts:
                    readme_table_ids.add(parts[0].strip("`"))

        if readme_table_ids:
            missing_from_readme = reg_ids - readme_table_ids
            extra_in_readme = readme_table_ids - reg_ids
            if missing_from_readme:
                errors.append(
                    f"README integration table missing: {', '.join(sorted(missing_from_readme))}. "
                    f"Either add them or reference the generated table in 05-generated/references/integration-registry.md"
                )
            if extra_in_readme:
                warnings.append(
                    f"README integration table has unknown entries: {', '.join(sorted(extra_in_readme))}"
                )

    # ── 2. Check all referenced paths in guides exist ─────────────────
    guides_dir = root / "guides"
    if guides_dir.exists():
        for guide_file in sorted(guides_dir.glob("*.md")):
            text = guide_file.read_text(encoding="utf-8")
            # Find markdown links to local files
            for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", text):
                link = m.group(2)
                if link.startswith("http") or link.startswith("#"):
                    continue
                # Resolve relative to guide file location
                if link.startswith("/"):
                    target = root / link.lstrip("/")
                else:
                    target = (guide_file.parent / link).resolve()
                if not target.exists():
                    # Try relative to root
                    target2 = root / link
                    if not target2.exists():
                        rel = target.relative_to(root) if root in target.parents else target
                        errors.append(
                            f"Broken link in {guide_file.name}: '{link}' -> {rel} not found"
                        )

    # ── 3. Check for stale Gemini CLI product references ─────────────
    for guide_file in sorted(guides_dir.glob("*.md")):
        text = guide_file.read_text(encoding="utf-8")
        # Look for "Gemini CLI" as a product (not as Antigravity host reference)
        for m in re.finditer(r"(?<!`)Gemini CLI(?!`)", text):
            line_num = text[:m.start()].count("\n") + 1
            # Skip if context is about Antigravity compatibility
            context_start = max(0, m.start() - 100)
            context = text[context_start:m.end() + 100]
            if "Antigravity" in context and ("compatibility" in context or "runtime" in context or "binary" in context):
                continue
            warnings.append(
                f"Stale 'Gemini CLI' reference in {guide_file.name}:{line_num} - "
                f"should refer to 'Antigravity' (runtime binary is gemini)"
            )

    # ── 4. Check platform capability guide has last-verified metadata ─
    cap_guide = root / "guides" / "06-platform-capability.md"
    if cap_guide.exists():
        text = cap_guide.read_text(encoding="utf-8")
        if "Last verified" not in text and "last-verified" not in text.lower() and "last_reviewed" not in text.lower():
            warnings.append(
                "guides/06-platform-capability.md has no last-verified metadata. "
                "Add a 'Last verified' or 'Last reviewed' date annotation."
            )

        # Check that status column mentions verification state
        if "native | emulated | unsupported | unverified" not in text:
            if "Status values" not in text:
                warnings.append(
                    "guides/06-platform-capability.md missing status value definitions "
                    "(native/emulated/unsupported/unverified)"
                )

    # ── 5. Check README describes product scope accurately ───────────
    if readme_path.exists():
        text = readme_path.read_text(encoding="utf-8")
        if "Gemini CLI" in text and "unsupported" not in text:
            warnings.append(
                "README.md mentions Gemini CLI without clarifying it's unsupported"
            )

    # ── 6. Check platform runtime.yaml files for consistency ─────────
    platforms_dir = root / "platforms"
    supported_platforms = {"codex", "grok", "antigravity", "cursor"}

    if platforms_dir.exists():
        for pdir in platforms_dir.iterdir():
            if not pdir.is_dir():
                continue
            rpath = pdir / "runtime.yaml"
            if not rpath.exists():
                continue
            text = rpath.read_text(encoding="utf-8")
            pf_match = re.search(r"platform:\s*(.+)", text)
            if pf_match:
                pf = pf_match.group(1).strip()
                # Check for overlay file
                overlay = pdir / f"{pf}-overlay.md"
                if not overlay.exists():
                    overlay2 = platforms_dir / pf / f"{pf}-overlay.md"
                    if not overlay2.exists():
                        errors.append(
                            f"Missing overlay file for platform '{pf}': expected {pf}-overlay.md"
                        )

    # ── Report ────────────────────────────────────────────────────────
    if warnings:
        print("=== WARNINGS (advisory, non-blocking) ===")
        for w in warnings:
            print(f"  [WARN] {w}")
        print()

    if errors:
        print("=== ERRORS (drift detected) ===")
        for e in errors:
            print(f"  [FAIL] {e}")
        print(f"\n{len(errors)} drift error(s) found.")
        sys.exit(1)

    print("Documentation drift validation PASS (0 errors, {} warnings)".format(len(warnings)))
    sys.exit(0)


if __name__ == "__main__":
    main()
