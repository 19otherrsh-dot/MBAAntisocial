# One-shot setup for a fresh Windows machine. Safe to re-run: every step checks
# before it acts. Usage (from the project folder):
#
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1            # install
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Seed      # + sample data
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Verify    # + typecheck, lint, tests, build
#
# Prefer containers for everything? `docker compose up -d --build` (see README).

param(
  [switch]$Seed,
  [switch]$Verify
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "    ok   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    warn $text" -ForegroundColor Yellow; $warnings.Add($text) }
function Fail($text) { Write-Host "    FAIL $text" -ForegroundColor Red; $failures.Add($text) }

function Test-Port([string]$hostName, [int]$port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($hostName, $port, $null, $null)
    return ($async.AsyncWaitHandle.WaitOne(1000) -and $client.Connected)
  } catch { return $false } finally { $client.Close() }
}

function Read-EnvFile([string]$path) {
  $values = @{}
  foreach ($line in Get-Content -Path $path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
  }
  return $values
}

# ── 1. Tooling ───────────────────────────────────────────────────────────────

Step 'Checking tools'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Fail 'Node.js not found. Install Node 20.9+ from https://nodejs.org, reopen the terminal, re-run.'
} else {
  $nodeVersion = [version]((& node --version).TrimStart('v'))
  if ($nodeVersion -lt [version]'20.9.0') { Fail "Node $nodeVersion is too old; 20.9+ is required." }
  else { Ok "Node $nodeVersion" }
}

if (Get-Command git -ErrorAction SilentlyContinue) { Ok (& git --version) }
else { Warn 'Git not found. The app runs without it, but you cannot push/pull. Install from https://git-scm.com' }

$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) { Ok 'Docker found' }

if ($failures.Count -gt 0) {
  Write-Host "`nFix the above and re-run." -ForegroundColor Red
  exit 1
}

# ── 2. Environment files ────────────────────────────────────────────────────

Step 'Checking environment files'

function New-Secret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

$webEnv = 'apps/web/.env.local'
$rtEnv = 'apps/realtime/.env'
$localMongo = 'mongodb://127.0.0.1:27017/mba-antisocial?replicaSet=rs0&directConnection=true'

if (-not (Test-Path $webEnv)) {
  # One set of secrets, written to both services so they trust each other.
  $secrets = @{ AUTH_SECRET = New-Secret; REALTIME_SECRET = New-Secret; INTERNAL_API_SECRET = New-Secret; CRON_SECRET = New-Secret }
  $content = Get-Content apps/web/.env.example
  foreach ($key in $secrets.Keys) { $content = $content -replace "^$key=.*$", "$key=$($secrets[$key])" }
  $content = $content -replace '^MONGODB_URI=.*$', "MONGODB_URI=$localMongo"
  $content | Set-Content -Path $webEnv -Encoding ascii
  if (-not (Test-Path $rtEnv)) {
    $rt = Get-Content apps/realtime/.env.example
    foreach ($key in $secrets.Keys) { $rt = $rt -replace "^$key=.*$", "$key=$($secrets[$key])" }
    $rt | Set-Content -Path $rtEnv -Encoding ascii
  }
  Warn "$webEnv was missing; created it with fresh secrets (and $rtEnv with the same ones)."
} else {
  Ok "$webEnv present"
  if (-not (Test-Path $rtEnv)) { Warn "$rtEnv is missing: copy apps/realtime/.env.example and use the same AUTH_SECRET, REALTIME_SECRET and INTERNAL_API_SECRET as the web app." }
}

$envValues = Read-EnvFile $webEnv

if (-not $envValues['MONGODB_URI']) { Fail "MONGODB_URI is empty in $webEnv." }
elseif ($envValues['MONGODB_URI'] -notmatch '^mongodb(\+srv)?://') { Fail 'MONGODB_URI must start with mongodb:// or mongodb+srv://' }
else { Ok 'MONGODB_URI set' }

if (-not $envValues['AUTH_SECRET'] -or $envValues['AUTH_SECRET'].Length -lt 32) {
  Fail 'AUTH_SECRET must be 32+ characters (generate one with: npx auth secret).'
} else { Ok 'AUTH_SECRET set' }

