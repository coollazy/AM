# AM 安裝腳本（Windows）
#
# 一行指令安裝（在 PowerShell 中執行，自動下載最新版）：
#   irm https://raw.githubusercontent.com/coollazy/AM/master/scripts/install/install.ps1 | iex
# 也可以在解壓縮後的安裝包資料夾中執行：
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#
# 可用環境變數：AM_VERSION（例如 v1.0.0）、AM_INSTALL_DIR、AM_NO_PROMPT=1、AM_DOWNLOAD_URL（下載位置，預設 GitHub Releases）
#
# 以一行指令執行時，腳本在使用者目前的 PowerShell 中執行，出錯時用 throw，不可用 exit（會關掉視窗）
& {
  $ErrorActionPreference = "Stop"
  $ProgressPreference = "SilentlyContinue"
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $repo = "coollazy/AM"
  $destDir = if ($env:AM_INSTALL_DIR) { $env:AM_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\am" }
  $dest = Join-Path $destDir "am.exe"
  $configDir = if ($env:AM_CONFIG_DIR) { $env:AM_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".am" }
  $configFile = Join-Path $configDir "config.json"
  $startupFile = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\am-server.vbs"

  function Ask($question) {
    if ($env:AM_NO_PROMPT -eq "1") { return $false }
    $answer = Read-Host "$question [Y/n]"
    return -not ($answer -match "^[nN]")
  }

  # 取得要安裝的執行檔：以檔案執行且旁邊有 am.exe 時用旁邊的，否則從 GitHub Releases 下載
  $work = $null
  $src = $null
  if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot "am.exe"))) {
    $src = Join-Path $PSScriptRoot "am.exe"
  } else {
    $asset = "am-windows-x64.zip"
    $base = if ($env:AM_DOWNLOAD_URL) { $env:AM_DOWNLOAD_URL.TrimEnd("/") } elseif ($env:AM_VERSION) { "https://github.com/$repo/releases/download/$($env:AM_VERSION)" } else { "https://github.com/$repo/releases/latest/download" }
    $work = Join-Path ([IO.Path]::GetTempPath()) ("am-install-" + [Guid]::NewGuid())
    New-Item -ItemType Directory -Force -Path $work | Out-Null
    Write-Host "下載 ${asset}…"
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile (Join-Path $work $asset)
    Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS.txt" -OutFile (Join-Path $work "SHA256SUMS.txt")
    $line = Get-Content (Join-Path $work "SHA256SUMS.txt") | Where-Object { $_ -match " $([regex]::Escape($asset))$" } | Select-Object -First 1
    $expected = if ($line) { ($line -split "\s+")[0].ToLower() } else { "" }
    $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $work $asset)).Hash.ToLower()
    if (-not $expected -or $expected -ne $actual) { throw "檢查碼不符，檔案可能損壞，請重新執行" }
    Expand-Archive -Path (Join-Path $work $asset) -DestinationPath $work -Force
    $src = Join-Path $work "am-windows-x64\am.exe"
  }

  try {
    # 移除從網路下載的標記，避免執行時被阻擋
    Unblock-File -Path $src

    $wasInstalled = Test-Path $dest
    $wasAutostart = Test-Path $startupFile

    # 更新前先停止執行中的管理網站，否則執行檔被鎖住無法替換
    $port = 4141
    if (Test-Path $configFile) {
      try { $port = (Get-Content $configFile -Raw | ConvertFrom-Json).server.port } catch {}
    }
    $wasRunning = $false
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2
      $wasRunning = $health.app -eq "am"
    } catch {}
    if ($wasRunning) {
      try {
        Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/api/shutdown" -ContentType "application/json" `
          -Headers @{ Origin = "http://127.0.0.1:$port" } -Body "{}" -TimeoutSec 2 | Out-Null
      } catch {}
    }

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
    Write-Host ""
    Write-Host "已安裝：${dest}（版本 $(& $dest --version)）"

    # 加入使用者 PATH，並更新目前視窗，讓 am 立即可用
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = if ($userPath) { $userPath -split ";" } else { @() }
    if ($parts -notcontains $destDir) {
      $newPath = if ($userPath) { "$userPath;$destDir" } else { $destDir }
      [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
      Write-Host "已將 $destDir 加入 PATH。"
    }
    if (($env:Path -split ";") -notcontains $destDir) { $env:Path = "$env:Path;$destDir" }

    if ($wasAutostart) {
      & $dest autostart on | Out-Null
      Write-Host "已重新啟動管理網站（開機自動執行維持開啟）"
    } elseif ($wasRunning) {
      Start-Process -FilePath $dest -ArgumentList "server" -WindowStyle Hidden
      Write-Host "已重新啟動管理網站"
    } elseif (-not $wasInstalled) {
      Write-Host ""
      if (Ask "要開啟開機自動執行管理網站嗎？") { & $dest autostart on }
      if (Ask "要現在打開管理網站，新增服務商嗎？") { & $dest web }
    }

    Write-Host ""
    Write-Host "使用方式："
    Write-Host "  am web              開啟管理網站，新增服務商"
    Write-Host "  am                  選擇服務商與模型後啟動 Claude Code"
    Write-Host "  am autostart on     開機自動執行管理網站"
  } finally {
    if ($work) { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }
  }
}
