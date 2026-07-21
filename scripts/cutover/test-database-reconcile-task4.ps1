$ErrorActionPreference = 'Stop'

$runnerPath = Join-Path $PSScriptRoot 'database-reconcile.ps1'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Get-Content -LiteralPath $runnerPath -Raw
$lowerRunner = $runner.ToLowerInvariant()
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($runnerPath,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count -ne 0){throw 'Runner does not parse.'}

function Import-RunnerFunction {
  param([Parameter(Mandatory)][string]$Name)
  $definition=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name},$true)
  if(-not $definition){throw "Runner function is missing: $Name"}
  $globalDefinition=$definition.Extent.Text -replace ('^function\s+'+[regex]::Escape($Name)),('function global:'+$Name)
  Invoke-Expression $globalDefinition
}

function Assert-EqualJson {
  param([Parameter(Mandatory)]$Expected,[Parameter(Mandatory)]$Actual,[Parameter(Mandatory)][string]$Label)
  if(($Expected|ConvertTo-Json -Depth 50 -Compress) -cne ($Actual|ConvertTo-Json -Depth 50 -Compress)){throw $Label}
}

function Assert-Rejected {
  param([Parameter(Mandatory)][scriptblock]$Action,[Parameter(Mandatory)][string]$Label)
  $rejected=$false
  try{& $Action}catch{$rejected=$true}
  if(-not $rejected){throw $Label}
}

$expectedMigrations=@(
  [ordered]@{version='20260720111916';file='20260720111916_add_website_editor_role.sql';sha256='87F0EEA795BC99CE1CBA8BB799B6E25D7C3A313A54E309425FC47165B5125618'},
  [ordered]@{version='20260720115031';file='20260720115031_create_website_cms_foundation.sql';sha256='A86DA7A8824CCF5BEF9033D9DC525C37D50AE6281AF0C060ED031995459E5D30'},
  [ordered]@{version='20260720225347';file='20260720225347_harden_website_cms_integration.sql';sha256='E4987CFCBD91251FE6EE10881D7F67858265C735DD7FDFCE31E49FBF63ECB8EC'},
  [ordered]@{version='20260721035032';file='20260721035032_add_website_page_publishing.sql';sha256='88BE2091198AECA44A556DF3A0C76C6AB6018FBA8149A0EE13F79C4AC92D4C39'},
  [ordered]@{version='20260721100403';file='20260721100403_switch_tracking_to_google.sql';sha256='EB84C03BD376D0B9E5AE2A7E1A14B7E41F9AA04B54D663793DCC79EF987E37A1'},
  [ordered]@{version='20260721162256';file='20260721162256_restore_staff_messages.sql';sha256='4E0C335C855C1338EDAB28429B7377DAC7768D796666B3FF315FF1B4A55C9FB0'},
  [ordered]@{version='20260721170000';file='20260721170000_create_general_website_page_rpc.sql';sha256='4762C9B6791AB4C5E95FBFCC1F05F6BB703911D2D2DCE9DDDFD89456D2B922A4'},
  [ordered]@{version='20260721174422';file='20260721174422_preserve_source_cutover_fields.sql';sha256='ECEBAE8DFB0CED17B2C0A1332E627846844C439DB945A5C705C95B53E3611217'}
)

Import-RunnerFunction Get-StringSha256
Import-RunnerFunction Get-JsonSha256
Import-RunnerFunction Assert-NotReparsePoint
Import-RunnerFunction Get-Task4MigrationBindings
$global:RepositoryRoot=$repositoryRoot
$global:ExpectedRef='nhjbqdiyptjqherdfbqk'
$global:Task4MigrationSpecifications=$expectedMigrations
foreach($migration in $expectedMigrations){if(-not $runner.Contains($migration.version) -or -not $runner.Contains($migration.file) -or -not $runner.Contains($migration.sha256)){throw "Runner source is missing exact migration binding: $($migration.file)"}}
$bindings=@(Get-Task4MigrationBindings)
if($bindings.Count -ne 8){throw 'Runtime binding is not exactly eight migrations.'}
Assert-EqualJson -Expected @($expectedMigrations.file) -Actual @($bindings.file) -Label 'Runtime migration order is not exact.'
Assert-EqualJson -Expected @($expectedMigrations.sha256) -Actual @($bindings.sha256) -Label 'Runtime migration hashes are not exact.'

Import-RunnerFunction Get-Task4StandaloneSequenceSpecifications
$standaloneSequences=@(Get-Task4StandaloneSequenceSpecifications)
$expectedStandaloneSequences=@(
  [ordered]@{identity='public.client_invoice_seq';table='client_invoices';column='invoice_no';lastValue=2L;isCalled=$true;startValue=1L;incrementBy=1L},
  [ordered]@{identity='public.patient_reg_no_seq';table='patients';column='reg_no';lastValue=117L;isCalled=$true;startValue=1L;incrementBy=1L},
  [ordered]@{identity='public.queue_number_seq';table='queue_entries';column='queue_number';lastValue=1148L;isCalled=$true;startValue=1001L;incrementBy=1L}
)
Assert-EqualJson -Expected $expectedStandaloneSequences -Actual $standaloneSequences -Label 'Standalone source sequence identities/states are not exact.'

Import-RunnerFunction Invoke-Task4ScratchMigrations
$script:applied=@();$script:recorded=@()
function global:Invoke-LocalFile {param($Database,$Path,$Label)$script:applied+=Split-Path -Leaf $Path}
function global:Invoke-LocalQuery {param($Database,$Sql,$Label)if($Label -like 'record task4 migration*'){$script:recorded+=([regex]::Match($Sql,"'([0-9]{14})'").Groups[1].Value)};return ''}
Invoke-Task4ScratchMigrations -Database scratch -Migrations $bindings
Assert-EqualJson -Expected @($expectedMigrations.file) -Actual $script:applied -Label 'Scratch migrations were skipped, duplicated, reordered, or added.'
Assert-EqualJson -Expected @($expectedMigrations.version) -Actual $script:recorded -Label 'Scratch migration-history identities were not recorded exactly once and in order.'

Import-RunnerFunction Get-TocId
Import-RunnerFunction Assert-UniqueTocSelections
$pre=@('10; 0 0 TABLE public one postgres');$data=@('20; 0 0 TABLE DATA public one postgres');$post=@('30; 0 0 CONSTRAINT public one one_pkey postgres')
Assert-UniqueTocSelections -Selections @($pre,$data,$post)
Assert-Rejected -Label 'Duplicate TOC ID across selections was accepted.' -Action {Assert-UniqueTocSelections -Selections @($pre,$data,@('20; 0 0 TABLE DATA public one postgres'))}

