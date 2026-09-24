# Windows 實機驗證：執行打包好的 am.exe 與安裝腳本（由 .github/workflows/test.yml 呼叫）
# 需要 dist/release/ 下有 am-windows-x64.zip 與 SHA256SUMS.txt
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$failures = 0
function Check($label, $ok) {
  if ($ok) { Write-Host "PASS  $label" } else { Write-Host "FAIL  $label"; $script:failures++ }
}

$repoRoot = Resolve-Path "$PSScriptRoot\..\.."
$version = (Get-Content "$repoRoot\package.json" -Raw | ConvertFrom-Json).version
$root = Join-Path $env:RUNNER_TEMP "am-smoke"
Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $root | Out-Null

# 使用獨立的設定目錄與埠號
$port = 4999
$base = "http://127.0.0.1:$port"
$env:AM_CONFIG_DIR = Join-Path $root "conf"
New-Item -ItemType Directory -Force -Path $env:AM_CONFIG_DIR | Out-Null
Set-Content -Path (Join-Path $env:AM_CONFIG_DIR "config.json") -Value "{`"server`":{`"port`":$port}}" -Encoding ascii
$origin = @{ Origin = $base }
$startupFile = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\am-server.vbs"

function Health {
  try { return (Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 2).app -eq "am" } catch { return $false }
}
function WaitHealth($expected, $seconds = 10) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if ((Health) -eq $expected) { return $true }
    Start-Sleep -Milliseconds 300
  }
  return $false
}
function StopServer {
  try { Invoke-RestMethod -Method Post -Uri "$base/api/shutdown" -ContentType "application/json" -Headers $origin -Body "{}" | Out-Null } catch {}
  WaitHealth $false | Out-Null
}
function ServerExe {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $null }
  return (Get-Process -Id $conn.OwningProcess).Path
}

# ---- 解壓縮 ----
Expand-Archive -Path "$repoRoot\dist\release\am-windows-x64.zip" -DestinationPath (Join-Path $root "zip")
$pkg = Join-Path $root "zip\am-windows-x64"
$am = Join-Path $pkg "am.exe"

Write-Host "== 基本執行"
Check "am.exe --version 為 $version" ((& $am --version) -eq $version)
$help = (& $am --help) -join "`n"
Check "說明文字以 UTF-8 正確輸出中文" ($help.Contains("選擇服務商與模型後啟動 Claude Code"))

Write-Host "== 管理網站"
$proc = Start-Process -FilePath $am -ArgumentList "server" -WindowStyle Hidden -PassThru
Check "am server 啟動" (WaitHealth $true)
& $am server | Out-Null
Check "重複啟動時直接結束（不重複綁定埠號）" ($LASTEXITCODE -eq 0 -and @(Get-NetTCPConnection -LocalPort $port -State Listen).Count -eq 1)
$body = '{"type":"api","name":"Demo","baseUrl":"https://example.invalid","apiKey":"sk-demo-1234567890"}'
$created = Invoke-RestMethod -Method Post -Uri "$base/api/providers" -ContentType "application/json" -Headers $origin -Body $body
Check "新增服務商並遮蔽 API key" ($created.providers[1].apiKeyMasked -eq "sk-****7890")
$saved = Get-Content (Join-Path $env:AM_CONFIG_DIR "config.json") -Raw | ConvertFrom-Json
Check "設定檔寫入完整 API key" ($saved.providers[1].apiKey -eq "sk-demo-1234567890")
$evil = Invoke-WebRequest -Method Post -Uri "$base/api/providers" -ContentType "application/json" -Headers @{ Origin = "https://evil.example.com" } -Body $body -SkipHttpErrorCheck
Check "拒絕其他網站的請求（403）" ($evil.StatusCode -eq 403)
$page = Invoke-WebRequest -Uri "$base/" -UseBasicParsing
$js = [regex]::Match($page.Content, '/chunk-[a-z0-9]+\.js').Value
Check "網頁與前端程式可載入" ($page.StatusCode -eq 200 -and $js -and (Invoke-WebRequest -Uri "$base$js" -UseBasicParsing).StatusCode -eq 200)
StopServer
Check "關閉 API 停止網站" (-not (Health))

