# Coverage Audit

> **ARCHIVAL** — không auto-load. Router sống: `00-context-map.md` + `domains/`. File này chỉ tham chiếu lịch sử coverage.

## Mục tiêu

File này đối chiếu prompt/ảnh ban đầu với bộ context hiện tại để tránh mất ý. Khi bổ sung rule mới, cập nhật audit nếu rule đó thay đổi phạm vi hoặc cách AI phải làm việc.

## Kết luận hiện tại

Bộ context đã đủ để AI làm việc độc lập theo đúng hướng 5fedu trong phạm vi an toàn:

- Biết phải đọc `AGENTS.md` và context project-local khi làm trong repo.
- Biết không cần người dùng gọi `/5fedu` mỗi lần.
- Biết format/cách làm mặc định khi người dùng đưa ít instruction.
- Biết phần nào phải hỏi lại vì là giá trị cụ thể từng app.
- Biết không tự suy diễn credentials, schema production, permission rule cụ thể, hoặc sửa/xóa lớn template.
- Biết scope hiện tại là full app A-Z; không hỏi người dùng "module đầu tiên/phase đầu".

## Đối chiếu yêu cầu

| Yêu cầu gốc | Đã phủ ở đâu | Trạng thái | Ghi chú |
| --- | --- | --- | --- |
| 5fedu có convention/rule/workflow riêng theo dự án | `AGENTS.md`, `00-context-map.md` | Đã phủ | Context nằm trong repo, không nhét full global |
| AGENTS.md trong dự án hoặc băm nhỏ file và AGENTS.md kết nối | `AGENTS.md`, `context/5fedu/*.md` | Đã phủ | AGENTS là con trỏ nhẹ/loading policy |
| Không làm phình global context | `AGENTS.md`, `00-context-map.md`, skill `5fedu-project` | Đã phủ | Global chỉ giữ `/5fedu` và skill scaffold/bảo trì |
| Có slash để setup/bảo trì context 5fedu | `C:\Users\ADMIN\.codex\prompts\5fedu.prompt.md` | Đã phủ | Chỉ một slash `/5fedu` |
| `/5fedu` không phải lệnh cấp context mỗi lần | `AGENTS.md`, `00-context-map.md`, `decisions.md` | Đã phủ | Normal work tự đọc AGENTS/context |
| Scope dự án là full app A-Z | `00-context-map.md`, `decisions.md`, `domains/ui-delivery.md` | Đã chốt | AI tự chia plan nội bộ nếu cần |
| Hỏi đàng hoàng, không suy diễn lung tung | `00-context-map.md`, `decisions.md`, `open-questions.md` | Đã phủ | `CHUA_CHOT/CAN_HOI_THEM` phải hỏi |
| Sync với `initforge/agent-rules` | thao tác sync đã chạy; `skill/prompt` nằm trong runtime | Đã làm | Chưa commit/push nếu user chưa yêu cầu |
| Tech stack ảnh 1 | `domains/tech-stack.md`, `06`, `domains/module-mapping.md`, `domains/business.md` | Đã chốt cho app này | Nếu repo/source mâu thuẫn thì báo |
| Google Sheets/AppSheet có thể có credentials | `01`, `03`, `07`, `open-questions.md` | Đã phủ | Không tự bật nếu spec không nói |
| Template `admin5fedu/5f-template-ket-noi-supabase` | `00`, `01`, `06`, `07`, `08`, `open-questions.md` | Đã chốt và đã clone source local | Source: `P:\5fedunew\template_5fedu\5f-template-ket-noi-supabase-main`; chỉnh sửa thì báo |
| Ưu tiên thêm/adapt, hạn chế sửa/xóa template | `01`, `07` | Đã phủ | Sửa/xóa lớn phải báo và chốt |
| Domain/sidebar ảnh 2 | `02`, `08` | Đã phủ | Dùng làm ví dụ, không ép scope nếu app khác |
| Module/view/tab ảnh 3-4 | `02`, `08` | Đã phủ | Đã thêm Hệ thống/Quản lý vận tải mẫu |
| Mapping chính xác spec -> source/backend | `00`, `02`, `07`, `08` | Đã phủ | Không code trước khi mapping đủ phần đang làm |
| Supabase thật + credentials đầy đủ, check format mọi credentials | `03`, `06`, `07`, `open-questions.md` | Supabase thật đã chốt; credential values chưa có | Không in/lưu secret |
| Kết nối frontend + database thật, không nút chết | `03`, `05`, `07` | Đã phủ | Mock phải ghi rõ phạm vi |
| Tách handler/service để dễ check/debug | `03`, `07` | Đã phủ | Khi code phải map frontend -> service -> table |
| Database convention ảnh 6 | `03`, `08` | Đã phủ ví dụ | Schema final vẫn cần chốt |
| Database structure ảnh 7 | `03`, `07`, `08` | Đã phủ | `id int8`, label, nhóm, liên kết, mô tả/ghi chú, trạng thái, audit columns |
| Chat owner ảnh 8 về `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat` | `03`, `07`, `08`, `06` | Đã phủ | Bảng miễn `id_nguoi_tao` cần chốt từng bảng |
| Clean code, reusable, dễ mở rộng | `05`, global clean-code rules | Đã phủ | Khi code vẫn theo rule clean-code global |
| Folder theo chức năng, tham khảo template | `05`, `07` | Đã phủ | Tên thư mục module tiếng Việt |
| Tên submenu/thư mục module tiếng Việt | `02` | Đã phủ | Giúp tra cứu cho người không biết tiếng Anh |
| Tên view dạng `nhan-vien-form` | `02` | Đã phủ | Hybrid tiếng Việt không dấu + suffix English |
| Tên bảng prefix submenu + module | `03`, `07` | Đã phủ | Prefix đầy đủ cần chốt |
| Bảng đầy đủ có policy authenticated, index, trigger `tg_cap_nhat` | `03`, `07` | Đã phủ | "Hàm index" cần giải thích/mẫu |
| Fake email login | `04`, `07` | Đã phủ | `admin` -> `admin@gmail.com` |
| Bỏ đăng ký | `04`, `07` | Đã phủ | |
| Tài khoản mặc định admin/5fedu.com | `04`, `07` | Đã phủ | |
| Module nhân viên rút gọn trường | `04`, `07` | Đã phủ | |
| Tạo/xóa Supabase Auth theo `ten_dang_nhap@gmail.com`, password `123456` | `04` | Đã phủ | HIGH risk, cần plan trước khi code |
| Responsive: desktop listview, mobile cardview | `02`, `07` | Đã phủ | |
| Standard list/card/detail/form view theo template | `02`, `05` | Đã phủ | |
| Flow đứng đâu quay lại đó | `04` | Đã phủ | |
| Tab group có `?tab=` | `02`, `07` | Đã phủ | |
| Search cả trường trực tiếp và liên kết | `02`, `05`, `07` | Đã phủ | |
| Notification demo | `02` | Đã phủ | Icon demo, click báo chưa sẵn có |
| Permission mặc định `xem/them/sua/xoa/quan_tri/tat_ca` | `04`, `07` | Đã phủ | `tat_ca` không lưu DB |
| Ví dụ phân quyền Phiếu hành chính | `04` | Đã phủ | |
| Module key Supabase chỉ slug module, ví dụ `nhan-vien` | `02`, `04` | Đã phủ | Không lưu `he-thong/nhan-vien` |
| App-side permission, không cần RLS mặc định | `03`, `07` | Đã phủ | |
| Tối ưu Supabase Egress + Vercel Edge Function cuối dự án | `05`, `07` | Đã phủ | Khi làm phải tra docs chính thức mới nhất |
| Sau này bổ sung rule không được missing | `AGENTS.md`, `/5fedu`, `06`, file audit này | Đã phủ | Dùng `/5fedu` để bảo trì context |

