---
description: "Registry skills + đường dẫn 5fedu — Codex CLI"
---

# 04-skills-and-5fedu

Rules (`00-03`) là hành vi. **Skills** là quy trình. **5fedu context** là nghiệp vụ dự án.

## Skills — nạp ở đâu (Codex CLI)

| Ưu tiên | Path | Vai trò |
|---|---|---|
| 1 | `~/.codex/skills/` | Runtime user |
| 2 | `<repo>/.codex/skills/` hoặc repo source `skills/` | Project/bootstrap |
| 3 | `<repo>/.grok/skills/` | Mirror Grok (nếu có) |

## Trigger → Skill (bắt buộc)

| Signal | Skill | Đọc |
|---|---|---|
| setup/scaffold 5fedu | `5fedu-project` | `skills/5fedu-project/SKILL.md` |
| research, docs mới | `researcher` | `skills/researcher/SKILL.md` |
| README, spec | `docs-style` | `skills/docs-style/SKILL.md` |
| browser, UI flow | `playwright`, `playwright-interactive` | `skills/playwright*/SKILL.md` |
| PDF | `pdf` | `skills/pdf/SKILL.md` |
| security | `security-*` | `skills/security-*/SKILL.md` |
| output đầy đủ | `output-skill` | `skills/output-skill/SKILL.md` |
| phase routing | `workflow-router` | `skills/workflow-router/SKILL.md` |

Index: `skills/README.md` hoặc platform inventory trong `platforms/codex/docs/`.

## 5fedu detection

```text
.codex/5fedu/  .grok/5fedu/  .agents/5fedu/  .kiro/5fedu/
```

Cài context: skill `5fedu-project` → `scripts/install-5fedu-context.ps1` → `.codex/5fedu/` (+ mirrors).

## 5fedu UI/module fidelity gate

Khi task chạm UI, module, phân hệ, template hoặc pattern 5fedu, agent phải đọc context project-local và tạo `Pattern Fidelity Packet` theo `02-frontend-mapping.md` trước khi code. Cấm tự chế tên module, mô tả, nút, icon, tab, route hoặc copy nếu source/template/app đã có nguồn.

## Cấm

- Không implement 5fedu chỉ từ rules — đọc skill + `.codex/5fedu/00-index.md`.
- Không assume schema/permission/UI.
- **Cấm tự ý áp dụng hoặc đồng bộ lesson/context đặc thù của một dự án cũ** sang dự án mới khác. Các file raw lesson, owner feedback, backlog, câu hỏi mở, hoặc quyết định chưa chốt chỉ được copy khi người dùng yêu cầu rõ hoặc khi đã được tổng quát hóa thành rule sống trong skill/context template.
- **Bắt buộc khảo sát điền vào chỗ trống**: Ngay khi kích hoạt skill `5fedu-project` trên một dự án mới, Agent bắt buộc phải hiển thị ngay một form khảo sát trống yêu cầu người dùng cung cấp link Google Sheet spec, Repo URL, Live URL và credentials thực tế của dự án mới. Tuyệt đối không được đoán bừa hoặc tự ý mock thông tin.
