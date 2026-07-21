param(
  [Parameter(Mandatory)]
  [ValidateSet('Inventory','Backup','Rehearse','Import','Verify','Rollback')]
  [string]$Phase,
  [string]$ProtectedEnv = 'C:\Users\ahmed\Documents\Codex\private\klinikawfa\staging.env',
  [string]$ArtifactRoot = 'C:\Users\ahmed\Documents\Codex\private\klinikawfa\cutover-20260722'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ExpectedRef = 'nhjbqdiyptjqherdfbqk'
$ExpectedEnv = 'C:\Users\ahmed\Documents\Codex\private\klinikawfa\staging.env'
$ExpectedArtifactRoot = 'C:\Users\ahmed\Documents\Codex\private\klinikawfa\cutover-20260722'
$ApprovedArchive = 'C:\Users\ahmed\Downloads\klinikawfa_260721.backup'
$ApprovedArchiveBytes = 1688357
$ApprovedArchiveSha256 = '16C5C80FB3695FF5E0E21D36AA2D8AAA5AA7CB32E8939DA6046E32A154C57863'
$PostgresBin = 'C:\Users\ahmed\Documents\Codex\tools\postgresql\17.10\pgsql\bin'
$SupabaseCli = 'C:\Users\ahmed\Documents\Codex\tools\supabase-cli\v2.109.1\supabase.exe'

$BackupName = 'target-before-cutover.backup'
$BackupHashName = 'target-before-cutover.sha256'
$ReportName = 'rehearsal-report.json'
$InventoryName = 'target-inventory.json'
$LoaderName = 'selective-data-loader.sql'
$HeldStaffLoaderName = 'staff-messages-loader.sql'
$AuthLoaderName = 'portable-auth-loader.sql'

function Get-NormalizedPath {
  param([Parameter(Mandatory)][string]$Path)
  return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Assert-ExactProtectedPath {
  param(
    [Parameter(Mandatory)][string]$Actual,
    [Parameter(Mandatory)][string]$Expected,
    [Parameter(Mandatory)][string]$Label
  )
  if (-not [string]::Equals((Get-NormalizedPath $Actual), (Get-NormalizedPath $Expected), [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing non-approved $Label path."
  }
}

function Assert-NotReparsePoint {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Label)
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing $Label through a symlink, junction, or reparse point."
  }
}

Assert-ExactProtectedPath -Actual $ProtectedEnv -Expected $ExpectedEnv -Label 'environment'
Assert-ExactProtectedPath -Actual $ArtifactRoot -Expected $ExpectedArtifactRoot -Label 'artifact root'
if (-not (Test-Path -LiteralPath $ProtectedEnv -PathType Leaf)) { throw 'Protected environment file is missing.' }
Assert-NotReparsePoint -Path $ProtectedEnv -Label 'protected environment file'
New-Item -ItemType Directory -Path $ArtifactRoot -Force | Out-Null
Assert-NotReparsePoint -Path $ArtifactRoot -Label 'protected artifact root'

$script:LogPath = Join-Path $ArtifactRoot ('database-reconcile-{0}-{1}.log' -f $Phase.ToLowerInvariant(), (Get-Date -Format 'yyyyMMdd-HHmmss'))
$script:LocalPort = $null
$script:Target = $null

function Write-Log {
  param([Parameter(Mandatory)][string]$Message)
  Add-Content -LiteralPath $script:LogPath -Value ('{0:o} {1}' -f [DateTime]::UtcNow, $Message) -Encoding UTF8
}

function Write-Summary {
  param([Parameter(Mandatory)][string]$Message)
  Write-Output $Message
}

function Write-Utf8NoBom {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Content)
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Write-ProtectedJson {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)]$Value)
  $resolvedRoot = Get-NormalizedPath $ArtifactRoot
  $resolvedPath = Get-NormalizedPath $Path
  if (-not $resolvedPath.StartsWith(($resolvedRoot + '\'), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing JSON output outside the protected artifact root.'
  }
  if (Test-Path -LiteralPath $Path) { Assert-NotReparsePoint -Path $Path -Label 'protected JSON output' }
  $temporary = "$Path.$PID.tmp"
  Write-Utf8NoBom -Path $temporary -Content (($Value | ConvertTo-Json -Depth 30) + "`n")
  Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Import-ProtectedEnvironment {
  param([Parameter(Mandatory)][string]$Path)
  $values = @{}
  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    if ($line.StartsWith('export ')) { $line = $line.Substring(7).Trim() }
    if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { continue }
    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2) {
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    $values[$name] = $value
  }
  return $values
}

function Assert-TargetProjectRef {
  param([Parameter(Mandatory)][hashtable]$Environment)
  if (-not $Environment.ContainsKey('STAGING_PROJECT_REF') -or $Environment['STAGING_PROJECT_REF'] -ne $ExpectedRef) {
    throw 'Refusing cutover operation: protected project ref is not the promoted target.'
  }
  if (-not $Environment.ContainsKey('STAGING_DB_URL') -or [string]::IsNullOrWhiteSpace($Environment['STAGING_DB_URL'])) {
    throw 'Refusing cutover operation: target database URL is missing.'
  }

  try { $uri = [Uri]$Environment['STAGING_DB_URL'] } catch { throw 'Refusing cutover operation: target database URL is invalid.' }
  if ($uri.Scheme -notin @('postgres','postgresql') -or [string]::IsNullOrWhiteSpace($uri.Host)) {
    throw 'Refusing cutover operation: target database URL is not PostgreSQL.'
  }

  $userInfo = $uri.UserInfo.Split(':', 2)
  $username = [Uri]::UnescapeDataString($userInfo[0])
  $hostRef = $null
  $userRef = $null
  if ($uri.Host -match '^db\.([a-z0-9]+)\.supabase\.co$') { $hostRef = $Matches[1] }
  if ($username -match '^postgres\.([a-z0-9]+)$') { $userRef = $Matches[1] }
  if ($hostRef -ne $ExpectedRef -and $userRef -ne $ExpectedRef) {
    throw 'Refusing cutover operation: database host identity is not the promoted target.'
  }
  if ($hostRef -and $hostRef -ne $ExpectedRef) {
    throw 'Refusing cutover operation: direct database host ref does not match the promoted target.'
  }
  if ($userRef -and $userRef -ne $ExpectedRef) {
    throw 'Refusing cutover operation: pooler database user ref does not match the promoted target.'
  }

  if ($Environment.ContainsKey('STAGING_API_URL') -and -not [string]::IsNullOrWhiteSpace($Environment['STAGING_API_URL'])) {
    try { $apiUri = [Uri]$Environment['STAGING_API_URL'] } catch { throw 'Refusing cutover operation: target API URL is invalid.' }
    if ($apiUri.Host -ne "$ExpectedRef.supabase.co") {
      throw 'Refusing cutover operation: target API host ref does not match the promoted target.'
    }
  }
  return $uri
}

function Get-TargetConnection {
  param([Parameter(Mandatory)][hashtable]$Environment, [Parameter(Mandatory)][Uri]$Uri)
  $parts = $Uri.UserInfo.Split(':', 2)
  $port = $Uri.Port
  if ($port -le 0) { $port = 5432 }
  $database = $Uri.AbsolutePath.TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($database)) { $database = 'postgres' }
  return @{
    Host = $Uri.Host
    Port = $port
    Username = [Uri]::UnescapeDataString($parts[0])
    Password = if ($parts.Count -gt 1) { [Uri]::UnescapeDataString($parts[1]) } else { '' }
    Database = [Uri]::UnescapeDataString($database)
  }
}

