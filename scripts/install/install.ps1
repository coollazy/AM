# AM 安裝腳本（Windows）：把 am.exe 安裝到 %LOCALAPPDATA%\Programs\am 並加入使用者 PATH
# 執行方式：在 PowerShell 中執行  powershell -ExecutionPolicy Bypass -File .\install.ps1
$ErrorActionPreference = "Stop"

$src = Join-Path $PSScriptRoot "am.exe"
$destDir = if ($env:AM_INSTALL_DIR) { $env:AM_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\am" }
$dest = Join-Path $destDir "am.exe"
$configDir = if ($env:AM_CONFIG_DIR) { $env:AM_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".am" }
$configFile = Join-Path $configDir "config.json"

if (-not (Test-Path $src)) { throw "找不到執行檔：$src" }

# 移除從網路下載的標記，避免執行時被阻擋
Unblock-File -Path $src

$startupFile = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\am-server.vbs"
$wasAutostart = Test-Path $startupFile

# 更新前先停止執行中的管理網站，否則執行檔被鎖住無法替換
$port = 4141
if (Test-Path $configFile) {
  try { $port = (Get-Content $configFile -Raw | ConvertFrom-Json).server.port } catch {}
}
try {
  Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/api/shutdown" -ContentType "application/json" `
    -Headers @{ Origin = "http://127.0.0.1:$port" } -Body "{}" -TimeoutSec 2 | Out-Null
} catch {}

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$copied = $false
for ($i = 0; $i -lt 20 -and -not $copied; $i++) {
  try {
    Copy-Item -Path $src -Destination $dest -Force
    $copied = $true
  } catch {
    Start-Sleep -Milliseconds 250
  }
}
if (-not $copied) { throw "無法替換 ${dest}，請確認 am 沒有在執行後再試一次" }
Write-Host "已安裝：${dest}（版本 $(& $dest --version)）"

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$parts = if ($userPath) { $userPath -split ";" } else { @() }
if ($parts -notcontains $destDir) {
  $newPath = if ($userPath) { "$userPath;$destDir" } else { $destDir }
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  Write-Host "已將 $destDir 加入使用者 PATH，請重新開啟終端機。"
}

if ($wasAutostart) { & $dest autostart on }

Write-Host ""
Write-Host "下一步："
Write-Host "  am web              開啟管理網站，新增服務商"
Write-Host "  am autostart on     開機自動執行管理網站"
Write-Host "  am                  選擇服務商與模型後啟動 Claude Code"
