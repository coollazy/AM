#!/bin/sh
# AM 安裝腳本（macOS）：把 am 安裝到 ~/.local/bin；已安裝時更新並保留開機自動執行設定
set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/am"
DEST_DIR="${AM_INSTALL_DIR:-$HOME/.local/bin}"
DEST="$DEST_DIR/am"
PORT_FILE="${AM_CONFIG_DIR:-$HOME/.am}/config.json"

if [ ! -f "$SRC" ]; then
  echo "找不到執行檔：$SRC" >&2
  exit 1
fi

# 從網路下載的檔案會被 macOS 標記隔離，移除後才能執行
xattr -d com.apple.quarantine "$SRC" 2>/dev/null || true
chmod +x "$SRC"

was_autostart=0
if [ -f "$HOME/Library/LaunchAgents/local.am.server.plist" ]; then
  was_autostart=1
fi

# 更新前先停止執行中的管理網站
port=4141
if [ -f "$PORT_FILE" ]; then
  p=$(sed -n 's/.*"port": *\([0-9][0-9]*\).*/\1/p' "$PORT_FILE" | head -n 1)
  [ -n "$p" ] && port="$p"
fi
curl -s -m 2 -X POST -H "Origin: http://127.0.0.1:$port" -H "Content-Type: application/json" -d '{}' \
  "http://127.0.0.1:$port/api/shutdown" >/dev/null 2>&1 || true
sleep 0.5

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST.tmp"
mv "$DEST.tmp" "$DEST"
chmod +x "$DEST"
echo "已安裝：${DEST}（版本 $("$DEST" --version)）"

if [ "$was_autostart" = 1 ]; then
  "$DEST" autostart on
fi

case ":$PATH:" in
  *":$DEST_DIR:"*) ;;
  *)
    echo ""
    echo "注意：$DEST_DIR 不在 PATH 中。請在 ~/.zshrc 加入下面這行後重新開啟終端機："
    echo "  export PATH=\"$DEST_DIR:\$PATH\""
    ;;
esac

echo ""
echo "下一步："
echo "  am web              開啟管理網站，新增服務商"
echo "  am autostart on     開機自動執行管理網站"
echo "  am                  選擇服務商與模型後啟動 Claude Code"
