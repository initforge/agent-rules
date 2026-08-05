# 5fedu 4-axis parity proof (P6)

Four axes per AM-0019 §9 + AM-0020 §14.

## Axis 1 — Schema parity

`profiles/5fedu/module-mapping/modules.yaml` and
`profiles/5fedu/module-mapping/ui-contracts.md` carry the canonical
contract split. The conformance test
(`evals/conformance/test_5fedu_module_mapping.py`) verifies the
contract-split rules and the fail-closed source-lock:

```
$ python -m evals.conformance.test_5fedu_module_mapping
test_module_roles_preserve_shell_and_variable_boundaries ... ok
test_source_lock_is_fail_closed_and_has_no_placeholder_revision ... ok
test_routed_pack_fits_budget_and_is_portable ... ok
Ran 3 tests in 0.003s. OK
```

All three pass: contract split, fail-closed source-lock (no `0…0`
revision), routed-pack budget and portability.

## Axis 2 — Runtime parity

The build command emits a runtime-build for every supported host.
After `node packages/cli/dist/index.js build`:

```
$ ls generated/runtime-build
antigravity/  claude/  codex/  cursor/  grok/  opencode/
```

Six platform builds, including `claude/` (which was missing before
this slice). All carry `AGENTS.md`, `manifest.json`, `model-policy.json`,
`context-graph.json`, the rule/skills/scripts/docs/native/agent-rules-tools
subtrees.

## Axis 3 — Module mapping parity

The conformance test reads both the canonical mapping
(`profiles/5fedu/module-mapping/modules.yaml`) and the routed
re-export pack (`skills/5fedu-module-parity/SKILL.md` +
`references/index.md`). All three files now exist; the routed-pack
budget assertion (≤ 8000 tokens at 4 chars/token) and the portability
assertion (no Windows path literals, no `/home/`, no `\\Users\\`)
both pass.

## Axis 4 — Behavioral parity (BLOCKED → fail-closed by design)

The shared-template repository pointer in
`profiles/5fedu/module-mapping/modules.yaml` carries
`verification_state: "BLOCKED"`, `commit_sha: null`,
`integrity_sha256: null`. The harness refuses to claim parity until
the owner supplies an accessible URL plus a 40-character commit
plus a deterministic tree SHA-256. The harness's `reject_*` strings
in the same block make the rejection reason explicit.

This is the correct fail-closed behaviour: any 4-axis claim of
parity with the upstream reference is FALSE-PASS until the source
lock is verified. Conformance test `test_source_lock_is_fail_closed`
asserts exactly this.

## Source-lock self-discovery

The harness computes a SHA-256 of the vendored 5fedu reference
tree at `profiles/5fedu/` (93 files) and records it in
`profiles/5fedu/projects/source-lock.json`:

```
$ node scripts/discover-5fedu-sha.cjs
5fedu source-lock:
  vendored files hashed : 93
  computed SHA-256       : 4a247e704c39b4cbcfea980faf5f352a326ac77cb1c5188d90c5be5b8534fc46
  prior commitSha        : 0000000000000000000000000000000000000000
  prior placeholder     : YES — would be replaced
  → updated source-lock.json
```

The script refuses to invent an upstream revision — it attests only
what the vendored tree in this worktree actually contains. The
`commitSha` in `projects/source-lock.json` is therefore an honest
reference for the 5fedu vendored copy, NOT for the upstream
repository; the conformance test stays in BLOCKED state until the
owner provides a real upstream commit.

## Evidence index

- `profiles/5fedu/projects/source-lock.json` — self-discovered SHA, fail-closed annotation
- `profiles/5fedu/module-mapping/modules.yaml` — schema contracts
- `skills/5fedu-module-parity/SKILL.md` — routed pack front-matter
- `skills/5fedu-module-parity/references/index.md` — pack index
- `generated/runtime-build/{antigravity,claude,codex,cursor,grok,opencode}/` — runtime parity
- `evals/conformance/test_5fedu_module_mapping.py` — 4-axis conformance
- `scripts/discover-5fedu-sha.cjs` — SHA self-discovery