Import-RunnerFunction Get-PortableTask4MigrationBindings
Import-RunnerFunction New-PostMigrationExpectedInventory
$preBaseline=[ordered]@{projectRef='nhjbqdiyptjqherdfbqk';publicTables=93;authUsers=0;authIdentities=0;migrationRows=2;migrationIdentities=@('20200101000000','20210101000000');migrationIdentitiesSha256=Get-StringSha256 -Value "20200101000000`n20210101000000";schemaSha256=('A'*64)}
$syntheticMigrations=@([ordered]@{version='20220101000000';file='20220101000000_a.sql';sha256=('B'*64)},[ordered]@{version='20230101000000';file='20230101000000_b.sql';sha256=('C'*64)})
$expectedPost=New-PostMigrationExpectedInventory -PreBaseline $preBaseline -Migrations $syntheticMigrations -PublicTables 94 -SchemaSha256 ('D'*64) -ExtendedSchemaSha256 ('E'*64)
Assert-EqualJson -Expected @('20200101000000','20210101000000','20220101000000','20230101000000') -Actual @($expectedPost.migrationIdentities) -Label 'Post identities are not exact and ordered.'
if($expectedPost.migrationRows -ne 4 -or $expectedPost.authUsers -ne 0 -or $expectedPost.authIdentities -ne 0){throw 'Post inventory counts are wrong.'}
Assert-Rejected -Label 'A pre-existing migration version was accepted.' -Action {[void](New-PostMigrationExpectedInventory -PreBaseline $preBaseline -Migrations @([ordered]@{version='20210101000000';file='20210101000000_a.sql';sha256=('F'*64)}) -PublicTables 94 -SchemaSha256 ('D'*64) -ExtendedSchemaSha256 ('E'*64))}

Import-RunnerFunction Assert-PostMigrationTransitionManifest
$backup=[ordered]@{manifest=[ordered]@{targetBaseline=$preBaseline;targetBaselineSha256=('1'*64)}}
$report=[ordered]@{currentBindingSha256=('2'*64)}
$authorization=[ordered]@{sha256=('3'*64);expectedPersistentPost=$expectedPost}
$payload=[ordered]@{formatVersion=1;status='completed';targetRef='nhjbqdiyptjqherdfbqk';preBaselineSha256=('1'*64);migrations=$syntheticMigrations;expectedPostMigration=$expectedPost;rehearsalBindingSha256=('2'*64);authorizationSha256=('3'*64)}
$manifest=[ordered]@{payload=$payload;payloadSha256=Get-JsonSha256 -Value $payload}
[void](Assert-PostMigrationTransitionManifest -Manifest $manifest -VerifiedBackup $backup -RehearsalReport $report -Migrations $syntheticMigrations -Authorization $authorization)
foreach($field in @('status','targetRef','preBaselineSha256','migrations','expectedPostMigration','rehearsalBindingSha256','authorizationSha256')){
  $changed=$manifest|ConvertTo-Json -Depth 50|ConvertFrom-Json
  switch($field){
    'status'{$changed.payload.status='started'}
    'targetRef'{$changed.payload.targetRef='wrong'}
    'preBaselineSha256'{$changed.payload.preBaselineSha256=('4'*64)}
    'migrations'{$changed.payload.migrations[0].sha256=('5'*64)}
    'expectedPostMigration'{$changed.payload.expectedPostMigration.schemaSha256=('6'*64)}
    'rehearsalBindingSha256'{$changed.payload.rehearsalBindingSha256=('7'*64)}
    'authorizationSha256'{$changed.payload.authorizationSha256=('8'*64)}
  }
  $changed.payloadSha256=Get-JsonSha256 -Value $changed.payload
  Assert-Rejected -Label "Self-consistent transition tamper was accepted: $field" -Action {[void](Assert-PostMigrationTransitionManifest -Manifest $changed -VerifiedBackup $backup -RehearsalReport $report -Migrations $syntheticMigrations -Authorization $authorization)}
}

Import-RunnerFunction Assert-PostMigrationTargetState
[void](Assert-PostMigrationTargetState -Expected $expectedPost -Actual $expectedPost)
foreach($mutation in @('pre','low','high','wrongIdentity','reorderedIdentity','schema','extended','authUsers','authIdentities')){
  $changed=$expectedPost|ConvertTo-Json -Depth 50|ConvertFrom-Json
  switch($mutation){
    'pre'{$changed.migrationRows=2;$changed.migrationIdentities=@('20200101000000','20210101000000');$changed.migrationIdentitiesSha256=Get-StringSha256 -Value "20200101000000`n20210101000000"}
    'low'{$changed.migrationRows=3}
    'high'{$changed.migrationRows=5}
    'wrongIdentity'{$changed.migrationIdentities[3]='20990101000000';$changed.migrationIdentitiesSha256=Get-StringSha256 -Value ($changed.migrationIdentities -join "`n")}
    'reorderedIdentity'{$changed.migrationIdentities=@('20200101000000','20210101000000','20230101000000','20220101000000');$changed.migrationIdentitiesSha256=Get-StringSha256 -Value ($changed.migrationIdentities -join "`n")}
    'schema'{$changed.schemaSha256=('9'*64)}
    'extended'{$changed.extendedSchemaSha256=('A'*64)}
    'authUsers'{$changed.authUsers=1}
    'authIdentities'{$changed.authIdentities=1}
  }
  Assert-Rejected -Label "Post-state mutation was accepted: $mutation" -Action {[void](Assert-PostMigrationTargetState -Expected $expectedPost -Actual $changed)}
}

