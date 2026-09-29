$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " TradeX - Starting Local Services" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$services = @(
    @{ Name = "API Server";     Command = "npm run dev:api" },
    @{ Name = "WebSocket";      Command = "npm run dev:websocket" },
    @{ Name = "Market Data";   Command = "npm run dev:market" },
    @{ Name = "Provider Bridge"; Command = "npm run dev:provider" },
    @{ Name = "Client";         Command = "npm run dev:client" },
    @{ Name = "Admin";          Command = "npm run dev:admin" }
)

foreach ($service in $services) {
    Start-Process powershell.exe `
        -WorkingDirectory $root `
        -ArgumentList "-NoExit", "-Command", "Write-Host '[TradeX] $($service.Name)' -ForegroundColor Green; Set-Location '$root'; $($service.Command)"
}

Write-Host "All TradeX service terminals have been started." -ForegroundColor Green
Write-Host ""
Write-Host "Client:    http://localhost:5173" -ForegroundColor White
Write-Host "Admin:     http://localhost:5174" -ForegroundColor White
Write-Host "API:       http://localhost:5000/api/health" -ForegroundColor White
Write-Host "System:    http://localhost:5000/api/system/health" -ForegroundColor White
Write-Host "WebSocket: ws://localhost:5001" -ForegroundColor White
Write-Host "Market:    http://localhost:5002/health" -ForegroundColor White
Write-Host "Provider:  http://localhost:5003/health" -ForegroundColor White
Write-Host ""