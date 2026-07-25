#!/usr/bin/env python3
"""Check all internal markdown links point to existing files."""

import re
import sys
from pathlib import Path


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
    errors = []

    md_files = list(root.glob("*.md")) + list(root.glob("guides/*.md"))
    for f in sorted(md_files):
        text = f.read_text(encoding="utf-8")
        for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", text):
            link = m.group(2)
            if link.startswith("http") or link.startswith("#"):
                continue
            target = (f.parent / link).resolve()
            if not target.exists():
                target2 = root / link
                if not target2.exists():
                    errors.append(f"{f.name}: broken link '{link}' -> {target.name if target.parent == f.parent else link}")

    for e in errors:
        print(f"BROKEN: {e}")

    if not errors:
        print("All internal links OK")
    else:
        print(f"\n{len(errors)} broken link(s)")
        sys.exit(1)


if __name__ == "__main__":
    main()
