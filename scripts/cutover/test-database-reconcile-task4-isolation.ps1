$ErrorActionPreference = 'Stop'

$runnerPath = Join-Path $PSScriptRoot 'database-reconcile.ps1'
$runner = Get-Content -LiteralPath $runnerPath -Raw
$lowerRunner = $runner.ToLowerInvariant()
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($runnerPath,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count -ne 0){throw 'Task 4 runner has PowerShell parse errors.'}

function Import-RunnerFunction {
  param([Parameter(Mandatory)][string]$Name)
  $definition=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name},$true)
  if(-not $definition){throw "Task 4 isolation contract function is missing: $Name"}
  $globalDefinition=[regex]::Replace($definition.Extent.Text,('^function\s+'+[regex]::Escape($Name)),('function global:'+$Name),1)
  Invoke-Expression $globalDefinition
}

function Get-RunnerFunctionText {
  param([Parameter(Mandatory)][string]$Name)
  $definition=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name},$true)
  if(-not $definition){throw "Task 4 isolation phase function is missing: $Name"}
  return $definition.Extent.Text.ToLowerInvariant()
}

function Assert-Rejected {
  param([Parameter(Mandatory)][scriptblock]$Action,[Parameter(Mandatory)][string]$Label,[string]$Message)
  $actual=$null
  try{& $Action}catch{$actual=$_.Exception.Message}
  if($null -eq $actual){throw $Label}
  if(-not [string]::IsNullOrWhiteSpace($Message) -and $actual -cne $Message){throw "$Label Expected '$Message'; received '$actual'."}
}

function Assert-EqualJson {
  param([Parameter(Mandatory)]$Expected,[Parameter(Mandatory)]$Actual,[Parameter(Mandatory)][string]$Label)
  $expectedJson=ConvertTo-Json -InputObject $Expected -Depth 100 -Compress
  $actualJson=ConvertTo-Json -InputObject $Actual -Depth 100 -Compress
  if($expectedJson -cne $actualJson){throw "$Label Expected $expectedJson; received $actualJson."}
}

function Copy-JsonValue {
  param([Parameter(Mandatory)]$Value)
  return (ConvertTo-Json -InputObject $Value -Depth 100 | ConvertFrom-Json)
}

function Update-IsolationSnapshotDigests {
  param([Parameter(Mandatory)]$Snapshot)
  $storageForHash=[ordered]@{
    buckets=$Snapshot.storage.buckets;objects=$Snapshot.storage.objects
    bucketConfigurationSha256=$Snapshot.storage.bucketConfigurationSha256
    preexistingBucketConfigurationSha256=$Snapshot.storage.preexistingBucketConfigurationSha256
    websiteMediaBucket=$Snapshot.storage.websiteMediaBucket
    objectMetadataSha256=$Snapshot.storage.objectMetadataSha256
    storageMigrationRows=$Snapshot.storage.storageMigrationRows
    storageMigrationsSha256=$Snapshot.storage.storageMigrationsSha256
  }
  $Snapshot.storage.stateSha256=Get-JsonSha256 -Value $storageForHash
  $Snapshot.publicSequenceIdentitiesSha256=Get-JsonSha256 -Value @($Snapshot.publicSequenceIdentities)
  $snapshotForHash=$Snapshot|ConvertTo-Json -Depth 100|ConvertFrom-Json
  [void]$snapshotForHash.PSObject.Properties.Remove('snapshotSha256')
  $Snapshot.snapshotSha256=Get-JsonSha256 -Value $snapshotForHash
  return $Snapshot
}

function Set-Utf8File {
  param([Parameter(Mandatory)][string]$Path,[Parameter(Mandatory)][AllowEmptyString()][string]$Text)
  [IO.File]::WriteAllText($Path,$Text,[Text.UTF8Encoding]::new($false))
}

foreach($name in @(
  'Get-NormalizedPath',
  'Assert-NotReparsePoint',
  'Assert-NoReparsePointInPath',
  'Get-StringSha256',
  'Get-JsonSha256',
  'Get-Task4BytesSha256',
  'Get-Task4BaselineMigrationFiles',
  'Get-Task4IsolationContractRunnerSha256',
  'Get-Task4ByteOccurrenceCount',
  'Get-Task4HtmlAttributeValue',
  'ConvertTo-Task4SameOriginJavascriptUri',
  'Get-Task4LiveJavascriptUris',
  'Get-Task4JavascriptDependencyUris',
  'Assert-Task4HttpsResponse',
  'Get-Task4LiveFrontendSnapshotOnce',
  'Get-Task4LiveFrontendSnapshot',
  'Get-Task4IsolationTargetSnapshotOnce',
  'Get-Task4IsolationTargetSnapshot',
  'Assert-Task4IsolationExactProperties',
  'Assert-Task4IsolationSha256',
  'Assert-Task4IsolationInteger',
  'Assert-Task4IsolationTargetBaseline',
  'Assert-PostMigrationTargetState',
  'Assert-Task4IsolationSnapshotIntegrity',
  'Assert-Task4WebsiteMediaBucket',
  'Assert-Task4StandaloneSequenceShape',
  'Assert-Task4IsolationPostMigrationState',
  'Get-Task4StandaloneSequenceSpecifications',
  'Assert-Task4IsolationPostImportState',
  'New-Task4StagingIsolationEvidence',
  'Assert-Task4StagingIsolationEvidenceDocument',
  'Assert-Task4StagingIsolationEvidence',
  'Assert-Task4MigrationPushEvidenceShape',
  'Assert-NoTask4Quarantine',
  'New-Task4Quarantine',
  'Assert-Task4Quarantine',
  'Complete-Task4Quarantine'
)){Import-RunnerFunction $name}

