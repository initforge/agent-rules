# Current Repository Inventory and Ownership Map

**Generated:** 2026-07-25  
**Canonical SHA:** (commit after drift cleanup + inventory update)  
**Source:** Machine-readable equivalent at `automation/repository-inventory.json`

---

## 1. Top-Level Directory Map

```
agent-rules/
├── .github/          CI/CD workflows (GitHub Actions)
├── .opencode/        OpenCode agent configuration (local)
├── .agent/           Advisory trace, research, tombstones (gitignored)
├── generated/     Build output — DO NOT EDIT
├── AGENTS.md         Repository entry point for agent sessions
├── README.md         English landing page
├── README-vi.md      Vietnamese landing page
├── automation/       Build, install, validate, sync, doctor scripts
├── docs/guides/           Maintainer documentation
├── integrations/     Required/recommended/optional tool registry + MCP schemas
├── platforms/        Per-runtime overlays + platform contracts
├── profiles/5fedu/projects/         5fedu template pack + known repos registry
├── rules/            Always-loaded global context (numbered)
└── skills/           Lazy-loaded capabilities (flat slugs)
```

---

## 2. Directory Inventory

### 2.1 `.github/`

| Item | Type | Owner | Status |
|------|------|-------|--------|
| `.github/workflows/quality.yml` | workflow | harness-maintainer | active (required gate) |
| `.github/workflows/certification.yml` | workflow | harness-maintainer | native-only advisory |

**Consumers:** GitHub Actions  
**Purpose:** Validates context, builds runtime, verifies mirrors on push/PR.

---

### 2.2 `rules/` — Public Core (Always-Loaded)

**Manifest:** `rules/manifest.yaml`  
**Status:** Active  
**Owner:** harness-maintainer  
**Load Order:** Defined in `manifest.yaml`

| File | Load Order | Type |
|------|-----------|------|
| `manifest.yaml` | — | Config (load order + budgets) |
| `README.md` | — | Documentation |
| `00-bootstrap.md` | 1 | Core rule |
| `05-critical-thinking.md` | 2 | Core rule |
| `10-execution.md` | 3 | Core rule |
| `15-output-economy.md` | 4 | Core rule |
| `16-context-style.md` | Lazy | Core rule (boundary) |
| `20-quality-and-safety.md` | 5 | Core rule |
| `25-task-lifecycle.md` | 6 | Core rule |
| `30-context-routing.md` | 7 | Core rule |
| `40-harness-governance.md` | Lazy | Core rule (boundary) |
| `41-harness-maintainer.md` | Lazy | Core rule (boundary) |
| `50-context-budget.md` | Lazy | Core rule (budget policy) |

**13 files total, 7 always-load + 4 lazy + 2 metadata.**

---

### 2.3 `skills/` — Public Core (Lazy-Loaded Capabilities)

**Status:** Active  
**Owner:** harness-maintainer (except where noted)  
**Total:** 15 skills, 34 files

| Skill Slug | Supporting Files | Owner Notes |
|-----------|-----------------|-------------|
| `5fedu-module-parity` | SKILL.md, agents/openai.yaml | 5fedu-specific |
| `5fedu-project` | SKILL.md, scripts/, references/, agents/openai.yaml | 5fedu-specific |
| `best-of-n` | SKILL.md | — |
| `browser-qa` | SKILL.md, 2 references | — |
| `clean-code` | SKILL.md, 1 reference | — |
| `code-review` | SKILL.md | Disabled model invocation |
| `context-evolution-protocol` | SKILL.md | — |
| `docs-style` | SKILL.md, 1 reference, agents/openai.yaml | — |
| `finish-to-completion` | SKILL.md, 2 references | — |
| `frontend-architect` | SKILL.md | — |
| `implementation-discovery` | SKILL.md | — |
| `master-image-generation` | SKILL.md | — |
| `plan-and-handoff` | SKILL.md, 6 references | Largest skill |
| `qa-skills` | SKILL.md, 1 reference | Upstream: petrkindlmann/qa-skills |
| `researcher` | SKILL.md, 1 reference, agents/openai.yaml | — |

---

### 2.4 `platforms/` — Runtime Adapter

**Status:** Active  
**Owner:** harness-maintainer  
**Contract:** `platform-contracts.json` (canonical)

| Platform | Install Home | MCP Format | Agent Format |
|----------|-------------|------------|--------------|
| **codex** | `$CODEX_HOME / ~/.codex` | TOML (`mcp_servers`) | TOML |
| **grok** | `$GROK_HOME / ~/.grok` | JSON (`mcpServers`) | TOML + prompts |
| **antigravity** | `~/.gemini/config` | JSON (`mcpServers`) | agent.md (per-agent dir) |
| **cursor** | `~/.cursor` | JSON (`mcpServers`) | Markdown (frontmatter) |

