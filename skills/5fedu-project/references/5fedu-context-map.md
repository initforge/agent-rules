# 5fedu lean context map

Reference này mô tả pack được cài. Khi làm việc trong ứng dụng, đọc
`<active-repo>/context/5fedu/`; profile harness chỉ phát hành phần managed.

## Layout canonical

```text
context/5fedu/
├── README.md
├── rules/
├── behaviors/
├── module-mapping/
└── project-local/        # optional, project-owned, preserved
```

Load nhỏ nhất theo nhu cầu:

- Bắt đầu ở `README.md`.
- Load một rule khớp business, data/auth hoặc permission intent.
- Load behavior khi cần activation/lifecycle.
- Load module mapping khi cần chọn vai trò module, UI contract hoặc source
  đã xác minh.
- Chỉ load `project-local/` của project đang active.

## G-09 — Registry truth

Registry hiện có đúng `tah-app` và `nostime`; owner có thể duyệt thêm project
bằng một registry change riêng. Mỗi entry chỉ giữ định danh, vai trò,
repository URL và verified commit; không được lưu đường dẫn tuyệt đối trên máy
phát triển.

## G-04 — Decision guard

- `DA_CHOT`: thực thi theo quyết định đã duyệt, không hỏi lại.
- Chưa chốt, mâu thuẫn hoặc có rủi ro: hỏi owner hoặc chặn đúng phần việc bị
  ảnh hưởng; không phát minh fact.
- Context project-local có ưu tiên với điều kiện riêng của project. Claim dùng
  chung chỉ được promote qua `context-evolution-protocol`.

## Capability handoff

Nếu intent là clone/adapt module hoặc sửa UI lệch contract, kích hoạt
`5fedu-module-parity` và để skill đó sở hữu workflow, packet và verification.
