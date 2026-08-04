# OPENCODE CONTEXT SCAFFOLD — M8 → M9.5 → M10

Trả lời bằng tiếng Việt. Đây là bước scaffold read-only, không phải bước
implementation.

## Mục đích

Nạp đúng trạng thái Harness v3 hiện tại vào một phiên OpenCode mới. Không
restart từ zero, không tin worker summary hoặc `CERTIFIED_READY_FOR_REVIEW`
trước đây nếu filesystem/evidence hiện tại không xác nhận.

## Canonical source

- Repository: `/home/linhnx/Projects/agent-rules`
- Canonical `.agent`: `/home/linhnx/Projects/agent-rules/.agent`
- Active integration worktree:
  `/home/linhnx/Projects/agent-rules-supervisor-wave`
- Active integration branch: `integration/harness-v3-certified`
- Active integration baseline: `8631ff31bac48ac357a569e2a72c234c6f9ec232`
- Plan ID: `agent-rules-harness-v3-rearchitecture-20260726-r1`

## Immutable artifact hashes

Verify bằng `sha256sum` trước mọi source mutation:

| Artifact | SHA-256 |
|---|---|
| `original.md` | `c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31` |
| AM-0012 | `2147aa9631fab0aab10a1e81b7339ba1b1b420d57080d2ef99bf2a88674b41a2` |
| AM-0013 | `a8989935c5e0b188b42279b19b167ffad6458d39a17ecad5397ef29301433f0b` |
| AM-0014 | `951fe2028c3ed6db85530979ec910ed8fc14a7a5dfb041bb829da2f5e41fa209` |
| AM-0015 | `e6482360189a653ef2a3c5074162f75e5376f2e266062f38615fdfa34b32fbc3` |

Đọc trực tiếp `original.md`, toàn bộ amendment/capture, canonical WorkLedger,
`shadow/tasks.md`, `shadow/progress.md`, `shadow/reconciliation.md`, trace,
candidate inventory, lineage và current git/remote truth.

## Ground truth checkpoint

- Ledger hiện tại: `execution_state=NEEDS_REMEDIATION`, `status=ADOPTED`,
  `shadow_revision=48`.
- M8 chưa pass.
- Integration tree có rất nhiều thay đổi chưa commit; không coi chúng là
  accepted cho tới khi có receipt → independent review → reconciliation.
- Worker đã báo sửa scorecard schema, Python CI dependencies, parity fixture,
  docs và browser regressions, nhưng các claim phải kiểm lại.
- Browser independent verifier từng bị abort và có thể để orphan server;
  kiểm tra process tree/port rồi mới chạy lại.
- Installer integrity review còn Critical/High findings; không đóng bằng cách
  sửa test cho pass.
- `automation/scorecard-evidence.json` phải được sinh từ evidence thật; file
  placeholder/all-zero không phải scorecard M8.
- Project config đã route DeepSeek mới qua `qwencoder/deepseek-v4-flash`;
  phiên cũ có thể vẫn giữ provider trực tiếp. Kiểm `opencode debug config` và
  session model thực tế, không suy diễn.
- Remote history hiện phải được kiểm tra lại; không xóa branch/worktree trước
  rescue và archival proof.

## Mốc owner đã khóa

AM-0015 là canonical:

```text
NEEDS_REMEDIATION
→ M8 INTERNAL_READY
→ install + dogfood exact M8
→ M9.5 RELEASE_HARDENED
→ hardening + burn-in
→ M10 COMPLETE
```

M8/M9.5 chỉ là milestone notification; không dừng và không hỏi owner có tiếp
tục không. M8 yêu cầu mọi 18 dimension ≥8; M9.5 ≥9.5; M10 =10. Không dùng
điểm trung bình để che dimension yếu.

## Scaffold contract

Chỉ thực hiện:

1. Đọc và hash-check artifact immutable.
2. Kiểm tra đúng worktree/branch/HEAD/dirty paths/remote refs.
3. Kiểm tra ledger/shadow freshness, open findings, receipts, browser
   processes, provider routing và resource state.
4. Ghi inventory delta vào `.agent/handoffs/.../opencode-m8-m10-context-ready.md`.
5. Ghi blocker/finding theo evidence thật; không sửa source/test/ledger thủ công.

Không được:

- implement source/test;
- activate amendment bằng cách sửa JSON/Markdown tay;
- commit, merge, push, install, rewrite history, delete branch/worktree;
- gọi platform “native” nếu binary/account/attestation thật không tồn tại;
- kế thừa receipt cũ không bind exact snapshot.

Kết thúc đúng format:

```text
CONTEXT_READY_OPENCODE_M8_M10
Artifact: /home/linhnx/Projects/agent-rules/.agent/handoffs/agent-rules-harness-v3-rearchitecture-20260726-r1/opencode-m8-m10-context-ready.md
Original: c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31
AM0015: e6482360189a653ef2a3c5074162f75e5376f2e266062f38615fdfa34b32fbc3
Execution state: NEEDS_REMEDIATION
M8 blockers: <evidence-backed list>
Source mutation: NONE
```