**Shared scripts:** `platforms/shared/scripts/context-router.py` (canonical routing engine), `context_router.py` (import wrapper).

---

### 2.5 `automation/` — Mixed (Builder, Installer, Validator, Tester, Auditor)

**Status:** Active  
**Owner:** harness-maintainer  
**Total:** 67 source files

**Pipeline scripts (numbered, ordered):**

| Script | Purpose | Category |
|--------|---------|----------|
| `01-build-runtime.ps1` | Validate contracts, build runtime | builder |
| `02-install-runtime.ps1` | Install to platform homes | installer |
| `03-validate-context.ps1` | Cross-cutting context validation | validator |
| `04-verify-mirrors.ps1` | Cross-platform hash parity | validator |
| `05-verify-runtime-state.ps1` | Post-install state check | validator |
| `06-export-runtime-state.ps1` | Debug state export | utility |
| `07-import-reviewed-changes.ps1` | Import external changes | auditor |
| `08-install-5fedu-context.ps1` | Install 5fedu template | installer |
| `09-doctor.ps1` | Post-install health check | auditor |
| `10-audit-harness-health.ps1` | Full harness audit | auditor |
| `11-install-runtime-hooks.sh` | Install native hooks | installer |
| `12-regression-harness-guards.ps1` | Regression guard checks | validator |
| `13-cutover-context-routing.ps1` | Strict routing cutover | validator |

**Duplicate prefix anomaly:** Three scripts share `10-` prefix: `10-audit-harness-health.ps1`, `10-export-5fedu-writeback.ps1`, `10-sync-project-agents.ps1`.

**Test files (9):** `test-workctl.py`, `test-native-agent-policy.py`, `test-platform-contracts.py`, `test-context-router.py`, `test-model-policy.py`, `test-agent-quality-benchmark.py`, `test-skill-gate-stack.py`, `test-live-agent-adapter.py`, `test-external-receipt.py`.

---

### 2.6 `profiles/5fedu/projects/` — Project-Specific Context

**Status:** Active  
**Owner:** 5fedu-maintainer  
**Templates:** `5fedu/` (full template pack), `context-template/` (thin pointer)

**5fedu template structure:**
```
profiles/5fedu/projects/
├── AGENTS.md                    Entry point
├── 00-context-map.md           Central router
├── decisions.md                Generic decisions
├── open-questions.md           Pre-authorized questions
├── sync-flow.md                Context sync rules
├── project-local/              Never overwritten by installer
├── domains/                    Domain-specific content (7 files + 2 references)
├── evidence/                   Archival (not auto-loaded, 5 files)
└── archive/nostime/            Nostime-specific overlay (5 files)
```

---

### 2.7 `integrations/` — Integration Registry

**Status:** Active  
**Owner:** harness-maintainer  
**Registry:** `integrations/registry.json`

| Integration | Policy | Hosts |
|------------|--------|-------|
| codebase-memory-mcp | required | codex, grok, antigravity, cursor |
| context7 | recommended | codex, grok, antigravity, cursor |
| playwright-mcp | recommended | codex, grok, antigravity, cursor |
| chrome-devtools-mcp | recommended | codex, grok, antigravity, cursor |
| caveman | optional | (none) |

---

### 2.8 `mcps/` — Removed (consolidated into `integrations/`)

**Status:** Removed
**Note:** MCP tool schemas previously under `mcps/` have been consolidated into corresponding `integrations/<policy>/<id>/` directories. Generated manifests are now at `generated/integrations/<id>/schema-manifest.json`. See section 2.7.

---

### 2.9 `docs/guides/` — Maintainer Documentation

**Status:** Active  
**Owner:** harness-maintainer  
**9 files:** `README.md`, `00-system-map.md` through `06-platform-capability.md`.

Written mostly in Vietnamese. Not rules — documentation for human maintainers.

---

### 2.10 `generated/` — Build Output

**Status:** Generated (DO NOT EDIT)  
**Canonical Source:** `automation/01-build-runtime.ps1` building from `rules/`, `skills/`, `platforms/`, `docs/guides/`, `automation/model-policy.json`

| Path | Description |
|------|-------------|
| `context-graph.json` | Compiled context graph (219 KB) |
| `runtime-build/codex/` | Codex platform build (74 files) |
| `runtime-build/grok/` | Grok platform build (78 files) |
| `runtime-build/antigravity/` | Antigravity platform build (73 files) |
| `runtime-build/cursor/` | Cursor platform build (74 files) |

---

### 2.11 `.agent/` — Advisory Trace (gitignored)

**Status:** Gitignored  
**Owner:** Agent sessions  
**Contents:** Trace logs, research notes, benchmark results, tombstones, work ledgers, release verification artifacts (~1,469 files, 9.3 MB)

---

## 3. Findings

### 3.1 Duplicate Names and Identifiers

