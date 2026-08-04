# Agent Rules

**Luận đề:** Một harness canonical duy nhất cho AI agents — tổ chức thư mục phẳng theo vai trò, lazy skills, platform delta, và automation đồng bộ runtime mirror không cần sửa generated output bằng tay.

## Kiến trúc

| Subsystem | Trạng thái | Đường dẫn |
|-----------|-----------|-----------|
| Intent Compiler (P3) | OPERATIONAL | `packages/cli/src/compiler/` |
| Canonical Contracts (P4) | VERIFIED | `packages/engine/src/contracts.ts` |
| Plan Lifecycle (P5) | OPERATIONAL | `packages/engine/src/plan-lifecycle.ts` |
| **Evaluation & Telemetry (P7)** | **PARTIAL** | `packages/engine/src/telemetry.ts` |
| Orchestration Runtime (P8) | VERIFIED | `packages/engine/src/controller.ts` |

### P7 Telemetry

`packages/engine/src/telemetry.ts` — Bộ thu thập sự kiện canonical. Ghi lại các sự kiện có cấu trúc (`run_start`, `agent_start`, `task_start`, `tool_call`, `model_turn`, `verification`, `review`, `handoff`, `run_end`) trong toàn bộ vòng đời agent. Hỗ trợ lưu trữ JSONL cục bộ và xuất OTLP. Có thể cấu hình thời gian lưu giữ (mặc định 30 ngày cho metadata, 7 ngày cho raw content).

## Cấu trúc

| Thư mục | Vai trò | Phân loại |
|---------|---------|-----------|
| `docs/guides/` | Tài liệu maintainer và system map | stable (human-maintained) |
| `rules/` | Always-loaded global context (đánh số = thứ tự nạp) | stable |
| `skills/` | Lazy-loaded capabilities (flat slugs) | stable |
| `integrations/` | Required / optional tools | stable |
| `profiles/` | Optional organization profiles (e.g., `5fedu`) | stable |
| `platforms/` | Per-runtime overlays (Codex, Grok, Antigravity, Cursor) | stable |
| `automation/` | Build, install, validate, sync, doctor | stable |
| `generated/` | Build output — không sửa tay | generated (machine-only) |
| `.agent/` | Plan ledger, progress, journal, research bền vững (có trong git; xem [`.agent/README.md`](.agent/README.md)) | protocol-governed |

## Tích hợp

Canonical registry: `integrations/registry.json` (v2, 4 mục):

| Tích hợp | Chính sách | Khả năng | Trust |
|----------|-----------|----------|-------|
| codebase-memory-mcp | bắt buộc | codebase-intelligence | adapter-verified |
| playwright-mcp | bắt buộc | browser-interaction | adapter-verified |
| chrome-devtools-mcp | bắt buộc | browser-diagnostics | adapter-verified |
| context7 | bắt buộc | research-context | adapter-verified |

Hồ sơ: `core` (codebase-memory-mcp + context7), `qa` và `frontend` (playwright-mcp + chrome-devtools-mcp), `research` (context7).

Cả bốn đều cài qua `npx` hoặc binary đã pin, và được `automation/validate-tool-registry.ps1` kiểm tra.

## Chạy nhanh

```bash
cd packages/cli && npm ci && npm run build
npm run test
```

Chạy engine tests:

```bash
cd packages/engine && npx vitest run
```

Chạy conformance evals:

```bash
cd evals/conformance && python -m pytest
```

## CI/CD

| Workflow | Kích hoạt | Ma trận | Các bước |
|----------|-----------|---------|----------|
| Quality (`quality.yml`) | push, pull_request | ubuntu, windows, macos | build → check → test → ci:quality |
| Certification (`certification.yml`) | push to main, release | opencode, grok, codex | build → ci:certify --host |

## Đọc tiếp

1. [System map](docs/guides/00-system-map.md)
2. [Runtime model](docs/guides/01-runtime-model.md)
3. [Target operating model](docs/architecture/target-operating-model.md)
4. [Platform capability matrix](docs/guides/06-platform-capability.md)
5. English overview: [README.md](README.md)

**Governance:** Chỉ sửa `rules/` và `skills/` tại đây — không sửa `generated/` hoặc installed mirrors. Reverse sync qua `automation/07-import-reviewed-changes.ps1`.
