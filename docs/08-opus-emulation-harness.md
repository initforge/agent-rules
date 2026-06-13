# Opus Emulation Harness — Composer & Gemini cùng đích

## Mục tiêu user

**Không phân việc theo model.** Harness nặng để **Composer lẫn Gemini** đều ra hiệu suất **đầu ra kiểu Opus** (bền, verify, đúng, không dừng non).

## Mô hình

```text
                    ┌─────────────────────┐
                    │ shared/opus-        │
                    │ emulation-contract  │  ← một lõi outcome
                    └─────────┬───────────┘
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        .grok/rules/    .agents/rules/    kiro/steering/
        (Composer)      (Gemini)          (Opus THẬT → mỏng)
```

- **Composer + Gemini:** cùng file `06-opus-emulation-contract` (nội dung đồng bộ từ `shared/`).
- **Opus (Kiro):** **không** dùng emulation — model đã có sẵn; harness mỏng tránh cắt trần.

## Emulate cái gì / không emulate cái gì

| Lấy từ Opus | Không lấy (ceremony) |
|---|---|
| Tự chủ, làm trước hỏi sau | Preflight 8 câu mọi lượt |
| Bền, chạy tới verify | 2 phương án mọi task |
| Root cause, regression | Status essay mọi chat |
| Template/permission gates | Tự sửa harness mỗi lỗi |

## Độ nặng

**Mặc định MEDIUM** — đa số việc nặng đô. HIGH khi DB/auth/5fedu UI/production.

## Sync

```bash
# Grok
./cursor/scripts/sync-harness.sh

# Antigravity live (từ master)
cp antigravity/.agents/rules/06-opus-emulation-contract.md .agents/rules/
# hoặc sync full antigravity adapter theo quy trình repo
```

Sửa lõi: `shared/opus-emulation-contract.md` → copy sang cả hai `06-*` platform.

## Kỳ vọng thực tế

Harness **nâng sàn** Composer/Gemini; không biến thành Opus 100% trên mọi task reasoning cực sâu. Nếu vẫn lệch → siết HIGH gates, không hạ tier.