$global:ExpectedRef='nhjbqdiyptjqherdfbqk'
$global:LiveSourceRef='ncysmppzfjtiekfnomdv'
$global:LiveFrontendUrl='https://klinikawfa.com/'
$global:Task4IsolationEvidenceName='task4-staging-isolation-evidence.json'
$global:Task4QuarantineName='task4-target-quarantine.json'
$global:Task4PushIsolationMaxAgeMinutes=15
$global:Task4ImportPushEvidenceMaxAgeHours=24
$global:Task4RunnerPath=$runnerPath
$global:Task4BaselineStorageBuckets=6
$global:Task4BaselineStorageObjects=0
$global:Task4BaselineStorageBucketConfigurationSha256='7CC19FC8A7567582D947EDA8CA6BAB6FC1D8961713AEE85099F639347B2540D5'
$global:Task4BaselineStorageObjectMetadataSha256='4F53CDA18C2BAA0C0354BB5F9A3ECBE5ED12AB4D8E11BA873C2F11161202B945'
$global:Task4BaselineStorageMigrationRows=61
$global:Task4BaselineStorageMigrationsSha256='3090C773F9B3823737BA83A66D5B5D3DA75A5BC62CE56EA891CCF5E5489792DD'

# The isolation contract digest must survive only the two expected post-Push pin edits.
$runnerContractRoot=Join-Path ([IO.Path]::GetTempPath()) ('task4-isolation-runner-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runnerContractRoot | Out-Null
try{
  $basePath=Join-Path $runnerContractRoot 'base.ps1'
  $pinnedPath=Join-Path $runnerContractRoot 'pinned.ps1'
  $changedPath=Join-Path $runnerContractRoot 'changed.ps1'
  $duplicatePath=Join-Path $runnerContractRoot 'duplicate.ps1'
  Set-Utf8File -Path $basePath -Text $runner
  $baseDigest=Get-Task4IsolationContractRunnerSha256 -Path $basePath
  if($baseDigest -cnotmatch '^[A-F0-9]{64}$'){throw 'Isolation runner contract did not return an uppercase SHA-256 digest.'}
  $pinned=$runner
  $pinned=[regex]::Replace($pinned,"(?m)^\`$Task4MigrationPushEvidenceSha256\s*=\s*'[^'\r\n]*'\s*$",("`$Task4MigrationPushEvidenceSha256 = '"+('A'*64)+"'"))
  $pinned=[regex]::Replace($pinned,"(?m)^\`$Task4MigrationPushProducerRunnerSha256\s*=\s*'[^'\r\n]*'\s*$",("`$Task4MigrationPushProducerRunnerSha256 = '"+('B'*64)+"'"))
  Set-Utf8File -Path $pinnedPath -Text $pinned
  if((Get-Task4IsolationContractRunnerSha256 -Path $pinnedPath) -cne $baseDigest){throw 'Isolation runner digest changes when only the two reviewed Push pin literals change.'}
  Set-Utf8File -Path $changedPath -Text ($runner+"`n# unrelated contract change")
  if((Get-Task4IsolationContractRunnerSha256 -Path $changedPath) -ceq $baseDigest){throw 'Isolation runner digest ignores a non-pin runner change.'}
  Set-Utf8File -Path $duplicatePath -Text ($runner+"`n`$Task4MigrationPushEvidenceSha256 = ''")
  Assert-Rejected -Label 'Isolation runner digest accepted a duplicate mutable pin assignment.' -Action {[void](Get-Task4IsolationContractRunnerSha256 -Path $duplicatePath)}
}finally{if(Test-Path -LiteralPath $runnerContractRoot){Remove-Item -LiteralPath $runnerContractRoot -Recurse -Force}}

# Byte counting is ordinal and does not depend on text decoding or regex semantics.
$sourceBytes=[Text.Encoding]::UTF8.GetBytes("x$global:LiveSourceRef-y-$global:LiveSourceRef")
if((Get-Task4ByteOccurrenceCount -Bytes $sourceBytes -AsciiText $global:LiveSourceRef) -ne 2){throw 'Live reference byte counting is not exact.'}
if((Get-Task4ByteOccurrenceCount -Bytes $sourceBytes -AsciiText $global:ExpectedRef) -ne 0){throw 'Live reference byte counting reported a target ref that is absent.'}

$script:liveDocuments=[ordered]@{
  'https://klinikawfa.com/'=@{
    contentType='text/html; charset=utf-8'
    body='<!doctype html><html><head><link rel="modulepreload" href="/assets/chunk.js"></head><body><script type="module" src="/assets/app.js"></script></body></html>'
  }
  'https://klinikawfa.com/assets/app.js'=@{
    contentType='application/javascript'
    body=('const project="'+$global:LiveSourceRef+'"; import "nested.js";')
  }
  'https://klinikawfa.com/assets/chunk.js'=@{contentType='application/javascript';body='export const chunk=true;'}
  'https://klinikawfa.com/assets/nested.js'=@{contentType='text/javascript';body='export*from"deep.js";'}
  'https://klinikawfa.com/assets/deep.js'=@{contentType='text/javascript';body='export const deep=true;'}
}
$script:liveFetchCounts=@{}
$script:liveResponseMutation=$null
function global:Invoke-Task4HttpsGetBytes {
  param([Parameter(Mandatory)][Uri]$Uri)
  $url=$Uri.AbsoluteUri
  if(-not $script:liveDocuments.Contains($url)){throw "Unexpected deterministic live fixture URL: $url"}
  if(-not $script:liveFetchCounts.ContainsKey($url)){$script:liveFetchCounts[$url]=0}
  $script:liveFetchCounts[$url]++
  $document=$script:liveDocuments[$url]
  $body=[string]$document.body
  $statusCode=200
  $finalUrl=$url
  if($null -ne $script:liveResponseMutation){
    $mutation=& $script:liveResponseMutation $url $script:liveFetchCounts[$url] $body
    if($null -ne $mutation){
      if($null -ne $mutation.body){$body=[string]$mutation.body}
      if($null -ne $mutation.statusCode){$statusCode=[int]$mutation.statusCode}
      if($null -ne $mutation.finalUrl){$finalUrl=[string]$mutation.finalUrl}
    }
  }
  return [pscustomobject]@{
    requestedUrl=$url
    finalUrl=$finalUrl
    statusCode=$statusCode
    contentType=[string]$document.contentType
    bytes=[Text.Encoding]::UTF8.GetBytes($body)
  }
}

$htmlBytes=[Text.Encoding]::UTF8.GetBytes($script:liveDocuments['https://klinikawfa.com/'].body)
$javascriptUris=@(Get-Task4LiveJavascriptUris -HtmlBytes $htmlBytes -RootUrl $global:LiveFrontendUrl)
Assert-EqualJson -Expected @('https://klinikawfa.com/assets/app.js','https://klinikawfa.com/assets/chunk.js') -Actual @($javascriptUris|ForEach-Object{$_.AbsoluteUri}) -Label 'Initial exact same-origin JavaScript discovery changed.'

$liveSnapshot=Get-Task4LiveFrontendSnapshot -RootUrl $global:LiveFrontendUrl -SourceRef $global:LiveSourceRef -TargetRef $global:ExpectedRef
if($liveSnapshot.sourceRefOccurrences -ne 1 -or $liveSnapshot.targetRefOccurrences -ne 0){throw 'Stable live snapshot does not prove source-present/target-absent isolation.'}
Assert-EqualJson -Expected @(
  'https://klinikawfa.com/assets/app.js',
  'https://klinikawfa.com/assets/chunk.js',
  'https://klinikawfa.com/assets/deep.js',
  'https://klinikawfa.com/assets/nested.js'
) -Actual @($liveSnapshot.javascriptAssets|ForEach-Object{$_.url}) -Label 'Recursive live JavaScript asset set changed.'
if([string]$liveSnapshot.snapshotSha256 -cnotmatch '^[A-F0-9]{64}$'){throw 'Live frontend snapshot lacks a canonical digest.'}
foreach($url in @($global:LiveFrontendUrl)+@($liveSnapshot.javascriptAssets|ForEach-Object{$_.url})){
  if($script:liveFetchCounts[$url] -lt 2){throw "Live snapshot did not bookend/re-fetch deterministic asset bytes: $url"}
}

$script:liveFetchCounts=@{}
$script:liveResponseMutation={param($url,$count,$body)if($url -eq 'https://klinikawfa.com/assets/app.js' -and $count -gt 1){return [pscustomobject]@{body=$body+' changed'}}}
Assert-Rejected -Label 'Live snapshot accepted an asset that changed during observation.' -Action {[void](Get-Task4LiveFrontendSnapshot -RootUrl $global:LiveFrontendUrl -SourceRef $global:LiveSourceRef -TargetRef $global:ExpectedRef)}
$script:liveResponseMutation={param($url,$count,$body)if($url -eq $global:LiveFrontendUrl){return [pscustomobject]@{statusCode=302;finalUrl='https://www.klinikawfa.com/'}}}
Assert-Rejected -Label 'Live snapshot accepted a redirect or host change.' -Action {[void](Get-Task4LiveFrontendSnapshot -RootUrl $global:LiveFrontendUrl -SourceRef $global:LiveSourceRef -TargetRef $global:ExpectedRef)}
$script:liveResponseMutation=$null
$originalAppBody=$script:liveDocuments['https://klinikawfa.com/assets/app.js'].body
try{
  $script:liveDocuments['https://klinikawfa.com/assets/app.js'].body='const noProjectRef=true; import "./nested.js";'
  $script:liveFetchCounts=@{}
  Assert-Rejected -Label 'Live snapshot accepted a bundle with no source project ref.' -Action {[void](Get-Task4LiveFrontendSnapshot -RootUrl $global:LiveFrontendUrl -SourceRef $global:LiveSourceRef -TargetRef $global:ExpectedRef)}
  $script:liveDocuments['https://klinikawfa.com/assets/app.js'].body=('const source="'+$global:LiveSourceRef+'",target="'+$global:ExpectedRef+'"; import "./nested.js";')
  $script:liveFetchCounts=@{}
  Assert-Rejected -Label 'Live snapshot accepted a bundle containing the target project ref.' -Action {[void](Get-Task4LiveFrontendSnapshot -RootUrl $global:LiveFrontendUrl -SourceRef $global:LiveSourceRef -TargetRef $global:ExpectedRef)}
}finally{$script:liveDocuments['https://klinikawfa.com/assets/app.js'].body=$originalAppBody;$script:liveFetchCounts=@{}}

$baselineVersions=@(Get-Task4BaselineMigrationFiles|ForEach-Object{$_.Substring(0,14)})
$baselineInventory=[ordered]@{
  projectRef=$global:ExpectedRef
  publicTables=93
  authUsers=0
  authIdentities=0
  migrationRows=153
  migrationIdentities=$baselineVersions
  migrationIdentitiesSha256=Get-StringSha256 -Value ($baselineVersions -join "`n")
  schemaSha256='A01DD4E5B0EB41B6DC67B5F43D9A6548EFFC20C8A94DF511CA66E8D53E7DAAC1'
}
$sequenceStates=@(
  [ordered]@{identity='public.client_invoice_seq';lastValue=1L;isCalled=$false;startValue=1L;minValue=1L;maxValue=9223372036854775807L;incrementBy=1L;cycle=$false;cacheSize=1L;ownedBy=$null},
  [ordered]@{identity='public.patient_reg_no_seq';lastValue=9L;isCalled=$true;startValue=1L;minValue=1L;maxValue=9223372036854775807L;incrementBy=1L;cycle=$false;cacheSize=1L;ownedBy=$null},
  [ordered]@{identity='public.queue_number_seq';lastValue=1012L;isCalled=$true;startValue=1001L;minValue=1L;maxValue=9223372036854775807L;incrementBy=1L;cycle=$false;cacheSize=1L;ownedBy=$null}
)
$storageState=[ordered]@{
  buckets=$global:Task4BaselineStorageBuckets
  objects=$global:Task4BaselineStorageObjects
  bucketConfigurationSha256=$global:Task4BaselineStorageBucketConfigurationSha256
  preexistingBucketConfigurationSha256=$global:Task4BaselineStorageBucketConfigurationSha256
  websiteMediaBucket=$null
  objectMetadataSha256=$global:Task4BaselineStorageObjectMetadataSha256
  storageMigrationRows=$global:Task4BaselineStorageMigrationRows
  storageMigrationsSha256=$global:Task4BaselineStorageMigrationsSha256
}
$storageState['stateSha256']=Get-JsonSha256 -Value $storageState
$targetObservation=[ordered]@{
  projectRef=$global:ExpectedRef
  publicTables=93
  authUsers=0
  authIdentities=0
  authSessions=0
  authRefreshTokens=0
  authOneTimeTokens=0
  migrationRows=153
  migrationIdentities=$baselineVersions
  migrationIdentitiesSha256=$baselineInventory.migrationIdentitiesSha256
  schemaSha256=$baselineInventory.schemaSha256
  extendedSchemaSha256='1B4E08D71B3FAE4824A90F0A361826638B2F2EE2EFABEA360BF157BDEB931393'
  storage=$storageState
  publicSequenceIdentities=@($sequenceStates.identity)
  publicSequenceIdentitiesSha256=Get-JsonSha256 -Value @($sequenceStates.identity)
  standaloneSequences=$sequenceStates
}
$targetManagedObservation=[ordered]@{
  authSessions=$targetObservation.authSessions
  authRefreshTokens=$targetObservation.authRefreshTokens
  authOneTimeTokens=$targetObservation.authOneTimeTokens
  storage=[ordered]@{
    buckets=$targetObservation.storage.buckets
    objects=$targetObservation.storage.objects
    bucketConfigurationSha256=$targetObservation.storage.bucketConfigurationSha256
    preexistingBucketConfigurationSha256=$targetObservation.storage.preexistingBucketConfigurationSha256
    websiteMediaBucket=$targetObservation.storage.websiteMediaBucket
    objectMetadataSha256=$targetObservation.storage.objectMetadataSha256
    storageMigrationRows=$targetObservation.storage.storageMigrationRows
    storageMigrationsSha256=$targetObservation.storage.storageMigrationsSha256
  }
  publicSequenceIdentities=$targetObservation.publicSequenceIdentities
  standaloneSequences=$targetObservation.standaloneSequences
}
$script:targetObservationJson=ConvertTo-Json -InputObject $targetManagedObservation -Depth 100 -Compress
$script:targetObservationCalls=0
$script:targetObservationMutation=$null
$script:targetObservationSql=$null
function global:Invoke-TargetQueryWithoutOutputLog {
  param([Parameter(Mandatory)][string]$Sql,[Parameter(Mandatory)][string]$Label)
  $script:targetObservationSql=$Sql
  $script:targetObservationCalls++
  $value=$script:targetObservationJson
  if($null -ne $script:targetObservationMutation){$value=& $script:targetObservationMutation $script:targetObservationCalls $value}
  return $value
}
function global:Get-TargetInventory {
  param([switch]$IncludeTask4Contract)
  $value=Copy-JsonValue -Value $baselineInventory
  if($IncludeTask4Contract){$value|Add-Member -MemberType NoteProperty -Name extendedSchemaSha256 -Value $targetObservation.extendedSchemaSha256}
  return $value
}

$actualTarget=Get-Task4IsolationTargetSnapshot
if($script:targetObservationCalls -lt 2){throw 'Target isolation snapshot was not observed twice for stability.'}
foreach($marker in @('auth.sessions','auth.refresh_tokens','auth.one_time_tokens','storage.buckets','storage.objects','storage.migrations','client_invoice_seq','patient_reg_no_seq','queue_number_seq')){
  if($script:targetObservationSql -notmatch [regex]::Escape($marker)){throw "Target isolation query is missing managed-state marker: $marker"}
}
if([string]$actualTarget.snapshotSha256 -cnotmatch '^[A-F0-9]{64}$'){throw 'Target isolation snapshot lacks a canonical digest.'}
[void](Assert-Task4IsolationTargetBaseline -Snapshot $actualTarget -VerifiedBaseline $baselineInventory -ExpectedExtendedSchemaSha256 $targetObservation.extendedSchemaSha256)

$script:targetObservationCalls=0
$script:targetObservationMutation={param($count,$json)if($count -eq 2){$changed=$json|ConvertFrom-Json;$changed.storage.objects=1;return ConvertTo-Json -InputObject $changed -Depth 100 -Compress};return $json}
Assert-Rejected -Label 'Target isolation snapshot accepted a state change between its two observations.' -Action {[void](Get-Task4IsolationTargetSnapshot)}
$script:targetObservationMutation=$null
foreach($mutation in @('publicTables','sessions','refreshTokens','oneTimeTokens','storage','storageCount','sequence','sequenceCalled','sequenceOrder','extraSequence')){
  $changed=Copy-JsonValue -Value $actualTarget
  switch($mutation){
    'publicTables'{$changed.publicTables=94}
    'sessions'{$changed.authSessions=1}
    'refreshTokens'{$changed.authRefreshTokens=1}
    'oneTimeTokens'{$changed.authOneTimeTokens=1}
    'storage'{$changed.storage.bucketConfigurationSha256=('F'*64)}
    'storageCount'{$changed.storage.buckets=7}
    'sequence'{$changed.standaloneSequences[0].incrementBy=2}
    'sequenceCalled'{$changed.standaloneSequences[1].isCalled=$false}
    'sequenceOrder'{$temporary=$changed.standaloneSequences[0];$changed.standaloneSequences[0]=$changed.standaloneSequences[1];$changed.standaloneSequences[1]=$temporary}
    'extraSequence'{$changed.publicSequenceIdentities+=@('public.unapproved_seq')}
  }
  [void](Update-IsolationSnapshotDigests -Snapshot $changed)
  Assert-Rejected -Label "Target isolation baseline accepted mutation: $mutation" -Action {[void](Assert-Task4IsolationTargetBaseline -Snapshot $changed -VerifiedBaseline $baselineInventory -ExpectedExtendedSchemaSha256 $targetObservation.extendedSchemaSha256)}
}

$postMigration=Copy-JsonValue -Value $actualTarget
$postMigration.publicTables=102
$postMigration.storage.buckets=7
$postMigration.storage.bucketConfigurationSha256=('D'*64)
$postMigration.storage.websiteMediaBucket=[pscustomobject][ordered]@{
  id='website-media';name='website-media';owner=$null;ownerId=$null;public=$true;avifAutodetection=$false
  fileSizeLimit=26214400L;allowedMimeTypes=@('image/jpeg','image/png','image/webp','video/mp4','video/webm');type='STANDARD'
}
[void](Update-IsolationSnapshotDigests -Snapshot $postMigration)
$expectedPost=[ordered]@{
  projectRef=$postMigration.projectRef;publicTables=$postMigration.publicTables;authUsers=$postMigration.authUsers;authIdentities=$postMigration.authIdentities
  migrationRows=$postMigration.migrationRows;migrationIdentities=@($postMigration.migrationIdentities);migrationIdentitiesSha256=$postMigration.migrationIdentitiesSha256
  schemaSha256=$postMigration.schemaSha256;extendedSchemaSha256=$postMigration.extendedSchemaSha256
}
[void](Assert-Task4IsolationPostMigrationState -Snapshot $postMigration -PreWriteSnapshot $actualTarget -ExpectedPostState $expectedPost)
foreach($mutation in @('preexistingStorage','websiteMedia','sequenceState','oneTimeToken')){
  $changed=Copy-JsonValue -Value $postMigration
  switch($mutation){
    'preexistingStorage'{$changed.storage.preexistingBucketConfigurationSha256=('E'*64)}
    'websiteMedia'{$changed.storage.websiteMediaBucket.public=$false}
    'sequenceState'{$changed.standaloneSequences[0].lastValue=2}
    'oneTimeToken'{$changed.authOneTimeTokens=1}
  }
  [void](Update-IsolationSnapshotDigests -Snapshot $changed)
  Assert-Rejected -Label "Post-migration isolation accepted mutation: $mutation" -Action {[void](Assert-Task4IsolationPostMigrationState -Snapshot $changed -PreWriteSnapshot $actualTarget -ExpectedPostState $expectedPost)}
}

$postImport=Copy-JsonValue -Value $postMigration
$postImport.authUsers=11
$postImport.authIdentities=11
$postImport.standaloneSequences=@(
  [pscustomobject][ordered]@{identity='public.client_invoice_seq';lastValue=2L;isCalled=$true;startValue=1L;minValue=1L;maxValue=9223372036854775807L;incrementBy=1L;cycle=$false;cacheSize=1L;ownedBy=$null},
  [pscustomobject][ordered]@{identity='public.patient_reg_no_seq';lastValue=117L;isCalled=$true;startValue=1L;minValue=1L;maxValue=9223372036854775807L;incrementBy=1L;cycle=$false;cacheSize=1L;ownedBy=$null},
  [pscustomobject][ordered]@{identity='public.queue_number_seq';lastValue=1148L;isCalled=$true;startValue=1001L;minValue=1L;maxValue=9223372036854775807L;incrementBy=1L;cycle=$false;cacheSize=1L;ownedBy=$null}
)
[void](Update-IsolationSnapshotDigests -Snapshot $postImport)
[void](Assert-Task4IsolationPostImportState -Snapshot $postImport -ExpectedStorage $postMigration.storage)
foreach($mutation in @('storage','sequenceValue','stringValue','stringBoolean','extraSequence','session')){
  $changed=Copy-JsonValue -Value $postImport
  switch($mutation){
    'storage'{$changed.storage.objectMetadataSha256=('C'*64)}
    'sequenceValue'{$changed.standaloneSequences[0].lastValue=3}
    'stringValue'{$changed.standaloneSequences[0].lastValue='2'}
    'stringBoolean'{$changed.standaloneSequences[0].isCalled='true'}
    'extraSequence'{$changed.publicSequenceIdentities+=@('public.unapproved_seq')}
    'session'{$changed.authSessions=1}
  }
  [void](Update-IsolationSnapshotDigests -Snapshot $changed)
  Assert-Rejected -Label "Post-import isolation accepted mutation: $mutation" -Action {[void](Assert-Task4IsolationPostImportState -Snapshot $changed -ExpectedStorage $postMigration.storage)}
}

$verifiedBackup=[ordered]@{
  manifestSha256=('5'*64)
  manifest=[ordered]@{targetBaseline=$baselineInventory;targetBaselineSha256=Get-JsonSha256 -Value $baselineInventory}
}
$now=[DateTimeOffset]::Parse('2026-07-22T08:00:00Z')
$runnerDigest=Get-Task4IsolationContractRunnerSha256 -Path $runnerPath
$evidence=New-Task4StagingIsolationEvidence -ObservedAtUtc $now -ContractRunnerSha256 $runnerDigest -VerifiedBackup $verifiedBackup -LiveFrontend $liveSnapshot -TargetPreWrite $actualTarget
$validated=Assert-Task4StagingIsolationEvidenceDocument -Document $evidence -NowUtc $now.AddMinutes(1) -ExpectedContractRunnerSha256 $runnerDigest -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $liveSnapshot -CurrentTargetPreWrite $actualTarget -Purpose Push
if($validated.status -cne 'isolated-staging-verified'){throw 'Fresh exact isolation evidence was not accepted.'}

$wrongType=Copy-JsonValue -Value $evidence
$wrongType.payload.formatVersion='1'
$wrongType.payloadSha256=Get-JsonSha256 -Value $wrongType.payload
Assert-Rejected -Label 'Isolation evidence accepted a string formatVersion.' -Action {[void](Assert-Task4StagingIsolationEvidenceDocument -Document $wrongType -NowUtc $now.AddMinutes(1) -ExpectedContractRunnerSha256 $runnerDigest -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $liveSnapshot -CurrentTargetPreWrite $actualTarget -Purpose Push)}
$extraField=Copy-JsonValue -Value $evidence
$extraField.payload|Add-Member -MemberType NoteProperty -Name unexpected -Value $true
$extraField.payloadSha256=Get-JsonSha256 -Value $extraField.payload
Assert-Rejected -Label 'Isolation evidence accepted an unexpected payload property.' -Action {[void](Assert-Task4StagingIsolationEvidenceDocument -Document $extraField -NowUtc $now.AddMinutes(1) -ExpectedContractRunnerSha256 $runnerDigest -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $liveSnapshot -CurrentTargetPreWrite $actualTarget -Purpose Push)}
$staleEvidence=New-Task4StagingIsolationEvidence -ObservedAtUtc $now.AddMinutes(-20) -ContractRunnerSha256 $runnerDigest -VerifiedBackup $verifiedBackup -LiveFrontend $liveSnapshot -TargetPreWrite $actualTarget
Assert-Rejected -Label 'Isolation evidence accepted a stale Push observation.' -Action {[void](Assert-Task4StagingIsolationEvidenceDocument -Document $staleEvidence -NowUtc $now -ExpectedContractRunnerSha256 $runnerDigest -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $liveSnapshot -CurrentTargetPreWrite $actualTarget -Purpose Push)}
Assert-Rejected -Label 'Isolation evidence accepted a changed runner contract.' -Action {[void](Assert-Task4StagingIsolationEvidenceDocument -Document $evidence -NowUtc $now.AddMinutes(1) -ExpectedContractRunnerSha256 ('F'*64) -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $liveSnapshot -CurrentTargetPreWrite $actualTarget -Purpose Push)}
$changedBaseline=Copy-JsonValue -Value $actualTarget;$changedBaseline.publicTables=94
Assert-Rejected -Label 'Isolation evidence accepted a changed target baseline.' -Action {[void](Assert-Task4StagingIsolationEvidenceDocument -Document $evidence -NowUtc $now.AddMinutes(1) -ExpectedContractRunnerSha256 $runnerDigest -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $liveSnapshot -CurrentTargetPreWrite $changedBaseline -Purpose Push)}
$changedStorage=Copy-JsonValue -Value $actualTarget;$changedStorage.storage.objects=1
Assert-Rejected -Label 'Isolation evidence accepted changed Storage metadata.' -Action {[void](Assert-Task4StagingIsolationEvidenceDocument -Document $evidence -NowUtc $now.AddMinutes(1) -ExpectedContractRunnerSha256 $runnerDigest -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $liveSnapshot -CurrentTargetPreWrite $changedStorage -Purpose Push)}
$changedLive=Copy-JsonValue -Value $liveSnapshot;$changedLive.javascriptAssets[0].sha256=('E'*64)
Assert-Rejected -Label 'Isolation evidence accepted changed live asset bytes.' -Action {[void](Assert-Task4StagingIsolationEvidenceDocument -Document $evidence -NowUtc $now.AddMinutes(1) -ExpectedContractRunnerSha256 $runnerDigest -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $changedLive -CurrentTargetPreWrite $actualTarget -Purpose Push)}

$pushPayload=[ordered]@{
  formatVersion=2;status='completed';completedAtUtc=$now.UtcDateTime.ToString('o');targetRef=$global:ExpectedRef
  cli=[ordered]@{version='2.109.1';sha256=('1'*64)};producerRunnerSha256=('2'*64)
  connection=[ordered]@{host='db.example.invalid';port=5432;username='postgres';database='postgres';sslMode='require';credentialTransport='PGPASSWORD'}
  preBaseline=[ordered]@{};preBaselineSha256=('3'*64);stagingIsolation=[ordered]@{};workdir=[ordered]@{}
  migrations=@([ordered]@{version='20260720111916'});migrationsSha256=('4'*64);listedPendingMigrations=@('migration.sql')
  dryRunTranscript=[ordered]@{};dryRunTranscriptSha256=('5'*64);pushTranscript=[ordered]@{};pushTranscriptSha256=('6'*64)
  postHistory=@([ordered]@{version='20260720111916'});postHistorySha256=('7'*64);postTargetState=[ordered]@{}
  postWriteIsolationState=[ordered]@{};postWriteIsolationStateSha256=('8'*64)
}
$pushDocument=[ordered]@{payload=$pushPayload;payloadSha256=Get-JsonSha256 -Value $pushPayload}
[void](Assert-Task4MigrationPushEvidenceShape -Document $pushDocument -NowUtc $now)
foreach($mutation in @('formatVersion','port','cliVersion','cliExtra','connectionString','status','targetRef','array','stale')){
  $changed=Copy-JsonValue -Value $pushDocument
  switch($mutation){
    'formatVersion'{$changed.payload.formatVersion='2'}
    'port'{$changed.payload.connection.port='5432'}
    'cliVersion'{$changed.payload.cli.version=21091}
    'cliExtra'{$changed.payload.cli|Add-Member -MemberType NoteProperty -Name unexpected -Value $true}
    'connectionString'{$changed.payload.connection.sslMode=1}
    'status'{$changed.payload.status=1}
    'targetRef'{$changed.payload.targetRef=1}
    'array'{$changed.payload.migrations='not-an-array'}
    'stale'{$changed.payload.completedAtUtc=$now.AddHours(-25).UtcDateTime.ToString('o')}
  }
  $changed.payloadSha256=Get-JsonSha256 -Value $changed.payload
  Assert-Rejected -Label "Push evidence shape accepted malformed field: $mutation" -Action {[void](Assert-Task4MigrationPushEvidenceShape -Document $changed -NowUtc $now)}
}
$pushEvidenceValidator=Get-RunnerFunctionText -Name 'Assert-Task4MigrationPushEvidence'
if(-not $pushEvidenceValidator.Contains('[text.utf8encoding]::new($false,$true).getstring') -or -not $pushEvidenceValidator.Contains('[io.file]::readallbytes')){throw 'Push evidence file is not decoded from strict UTF-8 bytes.'}
if(-not $pushEvidenceValidator.Contains('$evidencebytes = [io.file]::readallbytes') -or
   -not $pushEvidenceValidator.Contains('get-task4bytessha256 -bytes $evidencebytes') -or
   -not $pushEvidenceValidator.Contains('getstring($evidencebytes)') -or
   $pushEvidenceValidator.Contains('get-filehash -literalpath $evidencepath') -or
   [regex]::Matches($pushEvidenceValidator,'\[io\.file\]::readallbytes').Count -ne 1){
  throw 'Push evidence independent pin and strict JSON decode do not use one immutable byte buffer.'
}

$quarantineRoot=Join-Path ([IO.Path]::GetTempPath()) ('task4-quarantine-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $quarantineRoot | Out-Null
$global:ArtifactRoot=$quarantineRoot
$quarantineNow=[DateTimeOffset]::UtcNow
try{
  Assert-NoTask4Quarantine
  $active=New-Task4Quarantine -Phase Push -ContractRunnerSha256 $runnerDigest -IsolationEvidenceSha256 ('6'*64) -PreWriteObservationSha256 ('7'*64) -ExpectedTargetStateSha256 ('8'*64) -CreatedAtUtc $quarantineNow
  $quarantinePath=Join-Path $quarantineRoot $global:Task4QuarantineName
  if(-not (Test-Path -LiteralPath $quarantinePath -PathType Leaf)){throw 'Push quarantine was not durably created at the fixed protected path.'}
  $activePayload=Assert-Task4Quarantine -ExpectedPhase Push -ExpectedAttemptId $active.payload.attemptId -ExpectedDocument $active
  if($activePayload.status -cne 'active'){throw 'Fresh quarantine marker is not active.'}
  Assert-Rejected -Label 'An active quarantine did not block retry.' -Action {Assert-NoTask4Quarantine}
  Assert-Rejected -Label 'Atomic quarantine creation overwrote an existing marker.' -Action {[void](New-Task4Quarantine -Phase Push -ContractRunnerSha256 $runnerDigest -IsolationEvidenceSha256 ('6'*64) -PreWriteObservationSha256 ('7'*64) -ExpectedTargetStateSha256 ('8'*64) -CreatedAtUtc $quarantineNow)}

  # Simulated failure intentionally performs no cleanup: the fixed marker must survive.
  try{throw 'simulated persistent-phase failure'}catch{}
  if(-not (Test-Path -LiteralPath $quarantinePath -PathType Leaf)){throw 'Quarantine marker did not survive a simulated phase failure.'}
  Complete-Task4Quarantine -ExpectedPhase Push -ExpectedAttemptId $active.payload.attemptId -ExpectedDocument $active
  if(Test-Path -LiteralPath $quarantinePath){throw 'Completed quarantine marker was not removed after explicit success.'}

  $tampered=New-Task4Quarantine -Phase Import -ContractRunnerSha256 $runnerDigest -IsolationEvidenceSha256 ('9'*64) -PreWriteObservationSha256 ('A'*64) -ExpectedTargetStateSha256 ('B'*64) -CreatedAtUtc $quarantineNow
  $rewritten=Copy-JsonValue -Value $tampered
  $rewritten.payload.isolationEvidenceSha256=('C'*64)
  $rewritten.payloadSha256=Get-JsonSha256 -Value $rewritten.payload
  Set-Utf8File -Path $quarantinePath -Text (($rewritten|ConvertTo-Json -Depth 100)+"`n")
  Assert-Rejected -Label 'Self-consistently rewritten quarantine marker was accepted against its original binding.' -Action {[void](Assert-Task4Quarantine -ExpectedPhase Import -ExpectedAttemptId $tampered.payload.attemptId -ExpectedDocument $tampered)}
  Assert-Rejected -Label 'Self-consistently rewritten quarantine marker was removed as completed.' -Action {Complete-Task4Quarantine -ExpectedPhase Import -ExpectedAttemptId $tampered.payload.attemptId -ExpectedDocument $tampered}
  if(-not (Test-Path -LiteralPath $quarantinePath -PathType Leaf)){throw 'Tampered quarantine marker did not remain fail-closed.'}
}finally{if(Test-Path -LiteralPath $quarantineRoot){Remove-Item -LiteralPath $quarantineRoot -Recurse -Force}}

function Assert-InOrder {
  param([Parameter(Mandatory)][string]$Text,[Parameter(Mandatory)][string[]]$Markers,[Parameter(Mandatory)][string]$Label)
  $previous=-1
  foreach($marker in $Markers){
    $index=$Text.IndexOf($marker.ToLowerInvariant(),$previous+1,[StringComparison]::Ordinal)
    if($index -le $previous){throw "$Label is incomplete or reordered at $marker"}
    $previous=$index
  }
}

$verifyBlock=Get-RunnerFunctionText -Name 'Invoke-VerifyPhase'
Assert-InOrder -Text $verifyBlock -Label 'Verify isolation evidence chain' -Markers @(
  'Assert-Task4StagingIsolationEvidence',
  'Write-ProtectedJson',
  'Assert-Task4StagingIsolationEvidence'
)
if($verifyBlock.Contains('invoke-targetfile') -or $verifyBlock.Contains('invoke-task4pinnedclipush')){throw 'Verify isolation evidence path contains a persistent target write primitive.'}

$pushBlock=Get-RunnerFunctionText -Name 'Invoke-PushPhase'
Assert-InOrder -Text $pushBlock -Label 'Push isolation/quarantine chain' -Markers @(
  'Assert-Task4StagingIsolationEvidence',
  'New-Task4Quarantine',
  'Invoke-Task4PinnedCliPush',
  'Assert-Task4MigrationHistoryBindings',
  'Assert-Task4IsolationPostMigrationState',
  'Write-ProtectedJson',
  'Assert-Task4MigrationPushEvidence',
  'Complete-Task4Quarantine'
)

$importBlock=Get-RunnerFunctionText -Name 'Invoke-ImportPhase'
Assert-InOrder -Text $importBlock -Label 'Import isolation/quarantine chain' -Markers @(
  'Assert-Task4MigrationPushEvidence',
  'Assert-Task4StagingIsolationEvidence',
  'Assert-Task4IsolationPostMigrationState',
  'New-Task4Quarantine',
  'Invoke-TargetFile',
  'Assert-Task4PostImportResult',
  'Write-ProtectedJson',
  'Complete-Task4Quarantine'
)
if($pushBlock -match '(?is)catch\s*\{[^}]*complete-task4quarantine' -or $pushBlock -match '(?is)finally\s*\{[^}]*complete-task4quarantine' -or
   $importBlock -match '(?is)catch\s*\{[^}]*complete-task4quarantine' -or $importBlock -match '(?is)finally\s*\{[^}]*complete-task4quarantine'){
  throw 'A persistent phase clears quarantine from a failure/finally path.'
}

$pushWrapper=Get-RunnerFunctionText -Name 'Invoke-Task4PinnedCliPush'
$finalPushPattern='(?s)\$finalworkdir\s*=\s*assert-task4finalpushworkdir[^\r\n]*\r?\n\s*\$pushlog\s*=\s*@\(\s*&\s+\$supabasecli\s+@arguments\s+2>&1\s*\)'
if(-not [regex]::IsMatch($pushWrapper,$finalPushPattern)){throw 'Isolation changes broke the exact final-workdir/native-Push adjacency contract.'}

$httpBlock=Get-RunnerFunctionText -Name 'Invoke-Task4HttpsGetBytes'
$httpAssemblyLoad=$httpBlock.IndexOf('add-type -assemblyname system.net.http -erroraction stop',[StringComparison]::Ordinal)
$httpFirstTypeUse=$httpBlock.IndexOf('new-object net.http.httpclienthandler',[StringComparison]::Ordinal)
if($httpAssemblyLoad -lt 0 -or $httpFirstTypeUse -lt 0 -or $httpAssemblyLoad -ge $httpFirstTypeUse){throw 'Live GET helper does not explicitly load System.Net.Http before its first Net.Http type use.'}
if(-not $httpBlock.Contains('httpmethod]::get') -and -not $httpBlock.Contains('httpmethod.get')){throw 'Live isolation observation is not explicitly HTTP GET-only.'}
foreach($mutationPrimitive in @('postasync','putasync','deleteasync','patch','github','dns','deploy')){
  if($httpBlock.Contains($mutationPrimitive)){throw "Live isolation observer contains a frontend/network mutation primitive: $mutationPrimitive"}
}
$priorErrorActionPreference=$ErrorActionPreference
try{
  $ErrorActionPreference='Continue'
  $httpRuntimeOutput=@(& powershell.exe -NoProfile -NonInteractive -Command { Add-Type -AssemblyName System.Net.Http -ErrorAction Stop; $handler=New-Object Net.Http.HttpClientHandler; try { if($handler.GetType().FullName -cne 'System.Net.Http.HttpClientHandler'){throw 'wrong handler type'}; Write-Output 'System.Net.Http runtime contract passed' } finally { $handler.Dispose() } } 2>&1)
  $httpRuntimeExitCode=$LASTEXITCODE
}finally{$ErrorActionPreference=$priorErrorActionPreference}
if($httpRuntimeExitCode -ne 0 -or (@($httpRuntimeOutput|ForEach-Object{[string]$_}) -join "`n") -notmatch 'System.Net.Http runtime contract passed'){throw 'Windows PowerShell 5.1 could not load and instantiate the System.Net.Http handler contract without network access.'}
$phaseParameter=$ast.ParamBlock.Parameters|Where-Object{$_.Name.VariablePath.UserPath -eq 'Phase'}
if(-not $phaseParameter){throw 'Runner Phase parameter is missing.'}
$validateSet=$phaseParameter.Attributes|Where-Object{$_.TypeName.FullName -eq 'ValidateSet'}
$phaseNames=@($validateSet.PositionalArguments|ForEach-Object{$_.SafeGetValue()})
Assert-EqualJson -Expected @('Inventory','Backup','Rehearse','Push','PostMigration','Import','Verify','Rollback') -Actual $phaseNames -Label 'Isolation work added or removed a runner phase, including a forbidden frontend mutation phase.'

$rehearsalBindingBlock=Get-RunnerFunctionText -Name 'Get-CurrentRehearsalBinding'
if(-not $rehearsalBindingBlock.Contains('runnersha256 = get-task4isolationcontractrunnersha256') -or $rehearsalBindingBlock.Contains('get-filehash -literalpath $pscommandpath')){throw 'Current rehearsal binding is not normalized across only the two reviewed Push pin edits.'}

$topLevelIfs=@($ast.EndBlock.Statements|Where-Object{$_ -is [Management.Automation.Language.IfStatementAst]})
$quarantineGate=$topLevelIfs|Where-Object{$_.Extent.Text -match "(?i)^if\s*\(\`$Phase\s+-in\s+@\('Backup','Rehearse','Verify','Push','PostMigration','Import'\)\)"}|Select-Object -First 1
$firstInvalidation=$topLevelIfs|Where-Object{$_.Extent.Text -match "(?i)^if\s*\(\`$Phase\s+-eq\s+'Backup'\)"}|Select-Object -First 1
if($null -eq $quarantineGate -or $null -eq $firstInvalidation -or $quarantineGate.Extent.StartOffset -ge $firstInvalidation.Extent.StartOffset){throw 'Top-level quarantine gate does not run before every evidence invalidation.'}
foreach($phaseName in @('Verify','Push','PostMigration','Import')){
  foreach($statement in @($topLevelIfs|Where-Object{$_.Extent.Text -match ("(?i)^if\s*\(\`$Phase\s+-eq\s+'"+[regex]::Escape($phaseName)+"'")})){
    foreach($protectedName in @('$Task4IsolationEvidenceName','$Task4MigrationPushEvidenceName','$Task4TransitionManifestName','$ImportReportName','task4-migration-dry-run-transcript.log','task4-migration-push-transcript.log')){
      if($statement.Extent.Text.IndexOf($protectedName,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $statement.Extent.Text -match '(?i)Invalidate-'){throw "Persistent-chain phase eagerly destroys completed evidence before its gates: $phaseName / $protectedName"}
    }
  }
}
foreach($marker in @('Verify cannot replace isolation evidence after completed migration Push evidence exists','Completed migration Push evidence already exists','Completed Import evidence already exists')){
  if(-not $runner.Contains($marker)){throw "Completed persistent-chain evidence refusal is missing: $marker"}
}

$rollbackEntryText="if (`$Phase -eq 'Rollback') {"
$rollbackEntryIndex=$runner.IndexOf($rollbackEntryText,[StringComparison]::Ordinal)
if($rollbackEntryIndex -lt 0){throw 'Rollback has no unconditional entry-path refusal.'}
$rollbackPrefix=$runner.Substring(0,$rollbackEntryIndex)
if($rollbackPrefix -match '(?im)^\s*(?:Assert-ExactProtectedPath|Assert-NoReparsePointInPath|New-Item|Write-|Add-Content|Move-Item|Remove-Item|Invalidate-|Assert-RequiredTools|Import-ProtectedEnvironment|Invoke-Target|Invoke-External|Restore-)\b'){throw 'Rollback refusal occurs after a protected, target, tool, restore, or write action.'}
$rollbackArtifact=Join-Path ([IO.Path]::GetTempPath()) ('task4-rollback-entry-'+[Guid]::NewGuid().ToString('N'))
$priorErrorActionPreference=$ErrorActionPreference
try{
  $ErrorActionPreference='Continue'
  $rollbackOutput=@(& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runnerPath -Phase Rollback -ProtectedEnv (Join-Path $rollbackArtifact 'missing.env') -ArtifactRoot $rollbackArtifact 2>&1)
  $rollbackExitCode=$LASTEXITCODE
}finally{$ErrorActionPreference=$priorErrorActionPreference}
if($rollbackExitCode -eq 0 -or (Test-Path -LiteralPath $rollbackArtifact)){throw 'Rollback entry-path process did not refuse before creating a protected artifact path.'}
if((@($rollbackOutput|ForEach-Object{[string]$_}) -join "`n") -notmatch 'Rollback is unavailable before any protected artifact, environment, tool, target, or restore action'){throw 'Rollback entry-path process did not return the exact fail-closed refusal.'}

Write-Output 'Task 4 isolation focused contract passed'
