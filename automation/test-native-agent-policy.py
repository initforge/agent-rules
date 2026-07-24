#!/usr/bin/env python3
"""Static contract for native roles, policy, build artifacts, and honest reporting."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROLES = {"codex": {"agent_rules_implementer.toml", "agent_rules_researcher.toml", "agent_rules_reviewer.toml", "agent_rules_verifier.toml"},
         "grok": {"agent-rules-implementer.toml", "agent-rules-researcher.toml", "agent-rules-reviewer.toml", "agent-rules-verifier.toml"},
         "cursor": {"agent-rules-implementer.md", "agent-rules-researcher.md", "agent-rules-reviewer.md", "agent-rules-verifier.md"}}
ANTIGRAVITY_ROLES = {"agent-rules-implementer", "agent-rules-researcher", "agent-rules-reviewer", "agent-rules-verifier"}
TOOLS = {"workctl.py", "workctl.ps1", "workctl.sh", "work-ledger.schema.json"}

def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def exact_files(folder: Path, expected: set[str]) -> list[Path]:
    found = {p.name for p in folder.iterdir() if p.is_file() and p.name != "README.md"}
    if found != expected:
        fail(f"{folder.relative_to(ROOT)} role set is {sorted(found)}, expected {sorted(expected)}")
    return [folder / name for name in sorted(expected)]

policy = json.loads((ROOT / "automation/model-policy.json").read_text(encoding="utf-8"))
platforms = policy["platforms"]
telemetry = policy["telemetry_contract"]
if telemetry["event_fields"] != ["session_id", "actor", "assignment_id", "tool", "tool_class", "timestamp", "outcome"]: fail("telemetry event schema drift")
selectors = [
    platforms["codex"]["standard"]["selector"], platforms["codex"]["expert"]["selector"],
    platforms["cursor"]["implementation"]["selector"], platforms["cursor"]["research_review"]["selector"],
    platforms["grok"]["base"]["selector"],
]
selector_source_roots = [ROOT / "platforms", ROOT / "automation"]
for root in selector_source_roots:
  for source in root.rglob("*"):
    if source.name.startswith("test-") or source == ROOT / "automation/model-policy.json":
        continue
    if source.is_file() and source.suffix in {".md", ".toml", ".py", ".ps1", ".sh"}:
        text = source.read_text(encoding="utf-8")
        if any(selector in text for selector in selectors): fail(f"model selector duplicated outside policy: {source.relative_to(ROOT)}")
for hook in (ROOT / "platforms/codex/scripts/skill-gate.py", ROOT / "platforms/antigravity/scripts/antigravity-skill-gate.py", ROOT / "platforms/cursor/scripts/cursor-hook.py"):
    body = hook.read_text(encoding="utf-8")
    if "telemetry-events.jsonl" not in body or "event_id" not in body or "event_ref" not in body:
        fail(f"{hook.relative_to(ROOT)} lacks retained telemetry event references")
if not {"Fast", "Auto"}.issubset(platforms["cursor"]["denied_modes"]): fail("Cursor Fast/Auto denial missing")
if "Fast" not in platforms["grok"]["denied_modes"]: fail("Grok Fast denial missing")
if {"family": "Gemini", "version": "3.6", "channel": "Flash"} not in platforms["antigravity"]["denied_models"]: fail("Gemini 3.6 Flash denial missing")

for path in exact_files(ROOT / "platforms/codex/agents", ROLES["codex"]):
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    expected = {"name", "description", "developer_instructions", "model", "model_reasoning_effort", "sandbox_mode"}
    if set(data) != expected: fail(f"{path.relative_to(ROOT)} does not match Codex native schema")
    if data["name"] != path.stem: fail(f"{path.relative_to(ROOT)} name must match native filename")
    if data["model"] != "__CODEX_STANDARD_MODEL__" or data["model_reasoning_effort"] != "__CODEX_STANDARD_EFFORT__":
        fail(f"{path.relative_to(ROOT)} must be a selector-free Codex template")

for path in exact_files(ROOT / "platforms/grok/agents", ROLES["grok"]):
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    expected = {"description", "default_capability_mode", "model", "reasoning_effort", "prompt_file", "default_isolation"}
    if set(data) != expected: fail(f"{path.relative_to(ROOT)} does not match Grok native schema")
    if data["model"] != "__GROK_BASE_MODEL__" or data["reasoning_effort"] != "__GROK_MINIMUM_EFFORT__":
        fail(f"{path.relative_to(ROOT)} must be a selector-free Grok template")
    if not (path.parent / data["prompt_file"]).is_file(): fail(f"{path.relative_to(ROOT)} prompt_file missing")

for path in exact_files(ROOT / "platforms/cursor/agents", ROLES["cursor"]):
    body = path.read_text(encoding="utf-8")
    if not body.startswith("---\n"): fail(f"{path.relative_to(ROOT)} missing Cursor frontmatter")
    frontmatter = body.split("---", 2)[1]
    fields = dict(line.split(":", 1) for line in frontmatter.splitlines() if ":" in line)
    if set(fields) != {"name", "description", "model", "readonly"}: fail(f"{path.relative_to(ROOT)} does not match Cursor native schema")
    model = fields["model"].strip().strip('"')
    expected_model = "__CURSOR_IMPLEMENTATION_MODEL__" if path.name.endswith("implementer.md") else "__CURSOR_RESEARCH_REVIEW_MODEL__"
    expected_readonly = "false" if path.name.endswith("implementer.md") else "true"
    if model != expected_model or fields["readonly"].strip() != expected_readonly:
        fail(f"{path.relative_to(ROOT)} must be a selector-free Cursor template")

antigravity_root = ROOT / "platforms/antigravity/agents"
found_antigravity = {p.name for p in antigravity_root.iterdir() if p.is_dir()}
if found_antigravity != ANTIGRAVITY_ROLES: fail(f"Antigravity role set mismatch: {sorted(found_antigravity)}")
for role in sorted(ANTIGRAVITY_ROLES):
    path = antigravity_root / role / "agent.md"
    body = path.read_text(encoding="utf-8")
    frontmatter = body.split("---", 2)[1]
    fields = dict(line.split(":", 1) for line in frontmatter.splitlines() if ":" in line)
    if set(fields) != {"name", "description", "model"} or fields["name"].strip() != role or fields["model"].strip() != "inherit":
        fail(f"{path.relative_to(ROOT)} violates Antigravity native schema")
    if "policy-denied inherited model" not in body or "medium" not in body: fail(f"{path.relative_to(ROOT)} lacks inherited policy guard")
antigravity_readme = (antigravity_root / "README.md").read_text(encoding="utf-8")
if "~/.gemini/config/agents/<role>/agent.md" not in antigravity_readme or "https://antigravity.google/docs/cli/commands/agents" not in antigravity_readme:
    fail("Antigravity official discovery location/schema citation missing")

installer = (ROOT / "automation/02-install-runtime.ps1").read_text(encoding="utf-8")
first_call, declaration = installer.index("Sync-OwnedFiles -Source"), installer.index("function Sync-OwnedFiles")
if declaration > first_call or installer.count("function Sync-OwnedFiles") != 1: fail("Sync-OwnedFiles declaration/order invalid")
for mapping in ('"codex" { Sync-OwnedFiles -Source (Join-Path $Native "agents")', '"cursor" { Sync-OwnedFiles -Source (Join-Path $Native "agents")', '"grok" {', 'Join-Path $Native "personas"', 'Sync-OwnedFiles -Source (Join-Path $Native "agents") -Destination (Join-Path $Dest "agents")', 'Remove-PreviouslyOwnedFiles -Destination (Join-Path $Dest "agent-rules-instructions")'):
    if mapping not in installer: fail(f"installer native mapping missing: {mapping}")

def ps_quote(path: Path) -> str:
    return "'" + str(path).replace("'", "''") + "'"

def run_sync_safety_tests() -> None:
    shell = shutil.which("pwsh") or shutil.which("powershell")
    if not shell: fail("PowerShell unavailable for isolated Sync-OwnedFiles safety tests")
    start, end = installer.index("# BEGIN SYNC-OWNED-FILES"), installer.index("# END SYNC-OWNED-FILES")
    function = installer[start:end]
    remove_start, remove_end = installer.index("# BEGIN REMOVE-PREVIOUSLY-OWNED-FILES"), installer.index("# END REMOVE-PREVIOUSLY-OWNED-FILES")
    remove_function = installer[remove_start:remove_end]
    with tempfile.TemporaryDirectory(prefix="agent-rules-sync-") as raw:
        temp = Path(raw)
        source, destination = temp / "source", temp / "agents"
        source.mkdir(); destination.mkdir()
        (source / "implementer.toml").write_text("harness", encoding="utf-8")
        (source / "verifier.toml").write_text("harness", encoding="utf-8")
        unrelated = destination / "user-agent.toml"
        unrelated.write_text("user", encoding="utf-8")
        manifest = temp / "owned.json"
        command = function + f"\n$ErrorActionPreference='Stop'; try {{ Sync-OwnedFiles -Source {ps_quote(source)} -Destination {ps_quote(destination)} -OwnershipManifest {ps_quote(manifest)}; exit 0 }} catch {{ exit 17 }}"
        if subprocess.run([shell, "-NoProfile", "-Command", command], capture_output=True, text=True).returncode != 0:
            fail("Sync-OwnedFiles safe first install failed")
        if unrelated.read_text(encoding="utf-8") != "user": fail("Sync-OwnedFiles modified unrelated agent")
        (source / "implementer.toml").write_text("harness-v2", encoding="utf-8")
        if subprocess.run([shell, "-NoProfile", "-Command", command], capture_output=True, text=True).returncode != 0:
            fail("Sync-OwnedFiles failed to parse/update a multi-item ownership manifest")
        if (destination / "implementer.toml").read_text(encoding="utf-8") != "harness-v2": fail("Sync-OwnedFiles multi-item update drift")

        single_source, single_destination, single_manifest = temp / "single-source", temp / "single-agents", temp / "single-owned.json"
        single_source.mkdir(); single_destination.mkdir()
        (single_source / "agent.toml").write_text("one", encoding="utf-8")
        single_command = function + f"\n$ErrorActionPreference='Stop'; try {{ Sync-OwnedFiles -Source {ps_quote(single_source)} -Destination {ps_quote(single_destination)} -OwnershipManifest {ps_quote(single_manifest)}; exit 0 }} catch {{ exit 17 }}"
        if subprocess.run([shell, "-NoProfile", "-Command", single_command], capture_output=True, text=True).returncode != 0:
            fail("Sync-OwnedFiles single-item first install failed")
        (single_source / "agent.toml").write_text("two", encoding="utf-8")
        if subprocess.run([shell, "-NoProfile", "-Command", single_command], capture_output=True, text=True).returncode != 0:
            fail("Sync-OwnedFiles failed to parse/update a single-item ownership manifest")

        collision_source, collision_destination = temp / "collision-source", temp / "collision-agents"
        collision_source.mkdir(); collision_destination.mkdir()
        (collision_source / "implementer.toml").write_text("harness", encoding="utf-8")
        collision = collision_destination / "implementer.toml"
        collision.write_text("user", encoding="utf-8")
        command = function + f"\n$ErrorActionPreference='Stop'; try {{ Sync-OwnedFiles -Source {ps_quote(collision_source)} -Destination {ps_quote(collision_destination)} -OwnershipManifest {ps_quote(temp / 'collision-owned.json')}; exit 0 }} catch {{ exit 17 }}"
        if subprocess.run([shell, "-NoProfile", "-Command", command], capture_output=True, text=True).returncode == 0:
            fail("Sync-OwnedFiles accepted an unowned first-install collision")
        if collision.read_text(encoding="utf-8") != "user": fail("Sync-OwnedFiles overwrote unowned collision")

        malicious_destination = temp / "malicious-agents"
        malicious_destination.mkdir()
        sentinel = temp / "sentinel.txt"
        sentinel.write_text("outside", encoding="utf-8")
        malicious_manifest = temp / "malicious-owned.json"
        malicious_manifest.write_text('["../sentinel.txt"]', encoding="utf-8")
        command = function + f"\n$ErrorActionPreference='Stop'; try {{ Sync-OwnedFiles -Source {ps_quote(source)} -Destination {ps_quote(malicious_destination)} -OwnershipManifest {ps_quote(malicious_manifest)}; exit 0 }} catch {{ exit 17 }}"
        if subprocess.run([shell, "-NoProfile", "-Command", command], capture_output=True, text=True).returncode == 0:
            fail("Sync-OwnedFiles accepted traversal in ownership manifest")
        if sentinel.read_text(encoding="utf-8") != "outside": fail("Sync-OwnedFiles touched outside sentinel")

        legacy_destination = temp / "legacy-instructions"
        legacy_destination.mkdir()
        legacy_owned, legacy_unowned = legacy_destination / "role-guidance.md", legacy_destination / "user-note.md"
        legacy_owned.write_text("old harness", encoding="utf-8"); legacy_unowned.write_text("user", encoding="utf-8")
        legacy_manifest = temp / "legacy-owned.json"
        legacy_manifest.write_text('["role-guidance.md"]', encoding="utf-8")
        command = remove_function + f"\n$ErrorActionPreference='Stop'; try {{ Remove-PreviouslyOwnedFiles -Destination {ps_quote(legacy_destination)} -OwnershipManifest {ps_quote(legacy_manifest)}; exit 0 }} catch {{ [Console]::Error.WriteLine($_.Exception.Message); exit 17 }}"
        result = subprocess.run([shell, "-NoProfile", "-Command", command], capture_output=True, text=True)
        if result.returncode != 0:
            fail(f"legacy ownership migration failed: {result.stderr.strip() or result.stdout.strip()}")
        if legacy_owned.exists() or not legacy_unowned.exists() or legacy_manifest.exists():
            fail("legacy migration did not remove only harness-owned guidance")
        malicious_legacy = temp / "malicious-legacy"
        malicious_legacy.mkdir()
        malicious_legacy_manifest = temp / "malicious-legacy-owned.json"
        malicious_legacy_manifest.write_text('["../sentinel.txt"]', encoding="utf-8")
        command = remove_function + f"\n$ErrorActionPreference='Stop'; try {{ Remove-PreviouslyOwnedFiles -Destination {ps_quote(malicious_legacy)} -OwnershipManifest {ps_quote(malicious_legacy_manifest)}; exit 0 }} catch {{ exit 17 }}"
        if subprocess.run([shell, "-NoProfile", "-Command", command], capture_output=True, text=True).returncode == 0:
            fail("legacy migration accepted traversal in ownership manifest")
        if sentinel.read_text(encoding="utf-8") != "outside": fail("legacy migration touched outside sentinel")

run_sync_safety_tests()

readmes = {
    "codex": (ROOT / "platforms/codex/agents/README.md", "$CODEX_HOME/agents/"),
    "cursor": (ROOT / "platforms/cursor/agents/README.md", "~/.cursor/agents/"),
    "grok": (ROOT / "platforms/grok/README-agents.md", "$GROK_HOME/agents/"),
}
for platform, (path, discovery) in readmes.items():
    if discovery not in path.read_text(encoding="utf-8"): fail(f"{platform} native discovery location missing")

cli_state = []
for platform, command in (("codex", "codex"), ("cursor", "cursor"), ("grok", "grok"), ("antigravity", "gemini")):
    availability = "PRESENT_UNOBSERVED" if shutil.which(command) else "UNAVAILABLE_UNOBSERVED"
    cli_state.append(f"{platform}={availability}")
print("native CLI validation " + ", ".join(cli_state))

def run_isolated_install_test() -> None:
    shell = shutil.which("pwsh") or shutil.which("powershell")
    if not shell: fail("PowerShell unavailable for isolated installer regression")
    with tempfile.TemporaryDirectory(prefix="agent-rules-install-") as raw:
        temp = Path(raw)
        user_home, codex_home, grok_home = temp / "user", temp / "codex", temp / "grok"
        user_home.mkdir()
        env = os.environ.copy()
        env.update({
            "USERPROFILE": str(user_home), "HOME": str(user_home),
            "CODEX_HOME": str(codex_home), "GROK_HOME": str(grok_home),
            "AGENT_RULES_SKIP_RUNTIME_HOOKS": "1",
            "AGENT_RULES_SKIP_INTEGRATION_INSTALL": "1",
            "AGENT_RULES_SKIP_INTEGRATION_VERIFY": "1",
        })
        command = [shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ROOT / "automation/02-install-runtime.ps1"), "-Platform", "all"]
        result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=180)
        output = result.stdout + "\n" + result.stderr
        if result.returncode != 0: fail(f"isolated installer/doctor returned {result.returncode}: {output[-3000:]}")
        if "Get-FileHash" in output and ("Cannot bind" in output or "does not exist" in output):
            fail(f"isolated installer doctor crashed in native hashing: {output[-1200:]}")
        for status in ("NATIVE_CAPABLE", "MODEL_POLICY_MATCH", "ORCHESTRATION_CAPABLE"):
            if output.count(status) < 4: fail(f"isolated installer doctor did not report {status} for all platforms (count={output.count(status)}): {output[-2400:]}")
        expected = (
            codex_home / "agents/agent_rules_implementer.toml",
            user_home / ".cursor/agents/agent-rules-implementer.md",
            grok_home / "agents/agent-rules-implementer.toml",
            user_home / ".gemini/config/agents/agent-rules-implementer/agent.md",
        )
        if not all(path.is_file() for path in expected): fail("isolated installer native destination mapping incomplete")
    print("isolated full installer/doctor structural regression PASS")

if "--isolated-install" in sys.argv:
    run_isolated_install_test()

doctor = (ROOT / "automation/09-doctor.ps1").read_text(encoding="utf-8")
if "ORCHESTRATION_PASS" in doctor or "MODEL_POLICY_PASS" in doctor or 'Write-Host "Doctor PASS"' in doctor: fail("doctor has a false generic PASS")
for status in ("INSTALL_PASS", "NATIVE_CAPABLE", "NATIVE_PARTIAL", "NATIVE_UNVERIFIED", "HOOK_UNVERIFIED", "ORCHESTRATION_CAPABLE", "ORCHESTRATION_PARTIAL", "MODEL_POLICY_MATCH", "MODEL_POLICY_DRIFT", "MODEL_POLICY_MISSING", "Doctor layered summary"):
    if status not in doctor: fail(f"doctor layered status missing: {status}")

if "--build" in sys.argv:
    source_sets = {
        "codex": [(ROOT / "platforms/codex/agents", "agents", ROLES["codex"])],
        "cursor": [(ROOT / "platforms/cursor/agents", "agents", ROLES["cursor"])],
        "grok": [(ROOT / "platforms/grok/agents", "agents", None), (ROOT / "platforms/grok/personas", "personas", None)],
        "antigravity": [(ROOT / "platforms/antigravity/agents", "agents", {"agent.md"})],
    }
    for platform, groups in source_sets.items():
        build = ROOT / "05-generated/runtime-build" / platform
        if not build.is_dir(): fail(f"missing build for {platform}; run 01-build-runtime.ps1 first")
        if platform == "antigravity" and (build / "native/instructions").exists(): fail("Antigravity build retained stale inert guidance")
        if sha(build / "model-policy.json") != sha(ROOT / "automation/model-policy.json"): fail(f"{platform} model policy hash drift")
        if {p.name for p in (build / "agent-rules-tools").iterdir() if p.is_file()} != TOOLS: fail(f"{platform} workctl bundle mismatch")
        manifest = {item["Path"]: item["Sha256"] for item in json.loads((build / "manifest.json").read_text(encoding="utf-8-sig"))["files"]}
        for relative in {"model-policy.json", *(f"agent-rules-tools/{name}" for name in TOOLS)}:
            if manifest.get(relative) != sha(build / relative): fail(f"{platform} manifest hash missing/drift: {relative}")
        for source, destination, names in groups:
            expected_paths = [p for p in source.rglob("*") if p.is_file() and (names is None or p.name in names)]
            for source_file in expected_paths:
                relative = source_file.relative_to(source)
                target = build / "native" / destination / relative
                if not target.is_file(): fail(f"{platform} native build missing: {destination}/{relative}")
                if platform != "antigravity" and "__" in target.read_text(encoding="utf-8"):
                    fail(f"{platform} native build retained a policy template token: {destination}/{relative}")
                manifest_path = f"native/{destination}/{relative.as_posix()}"
                if manifest.get(manifest_path) != sha(target): fail(f"{platform} manifest hash missing/drift: {manifest_path}")
        if platform == "codex":
            rendered = tomllib.loads((build / "native/agents/agent_rules_implementer.toml").read_text(encoding="utf-8"))
            if rendered["model"] != platforms["codex"]["standard"]["selector"]: fail("Codex policy selector did not render")
        if platform == "cursor":
            rendered = (build / "native/agents/agent-rules-implementer.md").read_text(encoding="utf-8")
            if f"model: {platforms['cursor']['implementation']['selector']}" not in rendered: fail("Cursor policy selector did not render")
        if platform == "grok":
            rendered = tomllib.loads((build / "native/agents/agent-rules-implementer.toml").read_text(encoding="utf-8"))
            if rendered["model"] != platforms["grok"]["base"]["selector"]: fail("Grok policy selector did not render")
print("native agent policy PASS")
