import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const powershellCommand = process.platform === "win32" ? "powershell" : "pwsh";
const powershellExecutionPolicyArgs =
  process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : [];

const sql = readFileSync(
  "supabase/migrations/20260721174422_preserve_source_cutover_fields.sql",
  "utf8",
).toLowerCase();
const runner = readFileSync("scripts/cutover/database-reconcile.ps1", "utf8").toLowerCase();

function runGuardProbe(body: string) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$runnerPath = (Resolve-Path 'scripts/cutover/database-reconcile.ps1').Path
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($runnerPath, [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Runner does not parse.' }
function Import-RunnerFunction {
  param([Parameter(Mandatory)][string]$Name)
  $definition = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name
  }, $true)
  if (-not $definition) { throw "Runner function is missing: $Name" }
  $globalDefinition = $definition.Extent.Text -replace ('^function\s+' + [regex]::Escape($Name)), ('function global:' + $Name)
  Invoke-Expression $globalDefinition
}
${body}
`;
  const result = spawnSync(
    powershellCommand,
    [
      "-NoProfile",
      "-NonInteractive",
      ...powershellExecutionPolicyArgs,
      "-Command",
      "-",
    ],
    { cwd: process.cwd(), input: script, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`.trim());
  }
  return result.stdout.trim();
}

describe("source cutover compatibility migration", () => {
  it.each([
    "patient_ic text",
    "service_slug text",
    "payment_reference text",
    "updated_at timestamp with time zone default now()",
  ])("preserves appointments field %s", (definition) => {
    expect(sql).toContain(definition);
  });

  it.each([
    "cancelled_at timestamp with time zone",
    "cancelled_by uuid",
    "cancellation_reason text",
    "queue_sequence integer",
  ])("preserves queue field %s", (definition) => {
    expect(sql).toContain(definition);
  });

  it("restores both source foreign keys", () => {
    expect(sql).toContain("foreign key (service_slug) references public.clinic_services(slug)");
    expect(sql).toContain("foreign key (cancelled_by) references auth.users(id)");
  });

  it("preserves the source queue cancellation status without remapping data", () => {
    expect(sql).toContain(
      "alter type public.clinic_status add value if not exists 'cancelled'",
    );
    expect(runner).not.toMatch(/clinic_status[^\r\n]+replace/);
  });

  it("does not replace the authoritative target appointment columns or default", () => {
    expect(sql).not.toMatch(/drop\s+column/);
    expect(sql).not.toContain("alter column status set default");
    expect(sql).not.toContain("patient_name text");
    expect(sql).not.toContain("patient_phone text");
  });
});

describe("cutover compatibility rehearsal", () => {
  it.each([
    ["patient_name", "name"],
    ["patient_phone", "phone"],
    ["appointment_date", "preferred_date"],
    ["appointment_time", "preferred_time"],
  ])("maps appointments column %s to %s", (source, target) => {
    expect(runner).toContain(`'${source}' = '${target}'`);
  });

  it("rewrites only the generated appointments inserts", () => {
    expect(runner).toContain("function convert-appointmentinsertcolumns");
    expect(runner).toContain("$body = convert-appointmentinsertcolumns -sql $body");
  });

  it.each([
    "20260721162256_restore_staff_messages.sql",
    "20260721174422_preserve_source_cutover_fields.sql",
  ])("applies %s to disposable target scratch", (migration) => {
    expect(runner).toContain(migration);
    expect(runner).toContain(
      "invoke-task4scratchmigrations -database $targetdatabase -migrations $task4migrations",
    );
  });

  it("never applies either migration to the target", () => {
    expect(runner).not.toMatch(
      /invoke-targetfile[^\r\n]+\$(?:staffmessages|compatibility)migration/,
    );
  });
});

