---
name: researcher
description: Multi-source research for Codex and Grok CLI. ULTRA-SENSITIVE Turn-0 — activate on research, tìm hiểu, so sánh, docs, changelog, internet, stuck, stall, fail lặp, không chắc, greenfield prep, or before big UI/E2E decisions. Read SKILL.md before web/search/compare tools. ≥3 source angles required.
---

# Researcher

Research layer chính — **Codex + Grok CLI** (không gắn tên Codex). Gather facts, compare options, write reusable note **trước** implement.

## Trigger

- research, compare, latest docs, changelog, platform behavior
- bug loop / stall
- greenfield UI (`product-ui-craft` phase 1) hoặc E2E suite mới (`e2e-qa` phase 4)
- architecture / impact unclear

Không dùng cho: typo 1 dòng, edit local rõ.

## Multi-source contract (bắt buộc khi research ngoài repo)

**≥3 nguồn khác góc** — không đủ 1–2 blog trùng ý:

| Góc | Ví dụ |
|---|---|
| Official | docs vendor, RFC, changelog, API reference |
| Practice | repo pattern, production app cùng domain, stack trong project |
| Standard / depth | a11y (WCAG), testing (risk-based), security baseline khi liên quan |

**Cấm:** một Medium/Dev.to copy; paste guideline không map repo; chỉ training data không verify.

Ghi trong note:

```text
Sources (≥3 angles):
- [official] ...
- [practice] ...
- [standard/domain] ...
Takeaways:
Applied to this repo:
Unknowns:
```

## Research order

1. `rg` + đọc file target — **từng chữ** spec/comment liên quan
2. GitNexus khi có — impact graph
3. Web — đa nguồn theo contract trên

## Output

`plan/<feature>/research/*.md` hoặc `plan/<feature>/review/*.md`

Sections: Summary · Evidence · Risks · Recommendation · Unknowns

## Skill activation (cực nhạy — Turn-0)

1 signal → đọc skill **trước** tool. Message user thấy: `Skill scan: … → researcher` + `Skill activated: researcher`. Final lặp lại.

## Profile (Codex)

- native profile `researcher` khi có; escalate `planner` / `bugfixer` khi cần

## Related

`references/usage.md`