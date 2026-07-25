# UI parity và delivery gates

**Vai trò:** Hợp đồng đọc nhanh cho UI 5fedu. Tài liệu này giải thích cách chọn và chứng minh parity; `references/pattern-inventory.yaml` là hợp đồng máy đọc theo từng surface, còn checklist clone/audit chỉ nằm ở `module-mapping.md`.

## Từ vựng chung

| Khái niệm | Nghĩa và cách dùng |
|---|---|
| **Surface** | Một bề mặt người dùng có mục tiêu và vòng đời riêng, như list CRUD, form drawer, detail drawer, stats hoặc hierarchy. Chọn surface trước khi chọn component. |
| **Shell** | Chrome, bố cục, primitive, hành vi, state, motion và responsive đã có trong reference. Shell phải fidelity chính xác, trừ deviation được duyệt. |
| **Variable slot** | Nội dung nghiệp vụ của module: field/schema, chip/filter, cột, KPI, export, action được phép. Lấy từ spec/schema dự án, không copy mù từ Nhân viên. |
| **Reference** | File/route template đã mở và xác nhận khớp surface + behavior. Module quen tay hoặc ảnh chụp không phải reference. |
| **Parity packet** | Thư mục `parity/<module>/` gồm: source.lock.yaml (template identity/snapshot), target.yaml (module/surfaces), structural-map.yaml (source→target mapping), visual-contract.yaml (shell_must + variable slots), behavior-contract.yaml (behaviors/states/motion), architecture-adaptation.yaml (preserve/must_not_copy), deviations.yaml (approved deviations), proof.yaml (verification evidence). |

`surface-taxonomy.md` giúp gọi đúng tên và composition; `module-mapping.md` chọn baseline; inventory liệt kê invariant cụ thể. Không diễn giải lại danh sách `shell_must` ở đây.

## Nguồn chuẩn và source-lock workflow

Trước khi sửa UI/module, resolve source lock và materialize pinned revision từ `source-lock.json`:

1. **Resolve source lock**: đọc `source-lock.json` (project → harness). Xác nhận commit SHA là exact full 40-char — không floating branch.
2. **Materialize**: dùng `14-materialize-template-source.ps1` để fetch/cache đúng revision. Nếu cache miss và không có network/local override → dừng parity slice.
3. **Verify integrity**: tree hash so khớp với locked integrity hash.
4. **Expose module (optional)**: extract chỉ module cần + dependencies từ module-index trong source-lock.json + module-inventory.yaml.
5. **Record**: ghi template revision, materialized path, verification state vào plan/evidence.
6. **Detect drift**: so HEAD với locked commit → cảnh báo stale.

Nếu không có source-lock, dùng legacy flow: tìm template **trong workspace đang làm** theo anchors của inventory (package identity, `features/he-thong/nhan-vien`, `GenericToolbar`, `GenericDrawer`). Không mã hóa đường dẫn máy cá nhân. Không có candidate thì dừng parity slice và xin owner cung cấp/copy template; nhiều candidate hoặc identity mơ hồ thì xin owner chỉ template chuẩn.

1. Ghi template identity và Git commit; nếu không có Git, ghi hash xác định của các anchor đã mở.
2. Chọn surface rồi mở đầy đủ template path của reference **và** route/feature target. Đối chiếu bằng mắt cấu trúc DOM, class, primitive và interaction; static context, URL remote, screenshot hay trí nhớ không thay thế code local.
3. Map riêng shell (behavior, state, motion, responsive) và variable slot (nguồn spec/schema). Không copy lỗi chức năng chỉ vì nó có trong visual reference.
4. Áp dụng clone hoặc audit checklist ở `module-mapping.md`; khi template không có behavior cần thiết, mới dùng compatible live-app primitive và ghi rõ lý do.

Thứ tự quyết định là: (1) custom được owner/spec hiện hành phê duyệt trong scope, (2) schema/spec cho variable business content, (3) code template local đã verify cho shell/behavior/state/motion/responsive, (4) primitive app tương thích khi template không cung cấp behavior. Mâu thuẫn không tự suy đoán: khoanh vùng và hỏi owner.

## Deviation có phạm vi

Mặc định là fidelity tuyệt đối ngoài variable slot. Custom chỉ hợp lệ khi owner hoặc accepted spec gọi tên rõ behavior khác chuẩn. Ghi deviation vào `deviations.yaml` trong parity packet: nguồn phê duyệt, surface bị ảnh hưởng, invariant thay đổi, lý do, invariant vẫn giữ và proof. Custom của một dự án không tự trở thành luật 5fedu chung.

## Delivery gates

- Tạo mới/sửa module: load inventory surface khớp, tạo/cập nhật parity packet tại `parity/<module>/`, rồi dùng §Clone hoặc §Audit tại `module-mapping.md`.
- User báo lệch/sai pattern: audit toàn surface liên quan; cập nhật packet; phân biệt toolbar filter chip với form combobox, và form/detail drawer là cặp reference.
- Không generic hóa feature để né structure của reference. Report parity phải nêu `Shell parity` (structural-map.yaml + visual-contract.yaml) và `Variable map` (visual-contract.yaml variables), không lặp toàn bộ inventory.
- Navigation, breadcrumb, motion/accessibility và proof interaction: xem lazy detail tại `references/ui-delivery-detail.md`.
- PASS chỉ khi parity packet đủ (validate theo `parity/schemas/`) và evidence phù hợp risk. Local proof mặc định gồm lint/typecheck/build/tests phù hợp + interaction check (add drawer, row-click detail, form popup, filter/dropdown); kiểm tra desktop và mobile khi surface hỗ trợ mobile. Production/screenshot chỉ bắt buộc khi owner yêu cầu deploy/production proof.