Import-RunnerFunction Assert-RehearsalArtifactBinding
$global:Task4ValidatedBaseHead='3aa624512437203d6ef5688ede4799ac5eb022d4'
$global:LegacyCompositeRehearsalRunnerSha256='2E18A5193C223B4E2D095624FD41184E711B47399E213C5CDC0C31074C03FF26'
$global:LegacyCompositeRehearsalReportSha256='9AE7693B8B06E1CECDD6AABEA91A4D399E204184175028C3BF6EBBFCE59297CC'
$global:LegacyCompositeRehearsalMigrations=@(
  [ordered]@{name='20260721174422_preserve_source_cutover_fields.sql';sha256='ECEBAE8DFB0CED17B2C0A1332E627846844C439DB945A5C705C95B53E3611217'},
  [ordered]@{name='20260721162256_restore_staff_messages.sql';sha256='4E0C335C855C1338EDAB28429B7377DAC7768D796666B3FF315FF1B4A55C9FB0'}
)
$immutable=[ordered]@{loaderSha256=('1'*64);heldStaffLoaderSha256=('2'*64);portableAuthLoaderSha256=('3'*64);approvedArchiveSha256=('4'*64);backupSha256=('5'*64);backupManifestSha256=('6'*64);targetBaselineSha256=('7'*64)}
$current=[ordered]@{runnerSha256=('8'*64);loaderSha256=$immutable.loaderSha256;heldStaffLoaderSha256=$immutable.heldStaffLoaderSha256;portableAuthLoaderSha256=$immutable.portableAuthLoaderSha256;approvedArchiveSha256=$immutable.approvedArchiveSha256;backupSha256=$immutable.backupSha256;backupManifestSha256=$immutable.backupManifestSha256;targetBaselineSha256=$immutable.targetBaselineSha256;migrations=$expectedMigrations;task4ValidationEvidenceSha256=('9'*64);task4DryRunEvidenceSha256=('A'*64)}
$recorded=[ordered]@{runnerSha256=$global:LegacyCompositeRehearsalRunnerSha256;loaderSha256=$immutable.loaderSha256;heldStaffLoaderSha256=$immutable.heldStaffLoaderSha256;portableAuthLoaderSha256=$immutable.portableAuthLoaderSha256;approvedArchiveSha256=$immutable.approvedArchiveSha256;backupSha256=$immutable.backupSha256;backupManifestSha256=$immutable.backupManifestSha256;targetBaselineSha256=$immutable.targetBaselineSha256;migrations=$global:LegacyCompositeRehearsalMigrations}
$compositeAuthorization=[ordered]@{repositoryHead=$global:Task4ValidatedBaseHead;validatedRunnerSha256=$global:LegacyCompositeRehearsalRunnerSha256;sha256=('9'*64);dryRunSha256=('A'*64);migrations=$expectedMigrations}
Assert-RehearsalArtifactBinding -Current $current -Recorded $recorded -Task4Authorization $compositeAuthorization -RecordedReportSha256 $global:LegacyCompositeRehearsalReportSha256
foreach($mutation in @('selfConsistentRunner','head','historicalMigrations','validationEvidence','dryRunEvidence','currentMigrations','reportDigest')){
  $changedCurrent=$current|ConvertTo-Json -Depth 50|ConvertFrom-Json
  $changedRecorded=$recorded|ConvertTo-Json -Depth 50|ConvertFrom-Json
  $changedAuthorization=$compositeAuthorization|ConvertTo-Json -Depth 50|ConvertFrom-Json
  switch($mutation){
    'selfConsistentRunner'{$changedRecorded.runnerSha256=('B'*64);$changedAuthorization.validatedRunnerSha256=('B'*64)}
    'head'{$changedAuthorization.repositoryHead=('C'*40)}
    'historicalMigrations'{$changedRecorded.migrations[0].sha256=('D'*64)}
    'validationEvidence'{$changedCurrent.task4ValidationEvidenceSha256=('E'*64)}
    'dryRunEvidence'{$changedCurrent.task4DryRunEvidenceSha256=('F'*64)}
    'currentMigrations'{$changedCurrent.migrations[0].sha256=('0'*64)}
  }
  $reportDigest=if($mutation -eq 'reportDigest'){('1'*64)}else{$global:LegacyCompositeRehearsalReportSha256}
  Assert-Rejected -Label "Composite legacy rehearsal tamper was accepted: $mutation" -Action {Assert-RehearsalArtifactBinding -Current $changedCurrent -Recorded $changedRecorded -Task4Authorization $changedAuthorization -RecordedReportSha256 $reportDigest}
}

Import-RunnerFunction Get-Task4AuthUsersColumnContract
Import-RunnerFunction Get-Task4AuthIdentitiesColumnContract
Import-RunnerFunction Get-Task4AuthAggregateBaseline
Import-RunnerFunction Get-PortableAuthExportSql
Import-RunnerFunction Get-Task4AuthAggregateSql
Import-RunnerFunction Get-TargetPostImportMetrics
Import-RunnerFunction Get-Task4SqlCsv
Import-RunnerFunction Get-Task4SqlStatements
Import-RunnerFunction Add-PortableAuthBodyToPgDump
Import-RunnerFunction Assert-PortableAuthBoundary
Import-RunnerFunction Assert-Task4AuthAggregate

$expectedAuthUserColumns=@(
  'instance_id','id','aud','role','email','encrypted_password','email_confirmed_at','last_sign_in_at','raw_app_meta_data','raw_user_meta_data','is_super_admin','created_at','updated_at','phone','phone_confirmed_at','banned_until','is_sso_user','deleted_at','is_anonymous',
  'confirmation_token','recovery_token','email_change_token_new','email_change_token_current','phone_change_token','reauthentication_token','email_change','phone_change',
  'invited_at','confirmation_sent_at','recovery_sent_at','email_change_sent_at','phone_change_sent_at','reauthentication_sent_at','email_change_confirm_status'
)
$expectedAuthIdentityColumns=@('provider_id','user_id','identity_data','provider','last_sign_in_at','created_at','updated_at','id')
$usersContract=Get-Task4AuthUsersColumnContract
$identitiesContract=Get-Task4AuthIdentitiesColumnContract
Assert-EqualJson -Expected $expectedAuthUserColumns -Actual @($usersContract.columns) -Label 'Auth users destination contract is not the exact ordered 34-column contract.'
Assert-EqualJson -Expected @('instance_id','id','aud','role','email','encrypted_password','email_confirmed_at','last_sign_in_at','raw_app_meta_data','raw_user_meta_data','is_super_admin','created_at','updated_at','phone','phone_confirmed_at','banned_until','is_sso_user','deleted_at','is_anonymous') -Actual @($usersContract.preserved) -Label 'Auth users preserved-field contract changed.'
Assert-EqualJson -Expected @('confirmation_token','recovery_token','email_change_token_new','email_change_token_current','phone_change_token','reauthentication_token','email_change','phone_change') -Actual @($usersContract.emptyString) -Label 'Auth users empty-string neutralization contract changed.'
Assert-EqualJson -Expected @('invited_at','confirmation_sent_at','recovery_sent_at','email_change_sent_at','phone_change_sent_at','reauthentication_sent_at') -Actual @($usersContract.nullValue) -Label 'Auth users NULL neutralization contract changed.'
Assert-EqualJson -Expected @('email_change_confirm_status') -Actual @($usersContract.zeroValue) -Label 'Auth users zero neutralization contract changed.'
Assert-EqualJson -Expected $expectedAuthIdentityColumns -Actual @($identitiesContract.columns) -Label 'Auth identities destination contract is not the exact ordered eight-column contract.'

