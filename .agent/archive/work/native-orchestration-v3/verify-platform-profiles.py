from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


policy = json.loads((ROOT / "automation/model-policy.json").read_text(encoding="utf-8"))
platforms = policy["platforms"]
require(set(platforms) == {"codex", "cursor", "antigravity", "grok"}, "policy platform set")
require(platforms["cursor"]["denied_modes"] == ["Fast", "Auto"], "Cursor deny policy")
require(platforms["antigravity"]["standard"]["minimum_effort"] == "medium", "Antigravity effort floor")
require(platforms["grok"]["subagent_effort_override"] == "session_level_only", "Grok effort honesty")

codex_files = sorted((ROOT / "platforms/codex/profiles").glob("*.config.toml"))
require(len(codex_files) == 4, "Codex role count")
for path in codex_files:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    require(data["model"] == "gpt-5.6-terra", f"Codex model: {path.name}")
    require(data["model_reasoning_effort"] == "medium", f"Codex effort: {path.name}")

cursor_files = sorted(
    path for path in (ROOT / "platforms/cursor/agents").glob("*.md")
    if path.name.lower() != "readme.md"
)
require(len(cursor_files) == 4, "Cursor role count")
for path in cursor_files:
    text = path.read_text(encoding="utf-8")
    frontmatter = text.split("---", 2)[1]
    require(re.search(r"(?m)^name:\s*\S", frontmatter) is not None, f"Cursor name: {path.name}")
    require(re.search(r"(?m)^description:\s*.+", frontmatter) is not None, f"Cursor description: {path.name}")
    model = re.search(r'(?m)^model:\s*"?([^"\r\n]+)"?\s*$', frontmatter)
    require(model is not None, f"Cursor model: {path.name}")
    require("fast" not in model.group(1).lower(), f"Cursor Fast denied: {path.name}")
    require("auto" not in model.group(1).lower(), f"Cursor Auto denied: {path.name}")

antigravity = (ROOT / "platforms/antigravity/profiles/role-guidance.md").read_text(encoding="utf-8")
require("medium" in antigravity.lower(), "Antigravity medium floor")
require("Do not select Gemini 3.6 Flash" in antigravity, "Antigravity forbidden model")
require("not a false claim" in antigravity, "Antigravity honest capability boundary")

grok_files = sorted((ROOT / "platforms/grok/agents").glob("*.toml"))
require(len(grok_files) == 4, "Grok role count")
for path in grok_files:
    tomllib.loads(path.read_text(encoding="utf-8"))
combined_grok = "\n".join(path.read_text(encoding="utf-8") for path in grok_files)
require("grok-code-fast" not in combined_grok.lower(), "retired Grok Fast slug denied")
grok_readme = (ROOT / "platforms/grok/README-agents.md").read_text(encoding="utf-8")
require("grok-4.5" in grok_readme, "Grok base model")
require("--effort medium" in grok_readme, "Grok medium effort floor")
require("speed-variant model slug is used" in grok_readme, "Grok speed-variant denial")

print("Platform profile verification PASS")
