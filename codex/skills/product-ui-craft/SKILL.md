---
name: product-ui-craft
description: Universal UI/UX for Codex and Grok CLI. ULTRA-SENSITIVE Turn-0 — activate on ANY UI, giao diện, FE, frontend, CSS, layout, responsive, component, page, dashboard, landing, redesign, chưa chuẩn, thiếu, đẹp, xấu, mockup, *.tsx view, or screenshot of UI. Read SKILL.md before UI code edits. 5fedu requires /template parity.
---

# Product UI Craft

One skill for **any** product surface — không gò một kiểu. Chọn visual direction từ **domain + user + data density**, không từ default LLM.

## Anti-single-style (bắt buộc)

- **Không** default một palette/font/layout cho mọi task.
- Mỗi task: chọn **1 hướng** trong catalog (có thể kết hợp 2 nếu user yêu cầu) và ghi lý do 1–3 câu.
- User chỉ định style → override catalog.
- 5fedu / template có sẵn → **template thắng** aesthetic catalog.

### Direction catalog (chọn theo nghiệp vụ — không phải checklist cố định)

| Domain signal | Hướng gợi ý |
|---|---|
| ERP, payroll, logistics, ops dashboard | Dense data, table-first, icon toolbar, pagination chuẩn, ít decoration |
| Consumer / lifestyle / editorial | Serif/display contrast, whitespace, ảnh lớn, ít control trên fold |
| SaaS / devtool / AI product | Restrained neutrals, clear hierarchy, states rõ, không purple-gradient cliché |
| Mobile web / bottom nav | Touch targets, chip/tab overflow gate, sticky bar không che content |
| Landing / marketing | Một hero message, CTA rõ; tránh card-in-card spam |
| Game / immersive | Motion có chủ đích; `prefers-reduced-motion` |
| User nói minimal / brutalist / luxury | Áp đúng từ khóa — không trộn lan |

## Phase 0 — Deep intake (đọc từng chữ)

Trước code:

1. Đọc **toàn bộ** user message — số, tên field, role, URL, “không/không được”, điều kiện phụ.
2. Đọc `AGENTS.md`, spec, issue, file user trỏ — **không lướt title**.
3. Nếu 5fedu: `.grok/5fedu/00-index.md` hoặc sibling + **`/template` trước code**.
4. `rg`/index: ≥1 component tương tự (loading, error, empty, permission hide).

Ghi ngắn: constraints cứng, unknowns, surfaces affected.

## Phase 1 — Research (greenfield / redesign lớn / stack lạ)

**Bắt buộc** trước implement khi: app mới, redesign, hoặc user phàn visual/generic.

Dùng skill `researcher` hoặc web — **≥3 góc khác nhau**:

- Official docs (framework, a11y, responsive)
- Product/domain pattern (app thật cùng ngành — không chỉ 1 blog)
- Stack trong repo (design system, tokens, icons đang dùng)

**Cấm:** 1–2 nguồn trùng ý; paste guideline không map vào repo.

Output ngắn: `Sources` · `Takeaways` · `Applied` · `Unknowns`

## Phase 2 — Design decision

- ≥2 hướng layout/component (1 câu mỗi hướng) khi refactor lớn hoặc greenfield.
- Chọn 1 + lý do gắn constraint user/template.

## Phase 3 — Implement

- Code thật; cấm placeholder `// ...`.
- Layout: grid/flex, `min-width: 0`, truncation/wrap chủ đích.
- Table động: header localized (VD `tai_xe` → `Tài xế`).
- Toolbar phụ: icon-only + `title`/`aria-label`.
- Metrics cards: theo context view, không hardcode bộ metric vô nghĩa.
- Icons: ưu tiên lib repo (Lucide, …); không fake logo công ty thật.

## Phase 4 — Verify

1. Chạy dev server khi có thể.
2. `playwright` hoặc `screenshot` — desktop + mobile.
3. Đọc `references/visual-qa-checklist.md` — **Dense Mobile App Gate** cho header/tab/chip/bottom nav.
4. Defect visible → dừng feature work, sửa layout, chụp lại.

`references/visual-direction.md` — khi branded/landing/game/open-ended.

## Skill activation (cực nhạy — Turn-0)

1 signal UI → đọc file **trước** edit. Message user thấy: `Skill scan: … → product-ui-craft` + `Skill activated: product-ui-craft`. Final lặp lại.

## Final report

- Direction chosen + why
- Files changed
- Browser/viewports checked
- `Template checked` (5fedu)
- Residual risk