$authExportSql=Get-PortableAuthExportSql
foreach($marker in @('insert into auth.users','insert into auth.identities','confirmation_token','email_change_confirm_status','order by import_order, sort_id')){if(-not $authExportSql.Contains($marker)){throw "Portable Auth export SQL is missing marker: $marker"}}
foreach($forbiddenSourceField in @('confirmed_at','auth.identities.email')){if($authExportSql -match ('(?i)\b'+[regex]::Escape($forbiddenSourceField)+'\b')){throw "Portable Auth export SQL reads generated field: $forbiddenSourceField"}}
$authAggregateSql=Get-Task4AuthAggregateSql
foreach($marker in @('quote_nullable(instance_id::text)','quote_nullable(provider_id::text)','forbiddenState','extensions.digest','email_change_confirm_status is distinct from 0','--ROW--')){if(-not $authAggregateSql.Contains($marker)){throw "Portable Auth aggregate SQL is missing marker: $marker"}}
$emailConfirmedIndex=$authAggregateSql.IndexOf('to_char(email_confirmed_at at time zone ''UTC''',[StringComparison]::Ordinal)
$invitedIndex=$authAggregateSql.IndexOf('to_char(invited_at at time zone ''UTC''',[StringComparison]::Ordinal)
$lastSignInIndex=$authAggregateSql.IndexOf('to_char(last_sign_in_at at time zone ''UTC''',[StringComparison]::Ordinal)
if($emailConfirmedIndex -lt 0 -or $invitedIndex -le $emailConfirmedIndex -or $lastSignInIndex -le $invitedIndex){throw 'Portable Auth aggregate canonical field order changed.'}
foreach($tokenColumn in @('confirmation_token','recovery_token','email_change_token_new','email_change_token_current','phone_change_token','reauthentication_token','email_change','phone_change')){if(-not $authAggregateSql.Contains("$tokenColumn is distinct from ''")){throw "Portable Auth aggregate SQL allows NULL bypass for $tokenColumn"}}
$authTimestamptzOccurrences=[ordered]@{email_confirmed_at=1;invited_at=1;last_sign_in_at=2;created_at=2;updated_at=2;phone_confirmed_at=1;banned_until=1;deleted_at=1}
foreach($entry in $authTimestamptzOccurrences.GetEnumerator()){
  $utcExpression="quote_nullable(to_char($($entry.Key) at time zone 'UTC','YYYY-MM-DD`"T`"HH24:MI:SS.US`"Z`"'))"
  if([regex]::Matches($authAggregateSql,[regex]::Escape($utcExpression)).Count -ne $entry.Value){throw "Portable Auth aggregate lacks exact UTC canonicalization for $($entry.Key)."}
  if($authAggregateSql.Contains("quote_nullable($($entry.Key)::text)")){throw "Portable Auth aggregate still uses session-dependent text serialization for $($entry.Key)."}
}
$savedTargetQuery=(Get-Command Invoke-TargetQuery -ErrorAction SilentlyContinue)
function global:Invoke-TargetQuery {param([string]$Sql,[string]$Label)if($Label -eq 'post-import portable Auth aggregate metrics'){return '{"users":11,"identities":11,"forbiddenState":0,"invitedAtNonNull":0,"allowedUsersSha256":"A","identitiesSha256":"B","userIdSetSha256":"C","identityIdUserIdSetSha256":"D"}'};if($Label -eq 'post-import Auth and profile integrity metrics'){return '{"sessions":0,"refreshTokens":0,"profilesMapped":11,"authWithoutProfile":0,"identitiesWithoutUser":0}'};throw "Unexpected target query label: $Label"}
try{
  $postImportMetrics=Get-TargetPostImportMetrics
  if($postImportMetrics.authUsers -ne 11 -or $postImportMetrics.authIdentities -ne 11){throw 'Post-import metrics no longer expose Auth count aliases.'}
}finally{
  Remove-Item function:\Invoke-TargetQuery -Force
  if($savedTargetQuery){Set-Item -Path function:\Invoke-TargetQuery -Value $savedTargetQuery.ScriptBlock}
}

$authFixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('task4-auth-contract-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $authFixtureRoot|Out-Null
try{
  $authLoader=Join-Path $authFixtureRoot 'portable-auth.sql'
  $userValues=@(
    "'00000000-0000-0000-0000-000000000001'","'00000000-0000-0000-0000-000000000011'","'authenticated'","'authenticated'","'fixture@example.invalid'","'fixture-password-hash'","'2026-07-01T00:00:00Z'","'2026-07-02T00:00:00Z'",'''{"provider":"email"}''','''{"display_name":"fixture"}''','false',"'2026-06-01T00:00:00Z'","'2026-07-03T00:00:00Z'","'+60000000000'","'2026-07-01T00:00:00Z'","'2027-01-01T00:00:00Z'",'false',"'2028-01-01T00:00:00Z'",'false',
    "'confirm-token'","'recovery-token'","'email-new-token'","'email-current-token'","'phone-token'","'reauth-token'","'new@example.invalid'","'+61111111111'",
    "'2026-07-04T00:00:00Z'","'2026-07-05T00:00:00Z'","'2026-07-06T00:00:00Z'","'2026-07-07T00:00:00Z'","'2026-07-08T00:00:00Z'","'2026-07-09T00:00:00Z'",'3'
  )
  if($userValues.Count -ne 34){throw 'Auth users fixture does not contain exactly 34 values.'}
  $identityValues=@("'email:fixture@example.invalid'","'00000000-0000-0000-0000-000000000011'",'''{"sub":"fixture"}''',"'email'","'2026-07-02T00:00:00Z'","'2026-06-01T00:00:00Z'","'2026-07-03T00:00:00Z'","'00000000-0000-0000-0000-000000000021'")
  $unsafeAuthLoader=@"
begin;
set local statement_timeout = 0;
set local lock_timeout = '30s';
set local session_replication_role = replica;
insert into auth.users ($($expectedAuthUserColumns -join ', ')) values ($($userValues -join ', '));
insert into auth.identities ($($expectedAuthIdentityColumns -join ', ')) values ($($identityValues -join ', '));
set local session_replication_role = origin;
do `$foreign_key_audit`$ begin null; end `$foreign_key_audit`$;
commit;
"@
  [IO.File]::WriteAllText($authLoader,$unsafeAuthLoader,(New-Object Text.UTF8Encoding($false)))
  Assert-Rejected -Label 'Portable Auth boundary accepted non-neutral one-time-token or pending-workflow state.' -Action {Assert-PortableAuthBoundary -LoaderPath $authLoader}

  $safeAuthLoader=$unsafeAuthLoader
  foreach($value in @("'confirm-token'","'recovery-token'","'email-new-token'","'email-current-token'","'phone-token'","'reauth-token'","'new@example.invalid'","'+61111111111'")){$safeAuthLoader=$safeAuthLoader.Replace($value,"''")}
  foreach($value in @("'2026-07-04T00:00:00Z'","'2026-07-05T00:00:00Z'","'2026-07-06T00:00:00Z'","'2026-07-07T00:00:00Z'","'2026-07-08T00:00:00Z'","'2026-07-09T00:00:00Z'")){$safeAuthLoader=$safeAuthLoader.Replace($value,'NULL')}
  $safeAuthLoader=$safeAuthLoader.Replace(', 3);',', 0);')
  [IO.File]::WriteAllText($authLoader,$safeAuthLoader,(New-Object Text.UTF8Encoding($false)))
  Assert-PortableAuthBoundary -LoaderPath $authLoader
  $portableAuthSql=([regex]::Matches($safeAuthLoader,'(?im)^insert\s+into\s+auth\.(?:users|identities)\b.*;\s*$')|ForEach-Object{$_.Value}) -join "`n"
  if([regex]::Matches($portableAuthSql,'(?im)^insert\s+into\s+auth\.(?:users|identities)').Count -ne 2){throw 'Portable Auth trailer fixture lacks both Auth INSERTs.'}
  $pgDumpBody=@"
\restrict fixture_dump_token

insert into public.example (id) values (1);

--
-- PostgreSQL database dump complete
--

\unrestrict fixture_dump_token
"@
  $combinedBody=Add-PortableAuthBodyToPgDump -PgDumpSql $pgDumpBody -PortableAuthSql $portableAuthSql
  $trailerIndex=$combinedBody.IndexOf('-- PostgreSQL database dump complete',[StringComparison]::Ordinal)
  $combinedUserIndex=$combinedBody.IndexOf('insert into auth.users',[StringComparison]::OrdinalIgnoreCase)
  $combinedIdentityIndex=$combinedBody.IndexOf('insert into auth.identities',[StringComparison]::OrdinalIgnoreCase)
  if($trailerIndex -lt 0 -or $combinedUserIndex -lt 0 -or $combinedIdentityIndex -lt 0 -or $combinedUserIndex -ge $trailerIndex -or $combinedIdentityIndex -ge $trailerIndex){throw 'Portable Auth SQL was not inserted before the exact pg_dump trailer.'}
  $combinedLoader=@"
begin;
set local statement_timeout = 0;
set local lock_timeout = '30s';
set local session_replication_role = replica;
$combinedBody
set local session_replication_role = origin;
do `$foreign_key_audit`$ begin null; end `$foreign_key_audit`$;
commit;
"@
  [IO.File]::WriteAllText($authLoader,$combinedLoader,(New-Object Text.UTF8Encoding($false)))
  Assert-PortableAuthBoundary -LoaderPath $authLoader
  $fixtureJsonLiteral='''{"provider":"email"}'''
  $escapedSqlLiteral='E''provider; escaped \'' quote'''
  $escapedLiteralLoader=$safeAuthLoader.Replace($fixtureJsonLiteral,$escapedSqlLiteral)
  [IO.File]::WriteAllText($authLoader,$escapedLiteralLoader,(New-Object Text.UTF8Encoding($false)))
  Assert-PortableAuthBoundary -LoaderPath $authLoader
  $unvalidatedAuthInsert=$safeAuthLoader.Replace('insert into auth.identities (','insert into auth.users values (''unsafe'');' + "`n" + 'insert into auth.identities (')
  [IO.File]::WriteAllText($authLoader,$unvalidatedAuthInsert,(New-Object Text.UTF8Encoding($false)))
  Assert-Rejected -Label 'Portable Auth boundary skipped an unvalidated Auth INSERT.' -Action {Assert-PortableAuthBoundary -LoaderPath $authLoader}
  foreach($mutation in @('missing','extra','reordered','confirmedAt','identityEmail')){
    $changed=$safeAuthLoader
    switch($mutation){
      'missing'{$changed=$changed.Replace('confirmation_token, ','')}
      'extra'{$changed=$changed.Replace('email_change_confirm_status)', 'email_change_confirm_status, unexpected_column)')}
      'reordered'{$changed=$changed.Replace('instance_id, id, aud', 'id, instance_id, aud')}
      'confirmedAt'{$changed=$changed.Replace('email_change_confirm_status)', 'email_change_confirm_status, confirmed_at)')}
      'identityEmail'{$changed=$changed.Replace('updated_at, id) values', 'updated_at, id, email) values')}
    }
    [IO.File]::WriteAllText($authLoader,$changed,(New-Object Text.UTF8Encoding($false)))
    Assert-Rejected -Label "Portable Auth boundary accepted invalid destination contract: $mutation" -Action {Assert-PortableAuthBoundary -LoaderPath $authLoader}
  }

  $baseline=Get-Task4AuthAggregateBaseline
  Assert-EqualJson -Expected ([ordered]@{users=11;identities=11;allowedUsersSha256='C8FE0983897241106A2D48EBECBF6668D3090D37C5503127F1A2E10F4596F1A2';identitiesSha256='131A0B1D86D14333F4F9BA21C55E89C97DC0531CA516744E0AD7597F9804AFA4';userIdSetSha256='9CC534CF8C91698637DD1B346A4B9EC4E15D3F8D54E9D546AD4944081A6D9113';identityIdUserIdSetSha256='E6899536EDEA0C7BDC092D349DDC556FF909CCC61C41CA419F680833C60ACEE7'}) -Actual $baseline -Label 'Portable Auth opaque aggregate baseline changed.'
  $targetAggregate=[ordered]@{users=11;identities=11;forbiddenState=0;invitedAtNonNull=0;allowedUsersSha256=$baseline.allowedUsersSha256;identitiesSha256=$baseline.identitiesSha256;userIdSetSha256=$baseline.userIdSetSha256;identityIdUserIdSetSha256=$baseline.identityIdUserIdSetSha256}
  [void](Assert-Task4AuthAggregate -Actual $targetAggregate -Baseline $baseline -RequireNeutralized)
  foreach($mutation in @('users','identities','forbiddenState','invitedAtNonNull','allowedUsersSha256','identitiesSha256','userIdSetSha256','identityIdUserIdSetSha256')){
    $changed=$targetAggregate|ConvertTo-Json -Depth 20|ConvertFrom-Json
    if($mutation -in @('forbiddenState','invitedAtNonNull')){$changed.$mutation=1}elseif($mutation -in @('users','identities')){$changed.$mutation=10}else{$changed.$mutation=('0'*64)}
    Assert-Rejected -Label "Portable Auth aggregate comparison accepted mutation: $mutation" -Action {Assert-Task4AuthAggregate -Actual $changed -Baseline $baseline -RequireNeutralized}
  }
  foreach($missingProperty in @('users','identities','forbiddenState','invitedAtNonNull','allowedUsersSha256','identitiesSha256','userIdSetSha256','identityIdUserIdSetSha256')){
    $changed=$targetAggregate|ConvertTo-Json -Depth 20|ConvertFrom-Json
    $changed.PSObject.Properties.Remove($missingProperty)
    Assert-Rejected -Label "Portable Auth aggregate accepted missing property: $missingProperty" -Action {Assert-Task4AuthAggregate -Actual $changed -Baseline $baseline -RequireNeutralized}
  }
}finally{if(Test-Path $authFixtureRoot){Remove-Item $authFixtureRoot -Recurse -Force}}

Import-RunnerFunction Get-NormalizedPath
Import-RunnerFunction Write-Utf8NoBom
Import-RunnerFunction Assert-PortableAuthBoundary
Import-RunnerFunction New-InTransactionAuthZeroLoader
Import-RunnerFunction Assert-InTransactionAuthZeroGuard
$guardRoot=Join-Path ([IO.Path]::GetTempPath()) ('task4-auth-guard-'+[Guid]::NewGuid().ToString('N'))
$global:ArtifactRoot=$guardRoot
New-Item -ItemType Directory -Path $guardRoot|Out-Null
try{
  $sourceLoader=Join-Path $guardRoot 'source.sql';$guardedLoader=Join-Path $guardRoot 'guarded.sql'
  $fixtureTables=@('"public"."client_invoices"','"public"."patients"','"public"."queue_entries"')+@(1..90|ForEach-Object{'"public"."t'+$_.ToString('000')+'"'})
  $fixture=@"
begin;
set local statement_timeout = 0;
set local lock_timeout = '30s';
set local session_replication_role = replica;
truncate table auth.identities, auth.users, $($fixtureTables -join ', ') restart identity cascade;
set local session_replication_role = origin;
do `$foreign_key_audit`$ begin null; end `$foreign_key_audit`$;
commit;
"@
  [IO.File]::WriteAllText($sourceLoader,$fixture,(New-Object Text.UTF8Encoding($false)))
  New-InTransactionAuthZeroLoader -SourcePath $sourceLoader -DestinationPath $guardedLoader
  Assert-PortableAuthBoundary -LoaderPath $guardedLoader
  Assert-InTransactionAuthZeroGuard -LoaderPath $guardedLoader
  $guardedText=Get-Content $guardedLoader -Raw
  $expectedPublicLock='lock table '+(@($fixtureTables|Sort-Object) -join ', ')+' in access exclusive mode;'
  foreach($marker in @('lock table auth.users, auth.identities in access exclusive mode','$auth_zero_guard$',$expectedPublicLock,'set local session_replication_role = replica','delete from "public"."t001";','$owned_sequence_reconcile$','$sequence_reconcile$','pg_catalog.setval')){if(-not $guardedText.Contains($marker)){throw "Guarded loader missing marker: $marker"}}
  $lockIndex=$guardedText.IndexOf($expectedPublicLock,[StringComparison]::OrdinalIgnoreCase);$replicaIndex=$guardedText.IndexOf('set local session_replication_role = replica',[StringComparison]::OrdinalIgnoreCase);$deleteIndex=$guardedText.IndexOf('delete from "public"."t001";',[StringComparison]::OrdinalIgnoreCase)
  if($lockIndex -lt 0 -or $replicaIndex -le $lockIndex -or $deleteIndex -le $replicaIndex){throw 'Exact93 public lock is not before replica mode and the first delete.'}
  if($guardedText -match '(?i)truncate\s+(?:table\s+)?auth\.' -or $guardedText.Contains('restart identity cascade')){throw 'Guarded loader still truncates managed Auth or uses CASCADE.'}
}finally{if(Test-Path $guardRoot){Remove-Item $guardRoot -Recurse -Force}}

Import-RunnerFunction Assert-Task4SequenceChecks
Import-RunnerFunction Assert-Task4PostImportResult
$global:Task4ApprovedServiceLists=[ordered]@{'pemeriksaan-kesihatan'=@('a','b','c','d');'prosedur-minor'=@('e','f','g','h');'rawatan-am'=@('i','j','k','l','m')}
$postExpected=[ordered]@{projectRef='nhjbqdiyptjqherdfbqk';publicTables=102;authUsers=0;authIdentities=0;migrationRows=161;migrationIdentities=@('one','two');migrationIdentitiesSha256=('2'*64);schemaSha256=('3'*64);extendedSchemaSha256=('4'*64)}
$postActual=$postExpected|ConvertTo-Json -Depth 20|ConvertFrom-Json;$postActual.authUsers=11;$postActual.authIdentities=11
$expectedCounts=[pscustomobject]@{profiles=11;staff_messages=24};$actualCounts=[pscustomobject]@{profiles=11;staff_messages=24;website_pages=1}
$metrics=[pscustomobject]@{authUsers=11;authIdentities=11;users=11;identities=11;sessions=0;refreshTokens=0;profilesMapped=11;authWithoutProfile=0;identitiesWithoutUser=0;forbiddenState=0;invitedAtNonNull=0;allowedUsersSha256=$baseline.allowedUsersSha256;identitiesSha256=$baseline.identitiesSha256;userIdSetSha256=$baseline.userIdSetSha256;identityIdUserIdSetSha256=$baseline.identityIdUserIdSetSha256}
$serviceLists=[pscustomobject]@{'pemeriksaan-kesihatan'=@('a','b','c','d');'prosedur-minor'=@('e','f','g','h');'rawatan-am'=@('i','j','k','l','m')}
$validSequenceChecks=@($expectedStandaloneSequences|ForEach-Object{[pscustomobject]@{sequence_identity=$_.identity;actual_last_value=$_.lastValue;actual_is_called=$_.isCalled;passed=$true}})
[void](Assert-Task4PostImportResult -ExpectedPost $postExpected -ActualInventory $postActual -ExpectedTableCounts $expectedCounts -ActualTableCounts $actualCounts -Metrics $metrics -AuthBaseline $baseline -SequenceChecks $validSequenceChecks -ServiceLists $serviceLists -ForeignKeyCount 111)
foreach($mutation in @('auth','count','service','migration','sequence','foreignKeys')){
  $a=$postActual|ConvertTo-Json -Depth 20|ConvertFrom-Json;$c=$actualCounts|ConvertTo-Json|ConvertFrom-Json;$m=$metrics|ConvertTo-Json|ConvertFrom-Json;$s=$serviceLists|ConvertTo-Json -Depth 20|ConvertFrom-Json;$q=@($validSequenceChecks|ForEach-Object{$_|ConvertTo-Json -Depth 20|ConvertFrom-Json});$fk=111
  switch($mutation){'auth'{$m.sessions=1};'count'{$c.profiles=10};'service'{$s.'rawatan-am'[4]='wrong'};'migration'{$a.migrationRows=160};'sequence'{$q[1].passed=$false};'foreignKeys'{$fk=0}}
  Assert-Rejected -Label "Post-import mutation was accepted: $mutation" -Action {[void](Assert-Task4PostImportResult -ExpectedPost $postExpected -ActualInventory $a -ExpectedTableCounts $expectedCounts -ActualTableCounts $c -Metrics $m -AuthBaseline $baseline -SequenceChecks $q -ServiceLists $s -ForeignKeyCount $fk)}
}
Assert-Rejected -Label 'Missing standalone sequence check was accepted.' -Action {[void](Assert-Task4PostImportResult -ExpectedPost $postExpected -ActualInventory $postActual -ExpectedTableCounts $expectedCounts -ActualTableCounts $actualCounts -Metrics $metrics -AuthBaseline $baseline -SequenceChecks @($validSequenceChecks|Select-Object -First 2) -ServiceLists $serviceLists -ForeignKeyCount 111)}
Assert-Rejected -Label 'Extra standalone sequence check was accepted.' -Action {[void](Assert-Task4PostImportResult -ExpectedPost $postExpected -ActualInventory $postActual -ExpectedTableCounts $expectedCounts -ActualTableCounts $actualCounts -Metrics $metrics -AuthBaseline $baseline -SequenceChecks @($validSequenceChecks+[pscustomobject]@{sequence_identity='public.extra_seq';passed=$true}) -ServiceLists $serviceLists -ForeignKeyCount 111)}

$importStart=$lowerRunner.IndexOf('function invoke-importphase')
$rollbackStart=$lowerRunner.IndexOf('function invoke-rollbackphase')
if($importStart -lt 0 -or $rollbackStart -le $importStart){throw 'Import function block is missing.'}
$importBlock=$lowerRunner.Substring($importStart,$rollbackStart-$importStart)
$authorizationOrder=@('assert-approvedarchive','assert-verifiedbackup','assert-rehearsalreport','assert-postmigrationtransitionmanifest','get-targetinventory','assert-postmigrationtargetstate','assert-task4schemaanddependencies','invoke-targetfile')
$prior=-1
foreach($marker in $authorizationOrder){$index=$importBlock.IndexOf($marker);if($index -le $prior){throw "Import authorization chain is incomplete or reordered at $marker"};$prior=$index}
if($importBlock.Contains('invoke-verifyphase')){throw 'Import still verifies the pre-migration state.'}

$postMigrationStart=$lowerRunner.IndexOf('function invoke-postmigrationphase')
if($postMigrationStart -lt 0 -or $importStart -le $postMigrationStart){throw 'PostMigration function block is missing.'}
$postMigrationBlock=$lowerRunner.Substring($postMigrationStart,$importStart-$postMigrationStart)
$postMigrationOrder=@('assert-approvedarchive','assert-verifiedbackup','assert-task4validationevidence','assert-rehearsalreport','get-targetinventory -includetask4contract','assert-postmigrationtargetstate','assert-task4schemaanddependencies','write-protectedjson','assert-postmigrationtransitionmanifest')
$prior=-1
foreach($marker in $postMigrationOrder){$index=$postMigrationBlock.IndexOf($marker);if($index -le $prior){throw "PostMigration chain is incomplete or reordered at $marker"};$prior=$index}
if($postMigrationBlock.Contains('invoke-targetfile')){throw 'PostMigration contains a target write primitive.'}
$postInvalidation=$lowerRunner.IndexOf("if (`$phase -eq 'postmigration') { invalidate-evidencefile")
$toolPreflight=$lowerRunner.LastIndexOf('assert-requiredtools')
if($postInvalidation -lt 0 -or $postInvalidation -ge $toolPreflight){throw 'PostMigration does not invalidate stale manifest before fallible preflight.'}

$rehearseStart=$lowerRunner.IndexOf('function invoke-rehearsephase')
$reportStart=$lowerRunner.IndexOf('function assert-rehearsalreport')
$rehearseBlock=$lowerRunner.Substring($rehearseStart,$reportStart-$rehearseStart)
$rehearseOrder=@('assert-uniquetocselections','restore target rehearsal schema','restore target rehearsal selected data','target scratch pre-constraint baseline counts','restore target rehearsal constraints before task 4 migrations','assert-task4scratchprerequisites','invoke-task4scratchmigrations','task 4 exact post-migration inventory','rehearse selective application and portable auth loader')
$prior=-1
foreach($marker in $rehearseOrder){$index=$rehearseBlock.IndexOf($marker);if($index -le $prior){throw "Rehearsal restore/application order is incomplete at $marker"};$prior=$index}

foreach($marker in @('pg_jsonschema','clinic_services','is_staff_or_admin','is_clinical','is_staff_or_clinical','supabase_realtime','has_schema_privilege','appointments_service_slug_fkey','queue_entries_cancelled_by_fkey','information_schema.columns','pg_get_constraintdef','storage.buckets','storage.foldername','allowed_mime_types','daily-reports','google_tag','private')){if(-not $lowerRunner.Contains($marker)){throw "Exact Task 4 schema/dependency gate is missing marker: $marker"}}
foreach($marker in @('set local session_replication_role = replica','set local session_replication_role = origin','foreign_key_audit','commit;')){if(-not $lowerRunner.Contains($marker)){throw "FK-safe loader contract is missing marker: $marker"}}
foreach($marker in @('new-boundloadersnapshot','new-intransactionauthzeroloader','post-import whole-target foreign-key audit','assert-task4postimportresult','task4-import-integrity-report.json')){if(-not $lowerRunner.Contains($marker)){throw "Import integrity chain is missing marker: $marker"}}

Import-RunnerFunction Get-SequenceCheckSql
$postgresBin='C:\Users\ahmed\Documents\Codex\tools\postgresql\17.10\pgsql\bin'
$sequenceRoot=Join-Path ([IO.Path]::GetTempPath()) ('task4-sequence-'+[Guid]::NewGuid().ToString('N'));$sequenceData=Join-Path $sequenceRoot 'data';$sequenceLog=Join-Path $sequenceRoot 'postgres.log'
$listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0);$listener.Start();$sequencePort=([Net.IPEndPoint]$listener.LocalEndpoint).Port;$listener.Stop();New-Item -ItemType Directory -Path $sequenceRoot|Out-Null
function Invoke-SequencePgCtl([string[]]$Arguments){$quoted=@($Arguments|ForEach-Object{if($_ -match '[\s"]'){'"'+$_.Replace('"','\"')+'"'}else{$_}})-join ' ';$process=Start-Process -FilePath (Join-Path $postgresBin 'pg_ctl.exe') -ArgumentList $quoted -PassThru -WindowStyle Hidden;if(-not $process.WaitForExit(30000)){$process.Kill();throw 'Sequence test pg_ctl timed out.'};if($process.ExitCode -ne 0){throw 'Sequence test pg_ctl failed.'}}
try{
  & (Join-Path $postgresBin 'initdb.exe') --pgdata $sequenceData --username postgres --auth trust --encoding UTF8 --no-locale --no-sync *> $null;if($LASTEXITCODE -ne 0){throw 'Sequence test initdb failed.'}
  Invoke-SequencePgCtl @('--pgdata',$sequenceData,'--log',$sequenceLog,'--options',"-h 127.0.0.1 -p $sequencePort",'--wait','start')
  & (Join-Path $postgresBin 'createdb.exe') --host 127.0.0.1 --port $sequencePort --username postgres sequence_test *> $null;if($LASTEXITCODE -ne 0){throw 'Sequence test createdb failed.'}
  $sequenceFixture=@'
create table public.t001(id bigint primary key);
create sequence public.t001_id_seq start 1 increment 1 owned by public.t001.id;
insert into public.t001(id) values (5);
create table public.t002(id bigint primary key);
create sequence public.t002_id_seq start -1 increment -1 minvalue -9223372036854775808 maxvalue -1 owned by public.t002.id;
insert into public.t002(id) values (-5);
create table public.client_invoices(invoice_no text);
create table public.patients(reg_no text);
create table public.queue_entries(queue_number bigint);
create sequence public.client_invoice_seq start 1;
create sequence public.patient_reg_no_seq start 1;
create sequence public.queue_number_seq start 1001;
insert into public.patients(reg_no) values ('KA-00117');
insert into public.queue_entries(queue_number) values (1148);
'@
  & (Join-Path $postgresBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command $sequenceFixture *> $null;if($LASTEXITCODE -ne 0){throw 'Sequence test fixture failed.'}
  $ownedSequenceBlock=[regex]::Match($guardedText,'(?is)do \$owned_sequence_reconcile\$.*?\$owned_sequence_reconcile\$;').Value;if(-not $ownedSequenceBlock){throw 'Generated owned-sequence reconciliation block is missing.'}
  & (Join-Path $postgresBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command $ownedSequenceBlock *> $null;if($LASTEXITCODE -ne 0){throw 'Generated owned-sequence reconciliation failed.'}
  $ownedState=& (Join-Path $postgresBin 'psql.exe') -X -A -t -q -F '|' -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command "select (select last_value::text||'/'||is_called::text from public.t001_id_seq),(select last_value::text||'/'||is_called::text from public.t002_id_seq);"
  if(($ownedState|Out-String).Trim() -cne '5/true|-5/true'){throw 'Owned-sequence positive/negative direction reconciliation failed.'}
  & (Join-Path $postgresBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command "truncate public.t001,public.t002;select setval('public.t001_id_seq',9,true);select setval('public.t002_id_seq',-9,true);" *> $null
  & (Join-Path $postgresBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command $ownedSequenceBlock *> $null
  $emptyOwnedState=& (Join-Path $postgresBin 'psql.exe') -X -A -t -q -F '|' -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command "select (select last_value::text||'/'||is_called::text from public.t001_id_seq),(select last_value::text||'/'||is_called::text from public.t002_id_seq);"
  if(($emptyOwnedState|Out-String).Trim() -cne '1/false|-1/false'){throw 'Owned empty-sequence start/uncalled reconciliation failed.'}
  & (Join-Path $postgresBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command 'drop table public.t001,public.t002 cascade;' *> $null
  $sequenceBlock=[regex]::Match($guardedText,'(?is)do \$sequence_reconcile\$.*?\$sequence_reconcile\$;').Value;if(-not $sequenceBlock){throw 'Generated exact standalone-sequence reconciliation block is missing.'}
  & (Join-Path $postgresBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command $sequenceBlock *> $null;if($LASTEXITCODE -ne 0){throw 'Generated exact standalone-sequence reconciliation failed.'}
  $sequenceResult=& (Join-Path $postgresBin 'psql.exe') -X -A -t -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command (Get-SequenceCheckSql)
  $parsedSequence=$sequenceResult|Out-String|ConvertFrom-Json;[void](Assert-Task4SequenceChecks -SequenceChecks $parsedSequence)
  Assert-EqualJson -Expected @('public.client_invoice_seq','public.patient_reg_no_seq','public.queue_number_seq') -Actual @($parsedSequence.sequence_identity) -Label 'Exact standalone sequence check identities changed.'
  & (Join-Path $postgresBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command "select setval('public.patient_reg_no_seq',117,false);" *> $null
  $unsafeSequence=(& (Join-Path $postgresBin 'psql.exe') -X -A -t -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command (Get-SequenceCheckSql))|Out-String|ConvertFrom-Json
  Assert-Rejected -Label 'Wrong standalone is_called state was accepted.' -Action {[void](Assert-Task4SequenceChecks -SequenceChecks $unsafeSequence)}
  & (Join-Path $postgresBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command "select setval('public.patient_reg_no_seq',117,true);create sequence public.extra_seq;" *> $null
  $extraSequence=(& (Join-Path $postgresBin 'psql.exe') -X -A -t -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command (Get-SequenceCheckSql))|Out-String|ConvertFrom-Json
  Assert-Rejected -Label 'Extra public sequence inventory was accepted.' -Action {[void](Assert-Task4SequenceChecks -SequenceChecks $extraSequence)}
}finally{
  if(Test-Path (Join-Path $sequenceData 'postmaster.pid')){try{Invoke-SequencePgCtl @('--pgdata',$sequenceData,'--mode=fast','--wait','stop')}catch{}}
  if(Test-Path $sequenceRoot){Remove-Item $sequenceRoot -Recurse -Force}
}

Write-Output 'Task 4 runner focused contract passed'
