<#
.SYNOPSIS
    IndiaStream — Windows PowerShell Launcher

.DESCRIPTION
    Starts the local CORS proxy server and static web server,
    then opens the app in your default browser.
    Reads configuration from .env in the same directory.

.PARAMETER Rescan
    Force a fresh channel scan (re-runs update_playlist.py).

.PARAMETER Cached
    Skip channel scan and use the existing public\working.m3u (default).

.EXAMPLE
    .\run.ps1              # use cached playlist
    .\run.ps1 -Rescan      # scan for working channels first
#>

param(
    [switch]$Rescan,
    [switch]$Cached
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "          IndiaStream Automated Setup" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# ── Load .env ──────────────────────────────────────────────────────────────────
$ProxyPort = 8081
$HttpPort  = 8080

if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim().Trim('"').Trim("'")
            switch ($key) {
                "PROXY_PORT" { $ProxyPort = [int]$val }
                "HTTP_PORT"  { $HttpPort  = [int]$val }
            }
        }
    }
} else {
    Write-Warning "No .env file found — using defaults (HTTP: $HttpPort, Proxy: $ProxyPort)"
}

$DoRescan = $Rescan.IsPresent

# ── Ensure required directories exist ─────────────────────────────────────────
New-Item -ItemType Directory -Force -Path "logs"   | Out-Null
New-Item -ItemType Directory -Force -Path "public" | Out-Null

# ── Force rescan if no cached playlist ────────────────────────────────────────
if (-not (Test-Path "public\working.m3u")) {
    Write-Host "No cached playlist found. Forcing a rescan..." -ForegroundColor Yellow
    $DoRescan = $true
}

# ── 1. Generate playlist ───────────────────────────────────────────────────────
if ($DoRescan) {
    Write-Host "[1/4] Checking for working channels (Fresh Rescan)..." -ForegroundColor Green
    & python server\update_playlist.py
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Playlist update failed. Check your internet connection."
        exit 1
    }
} else {
    Write-Host "[1/4] Using cached playlist (public\working.m3u)..." -ForegroundColor Green
    Write-Host "      Hint: Run '.\run.ps1 -Rescan' to update the channel list."
}

# ── 2. Kill any processes already on our ports ─────────────────────────────────
foreach ($port in @($ProxyPort, $HttpPort)) {
    $pids = (& netstat -ano 2>$null |
        Select-String "TCP\s+[^\s]+:$port\s" |
        ForEach-Object { ($_ -split '\s+')[-1] } |
        Where-Object { $_ -match '^\d+$' } |
        Select-Object -Unique)
    foreach ($p in $pids) {
        try { Stop-Process -Id $p -Force -ErrorAction Stop; Write-Host "  Killed PID $p on port $port" }
        catch { }
    }
}

# ── 3. Start proxy server ──────────────────────────────────────────────────────
Write-Host "[2/4] Starting proxy server on port $ProxyPort..." -ForegroundColor Green
$proxyProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c python server\proxy.py > logs\proxy.log 2>&1" `
    -PassThru -WindowStyle Hidden

# ── 4. Start static HTTP server ────────────────────────────────────────────────
Write-Host "[3/4] Starting web server on port $HttpPort..." -ForegroundColor Green
$webProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c python -m http.server $HttpPort --directory public > logs\http.log 2>&1" `
    -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 2

# ── 5. Open browser ────────────────────────────────────────────────────────────
Write-Host "[4/4] Opening website in browser..." -ForegroundColor Green
Start-Process "http://localhost:$HttpPort"

Write-Host ""
Write-Host "Servers are running." -ForegroundColor Cyan
Write-Host "  Web   -> http://localhost:$HttpPort" -ForegroundColor White
Write-Host "  Proxy -> http://localhost:$ProxyPort" -ForegroundColor White
Write-Host "  Logs  -> logs\proxy.log  |  logs\http.log" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Press Ctrl+C to stop all servers." -ForegroundColor Yellow

# ── Wait and monitor ───────────────────────────────────────────────────────────
try {
    while ($true) {
        Start-Sleep -Seconds 2
        if ($proxyProc.HasExited) {
            Write-Warning "Proxy server stopped unexpectedly. Check logs\proxy.log"
            break
        }
        if ($webProc.HasExited) {
            Write-Warning "Web server stopped unexpectedly. Check logs\http.log"
            break
        }
    }
} finally {
    Write-Host "`nStopping servers..." -ForegroundColor Yellow
    if (-not $proxyProc.HasExited) { Stop-Process -Id $proxyProc.Id -Force -ErrorAction SilentlyContinue }
    if (-not $webProc.HasExited)   { Stop-Process -Id $webProc.Id   -Force -ErrorAction SilentlyContinue }
    Write-Host "Done." -ForegroundColor Green
}
