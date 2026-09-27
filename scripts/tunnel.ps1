# Share the running app over a temporary public Cloudflare link.
# Usage (from the repo root):  powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1
# Stops everything with Ctrl+C. The link changes every run.
$root = Split-Path -Parent $PSScriptRoot
$backend = Start-Process -PassThru -WindowStyle Minimized -WorkingDirectory "$root\backend" `
  "$root\backend\.venv\Scripts\python.exe" "manage.py runserver 127.0.0.1:8000"
$frontend = Start-Process -PassThru -WindowStyle Minimized -WorkingDirectory "$root\frontend" `
  "cmd.exe" "/c npx ng serve --configuration tunnel --port 4200"
Write-Host "Waiting for the frontend on http://localhost:4200 ..."
while (-not (Test-NetConnection localhost -Port 4200 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
  Start-Sleep -Seconds 3
}
Write-Host "Opening the tunnel. Share the https://....trycloudflare.com link printed below."
try {
  & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:4200
} finally {
  Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
  taskkill /PID $frontend.Id /T /F | Out-Null
  Write-Host "Tunnel, frontend and backend stopped."
}