| Severity | Finding | Recommendation |
|----------|---------|----------------|
| **Medium** **RESOLVED** | `integrations/required/codebase-memory-mcp/` conflicted with an older `mcps/codebase_memory/` duplicate | Removed `mcps/codebase_memory/`; canonical identity is `integrations/required/codebase-memory-mcp/` |
| Low **RESOLVED** | Three scripts shared `10-` prefix in `automation/` | Renumbered: `10-export-5fedu-writeback` → `14-`, `10-sync-project-agents` → `15-` |

### 3.2 Stale Path References

| Severity | Finding | Status |
|----------|---------|--------|
| Low | `build-context-graph.ps1` previously referenced `runtime.yaml` | **Resolved** in b3b6bdd |
| Low | `platforms/*/runtime.yaml` were stale artifacts | **Resolved** in b3b6bdd |
| Low | `README.md` and `README-vi.md` referenced `platforms/*/runtime.yaml` | **Resolved** in current commit |

### 3.3 Unclear Owner

| Severity | Finding | Paths |
|----------|---------|-------|
| Low | `skills/qa-skills` references upstream but has no sync mechanism | `skills/qa-skills/SKILL.md` |

### 3.4 Generated Files from Unknown Sources

| Severity | Finding | Paths |
|----------|---------|-------|
| Low | `__pycache__/` directories contain compiled bytecode; source files exist for most but `plan_guard` has no `.py` source | `platforms/*/scripts/__pycache__/`, `platforms/shared/scripts/__pycache__/` |

### 3.5 Script Numbering Anomalies

| Finding | Detail |
|---------|--------|
| Three scripts with `10-` prefix | `10-audit-harness-health.ps1`, `10-export-5fedu-writeback.ps1`, `10-sync-project-agents.ps1` |
| Non-pipeline scripts with numbers | `06`, `07`, `08` exist but are not in a defined pipeline sequence |

### 3.6 Dead or Deprecated Scripts

| Script | Status | Recommendation |
|--------|--------|----------------|
| `automation/migrate-nostime-project-local.ps1` | Deprecated (one-time) | Archive or remove |
| `automation/migrate-tahapp-project-local.ps1` | Deprecated (one-time) | Archive or remove |
| `automation/fixtures/` | Empty directory | Remove or populate |

### 3.7 Orphan Files (No Manifest/Build Reference)

| Finding | Paths |
|---------|-------|
| `mcps/` has been removed; MCP tool JSONs are now under `integrations/<policy>/<id>/` and referenced by registry | — |

### 3.8 Multiple Sources of Truth

| Finding | Detail |
|---------|--------|
| `docs/guides/02-knowledge-system.md` describes budget rules | Canonical budget is in `rules/manifest.yaml` (guides are advisory) |

---

## 4. Ownership Summary

| Owner | Directories |
|-------|-------------|
| **harness-maintainer** | `rules/`, `skills/` (11 of 15), `automation/`, `platforms/`, `integrations/`, `docs/guides/`, `.github/`, `generated/`, root files |
| **5fedu-maintainer** | `skills/5fedu-*`, `profiles/5fedu/projects/` |
| **agent-sessions** | `.agent/` |
| **agent-user** | `.opencode/` |
| **unknown** | `platforms/*/scripts/__pycache__/plan_guard` compiled cache |

---

## 5. Classification Distribution

| Classification | Count (approx) |
|---------------|----------------|
| Public core (rules + skills) | ~48 files |
| Documentation | ~12 files |
| Builder/Installer | ~6 files |
| Validator | ~9 files |
| Tester | ~9 files |
| Auditor | ~9 files |
| Schema | ~7 files |
| Config | ~6 files |
| Utility | ~9 files |
| Benchmark | ~8 files |
| Organization-specific profile | ~4 files |
| Migration (deprecated) | ~2 files |
| Generated output | ~299 files |
| Advisory/Archive (gitignored) | ~1,469 files |
| Empty (fixtures/) | 1 directory |

---

## 6. Verification

- All files tracked by git are covered by directory-level rules above.
- `rules/manifest.yaml` references resolve to existing files.
- `generated/` files identify canonical sources (build script + inputs).
- All 4 platform folders and their install targets are represented.
- `automation/repository-inventory.json` parses as valid JSON.
- This markdown document agrees with the JSON inventory.

---

## 7. Recommended Cleanup Order

1. **Archive migration scripts**: Remove or archive the two one-time migration scripts
2. **Remove or populate `automation/fixtures/`**: Empty directory cleanup
3. **Add sync mechanism for `qa-skills`**: If upstream changes need tracking
4. **Investigate `plan_guard` orphan**: Find or remove the orphaned compiled cache

**Resolved:** `mcps/` consolidated into `integrations/`, `10-` script renumbering, stale `runtime.yaml` references in READMEs.