## Cách suy luận khi user cấp ít instruction

AI được tự suy luận theo thứ tự:

1. Đọc `AGENTS.md`, `00-context-map.md`, `decisions.md`, `open-questions.md`.
2. Đọc `domains/ui-delivery.md` để nắm format/cách làm.
3. Đọc `domains/business.md` để lấy ví dụ neo theo ảnh/spec ban đầu.
4. Tìm trong template/source trước khi tạo mới.
5. Đề xuất mapping và các câu hỏi còn thiếu.
6. Tự chia thứ tự triển khai nội bộ nếu cần, không hỏi "phase đầu/module đầu tiên" khi scope đã là full app.

AI không được tự chốt các điểm sau nếu chưa có nguồn:

- credentials
- schema/migration production
- permission rule cụ thể từng module
- xóa/sửa lớn template
- prefix mới hoặc quy ước index chưa có mẫu
- app hiện tại có đúng toàn bộ ví dụ từ ảnh hay không
## Cập nhật audit 2026-05-31

| Yêu cầu/phản hồi mới | Đã phủ ở đâu | Trạng thái | Ghi chú |
| --- | --- | --- | --- |
| `id` các bảng phải là `int8` tự động tăng dần | `domains/database.md`, `domains/module-mapping.md`, `domains/references/ui-delivery-detail.md` | Đã chốt | Supabase hỗ trợ identity/bigserial |
| Không dùng `uuid` cho khóa chính bảng app nếu chưa chốt | `03`, `domains/references/ui-delivery-detail.md` | Đã chốt | Cần audit migration hiện tại |
| Bảng nhân viên bỏ trường linh tinh | `domains/permissions.md`, `domains/references/ui-delivery-detail.md` | Đã chốt | Chỉ giữ trường nghiệp vụ chính từ source |
| Login dùng `ten_dang_nhap`, không dùng `ma_nhan_vien` | `04`, `07`, `domains/references/ui-delivery-detail.md` | Đã chốt | Là gate trước khi mở rộng auth |
| Thêm/sửa/xóa username phải đồng bộ Supabase Auth user | `04`, `domains/references/ui-delivery-detail.md` | Đã chốt | Phải qua server/admin path |
| Cần đọc Google Sheets qua browser đã đăng nhập Google | `00-context-map.md`, `open-questions.md`, `domains/references/ui-delivery-detail.md` | Đang thực hiện | Playwright headed đã mở để user auth Google |
| Hai Google Sheets public đã được tải/phân tích làm source chính | `project-local/source-map.md`, `decisions.md` | Đã chốt | Dùng để đối chiếu module/schema/rule trước khi sửa code |

