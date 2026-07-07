# Capability tier routing

**Vai trò:** Single source cho L0/L1/L2 — role vs model instance.  
**Ý đồ:** Ưu tiên model yếu/rẻ khi slice đủ rõ; escalate khi khó hoặc fail 2x.

## Role ≠ tier ≠ model

| Khái niệm | Ý nghĩa |
|---|---|
| **Role** | Architect, Scribe, Reviewer, Executor, Research Analyst — skill + mode |
| **Tier** | L0 weak, L1 medium, L2 strong — độ khó cần cho role/phase |
| **Model** | Opus, Sonnet, Flash, DeepSeek, Minimax, Gemini Pro… — instance owner chọn trong `allowed_tiers` |

Harness quy **min_tier** theo role/phase — **không cấm** model mạnh làm việc tier thấp hơn.

## Định nghĩa tier

| Tier | Nhãn | Model ví dụ (không exhaustive) | Mặc định cho |
|---|---|---|---|
| **L0** | weak/cheap | Gemini Flash, DeepSeek, Minimax, … | Execute slice dễ; Scribe; research ngắn |
| **L1** | medium | Gemini Pro, Sonnet (non-thinking), … | Execute phase vừa; Reviewer |
| **L2** | strong | Opus, Sonnet thinking, … | Plan Architect; high-risk execute |

Thêm model mới → gán tier instance; **không sửa** harness.

## Nguyên tắc routing

1. **Prefer weak:** Phase ghi `preferred_tier: L0`; thử L0 trước trừ khi owner chỉ định khác.
2. **Owner override:** `force_tier: L2` hoặc chọn model cụ thể — harness không chặn.
3. **Same-session plan+execute:** Model L2 vừa Architect vừa Execute phase N sau pivot HB-2 — **allowed**.
4. **Role floor:**
   - Architect / Reviewer sâu → `min_tier L1` (Architect multi-phase khuyến nghị L2)
   - Scribe → L0 OK
   - Executor → theo phase `min_tier` (thường L0)
5. **Escalation (bắt buộc khi):**
   - Verify fail ≥2 lần (`rules/10-execution.md` #9)
   - 5fedu pattern fidelity fail
   - `BLOCKED` must-not-self-decide
   - `tier_used` < phase `min_tier`
   → Escalate trong `allowed_tiers`; ghi `tier_used` + `escalation_reason` trong report/trace.
6. **min_tier thắng preferred_tier** khi conflict — prefer = try-first, min = floor.

## Role × tier defaults

| Role | Mode | preferred_tier | min_tier |
|---|---|---|---|
| Research Analyst | advisory read-only | L0 | L0 |
| Plan Architect | plan-authoring HB-1 | L2 | L1 |
| Plan Scribe | plan-authoring HB-1 | L0 | L0 |
| Plan Reviewer | plan-review HB-1 | L1 | L1 |
| Executor | execution HB-2 | **L0** | per phase |

L0 models **không** làm Architect/Reviewer sâu — được Executor/Scribe.

## Ma trận case (owner quick pick)

| Case | Plan role | preferred_tier | min_tier | allowed_tiers |
|---|---|---|---|---|
| 1 file, HANDOFF rõ | Executor | L0 | L0 | L0–L2 |
| Spec locked → PAF only | Scribe | L0 | L0 | L0–L1 |
| Dump → plan dài | Architect | L2 | L1 | L1–L2 |
| Module scaffold phase | Architect / Executor | L0 execute | L0 | L0–L1 |
| Drawer+listview parity | Architect L2 / Execute | L1 | L1 | L0–L2 escalate |
| Auth/migration/permission | Architect + Execute | L2 | L2 | L2 only |
| Research lib/docs | Research Analyst | L0–L1 | L0 | any + web |
| L0 fail 2x | Executor escalate | — | L1 or L2 | per phase |

## PAF fields (per phase)

```yaml
preferred_tier: L0
min_tier: L0
allowed_tiers: [L0, L1, L2]
escalate_if: [verify_fail_2x, parity_fail, BLOCKED]
force_tier: null
tier_used: null
escalation_reason: null
```

## Trace (advisory)

Sau execute phase, append optional fields vào `.agent/trace.jsonl`:

`plan_id`, `phase`, `revision`, `tier_used`, `escalation_reason`