function Assert-RequiredTools {
  $required = @('psql.exe','pg_dump.exe','pg_restore.exe','initdb.exe','pg_ctl.exe','createdb.exe')
  foreach ($name in $required) {
    $path = Join-Path $PostgresBin $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required PostgreSQL tool is missing: $name" }
  }
  if (-not (Test-Path -LiteralPath $SupabaseCli -PathType Leaf)) { throw 'Pinned Supabase CLI is missing.' }
}

function Invoke-External {
  param(
    [Parameter(Mandatory)][string]$File,
    [Parameter(Mandatory)][string[]]$Arguments,
    [Parameter(Mandatory)][string]$Label
  )
  Write-Log "Starting $Label."
  $priorErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $captured = @(& $File @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $priorErrorActionPreference
  }
  if ($captured.Count -gt 0) { $captured | ForEach-Object { Add-Content -LiteralPath $script:LogPath -Value ([string]$_) -Encoding UTF8 } }
  if ($exitCode -ne 0) { throw "$Label failed with exit code $exitCode. See the protected log." }
  Write-Log "Completed $Label."
  return $captured
}

function Invoke-DetachedControlProcess {
  param(
    [Parameter(Mandatory)][string]$File,
    [Parameter(Mandatory)][string[]]$Arguments,
    [Parameter(Mandatory)][string]$Label
  )
  $quotedArguments = @($Arguments | ForEach-Object {
    if ($_ -match '[\s"]') { '"' + $_.Replace('"','\"') + '"' } else { $_ }
  }) -join ' '
  Write-Log "Starting $Label."
  $process = Start-Process -FilePath $File -ArgumentList $quotedArguments -PassThru -WindowStyle Hidden
  if (-not $process.WaitForExit(60000)) {
    $process.Kill()
    throw "$Label did not exit within 60 seconds."
  }
  if ($process.ExitCode -ne 0) { throw "$Label failed with exit code $($process.ExitCode). See the protected PostgreSQL server log." }
  Write-Log "Completed $Label."
}

function Invoke-WithTargetEnvironment {
  param([Parameter(Mandatory)][scriptblock]$Action, [switch]$ReadOnly)
  $oldPassword = $env:PGPASSWORD
  $oldSslMode = $env:PGSSLMODE
  $oldOptions = $env:PGOPTIONS
  $oldTimeout = $env:PGCONNECT_TIMEOUT
  try {
    $env:PGPASSWORD = $script:Target.Password
    $env:PGSSLMODE = 'require'
    $env:PGCONNECT_TIMEOUT = '15'
    if ($ReadOnly) { $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=60000' }
    & $Action
  } finally {
    $env:PGPASSWORD = $oldPassword
    $env:PGSSLMODE = $oldSslMode
    $env:PGOPTIONS = $oldOptions
    $env:PGCONNECT_TIMEOUT = $oldTimeout
  }
}

function Get-TargetArguments {
  return @('--host', $script:Target.Host, '--port', [string]$script:Target.Port, '--username', $script:Target.Username, '--dbname', $script:Target.Database)
}

function New-ProtectedSqlFile {
  param([Parameter(Mandatory)][string]$Sql)
  $path = Join-Path $ArtifactRoot ('.query-{0}-{1}.sql' -f $PID, [Guid]::NewGuid().ToString('N'))
  Write-Utf8NoBom -Path $path -Content ($Sql + "`n")
  return $path
}

function Invoke-TargetQuery {
  param([Parameter(Mandatory)][string]$Sql, [Parameter(Mandatory)][string]$Label)
  $psql = Join-Path $PostgresBin 'psql.exe'
  $queryPath = New-ProtectedSqlFile -Sql $Sql
  try {
    $commandArguments = @('-X','-A','-t','-q','-v','ON_ERROR_STOP=1') + (Get-TargetArguments) + @('--file', $queryPath)
    $result = Invoke-WithTargetEnvironment -ReadOnly -Action { Invoke-External -File $psql -Arguments $commandArguments -Label $Label }
    return (@($result) -join "`n").Trim()
  } finally {
    if (Test-Path -LiteralPath $queryPath) { Remove-Item -LiteralPath $queryPath -Force }
  }
}

function Invoke-TargetFile {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Label)
  $psql = Join-Path $PostgresBin 'psql.exe'
  $commandArguments = @('-X','-q','-v','ON_ERROR_STOP=1') + (Get-TargetArguments) + @('--file', $Path)
  Invoke-WithTargetEnvironment -Action { Invoke-External -File $psql -Arguments $commandArguments -Label $Label | Out-Null }
}

