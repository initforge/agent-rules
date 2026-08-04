AM-0003 — Owner closure decisions

1. Git authority:
- DeepSeek được commit và push chỉ lên branch `deepseek-implement`.
- Không merge vào `main`.
- Xóa mọi local và remote branch khác, ngoại trừ chính xác `main` và `deepseek-implement`.
- Không force-push.
- Trạng thái cuối của đợt này là `CERTIFIED_READY_FOR_REVIEW`; full plan `COMPLETED` vẫn chờ owner review và merge sau.

2. 5fedu project registry:
- Tah-app repository: https://github.com/initforge/pos-ops
- Nostime repository: https://github.com/admin5fedu/nostime
- Registry project chỉ cần canonical repository URL; không yêu cầu verified commit, source snapshot hoặc vendored source.
- Project thêm sau này cũng chỉ cần repository URL.
- Project context/capability chỉ active khi checkout tương ứng hiện diện local và được nhận diện bằng normalized Git remote URL.
- Không lưu absolute local path vào canonical profile.
- Nếu repo không có local, project giữ trạng thái inactive; không clone hoặc load ngầm chỉ vì registry có URL.
- Policy repo-link-only này supersede yêu cầu verified commit riêng cho 5fedu project registry; không supersede integrity pin của integrations, GitHub Actions, Taste source hoặc dependency packages.

3. Telemetry retention:
- Metadata retention mặc định: 30 ngày.
- Raw prompt/output/source mặc định tắt.
- Nếu owner opt-in raw content, retention mặc định: 7 ngày.
- Có redaction, namespace isolation, delete/export.
- Local storage là mặc định; OTLP/external exporter chỉ bật qua explicit configuration.

4. Native-host certification order:
- Trong implementation, thiếu Codex/Cursor/Antigravity/Grok/OpenCode không được dùng để giả PASS nhưng cũng không được chặn các slice code độc lập.
- Hoàn thiện code và tạo candidate commit trước.
- Sau candidate commit, detect host thật; cài và setup các official client/CLI còn thiếu trên máy nếu cần.
- Sau đó chạy certification năm host.
- Attestation phải bind đúng full final commit SHA, host/version, contract set, timestamp và expiry.
- Nếu certification làm lộ code defect, sửa, tạo commit mới, làm stale toàn bộ attestation cũ và certification lại trên HEAD mới.
- Không chấp nhận emulation, mock, installed-flag hoặc JSON tự khai là native attestation.

5. Vision-capability policy:
- Controller/model catalog phải detect capability `vision_input` theo model + host + version, với trạng thái SUPPORTED, UNSUPPORTED hoặc UNKNOWN.
- Không suy capability chỉ từ tên model.
- Dùng official metadata/host discovery và capability canary có receipt; UNKNOWN không được silently coi là UNSUPPORTED.
- Model UNSUPPORTED không bị ép tự đánh giá hình ảnh và không được tự khai visual QA.
- Nếu có approved model SUPPORTED, mọi UI/UX slice có screenshot artifact bắt buộc được route qua model đó để visual QA và repair tới PASS.
- Model SUPPORTED nhận UI/UX work bắt buộc visual QA; không được bỏ qua.
- Nếu không có approved vision model, semantic LLM visual review được ghi `NOT_APPLICABLE_NO_VISION_CAPABILITY`; machine visual regression, Playwright, accessibility, responsive, keyboard, console và network gates vẫn bắt buộc.
- Taste skill vẫn bắt buộc khi làm frontend/UI/UX; capability vision chỉ quyết định ai được đánh giá screenshot, không miễn implementation quality.