describe("cutover evidence and safety guards", () => {
  it("invalidates Rehearse and Backup evidence before fallible preflight checks", () => {
    const backupPreflight = runner.indexOf(
      "if ($phase -eq 'backup') { invalidate-backupevidence }",
    );
    const rehearsalPreflight = runner.indexOf(
      "if ($phase -eq 'rehearse') { invalidate-rehearsalevidence }",
    );
    const toolPreflight = runner.lastIndexOf("assert-requiredtools");
    const environmentPreflight = runner.indexOf("protected environment file is missing");
    expect(backupPreflight).toBeGreaterThan(-1);
    expect(rehearsalPreflight).toBeGreaterThan(-1);
    expect(backupPreflight).toBeLessThan(toolPreflight);
    expect(rehearsalPreflight).toBeLessThan(toolPreflight);
    expect(backupPreflight).toBeLessThan(environmentPreflight);
    expect(rehearsalPreflight).toBeLessThan(environmentPreflight);
  });

  it("accepts only the exact direct host or an official pooler host", () => {
    expect(
      runGuardProbe(String.raw`
Import-RunnerFunction Assert-TargetProjectRef
$ExpectedRef = 'nhjbqdiyptjqherdfbqk'
$valid = @(
  @{ STAGING_PROJECT_REF = $ExpectedRef; STAGING_DB_URL = "postgresql://postgres:test@db.$($ExpectedRef).supabase.co:5432/postgres" },
  @{ STAGING_PROJECT_REF = $ExpectedRef; STAGING_DB_URL = "postgresql://postgres.$($ExpectedRef):test@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" }
)
foreach ($environment in $valid) { [void](Assert-TargetProjectRef -Environment $environment) }
$forged = @{
  STAGING_PROJECT_REF = $ExpectedRef
  STAGING_DB_URL = "postgresql://postgres.$($ExpectedRef):test@attacker.example:6543/postgres"
}
$rejected = $false
try { [void](Assert-TargetProjectRef -Environment $forged) } catch { $rejected = $true }
if (-not $rejected) { throw 'Forged pooler hostname was accepted.' }
'host guard passed'
`),
    ).toContain("host guard passed");
  }, 15_000);

  it("atomically invalidates stale rehearsal and backup evidence", () => {
    expect(
      runGuardProbe(String.raw`
Import-RunnerFunction Invalidate-EvidenceFile
Import-RunnerFunction Invalidate-RehearsalEvidence
Import-RunnerFunction Invalidate-BackupEvidence
$ArtifactRoot = Join-Path ([IO.Path]::GetTempPath()) ('cutover-evidence-' + [Guid]::NewGuid().ToString('N'))
$ReportName = 'rehearsal-report.json'
$LoaderName = 'selective-data-loader.sql'
$HeldStaffLoaderName = 'staff-messages-loader.sql'
$AuthLoaderName = 'portable-auth-loader.sql'
$BackupName = 'target-before-cutover.backup'
$BackupHashName = 'target-before-cutover.sha256'
$BackupManifestName = 'target-before-cutover.manifest.json'
New-Item -ItemType Directory -Path $ArtifactRoot | Out-Null
try {
  foreach ($name in @($ReportName,$LoaderName,$HeldStaffLoaderName,$AuthLoaderName)) { Set-Content -LiteralPath (Join-Path $ArtifactRoot $name) -Value 'stale' }
  Invalidate-RehearsalEvidence
  foreach ($name in @($ReportName,$LoaderName,$HeldStaffLoaderName,$AuthLoaderName)) { if (Test-Path -LiteralPath (Join-Path $ArtifactRoot $name)) { throw "Stale rehearsal evidence survived: $name" } }
  foreach ($name in @($BackupName,$BackupHashName,$BackupManifestName,$ReportName)) { Set-Content -LiteralPath (Join-Path $ArtifactRoot $name) -Value 'stale' }
  Invalidate-BackupEvidence
  foreach ($name in @($BackupName,$BackupHashName,$BackupManifestName,$ReportName)) { if (Test-Path -LiteralPath (Join-Path $ArtifactRoot $name)) { throw "Stale backup evidence survived: $name" } }
} finally { Remove-Item -LiteralPath $ArtifactRoot -Recurse -Force }
'invalidation guards passed'
`),
    ).toContain("invalidation guards passed");
  });

  it("rejects every tampered rehearsal binding field", () => {
    expect(
      runGuardProbe(String.raw`
Import-RunnerFunction Get-StringSha256
Import-RunnerFunction Get-JsonSha256
Import-RunnerFunction Assert-RehearsalBinding
$expected = [ordered]@{
  runnerSha256 = ('1' * 64)
  loaderSha256 = ('2' * 64)
  heldStaffLoaderSha256 = ('3' * 64)
  portableAuthLoaderSha256 = ('4' * 64)
  approvedArchiveSha256 = ('5' * 64)
  backupSha256 = ('6' * 64)
  backupManifestSha256 = ('7' * 64)
  targetBaselineSha256 = ('8' * 64)
  migrations = @([ordered]@{ name='one.sql'; sha256=('9' * 64) },[ordered]@{ name='two.sql'; sha256=('A' * 64) })
}
Assert-RehearsalBinding -Expected $expected -Actual $expected
foreach ($field in @('runnerSha256','loaderSha256','heldStaffLoaderSha256','portableAuthLoaderSha256','approvedArchiveSha256','backupSha256','backupManifestSha256','targetBaselineSha256','migrations')) {
  $tampered = ($expected | ConvertTo-Json -Depth 10 | ConvertFrom-Json)
  if ($field -eq 'migrations') { $tampered.migrations[0].sha256 = ('B' * 64) } else { $tampered.$field = ('C' * 64) }
  $rejected = $false
  try { Assert-RehearsalBinding -Expected $expected -Actual $tampered } catch { $rejected = $true }
  if (-not $rejected) { throw "Tampered binding was accepted: $field" }
}
'binding guard passed'
`),
    ).toContain("binding guard passed");
  });

  it("rejects identity, migration, or schema drift from the exact target baseline", () => {
    expect(
      runGuardProbe(String.raw`
Import-RunnerFunction Get-StringSha256
Import-RunnerFunction Get-JsonSha256
Import-RunnerFunction Assert-TargetBaselineUnchanged
$expected = [ordered]@{ projectRef='nhjbqdiyptjqherdfbqk'; publicTables=93; authUsers=0; authIdentities=0; migrationRows=2; migrationIdentities=@('one','two'); migrationIdentitiesSha256=('D' * 64); schemaSha256=('E' * 64) }
Assert-TargetBaselineUnchanged -Expected $expected -Actual $expected
foreach ($field in @('authIdentities','migrationIdentities','migrationIdentitiesSha256','schemaSha256')) {
  $changed = ($expected | ConvertTo-Json -Depth 10 | ConvertFrom-Json)
  switch ($field) {
    'authIdentities' { $changed.authIdentities = 1 }
    'migrationIdentities' { $changed.migrationIdentities = @('two','one') }
    'migrationIdentitiesSha256' { $changed.migrationIdentitiesSha256 = ('F' * 64) }
    'schemaSha256' { $changed.schemaSha256 = ('0' * 64) }
  }
  $rejected = $false
  try { Assert-TargetBaselineUnchanged -Expected $expected -Actual $changed } catch { $rejected = $true }
  if (-not $rejected) { throw "Target baseline drift was accepted: $field" }
}
'baseline guard passed'
`),
    ).toContain("baseline guard passed");
  });

  it("rejects nullability drift and every undocumented default drift", () => {
    expect(
      runGuardProbe(String.raw`
Import-RunnerFunction Compare-ColumnMetadata
Import-RunnerFunction Classify-NullabilityDifferences
$AppointmentColumnMap = [ordered]@{ 'patient_name'='name'; 'patient_phone'='phone'; 'appointment_date'='preferred_date'; 'appointment_time'='preferred_time' }
function New-Column([string]$table,[string]$name,[string]$nullable,[AllowNull()][string]$default) {
  [pscustomobject]@{ schema_name='public'; table_name=$table; column_name=$name; data_type='text'; udt_schema='pg_catalog'; udt_name='text'; is_nullable=$nullable; column_default=$default; is_identity='NO'; is_generated='NEVER' }
}
$source = @((New-Column appointments status NO "'pending_payment'::text"),(New-Column patients name YES $null),(New-Column patients phone YES $null))
$target = @((New-Column appointments status NO "'pending'::text"),(New-Column patients name NO $null),(New-Column patients phone YES "''::text"))
$diff = Compare-ColumnMetadata -Source $source -Target $target
if (@($diff.nullabilityDifferences) -notcontains 'public.patients.name') { throw 'Nullability drift was not detected.' }
if (@($diff.blockingDefaultDifferences) -notcontains 'public.patients.phone') { throw 'Undocumented default drift was not blocked.' }
if (@($diff.allowedDefaultDifferences) -notcontains 'public.appointments.status') { throw 'Documented status default drift was not explicitly allowed.' }
$safe = Classify-NullabilityDifferences -Details $diff.nullabilityDifferenceDetails -SourceNullCounts @{ 'public.patients.name'=0 }
if (@($safe.allowed) -notcontains 'public.patients.name' -or @($safe.blocking).Count -ne 0) { throw 'Zero-null source data was not accepted for the stricter target.' }
$unsafe = Classify-NullabilityDifferences -Details $diff.nullabilityDifferenceDetails -SourceNullCounts @{ 'public.patients.name'=1 }
if (@($unsafe.blocking) -notcontains 'public.patients.name') { throw 'Populated source nulls were not blocked.' }
'column drift guards passed'
`),
    ).toContain("column drift guards passed");
  });

  it("generates an all-FK audit that rejects sender and receiver orphans", () => {
    expect(
      runGuardProbe(String.raw`
Import-RunnerFunction Get-ForeignKeyAuditSql
$postgresBin = 'C:\Users\ahmed\Documents\Codex\tools\postgresql\17.10\pgsql\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('cutover-fk-audit-' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'data'
$log = Join-Path $root 'postgres.log'
$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
$listener.Start(); $port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port; $listener.Stop()
New-Item -ItemType Directory -Path $root | Out-Null
function Write-Sql([string]$name,[string]$content) {
  $path = Join-Path $root $name
  [IO.File]::WriteAllText($path,$content,(New-Object Text.UTF8Encoding($false)))
  return $path
}
function Invoke-Psql([string]$path) {
  $prior = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $captured = @(& (Join-Path $postgresBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $port --username postgres --dbname audit --file $path 2>&1)
    return $LASTEXITCODE
  } finally { $ErrorActionPreference = $prior }
}
function Invoke-PgCtl([string[]]$arguments) {
  $quoted = @($arguments | ForEach-Object { if ($_ -match '[\s"]') { '"' + $_.Replace('"','\"') + '"' } else { $_ } }) -join ' '
  $process = Start-Process -FilePath (Join-Path $postgresBin 'pg_ctl.exe') -ArgumentList $quoted -PassThru -WindowStyle Hidden
  if (-not $process.WaitForExit(30000)) { $process.Kill(); throw 'pg_ctl timed out.' }
  return $process.ExitCode
}
try {
  & (Join-Path $postgresBin 'initdb.exe') --pgdata $data --username postgres --auth trust --encoding UTF8 --no-locale --no-sync *> $null
  if ($LASTEXITCODE -ne 0) { throw 'initdb failed.' }
  if ((Invoke-PgCtl @('--pgdata',$data,'--log',$log,'--options',"-h 127.0.0.1 -p $port",'--wait','start')) -ne 0) { throw 'PostgreSQL start failed.' }
  & (Join-Path $postgresBin 'createdb.exe') --host 127.0.0.1 --port $port --username postgres audit *> $null
  if ($LASTEXITCODE -ne 0) { throw 'createdb failed.' }
  $schema = Write-Sql 'schema.sql' @'
create schema auth;
create table auth.users (id uuid primary key);
create table public.staff_messages (
  id uuid primary key,
  sender_id uuid not null references auth.users(id),
  receiver_id uuid references auth.users(id)
);
'@
  if ((Invoke-Psql $schema) -ne 0) { throw 'FK fixture schema failed.' }
  $audit = Get-ForeignKeyAuditSql
  $senderText = @"
begin;
set local session_replication_role=replica;
insert into public.staff_messages values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',null);
set local session_replication_role=origin;
$audit
commit;
"@
  $senderOrphan = Write-Sql 'sender-orphan.sql' $senderText
  if ((Invoke-Psql $senderOrphan) -eq 0) { throw 'Sender orphan passed the audit.' }
  $receiverText = @"
insert into auth.users values ('00000000-0000-0000-0000-000000000002');
begin;
set local session_replication_role=replica;
insert into public.staff_messages values ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004');
set local session_replication_role=origin;
$audit
commit;
"@
  $receiverOrphan = Write-Sql 'receiver-orphan.sql' $receiverText
  if ((Invoke-Psql $receiverOrphan) -eq 0) { throw 'Receiver orphan passed the audit.' }
  $cleanText = @"
begin;
set local session_replication_role=replica;
insert into public.staff_messages values ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002',null);
set local session_replication_role=origin;
$audit
commit;
"@
  $clean = Write-Sql 'clean.sql' $cleanText
  if ((Invoke-Psql $clean) -ne 0) { throw 'Valid references failed the audit.' }
  'foreign key audit passed'
} finally {
  if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) { [void](Invoke-PgCtl @('--pgdata',$data,'--mode=fast','--wait','stop')) }
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
`),
    ).toContain("foreign key audit passed");
  }, 30_000);
});
