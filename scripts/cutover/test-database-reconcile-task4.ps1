$ErrorActionPreference = 'Stop'

$runnerPath = Join-Path $PSScriptRoot 'database-reconcile.ps1'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Get-Content -LiteralPath $runnerPath -Raw
$lowerRunner = $runner.ToLowerInvariant()
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($runnerPath,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count -ne 0){throw 'Runner does not parse.'}

foreach($forbiddenRestoreFlag in @('--no-owner','--no-privileges')){
  if($lowerRunner.Contains($forbiddenRestoreFlag)){throw "Rollback fidelity contract still suppresses archive metadata: $forbiddenRestoreFlag"}
}
foreach($rollbackBinding in @(
  "`$Task4RollbackRestoreEvidenceName = 'task4-rollback-restore-evidence.json'",
  "`$Task4RollbackRestoreEvidenceSha256 = ''",
  "`$Task4RollbackExtendedCatalogSha256 = '1B4E08D71B3FAE4824A90F0A361826638B2F2EE2EFABEA360BF157BDEB931393'"
)){
  if(-not $runner.Contains($rollbackBinding)){throw "Rollback readiness binding is missing: $rollbackBinding"}
}

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
  [ordered]@{version='20260720111916';file='20260720111916_add_website_editor_role.sql';sha256='87F0EEA795BC99CE1CBA8BB799B6E25D7C3A313A54E309425FC47165B5125618';name='add_website_editor_role';statementCount=1;statementsSha256='4D4725CED6EBE42B31FB282909DA9FBD2A6E697D4770C04DE4479B85FC49B985'},
  [ordered]@{version='20260720115031';file='20260720115031_create_website_cms_foundation.sql';sha256='A86DA7A8824CCF5BEF9033D9DC525C37D50AE6281AF0C060ED031995459E5D30';name='create_website_cms_foundation';statementCount=91;statementsSha256='B2B9C9017EF44E8DD95E82A0666DC11494A1BCF91D9F6250E123FCE927B5E8F7'},
  [ordered]@{version='20260720225347';file='20260720225347_harden_website_cms_integration.sql';sha256='E4987CFCBD91251FE6EE10881D7F67858265C735DD7FDFCE31E49FBF63ECB8EC';name='harden_website_cms_integration';statementCount=31;statementsSha256='F24219DDADF3336C300153EDB521BC5A07807246707400E6A5489DC46298FAC2'},
  [ordered]@{version='20260721035032';file='20260721035032_add_website_page_publishing.sql';sha256='88BE2091198AECA44A556DF3A0C76C6AB6018FBA8149A0EE13F79C4AC92D4C39';name='add_website_page_publishing';statementCount=15;statementsSha256='B4536DDBADF2D0C266BE5BFE8B487CAA772B2E2452D90C3EED332B2AA7AC9067'},
  [ordered]@{version='20260721100403';file='20260721100403_switch_tracking_to_google.sql';sha256='EB84C03BD376D0B9E5AE2A7E1A14B7E41F9AA04B54D663793DCC79EF987E37A1';name='switch_tracking_to_google';statementCount=22;statementsSha256='8EA9689C0A8C7DB0BC5A1E40E771A747924B648CAE86BC016985299EE89BC672'},
  [ordered]@{version='20260721162256';file='20260721162256_restore_staff_messages.sql';sha256='4E0C335C855C1338EDAB28429B7377DAC7768D796666B3FF315FF1B4A55C9FB0';name='restore_staff_messages';statementCount=10;statementsSha256='82E015F8BC3DA792E95269F397F266D5A0A3C4AFF086DA6969183491A5727552'},
  [ordered]@{version='20260721170000';file='20260721170000_create_general_website_page_rpc.sql';sha256='4762C9B6791AB4C5E95FBFCC1F05F6BB703911D2D2DCE9DDDFD89456D2B922A4';name='create_general_website_page_rpc';statementCount=4;statementsSha256='E82EBA8A2674451B29885BDEC6D7F983C0CDAA2F4DDC3DA7162C98F14573EED1'},
  [ordered]@{version='20260721174422';file='20260721174422_preserve_source_cutover_fields.sql';sha256='ECEBAE8DFB0CED17B2C0A1332E627846844C439DB945A5C705C95B53E3611217';name='preserve_source_cutover_fields';statementCount=4;statementsSha256='9F380B05DEEA92BABC7AC0076963B81648FBC3ABF8734C0820F21E38B784FD7C'}
)

Import-RunnerFunction Get-StringSha256
Import-RunnerFunction Get-JsonSha256
Import-RunnerFunction Assert-NotReparsePoint
Import-RunnerFunction Assert-NoReparsePointInPath
Import-RunnerFunction Get-Task4MigrationBindings
$global:RepositoryRoot=$repositoryRoot
$global:ExpectedRef='nhjbqdiyptjqherdfbqk'
$global:Task4MigrationSpecifications=$expectedMigrations
$global:Task4MigrationHistoryBindingSha256='6612F6D16FECB390A6EC3BE870AC82C04866CFACF2788C1619878B39657BA2F0'
$global:Task4MigrationWorkdirDigest='55C3967A81AA832509B923E1062CDAE34C55E38D076006E3E8156FDE3C91149D'
foreach($migration in $expectedMigrations){if(-not $runner.Contains($migration.version) -or -not $runner.Contains($migration.file) -or -not $runner.Contains($migration.sha256)){throw "Runner source is missing exact migration binding: $($migration.file)"}}
$bindings=@(Get-Task4MigrationBindings)
if($bindings.Count -ne 8){throw 'Runtime binding is not exactly eight migrations.'}
Assert-EqualJson -Expected @($expectedMigrations.file) -Actual @($bindings.file) -Label 'Runtime migration order is not exact.'
Assert-EqualJson -Expected @($expectedMigrations.sha256) -Actual @($bindings.sha256) -Label 'Runtime migration hashes are not exact.'

