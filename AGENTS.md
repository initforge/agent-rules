# Agent Rules repository

Canonical architecture (real tree):

- `.github/workflows/`: CI/CD (deterministic.yml is the single required gate).
- `rules/`: global context always loaded (lean numbering).
- `skills/`: kỹ năng lazy-load theo trigger.
- `schemas/`: canonical portable artifact schemas.
- `platforms/`: adapter deltas for Codex, Grok, OpenCode, Antigravity, Cursor.
- `integrations/`: canonical integration & MCP registry (human-editable YAML; JSON generated).
- `profiles/`: optional organization profiles (e.g., 5fedu).
- `packages/cli/`: cross-platform TypeScript CLI.
- `packages/control-plane/`: local harness control plane dashboard + API.
- `evals/`: evaluation conformance, telemetry, controlled runs, outcomes, fixtures, reports.
- `docs/`: architecture, concepts, decisions, runbooks, guides, generated references.
- `generated/`: machine-generated context (never hand-edited).
- `automation/`: build, install, validate, sync guard scripts.
- `.agent/`: advisory trace/research/tombstones (gitignored).

**Clone → work (Linux/Windows, pwsh):**

```bash
cd packages/cli && npm install && npm run build
npm install --workspaces    # root workspace
./automation/run.sh 03-validate-context
./automation/run.sh 01-build-runtime
./automation/run.sh 02-install-runtime
```

Đọc `rules/manifest.yaml` và `docs/guides/00-system-map.md` trước khi sửa harness. Không sửa tay `generated/` hoặc global runtime mirrors như canonical source. Không commit, push hoặc deploy nếu chưa được yêu cầu rõ.
