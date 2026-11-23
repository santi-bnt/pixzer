param()

$ErrorActionPreference = 'Stop'

$databaseUrl = $env:PIXZER_DEV_DATABASE_URL
$expectedProjectRef = $env:PIXZER_DEV_PROJECT_REF
$approvedDevelopmentProjectRef = 'pxxtzjpjtigikolauxwc'

if ([string]::IsNullOrWhiteSpace($databaseUrl) -or [string]::IsNullOrWhiteSpace($expectedProjectRef)) {
  throw 'Set PIXZER_DEV_DATABASE_URL and PIXZER_DEV_PROJECT_REF for a dedicated development project.'
}

if ($expectedProjectRef -notmatch '^[a-z0-9]{20}$') {
  throw 'PIXZER_DEV_PROJECT_REF must be the 20-character Supabase project ref.'
}
if ($expectedProjectRef -cne $approvedDevelopmentProjectRef) {
  throw 'PIXZER_DEV_PROJECT_REF must identify the reviewed Pixzer development project.'
}

$connection = [uri]$databaseUrl
if ($connection.Scheme -notin @('postgres', 'postgresql')) {
  throw 'PIXZER_DEV_DATABASE_URL must be a PostgreSQL connection URI.'
}

$userInfo = [uri]::UnescapeDataString($connection.UserInfo)
$separatorIndex = $userInfo.IndexOf(':')
if ($separatorIndex -lt 0) {
  throw 'The PostgreSQL connection URI must include a username and password.'
}
$databaseUser = $userInfo.Substring(0, $separatorIndex)
$databasePassword = $userInfo.Substring($separatorIndex + 1)

$targetProjectRef = $null
if ($connection.Host -match '^db\.([a-z0-9]{20})\.supabase\.co$') {
  $targetProjectRef = $Matches[1]
} elseif (
  $connection.Host -match '^.+\.pooler\.supabase\.com$' -and
  $databaseUser -match '^postgres\.([a-z0-9]{20})$'
) {
  $targetProjectRef = $Matches[1]
} else {
  throw 'Use a Supabase direct database URL or session pooler URL so the project ref can be checked.'
}

if ($targetProjectRef -ne $expectedProjectRef) {
  throw 'The project ref in the connection URL does not match PIXZER_DEV_PROJECT_REF.'
}

$databaseName = $connection.AbsolutePath.TrimStart('/')
if ($databaseName -ne 'postgres') {
  throw 'The test runner only accepts the standard Supabase postgres database.'
}

$psqlCommand = Get-Command psql -ErrorAction SilentlyContinue
if ($null -eq $psqlCommand) {
  throw 'psql was not found. Install the PostgreSQL command-line tools and reopen PowerShell.'
}

Write-Host "Target Supabase development project: $targetProjectRef"
Write-Host 'This runs the existing pgTAP script inside a transaction and rolls back its fixtures.'
Write-Host 'It may create the pgTAP extension inside that transaction if it is not already installed.'
$typedProjectRef = Read-Host 'Type the project ref again to confirm this is the authorized development target'
if ($typedProjectRef -cne $expectedProjectRef) {
  throw 'Project ref confirmation did not match; no database connection was opened.'
}

$pgTestFile = Join-Path $PSScriptRoot '..\supabase\tests\0002_auth_rls.test.sql'
if (-not (Test-Path -LiteralPath $pgTestFile -PathType Leaf)) {
  throw "pgTAP test file not found: $pgTestFile"
}
$testSql = Get-Content -LiteralPath $pgTestFile -Raw
$declaredPlans = [regex]::Matches($testSql, '(?im)^\s*select\s+plan\((\d+)\)\s*;')
if ($declaredPlans.Count -ne 1) {
  throw 'Expected exactly one pgTAP plan declaration in the test file.'
}
$expectedTestCount = [int]$declaredPlans[0].Groups[1].Value
if ($expectedTestCount -lt 1) {
  throw 'The pgTAP plan must declare at least one assertion.'
}

$oldPgEnvironment = @{}
foreach ($name in @('PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE')) {
  $oldPgEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
  $env:PGHOST = $connection.Host
  $env:PGPORT = if ($connection.IsDefaultPort -or $connection.Port -lt 1) { '5432' } else { [string]$connection.Port }
  $env:PGDATABASE = $databaseName
  $env:PGUSER = $databaseUser
  $env:PGPASSWORD = $databasePassword
  $env:PGSSLMODE = 'require'

  $output = & $psqlCommand.Source --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --file $pgTestFile 2>&1
  $psqlExitCode = $LASTEXITCODE
  $outputLines = @($output | ForEach-Object { $_.ToString() })

  if ($psqlExitCode -ne 0) {
    $outputLines | ForEach-Object { Write-Host $_ }
    throw "psql exited with code $psqlExitCode. Review the error above; the connection rollback should discard test fixtures."
  }

  $tapLines = @($outputLines | Where-Object { $_ -match '^(ok|not ok)\s+\d+\b' })
  $failedLines = @($tapLines | Where-Object { $_ -match '^not ok\s+\d+\b' })
  $planLines = @($outputLines | Where-Object { $_ -match '^1\.\.\d+$' })
  $testNumbers = @($tapLines | ForEach-Object { [int]([regex]::Match($_, '^(?:ok|not ok)\s+(\d+)').Groups[1].Value) })

  $expectedPlan = "1..$expectedTestCount"
  if ($tapLines.Count -ne $expectedTestCount -or $failedLines.Count -gt 0 -or $planLines.Count -ne 1 -or $planLines[0] -cne $expectedPlan) {
    $outputLines | ForEach-Object { Write-Host $_ }
    throw "pgTAP did not pass: expected plan $expectedPlan and $expectedTestCount successful assertions; got $($tapLines.Count) assertions and $($failedLines.Count) failures."
  }

  for ($index = 0; $index -lt $expectedTestCount; $index++) {
    if ($testNumbers[$index] -ne ($index + 1)) {
      $outputLines | ForEach-Object { Write-Host $_ }
      throw "pgTAP output did not contain assertion numbers 1 through $expectedTestCount in order."
    }
  }

  Write-Host "PASS: all $expectedTestCount pgTAP assertions passed against the confirmed development project."
} finally {
  foreach ($name in $oldPgEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($name, $oldPgEnvironment[$name], 'Process')
  }
  $databasePassword = $null
}