Import-RunnerFunction Get-Task4MigrationStatements
Import-RunnerFunction Get-Task4MigrationHistorySummary
Import-RunnerFunction Get-PortableTask4MigrationBindings
Import-RunnerFunction Get-Task4LegacyMigrationBindings
Import-RunnerFunction Assert-Task4MigrationHistoryBindings
Import-RunnerFunction Get-Task4MigrationHistoryRows
$historyRows=@($bindings|ForEach-Object{
  [ordered]@{version=$_.version;name=$_.name;statements=@(Get-Task4MigrationStatements -Sql (Get-Content -LiteralPath $_.path -Raw))}
})
$historySummary=@(Get-Task4MigrationHistorySummary -Rows $historyRows)
$historyBinding=@(Assert-Task4MigrationHistoryBindings -Migrations $bindings -Rows $historyRows)
Assert-EqualJson -Expected $expectedMigrations -Actual $historyBinding -Label 'Exact six-field migration history binding is not canonical.'
if((Get-JsonSha256 -Value $historyBinding) -cne '6612F6D16FECB390A6EC3BE870AC82C04866CFACF2788C1619878B39657BA2F0'){throw 'Ordered eight-summary binding digest changed.'}
Assert-EqualJson -Expected @($expectedMigrations|ForEach-Object{[ordered]@{version=$_.version;file=$_.file;sha256=$_.sha256}}) -Actual @(Get-Task4LegacyMigrationBindings -Migrations $bindings) -Label 'Pinned v1 evidence legacy migration projection changed.'
foreach($mutation in @('version','name','statementBytes','statementOrder','statementCount','duplicate','missing','extra','scalarStatements','nullStatements','numericVersion','missingStatements')){
  $changed=@((ConvertTo-Json -InputObject $historyRows -Depth 100|ConvertFrom-Json))
  switch($mutation){
    'version'{$changed[0].version='20990101000000'}
    'name'{$changed[0].name='wrong_name'}
    'statementBytes'{$changed[0].statements[0]=[string]$changed[0].statements[0]+'x'}
    'statementOrder'{$swap=[string]$changed[1].statements[0];$changed[1].statements[0]=$changed[1].statements[1];$changed[1].statements[1]=$swap}
    'statementCount'{$changed[1].statements=@($changed[1].statements|Select-Object -Skip 1)}
    'duplicate'{$changed+=($changed[0]|ConvertTo-Json -Depth 100|ConvertFrom-Json)}
    'missing'{$changed=@($changed|Select-Object -Skip 1)}
    'extra'{$changed+=[pscustomobject]@{version='20990101000000';name='extra';statements=@('select 1')}}
    'scalarStatements'{$changed[0].statements='select 1'}
    'nullStatements'{$changed[0].statements=$null}
    'numericVersion'{$changed[0].version=20260720111916}
    'missingStatements'{$changed[0].PSObject.Properties.Remove('statements')}
  }
  Assert-Rejected -Label "Exact history binding accepted mutation: $mutation" -Action {[void](Assert-Task4MigrationHistoryBindings -Migrations $bindings -Rows $changed)}
}
$script:historyQueryText=$null;$script:historyQueryResult=(ConvertTo-Json -InputObject $historyRows -Depth 100 -Compress)
function global:Invoke-TargetQueryWithoutOutputLog {param($Sql,$Label)$script:historyQueryText=$Sql;return $script:historyQueryResult}
function global:Invoke-TargetQuery {throw 'Exact migration history reader used the general captured-output query helper.'}
$queriedHistory=@(Get-Task4MigrationHistoryRows -Migrations $bindings -Label 'focused exact history query')
Assert-EqualJson -Expected $historySummary -Actual @(Get-Task4MigrationHistorySummary -Rows $queriedHistory) -Label 'Exact history reader did not preserve target text-array data.'
foreach($version in $expectedMigrations.version){if(-not $script:historyQueryText.Contains("'$version'")){throw "Exact history query omitted version: $version"}}
if(([regex]::Matches($script:historyQueryText,"'\d{14}'")).Count -ne 8 -or -not $script:historyQueryText.Contains('select version,name,to_jsonb(statements) as statements') -or -not $script:historyQueryText.Contains('where version in (') -or -not $script:historyQueryText.Contains('order by version')){throw 'Exact history query is not constrained to the ordered eight-row contract.'}
$script:historyQueryResult='{malformed statement payload'
try{[void](Get-Task4MigrationHistoryRows -Migrations $bindings -Label 'malformed exact history query');throw 'Malformed exact history JSON was accepted.'}catch{if($_.Exception.Message -ne 'Task 4 exact migration history query returned invalid JSON.'){throw 'Malformed exact history JSON was not rejected with a sanitized error.'}}

