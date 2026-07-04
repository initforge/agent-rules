# Hệ thống tri thức

**Vai trò:** Giải thích thứ tự nạp context progressive disclosure.  
**Ý đồ:** Agent không preload cả repo; budget nằm ở một nguồn duy nhất.

## Thứ tự nạp

1. `rules/` (theo `rules/manifest.yaml` load_order)
2. File gần task nhất trong repo đang làm
3. Một skill khớp trigger trong `skills/<slug>/SKILL.md`
4. References/scripts của skill khi procedure yêu cầu
5. Context dự án: `projects/5fedu/` hoặc `context/5fedu/` sau cài
6. Nguồn ngoài khi cần facts mới hoặc docs upstream

Trigger source of truth: `description` frontmatter mỗi skill — không duy trì bảng trigger viết tay song song.

## Token budget

**Single source:** [`rules/manifest.yaml`](../rules/manifest.yaml) — không nhân bản số ở đây.

## Không auto-load

Evidence, legacy, `archive/`, `05-generated/`, runtime mirrors.

## Zones A–E (Phân vùng không nhiễu)

- **ZONE A: always-load rules (manifest)**
  `05-critical-thinking` | `10-execution` | `25-task-lifecycle` | `50-context-budget` | `16-context-style`
  *Mục đích:* Quản lý workflow mode, lane, priority, các ranh giới cứng HB-1..5.
- **ZONE B: lazy skills (trigger only)**
  `plan-and-handoff` | `finish-to-completion` | `discovery` | `clean-code` | `code-review` | `researcher` | `5fedu-*`
  *Mục đích:* Các procedure thực thi tải chậm, không trùng lặp rules.
- **ZONE C: 5fedu template (domains — generic)**
  `ui-delivery` | `module-mapping` | `surface` | `detail`
  *Mục đích:* Tri thức ERP chung của template, không chứa execution routing.
- **ZONE D: automation + audit**
  `03-validate` | `audit-*` | CI | install scripts
  *Mục đích:* Tự động hóa kiểm tra harness, không nạp vào session.
- **ZONE E: repo project-local (NOT harness)**
  `<project>/context/5fedu/project-local/`
  *Mục đích:* Cấu hình, credentials, DDL đặc thù dự án; installer không bao giờ ghi đè.

## Ma trận Trigger Phase (2 giai đoạn)

| Context / Skill | Trước plan (DETECT) | Implement (EXECUTE / VERIFY) | Sau plan (REVIEW) | Ghi chú |
|---|---|---|---|---|
| `25-task-lifecycle` | Intake lane triage | — | — | Quy định lane hoạt động |
| `05-critical-thinking` | Phân tích pushback | — | — | Chỉ khi ambiguous/high-risk |
| `researcher` | Fact-finding | (khi stall) | — | Nghiên cứu nền tảng |
| `implementation-discovery` | Verify assumptions | Known-unknowns | — | **Span cả hai pha** |
| `5fedu-module-parity` | Mapping detect | Visual parity gate | Audit surface | **Span cả ba pha** |
| `clean-code` | Smell detect | Hard-block check | Code quality review | **Cặp 2 pha** |
| `plan-and-handoff` | — (tạo plan) | — | — | Pivot |
| `finish-to-completion` | — | Thực thi locked scope | — | |
| `code-review` | — | — | Review strict | User-invoked |
| `context-evolution-protocol`| — | — | Post-friction evolve | Meta |
