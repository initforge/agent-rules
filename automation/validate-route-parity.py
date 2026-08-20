#!/usr/bin/env python3
"""Run the typed route shadow corpus against TypeScript and Python routers."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import jsonschema
except ImportError:
    jsonschema = None

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "automation" / "route-parity-cases.json"
SCHEMA = ROOT / "schemas" / "route-parity-case.schema.json"
sys.path.insert(0, str(ROOT / "platforms" / "shared" / "scripts"))
import context_router  # noqa: E402


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"invalid JSON {path.relative_to(ROOT)}: {exc}")


def main() -> None:
    corpus = load(CORPUS)
    schema = load(SCHEMA)
    cases = corpus.get("cases")
    if corpus.get("version") != 1 or not isinstance(cases, list) or len(cases) < 12:
        fail("route parity corpus must be version 1 with at least 12 cases")
    if jsonschema:
        for case in cases:
            try:
                jsonschema.Draft202012Validator(schema).validate(case)
            except jsonschema.ValidationError as exc:
                fail(f"{case.get('id')}: schema error: {exc.message}")
    ids = [case.get("id") for case in cases]
    if len(ids) != len(set(ids)):
        fail("route parity case ids must be unique")

    graph = context_router.load_graph(ROOT / "generated" / "context-graph.json")
    with tempfile.TemporaryDirectory(prefix="route-parity-") as temp:
        temp_root = Path(temp)
        python_results = []
        for case in cases:
            workspace = temp_root / case["id"]
            workspace.mkdir(parents=True)
            if case["workspace"]["activation"] == "5fedu-marker":
                marker = workspace / ".agent" / "profiles" / "5fedu.enabled"
                marker.parent.mkdir(parents=True)
                marker.write_text("active\n", encoding="utf-8")
            decision = context_router.route(case["prompt"], [workspace], graph)
            python_results.append({"id": case["id"], "primary": decision.get("primary"), "stack": decision.get("stack", [])})

        node_script = r'''
import fs from 'node:fs';
import { routeSkills } from './packages/kernel/dist/northstar/routing.js';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const packet = (goal) => ({ goal, constraints: [], context: { references: [], entrypoints: [], symbols: [] }, scope: { owned: [], forbidden: [] }, skills: [] });
const output = input.cases.map((item) => {
  const routes = routeSkills(packet(item.prompt), input.root, { activeProjectScope: item.activeProjectScope ?? null });
  return { id: item.id, primary: routes[0]?.id ?? null, stack: routes.map((route) => route.id) };
});
process.stdout.write(JSON.stringify(output));
'''
        node_input = {"root": str(ROOT), "cases": [{"id": case["id"], "prompt": case["prompt"], "activeProjectScope": "5fedu" if case["workspace"]["activation"] == "5fedu-marker" else None} for case in cases]}
        result = subprocess.run(["node", "--input-type=module", "-e", node_script], cwd=ROOT, input=json.dumps(node_input), text=True, capture_output=True)
        if result.returncode != 0:
            fail(f"TypeScript route runner failed: {result.stderr.strip()}")
        try:
            typescript_results = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            fail(f"TypeScript route runner returned invalid JSON: {exc}")

    by_python = {item["id"]: item for item in python_results}
    by_typescript = {item["id"]: item for item in typescript_results}
    failures = []
    for case in cases:
        expected = case["expected"]
        py = by_python[case["id"]]
        ts = by_typescript.get(case["id"])
        if ts is None:
            failures.append(f"{case['id']}: missing TypeScript result")
            continue
        if py["primary"] != ts["primary"] or py["stack"] != ts["stack"]:
            failures.append(f"{case['id']}: Python={py} TypeScript={ts}")
        if expected["primary"] != ts["primary"] or expected["stack"] != ts["stack"]:
            failures.append(f"{case['id']}: expected primary/stack={expected['primary']}/{expected['stack']} got {ts['primary']}/{ts['stack']}")
    if failures:
        fail("; ".join(failures))
    print(json.dumps({"status": "PASS", "cases": len(cases), "routers": ["typescript-kernel", "python-host-adapter"], "shared_primary_and_stack": True}))


if __name__ == "__main__":
    main()
