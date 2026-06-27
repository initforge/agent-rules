#!/usr/bin/env bash
# Install Antigravity rules, skills, and workflows globally (Linux/macOS)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ANT_GLOBAL_DIR="$HOME/.gemini/config"

echo "== Installing Antigravity Global Customizations =="

# 1. Ensure target directories exist
mkdir -p "$ANT_GLOBAL_DIR/rules" "$ANT_GLOBAL_DIR/skills" "$ANT_GLOBAL_DIR/workflows"

# 2. Sync rules (excluding codex-overlay.md)
echo "Syncing rules to global..."
find "$ANT_GLOBAL_DIR/rules" -maxdepth 1 -type f -name '*.md' ! -name 'antigravity-overlay.md' -delete 2>/dev/null || true
for f in "$ROOT/rules"/*.md; do
  base="$(basename "$f")"
  [[ "$base" == "00-codex-runtime-intent.md" || "$base" == "default.rules" ]] && continue
  cp "$f" "$ANT_GLOBAL_DIR/rules/$base"
done

# Copy antigravity-overlay.md specifically
if [[ -f "$ROOT/platforms/antigravity/.agents/rules/antigravity-overlay.md" ]]; then
  cp "$ROOT/platforms/antigravity/.agents/rules/antigravity-overlay.md" "$ANT_GLOBAL_DIR/rules/antigravity-overlay.md"
fi

# 3. Refresh YAML frontmatter for global rules
FM_SCRIPT="$ROOT/platforms/antigravity/scripts/add-rules-frontmatter.ps1"
if [[ -f "$FM_SCRIPT" ]]; then
  if command -v pwsh >/dev/null 2>&1; then
    pwsh -NoProfile -File "$FM_SCRIPT" -RulesDir "$ANT_GLOBAL_DIR/rules"
  elif command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -File "$FM_SCRIPT" -RulesDir "$ANT_GLOBAL_DIR/rules"
  else
    echo "[WARN] PowerShell not found — global rules copied without frontmatter update"
  fi
fi

# 4. Sync skills (excluding _archive)
echo "Syncing skills to global..."
SKILL_RSYNC_EX=(--exclude '_archive' --exclude '_archive/**')
rsync -a --delete "${SKILL_RSYNC_EX[@]}" "$ROOT/skills/" "$ANT_GLOBAL_DIR/skills/"

# 5. Sync workflows to global
echo "Syncing workflows to global..."
rsync -a --delete "$ROOT/workflows/" "$ANT_GLOBAL_DIR/workflows/"

# 6. Install global GEMINI.md setup
GEMINI_GLOBAL="$HOME/.gemini/GEMINI.md"
echo "Installing global GEMINI.md..."
mkdir -p "$HOME/.gemini"
if [[ -f "$ROOT/platforms/antigravity/GEMINI.md" ]]; then
  cp "$ROOT/platforms/antigravity/GEMINI.md" "$GEMINI_GLOBAL"
else
  cat << 'EOF' > "$GEMINI_GLOBAL"
# Antigravity Global Rules

Quy tắc toàn cục áp dụng cho mọi phiên làm việc và mọi cuộc hội thoại trên hệ thống Google Antigravity.

## 1. Quy tắc Ngôn ngữ & Giao tiếp
- **Ngôn ngữ phản hồi**: Mặc định luôn sử dụng **Tiếng Việt có dấu đầy đủ** để giao tiếp với người dùng.
- **Thuật ngữ kỹ thuật**: Giữ nguyên tiếng Anh cho các thuật ngữ chuyên môn, tên công cụ, API, package, đường dẫn (path), lệnh shell, model, và mã nguồn (code) để tránh hiểu sai nghĩa.

## 2. Trạng thái kết thúc (Final Status)
Mọi nhiệm vụ (task) khi hoàn thành hoặc dừng lại đều phải trả về trạng thái rõ ràng ở cuối phản hồi bằng một trong các nhãn sau:
- **`PASS`**: Khi nhiệm vụ được hoàn thành đầy đủ và đã được xác thực thành công bằng bằng chứng cụ thể.
- **`PARTIAL`**: Khi chỉ hoàn thành một phần nhiệm vụ do giới hạn kỹ thuật hoặc cần thêm thông tin từ người dùng.
- **`BLOCKED`**: Khi không thể tiếp tục thực hiện do gặp lỗi nghiêm trọng hoặc thiếu điều kiện cần thiết.
EOF
fi

echo "Antigravity global installation complete."
echo "  Rules:      $ANT_GLOBAL_DIR/rules ($(find "$ANT_GLOBAL_DIR/rules" -maxdepth 1 -name '*.md' | wc -l) files)"
echo "  Skills:     $ANT_GLOBAL_DIR/skills"
echo "  Workflows:  $ANT_GLOBAL_DIR/workflows"
