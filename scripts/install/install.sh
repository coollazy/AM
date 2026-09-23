#!/bin/sh
# AM 安裝腳本（macOS）
#
# 一行指令安裝（自動下載最新版）：
#   curl -fsSL https://raw.githubusercontent.com/coollazy/AM/master/scripts/install/install.sh | sh
# 也可以在解壓縮後的安裝包資料夾中執行 ./install.sh，直接安裝旁邊的執行檔。
#
# 可用環境變數：
#   AM_VERSION       指定版本，例如 v0.1.0（預設最新版）
#   AM_INSTALL_DIR   安裝目錄（預設 ~/.local/bin）
#   AM_NO_PROMPT=1   不詢問，略過開機自動執行與開啟網站
#   AM_NO_MODIFY_PATH=1  不修改 shell 設定檔
#   AM_DOWNLOAD_URL  下載位置（預設 GitHub Releases，可指向鏡像站或測試伺服器）
set -eu

REPO="coollazy/AM"
DEST_DIR="${AM_INSTALL_DIR:-$HOME/.local/bin}"
DEST="${DEST_DIR}/am"
CONFIG_FILE="${AM_CONFIG_DIR:-$HOME/.am}/config.json"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/local.am.server.plist"

say() { printf '%s\n' "$*"; }
fail() { printf '錯誤：%s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "此安裝腳本只支援 macOS；Windows 請使用 install.ps1"

# 在終端機詢問是/否，預設「是」；透過 curl | sh 執行時從 /dev/tty 讀取回答
ask() {
  [ "${AM_NO_PROMPT:-}" = "1" ] && return 1
  [ -r /dev/tty ] || return 1
  printf '%s [Y/n] ' "$1"
  read -r answer </dev/tty || return 1
  case "$answer" in [nN]*) return 1 ;; *) return 0 ;; esac
}

WORK=""
cleanup() { [ -n "$WORK" ] && rm -rf "$WORK"; }
trap cleanup EXIT

# 取得要安裝的執行檔：以檔案執行且旁邊有 am 時用旁邊的，否則從 GitHub Releases 下載
SRC=""
case "$0" in
  *install.sh)
    DIR="$(cd "$(dirname "$0")" && pwd)"
    [ -f "$DIR/am" ] && SRC="$DIR/am"
    ;;
esac

if [ -z "$SRC" ]; then
  # Rosetta 下的 shell 會回報 x86_64，改問硬體是否支援 arm64
  if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then arch="arm64"; else arch="x64"; fi
  asset="am-macos-${arch}.zip"
  if [ -n "${AM_DOWNLOAD_URL:-}" ]; then
    base="${AM_DOWNLOAD_URL%/}"
  elif [ -n "${AM_VERSION:-}" ]; then
    base="https://github.com/${REPO}/releases/download/${AM_VERSION}"
  else
    base="https://github.com/${REPO}/releases/latest/download"
  fi
  WORK="$(mktemp -d)"
  say "下載 ${asset}…"
  curl -fL --progress-bar -o "$WORK/$asset" "$base/$asset" || fail "下載失敗：$base/$asset"
  curl -fsSL -o "$WORK/SHA256SUMS.txt" "$base/SHA256SUMS.txt" || fail "下載檢查碼失敗"
  expected="$(grep " ${asset}\$" "$WORK/SHA256SUMS.txt" | cut -d ' ' -f 1)"
  actual="$(shasum -a 256 "$WORK/$asset" | cut -d ' ' -f 1)"
  [ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "檢查碼不符，檔案可能損壞，請重新執行"
  (cd "$WORK" && unzip -q "$asset")
  SRC="$WORK/am-macos-${arch}/am"
fi

# 從網路下載的檔案會被 macOS 標記隔離，移除後才能執行
xattr -d com.apple.quarantine "$SRC" 2>/dev/null || true
chmod +x "$SRC"

was_installed=0
[ -x "$DEST" ] && was_installed=1
was_autostart=0
[ -f "$LAUNCH_AGENT" ] && was_autostart=1

# 更新前先停止執行中的管理網站
port=4141
if [ -f "$CONFIG_FILE" ]; then
  p=$(sed -n 's/.*"port": *\([0-9][0-9]*\).*/\1/p' "$CONFIG_FILE" | head -n 1)
  [ -n "$p" ] && port="$p"
fi
was_running=0
curl -s -m 2 "http://127.0.0.1:${port}/api/health" 2>/dev/null | grep -q '"app":"am"' && was_running=1
curl -s -m 2 -X POST -H "Origin: http://127.0.0.1:${port}" -H "Content-Type: application/json" -d '{}' \
  "http://127.0.0.1:${port}/api/shutdown" >/dev/null 2>&1 || true
sleep 0.5

mkdir -p "$DEST_DIR"
cp "$SRC" "${DEST}.tmp"
mv "${DEST}.tmp" "$DEST"
chmod +x "$DEST"
say ""
say "已安裝：${DEST}（版本 $("$DEST" --version)）"

# 讓新開的終端機找得到 am
case ":$PATH:" in
  *":${DEST_DIR}:"*) ;;
  *)
    if [ "${AM_NO_MODIFY_PATH:-}" = "1" ]; then
      say "請把 ${DEST_DIR} 加入 PATH：export PATH=\"${DEST_DIR}:\$PATH\""
    else
      case "${SHELL:-}" in
        */bash) rc="$HOME/.bash_profile" ;;
        */zsh | "") rc="$HOME/.zshrc" ;;
        *) rc="$HOME/.profile" ;;
      esac
      line="export PATH=\"${DEST_DIR}:\$PATH\""
      if ! grep -qsF "$line" "$rc"; then
        printf '\n# AM（Agent Account Manager）\n%s\n' "$line" >>"$rc"
        say "已將 ${DEST_DIR} 加入 PATH（寫入 ${rc}），新開的終端機即可使用 am。"
      fi
    fi
    ;;
esac

if [ "$was_autostart" = 1 ]; then
  "$DEST" autostart on >/dev/null && say "已重新啟動管理網站（開機自動執行維持開啟）"
elif [ "$was_running" = 1 ]; then
  nohup "$DEST" server >/dev/null 2>&1 &
  say "已重新啟動管理網站"
elif [ "$was_installed" = 0 ]; then
  say ""
  if ask "要開啟開機自動執行管理網站嗎？"; then
    "$DEST" autostart on
  fi
  if ask "要現在打開管理網站，新增服務商嗎？"; then
    "$DEST" web
  fi
fi

say ""
say "使用方式："
say "  am web              開啟管理網站，新增服務商"
say "  am                  選擇服務商與模型後啟動 Claude Code"
say "  am autostart on     開機自動執行管理網站"