function Assert-ApprovedArchive {
  if (-not (Test-Path -LiteralPath $ApprovedArchive -PathType Leaf)) { throw 'Approved source archive is missing.' }
  Assert-NotReparsePoint -Path $ApprovedArchive -Label 'approved source archive'
  $file = Get-Item -LiteralPath $ApprovedArchive
  $hash = (Get-FileHash -LiteralPath $ApprovedArchive -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($file.Length -ne $ApprovedArchiveBytes -or $hash -ne $ApprovedArchiveSha256) {
    throw 'Approved source archive fingerprint mismatch.'
  }
  Write-Log 'Approved source archive fingerprint verified.'
  return $hash
}

function Get-ArchiveToc {
  param([Parameter(Mandatory)][string]$Archive, [Parameter(Mandatory)][string]$Label)
  $restore = Join-Path $PostgresBin 'pg_restore.exe'
  return @(Invoke-External -File $restore -Arguments @('--list', $Archive) -Label $Label)
}

function Get-TocDescriptor {
  param([Parameter(Mandatory)][string]$Line)
  if ($Line -match '^\s*\d+;\s+\d+\s+\d+\s+(?<descriptor>.+)$') { return $Matches['descriptor'] }
  return $null
}

function Get-TocTables {
  param([Parameter(Mandatory)][string[]]$Toc, [Parameter(Mandatory)][string]$Schema)
  $set = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($line in $Toc) {
    $descriptor = Get-TocDescriptor $line
    if (-not $descriptor -or $descriptor.StartsWith('TABLE DATA ') -or $descriptor.StartsWith('TABLE ATTACH ')) { continue }
    if ($descriptor -match '^TABLE\s+(?<schema>\S+)\s+(?<table>\S+)\s+\S+$' -and $Matches['schema'] -eq $Schema) {
      [void]$set.Add("$($Matches['schema']).$($Matches['table'])")
    }
  }
  return @($set | Sort-Object)
}

function Get-TocIdentities {
  param([Parameter(Mandatory)][string[]]$Toc, [Parameter(Mandatory)][ValidateSet('FUNCTION','POLICY')][string]$Kind)
  $set = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($line in $Toc) {
    $descriptor = Get-TocDescriptor $line
    if (-not $descriptor -or -not $descriptor.StartsWith("$Kind ")) { continue }
    $withoutOwner = $descriptor -replace '\s+\S+$', ''
    [void]$set.Add($withoutOwner)
  }
  return @($set | Sort-Object)
}

function Get-SetDiff {
  param([string[]]$Source, [string[]]$Target)
  return [ordered]@{
    sourceOnly = @($Source | Where-Object { $_ -notin $Target } | Sort-Object)
    targetOnly = @($Target | Where-Object { $_ -notin $Source } | Sort-Object)
  }
}

function Get-TargetInventory {
  $publicTables = [int](Invoke-TargetQuery -Label 'target public-table inventory' -Sql "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")
  $authUsers = [int](Invoke-TargetQuery -Label 'target Auth user inventory' -Sql 'select count(*) from auth.users;')
  $authIdentities = [int](Invoke-TargetQuery -Label 'target Auth identity inventory' -Sql 'select count(*) from auth.identities;')
  $migrationRows = [int](Invoke-TargetQuery -Label 'target migration inventory' -Sql 'select count(*) from supabase_migrations.schema_migrations;')
  $migrationText = Invoke-TargetQuery -Label 'target migration identity inventory' -Sql "select coalesce(jsonb_agg(version order by version),'[]'::jsonb)::text from supabase_migrations.schema_migrations;"
  $migrationIdentities = @(ConvertFrom-JsonArray -Text $migrationText)
  return [ordered]@{
    projectRef = $ExpectedRef
    publicTables = $publicTables
    authUsers = $authUsers
    authIdentities = $authIdentities
    migrationRows = $migrationRows
    migrationIdentities = $migrationIdentities
  }
}

function Invoke-InventoryPhase {
  $sourceHash = Assert-ApprovedArchive
  $sourceToc = Get-ArchiveToc -Archive $ApprovedArchive -Label 'approved source archive list validation'
  $sourceTables = @(Get-TocTables -Toc $sourceToc -Schema 'public')
  $targetInventory = Get-TargetInventory
  $inventory = [ordered]@{
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    source = [ordered]@{ sha256 = $sourceHash; bytes = $ApprovedArchiveBytes; publicTables = $sourceTables.Count; tableIdentities = $sourceTables }
    target = $targetInventory
  }
  Write-ProtectedJson -Path (Join-Path $ArtifactRoot $InventoryName) -Value $inventory
  if ($sourceTables.Count -ne 94) { throw "Source public-table count changed from the approved value: $($sourceTables.Count)." }
  if ($targetInventory.publicTables -ne 93 -or $targetInventory.authUsers -ne 0 -or $targetInventory.migrationRows -ne 153) {
    throw 'Target baseline no longer matches the approved 93-table, zero-user, 153-migration inventory.'
  }
  Write-Summary "Inventory passed: source public tables=94; target public tables=93; target Auth users=0; target migrations=153; target ref=$ExpectedRef."
  return $inventory
}

function Assert-VerifiedBackup {
  $backup = Join-Path $ArtifactRoot $BackupName
  $hashFile = Join-Path $ArtifactRoot $BackupHashName
  if (-not (Test-Path -LiteralPath $backup -PathType Leaf) -or -not (Test-Path -LiteralPath $hashFile -PathType Leaf)) {
    throw 'A verified pre-cutover backup is required before this phase.'
  }
  Assert-NotReparsePoint -Path $backup -Label 'target backup'
  Assert-NotReparsePoint -Path $hashFile -Label 'target backup digest'
  $expected = ((Get-Content -LiteralPath $hashFile -Raw).Trim() -split '\s+')[0].ToUpperInvariant()
  if ($expected -notmatch '^[A-F0-9]{64}$') { throw 'Target backup digest file is invalid.' }
  $actual = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($actual -ne $expected) { throw 'Target backup digest mismatch.' }
  [void](Get-ArchiveToc -Archive $backup -Label 'target backup list validation')
  return [ordered]@{ path = $backup; sha256 = $actual; bytes = (Get-Item -LiteralPath $backup).Length }
}

function Invoke-BackupPhase {
  [void](Invoke-InventoryPhase)
  $backup = Join-Path $ArtifactRoot $BackupName
  $temporary = Join-Path $ArtifactRoot (".$BackupName.$PID.tmp")
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
  $dump = Join-Path $PostgresBin 'pg_dump.exe'
  $commandArguments = @('--format=custom','--compress=9','--file',$temporary) + (Get-TargetArguments)
  try {
    Invoke-WithTargetEnvironment -ReadOnly -Action { Invoke-External -File $dump -Arguments $commandArguments -Label 'full protected target backup' | Out-Null }
    if (-not (Test-Path -LiteralPath $temporary -PathType Leaf) -or (Get-Item -LiteralPath $temporary).Length -le 0) { throw 'Target backup is empty.' }
    [void](Get-ArchiveToc -Archive $temporary -Label 'new target backup list validation')
    Move-Item -LiteralPath $temporary -Destination $backup -Force
    $hash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToUpperInvariant()
    Write-Utf8NoBom -Path (Join-Path $ArtifactRoot $BackupHashName) -Content "$hash  $BackupName`n"
    [void](Assert-VerifiedBackup)
    Write-Summary "Backup passed: $BackupName is non-empty, list-valid, and SHA-256 verified in the protected artifact root."
  } catch {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    throw
  }
}

function Get-FreeTcpPort {
  $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

function Assert-ScratchPath {
  param([Parameter(Mandatory)][string]$Path)
  $root = Get-NormalizedPath $ArtifactRoot
  $resolved = Get-NormalizedPath $Path
  if (-not $resolved.StartsWith(($root + '\.scratch-'), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing disposable PostgreSQL operation outside the protected scratch boundary.'
  }
}

function Start-DisposablePostgres {
  param([Parameter(Mandatory)][string]$DataPath)
  Assert-ScratchPath $DataPath
  if (Test-Path -LiteralPath $DataPath) {
    Assert-NotReparsePoint -Path $DataPath -Label 'disposable PostgreSQL directory'
    Remove-Item -LiteralPath $DataPath -Recurse -Force
  }
  New-Item -ItemType Directory -Path $DataPath | Out-Null
  $initdb = Join-Path $PostgresBin 'initdb.exe'
  Invoke-External -File $initdb -Arguments @('--pgdata',$DataPath,'--username=postgres','--auth=trust','--encoding=UTF8','--no-locale') -Label 'disposable PostgreSQL initialization' | Out-Null
  $script:LocalPort = Get-FreeTcpPort
  $pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
  $serverLog = Join-Path $ArtifactRoot 'disposable-postgres.log'
  Invoke-DetachedControlProcess -File $pgCtl -Arguments @('--silent','--pgdata',$DataPath,'--log',$serverLog,'--options',"-h 127.0.0.1 -p $($script:LocalPort)",'--wait','start') -Label 'disposable PostgreSQL start'
}

function Stop-DisposablePostgres {
  param([Parameter(Mandatory)][string]$DataPath)
  if ($script:LocalPort -and (Test-Path -LiteralPath $DataPath)) {
    $pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
    try { Invoke-External -File $pgCtl -Arguments @('--pgdata',$DataPath,'--mode=fast','--wait','stop') -Label 'disposable PostgreSQL stop' | Out-Null } catch { Write-Log 'Disposable PostgreSQL stop reported a failure; cleanup will continue.' }
  }
  if (Test-Path -LiteralPath $DataPath) {
    Assert-ScratchPath $DataPath
    Assert-NotReparsePoint -Path $DataPath -Label 'disposable PostgreSQL cleanup directory'
    Remove-Item -LiteralPath $DataPath -Recurse -Force
  }
  $script:LocalPort = $null
}

function Invoke-LocalQuery {
  param([Parameter(Mandatory)][string]$Database, [Parameter(Mandatory)][string]$Sql, [Parameter(Mandatory)][string]$Label)
  $psql = Join-Path $PostgresBin 'psql.exe'
  $queryPath = New-ProtectedSqlFile -Sql $Sql
  try {
    $commandArguments = @('-X','-A','-t','-q','-v','ON_ERROR_STOP=1','--host','127.0.0.1','--port',[string]$script:LocalPort,'--username','postgres','--dbname',$Database,'--file',$queryPath)
    $result = Invoke-External -File $psql -Arguments $commandArguments -Label $Label
    return (@($result) -join "`n").Trim()
  } finally {
    if (Test-Path -LiteralPath $queryPath) { Remove-Item -LiteralPath $queryPath -Force }
  }
}

function Invoke-LocalFile {
  param([Parameter(Mandatory)][string]$Database, [Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Label)
  $psql = Join-Path $PostgresBin 'psql.exe'
  $args = @('-X','-q','-v','ON_ERROR_STOP=1','--host','127.0.0.1','--port',[string]$script:LocalPort,'--username','postgres','--dbname',$Database,'--file',$Path)
  Invoke-External -File $psql -Arguments $args -Label $Label | Out-Null
}

function New-LocalDatabase {
  param([Parameter(Mandatory)][string]$Database)
  $createdb = Join-Path $PostgresBin 'createdb.exe'
  Invoke-External -File $createdb -Arguments @('--host','127.0.0.1','--port',[string]$script:LocalPort,'--username','postgres',$Database) -Label "create disposable database $Database" | Out-Null
  $bootstrap = @'
create schema if not exists auth;
create schema if not exists supabase_migrations;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema public;
create or replace function auth.uid()
returns uuid
language sql
stable
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end
$$;
'@
  [void](Invoke-LocalQuery -Database $Database -Sql $bootstrap -Label "bootstrap disposable database $Database")
}

function Test-TocObject {
  param([string]$Descriptor, [string]$Stage, [string]$Scope)
  if (-not $Descriptor) { return $false }
  if ($Stage -eq 'pre' -and ($Descriptor.StartsWith('TABLE DATA ') -or $Descriptor.StartsWith('SEQUENCE SET ') -or $Descriptor.StartsWith('MATERIALIZED VIEW DATA '))) { return $false }
  $preKinds = '^(MATERIALIZED VIEW|TYPE|DOMAIN|TABLE|SEQUENCE|SEQUENCE OWNED BY|DEFAULT)\s+'
  $postKinds = '^(CONSTRAINT|FK CONSTRAINT|INDEX|INDEX ATTACH)\s+'
  $pattern = if ($Stage -eq 'pre') { $preKinds } elseif ($Stage -eq 'data') { '^(TABLE DATA|MATERIALIZED VIEW DATA)\s+' } else { $postKinds }
  if ($Descriptor -notmatch $pattern) { return $false }
  if ($Scope -eq 'public') { return $Descriptor -match '\s+public\s+' -and $Descriptor -notmatch '^TABLE ATTACH\s+' }
  if ($Scope -eq 'auth') { return $Descriptor -match '\s+auth\s+(users|identities)(\s+|$)' }
  if ($Scope -eq 'migrations') { return $Descriptor -match '\s+supabase_migrations\s+schema_migrations(\s+|$)' }
  if ($Scope -eq 'staff') { return $Descriptor -match '\s+public\s+staff_messages(\s+|$)' }
  return $false
}

function Write-TocSelection {
  param(
    [Parameter(Mandatory)][string[]]$Toc,
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][ValidateSet('pre','data','post')][string]$Stage,
    [Parameter(Mandatory)][string[]]$Scopes
  )
  $selected = New-Object 'System.Collections.Generic.List[string]'
  foreach ($line in $Toc) {
    $descriptor = Get-TocDescriptor $line
    foreach ($scope in $Scopes) {
      if (Test-TocObject -Descriptor $descriptor -Stage $Stage -Scope $scope) { $selected.Add($line); break }
    }
  }
  if ($selected.Count -eq 0) { throw "Archive selection for $Stage/$($Scopes -join ',') is empty." }
  Write-Utf8NoBom -Path $Path -Content (($selected -join "`n") + "`n")
  return $selected.Count
}

function Restore-TocSelection {
  param([string]$Archive, [string]$Database, [string]$ListPath, [string]$Label)
  $restore = Join-Path $PostgresBin 'pg_restore.exe'
  $args = @('--exit-on-error','--no-owner','--no-privileges','--use-list',$ListPath,'--host','127.0.0.1','--port',[string]$script:LocalPort,'--username','postgres','--dbname',$Database,$Archive)
  Invoke-External -File $restore -Arguments $args -Label $Label | Out-Null
}

function Get-JsonQueryResult {
  param([string]$Database, [string]$Sql, [string]$Label)
  $text = Invoke-LocalQuery -Database $Database -Sql $Sql -Label $Label
  if ([string]::IsNullOrWhiteSpace($text)) { return @() }
  $parsed = ConvertFrom-JsonArray -Text $text
  foreach ($item in $parsed) { Write-Output $item }
}

function ConvertFrom-JsonArray {
  param([Parameter(Mandatory)][string]$Text)
  $parsed = $Text | ConvertFrom-Json
  if ($parsed -is [Array]) {
    foreach ($item in $parsed) { Write-Output $item }
    return
  }
  Write-Output $parsed
}

function Get-ColumnMetadata {
  param([string]$Database)
  $sql = @"
select coalesce(jsonb_agg(to_jsonb(x) order by schema_name, table_name, ordinal_position),'[]'::jsonb)::text
from (
  select table_schema as schema_name, table_name, ordinal_position, column_name,
         data_type, udt_schema, udt_name, is_nullable, column_default, is_identity, is_generated
  from information_schema.columns
  where table_schema = 'public'
     or (table_schema = 'auth' and table_name in ('users','identities'))
) x;
"@
  return @(Get-JsonQueryResult -Database $Database -Sql $sql -Label "column metadata from $Database")
}

function Compare-ColumnMetadata {
  param([object[]]$Source, [object[]]$Target)
  $sourceMap = @{}
  $targetMap = @{}
  foreach ($column in $Source) { $sourceMap["$($column.schema_name).$($column.table_name).$($column.column_name)"] = $column }
  foreach ($column in $Target) { $targetMap["$($column.schema_name).$($column.table_name).$($column.column_name)"] = $column }
  $sourceOnly = @()
  $targetRequiredOnly = @()
  $typeDifferences = @()
  $defaultDifferences = @()
  $sourceOnlyDetails = @()
  $targetRequiredOnlyDetails = @()
  $typeDifferenceDetails = @()
  $defaultDifferenceDetails = @()
  foreach ($key in @($sourceMap.Keys | Sort-Object)) {
    if (-not $targetMap.ContainsKey($key)) {
      $left = $sourceMap[$key]
      $sourceOnly += $key
      $sourceOnlyDetails += [ordered]@{ identity = $key; dataType = $left.data_type; udtSchema = $left.udt_schema; udtName = $left.udt_name; nullable = $left.is_nullable; default = $left.column_default; identityColumn = $left.is_identity; generated = $left.is_generated }
      continue
    }
    $left = $sourceMap[$key]
    $right = $targetMap[$key]
    if ($left.data_type -ne $right.data_type -or $left.udt_schema -ne $right.udt_schema -or $left.udt_name -ne $right.udt_name) {
      $typeDifferences += $key
      $typeDifferenceDetails += [ordered]@{ identity = $key; source = [ordered]@{ dataType = $left.data_type; udtSchema = $left.udt_schema; udtName = $left.udt_name }; target = [ordered]@{ dataType = $right.data_type; udtSchema = $right.udt_schema; udtName = $right.udt_name } }
    }
    if ([string]$left.column_default -ne [string]$right.column_default) {
      $defaultDifferences += $key
      $defaultDifferenceDetails += [ordered]@{ identity = $key; sourceDefault = $left.column_default; targetDefault = $right.column_default }
    }
  }
  foreach ($key in @($targetMap.Keys | Sort-Object)) {
    if ($sourceMap.ContainsKey($key)) { continue }
    $column = $targetMap[$key]
    if ($column.is_nullable -eq 'NO' -and [string]::IsNullOrEmpty([string]$column.column_default) -and $column.is_identity -ne 'YES' -and $column.is_generated -ne 'ALWAYS') {
      $targetRequiredOnly += $key
      $targetRequiredOnlyDetails += [ordered]@{ identity = $key; dataType = $column.data_type; udtSchema = $column.udt_schema; udtName = $column.udt_name; nullable = $column.is_nullable; default = $column.column_default; identityColumn = $column.is_identity; generated = $column.is_generated }
    }
  }
  return [ordered]@{
    sourceOnly = $sourceOnly
    sourceOnlyDetails = $sourceOnlyDetails
    targetRequiredOnly = $targetRequiredOnly
    targetRequiredOnlyDetails = $targetRequiredOnlyDetails
    typeDifferences = $typeDifferences
    typeDifferenceDetails = $typeDifferenceDetails
    defaultDifferences = $defaultDifferences
    defaultDifferenceDetails = $defaultDifferenceDetails
  }
}

function Get-ConstraintMetadata {
  param([string]$Database)
  $sql = @"
select coalesce(jsonb_agg(to_jsonb(x) order by schema_name, table_name, constraint_name),'[]'::jsonb)::text
from (
  select n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name,
         con.contype::text as constraint_type, con.convalidated as validated,
         md5(pg_get_constraintdef(con.oid, true)) as definition_sha256
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' or (n.nspname = 'auth' and c.relname in ('users','identities'))
) x;
"@
  return @(Get-JsonQueryResult -Database $Database -Sql $sql -Label "constraint metadata from $Database")
}

function Compare-ConstraintMetadata {
  param([object[]]$Source, [object[]]$Target)
  $sourceMap = @{}
  $targetMap = @{}
  foreach ($item in $Source) { $sourceMap["$($item.schema_name).$($item.table_name).$($item.constraint_name)"] = $item }
  foreach ($item in $Target) { $targetMap["$($item.schema_name).$($item.table_name).$($item.constraint_name)"] = $item }
  $sourceOnly = @($sourceMap.Keys | Where-Object { -not $targetMap.ContainsKey($_) } | Sort-Object)
  $targetOnly = @($targetMap.Keys | Where-Object { -not $sourceMap.ContainsKey($_) } | Sort-Object)
  $changed = @($sourceMap.Keys | Where-Object { $targetMap.ContainsKey($_) -and $sourceMap[$_].definition_sha256 -ne $targetMap[$_].definition_sha256 } | Sort-Object)
  $unvalidated = @($Target | Where-Object { -not $_.validated } | ForEach-Object { "$($_.schema_name).$($_.table_name).$($_.constraint_name)" } | Sort-Object)
  return [ordered]@{ sourceOnly = $sourceOnly; targetOnly = $targetOnly; changed = $changed; unvalidated = $unvalidated }
}

function Get-TableCounts {
  param([string]$Database)
  $sql = @'
select coalesce(jsonb_object_agg(table_name, row_count order by table_name),'{}'::jsonb)::text
from (
  select c.relname as table_name,
         (xpath('/row/count/text()', query_to_xml(format('select count(*) as count from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as row_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
) counts;
'@
  $text = Invoke-LocalQuery -Database $Database -Sql $sql -Label "row-count metadata from $Database"
  return $text | ConvertFrom-Json
}

function Get-SequenceChecks {
  param([string]$Database)
  $sql = @'
select coalesce(jsonb_agg(to_jsonb(x) order by sequence_identity),'[]'::jsonb)::text
from (
  select format('%I.%I', sn.nspname, seq.relname) as sequence_identity,
         format('%I.%I.%I', tn.nspname, tab.relname, att.attname) as owned_column,
         case when pg_sequence_last_value(seq.oid) is null then true
              else pg_sequence_last_value(seq.oid) >=
                   (xpath('/row/max/text()', query_to_xml(format('select coalesce(max(%I),0) as max from %I.%I', att.attname, tn.nspname, tab.relname), false, true, '')))[1]::text::numeric
          end as passed
  from pg_class seq
  join pg_namespace sn on sn.oid = seq.relnamespace
  join pg_depend dep on dep.objid = seq.oid and dep.deptype in ('a','i')
  join pg_class tab on tab.oid = dep.refobjid
  join pg_namespace tn on tn.oid = tab.relnamespace
  join pg_attribute att on att.attrelid = tab.oid and att.attnum = dep.refobjsubid
  where seq.relkind = 'S' and tn.nspname = 'public'
) x;
'@
  return @(Get-JsonQueryResult -Database $Database -Sql $sql -Label "sequence checks from $Database")
}

function New-SelectiveLoader {
  param([string]$SourceDatabase, [string[]]$PublicTables, [string]$OutputPath, [switch]$StaffOnly, [switch]$AuthOnly)
  $rawPath = "$OutputPath.raw"
  $dump = Join-Path $PostgresBin 'pg_dump.exe'
  $args = @('--data-only','--column-inserts','--no-owner','--no-privileges','--host','127.0.0.1','--port',[string]$script:LocalPort,'--username','postgres','--dbname',$SourceDatabase,'--file',$rawPath)
  if ($AuthOnly) {
    $args += @('--table','auth.users','--table','auth.identities')
    $truncate = 'truncate table auth.identities, auth.users restart identity cascade;'
  } elseif ($StaffOnly) {
    $args += @('--table','public.staff_messages')
    $truncate = 'truncate table public.staff_messages restart identity cascade;'
  } else {
    foreach ($table in @($PublicTables | Where-Object { $_ -ne 'public.staff_messages' })) {
      $args += @('--table',$table)
    }
    $args += @('--table','auth.users','--table','auth.identities')
    $quotedTables = @($PublicTables | Where-Object { $_ -ne 'public.staff_messages' } | ForEach-Object {
      $parts = $_.Split('.', 2); '"{0}"."{1}"' -f $parts[0].Replace('"','""'), $parts[1].Replace('"','""')
    })
    $truncate = 'truncate table auth.identities, auth.users, ' + ($quotedTables -join ', ') + ' restart identity cascade;'
  }
  Invoke-External -File $dump -Arguments $args -Label 'generate protected selective data SQL' | Out-Null
  $body = Get-Content -LiteralPath $rawPath -Raw
  Remove-Item -LiteralPath $rawPath -Force
  $header = @"
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local lock_timeout = '30s';
set local session_replication_role = replica;
$truncate
"@
  $footer = "`nset local session_replication_role = origin;`ncommit;`n"
  Write-Utf8NoBom -Path $OutputPath -Content ($header + "`n" + $body + $footer)
}

function Invoke-SelectiveDataLoader {
  param([string]$Database, [string]$LoaderPath, [string]$Label)
  Assert-PortableAuthBoundary -LoaderPath $LoaderPath
  Invoke-LocalFile -Database $Database -Path $LoaderPath -Label $Label
}

function Assert-PortableAuthBoundary {
  param([Parameter(Mandatory)][string]$LoaderPath)
  $loaderText = Get-Content -LiteralPath $LoaderPath -Raw
  foreach ($forbiddenTable in @('auth.sessions','auth.refresh_tokens','auth.one_time_tokens','auth.audit_log_entries','auth.instances')) {
    if ($loaderText -match ('(?i)(insert\s+into|copy|truncate\s+table)[^;\r\n]*' + [regex]::Escape($forbiddenTable))) {
      throw "Selective loader contains forbidden managed Auth table $forbiddenTable."
    }
  }
}

function Invoke-RehearsePhase {
  [void](Assert-ApprovedArchive)
  $verifiedBackup = Assert-VerifiedBackup
  $sourceToc = Get-ArchiveToc -Archive $ApprovedArchive -Label 'source rehearsal archive list'
  $targetToc = Get-ArchiveToc -Archive $verifiedBackup.path -Label 'target rehearsal archive list'
  $sourcePublicTables = @(Get-TocTables -Toc $sourceToc -Schema 'public')
  $targetPublicTables = @(Get-TocTables -Toc $targetToc -Schema 'public')
  $tableDiff = Get-SetDiff -Source $sourcePublicTables -Target $targetPublicTables
  $scratch = Join-Path $ArtifactRoot ('.scratch-database-reconcile-' + $PID)
  $sourceDatabase = 'cutover_source'
  $targetDatabase = 'cutover_target'
  $lists = Join-Path $ArtifactRoot '.rehearsal-lists'
  if (Test-Path -LiteralPath $lists) { Remove-Item -LiteralPath $lists -Recurse -Force }
  New-Item -ItemType Directory -Path $lists | Out-Null

  try {
    Start-DisposablePostgres -DataPath $scratch
    New-LocalDatabase -Database $sourceDatabase
    New-LocalDatabase -Database $targetDatabase

    $sourcePre = Join-Path $lists 'source-pre.list'
    $sourceData = Join-Path $lists 'source-data.list'
    $sourcePost = Join-Path $lists 'source-post.list'
    $targetPre = Join-Path $lists 'target-pre.list'
    $targetPost = Join-Path $lists 'target-post.list'
    $staffPre = Join-Path $lists 'staff-pre.list'
    $staffPost = Join-Path $lists 'staff-post.list'
    [void](Write-TocSelection -Toc $sourceToc -Path $sourcePre -Stage pre -Scopes @('public','auth','migrations'))
    [void](Write-TocSelection -Toc $sourceToc -Path $sourceData -Stage data -Scopes @('public','auth','migrations'))
    [void](Write-TocSelection -Toc $sourceToc -Path $sourcePost -Stage post -Scopes @('public','auth'))
    [void](Write-TocSelection -Toc $targetToc -Path $targetPre -Stage pre -Scopes @('public','auth'))
    [void](Write-TocSelection -Toc $targetToc -Path $targetPost -Stage post -Scopes @('public','auth'))
    [void](Write-TocSelection -Toc $sourceToc -Path $staffPre -Stage pre -Scopes @('staff'))
    [void](Write-TocSelection -Toc $sourceToc -Path $staffPost -Stage post -Scopes @('staff'))

    Restore-TocSelection -Archive $ApprovedArchive -Database $sourceDatabase -ListPath $sourcePre -Label 'restore source rehearsal schema'
    Restore-TocSelection -Archive $ApprovedArchive -Database $sourceDatabase -ListPath $sourceData -Label 'restore source rehearsal selected data'
    $identityCardinalityText = Invoke-LocalQuery -Database $sourceDatabase -Sql "select jsonb_build_object('rows',count(*),'distinctIds',count(distinct id))::text from auth.identities;" -Label 'source Auth identity cardinality precheck'
    $identityCardinality = $identityCardinalityText | ConvertFrom-Json
    Write-Log "Source Auth identity cardinality: rows=$($identityCardinality.rows); distinctIds=$($identityCardinality.distinctIds)."
    if ([int]$identityCardinality.rows -ne [int]$identityCardinality.distinctIds) {
      throw 'Approved source Auth identities contain duplicate primary-key identifiers.'
    }
    Restore-TocSelection -Archive $ApprovedArchive -Database $sourceDatabase -ListPath $sourcePost -Label 'validate source rehearsal constraints'

    Restore-TocSelection -Archive $verifiedBackup.path -Database $targetDatabase -ListPath $targetPre -Label 'restore target rehearsal schema'
    Restore-TocSelection -Archive $ApprovedArchive -Database $targetDatabase -ListPath $staffPre -Label 'restore missing staff_messages schema in target rehearsal'

    $sourceColumns = @(Get-ColumnMetadata -Database $sourceDatabase)
    $targetColumns = @(Get-ColumnMetadata -Database $targetDatabase)
    $columnDiff = Compare-ColumnMetadata -Source $sourceColumns -Target $targetColumns
    $legacyUsageText = Invoke-LocalQuery -Database $sourceDatabase -Label 'legacy source-column usage counts' -Sql @'
select jsonb_build_object(
  'appointments.patient_ic', count(*) filter (where patient_ic is not null),
  'appointments.service_slug', count(*) filter (where service_slug is not null),
  'appointments.payment_reference', count(*) filter (where payment_reference is not null),
  'appointments.updated_at', count(*) filter (where updated_at is not null),
  'queue_entries.cancelled_at', (select count(*) from public.queue_entries where cancelled_at is not null),
  'queue_entries.cancelled_by', (select count(*) from public.queue_entries where cancelled_by is not null),
  'queue_entries.cancellation_reason', (select count(*) from public.queue_entries where cancellation_reason is not null),
  'queue_entries.queue_sequence', (select count(*) from public.queue_entries where queue_sequence is not null)
)::text
from public.appointments;
'@
    $legacyUsage = $legacyUsageText | ConvertFrom-Json
    Write-ProtectedJson -Path (Join-Path $ArtifactRoot '.rehearsal-column-diff.json') -Value ([ordered]@{ diff = $columnDiff; sourceOnlyNonNullCounts = $legacyUsage })

    $mainLoader = Join-Path $ArtifactRoot $LoaderName
    $staffLoader = Join-Path $ArtifactRoot $HeldStaffLoaderName
    $authLoader = Join-Path $ArtifactRoot $AuthLoaderName
    New-SelectiveLoader -SourceDatabase $sourceDatabase -PublicTables $sourcePublicTables -OutputPath $mainLoader
    New-SelectiveLoader -SourceDatabase $sourceDatabase -PublicTables $sourcePublicTables -OutputPath $staffLoader -StaffOnly
    New-SelectiveLoader -SourceDatabase $sourceDatabase -PublicTables $sourcePublicTables -OutputPath $authLoader -AuthOnly

    $blockingColumnDiff = @($columnDiff.sourceOnly).Count -gt 0 -or @($columnDiff.targetRequiredOnly).Count -gt 0 -or @($columnDiff.typeDifferences).Count -gt 0
    if ($blockingColumnDiff) {
      Invoke-SelectiveDataLoader -Database $targetDatabase -LoaderPath $authLoader -Label 'rehearse portable Auth-only loader'
      Restore-TocSelection -Archive $verifiedBackup.path -Database $targetDatabase -ListPath $targetPost -Label 'validate target rehearsal constraints after Auth-only load'
      Restore-TocSelection -Archive $ApprovedArchive -Database $targetDatabase -ListPath $staffPost -Label 'validate empty staff_messages rehearsal constraints'

      $sourceConstraints = @(Get-ConstraintMetadata -Database $sourceDatabase)
      $targetConstraints = @(Get-ConstraintMetadata -Database $targetDatabase)
      $constraintDiff = Compare-ConstraintMetadata -Source $sourceConstraints -Target $targetConstraints
      $sourceCounts = Get-TableCounts -Database $sourceDatabase
      $sourceUsers = [int](Invoke-LocalQuery -Database $sourceDatabase -Sql 'select count(*) from auth.users;' -Label 'source rehearsal Auth user count')
      $sourceIdentities = [int](Invoke-LocalQuery -Database $sourceDatabase -Sql 'select count(*) from auth.identities;' -Label 'source rehearsal Auth identity count')
      $targetUsers = [int](Invoke-LocalQuery -Database $targetDatabase -Sql 'select count(*) from auth.users;' -Label 'target rehearsal Auth user count')
      $targetIdentities = [int](Invoke-LocalQuery -Database $targetDatabase -Sql 'select count(*) from auth.identities;' -Label 'target rehearsal Auth identity count')
      $sourceMigrationText = Invoke-LocalQuery -Database $sourceDatabase -Sql "select coalesce(jsonb_agg(version order by version),'[]'::jsonb)::text from supabase_migrations.schema_migrations;" -Label 'source rehearsal migration identities'
      $sourceMigrations = @(ConvertFrom-JsonArray -Text $sourceMigrationText)
      $targetInventoryPath = Join-Path $ArtifactRoot $InventoryName
      if (-not (Test-Path -LiteralPath $targetInventoryPath)) { [void](Invoke-InventoryPhase) }
      $targetInventory = (Get-Content -LiteralPath $targetInventoryPath -Raw | ConvertFrom-Json).target
      $sequenceChecks = @(Get-SequenceChecks -Database $targetDatabase)
      $functionDiff = Get-SetDiff -Source (Get-TocIdentities -Toc $sourceToc -Kind FUNCTION) -Target (Get-TocIdentities -Toc $targetToc -Kind FUNCTION)
      $policyDiff = Get-SetDiff -Source (Get-TocIdentities -Toc $sourceToc -Kind POLICY) -Target (Get-TocIdentities -Toc $targetToc -Kind POLICY)
      $populatedSourceOnlyColumns = @($legacyUsage.PSObject.Properties | Where-Object { [int64]$_.Value -gt 0 } | ForEach-Object Name | Sort-Object)

      $report = [ordered]@{
        pass = $false
        blockedReason = 'authoritative target schema cannot losslessly represent populated source columns'
        generatedAtUtc = [DateTime]::UtcNow.ToString('o')
        safety = [ordered]@{ targetWriteConnections = 0; localHost = '127.0.0.1'; protectedArtifactsOnly = $true; migrationsApplied = 0 }
        source = [ordered]@{ publicTables = $sourcePublicTables.Count; tableCounts = $sourceCounts; migrations = $sourceMigrations; archiveSha256 = $ApprovedArchiveSha256 }
        targetBaseline = [ordered]@{ publicTables = $targetPublicTables.Count; migrations = @($targetInventory.migrationIdentities); backupSha256 = $verifiedBackup.sha256 }
        tableDiff = $tableDiff
        columnDiff = $columnDiff
        populatedSourceOnlyColumns = $populatedSourceOnlyColumns
        sourceOnlyNonNullCounts = $legacyUsage
        safeColumnMappings = [ordered]@{
          'public.appointments.patient_name' = 'public.appointments.name'
          'public.appointments.patient_phone' = 'public.appointments.phone'
          'public.appointments.appointment_date' = 'public.appointments.preferred_date'
          'public.appointments.appointment_time' = 'public.appointments.preferred_time'
        }
        constraintDiff = $constraintDiff
        policyDiff = $policyDiff
        functionDiff = $functionDiff
        rowCountDifferences = @()
        rowCountComparisonStatus = 'not-run-public-import-blocked-by-schema'
        sequenceChecks = $sequenceChecks
        auth = [ordered]@{ sourceUsers = $sourceUsers; sourceIdentities = $sourceIdentities; importedUsers = $targetUsers; importedIdentities = $targetIdentities; sessions = 0; refreshTokens = 0 }
        loader = [ordered]@{ main = $LoaderName; heldStaffMessages = $HeldStaffLoaderName; portableAuth = $AuthLoaderName; publicDataExecuted = $false; productionTargetUsed = $false }
      }
      Write-ProtectedJson -Path (Join-Path $ArtifactRoot $ReportName) -Value $report
      throw 'Scratch rehearsal blocked: populated source columns have no lossless representation in the authoritative target schema.'
    }

    Invoke-SelectiveDataLoader -Database $targetDatabase -LoaderPath $mainLoader -Label 'rehearse selective application and portable Auth loader'
    Invoke-SelectiveDataLoader -Database $targetDatabase -LoaderPath $staffLoader -Label 'rehearse held staff_messages loader'

    Restore-TocSelection -Archive $verifiedBackup.path -Database $targetDatabase -ListPath $targetPost -Label 'validate target rehearsal constraints'
    Restore-TocSelection -Archive $ApprovedArchive -Database $targetDatabase -ListPath $staffPost -Label 'validate staff_messages rehearsal constraints'

    $sourceConstraints = @(Get-ConstraintMetadata -Database $sourceDatabase)
    $targetConstraints = @(Get-ConstraintMetadata -Database $targetDatabase)
    $constraintDiff = Compare-ConstraintMetadata -Source $sourceConstraints -Target $targetConstraints
    $sourceCounts = Get-TableCounts -Database $sourceDatabase
    $targetCounts = Get-TableCounts -Database $targetDatabase
    $countDifferences = @()
    foreach ($table in $sourcePublicTables) {
      $name = $table.Substring('public.'.Length)
      if ([int64]$sourceCounts.$name -ne [int64]$targetCounts.$name) { $countDifferences += $table }
    }
    $sourceUsers = [int](Invoke-LocalQuery -Database $sourceDatabase -Sql 'select count(*) from auth.users;' -Label 'source rehearsal Auth user count')
    $sourceIdentities = [int](Invoke-LocalQuery -Database $sourceDatabase -Sql 'select count(*) from auth.identities;' -Label 'source rehearsal Auth identity count')
    $targetUsers = [int](Invoke-LocalQuery -Database $targetDatabase -Sql 'select count(*) from auth.users;' -Label 'target rehearsal Auth user count')
    $targetIdentities = [int](Invoke-LocalQuery -Database $targetDatabase -Sql 'select count(*) from auth.identities;' -Label 'target rehearsal Auth identity count')
    $sourceMigrationText = Invoke-LocalQuery -Database $sourceDatabase -Sql "select coalesce(jsonb_agg(version order by version),'[]'::jsonb)::text from supabase_migrations.schema_migrations;" -Label 'source rehearsal migration identities'
    $sourceMigrations = @(ConvertFrom-JsonArray -Text $sourceMigrationText)
    $targetInventoryPath = Join-Path $ArtifactRoot $InventoryName
    if (-not (Test-Path -LiteralPath $targetInventoryPath)) { [void](Invoke-InventoryPhase) }
    $targetInventory = (Get-Content -LiteralPath $targetInventoryPath -Raw | ConvertFrom-Json).target
    $sequenceChecks = @(Get-SequenceChecks -Database $targetDatabase)
    $failedSequences = @($sequenceChecks | Where-Object { -not $_.passed })
    $functionDiff = Get-SetDiff -Source (Get-TocIdentities -Toc $sourceToc -Kind FUNCTION) -Target (Get-TocIdentities -Toc $targetToc -Kind FUNCTION)
    $policyDiff = Get-SetDiff -Source (Get-TocIdentities -Toc $sourceToc -Kind POLICY) -Target (Get-TocIdentities -Toc $targetToc -Kind POLICY)

    $pass = $sourcePublicTables.Count -eq 94 -and
      $targetPublicTables.Count -eq 93 -and
      @($tableDiff.sourceOnly).Count -eq 1 -and $tableDiff.sourceOnly[0] -eq 'public.staff_messages' -and
      @($tableDiff.targetOnly).Count -eq 0 -and
      $sourceUsers -eq 11 -and $sourceIdentities -eq 11 -and
      $targetUsers -eq 11 -and $targetIdentities -eq 11 -and
      $countDifferences.Count -eq 0 -and
      @($columnDiff.sourceOnly).Count -eq 0 -and @($columnDiff.targetRequiredOnly).Count -eq 0 -and @($columnDiff.typeDifferences).Count -eq 0 -and
      @($constraintDiff.unvalidated).Count -eq 0 -and $failedSequences.Count -eq 0

    $report = [ordered]@{
      pass = [bool]$pass
      generatedAtUtc = [DateTime]::UtcNow.ToString('o')
      safety = [ordered]@{ targetWriteConnections = 0; localHost = '127.0.0.1'; protectedArtifactsOnly = $true; migrationsApplied = 0 }
      source = [ordered]@{ publicTables = $sourcePublicTables.Count; tableCounts = $sourceCounts; migrations = $sourceMigrations; archiveSha256 = $ApprovedArchiveSha256 }
      targetBaseline = [ordered]@{ publicTables = $targetPublicTables.Count; migrations = @($targetInventory.migrationIdentities); backupSha256 = $verifiedBackup.sha256 }
      tableDiff = $tableDiff
      columnDiff = $columnDiff
      constraintDiff = $constraintDiff
      policyDiff = $policyDiff
      functionDiff = $functionDiff
      rowCountDifferences = $countDifferences
      sequenceChecks = $sequenceChecks
      auth = [ordered]@{ sourceUsers = $sourceUsers; sourceIdentities = $sourceIdentities; importedUsers = $targetUsers; importedIdentities = $targetIdentities; sessions = 0; refreshTokens = 0 }
      loader = [ordered]@{ main = $LoaderName; heldStaffMessages = $HeldStaffLoaderName; productionTargetUsed = $false }
    }
    Write-ProtectedJson -Path (Join-Path $ArtifactRoot $ReportName) -Value $report
    if (-not $pass) { throw 'Scratch rehearsal completed but reconciliation gates did not pass; inspect the protected report.' }
    Write-Summary 'Rehearsal passed locally: source public tables=94; source-only=public.staff_messages; Auth users=11; identities=11; imported sessions=0; refresh tokens=0; target writes=0.'
  } finally {
    Stop-DisposablePostgres -DataPath $scratch
    if (Test-Path -LiteralPath $lists) { Remove-Item -LiteralPath $lists -Recurse -Force }
  }
}

function Assert-RehearsalReport {
  $path = Join-Path $ArtifactRoot $ReportName
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Passing rehearsal report is required.' }
  Assert-NotReparsePoint -Path $path -Label 'rehearsal report'
  $report = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if (-not $report.pass -or $report.auth.sessions -ne 0 -or $report.auth.refreshTokens -ne 0) { throw 'Rehearsal report does not pass the required Auth/session gates.' }
  return $report
}

function Invoke-VerifyPhase {
  [void](Assert-ApprovedArchive)
  [void](Assert-VerifiedBackup)
  [void](Assert-RehearsalReport)
  $inventory = Get-TargetInventory
  if ($inventory.publicTables -ne 93 -or $inventory.authUsers -ne 0 -or $inventory.migrationRows -ne 153) {
    throw 'Target changed after rehearsal; refusing the write window.'
  }
  Write-Summary 'Verify passed read-only: target ref, source archive, protected backup, rehearsal report, and unchanged target baseline are valid.'
}

function Invoke-ImportPhase {
  Invoke-VerifyPhase
  $loader = Join-Path $ArtifactRoot $LoaderName
  if (-not (Test-Path -LiteralPath $loader -PathType Leaf)) { throw 'Protected selective data loader is missing.' }
  Assert-NotReparsePoint -Path $loader -Label 'selective data loader'
  Assert-PortableAuthBoundary -LoaderPath $loader
  Invoke-TargetFile -Path $loader -Label 'guarded target selective data import'
  Write-Summary 'Import phase committed the rehearsed application/Auth loader; staff_messages data remains held until its hardened schema exists.'
}

function Invoke-RollbackPhase {
  $verified = Assert-VerifiedBackup
  $restore = Join-Path $PostgresBin 'pg_restore.exe'
  $commandArguments = @('--clean','--if-exists','--exit-on-error','--single-transaction','--no-owner','--no-privileges') + (Get-TargetArguments) + @($verified.path)
  Invoke-WithTargetEnvironment -Action { Invoke-External -File $restore -Arguments $commandArguments -Label 'guarded full target rollback' | Out-Null }
  Write-Summary 'Rollback phase restored the verified pre-cutover target backup.'
}

try {
  Assert-RequiredTools
  $environment = Import-ProtectedEnvironment -Path $ProtectedEnv
  $targetUri = Assert-TargetProjectRef -Environment $environment
  $script:Target = Get-TargetConnection -Environment $environment -Uri $targetUri
  Write-Log "Guard passed for target project ref $ExpectedRef."
  switch ($Phase) {
    'Inventory' { [void](Invoke-InventoryPhase) }
    'Backup' { Invoke-BackupPhase }
    'Rehearse' { Invoke-RehearsePhase }
    'Verify' { Invoke-VerifyPhase }
    'Import' { Invoke-ImportPhase }
    'Rollback' { Invoke-RollbackPhase }
  }
} catch {
  Write-Log ('FAILED: ' + $_.Exception.Message)
  Write-Error $_.Exception.Message
  exit 1
}