## Coverage Owner Feedback UI/Vận Tải 2026-05-31

| Yêu cầu | File phủ | Trạng thái | Ghi chú |
| --- | --- | --- | --- |
| Template giao diện `5f-template-ket-noi-supabase` | `00`, `06`, `domains/references/ui-delivery-detail.md` | Đã phủ | Template local ở `template_5fedu/5f-template-ket-noi-supabase-main` |
| Trang chủ theo thứ tự Quản lý vận tải -> Hệ thống -> Thông tin bản quyền | `06`, `07`, `domains/references/ui-delivery-detail.md` | Đã phủ | Là owner feedback DA_CHOT |
| Nhân viên có email thực tế riêng, không trộn fake auth email | `06`, `11`, `domains/references/ui-delivery-detail.md` | Đã phủ | Fake auth vẫn theo `ten_dang_nhap@gmail.com` |
| Không kết luận phòng ban/chức vụ rỗng khi chưa kiểm tra Supabase/browser | `06`, `domains/references/ui-delivery-detail.md`, `domains/references/ui-delivery-detail.md` | Đã phủ | DB hiện có dữ liệu; nếu UI trắng kiểm tra đường render/filter/env |
| Tài xế có thể là người ngoài công ty | `06`, `domains/references/ui-delivery-detail.md`, `11`, `domains/references/ui-delivery-detail.md` | Đã phủ | `id_nhan_vien` optional |
| Detail tài xế có lịch sử chuyến xe/lương | `06`, `07`, `domains/references/ui-delivery-detail.md` | Đã phủ | Không chỉ render field thô |
| Địa điểm/xe có form/detail chuẩn và lịch sử liên quan | `06`, `07`, `11`, `domains/references/ui-delivery-detail.md` | Đã phủ | Không CRUD generic hời hợt |
| Bảng lương dùng combobox tài xế | `06`, `07`, `domains/references/ui-delivery-detail.md`, `domains/references/ui-delivery-detail.md` | Đã phủ | Không dùng select thô |
| Bảng lương tự tính tổng lương chuyến, có trừ tiền khác/tổng còn lại/in/duyệt riêng | `06`, `07`, `domains/references/ui-delivery-detail.md`, `domains/references/ui-delivery-detail.md` | Đã phủ | Không nhập tay tổng nếu tính được |
| Chuyến xe cha tự tính tổng chuyến/tổng tiền từ chi tiết | `06`, `07`, `domains/references/ui-delivery-detail.md`, `domains/references/ui-delivery-detail.md` | Đã phủ | Không nhập tay tổng nếu có dữ liệu con |
| Thống kê chuyến đi làm đúng dashboard/report nghiệp vụ | `06`, `domains/references/ui-delivery-detail.md` | Đã phủ | Lọc theo ngày/chuyến/tài xế/địa điểm/xe, có lương/chi phí |