Import-RunnerFunction Get-Task4BaselineMigrationFiles
Import-RunnerFunction Get-Task4MigrationWorkdirInventory
Import-RunnerFunction Assert-Task4MigrationWorkdirInventory
$baselineFiles=@(Get-Task4BaselineMigrationFiles)
if($baselineFiles.Count -ne 153 -or @($baselineFiles|Sort-Object -Unique).Count -ne 153){throw 'Exact remote baseline file binding is not 153 unique entries.'}
$workdirRoot=Join-Path ([IO.Path]::GetTempPath()) ('task4-workdir-'+[Guid]::NewGuid().ToString('N'))
try{
  $workdirMigrations=Join-Path $workdirRoot 'supabase\migrations';New-Item -ItemType Directory -Path $workdirMigrations -Force|Out-Null
  foreach($file in $baselineFiles){[IO.File]::WriteAllBytes((Join-Path $workdirMigrations $file),[byte[]]@())}
  foreach($migration in $bindings){Copy-Item -LiteralPath $migration.path -Destination (Join-Path $workdirMigrations $migration.file)}
  $workdirInventory=Get-Task4MigrationWorkdirInventory -Workdir $workdirRoot
  if($workdirInventory.files.Count -ne 161 -or $workdirInventory.sha256 -cne '55C3967A81AA832509B923E1062CDAE34C55E38D076006E3E8156FDE3C91149D'){throw 'Exact sorted 161-file workdir inventory/digest changed.'}
  [void](Assert-Task4MigrationWorkdirInventory -Inventory $workdirInventory -Migrations $bindings)
  $placeholderPath=Join-Path $workdirMigrations $baselineFiles[0];[IO.File]::WriteAllBytes($placeholderPath,[byte[]](1));Assert-Rejected -Label 'Nonzero baseline placeholder was accepted.' -Action {[void](Assert-Task4MigrationWorkdirInventory -Inventory (Get-Task4MigrationWorkdirInventory -Workdir $workdirRoot) -Migrations $bindings)};[IO.File]::WriteAllBytes($placeholderPath,[byte[]]@())
  $pendingPath=Join-Path $workdirMigrations $bindings[0].file;Add-Content -LiteralPath $pendingPath -Value 'x';Assert-Rejected -Label 'Altered pending migration was accepted.' -Action {[void](Assert-Task4MigrationWorkdirInventory -Inventory (Get-Task4MigrationWorkdirInventory -Workdir $workdirRoot) -Migrations $bindings)};Copy-Item -LiteralPath $bindings[0].path -Destination $pendingPath -Force
  Remove-Item -LiteralPath (Join-Path $workdirMigrations $baselineFiles[1]) -Force;Assert-Rejected -Label 'Missing baseline file was accepted.' -Action {[void](Assert-Task4MigrationWorkdirInventory -Inventory (Get-Task4MigrationWorkdirInventory -Workdir $workdirRoot) -Migrations $bindings)};[IO.File]::WriteAllBytes((Join-Path $workdirMigrations $baselineFiles[1]),[byte[]]@())
  [IO.File]::WriteAllBytes((Join-Path $workdirMigrations '20990101000000_extra.sql'),[byte[]]@());Assert-Rejected -Label 'Extra workdir file was accepted.' -Action {[void](Assert-Task4MigrationWorkdirInventory -Inventory (Get-Task4MigrationWorkdirInventory -Workdir $workdirRoot) -Migrations $bindings)};Remove-Item -LiteralPath (Join-Path $workdirMigrations '20990101000000_extra.sql') -Force
  $reordered=$workdirInventory|ConvertTo-Json -Depth 100|ConvertFrom-Json;$swap=$reordered.files[0];$reordered.files[0]=$reordered.files[1];$reordered.files[1]=$swap;Assert-Rejected -Label 'Reordered inventory was accepted.' -Action {[void](Assert-Task4MigrationWorkdirInventory -Inventory $reordered -Migrations $bindings)}
  $wrongDigest=$workdirInventory|ConvertTo-Json -Depth 100|ConvertFrom-Json;$wrongDigest.sha256=('0'*64);Assert-Rejected -Label 'Wrong whole-inventory digest was accepted.' -Action {[void](Assert-Task4MigrationWorkdirInventory -Inventory $wrongDigest -Migrations $bindings)}
  $reparseRoot=Join-Path ([IO.Path]::GetTempPath()) ('task4-workdir-reparse-'+[Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $reparseRoot|Out-Null;New-Item -ItemType Junction -Path (Join-Path $reparseRoot 'supabase') -Value (Join-Path $workdirRoot 'supabase')|Out-Null;Assert-Rejected -Label 'Reparse-point supabase ancestor was accepted.' -Action {[void](Get-Task4MigrationWorkdirInventory -Workdir $reparseRoot)};Remove-Item -LiteralPath $reparseRoot -Recurse -Force
  $ancestorTarget=Join-Path ([IO.Path]::GetTempPath()) ('task4-ancestor-target-'+[Guid]::NewGuid().ToString('N'));$ancestorLink=Join-Path ([IO.Path]::GetTempPath()) ('task4-ancestor-link-'+[Guid]::NewGuid().ToString('N'))
  try{New-Item -ItemType Directory -Path $ancestorTarget|Out-Null;New-Item -ItemType Junction -Path $ancestorLink -Value $ancestorTarget|Out-Null;$ancestorChild=Join-Path $ancestorLink 'artifact';New-Item -ItemType Directory -Path $ancestorChild|Out-Null;Assert-Rejected -Label 'A junction in a protected-path ancestor was accepted.' -Action {Assert-NoReparsePointInPath -Path $ancestorChild -Label 'ancestor junction regression'}}finally{if(Test-Path -LiteralPath $ancestorLink){[IO.Directory]::Delete($ancestorLink)};if(Test-Path -LiteralPath $ancestorTarget){[IO.Directory]::Delete($ancestorTarget,$true)}}
}finally{if(Test-Path -LiteralPath $workdirRoot){Remove-Item -LiteralPath $workdirRoot -Recurse -Force}}

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
  foreach($metric in @('forbiddenState','invitedAtNonNull')){
    foreach($invalidValue in @($null,'not-a-number',0.5,$false)){
      $changed=$targetAggregate|ConvertTo-Json -Depth 20|ConvertFrom-Json
      $changed.$metric=$invalidValue
      Assert-Rejected -Label "Portable Auth aggregate accepted invalid zero metric: $metric=$invalidValue" -Action {Assert-Task4AuthAggregate -Actual $changed -Baseline $baseline -RequireNeutralized}
    }
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
$authorizationOrder=@('assert-approvedarchive','assert-verifiedbackup','assert-rehearsalreport','assert-task4migrationpushevidence','get-task4migrationhistoryrows','assert-task4migrationhistorybindings','assert-postmigrationtransitionmanifest','get-targetinventory','assert-postmigrationtargetstate','assert-task4schemaanddependencies','invoke-targetfile')
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
if($postMigrationBlock.Contains('task4migrationpushevidence')){throw 'PostMigration can mint or accept push evidence.'}
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

Import-RunnerFunction Assert-Task4MigrationPushEvidence
$pushEvidenceDefinition=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Assert-Task4MigrationPushEvidence'},$true)
if(-not $pushEvidenceDefinition){throw 'Push evidence authorization gate is missing.'}
$pushEvidenceText=$pushEvidenceDefinition.Extent.Text.ToLowerInvariant()
foreach($marker in @('[parameter(mandatory)]$authorization','$currentrunnersha256','task4migrationpushproducerrunnersha256 -notmatch','listedpendingmigrations','assert-task4transcriptbinding','$payload.connection','expectedpersistentpost')){if(-not $pushEvidenceText.Contains($marker)){throw "Push evidence hardening is missing marker: $marker"}}
$transcriptBindingDefinition=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Assert-Task4TranscriptBinding'},$true)
if(-not $transcriptBindingDefinition -or -not $transcriptBindingDefinition.Extent.Text.ToLowerInvariant().Contains('get-task4sanitizedclitranscript')){throw 'Transcript validation does not recompute the exact sanitized transcript content.'}
$global:Task4MigrationPushEvidenceSha256=''
Assert-Rejected -Label 'An empty independent push-evidence pin did not fail closed.' -Action {[void](Assert-Task4MigrationPushEvidence -VerifiedBackup ([ordered]@{}) -Migrations $bindings -Authorization ([ordered]@{}))}

Import-RunnerFunction Get-NormalizedPath
Import-RunnerFunction Get-Task4TlsDatabaseUrl
Import-RunnerFunction Assert-Task4BaselinePlaceholderBinding
Import-RunnerFunction Assert-Task4CliDryRunOutput
Import-RunnerFunction Get-Task4SanitizedCliTranscript
Import-RunnerFunction Assert-Task4TranscriptBinding
$pushEvidenceTestRoot=Join-Path ([IO.Path]::GetTempPath()) ('task4-push-evidence-'+[Guid]::NewGuid().ToString('N'))
try{
  New-Item -ItemType Directory -Path $pushEvidenceTestRoot|Out-Null
  $global:ArtifactRoot=$pushEvidenceTestRoot
  $script:Target=[pscustomobject]@{Host='db.example.test';Port=5432;Username='cutover user';Database='target/db';Password='task4-test-password'}
  if((Get-Task4TlsDatabaseUrl) -cne 'postgresql://cutover%20user@db.example.test:5432/target%2Fdb?sslmode=require'){throw 'Task 4 TLS URL is not credentialless and exactly escaped.'}
  $baselineVersions=@(Get-Task4BaselineMigrationFiles|ForEach-Object{$_.Substring(0,14)})
  $placeholderBackup=[ordered]@{manifest=[ordered]@{targetBaseline=[ordered]@{migrationIdentities=$baselineVersions}}}
  [void](Assert-Task4BaselinePlaceholderBinding -VerifiedBackup $placeholderBackup)
  $placeholderBackup.manifest.targetBaseline.migrationIdentities[0]='20990101000000'
  Assert-Rejected -Label 'A non-matching 153-placeholder history was accepted.' -Action {[void](Assert-Task4BaselinePlaceholderBinding -VerifiedBackup $placeholderBackup)}
  $dryRunLines=@('Dry run exact pending migrations:')+@($bindings.file)
  Assert-EqualJson -Expected @($bindings.file) -Actual @(Assert-Task4CliDryRunOutput -Lines $dryRunLines -Migrations $bindings) -Label 'Dry run did not bind the exact ordered eight-file list.'
  $wrongDryRun=@($dryRunLines);$wrongDryRun[2]=$bindings[2].file
  Assert-Rejected -Label 'Reordered dry-run pending migrations were accepted.' -Action {[void](Assert-Task4CliDryRunOutput -Lines $wrongDryRun -Migrations $bindings)}
  $transcriptPath=Join-Path $pushEvidenceTestRoot 'task4-migration-dry-run-transcript.log';$sanitizedDryRun=Get-Task4SanitizedCliTranscript -Phase DryRun -Migrations $bindings;[IO.File]::WriteAllText($transcriptPath,$sanitizedDryRun,[Text.UTF8Encoding]::new($false))
  $transcriptBinding=[ordered]@{file='task4-migration-dry-run-transcript.log';bytes=[int64](Get-Item -LiteralPath $transcriptPath).Length;sha256=(Get-FileHash -LiteralPath $transcriptPath -Algorithm SHA256).Hash.ToUpperInvariant()}
  [void](Assert-Task4TranscriptBinding -Binding $transcriptBinding -ExpectedName 'task4-migration-dry-run-transcript.log' -Phase DryRun -Migrations $bindings)
  [IO.File]::WriteAllText($transcriptPath,"BEGIN;`n",[Text.UTF8Encoding]::new($false));Assert-Rejected -Label 'Raw SQL-shaped CLI output was accepted as a sanitized transcript.' -Action {[void](Assert-Task4TranscriptBinding -Binding $transcriptBinding -ExpectedName 'task4-migration-dry-run-transcript.log' -Phase DryRun -Migrations $bindings)}
  [IO.File]::WriteAllText($transcriptPath,$sanitizedDryRun,[Text.UTF8Encoding]::new($false))
  Add-Content -LiteralPath $transcriptPath -Value 'tampered'
  Assert-Rejected -Label 'A rehashed transcript binding accepted changed bytes.' -Action {[void](Assert-Task4TranscriptBinding -Binding $transcriptBinding -ExpectedName 'task4-migration-dry-run-transcript.log' -Phase DryRun -Migrations $bindings)}
}finally{if(Test-Path -LiteralPath $pushEvidenceTestRoot){Remove-Item -LiteralPath $pushEvidenceTestRoot -Recurse -Force}}

Import-RunnerFunction Invoke-Task4PinnedCliPush
$script:mockPushEvents=New-Object 'System.Collections.Generic.List[string]'
function global:Get-Task4TlsDatabaseUrl {$script:mockPushEvents.Add('url');return 'postgresql://user@host:5432/db?sslmode=require'}
function global:Invoke-WithTargetEnvironment {param([scriptblock]$Action)& $Action}
function global:Assert-Task4PinnedSupabaseCli {$script:mockPushEvents.Add('cli')}
function global:Assert-Task4FinalPushWorkdir {param($Workdir,$Migrations)$script:mockPushEvents.Add('rehash');return [ordered]@{sha256=('A'*64)}}
function global:Invoke-MockedSupabaseCli {param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)$script:mockPushEvents.Add('live');if($Arguments[0] -cne 'db' -or $Arguments[1] -cne 'push'){throw 'Live Push native arguments changed.'};$global:LASTEXITCODE=19;Write-Output 'mocked native failure'}
function global:Invoke-External {$script:mockPushEvents.Add('helper');throw 'Live Push incorrectly delegated to Invoke-External.'}
$global:SupabaseCli='Invoke-MockedSupabaseCli'
$mockFailure=$null;try{[void](Invoke-Task4PinnedCliPush -Workdir 'mock-workdir' -Migrations $bindings)}catch{$mockFailure=$_.Exception.Message}
if($mockFailure -cne 'Task 4 exact migration push failed with exit code 19.'){throw 'Mocked native Push failure was not surfaced with a sanitized error.'}
Assert-EqualJson -Expected @('url','cli','rehash','live') -Actual @($script:mockPushEvents) -Label 'Live Push did not rehash immediately before the sole mocked db push call.'

$rollbackGateDefinition=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Assert-RollbackRestoreReadiness'},$true)
$rollbackPhaseDefinition=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-RollbackPhase'},$true)
$rollbackRequiredDefinition=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-Task4RollbackRequiredEvidencePaths'},$true)
if(-not $rollbackGateDefinition -or -not $rollbackPhaseDefinition -or -not $rollbackRequiredDefinition){throw 'Rollback non-authorizing gate, schema, or phase is missing.'}
$rollbackGateText=$rollbackGateDefinition.Extent.Text.ToLowerInvariant()
$rollbackPhaseText=$rollbackPhaseDefinition.Extent.Text.ToLowerInvariant()
$rollbackContractText=($rollbackGateText+"`n"+$rollbackRequiredDefinition.Extent.Text.ToLowerInvariant())
foreach($marker in @('task4rollbackrestoreevidencesha256','payloadsha256','contractrunnersha256','toc.categorycounts','platform.roles','startingstate','cleanup.postbackupobjects','baseline.migrationhistory.records','baseline.tabledata.counts','baseline.storagebytes.restoreproofsha256','postrestore.exactpostrestorematch','non-authorizing')){
  if(-not $rollbackContractText.Contains($marker)){throw "Rollback candidate schema is missing marker: $marker"}
}
foreach($forbiddenGateOperation in @('assert-verifiedbackup','get-targetinventory','invoke-targetquery','invoke-targetfile','invoke-external','pg_restore')){if($rollbackGateText.Contains($forbiddenGateOperation)){throw "Rollback candidate gate reaches target or external operation: $forbiddenGateOperation"}}
if(-not $rollbackPhaseText.Contains('assert-rollbackrestorereadiness')){throw 'Rollback does not call the refusal gate first.'}
foreach($forbiddenRollbackOperation in @('invoke-targetfile','invoke-external','pg_restore','write-summary','--clean')){if($rollbackPhaseText.Contains($forbiddenRollbackOperation)){throw "Rollback exposes an unproven restore or success path: $forbiddenRollbackOperation"}}

Import-RunnerFunction Assert-Task4ExactEvidenceProperties
Import-RunnerFunction Assert-Task4EvidenceSha256
Import-RunnerFunction Assert-Task4EvidenceBoolean
Import-RunnerFunction Assert-Task4EvidenceInteger
Import-RunnerFunction Get-Task4RollbackRequiredEvidencePaths
Import-RunnerFunction Assert-Task4RollbackCandidateField
Import-RunnerFunction Get-Task4RollbackContractRunnerSha256
Import-RunnerFunction Assert-RollbackRestoreReadiness
Import-RunnerFunction Invoke-RollbackPhase
$rollbackEvidenceRoot=Join-Path ([IO.Path]::GetTempPath()) ('task4-rollback-evidence-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $rollbackEvidenceRoot|Out-Null
$global:ArtifactRoot=$rollbackEvidenceRoot
$global:Task4RollbackRestoreEvidenceName='task4-rollback-restore-evidence.json'
$global:Task4RollbackRestoreEvidenceSha256=''
$global:Task4RunnerPath=$runnerPath
$script:rollbackSentinelEvents=New-Object 'System.Collections.Generic.List[string]'
function global:Invoke-External {$script:rollbackSentinelEvents.Add('Invoke-External');throw 'Rollback reached Invoke-External.'}
function global:Invoke-TargetFile {$script:rollbackSentinelEvents.Add('Invoke-TargetFile');throw 'Rollback reached Invoke-TargetFile.'}
function global:Get-TargetInventory {$script:rollbackSentinelEvents.Add('Get-TargetInventory');throw 'Rollback reached a target read.'}
Set-Item -Path function:\pg_restore.exe -Value {$script:rollbackSentinelEvents.Add('pg_restore');throw 'Rollback reached pg_restore.'}
$missingPinError=$null
try{Invoke-RollbackPhase}catch{$missingPinError=$_.Exception.Message}
if($missingPinError -cne 'Task 4 rollback restore evidence has not been independently pinned.'){throw 'Rollback did not fail closed on its intentionally empty independent pin.'}
if($script:rollbackSentinelEvents.Count -ne 0){throw 'Rollback reached a target/external sentinel before rejecting its missing pin.'}

try{
  $global:Task4RollbackRestoreEvidenceSha256=('A'*64)
  Assert-Rejected -Label 'A missing rollback candidate file was accepted.' -Action {[void](Assert-RollbackRestoreReadiness)}

  $normalizedRunnerSha256=Get-Task4RollbackContractRunnerSha256 -Path $runnerPath
  $editedRunnerPath=Join-Path $rollbackEvidenceRoot 'runner-with-pin.ps1'
  $editedRunnerText=(Get-Content -LiteralPath $runnerPath -Raw) -replace "(?m)^\`$Task4RollbackRestoreEvidenceSha256\s*=\s*''\s*$",("`$Task4RollbackRestoreEvidenceSha256 = '"+('A'*64)+"'")
  [IO.File]::WriteAllText($editedRunnerPath,$editedRunnerText,[Text.UTF8Encoding]::new($false))
  if((Get-Task4RollbackContractRunnerSha256 -Path $editedRunnerPath) -cne $normalizedRunnerSha256){throw 'Normalized rollback contract runner digest changes when only the on-disk evidence pin changes.'}

  $candidatePayload=[ordered]@{
    formatVersion=1;status='unreviewed-candidate';completedAtUtc='2026-07-21T00:00:00.0000000Z';targetRef='nhjbqdiyptjqherdfbqk';contractRunnerSha256=$normalizedRunnerSha256
    restore=[ordered]@{environment='unreviewed-candidate';productionTargetWrites=0;executable=[ordered]@{file='candidate';version='candidate';sha256=('1'*64)};arguments=@('candidate');argumentsSha256=('2'*64);ownerReplay=$true;privilegeReplay=$true}
    backup=[ordered]@{file='candidate';bytes=1L;sha256=('3'*64);manifest=[ordered]@{file='candidate';sha256=('4'*64);targetBaselineSha256=('5'*64)};toc=[ordered]@{sha256=('6'*64);entries=1;aclEntries=1;defaultAclEntries=1;extensionEntries=1;publicationEntries=1;categoryCounts=[ordered]@{candidate=1};categoryCountsSha256=('7'*64);tableDataRelations=@('candidate');tableDataRelationsSha256=('8'*64)}}
    platform=[ordered]@{provider='unreviewed-candidate';postgresMajor=17;roles=@('candidate');rolesSha256=('9'*64);extensions=@('candidate');extensionsSha256=('A'*64);capabilitiesSha256=('B'*64)}
    startingState=[ordered]@{inventory=[ordered]@{candidate='unreviewed'};sha256=('C'*64)}
    cleanup=[ordered]@{strategy='unreviewed-candidate';strictAllowlist=$true;removesAllPostBackupObjects=$true;postBackupObjects=@('candidate');postBackupObjectsSha256=('D'*64);allowlistedOperations=@('candidate');allowlistedOperationsSha256=('E'*64);postCleanupObjectAbsenceVerified=$true}
    baseline=[ordered]@{ordinaryCatalogSha256=('F'*64);extendedCatalogSha256=('1'*64);catalogComponents=[ordered]@{candidate=('2'*64)};catalogComponentsSha256=('3'*64);migrationHistory=[ordered]@{fields=@('version','name','statements');records=@([ordered]@{candidate='unreviewed'});recordsSha256=('4'*64)};tableData=[ordered]@{counts=@([ordered]@{candidate='unreviewed'});countsSha256=('5'*64)};auth=[ordered]@{users=0;identities=0;sessions=0;refreshTokens=0};storageMetadata=[ordered]@{buckets=0;objects=0;canonicalSha256=('6'*64)};storageBytes=[ordered]@{separateFromDatabaseRestore=$true;beforeInventorySha256=('7'*64);afterInventorySha256=('8'*64);cleanupProofSha256=('9'*64);restoreProofSha256=('A'*64);exactByteFidelity=$true}}
    postRestore=[ordered]@{exactPostRestoreMatch=$true;ordinaryCatalogSha256=('B'*64);extendedCatalogSha256=('C'*64);catalogComponentsSha256=('D'*64);migrationHistorySha256=('E'*64);tableCountsSha256=('F'*64);auth=[ordered]@{users=0;identities=0;sessions=0;refreshTokens=0};storageMetadataSha256=('1'*64);storageByteInventorySha256=('2'*64)}
  }
  $candidateDocument=[ordered]@{payload=$candidatePayload;payloadSha256=Get-JsonSha256 -Value $candidatePayload}
  $rollbackEvidencePath=Join-Path $rollbackEvidenceRoot $global:Task4RollbackRestoreEvidenceName
  function Write-RollbackCandidate([Parameter(Mandatory)]$Document){[IO.File]::WriteAllText($rollbackEvidencePath,(ConvertTo-Json -InputObject $Document -Depth 100)+"`n",[Text.UTF8Encoding]::new($false));$global:Task4RollbackRestoreEvidenceSha256=(Get-FileHash -LiteralPath $rollbackEvidencePath -Algorithm SHA256).Hash.ToUpperInvariant()}
  function Get-RollbackRejection([Parameter(Mandatory)][scriptblock]$Action){try{& $Action;return $null}catch{return $_.Exception.Message}}

  [IO.File]::WriteAllText($rollbackEvidencePath,'{malformed rollback candidate',[Text.UTF8Encoding]::new($false));$global:Task4RollbackRestoreEvidenceSha256=(Get-FileHash -LiteralPath $rollbackEvidencePath -Algorithm SHA256).Hash.ToUpperInvariant()
  Assert-Rejected -Label 'Malformed independently pinned rollback candidate was accepted.' -Action {[void](Assert-RollbackRestoreReadiness)}
  $incomplete=$candidateDocument|ConvertTo-Json -Depth 100|ConvertFrom-Json;$incomplete.payload.baseline.storageBytes.PSObject.Properties.Remove('restoreProofSha256');$incomplete.payloadSha256=Get-JsonSha256 -Value $incomplete.payload;Write-RollbackCandidate $incomplete
  if((Get-RollbackRejection {[void](Assert-RollbackRestoreReadiness)}) -cne 'Task 4 rollback candidate required field is missing or null: baseline.storageBytes.restoreProofSha256'){throw 'Incomplete rollback candidate was not rejected diagnostically.'}
  Write-RollbackCandidate $candidateDocument;$pinnedBeforeTamper=$global:Task4RollbackRestoreEvidenceSha256;Add-Content -LiteralPath $rollbackEvidencePath -Value 'tampered';$global:Task4RollbackRestoreEvidenceSha256=$pinnedBeforeTamper
  Assert-Rejected -Label 'Tampered rollback candidate bytes were accepted.' -Action {[void](Assert-RollbackRestoreReadiness)}
  $stale=$candidateDocument|ConvertTo-Json -Depth 100|ConvertFrom-Json;$stale.payload.contractRunnerSha256=('0'*64);$stale.payloadSha256=Get-JsonSha256 -Value $stale.payload;Write-RollbackCandidate $stale
  if((Get-RollbackRejection {[void](Assert-RollbackRestoreReadiness)}) -cne 'Task 4 rollback candidate is stale for the current normalized runner contract.'){throw 'Stale rollback candidate was not rejected diagnostically.'}
  $stringFalse=$candidateDocument|ConvertTo-Json -Depth 100|ConvertFrom-Json;$stringFalse.payload.restore.ownerReplay='false';$stringFalse.payloadSha256=Get-JsonSha256 -Value $stringFalse.payload;Write-RollbackCandidate $stringFalse
  if((Get-RollbackRejection {[void](Assert-RollbackRestoreReadiness)}) -cne 'Task 4 rollback candidate field must be a JSON boolean: restore.ownerReplay'){throw 'String false was coerced into rollback authorization.'}
  $nullInteger=$candidateDocument|ConvertTo-Json -Depth 100|ConvertFrom-Json;$nullInteger.payload.restore.productionTargetWrites=$null;$nullInteger.payloadSha256=Get-JsonSha256 -Value $nullInteger.payload;Write-RollbackCandidate $nullInteger
  if((Get-RollbackRejection {[void](Assert-RollbackRestoreReadiness)}) -cne 'Task 4 rollback candidate required field is missing or null: restore.productionTargetWrites'){throw 'Null integer was coerced into rollback authorization.'}
  Write-RollbackCandidate $candidateDocument
  if((Get-RollbackRejection {[void](Assert-RollbackRestoreReadiness)}) -cne 'Task 4 rollback candidate is non-authorizing; semantic restore validation is not implemented.'){throw 'A fully populated fabricated rollback candidate reached a success path.'}
  if($script:rollbackSentinelEvents.Count -ne 0){throw 'Rollback candidate validation reached a target read, external process, or restore sentinel.'}
}finally{
  $global:Task4RollbackRestoreEvidenceSha256=''
  if(Test-Path -LiteralPath $rollbackEvidenceRoot){Remove-Item -LiteralPath $rollbackEvidenceRoot -Recurse -Force}
  Remove-Item function:\pg_restore.exe -Force -ErrorAction SilentlyContinue
}

$historyReader=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-Task4MigrationHistoryRows'},$true)
if(-not $historyReader){throw 'Exact migration history reader is missing.'}
$historyReaderText=$historyReader.Extent.Text.ToLowerInvariant()
if($historyReaderText -match '(?<!withoutoutputlog)invoke-targetquery\b' -or -not $historyReaderText.Contains('invoke-targetquerywithoutoutputlog')){throw 'Exact history reader can send statement bodies through the general captured-output logger.'}
foreach($marker in @('select version,name,to_jsonb(statements) as statements','where version in (','order by version')){if(-not $historyReaderText.Contains($marker)){throw "Exact history reader is missing constrained query marker: $marker"}}

$pushStart=$lowerRunner.IndexOf('function invoke-pushphase')
$pushWrapperStart=$lowerRunner.IndexOf('function invoke-task4pinnedclipush')
if($pushStart -lt 0 -or $pushWrapperStart -lt 0){throw 'Non-bypassable Push phase/wrapper is missing.'}
$pushWrapperEnd=$lowerRunner.IndexOf('function ',($pushWrapperStart+10));if($pushWrapperEnd -lt 0){$pushWrapperEnd=$lowerRunner.Length}
$pushWrapper=$lowerRunner.Substring($pushWrapperStart,$pushWrapperEnd-$pushWrapperStart)
$finalPushPattern='(?s)\$finalworkdir\s*=\s*assert-task4finalpushworkdir[^\r\n]*\r?\n\s*\$pushlog\s*=\s*@\(\s*&\s+\$supabasecli\s+@arguments\s+2>&1\s*\)'
if(-not [regex]::IsMatch($pushWrapper,$finalPushPattern)){throw 'Final exact workdir rehash/assert is not immediately adjacent to the live Supabase db push call.'}
if($pushWrapper.Contains('invoke-external') -or $pushWrapper.Contains('write-task4sanitizedclitranscript')){throw 'Live Push wrapper delegates or persists a transcript before post-write validation.'}
if($pushWrapper.Contains('--dry-run')){throw 'Live Push wrapper contains a dry-run bypass.'}
$pushBlockEnd=$lowerRunner.IndexOf('function invoke-postmigrationphase');$pushBlock=$lowerRunner.Substring($pushStart,$pushBlockEnd-$pushStart)
$pushPostLivePattern='(?s)\$pushresult\s*=\s*invoke-task4pinnedclipush[^\r\n]*\r?\n\s*\$historyrows\s*=\s*get-task4migrationhistoryrows[^\r\n]*\r?\n\s*\$posthistory\s*=\s*@\(assert-task4migrationhistorybindings'
if(-not [regex]::IsMatch($pushBlock,$pushPostLivePattern)){throw 'Push does not validate exact history immediately after the native Push call.'}
$pushOrder=@('assert-task4pinnedsupabasecli','new-task4migrationworkdir','invoke-task4pinnedclidryrun','assert-task4clidryrunoutput','write-task4sanitizedclitranscript','invoke-task4pinnedclipush','get-task4migrationhistoryrows','assert-task4migrationhistorybindings','get-targetinventory','assert-postmigrationtargetstate','assert-task4schemaanddependencies','write-task4sanitizedclitranscript','write-protectedjson')
$prior=-1;foreach($marker in $pushOrder){$index=$pushBlock.IndexOf($marker,$prior+1);if($index -le $prior){throw "Push authorization/evidence chain is incomplete or reordered at $marker"};$prior=$index}
if($pushBlock.Contains('invoke-postmigrationphase')){throw 'Push phase delegates or bypasses through PostMigration.'}
$pushInvalidation=$lowerRunner.IndexOf(("if ("+'$phase'+" -eq 'push')"));$pushEvidenceInvalidation=$lowerRunner.IndexOf('task4migrationpushevidencename',$pushInvalidation);$toolPreflight=$lowerRunner.LastIndexOf('assert-requiredtools');if($pushInvalidation -lt 0 -or $pushEvidenceInvalidation -le $pushInvalidation -or $pushEvidenceInvalidation -ge $toolPreflight){throw 'Push does not invalidate stale push evidence before fallible preflight.'}
if(-not $lowerRunner.Contains('project_id') -or -not $lowerRunner.Contains('$expectedref')){throw 'Protected Push workdir config is not bound to the exact target identity.'}

$rehearseDefinition=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-RehearsePhase'},$true)
if(-not $rehearseDefinition){throw 'Rehearse phase is missing.'}
$rehearseText=$rehearseDefinition.Extent.Text.ToLowerInvariant()
$sourceBootstrapIndex=$rehearseText.IndexOf('new-localdatabase -database $sourcedatabase')
$targetBootstrapIndex=$rehearseText.IndexOf('new-localdatabase -database $targetdatabase')
$firstRestoreIndex=$rehearseText.IndexOf('restore-tocselection')
if($sourceBootstrapIndex -lt 0 -or $targetBootstrapIndex -lt 0 -or $firstRestoreIndex -lt 0 -or $sourceBootstrapIndex -ge $firstRestoreIndex -or $targetBootstrapIndex -ge $firstRestoreIndex){throw 'Rehearse does not bootstrap both disposable databases before the first owner-replaying restore.'}

$postgresBin='C:\Users\ahmed\Documents\Codex\tools\postgresql\17.10\pgsql\bin'
Import-RunnerFunction New-LocalDatabase
$script:capturedBootstrapSql=$null
$script:capturedCreateDatabase=$null
function global:Invoke-External {
  param([string]$File,[string[]]$Arguments,[string]$Label,[switch]$NoOutputLog)
  $script:capturedCreateDatabase=[ordered]@{file=$File;arguments=@($Arguments);label=$Label}
  return @()
}
function global:Invoke-LocalQuery {
  param([string]$Database,[string]$Sql,[string]$Label)
  $script:capturedBootstrapSql=$Sql
  return ''
}
New-LocalDatabase -Database 'managed_owner_fixture'
if($null -eq $script:capturedBootstrapSql -or $script:capturedCreateDatabase.arguments[-1] -cne 'managed_owner_fixture'){throw 'Disposable database bootstrap behavior was not captured.'}
$selectedRestoreOwners=@('postgres','supabase_admin','supabase_auth_admin','supabase_storage_admin')
foreach($owner in @($selectedRestoreOwners|Where-Object{$_ -ne 'postgres'})){
  $exactOwnerBootstrap="if not exists (select 1 from pg_roles where rolname = '$owner') then create role $owner nologin; end if;"
  if(-not $script:capturedBootstrapSql.Contains($exactOwnerBootstrap)){throw "Disposable bootstrap does not create selected archive owner as NOLOGIN: $owner"}
}
foreach($owner in $selectedRestoreOwners){if($script:capturedBootstrapSql -match "(?im)create\s+role\s+$([regex]::Escape($owner))\s+login\b"){throw "Disposable bootstrap grants LOGIN to selected archive owner: $owner"}}

Import-RunnerFunction Get-SequenceCheckSql
$sequenceRoot=Join-Path ([IO.Path]::GetTempPath()) ('task4-sequence-'+[Guid]::NewGuid().ToString('N'));$sequenceData=Join-Path $sequenceRoot 'data';$sequenceLog=Join-Path $sequenceRoot 'postgres.log'
$listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0);$listener.Start();$sequencePort=([Net.IPEndPoint]$listener.LocalEndpoint).Port;$listener.Stop();New-Item -ItemType Directory -Path $sequenceRoot|Out-Null
function Invoke-SequencePgCtl([string[]]$Arguments){$quoted=@($Arguments|ForEach-Object{if($_ -match '[\s"]'){'"'+$_.Replace('"','\"')+'"'}else{$_}})-join ' ';$process=Start-Process -FilePath (Join-Path $postgresBin 'pg_ctl.exe') -ArgumentList $quoted -PassThru -WindowStyle Hidden;if(-not $process.WaitForExit(30000)){$process.Kill();throw 'Sequence test pg_ctl timed out.'};if($process.ExitCode -ne 0){throw 'Sequence test pg_ctl failed.'}}
try{
  & (Join-Path $postgresBin 'initdb.exe') --pgdata $sequenceData --username postgres --auth trust --encoding UTF8 --no-locale --no-sync *> $null;if($LASTEXITCODE -ne 0){throw 'Sequence test initdb failed.'}
  Invoke-SequencePgCtl @('--pgdata',$sequenceData,'--log',$sequenceLog,'--options',"-h 127.0.0.1 -p $sequencePort",'--wait','start')
  & (Join-Path $postgresBin 'createdb.exe') --host 127.0.0.1 --port $sequencePort --username postgres sequence_test *> $null;if($LASTEXITCODE -ne 0){throw 'Sequence test createdb failed.'}
  $bootstrapPath=Join-Path $sequenceRoot 'disposable-bootstrap.sql'
  [IO.File]::WriteAllText($bootstrapPath,$script:capturedBootstrapSql,[Text.UTF8Encoding]::new($false))
  & (Join-Path $postgresBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --file $bootstrapPath *> $null;if($LASTEXITCODE -ne 0){throw 'Disposable managed-owner bootstrap failed against PostgreSQL.'}
  $managedOwnerState=@(& (Join-Path $postgresBin 'psql.exe') -X -A -t -q -v ON_ERROR_STOP=1 --host 127.0.0.1 --port $sequencePort --username postgres --dbname sequence_test --command "select rolname||'|'||rolcanlogin::text from pg_roles where rolname in ('supabase_admin','supabase_auth_admin','supabase_storage_admin') order by rolname;")
  if($LASTEXITCODE -ne 0){throw 'Disposable managed-owner role query failed.'}
  Assert-EqualJson -Expected @('supabase_admin|false','supabase_auth_admin|false','supabase_storage_admin|false') -Actual @($managedOwnerState|ForEach-Object{$_.Trim()}|Where-Object{$_}) -Label 'Disposable PostgreSQL bootstrap did not create the exact selected archive owners as NOLOGIN.'
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
