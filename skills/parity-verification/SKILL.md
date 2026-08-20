---
name: parity-verification
description: 'Claim-based parity verification across visual, responsive, behavioral, accessibility, console, network, and
  data-state dimensions. Use when owner asks for parity proof, parity verification, parity claim, verify parity, diff template,
  visual parity, responsive parity, behavioral parity, cross-state parity, or automated verification loop against a reference.
  Combo: browser-qa (Playwright CLI default, MCP/DevTools on demand) for execution, qa-skills for matrix design. Do NOT use
  for unit/API-only verification; not for static source diff without live browser interaction.

  '
---

# Parity verification

**Ý đồ:** Tự động chứng minh mỗi parity claim có proof — visual, responsive, behavior, accessibility, console, network, data-state. Không có claim nào PASS nếu thiếu proof.

## Hard gates

1. **Claim-first** — Mọi parity claim phải được định nghĩa trước verify. Không verify mù.
2. **Proof bắt buộc** — Mỗi claim phải có `expected`, `actual`, `environment`, `artifact_evidence`. Thiếu → `UNVERIFIED`, không phải PASS.
3. **Không auto-update baseline** — Expected screenshot không được tự động cập nhật. Nếu visual fail, phải phân loại residual.
4. **Source + runtime là đồng truth** — Không coi screenshot hay source code đơn lẻ là universal truth. Template runtime behavior + source + visual captures + accepted deviations = complementary truth.
5. **Browser build success alone is insufficient** — Build thành công không thay thế live browser verification. Missing proof means unverified, not PASS.
6. **Flake detection** — Nếu visual baseline flaky, phải ghi nhận và không silent retry để pass.

## Verification matrix

| Dimension | Desktop (1280x720) | Mobile (375x812) | Notes |
|---|---|---|---|
| Loading state | Screenshot + a11y | Screenshot + a11y | Skeleton/spinner |
| Populated state | Screenshot + a11y + console | Screenshot + a11y + console | Full data |
| Empty state | Screenshot + a11y | Screenshot + a11y | No data |
| Error state | Screenshot + a11y + console + network | Screenshot + a11y + console + network | Error UI + logs |
| Hover/focus | Screenshot diff | — | Where applicable |
| Keyboard nav | Tab order + focus ring | — | Tab traversal |
| Touch | — | Tap targets + scroll | Mobile interaction |
| Console errors | Browser console | Browser console | Severity check |
| Network failures | Failed XHR/fetch list | Failed XHR/fetch list | Status codes |
| A11y snapshot | Axe/lighthouse audit | Axe/lighthouse audit | Violations |

## Workflow

1. **Planner/reviewer** (vision-capable) — derives visual specification + discrepancies from reference vs target.
2. **Worker** (non-vision) — implements parity from source + structured claim packet.
3. **Browser verifier** — runs the state/viewport matrix, collects evidence.
4. **Evidence attachment** — each evidence artifact is linked to its claim.
5. **Residual classification** — every difference classified as:
   - `defect` — real parity bug
   - `accepted_deviation` — owner-approved difference
   - `environment_rendering` — font/OS/browser rendering difference
   - `unknown` — needs owner decision

## Source of truth

- Template runtime behavior
- Template source code
- Target project architecture
- Visual captures (screenshots)
- Accepted deviations

None alone is universal truth. All five are complementary.

## Related

- `browser-qa` — hands: Playwright CLI default; Playwright MCP/Chrome DevTools only when needed
- `qa-skills` — brain: matrix design, severity, findings
- `<active-profile>-module-parity` — upstream: pattern fidelity packets
- References: `pipeline.md`, `claim-format.md`, `evidence-schema.json`, `runbook.md`
