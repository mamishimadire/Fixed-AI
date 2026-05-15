$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$nodeExe = "node"
$serverFile = Join-Path $projectRoot "server.js"
$envFile = Join-Path $projectRoot ".env"
$url = "http://127.0.0.1:5000/"

if (-not (Test-Path $projectRoot)) {
    throw "Project folder not found: $projectRoot"
}

if (-not (Test-Path $serverFile)) {
    throw "Server file not found: $serverFile"
}

if (-not (Test-Path $envFile)) {
    throw ".env file not found: $envFile"
}

function Test-AiServer {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

Write-Host ""
Write-Host "MAMISHI AI Launcher" -ForegroundColor Cyan
Write-Host "Project : $projectRoot"
Write-Host "Server  : $serverFile"
Write-Host "URL     : $url"
Write-Host ""

if (Test-AiServer) {
    Write-Host "[OK] Server already running. Opening browser..." -ForegroundColor Green
    Start-Process $url
    exit 0
}

Write-Host "Loading .env configuration..." -ForegroundColor Cyan
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+?)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        if ($value -match '^"(.*)"$') { $value = $matches[1] }
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

Write-Host "[OK] Environment loaded" -ForegroundColor Green
Write-Host ""
Write-Host "Starting Node.js server..." -ForegroundColor Cyan
Start-Process -FilePath $nodeExe -ArgumentList "server.js" -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 750
    if (Test-AiServer) {
        $ready = $true
        break
    }
    Write-Host "." -NoNewline -ForegroundColor Cyan
}
Write-Host ""

if (-not $ready) {
    throw "MAMISHI AI did not start on $url. Check if Ollama is running and API keys are configured in .env"
}

Write-Host "[OK] MAMISHI AI is ready. Opening browser..." -ForegroundColor Green
Start-Process $url
