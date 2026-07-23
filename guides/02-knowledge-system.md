# Hệ thống tri thức

Mục tiêu là nạp đúng lượng context cần thiết, không preload toàn bộ harness hay repository.

## Thứ tự nạp

1. Core rules trong `rules/manifest.yaml`.
2. Entrypoint gần task nhất của repository.
3. Một skill chính khớp routing metadata.
4. Project/domain leaf và supporting skill thật sự cần.
5. Reference/script chỉ khi procedure yêu cầu.
6. Nguồn ngoài cho dữ kiện mới, không ổn định hoặc được yêu cầu research.

`routing` trong frontmatter là nguồn chuẩn cho graph router. `trigger-audit.json` là fixture CI, không phải phrase router thứ hai.

## Các lớp

| Lớp | Nội dung | Cách nạp |
|---|---|---|
| Core | 7 rules trong manifest | luôn nạp |
| Boundary | style, governance, sync, budget | lazy theo task |
| Capability | `skills/<slug>/SKILL.md` | theo routing |
| Project/domain | context cục bộ như 5fedu | theo workspace fact |
| Automation | build, install, audit, work ledger | agent gọi khi cần |
| Generated/evidence | output, benchmark result, trace | không dùng làm context mặc định |

## Plan và execution

- Native Plan Mode tạo execution contract (hợp đồng thực thi) theo tỷ lệ small/medium/large/resumable.
- Sau execute pivot, agent chính tự phân rã, route model, giao ownership, tích hợp và verify.
- Economy dùng cho retrieval/mechanical, standard cho phần lớn implementation/review, expert chỉ cho rủi ro chưa giải quyết.
- Ledger chi tiết bắt buộc cho large/resumable; medium/small chỉ dùng khi coordination, rollback, proof hoặc resume thật sự cần.
- Context capsule của sub-agent chỉ gồm source IDs, mục tiêu, paths, acceptance, proof và điều cấm liên quan.

## Nguyên tắc chống phình context

- Không duy trì glossary acronym riêng cho workflow bình thường.
- Không copy transcript đầy đủ cho mọi sub-agent.
- Không nạp browser QA khi claim không cần bằng chứng live.
- Không dùng generated mirror làm canonical source.
- Budget chỉ khai báo tại `rules/manifest.yaml` và route cases.
