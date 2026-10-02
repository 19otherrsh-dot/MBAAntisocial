# One-shot setup for a fresh Windows machine. Safe to re-run: every step checks
# before it acts. Usage (from the project folder):
#
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1            # install
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Seed      # + sample data
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Verify    # + typecheck, lint, build

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

# ── 2. Environment file ─────────────────────────────────────────────────────

Step 'Checking .env.local'

if (-not (Test-Path .env.local)) {
  Copy-Item .env.example .env.local
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  (Get-Content .env.example) -replace '^AUTH_SECRET=.*$', "AUTH_SECRET=$secret" |
    Set-Content -Path .env.local -Encoding ascii
  Warn '.env.local was missing; created it from .env.example with a fresh AUTH_SECRET. Copy your old one over instead if you have it.'
} else {
  Ok '.env.local present'
}

$envValues = Read-EnvFile '.env.local'

if (-not $envValues['MONGODB_URI']) { Fail 'MONGODB_URI is empty in .env.local.' }
elseif ($envValues['MONGODB_URI'] -notmatch '^mongodb(\+srv)?://') { Fail 'MONGODB_URI must start with mongodb:// or mongodb+srv://' }
else { Ok 'MONGODB_URI set' }

if (-not $envValues['AUTH_SECRET'] -or $envValues['AUTH_SECRET'].Length -lt 32 -or $envValues['AUTH_SECRET'] -like 'replace-me*') {
  Fail 'AUTH_SECRET must be a real value of 32+ characters (generate one with: npx auth secret).'
} else { Ok 'AUTH_SECRET set' }

$integrations = [ordered]@{
  'AI interview / resume roast' = @('GOOGLE_GENERATIVE_AI_API_KEY')
  'File uploads (Cloudinary)'   = @('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET')
  'Realtime (Pusher)'           = @('PUSHER_APP_ID', 'PUSHER_SECRET', 'NEXT_PUBLIC_PUSHER_KEY', 'NEXT_PUBLIC_PUSHER_CLUSTER')
  'Digest email (Resend)'       = @('RESEND_API_KEY', 'CRON_SECRET')
}
foreach ($feature in $integrations.Keys) {
  $missing = @($integrations[$feature] | Where-Object { -not $envValues[$_] })
  if ($missing.Count -eq 0) { Ok "$feature configured" }
  else { Warn "$feature disabled until set: $($missing -join ', ')" }
}

if ($failures.Count -gt 0) {
  Write-Host "`nEdit .env.local and re-run." -ForegroundColor Red
  exit 1
}

# ── 3. MongoDB ───────────────────────────────────────────────────────────────

Step 'Checking MongoDB'

$uri = $envValues['MONGODB_URI']
$isLocal = $uri -match '^mongodb://([^@/]*@)?(127\.0\.0\.1|localhost)(:(\d+))?'
$mongoPort = if ($isLocal -and $Matches[4]) { [int]$Matches[4] } else { 27017 }

if (-not $isLocal) {
  Ok 'Remote MongoDB (e.g. Atlas); nothing to start locally'
} elseif (Test-Port '127.0.0.1' $mongoPort) {
  Ok "MongoDB listening on port $mongoPort"
} elseif (-not $docker) {
  Fail "Nothing on port $mongoPort and Docker is not installed. Install Docker Desktop, or MongoDB Community 7, or point MONGODB_URI at Atlas."
} else {
  & docker info --format '{{.ServerVersion}}' *> $null
  if ($LASTEXITCODE -ne 0) {
    Fail 'Docker is installed but not running. Start Docker Desktop and re-run.'
  } else {
    $status = & docker ps -a --filter 'name=^mba-mongo$' --format '{{.Status}}'
    if ($status) {
      & docker start mba-mongo | Out-Null
    } else {
      & docker run -d -p "${mongoPort}:27017" --name mba-mongo -v mba-mongo-data:/data/db --restart unless-stopped mongo:7 | Out-Null
    }
    $up = $false
    for ($i = 0; $i -lt 30 -and -not $up; $i++) { Start-Sleep -Seconds 1; $up = Test-Port '127.0.0.1' $mongoPort }
    if ($up) { Ok "MongoDB container mba-mongo running on port $mongoPort" }
    else { Fail 'MongoDB container did not come up within 30s. Check: docker logs mba-mongo' }
  }
}

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
  if ($LASTEXITCODE -ne 0) { Fail 'Seed failed.' } else { Ok 'Seeded. Log in as sneha@iima.ac.in / seedpassword123' }
}

if ($Verify) {
  Step 'Verifying (typecheck, lint, production build)'
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
Write-Host "`nStart the app with:  npm run dev   ->  http://localhost:3000"