$integrations = [ordered]@{
  'AI features (Claude)'             = @('ANTHROPIC_API_KEY')
  'Live updates and multiplayer'     = @('REDIS_URL', 'REALTIME_SECRET', 'NEXT_PUBLIC_REALTIME_URL')
  'Email (Resend or SMTP)'           = @('RESEND_API_KEY|SMTP_URL')
  'Google Meet links'                = @('GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET')
  'Zoom links'                       = @('ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET')
  'Google sign-in'                   = @('AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET')
  'Microsoft sign-in'                = @('AUTH_MICROSOFT_ENTRA_ID_ID', 'AUTH_MICROSOFT_ENTRA_ID_SECRET')
  'Browser push'                     = @('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY')
  'Discord bridge'                   = @('DISCORD_CLIENT_ID', 'DISCORD_BOT_TOKEN')
}
foreach ($feature in $integrations.Keys) {
  $missing = @($integrations[$feature] | Where-Object { -not (($_ -split '\|') | Where-Object { $envValues[$_] }) })
  if ($missing.Count -eq 0) { Ok "$feature configured" }
  else { Warn "$feature off until set: $($missing -join ', ')" }
}

if ($failures.Count -gt 0) {
  Write-Host "`nEdit $webEnv and re-run." -ForegroundColor Red
  exit 1
}

# ── 3. MongoDB and Redis ────────────────────────────────────────────────────

function Start-Container([string]$name, [int]$port, [string[]]$runArgs) {
  if (Test-Port '127.0.0.1' $port) { Ok "${name}: something is already listening on port $port"; return $true }
  if (-not $docker) { Fail "Nothing on port $port and Docker is not installed. Install Docker Desktop (or the service natively) and re-run."; return $false }
  & docker info --format '{{.ServerVersion}}' *> $null
  if ($LASTEXITCODE -ne 0) { Fail 'Docker is installed but not running. Start Docker Desktop and re-run.'; return $false }
  $status = & docker ps -a --filter "name=^$name$" --format '{{.Status}}'
  if ($status) { & docker start $name | Out-Null } else { & docker run -d --name $name --restart unless-stopped @runArgs | Out-Null }
  for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Seconds 1; if (Test-Port '127.0.0.1' $port) { Ok "$name running on port $port"; return $true } }
  Fail "$name did not come up within 30s. Check: docker logs $name"
  return $false
}

Step 'Checking MongoDB'
$uri = $envValues['MONGODB_URI']
if ($uri -notmatch '^mongodb://([^@/]*@)?(127\.0\.0\.1|localhost)') {
  Ok 'Remote MongoDB (e.g. Atlas); nothing to start locally'
} elseif (Start-Container 'mba-mongo' 27017 @('-p', '27017:27017', '-v', 'mba-mongo-data:/data/db', 'mongo:7', '--replSet', 'rs0', '--bind_ip_all')) {
  if ($docker -and (& docker ps --filter 'name=^mba-mongo$' --format '{{.Names}}')) {
    # A one-node replica set, initiated once.
    & docker exec mba-mongo mongosh --quiet --eval "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]}).ok }" | Out-Null
    Ok 'Replica set rs0 ready'
  }
}

Step 'Checking Redis'
if ($envValues['REDIS_URL'] -and $envValues['REDIS_URL'] -match '127\.0\.0\.1|localhost') {
  Start-Container 'mba-redis' 6379 @('-p', '6379:6379', 'redis:7-alpine') | Out-Null
} elseif ($envValues['REDIS_URL']) { Ok 'Remote Redis' }
else { Warn 'REDIS_URL empty: the app runs, without live updates or multiplayer.' }

if ($failures.Count -gt 0) { exit 1 }

# ── 4. Dependencies ──────────────────────────────────────────────────────────

Step 'Installing dependencies (npm ci, exact versions from package-lock.json)'
& npm ci
if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed (see output above).'; exit 1 }
Ok 'node_modules installed'

# ── 5. Optional: seed and verify ────────────────────────────────────────────

if ($Seed) {
  Step 'Seeding sample campus'
  & npm run seed
  if ($LASTEXITCODE -ne 0) { Fail 'Seed failed.' } else { Ok 'Seeded. Log in as sneha@iima.ac.in (student) or admin@iima.ac.in (platform admin), password seedpassword123' }
}

if ($Verify) {
  Step 'Verifying (typecheck, lint, tests, production build)'
  & npm run verify
  if ($LASTEXITCODE -ne 0) { Fail 'npm run verify failed.' } else { Ok 'Verify passed' }
}

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host ''
if ($failures.Count -gt 0) {
  Write-Host "Setup finished with $($failures.Count) failure(s):" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}
if ($warnings.Count -gt 0) {
  Write-Host 'Setup complete, with notes:' -ForegroundColor Yellow
  $warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
} else {
  Write-Host 'Setup complete.' -ForegroundColor Green
}
Write-Host "`nStart it in two terminals:"
Write-Host "  npm run dev            ->  http://localhost:3000"
Write-Host "  npm run dev:realtime   ->  live updates, chat, multiplayer (port 4000)"