Write-Host "== Claude Code 檢查"
$savedPath = $env:Path
$env:Path = "$env:SystemRoot\System32;$env:SystemRoot"
$out = (& $am 2>&1) -join "`n"
Check "找不到 claude 時提示安裝（結束代碼 1）" ($LASTEXITCODE -eq 1 -and $out.Contains("找不到 Claude Code"))
$fake = Join-Path $root "fake-claude"
New-Item -ItemType Directory -Force -Path $fake | Out-Null
Set-Content -Path (Join-Path $fake "claude.cmd") -Value "@echo off" -Encoding ascii
$env:Path = "$fake;$env:SystemRoot\System32;$env:SystemRoot"
$out = (& $am 2>&1) -join "`n"
Check "找得到 claude.cmd，進入選單（非終端機環境時提示）" ($out.Contains("am 選單需要在終端機中執行"))
$env:Path = $savedPath

Write-Host "== 開機自動執行"
& $am autostart on | Out-Null
Check "autostart on 建立啟動資料夾腳本" (Test-Path $startupFile)
Check "autostart on 在背景啟動網站" (WaitHealth $true)
Check "啟動腳本指向 am.exe" ((Get-Content $startupFile -Raw).Contains($am))
$status = (& $am autostart status) -join "`n"
Check "autostart status 顯示開啟" ($status.Contains("開機自動執行：開啟"))
StopServer
Start-Process -FilePath "wscript.exe" -ArgumentList "//B", "`"$startupFile`""
Check "執行啟動資料夾腳本（模擬登入）能在背景啟動網站" (WaitHealth $true 15)
& $am autostart off | Out-Null
Check "autostart off 移除啟動資料夾腳本" (-not (Test-Path $startupFile))
Check "autostart off 停止網站" (WaitHealth $false)

Write-Host "== 安裝：壓縮檔（Windows PowerShell 5.1，-File）"
$bin1 = Join-Path $root "bin1"
$env:AM_INSTALL_DIR = $bin1
$env:AM_NO_PROMPT = "1"
$check51 = & powershell.exe -NoProfile -Command "(Get-Content -Raw '$pkg\install.ps1').Contains('已安裝')"
Check "PowerShell 5.1 正確讀取壓縮檔內 install.ps1 的中文（BOM）" ($check51 -eq "True")
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$pkg\install.ps1" | Out-Null
Check "安裝腳本執行成功" ($LASTEXITCODE -eq 0)
Check "安裝到指定目錄且版本正確" ((Test-Path "$bin1\am.exe") -and ((& "$bin1\am.exe" --version) -eq $version))
Check "加入使用者 PATH" (([Environment]::GetEnvironmentVariable("Path", "User") -split ";") -contains $bin1)

Write-Host "== 安裝：一行指令（Windows PowerShell 5.1，irm | iex），網站執行中時更新"
$serve = Join-Path $root "serve"
Copy-Item -Recurse "$repoRoot\dist\release" $serve
$http = Start-Process -FilePath "python" -ArgumentList "-m", "http.server", "8765", "--bind", "127.0.0.1", "--directory", $serve -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2
$bin2 = Join-Path $root "bin2"
$env:AM_INSTALL_DIR = $bin2
$env:AM_DOWNLOAD_URL = "http://127.0.0.1:8765"
# 安裝腳本從 GitHub 真正的網址下載（這次推送的 commit）
$url = "https://raw.githubusercontent.com/$env:GITHUB_REPOSITORY/$env:GITHUB_SHA/scripts/install/install.ps1"
$decoded = & powershell.exe -NoProfile -Command "(irm '$url').Contains('已安裝')"
Check "PowerShell 5.1 以 irm 下載的 install.ps1 中文解碼正確" ($decoded -eq "True")
Start-Process -FilePath "$bin1\am.exe" -ArgumentList "server" -WindowStyle Hidden
Check "更新前網站執行中（舊版位置）" ((WaitHealth $true) -and ((ServerExe) -eq "$bin1\am.exe"))
& powershell.exe -NoProfile -Command "irm '$url' | iex" | Out-Null
Check "一行指令執行成功" ($LASTEXITCODE -eq 0)
Check "安裝到指定目錄且版本正確" ((Test-Path "$bin2\am.exe") -and ((& "$bin2\am.exe" --version) -eq $version))
Check "更新後網站以新位置重新啟動" ((WaitHealth $true) -and ((ServerExe) -eq "$bin2\am.exe"))
StopServer
Stop-Process -Id $http.Id -Force -ErrorAction SilentlyContinue

Write-Host ""
if ($failures -gt 0) {
  Write-Host "$failures 項失敗"
  exit 1
}
Write-Host "全部通過"
