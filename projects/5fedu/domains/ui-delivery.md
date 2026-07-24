# UI parity và delivery gates

**Vai trò:** Hợp đồng đọc nhanh cho UI 5fedu. Tài liệu này giải thích cách chọn và chứng minh parity; `references/pattern-inventory.yaml` là hợp đồng máy đọc theo từng surface, còn checklist clone/audit chỉ nằm ở `module-mapping.md`.

## Từ vựng chung

| Khái niệm | Nghĩa và cách dùng |
|---|---|
| **Surface** | Một bề mặt người dùng có mục tiêu và vòng đời riêng, như list CRUD, form drawer, detail drawer, stats hoặc hierarchy. Chọn surface trước khi chọn component. |
| **Shell** | Chrome, bố cục, primitive, hành vi, state, motion và responsive đã có trong reference. Shell phải fidelity chính xác, trừ deviation được duyệt. |
| **Variable slot** | Nội dung nghiệp vụ của module: field/schema, chip/filter, cột, KPI, export, action được phép. Lấy từ spec/schema dự án, không copy mù từ Nhân viên. |
| **Reference** | File/route template đã mở và xác nhận khớp surface + behavior. Module quen tay hoặc ảnh chụp không phải reference. |
| **Parity packet** | Bằng chứng gồm template identity/snapshot, surface + paths đã mở, map shell/state/motion/responsive, variable map, deviation được duyệt và verification. |

`surface-taxonomy.md` giúp gọi đúng tên và composition; `module-mapping.md` chọn baseline; inventory liệt kê invariant cụ thể. Không diễn giải lại danh sách `shell_must` ở đây.

## Nguồn chuẩn và local-template workflow

Trước khi sửa UI/module, tìm template **trong workspace đang làm** theo anchors của inventory (package identity, `features/he-thong/nhan-vien`, `GenericToolbar`, `GenericDrawer`). Không mã hóa đường dẫn máy cá nhân. Không có candidate thì dừng parity slice và xin owner cung cấp/copy template; nhiều candidate hoặc identity mơ hồ thì xin owner chỉ template chuẩn.

1. Ghi template identity và Git commit; nếu không có Git, ghi hash xác định của các anchor đã mở.
2. Chọn surface rồi mở đầy đủ template path của reference **và** route/feature target. Đối chiếu bằng mắt cấu trúc DOM, class, primitive và interaction; static context, URL remote, screenshot hay trí nhớ không thay thế code local.
3. Map riêng shell (behavior, state, motion, responsive) và variable slot (nguồn spec/schema). Không copy lỗi chức năng chỉ vì nó có trong visual reference.
4. Áp dụng clone hoặc audit checklist ở `module-mapping.md`; khi template không có behavior cần thiết, mới dùng compatible live-app primitive và ghi rõ lý do.

Thứ tự quyết định là: (1) custom được owner/spec hiện hành phê duyệt trong scope, (2) schema/spec cho variable business content, (3) code template local đã verify cho shell/behavior/state/motion/responsive, (4) primitive app tương thích khi template không cung cấp behavior. Mâu thuẫn không tự suy đoán: khoanh vùng và hỏi owner.

## Deviation có phạm vi

Mặc định là fidelity tuyệt đối ngoài variable slot. Custom chỉ hợp lệ khi owner hoặc accepted spec gọi tên rõ behavior khác chuẩn. Parity packet phải ghi: nguồn phê duyệt, surface bị ảnh hưởng, invariant thay đổi, lý do, invariant vẫn giữ và proof. Custom của một dự án không tự trở thành luật 5fedu chung.

## Delivery gates

- Tạo mới/sửa module: load inventory surface khớp, rồi dùng §Clone hoặc §Audit tại `module-mapping.md`.
- User báo lệch/sai pattern: audit toàn surface liên quan; phân biệt toolbar filter chip với form combobox, và form/detail drawer là cặp reference.
- Không generic hóa feature để né structure của reference. Report parity phải nêu `Shell parity` và `Variable map`, không lặp toàn bộ inventory.
- Navigation, breadcrumb, motion/accessibility và proof interaction: xem lazy detail tại `references/ui-delivery-detail.md`.
- PASS chỉ khi parity packet đủ và evidence phù hợp risk. Local proof mặc định gồm lint/typecheck/build/tests phù hợp + interaction check (add drawer, row-click detail, form popup, filter/dropdown); kiểm tra desktop và mobile khi surface hỗ trợ mobile. Production/screenshot chỉ bắt buộc khi owner yêu cầu deploy/production proof.
