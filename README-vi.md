# Agent Rules

Agent Rules là canonical source, portable compiler, shallow native installer và
truthful doctor. Nó cài instructions, skills và MCP tự chứa rồi rời khỏi normal
session path của host.

## Luồng làm việc hằng ngày

1. Chọn model trong host.
2. Dùng Plan Mode native cho việc không đơn giản.
3. Để chính model đó implement plan từ đầu đến cuối.
4. Model resolve explicit skill và deterministic repository facts đúng một lần
   qua native discovery; base rules đã cài luôn là fallback.
5. Chạy focused proof cho seam vừa đổi; broad regression chỉ chạy một lần ở
   release gate hoặc khi có rủi ro vật chất.

Agent Rules không tạo `.agent`, không chạy callback/launcher/daemon trong host
session; plan và progress luôn do native host quản lý.

## Thành phần chính

| Thành phần | Nguồn canonical | Trách nhiệm |
|---|---|---|
| Rules | `rules/` | safety, execution, proof và context luôn bật |
| Skills | `skills/` | quy trình lazy theo đúng loại việc |
| Diagnostic router | `packages/kernel/src/northstar/native-turn-router.ts` | chỉ dùng cho build-time và explicit diagnostic tests |
| Proof | `packages/kernel/src/harness/evidence/` | proof rẻ nhất đủ dùng, reuse và recheck có giới hạn |
| Health | `packages/kernel/src/northstar/health-contract.ts` | trạng thái từng cơ chế và fail-closed reduction |
| Host contracts | `platforms/platform-contracts.json` | surface native, giới hạn và cách readback của từng host |
| Compiler/installer | `automation/`, `packages/cli/src/` | immutable candidate và static projection/readback/rollback theo transaction |
| Domain packs | `profiles/` | kiến thức domain explicit-only như `5fedu` |
| Integrations | `integrations/` | MCP/tool automatic hoặc explicit-only |

`generated/` và các bản đã cài chỉ là projection; không sửa tay.

## Cài và chẩn đoán

```bash
npm ci
npm run build
node packages/cli/dist/index.js install --all
node packages/cli/dist/index.js doctor --all --json
```

Luồng operator:

```bash
# Cài lần đầu, có thể chọn explicit profile
agent-rules install --all --profile 5fedu

# Update; nếu không truyền profile thì giữ lựa chọn hiện tại
agent-rules update --all

# Thay hoặc xóa profile selection
agent-rules update --all --profile 5fedu
agent-rules update --all --clear-profiles

# Quay lại generation agent-rules sở hữu ngay trước đó
agent-rules rollback codex
```

Installer chỉ thay đổi file do harness sở hữu hoặc đã chứng minh parity. Xung
đột ownership trả `NEEDS_USER`; host không có mặt trả `UNSUPPORTED` hoặc
`UNAVAILABLE`, không được báo native PASS giả.

Các lệnh public:

```text
install  update  rollback  uninstall  doctor  status  integration  reference  route-native
```

## Phát triển

```bash
npm run build
npm run check
npm test
npm run verify:all
```

`verify:all` là release gate tích hợp duy nhất và gồm clean packed static
install/update/doctor/source-state-independence/rollback. `5fedu` và Pencil vẫn explicit-only; từ khóa ERP, UI
hoặc design không tự kích hoạt chúng.
