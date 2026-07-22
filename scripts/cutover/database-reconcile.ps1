param(
  [Parameter(Mandatory)]
  [ValidateSet('Inventory','Backup','Rehearse','Push','PostMigration','Import','Verify','Rollback')]
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
$BackupManifestName = 'target-before-cutover.manifest.json'
$ReportName = 'rehearsal-report.json'
$InventoryName = 'target-inventory.json'
$LoaderName = 'selective-data-loader.sql'
$HeldStaffLoaderName = 'staff-messages-loader.sql'
$AuthLoaderName = 'portable-auth-loader.sql'
$ImportReportName = 'task4-import-integrity-report.json'
$Task4TransitionManifestName = 'post-migration-transition-manifest.json'
$Task4ValidationEvidenceName = 'task4-rollback-validation-evidence.json'
$Task4DryRunEvidenceName = 'task4-readonly-dryrun-evidence.json'
$Task4MigrationPushEvidenceName = 'task4-migration-push-evidence.json'
$Task4MigrationPushEvidenceSha256 = ''
$Task4MigrationPushProducerRunnerSha256 = ''
$LiveSourceRef = 'ncysmppzfjtiekfnomdv'
$LiveFrontendUrl = 'https://klinikawfa.com/'
$Task4IsolationEvidenceName = 'task4-staging-isolation-evidence.json'
$Task4QuarantineName = 'task4-target-quarantine.json'
$Task4PushIsolationMaxAgeMinutes = 15
$Task4ImportPushEvidenceMaxAgeHours = 24
$Task4BaselineStorageBuckets = 6
$Task4BaselineStorageObjects = 0
$Task4BaselineStorageBucketConfigurationSha256 = '7CC19FC8A7567582D947EDA8CA6BAB6FC1D8961713AEE85099F639347B2540D5'
$Task4BaselineStorageObjectMetadataSha256 = '4F53CDA18C2BAA0C0354BB5F9A3ECBE5ED12AB4D8E11BA873C2F11161202B945'
$Task4BaselineStorageMigrationRows = 61
$Task4BaselineStorageMigrationsSha256 = '3090C773F9B3823737BA83A66D5B5D3DA75A5BC62CE56EA891CCF5E5489792DD'
$Task4RollbackRestoreEvidenceName = 'task4-rollback-restore-evidence.json'
$Task4RollbackRestoreEvidenceSha256 = ''
$Task4RollbackBackupBytes = 1070000L
$Task4RollbackBackupSha256 = '9080050ADC9D98FAF2E3B381F77717393DBBCDA9C0A7E68BBED83DDAFE4DF13E'
$Task4RollbackBackupManifestSha256 = '37885917F0239FAEBB9E86538562E6F6D5329DA06F3F505492D5C946F8C3A92C'
$Task4RollbackTargetBaselineSha256 = 'E8A0768E01CE84522BB0CADAB78B6AC01F9BD65FAB3360C992FB8EBAA67262B2'
$Task4RollbackExtendedCatalogSha256 = '1B4E08D71B3FAE4824A90F0A361826638B2F2EE2EFABEA360BF157BDEB931393'
$Task4RollbackTocSha256 = 'D1C944F8DA8378AE8DC523A9AD48083501DDFA65CFF90CF7F5E2B83456D5011C'
$Task4RollbackTocEntries = 1888
$Task4RollbackPgRestoreVersion = 'pg_restore (PostgreSQL) 17.10'
$Task4RollbackPgRestoreSha256 = '6ECDBC31B75E10D36F3FBA699EDDE4E1350B54AEB74430350CACE7334AA6C832'
$Task4SupabaseCliVersion = '2.109.1'
$Task4SupabaseCliSha256 = '22C0F28F013411C7A7B880116CD33636EDB955A64278914692EEA010BCC98DC7'
$Task4MigrationWorkdirDigest = '55C3967A81AA832509B923E1062CDAE34C55E38D076006E3E8156FDE3C91149D'
$Task4MigrationHistoryBindingSha256 = '6612F6D16FECB390A6EC3BE870AC82C04866CFACF2788C1619878B39657BA2F0'
$Task4ValidatedBaseHead = '3aa624512437203d6ef5688ede4799ac5eb022d4'
$LegacyCompositeRehearsalRunnerSha256 = '2E18A5193C223B4E2D095624FD41184E711B47399E213C5CDC0C31074C03FF26'
$Task4ValidationEvidenceSha256 = '29E6CD5499FBF52E46D68DDFAA456514587FDE32690A7879197AED4F11D669A3'
$Task4DryRunEvidenceSha256 = '39EA9CEBCD521D6AA178DC10716FCE06CDF4269EE06D2A6BE9AB8A3D5C6BD619'
$LegacyCompositeRehearsalReportSha256 = '9AE7693B8B06E1CECDD6AABEA91A4D399E204184175028C3BF6EBBFCE59297CC'
$LegacyCompositeRehearsalMigrations = @(
  [ordered]@{ name='20260721174422_preserve_source_cutover_fields.sql'; sha256='ECEBAE8DFB0CED17B2C0A1332E627846844C439DB945A5C705C95B53E3611217' },
  [ordered]@{ name='20260721162256_restore_staff_messages.sql'; sha256='4E0C335C855C1338EDAB28429B7377DAC7768D796666B3FF315FF1B4A55C9FB0' }
)
$RepositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Task4RunnerPath = $PSCommandPath
$Task4PostBackupObjects = @(
  'public.staff_messages',
  'public.website_content_drafts',
  'public.website_content_versions',
  'public.website_navigation_drafts',
  'public.website_navigation_items',
  'public.website_page_drafts',
  'public.website_pages',
  'public.website_review_presentations',
  'public.website_tracking_settings'
)
$StaffMessagesMigration = Join-Path $RepositoryRoot 'supabase\migrations\20260721162256_restore_staff_messages.sql'
$CompatibilityMigration = Join-Path $RepositoryRoot 'supabase\migrations\20260721174422_preserve_source_cutover_fields.sql'
$Task4MigrationSpecifications = @(
  [ordered]@{ version='20260720111916'; file='20260720111916_add_website_editor_role.sql'; sha256='87F0EEA795BC99CE1CBA8BB799B6E25D7C3A313A54E309425FC47165B5125618'; name='add_website_editor_role'; statementCount=1; statementsSha256='4D4725CED6EBE42B31FB282909DA9FBD2A6E697D4770C04DE4479B85FC49B985' },
  [ordered]@{ version='20260720115031'; file='20260720115031_create_website_cms_foundation.sql'; sha256='A86DA7A8824CCF5BEF9033D9DC525C37D50AE6281AF0C060ED031995459E5D30'; name='create_website_cms_foundation'; statementCount=91; statementsSha256='B2B9C9017EF44E8DD95E82A0666DC11494A1BCF91D9F6250E123FCE927B5E8F7' },
  [ordered]@{ version='20260720225347'; file='20260720225347_harden_website_cms_integration.sql'; sha256='E4987CFCBD91251FE6EE10881D7F67858265C735DD7FDFCE31E49FBF63ECB8EC'; name='harden_website_cms_integration'; statementCount=31; statementsSha256='F24219DDADF3336C300153EDB521BC5A07807246707400E6A5489DC46298FAC2' },
  [ordered]@{ version='20260721035032'; file='20260721035032_add_website_page_publishing.sql'; sha256='88BE2091198AECA44A556DF3A0C76C6AB6018FBA8149A0EE13F79C4AC92D4C39'; name='add_website_page_publishing'; statementCount=15; statementsSha256='B4536DDBADF2D0C266BE5BFE8B487CAA772B2E2452D90C3EED332B2AA7AC9067' },
  [ordered]@{ version='20260721100403'; file='20260721100403_switch_tracking_to_google.sql'; sha256='EB84C03BD376D0B9E5AE2A7E1A14B7E41F9AA04B54D663793DCC79EF987E37A1'; name='switch_tracking_to_google'; statementCount=22; statementsSha256='8EA9689C0A8C7DB0BC5A1E40E771A747924B648CAE86BC016985299EE89BC672' },
  [ordered]@{ version='20260721162256'; file='20260721162256_restore_staff_messages.sql'; sha256='4E0C335C855C1338EDAB28429B7377DAC7768D796666B3FF315FF1B4A55C9FB0'; name='restore_staff_messages'; statementCount=10; statementsSha256='82E015F8BC3DA792E95269F397F266D5A0A3C4AFF086DA6969183491A5727552' },
  [ordered]@{ version='20260721170000'; file='20260721170000_create_general_website_page_rpc.sql'; sha256='4762C9B6791AB4C5E95FBFCC1F05F6BB703911D2D2DCE9DDDFD89456D2B922A4'; name='create_general_website_page_rpc'; statementCount=4; statementsSha256='E82EBA8A2674451B29885BDEC6D7F983C0CDAA2F4DDC3DA7162C98F14573EED1' },
  [ordered]@{ version='20260721174422'; file='20260721174422_preserve_source_cutover_fields.sql'; sha256='ECEBAE8DFB0CED17B2C0A1332E627846844C439DB945A5C705C95B53E3611217'; name='preserve_source_cutover_fields'; statementCount=4; statementsSha256='9F380B05DEEA92BABC7AC0076963B81648FBC3ABF8734C0820F21E38B784FD7C' }
)
$AppointmentColumnMap = [ordered]@{
  'patient_name' = 'name'
  'patient_phone' = 'phone'
  'appointment_date' = 'preferred_date'
  'appointment_time' = 'preferred_time'
}
$Task4ApprovedServiceLists = [ordered]@{
  'pemeriksaan-kesihatan' = @('Pemeriksaan Bakal Haji 2026','Pemeriksaan Kesihatan Pelajar','Pemeriksaan Pra-Pekerjaan & Kecergasan Bekerja','Pemeriksaan Darah Menyeluruh')
  'prosedur-minor' = @('Khatan Kanak-Kanak','Khatan Dewasa','Pembedahan Kecil / Ketuat','Penjagaan Telinga (Microsuction)')
  'rawatan-am' = @('Konsultasi Sakit Tekak / Demam / Selsema','Terapi Nebuliser & Sedutan Kahak','Ujian Denggi / Darah Penuh (FBC)','Ujian Pantas (Influenza A & B / COVID-19 / Adenovirus / RSV)','Pencucian Hidung')
}

if ($Phase -eq 'Rollback') {
  throw 'Task 4 Rollback is unavailable before any protected artifact, environment, tool, target, or restore action.'
}

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

function Assert-NoReparsePointInPath {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Label)
  $fullPath = [IO.Path]::GetFullPath($Path)
  $root = [IO.Path]::GetPathRoot($fullPath)
  if ([string]::IsNullOrWhiteSpace($root)) { throw "Refusing $Label with an invalid path root." }
  $current = $root
  if (Test-Path -LiteralPath $current) { Assert-NotReparsePoint -Path $current -Label $Label }
  $relative = $fullPath.Substring($root.Length).Trim('\')
  foreach ($component in @($relative -split '\\' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
    $current = Join-Path $current $component
    if (-not (Test-Path -LiteralPath $current)) { break }
    Assert-NotReparsePoint -Path $current -Label $Label
  }
}

Assert-ExactProtectedPath -Actual $ProtectedEnv -Expected $ExpectedEnv -Label 'environment'
Assert-ExactProtectedPath -Actual $ArtifactRoot -Expected $ExpectedArtifactRoot -Label 'artifact root'
Assert-NoReparsePointInPath -Path $ArtifactRoot -Label 'protected artifact root'
New-Item -ItemType Directory -Path $ArtifactRoot -Force | Out-Null
Assert-NoReparsePointInPath -Path $ArtifactRoot -Label 'protected artifact root'

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

function Get-StringSha256 {
  param([Parameter(Mandatory)][AllowEmptyString()][string]$Value)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return ([BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '').ToUpperInvariant()
  } finally {
    $algorithm.Dispose()
  }
}

function Get-JsonSha256 {
  param([Parameter(Mandatory)]$Value)
  return Get-StringSha256 -Value ($Value | ConvertTo-Json -Depth 50 -Compress)
}

function Get-Task4BytesSha256 {
  param([Parameter(Mandatory)][byte[]]$Bytes)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToUpperInvariant()
  } finally {
    $algorithm.Dispose()
  }
}

function Get-Task4IsolationContractRunnerSha256 {
  param([string]$Path = $Task4RunnerPath)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'Task 4 isolation runner contract file is missing.' }
  $text = [IO.File]::ReadAllText((Get-NormalizedPath $Path))
  foreach ($name in @('Task4MigrationPushEvidenceSha256','Task4MigrationPushProducerRunnerSha256')) {
    $assignment = '$' + $name
    $pattern = '(?m)^' + [regex]::Escape($assignment) + "\s*=\s*'[^'\r\n]*'\s*$"
    if ([regex]::Matches($text,$pattern).Count -ne 1) { throw "Task 4 isolation runner mutable pin assignment is not canonical: $name" }
    $text = [regex]::Replace($text,$pattern,($assignment + " = ''"))
  }
  return Get-StringSha256 -Value $text
}

function Get-Task4ByteOccurrenceCount {
  param(
    [Parameter(Mandatory)][byte[]]$Bytes,
    [Parameter(Mandatory)][string]$AsciiText
  )
  if ([string]::IsNullOrWhiteSpace($AsciiText) -or $AsciiText -cmatch '[^\x20-\x7E]') { throw 'Task 4 live reference marker must be non-empty ASCII.' }
  $needle = [Text.Encoding]::ASCII.GetBytes($AsciiText)
  $count = 0
  for ($index = 0; $index -le $Bytes.Length - $needle.Length; $index++) {
    $matches = $true
    for ($offset = 0; $offset -lt $needle.Length; $offset++) {
      if ($Bytes[$index + $offset] -ne $needle[$offset]) { $matches = $false; break }
    }
    if ($matches) { $count++; $index += $needle.Length - 1 }
  }
  return $count
}

function Get-Task4HtmlAttributeValue {
  param(
    [Parameter(Mandatory)][string]$Tag,
    [Parameter(Mandatory)][string]$Name,
    [switch]$Required
  )
  $pattern = '(?is)\b' + [regex]::Escape($Name) + '\s*=\s*(?:"(?<double>[^"]*)"|''(?<single>[^'']*)''|(?<bare>[^\s>]+))'
  $matches = [regex]::Matches($Tag,$pattern)
  if ($matches.Count -gt 1) { throw "Task 4 live HTML tag has duplicate $Name attributes." }
  if ($matches.Count -eq 0) {
    if ($Required) { throw "Task 4 live HTML tag is missing $Name." }
    return $null
  }
  foreach ($group in @('double','single','bare')) {
    if ($matches[0].Groups[$group].Success) { return [Net.WebUtility]::HtmlDecode($matches[0].Groups[$group].Value) }
  }
  throw "Task 4 live HTML $Name attribute could not be decoded."
}

function ConvertTo-Task4SameOriginJavascriptUri {
  param(
    [Parameter(Mandatory)][string]$Value,
    [Parameter(Mandatory)][Uri]$BaseUri,
    [Parameter(Mandatory)][Uri]$RootUri
  )
  if ([string]::IsNullOrWhiteSpace($Value)) { throw 'Task 4 live JavaScript URL is empty.' }
  try { $uri = [Uri]::new($BaseUri,$Value) } catch { throw 'Task 4 live JavaScript URL is invalid.' }
  if (-not $uri.IsAbsoluteUri -or $uri.Scheme -cne 'https' -or $uri.Host -cne $RootUri.Host -or
      $uri.Port -ne $RootUri.Port -or -not [string]::IsNullOrEmpty($uri.UserInfo) -or
      -not [string]::IsNullOrEmpty($uri.Fragment) -or $uri.AbsolutePath -cnotmatch '(?i)\.(?:m?js)$') {
    throw 'Task 4 live JavaScript URL is not an exact same-origin HTTPS asset.'
  }
  return $uri
}

function Get-Task4LiveJavascriptUris {
  param(
    [Parameter(Mandatory)][byte[]]$HtmlBytes,
    [Parameter(Mandatory)][string]$RootUrl
  )
  try { $rootUri = [Uri]$RootUrl } catch { throw 'Task 4 live frontend root URL is invalid.' }
  if (-not $rootUri.IsAbsoluteUri -or $rootUri.AbsoluteUri -cne $LiveFrontendUrl -or $rootUri.Scheme -cne 'https' -or $rootUri.Host -cne 'klinikawfa.com' -or $rootUri.AbsolutePath -cne '/' -or -not [string]::IsNullOrEmpty($rootUri.Query) -or -not [string]::IsNullOrEmpty($rootUri.Fragment)) {
    throw 'Task 4 live frontend root URL is not the exact approved HTTPS origin.'
  }
  try { $html = [Text.UTF8Encoding]::new($false,$true).GetString($HtmlBytes) } catch { throw 'Task 4 live HTML is not valid UTF-8.' }
  if ($html -match '(?is)<base\b') { throw 'Task 4 live HTML contains a base URL override.' }
  $uris = New-Object 'System.Collections.Generic.List[Uri]'
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($match in [regex]::Matches($html,'(?is)<script\b[^>]*>|<link\b[^>]*>')) {
    $tag = $match.Value
    $value = $null
    if ($tag -match '(?is)^<script\b') {
      $value = Get-Task4HtmlAttributeValue -Tag $tag -Name 'src'
      if ($null -eq $value) { continue }
    } else {
      $rel = Get-Task4HtmlAttributeValue -Tag $tag -Name 'rel'
      if ($null -eq $rel -or @($rel -split '\s+' | Where-Object { $_ -ceq 'modulepreload' }).Count -eq 0) { continue }
      $value = Get-Task4HtmlAttributeValue -Tag $tag -Name 'href' -Required
    }
    $uri = ConvertTo-Task4SameOriginJavascriptUri -Value $value -BaseUri $rootUri -RootUri $rootUri
    if (-not $seen.Add($uri.AbsoluteUri)) { throw 'Task 4 live HTML contains a duplicate canonical JavaScript asset.' }
    $uris.Add($uri)
  }
  if ($uris.Count -eq 0) { throw 'Task 4 live HTML contains no external same-origin JavaScript assets.' }
  return @($uris | Sort-Object AbsoluteUri)
}

function Get-Task4JavascriptDependencyUris {
  param(
    [Parameter(Mandatory)][byte[]]$JavascriptBytes,
    [Parameter(Mandatory)][Uri]$AssetUri,
    [Parameter(Mandatory)][Uri]$RootUri
  )
  try { $javascript = [Text.UTF8Encoding]::new($false,$true).GetString($JavascriptBytes) } catch { throw 'Task 4 live JavaScript asset is not valid UTF-8.' }
  $uris = New-Object 'System.Collections.Generic.List[Uri]'
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  $specifier = '(?:"(?<double>[^"\r\n]+\.(?:m?js)(?:\?[^"\r\n]*)?)"|''(?<single>[^''\r\n]+\.(?:m?js)(?:\?[^''\r\n]*)?)'')'
  $patterns = @(
    ('(?is)\bimport\s*\(\s*' + $specifier)
    ('(?is)\bimport\s*' + $specifier)
    ('(?is)\b(?:import|export)\b[^;"''\r\n]*?\bfrom\s*' + $specifier)
    ('(?is)\bnew\s+URL\s*\(\s*' + $specifier)
  )
  foreach ($pattern in $patterns) {
    foreach ($match in [regex]::Matches($javascript,$pattern)) {
      $value = if ($match.Groups['double'].Success) { $match.Groups['double'].Value } else { $match.Groups['single'].Value }
      $uri = ConvertTo-Task4SameOriginJavascriptUri -Value $value -BaseUri $AssetUri -RootUri $RootUri
      if ($seen.Add($uri.AbsoluteUri)) { $uris.Add($uri) }
    }
  }
  return @($uris | Sort-Object AbsoluteUri)
}

function Invoke-Task4HttpsGetBytes {
  param([Parameter(Mandatory)][Uri]$Uri)
  $handler = New-Object Net.Http.HttpClientHandler
  $handler.AllowAutoRedirect = $false
  $handler.AutomaticDecompression = [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
  $client = New-Object Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(20)
  $request = New-Object Net.Http.HttpRequestMessage([Net.Http.HttpMethod]::Get,$Uri)
  [void]$request.Headers.TryAddWithoutValidation('Cache-Control','no-cache, no-store, max-age=0')
  try {
    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    try {
      $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
      $contentType = if ($null -eq $response.Content.Headers.ContentType) { '' } else { $response.Content.Headers.ContentType.ToString() }
      return [pscustomobject]@{
        requestedUrl = $Uri.AbsoluteUri
        finalUrl = $response.RequestMessage.RequestUri.AbsoluteUri
        statusCode = [int]$response.StatusCode
        contentType = $contentType
        bytes = [byte[]]$bytes
      }
    } finally { $response.Dispose() }
  } finally { $request.Dispose(); $client.Dispose(); $handler.Dispose() }
}

function Assert-Task4HttpsResponse {
  param(
    [Parameter(Mandatory)]$Response,
    [Parameter(Mandatory)][Uri]$ExpectedUri,
    [Parameter(Mandatory)][ValidateSet('Html','Javascript')][string]$Kind
  )
  foreach ($name in @('requestedUrl','finalUrl','statusCode','contentType','bytes')) {
    if ($null -eq $Response.PSObject.Properties[$name]) { throw "Task 4 HTTPS response is missing $name." }
  }
  if ($Response.requestedUrl -isnot [string] -or $Response.finalUrl -isnot [string] -or $Response.statusCode -isnot [int] -or
      $Response.contentType -isnot [string] -or $Response.bytes -isnot [Array]) { throw 'Task 4 HTTPS response has invalid field types.' }
  if ([int]$Response.statusCode -ne 200 -or [string]$Response.requestedUrl -cne $ExpectedUri.AbsoluteUri -or [string]$Response.finalUrl -cne $ExpectedUri.AbsoluteUri) {
    throw 'Task 4 HTTPS response redirected, changed origin, or did not return status 200.'
  }
  $maximumBytes = if ($Kind -eq 'Html') { 2097152 } else { 16777216 }
  if ($Response.bytes.Count -le 0 -or $Response.bytes.Count -gt $maximumBytes) { throw "Task 4 $Kind response byte length is outside the approved bound." }
  $mediaType = ([string]$Response.contentType -split ';',2)[0].Trim().ToLowerInvariant()
  if ($Kind -eq 'Html' -and $mediaType -notin @('text/html','application/xhtml+xml')) { throw 'Task 4 live root did not return HTML.' }
  if ($Kind -eq 'Javascript' -and $mediaType -notin @('application/javascript','text/javascript','application/ecmascript','text/ecmascript')) { throw 'Task 4 live asset did not return JavaScript.' }
  return [byte[]]$Response.bytes
}

function Get-Task4LiveFrontendSnapshotOnce {
  param(
    [Parameter(Mandatory)][string]$RootUrl,
    [Parameter(Mandatory)][string]$SourceRef,
    [Parameter(Mandatory)][string]$TargetRef
  )
  $rootUri = [Uri]$RootUrl
  $htmlResponse = Invoke-Task4HttpsGetBytes -Uri $rootUri
  $htmlBytes = @(Assert-Task4HttpsResponse -Response $htmlResponse -ExpectedUri $rootUri -Kind Html)
  $queue = New-Object 'System.Collections.Generic.Queue[Uri]'
  foreach ($uri in @(Get-Task4LiveJavascriptUris -HtmlBytes $htmlBytes -RootUrl $RootUrl)) { $queue.Enqueue($uri) }
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  $assets = New-Object 'System.Collections.Generic.List[object]'
  $totalBytes = [int64]$htmlBytes.Count
  while ($queue.Count -gt 0) {
    $uri = $queue.Dequeue()
    if (-not $seen.Add($uri.AbsoluteUri)) { continue }
    if ($seen.Count -gt 128) { throw 'Task 4 live JavaScript dependency graph exceeds the approved asset limit.' }
    $response = Invoke-Task4HttpsGetBytes -Uri $uri
    $bytes = @(Assert-Task4HttpsResponse -Response $response -ExpectedUri $uri -Kind Javascript)
    $totalBytes += $bytes.Count
    if ($totalBytes -gt 67108864) { throw 'Task 4 live frontend snapshot exceeds the approved total byte limit.' }
    $assets.Add([ordered]@{
      url = $uri.AbsoluteUri
      bytes = [int64]$bytes.Count
      sha256 = Get-Task4BytesSha256 -Bytes ([byte[]]$bytes)
      sourceRefOccurrences = Get-Task4ByteOccurrenceCount -Bytes $bytes -AsciiText $SourceRef
      targetRefOccurrences = Get-Task4ByteOccurrenceCount -Bytes $bytes -AsciiText $TargetRef
    })
    foreach ($dependency in @(Get-Task4JavascriptDependencyUris -JavascriptBytes $bytes -AssetUri $uri -RootUri $rootUri)) {
      if (-not $seen.Contains($dependency.AbsoluteUri)) { $queue.Enqueue($dependency) }
    }
  }
  $orderedAssets = @($assets | Sort-Object { $_.url })
  $html = [ordered]@{
    url = $rootUri.AbsoluteUri
    bytes = [int64]$htmlBytes.Count
    sha256 = Get-Task4BytesSha256 -Bytes ([byte[]]$htmlBytes)
    sourceRefOccurrences = Get-Task4ByteOccurrenceCount -Bytes $htmlBytes -AsciiText $SourceRef
    targetRefOccurrences = Get-Task4ByteOccurrenceCount -Bytes $htmlBytes -AsciiText $TargetRef
  }
  $sourceCount = [int]$html.sourceRefOccurrences
  $targetCount = [int]$html.targetRefOccurrences
  foreach ($asset in $orderedAssets) { $sourceCount += [int]$asset.sourceRefOccurrences; $targetCount += [int]$asset.targetRefOccurrences }
  if ($sourceCount -le 0 -or $targetCount -ne 0) { throw 'Task 4 live frontend is not isolated on the approved source project.' }
  $snapshot = [ordered]@{
    rootUrl = $rootUri.AbsoluteUri
    html = $html
    javascriptAssets = $orderedAssets
    javascriptAssetsSha256 = Get-JsonSha256 -Value $orderedAssets
    sourceRefOccurrences = $sourceCount
    targetRefOccurrences = $targetCount
  }
  $snapshot['snapshotSha256'] = Get-JsonSha256 -Value $snapshot
  return $snapshot
}

function Get-Task4LiveFrontendSnapshot {
  param(
    [string]$RootUrl = $LiveFrontendUrl,
    [string]$SourceRef = $LiveSourceRef,
    [string]$TargetRef = $ExpectedRef
  )
  $first = Get-Task4LiveFrontendSnapshotOnce -RootUrl $RootUrl -SourceRef $SourceRef -TargetRef $TargetRef
  $second = Get-Task4LiveFrontendSnapshotOnce -RootUrl $RootUrl -SourceRef $SourceRef -TargetRef $TargetRef
  if ((Get-JsonSha256 -Value $first) -cne (Get-JsonSha256 -Value $second)) { throw 'Task 4 live frontend changed during the isolation observation.' }
  return $second
}

function Assert-Task4IsolationExactProperties {
  param(
    [Parameter(Mandatory)]$Value,
    [Parameter(Mandatory)][string[]]$Names,
    [Parameter(Mandatory)][string]$Label
  )
  if ($Value -is [Collections.IDictionary]) {
    $actual = @($Value.Keys | ForEach-Object { [string]$_ } | Sort-Object)
  } elseif ($Value -is [pscustomobject]) {
    $actual = @($Value.PSObject.Properties.Name | Sort-Object)
  } else {
    throw "$Label must be a JSON object."
  }
  $expected = @($Names | Sort-Object)
  if (($actual -join "`n") -cne ($expected -join "`n")) { throw "$Label has missing or unexpected fields." }
}

function Assert-Task4IsolationSha256 {
  param($Value,[Parameter(Mandatory)][string]$Label)
  if ($Value -isnot [string] -or $Value -cnotmatch '^[A-F0-9]{64}$') { throw "$Label must be an uppercase SHA-256 digest string." }
}

function Assert-Task4IsolationInteger {
  param($Value,[Parameter(Mandatory)][string]$Label)
  if ($Value -isnot [int] -and $Value -isnot [long]) { throw "$Label must be a JSON integer." }
}

function Get-Task4IsolationTargetSnapshotOnce {
  $inventory = Get-TargetInventory -IncludeTask4Contract
  $sql = @'
begin read only;
set local time zone 'UTC';
with
bucket_rows as (
  select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]'::jsonb) as value from storage.buckets b
),
preexisting_bucket_rows as (
  select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]'::jsonb) as value from storage.buckets b where b.id <> 'website-media'
),
object_rows as (
  select coalesce(jsonb_agg(to_jsonb(o) order by o.bucket_id,o.name,o.id),'[]'::jsonb) as value from storage.objects o
),
storage_migration_rows as (
  select coalesce(jsonb_agg(to_jsonb(m) order by to_jsonb(m)::text),'[]'::jsonb) as value from storage.migrations m
),
sequence_catalog as (
  select format('%I.%I',s.schemaname,s.sequencename) as identity,
         s.start_value::bigint as start_value,s.min_value::bigint as min_value,s.max_value::bigint as max_value,
         s.increment_by::bigint as increment_by,s.cycle,s.cache_size::bigint as cache_size,
         (select format('%I.%I.%I',tn.nspname,tc.relname,a.attname)
            from pg_class sc join pg_namespace sn on sn.oid=sc.relnamespace
            join pg_depend d on d.classid='pg_class'::regclass and d.objid=sc.oid and d.deptype in ('a','i')
            join pg_class tc on tc.oid=d.refobjid join pg_namespace tn on tn.oid=tc.relnamespace
            join pg_attribute a on a.attrelid=tc.oid and a.attnum=d.refobjsubid
           where sn.nspname=s.schemaname and sc.relname=s.sequencename limit 1) as owned_by
    from pg_sequences s where s.schemaname='public'
),
sequence_values as (
  select 'public.client_invoice_seq'::text as identity,last_value::bigint,is_called from public.client_invoice_seq
  union all select 'public.patient_reg_no_seq',last_value::bigint,is_called from public.patient_reg_no_seq
  union all select 'public.queue_number_seq',last_value::bigint,is_called from public.queue_number_seq
),
sequence_rows as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'identity',c.identity,'lastValue',v.last_value,'isCalled',v.is_called,'startValue',c.start_value,
    'minValue',c.min_value,'maxValue',c.max_value,'incrementBy',c.increment_by,'cycle',c.cycle,
    'cacheSize',c.cache_size,'ownedBy',c.owned_by) order by c.identity),'[]'::jsonb) as value
  from sequence_catalog c left join sequence_values v using(identity)
),
sequence_identities as (
  select coalesce(jsonb_agg(identity order by identity),'[]'::jsonb) as value from sequence_catalog
)
select jsonb_build_object(
  'authSessions',(select count(*) from auth.sessions),
  'authRefreshTokens',(select count(*) from auth.refresh_tokens),
  'authOneTimeTokens',(select count(*) from auth.one_time_tokens),
  'storage',jsonb_build_object(
    'buckets',(select count(*) from storage.buckets),
    'objects',(select count(*) from storage.objects),
    'bucketConfigurationSha256',(select upper(encode(extensions.digest(convert_to(value::text,'UTF8'),'sha256'),'hex')) from bucket_rows),
    'preexistingBucketConfigurationSha256',(select upper(encode(extensions.digest(convert_to(value::text,'UTF8'),'sha256'),'hex')) from preexisting_bucket_rows),
    'websiteMediaBucket',(select jsonb_build_object('id',id,'name',name,'owner',owner,'ownerId',owner_id,'public',public,'avifAutodetection',avif_autodetection,'fileSizeLimit',file_size_limit,'allowedMimeTypes',to_jsonb(allowed_mime_types),'type',type::text) from storage.buckets where id='website-media'),
    'objectMetadataSha256',(select upper(encode(extensions.digest(convert_to(value::text,'UTF8'),'sha256'),'hex')) from object_rows),
    'storageMigrationRows',(select count(*) from storage.migrations),
    'storageMigrationsSha256',(select upper(encode(extensions.digest(convert_to(value::text,'UTF8'),'sha256'),'hex')) from storage_migration_rows)
  ),
  'publicSequenceIdentities',(select value from sequence_identities),
  'standaloneSequences',(select value from sequence_rows)
)::text;
rollback;
'@
  try { $managed = (Invoke-TargetQueryWithoutOutputLog -Sql $sql -Label 'Task 4 target isolation managed-state observation') | ConvertFrom-Json -ErrorAction Stop }
  catch { throw 'Task 4 target isolation managed-state observation is not valid JSON.' }
  Assert-Task4IsolationExactProperties -Value $managed -Names @('authSessions','authRefreshTokens','authOneTimeTokens','storage','publicSequenceIdentities','standaloneSequences') -Label 'Task 4 target isolation managed state'
  Assert-Task4IsolationExactProperties -Value $managed.storage -Names @('buckets','objects','bucketConfigurationSha256','preexistingBucketConfigurationSha256','websiteMediaBucket','objectMetadataSha256','storageMigrationRows','storageMigrationsSha256') -Label 'Task 4 target isolation Storage state'
  $storage = [ordered]@{
    buckets = $managed.storage.buckets
    objects = $managed.storage.objects
    bucketConfigurationSha256 = $managed.storage.bucketConfigurationSha256
    preexistingBucketConfigurationSha256 = $managed.storage.preexistingBucketConfigurationSha256
    websiteMediaBucket = $managed.storage.websiteMediaBucket
    objectMetadataSha256 = $managed.storage.objectMetadataSha256
    storageMigrationRows = $managed.storage.storageMigrationRows
    storageMigrationsSha256 = $managed.storage.storageMigrationsSha256
  }
  $storage['stateSha256'] = Get-JsonSha256 -Value $storage
  $identities = @($managed.publicSequenceIdentities)
  $snapshot = [ordered]@{
    projectRef = $inventory.projectRef
    publicTables = $inventory.publicTables
    authUsers = $inventory.authUsers
    authIdentities = $inventory.authIdentities
    authSessions = $managed.authSessions
    authRefreshTokens = $managed.authRefreshTokens
    authOneTimeTokens = $managed.authOneTimeTokens
    migrationRows = $inventory.migrationRows
    migrationIdentities = @($inventory.migrationIdentities)
    migrationIdentitiesSha256 = $inventory.migrationIdentitiesSha256
    schemaSha256 = $inventory.schemaSha256
    extendedSchemaSha256 = $inventory.extendedSchemaSha256
    storage = $storage
    publicSequenceIdentities = $identities
    publicSequenceIdentitiesSha256 = Get-JsonSha256 -Value $identities
    standaloneSequences = @($managed.standaloneSequences)
  }
  $snapshot['snapshotSha256'] = Get-JsonSha256 -Value $snapshot
  return $snapshot
}

function Get-Task4IsolationTargetSnapshot {
  $first = Get-Task4IsolationTargetSnapshotOnce
  $second = Get-Task4IsolationTargetSnapshotOnce
  if ((Get-JsonSha256 -Value $first) -cne (Get-JsonSha256 -Value $second)) { throw 'Task 4 target changed during the isolation observation.' }
  return $second
}

function Assert-Task4IsolationTargetBaseline {
  param(
    [Parameter(Mandatory)]$Snapshot,
    [Parameter(Mandatory)]$VerifiedBaseline,
    [Parameter(Mandatory)][string]$ExpectedExtendedSchemaSha256
  )
  Assert-Task4IsolationExactProperties -Value $Snapshot -Names @(
    'projectRef','publicTables','authUsers','authIdentities','authSessions','authRefreshTokens','authOneTimeTokens',
    'migrationRows','migrationIdentities','migrationIdentitiesSha256','schemaSha256','extendedSchemaSha256','storage',
    'publicSequenceIdentities','publicSequenceIdentitiesSha256','standaloneSequences','snapshotSha256'
  ) -Label 'Task 4 target isolation snapshot'
  Assert-Task4IsolationSha256 -Value $Snapshot.snapshotSha256 -Label 'Task 4 target isolation snapshot digest'
  $snapshotForHash = $Snapshot | ConvertTo-Json -Depth 50 | ConvertFrom-Json
  [void]$snapshotForHash.PSObject.Properties.Remove('snapshotSha256')
  if ([string]$Snapshot.snapshotSha256 -cne (Get-JsonSha256 -Value $snapshotForHash)) { throw 'Task 4 target isolation snapshot self-hash is invalid.' }
  foreach ($name in @('publicTables','authUsers','authIdentities','authSessions','authRefreshTokens','authOneTimeTokens','migrationRows')) {
    Assert-Task4IsolationInteger -Value $Snapshot.$name -Label "Task 4 target isolation $name"
  }
  $baselineProjection = [ordered]@{
    projectRef = $Snapshot.projectRef
    publicTables = $Snapshot.publicTables
    authUsers = $Snapshot.authUsers
    authIdentities = $Snapshot.authIdentities
    migrationRows = $Snapshot.migrationRows
    migrationIdentities = @($Snapshot.migrationIdentities)
    migrationIdentitiesSha256 = $Snapshot.migrationIdentitiesSha256
    schemaSha256 = $Snapshot.schemaSha256
  }
  if ((Get-JsonSha256 -Value $baselineProjection) -cne (Get-JsonSha256 -Value $VerifiedBaseline)) { throw 'Task 4 target isolation snapshot differs from the protected pre-write baseline.' }
  Assert-Task4IsolationSha256 -Value $Snapshot.extendedSchemaSha256 -Label 'Task 4 target isolation extended schema digest'
  if ([string]$Snapshot.extendedSchemaSha256 -cne $ExpectedExtendedSchemaSha256) { throw 'Task 4 target isolation extended schema digest changed.' }
  if ([int64]$Snapshot.authSessions -ne 0 -or [int64]$Snapshot.authRefreshTokens -ne 0 -or [int64]$Snapshot.authOneTimeTokens -ne 0) { throw 'Task 4 target isolation requires zero managed Auth workflow rows.' }

  Assert-Task4IsolationExactProperties -Value $Snapshot.storage -Names @('buckets','objects','bucketConfigurationSha256','preexistingBucketConfigurationSha256','websiteMediaBucket','objectMetadataSha256','storageMigrationRows','storageMigrationsSha256','stateSha256') -Label 'Task 4 target isolation Storage state'
  foreach ($name in @('buckets','objects','storageMigrationRows')) {
    Assert-Task4IsolationInteger -Value $Snapshot.storage.$name -Label "Task 4 target isolation Storage $name"
    if ([int64]$Snapshot.storage.$name -lt 0) { throw "Task 4 target isolation Storage $name cannot be negative." }
  }
  foreach ($name in @('bucketConfigurationSha256','preexistingBucketConfigurationSha256','objectMetadataSha256','storageMigrationsSha256','stateSha256')) { Assert-Task4IsolationSha256 -Value $Snapshot.storage.$name -Label "Task 4 target isolation Storage $name" }
  $storageForHash = [ordered]@{
    buckets=$Snapshot.storage.buckets; objects=$Snapshot.storage.objects
    bucketConfigurationSha256=$Snapshot.storage.bucketConfigurationSha256; preexistingBucketConfigurationSha256=$Snapshot.storage.preexistingBucketConfigurationSha256
    websiteMediaBucket=$Snapshot.storage.websiteMediaBucket; objectMetadataSha256=$Snapshot.storage.objectMetadataSha256
    storageMigrationRows=$Snapshot.storage.storageMigrationRows; storageMigrationsSha256=$Snapshot.storage.storageMigrationsSha256
  }
  if ([string]$Snapshot.storage.stateSha256 -cne (Get-JsonSha256 -Value $storageForHash)) { throw 'Task 4 target isolation Storage state self-hash is invalid.' }
  if ([int64]$Snapshot.storage.buckets -ne $Task4BaselineStorageBuckets -or [int64]$Snapshot.storage.objects -ne $Task4BaselineStorageObjects -or
      [string]$Snapshot.storage.bucketConfigurationSha256 -cne $Task4BaselineStorageBucketConfigurationSha256 -or [string]$Snapshot.storage.preexistingBucketConfigurationSha256 -cne $Task4BaselineStorageBucketConfigurationSha256 -or
      $null -ne $Snapshot.storage.websiteMediaBucket -or [string]$Snapshot.storage.objectMetadataSha256 -cne $Task4BaselineStorageObjectMetadataSha256 -or
      [int64]$Snapshot.storage.storageMigrationRows -ne $Task4BaselineStorageMigrationRows -or [string]$Snapshot.storage.storageMigrationsSha256 -cne $Task4BaselineStorageMigrationsSha256) { throw 'Task 4 target isolation Storage state differs from the protected known baseline.' }

  $expectedIdentities = @('public.client_invoice_seq','public.patient_reg_no_seq','public.queue_number_seq')
  if ((@($Snapshot.publicSequenceIdentities) -join "`n") -cne ($expectedIdentities -join "`n")) { throw 'Task 4 target isolation public sequence inventory is not exactly the approved three standalone sequences.' }
  Assert-Task4IsolationSha256 -Value $Snapshot.publicSequenceIdentitiesSha256 -Label 'Task 4 target isolation sequence identity digest'
  if ([string]$Snapshot.publicSequenceIdentitiesSha256 -cne (Get-JsonSha256 -Value @($Snapshot.publicSequenceIdentities))) { throw 'Task 4 target isolation sequence identity digest is invalid.' }
  $sequences = @($Snapshot.standaloneSequences)
  if ($sequences.Count -ne 3) { throw 'Task 4 target isolation standalone sequence cardinality is not exactly three.' }
  $expectedStartValues = @(1L,1L,1001L)
  $expectedLastValues = @(1L,9L,1012L)
  $expectedIsCalled = @($false,$true,$true)
  for ($index=0; $index -lt 3; $index++) {
    $sequence = $sequences[$index]
    Assert-Task4IsolationExactProperties -Value $sequence -Names @('identity','lastValue','isCalled','startValue','minValue','maxValue','incrementBy','cycle','cacheSize','ownedBy') -Label 'Task 4 target isolation standalone sequence'
    if ($sequence.identity -isnot [string] -or [string]$sequence.identity -cne $expectedIdentities[$index] -or $sequence.isCalled -isnot [bool] -or [bool]$sequence.isCalled -ne $expectedIsCalled[$index] -or $sequence.cycle -isnot [bool] -or [bool]$sequence.cycle -or $null -ne $sequence.ownedBy) { throw 'Task 4 target isolation standalone sequence identity, boolean state, or ownership is invalid.' }
    foreach ($name in @('lastValue','startValue','minValue','maxValue','incrementBy','cacheSize')) { Assert-Task4IsolationInteger -Value $sequence.$name -Label "Task 4 target isolation standalone sequence $name" }
    if ([int64]$sequence.lastValue -ne $expectedLastValues[$index] -or [int64]$sequence.startValue -ne $expectedStartValues[$index] -or [int64]$sequence.minValue -ne 1L -or [int64]$sequence.maxValue -ne [int64]::MaxValue -or [int64]$sequence.incrementBy -ne 1L -or [int64]$sequence.cacheSize -ne 1L) { throw 'Task 4 target isolation standalone sequence state or configuration changed.' }
  }
  return $Snapshot
}

function Assert-Task4IsolationSnapshotIntegrity {
  param([Parameter(Mandatory)]$Snapshot)
  Assert-Task4IsolationExactProperties -Value $Snapshot -Names @(
    'projectRef','publicTables','authUsers','authIdentities','authSessions','authRefreshTokens','authOneTimeTokens',
    'migrationRows','migrationIdentities','migrationIdentitiesSha256','schemaSha256','extendedSchemaSha256','storage',
    'publicSequenceIdentities','publicSequenceIdentitiesSha256','standaloneSequences','snapshotSha256'
  ) -Label 'Task 4 target isolation snapshot'
  Assert-Task4IsolationSha256 -Value $Snapshot.snapshotSha256 -Label 'Task 4 target isolation snapshot digest'
  $forHash = $Snapshot | ConvertTo-Json -Depth 50 | ConvertFrom-Json
  [void]$forHash.PSObject.Properties.Remove('snapshotSha256')
  if ([string]$Snapshot.snapshotSha256 -cne (Get-JsonSha256 -Value $forHash)) { throw 'Task 4 target isolation snapshot self-hash is invalid.' }
  foreach ($name in @('publicTables','authUsers','authIdentities','authSessions','authRefreshTokens','authOneTimeTokens','migrationRows')) { Assert-Task4IsolationInteger -Value $Snapshot.$name -Label "Task 4 target isolation $name" }
  foreach ($name in @('migrationIdentitiesSha256','schemaSha256','extendedSchemaSha256','publicSequenceIdentitiesSha256')) { Assert-Task4IsolationSha256 -Value $Snapshot.$name -Label "Task 4 target isolation $name" }
  Assert-Task4IsolationExactProperties -Value $Snapshot.storage -Names @('buckets','objects','bucketConfigurationSha256','preexistingBucketConfigurationSha256','websiteMediaBucket','objectMetadataSha256','storageMigrationRows','storageMigrationsSha256','stateSha256') -Label 'Task 4 target isolation Storage state'
  foreach ($name in @('buckets','objects','storageMigrationRows')) { Assert-Task4IsolationInteger -Value $Snapshot.storage.$name -Label "Task 4 target isolation Storage $name" }
  foreach ($name in @('bucketConfigurationSha256','preexistingBucketConfigurationSha256','objectMetadataSha256','storageMigrationsSha256','stateSha256')) { Assert-Task4IsolationSha256 -Value $Snapshot.storage.$name -Label "Task 4 target isolation Storage $name" }
  $storageForHash = [ordered]@{
    buckets=$Snapshot.storage.buckets; objects=$Snapshot.storage.objects
    bucketConfigurationSha256=$Snapshot.storage.bucketConfigurationSha256; preexistingBucketConfigurationSha256=$Snapshot.storage.preexistingBucketConfigurationSha256
    websiteMediaBucket=$Snapshot.storage.websiteMediaBucket; objectMetadataSha256=$Snapshot.storage.objectMetadataSha256
    storageMigrationRows=$Snapshot.storage.storageMigrationRows; storageMigrationsSha256=$Snapshot.storage.storageMigrationsSha256
  }
  if ([string]$Snapshot.storage.stateSha256 -cne (Get-JsonSha256 -Value $storageForHash)) { throw 'Task 4 target isolation Storage state self-hash is invalid.' }
  if ([string]$Snapshot.publicSequenceIdentitiesSha256 -cne (Get-JsonSha256 -Value @($Snapshot.publicSequenceIdentities))) { throw 'Task 4 target isolation sequence identity digest is invalid.' }
  return $Snapshot
}

function Assert-Task4WebsiteMediaBucket {
  param([Parameter(Mandatory)]$Bucket)
  Assert-Task4IsolationExactProperties -Value $Bucket -Names @('id','name','owner','ownerId','public','avifAutodetection','fileSizeLimit','allowedMimeTypes','type') -Label 'Task 4 website-media bucket configuration'
  Assert-Task4IsolationInteger -Value $Bucket.fileSizeLimit -Label 'Task 4 website-media file size limit'
  if ($Bucket.allowedMimeTypes -isnot [Array] -or @($Bucket.allowedMimeTypes | Where-Object { $_ -isnot [string] }).Count -ne 0) { throw 'Task 4 website-media allowed MIME types must be an exact JSON string array.' }
  if ($Bucket.id -isnot [string] -or [string]$Bucket.id -cne 'website-media' -or $Bucket.name -isnot [string] -or [string]$Bucket.name -cne 'website-media' -or $null -ne $Bucket.owner -or $null -ne $Bucket.ownerId -or
      $Bucket.public -isnot [bool] -or -not [bool]$Bucket.public -or $Bucket.avifAutodetection -isnot [bool] -or [bool]$Bucket.avifAutodetection -or [int64]$Bucket.fileSizeLimit -ne 26214400L -or
      (@($Bucket.allowedMimeTypes) -join "`n") -cne (@('image/jpeg','image/png','image/webp','video/mp4','video/webm') -join "`n") -or $Bucket.type -isnot [string] -or [string]$Bucket.type -cne 'STANDARD') { throw 'Task 4 website-media bucket configuration is not the exact approved migration delta.' }
  return $Bucket
}

function Assert-Task4StandaloneSequenceShape {
  param(
    [Parameter(Mandatory)]$Sequence,
    [Parameter(Mandatory)][string]$ExpectedIdentity
  )
  Assert-Task4IsolationExactProperties -Value $Sequence -Names @('identity','lastValue','isCalled','startValue','minValue','maxValue','incrementBy','cycle','cacheSize','ownedBy') -Label 'Task 4 standalone sequence state'
  if ($Sequence.identity -isnot [string] -or [string]$Sequence.identity -cne $ExpectedIdentity -or $Sequence.isCalled -isnot [bool] -or $Sequence.cycle -isnot [bool] -or $null -ne $Sequence.ownedBy) { throw 'Task 4 standalone sequence identity, boolean types, or ownership is invalid.' }
  foreach ($name in @('lastValue','startValue','minValue','maxValue','incrementBy','cacheSize')) { Assert-Task4IsolationInteger -Value $Sequence.$name -Label "Task 4 standalone sequence $name" }
  return $Sequence
}

function Assert-Task4IsolationPostMigrationState {
  param(
    [Parameter(Mandatory)]$Snapshot,
    [Parameter(Mandatory)]$PreWriteSnapshot,
    [Parameter(Mandatory)]$ExpectedPostState
  )
  [void](Assert-Task4IsolationSnapshotIntegrity -Snapshot $Snapshot)
  $postInventory = [ordered]@{
    projectRef=$Snapshot.projectRef; publicTables=$Snapshot.publicTables; authUsers=$Snapshot.authUsers; authIdentities=$Snapshot.authIdentities
    migrationRows=$Snapshot.migrationRows; migrationIdentities=@($Snapshot.migrationIdentities); migrationIdentitiesSha256=$Snapshot.migrationIdentitiesSha256
    schemaSha256=$Snapshot.schemaSha256; extendedSchemaSha256=$Snapshot.extendedSchemaSha256
  }
  [void](Assert-PostMigrationTargetState -Expected $ExpectedPostState -Actual $postInventory)
  if ([int64]$Snapshot.authSessions -ne 0 -or [int64]$Snapshot.authRefreshTokens -ne 0 -or [int64]$Snapshot.authOneTimeTokens -ne 0) { throw 'Task 4 post-migration isolation requires zero managed Auth workflow rows.' }
  [void](Assert-Task4WebsiteMediaBucket -Bucket $Snapshot.storage.websiteMediaBucket)
  if ([int64]$Snapshot.storage.buckets -ne ([int64]$PreWriteSnapshot.storage.buckets + 1L) -or [int64]$Snapshot.storage.objects -ne [int64]$PreWriteSnapshot.storage.objects -or
      [string]$Snapshot.storage.bucketConfigurationSha256 -ceq [string]$PreWriteSnapshot.storage.bucketConfigurationSha256 -or [string]$Snapshot.storage.preexistingBucketConfigurationSha256 -cne [string]$PreWriteSnapshot.storage.bucketConfigurationSha256 -or
      [string]$Snapshot.storage.objectMetadataSha256 -cne [string]$PreWriteSnapshot.storage.objectMetadataSha256 -or [int64]$Snapshot.storage.storageMigrationRows -ne [int64]$PreWriteSnapshot.storage.storageMigrationRows -or
      [string]$Snapshot.storage.storageMigrationsSha256 -cne [string]$PreWriteSnapshot.storage.storageMigrationsSha256) { throw 'Task 4 migration Push Storage change is not exactly the approved website-media bucket delta.' }
  if ((Get-JsonSha256 -Value @($Snapshot.publicSequenceIdentities)) -cne (Get-JsonSha256 -Value @($PreWriteSnapshot.publicSequenceIdentities)) -or
      (Get-JsonSha256 -Value @($Snapshot.standaloneSequences)) -cne (Get-JsonSha256 -Value @($PreWriteSnapshot.standaloneSequences))) { throw 'Task 4 migration Push changed standalone sequence identity or state.' }
  return $Snapshot
}

function Assert-Task4IsolationPostImportState {
  param(
    [Parameter(Mandatory)]$Snapshot,
    [Parameter(Mandatory)]$ExpectedStorage
  )
  [void](Assert-Task4IsolationSnapshotIntegrity -Snapshot $Snapshot)
  if ([int64]$Snapshot.authSessions -ne 0 -or [int64]$Snapshot.authRefreshTokens -ne 0 -or [int64]$Snapshot.authOneTimeTokens -ne 0) { throw 'Task 4 post-import isolation requires zero managed Auth workflow rows.' }
  [void](Assert-Task4WebsiteMediaBucket -Bucket $Snapshot.storage.websiteMediaBucket)
  if ((Get-JsonSha256 -Value $Snapshot.storage) -cne (Get-JsonSha256 -Value $ExpectedStorage)) { throw 'Task 4 Import changed the validated post-Push Storage configuration or metadata.' }
  $expectedIdentities = @('public.client_invoice_seq','public.patient_reg_no_seq','public.queue_number_seq')
  if ($Snapshot.publicSequenceIdentities -isnot [Array] -or @($Snapshot.publicSequenceIdentities | Where-Object { $_ -isnot [string] }).Count -ne 0 -or (@($Snapshot.publicSequenceIdentities) -join "`n") -cne ($expectedIdentities -join "`n")) { throw 'Task 4 post-import public sequence inventory is not exactly the approved three standalone sequences.' }
  $expected = @(Get-Task4StandaloneSequenceSpecifications)
  $actual = @($Snapshot.standaloneSequences)
  if ($actual.Count -ne 3) { throw 'Task 4 post-import standalone sequence state cardinality is not exactly three.' }
  for ($index=0; $index -lt 3; $index++) {
    [void](Assert-Task4StandaloneSequenceShape -Sequence $actual[$index] -ExpectedIdentity $expectedIdentities[$index])
    if ([int64]$actual[$index].lastValue -ne [int64]$expected[$index].lastValue -or [bool]$actual[$index].isCalled -ne [bool]$expected[$index].isCalled -or
        [int64]$actual[$index].startValue -ne [int64]$expected[$index].startValue -or [int64]$actual[$index].minValue -ne 1L -or [int64]$actual[$index].maxValue -ne [int64]::MaxValue -or [int64]$actual[$index].incrementBy -ne [int64]$expected[$index].incrementBy -or
        [bool]$actual[$index].cycle -or [int64]$actual[$index].cacheSize -ne 1L -or $null -ne $actual[$index].ownedBy) { throw "Task 4 post-import standalone sequence state mismatch: $($expected[$index].identity)" }
  }
  return $Snapshot
}

function New-Task4StagingIsolationEvidence {
  param(
    [Parameter(Mandatory)][DateTimeOffset]$ObservedAtUtc,
    [Parameter(Mandatory)][string]$ContractRunnerSha256,
    [Parameter(Mandatory)]$VerifiedBackup,
    [Parameter(Mandatory)]$LiveFrontend,
    [Parameter(Mandatory)]$TargetPreWrite
  )
  Assert-Task4IsolationSha256 -Value $ContractRunnerSha256 -Label 'Task 4 isolation normalized runner digest'
  $observed = $ObservedAtUtc.ToUniversalTime()
  $payload = [ordered]@{
    formatVersion = 1
    status = 'isolated-staging-verified'
    observedAtUtc = $observed.UtcDateTime.ToString('o')
    expiresAtUtc = $observed.AddMinutes($Task4PushIsolationMaxAgeMinutes).UtcDateTime.ToString('o')
    targetRef = $ExpectedRef
    liveSourceRef = $LiveSourceRef
    contractRunnerSha256 = $ContractRunnerSha256
    protectedBaseline = [ordered]@{
      backupManifestFileSha256 = [string]$VerifiedBackup.manifestSha256
      targetBaselineSha256 = [string]$VerifiedBackup.manifest.targetBaselineSha256
    }
    liveFrontend = $LiveFrontend
    targetPreWrite = $TargetPreWrite
    liveFrontendSha256 = [string]$LiveFrontend.snapshotSha256
    targetPreWriteSha256 = [string]$TargetPreWrite.snapshotSha256
  }
  return [ordered]@{ payload=$payload; payloadSha256=Get-JsonSha256 -Value $payload }
}

function Assert-Task4StagingIsolationEvidenceDocument {
  param(
    [Parameter(Mandatory)]$Document,
    [Parameter(Mandatory)][DateTimeOffset]$NowUtc,
    [Parameter(Mandatory)][string]$ExpectedContractRunnerSha256,
    [Parameter(Mandatory)]$VerifiedBackup,
    $CurrentLiveFrontend,
    $CurrentTargetPreWrite,
    [Parameter(Mandatory)][ValidateSet('Verify','Push','Import')][string]$Purpose
  )
  Assert-Task4IsolationExactProperties -Value $Document -Names @('payload','payloadSha256') -Label 'Task 4 staging isolation evidence envelope'
  Assert-Task4IsolationSha256 -Value $Document.payloadSha256 -Label 'Task 4 staging isolation evidence self-hash'
  if ([string]$Document.payloadSha256 -cne (Get-JsonSha256 -Value $Document.payload)) { throw 'Task 4 staging isolation evidence self-hash is invalid.' }
  $payload = $Document.payload
  Assert-Task4IsolationExactProperties -Value $payload -Names @('formatVersion','status','observedAtUtc','expiresAtUtc','targetRef','liveSourceRef','contractRunnerSha256','protectedBaseline','liveFrontend','targetPreWrite','liveFrontendSha256','targetPreWriteSha256') -Label 'Task 4 staging isolation evidence payload'
  Assert-Task4IsolationInteger -Value $payload.formatVersion -Label 'Task 4 staging isolation evidence formatVersion'
  if ([int64]$payload.formatVersion -ne 1 -or $payload.status -isnot [string] -or [string]$payload.status -cne 'isolated-staging-verified' -or $payload.targetRef -isnot [string] -or [string]$payload.targetRef -cne $ExpectedRef -or $payload.liveSourceRef -isnot [string] -or [string]$payload.liveSourceRef -cne $LiveSourceRef) { throw 'Task 4 staging isolation evidence identity or status is invalid.' }
  foreach ($name in @('contractRunnerSha256','liveFrontendSha256','targetPreWriteSha256')) { Assert-Task4IsolationSha256 -Value $payload.$name -Label "Task 4 staging isolation evidence $name" }
  if ([string]$payload.contractRunnerSha256 -cne $ExpectedContractRunnerSha256) { throw 'Task 4 staging isolation evidence is stale for the current normalized runner contract.' }
  Assert-Task4IsolationExactProperties -Value $payload.protectedBaseline -Names @('backupManifestFileSha256','targetBaselineSha256') -Label 'Task 4 staging isolation protected baseline binding'
  foreach ($name in @('backupManifestFileSha256','targetBaselineSha256')) { Assert-Task4IsolationSha256 -Value $payload.protectedBaseline.$name -Label "Task 4 staging isolation protected baseline $name" }
  if ([string]$payload.protectedBaseline.backupManifestFileSha256 -cne [string]$VerifiedBackup.manifestSha256 -or [string]$payload.protectedBaseline.targetBaselineSha256 -cne [string]$VerifiedBackup.manifest.targetBaselineSha256) { throw 'Task 4 staging isolation evidence is not bound to the verified backup baseline.' }
  if ($payload.observedAtUtc -isnot [string] -or $payload.expiresAtUtc -isnot [string]) { throw 'Task 4 staging isolation evidence timestamps must be JSON strings.' }
  $observed = [DateTimeOffset]::MinValue; $expires = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse([string]$payload.observedAtUtc,[ref]$observed) -or -not [DateTimeOffset]::TryParse([string]$payload.expiresAtUtc,[ref]$expires) -or $observed.Offset -ne [TimeSpan]::Zero -or $expires.Offset -ne [TimeSpan]::Zero -or $expires - $observed -ne [TimeSpan]::FromMinutes($Task4PushIsolationMaxAgeMinutes) -or $observed -gt $NowUtc.ToUniversalTime().AddMinutes(5)) { throw 'Task 4 staging isolation evidence timestamps or freshness window are invalid.' }
  if ($Purpose -in @('Verify','Push') -and $NowUtc.ToUniversalTime() -gt $expires) { throw 'Task 4 staging isolation evidence is stale for the Push window.' }
  if ([string]$payload.liveFrontendSha256 -cne [string]$payload.liveFrontend.snapshotSha256 -or [string]$payload.targetPreWriteSha256 -cne [string]$payload.targetPreWrite.snapshotSha256) { throw 'Task 4 staging isolation evidence snapshot bindings are inconsistent.' }
  if ($null -ne $CurrentLiveFrontend -and ((Get-JsonSha256 -Value $payload.liveFrontend) -cne (Get-JsonSha256 -Value $CurrentLiveFrontend) -or [string]$payload.liveFrontendSha256 -cne [string]$CurrentLiveFrontend.snapshotSha256)) { throw 'Task 4 live frontend isolation changed after Verify.' }
  if ($null -ne $CurrentTargetPreWrite -and ((Get-JsonSha256 -Value $payload.targetPreWrite) -cne (Get-JsonSha256 -Value $CurrentTargetPreWrite) -or [string]$payload.targetPreWriteSha256 -cne [string]$CurrentTargetPreWrite.snapshotSha256)) { throw 'Task 4 target pre-write isolation changed after Verify.' }
  return $payload
}

function Assert-Task4StagingIsolationEvidence {
  param(
    [Parameter(Mandatory)]$VerifiedBackup,
    $CurrentLiveFrontend,
    $CurrentTargetPreWrite,
    [Parameter(Mandatory)][ValidateSet('Verify','Push','Import')][string]$Purpose,
    [DateTimeOffset]$NowUtc = [DateTimeOffset]::UtcNow,
    [string]$ExpectedEvidenceSha256
  )
  $path = Join-Path $ArtifactRoot $Task4IsolationEvidenceName
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Task 4 staging isolation evidence is missing.' }
  Assert-NoReparsePointInPath -Path $path -Label 'Task 4 staging isolation evidence'
  $bytes = [IO.File]::ReadAllBytes((Get-NormalizedPath $path))
  $fileSha256 = Get-Task4BytesSha256 -Bytes $bytes
  if (-not [string]::IsNullOrWhiteSpace($ExpectedEvidenceSha256)) {
    Assert-Task4IsolationSha256 -Value $ExpectedEvidenceSha256 -Label 'Task 4 staging isolation evidence expected file digest'
    if ($fileSha256 -cne $ExpectedEvidenceSha256) { throw 'Task 4 staging isolation evidence file does not match the Push evidence binding.' }
  }
  try { $document = [Text.UTF8Encoding]::new($false,$true).GetString($bytes) | ConvertFrom-Json -ErrorAction Stop }
  catch { throw 'Task 4 staging isolation evidence is not strict UTF-8 JSON.' }
  $payload = Assert-Task4StagingIsolationEvidenceDocument -Document $document -NowUtc $NowUtc -ExpectedContractRunnerSha256 (Get-Task4IsolationContractRunnerSha256) -VerifiedBackup $VerifiedBackup -CurrentLiveFrontend $CurrentLiveFrontend -CurrentTargetPreWrite $CurrentTargetPreWrite -Purpose $Purpose
  return [ordered]@{ payload=$payload; file=[ordered]@{ name=$Task4IsolationEvidenceName; bytes=[int64]$bytes.Length; sha256=$fileSha256 } }
}

function Assert-Task4Quarantine {
  param(
    [Parameter(Mandatory)][ValidateSet('Push','Import')][string]$ExpectedPhase,
    [Parameter(Mandatory)][string]$ExpectedAttemptId,
    $ExpectedDocument
  )
  $path = Join-Path $ArtifactRoot $Task4QuarantineName
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Task 4 target quarantine marker is missing.' }
  Assert-NoReparsePointInPath -Path $path -Label 'Task 4 target quarantine marker'
  try { $document = [Text.UTF8Encoding]::new($false,$true).GetString([IO.File]::ReadAllBytes((Get-NormalizedPath $path))) | ConvertFrom-Json -ErrorAction Stop }
  catch { throw 'Task 4 target quarantine marker is not strict UTF-8 JSON.' }
  Assert-Task4IsolationExactProperties -Value $document -Names @('payload','payloadSha256') -Label 'Task 4 target quarantine envelope'
  Assert-Task4IsolationSha256 -Value $document.payloadSha256 -Label 'Task 4 target quarantine self-hash'
  if ([string]$document.payloadSha256 -cne (Get-JsonSha256 -Value $document.payload)) { throw 'Task 4 target quarantine self-hash is invalid.' }
  $payload = $document.payload
  Assert-Task4IsolationExactProperties -Value $payload -Names @('formatVersion','status','phase','attemptId','createdAtUtc','targetRef','contractRunnerSha256','isolationEvidenceSha256','preWriteObservationSha256','expectedTargetStateSha256') -Label 'Task 4 target quarantine payload'
  Assert-Task4IsolationInteger -Value $payload.formatVersion -Label 'Task 4 target quarantine formatVersion'
  if ([int64]$payload.formatVersion -ne 1 -or $payload.status -isnot [string] -or [string]$payload.status -cne 'active' -or $payload.phase -isnot [string] -or [string]$payload.phase -cne $ExpectedPhase -or $payload.attemptId -isnot [string] -or [string]$payload.attemptId -cne $ExpectedAttemptId -or [string]$payload.attemptId -cnotmatch '^[a-f0-9]{32}$' -or $payload.targetRef -isnot [string] -or [string]$payload.targetRef -cne $ExpectedRef -or $payload.createdAtUtc -isnot [string]) { throw 'Task 4 target quarantine identity, status, or field type is invalid.' }
  foreach ($name in @('contractRunnerSha256','isolationEvidenceSha256','preWriteObservationSha256','expectedTargetStateSha256')) { Assert-Task4IsolationSha256 -Value $payload.$name -Label "Task 4 target quarantine $name" }
  if ([string]$payload.contractRunnerSha256 -cne (Get-Task4IsolationContractRunnerSha256)) { throw 'Task 4 target quarantine marker is stale for the current normalized runner contract.' }
  $created = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse([string]$payload.createdAtUtc,[ref]$created) -or $created.Offset -ne [TimeSpan]::Zero -or $created -gt [DateTimeOffset]::UtcNow.AddMinutes(5)) { throw 'Task 4 target quarantine timestamp is invalid.' }
  if ($null -ne $ExpectedDocument -and (Get-JsonSha256 -Value $document) -cne (Get-JsonSha256 -Value $ExpectedDocument)) { throw 'Task 4 target quarantine marker no longer matches its exact original phase binding.' }
  return $payload
}

function Assert-NoTask4Quarantine {
  $path = Join-Path $ArtifactRoot $Task4QuarantineName
  if (-not (Test-Path -LiteralPath $path)) { return }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Task 4 target quarantine path exists but is not a regular file.' }
  Assert-NoReparsePointInPath -Path $path -Label 'Task 4 target quarantine marker'
  throw 'Task 4 target is quarantined by a retained persistent-phase marker; reviewed recovery is required.'
}

function New-Task4Quarantine {
  param(
    [Parameter(Mandatory)][ValidateSet('Push','Import')][string]$Phase,
    [Parameter(Mandatory)][string]$ContractRunnerSha256,
    [Parameter(Mandatory)][string]$IsolationEvidenceSha256,
    [Parameter(Mandatory)][string]$PreWriteObservationSha256,
    [Parameter(Mandatory)][string]$ExpectedTargetStateSha256,
    [DateTimeOffset]$CreatedAtUtc = [DateTimeOffset]::UtcNow
  )
  foreach ($entry in @(
    @{value=$ContractRunnerSha256;label='Task 4 target quarantine runner digest'},
    @{value=$IsolationEvidenceSha256;label='Task 4 target quarantine isolation evidence digest'},
    @{value=$PreWriteObservationSha256;label='Task 4 target quarantine pre-write observation digest'},
    @{value=$ExpectedTargetStateSha256;label='Task 4 target quarantine expected target state digest'}
  )) { Assert-Task4IsolationSha256 -Value $entry.value -Label $entry.label }
  if ($ContractRunnerSha256 -cne (Get-Task4IsolationContractRunnerSha256)) { throw 'Task 4 target quarantine runner digest does not match the current normalized contract.' }
  Assert-NoTask4Quarantine
  $payload = [ordered]@{
    formatVersion=1; status='active'; phase=$Phase; attemptId=[Guid]::NewGuid().ToString('N')
    createdAtUtc=$CreatedAtUtc.ToUniversalTime().UtcDateTime.ToString('o'); targetRef=$ExpectedRef
    contractRunnerSha256=$ContractRunnerSha256; isolationEvidenceSha256=$IsolationEvidenceSha256
    preWriteObservationSha256=$PreWriteObservationSha256; expectedTargetStateSha256=$ExpectedTargetStateSha256
  }
  $document = [ordered]@{ payload=$payload; payloadSha256=Get-JsonSha256 -Value $payload }
  $path = Join-Path $ArtifactRoot $Task4QuarantineName
  Assert-NoReparsePointInPath -Path $ArtifactRoot -Label 'protected artifact root'
  $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($document | ConvertTo-Json -Depth 50) + "`n")
  $stream = $null
  try {
    $stream = [IO.FileStream]::new((Get-NormalizedPath $path),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $stream.Write($bytes,0,$bytes.Length)
    $stream.Flush($true)
  } finally {
    if ($null -ne $stream) { $stream.Dispose() }
  }
  [void](Assert-Task4Quarantine -ExpectedPhase $Phase -ExpectedAttemptId $payload.attemptId -ExpectedDocument $document)
  return $document
}

function Complete-Task4Quarantine {
  param(
    [Parameter(Mandatory)][ValidateSet('Push','Import')][string]$ExpectedPhase,
    [Parameter(Mandatory)][string]$ExpectedAttemptId,
    [Parameter(Mandatory)]$ExpectedDocument
  )
  [void](Assert-Task4Quarantine -ExpectedPhase $ExpectedPhase -ExpectedAttemptId $ExpectedAttemptId -ExpectedDocument $ExpectedDocument)
  $path = Join-Path $ArtifactRoot $Task4QuarantineName
  Remove-Item -LiteralPath $path -Force
  if (Test-Path -LiteralPath $path) { throw 'Task 4 target quarantine marker could not be cleared after complete revalidation.' }
}

function Get-Task4StandaloneSequenceSpecifications {
  return @(
    [ordered]@{ identity='public.client_invoice_seq'; table='client_invoices'; column='invoice_no'; lastValue=2L; isCalled=$true; startValue=1L; incrementBy=1L },
    [ordered]@{ identity='public.patient_reg_no_seq'; table='patients'; column='reg_no'; lastValue=117L; isCalled=$true; startValue=1L; incrementBy=1L },
    [ordered]@{ identity='public.queue_number_seq'; table='queue_entries'; column='queue_number'; lastValue=1148L; isCalled=$true; startValue=1001L; incrementBy=1L }
  )
}

function Get-Task4BaselineMigrationFiles {
  # UTF-8 gzip of the exact sorted 153-file remote history; each decoded line is a filename.
  $encoded = 'H4sIAAAAAAAEAGWZ684cN3KG/+deGJBVPF4NwWNWwMZBbGWD3H2eGmfj6RYEy5+keadJVtV7YIuX7MUHr75o7CnE0iSIC1Oui6VON3IsLqnMcGMpKax//eM///4v8k9c9FVaD/NOX/dwtUVwvlY3dvNu1hWKH0ev1ycuR59aj7PNmDW4e2W5eHZyQzKP90N2bTLnKE9ciymU7k+tIbTm/GjDxVySa3VHF+vJ8xxt5fo3rqTS78ntpsYS22d/RdwYIzips7Z5fWjSHrjADmPrpdY6UvTuBsk8jyfPkIJbJ66Wdi15jxcuVM09sH1hqS6vy+qiF9ckcZ43j6CzrZnSEyd8re/K8/bW4q4c5VwW+4szOd+GD7eWm3144lQD+8tLNa1V3ck7sD+2Nso5Lu171m1x7/PaX/ZRU4/jnqIzu3Ab+xM9bkRpLsuN1DZr8/uF44Gl1yKllK3Op0Md9ohuatzujMrBzbX9fOxPvA85xF72zbtlT9Umdb/C/u7KbpySZPLjSPuJK5Ik9D0K22BhrI5z2TO6SkuCu5cjLyWO+cRVn6L2lWfIo/CAmZOLWq+rsSW3T41pa6KX6l84ZX9RRXKvqRR/lXOprbLOcd28gOk/9XkVTSM/cUk9c+TnGDf64ubMnOfxx83F4eRa1kpL6Al94pgHEeaoyj5JXfGVdbZ72VrY7qYxdcWqer/2p8F7n4Tntbiow1qOw+M82ziu5sBiU20r+R3X/d6fVPpFkvYa64xXF901pouzFldZupO0ztyjxln8E8fYBulrVyZKmNvqN/POQ+c4lNOH1fLxa7XyjWteQgu1s8rDuVwXRqBfks9AqPtm2DWsUcoML5xG5kgu5JJpzZLyoa8v/dnmZp11Hpa1R3o9TyNH2EtIey74DIZo4E50jaK5cX1KdcBpEp+4CBW2fmXUGZY4Xxb7uzRN3QzhyllyboGj0ReOheZ+S+PAfXCcOvwCgcIvfMPZU4svY5b1whVhALtUX++csMqI9FkokbrTn6eGBU+2NO7XHEVanU2L8RkDuOGlI836pXoY2Jq0SuLp6S6dL1xMifNM9e5AV55gvKTi3VjXwxN7c95j+W/ejUF81hJj36w3S6XFdHp+85P5s58O5c/TU/nzxBUUQvtsek4sG37JnAvj7eqV6fJNcxcfCrz9xNWoUfpoO1+TolU3/XkZ9aZ1uAK1sTWma371dYReGrNc+8k5hHWZ932D8UvmXDihxF/fcpmWo984+WBLh7FqqAfenZSAFmL+MuQEw48kkNK8T1zwiR32PHyJDKFbodl5UoJ2+Bq9fC8/IX+PdSpTFGPowx+oJk0KDThC7a4O9tcGvbrHhsrjE1cYefpzVDilZgTB+Gw0Oi6e5kSRImMEHa/nwZ/B+DMWDr/Qn6hCXDYPfinyVDmkEbev7Y3Lor2F0o5H3xfExfM2+8uYg5uKbNrsyMxvHCtlHnLxmWq3ZHUYInS49dlqWlDpFsNrnRWtDv1DNYEPWoWtzzgXybSPrnXyQJ/a/AUXOBd4BdmJ6N8R6qdKvzRxTFqGmGGhcn/BpdCnIMUFXVkDMxLjQR8aw5vEHylst8XX/mqqKXbZsZaTWN3JzC2kiDINGJ9+v2g8Lfh8HqqY6M+JJCxZl7pTbRQYHtyAc6SnOSUZ4fE8pEQY0k7ZIEDc1W0fXGHer/XL2S16PyXl+cKlgp+gBY9s2Hba1iJtZ8rbeGjLshOyqumJa0lVe6xLbjvVTc/wxhGppNHivbCEYKboigfOeCkl9ocBW8FjrIKdS1D8UlPqF8qo7bTy7E/DNfRPQxh738TgJG+8a4q9m7vmADYusuXnuQRMGc+7u1SOW518ePdiBdmYumvCYIVHOL9xyfwgz0vD50r7uluUfjlMYuW83M7I9JUrTPULR8dr9/BOynu7lZr5kLrp61ldgViwzvgLefAEng7l9L0iBolGc3Cc8SBzNDa2pOKyG0ZLyt0vXMTg9JxSXMqR5GXmdbfNPLBsZCMxY0uGr0+cxAR/riKLf2Xep9VhWck9piJv+AWhZqb9G4cTYY4iNoCGRE3yn76VxUWHlxQcd0GVwhtX0YeAnR8lUu1m/EkqoM8yNn1pLhc1Jya8cdg5/CfC5JPVDzZi3tH3Eowx6PiSWz3ffsJw6o2vl+xPF+I/SSlxKpPYqvlr2cxFOMj3Lzh8XeZHEVol2eihUANLAL0xQDiH1MId8sLRoZwnptZPXGe0qkUTs4YFcVKORxpi0vyquyr/68g6keaaL8eSR/1YJT/w13v4S2hKcbxw0eYPQee4FyksJNM/HDqW1OILKh+X3/nJu6gKK83kh4RrxdIxvPS1XrZ2cEAyOSccNNL56peoRL8OlbVa4d1dLB95Oo54gylELnDJHFk+T1wS8xPIeGmLBqEPeV62FSvjOHUmWn7iEV7nmRKj1VOc0A/GmOhn+QGeqCWSx87B8iir2Y9z4T8qVntTdnADwaZN84NYEBJThr79GBlzVp9zlCEJuq/HRZYaA5+1jOcXvgfDHJ2XZcnjpHjKE5cx9PRZxN3S4JyL5aNo39CoX4InkPwd6IonzlJ06YQvLSFmp6g9/YllHdMvp8SRjWlqc+xfcPDZEqy4ruMQSeYWGqB+Udw5gfoftv/k+Qy/2Dr3CN6+2llGBLcr0rC8heqFf11tPfX2g4u1c5wj0clOpDTL7/h5BNHMAe3Wyqn3eS7hk5H6wYUSaYoTT4sh5mJzVN3CH2Jwxs7+sT+sHjIWesxXR8a6KJmUOsRpOM6FyDMSseOJY2gb7OfJ0wRHvKArTdEHco3Nuw1v3rpIf8jgX7hk+S9ih3qoqIHw6UkMZnrY5EjkDs6acU53EBJeOBq7dMGIJWyfuUfjF3BtKn/Ec89T6Ov6eh5jTT4irCAeFkyX8acEcvFlp1qubrSYR76eh/qpkONIeYi5I9nZOqPlAMAcs2Qs7133vnCcDfO3FCUr/3dLQGQnF8fLdgnxZxLyUm5vnPUZbXSUZOaYGNNbyJexGy7QvShBIl74F45ikFcaMS7iQ8jHxhPBcpU3U7/bXEJkrfuFS5++JlUGxXWeXZblPxKyHnwBap2GIP0nPXCcA46iR4tghrPlmk5TdywdfD09dZyNEPjC0aGJOpCgmizHwdHXC+tSE8/jPM6se2OXnvszFPzCmDVyCTn8JviMs/hTxw4JJChD3/xrncb86HtKt20egEKzv4nTJjfy+LNaFYDpPvsl5I8/u3trSmIXSpt+WaZjaw7m/SDEJ6786pdQtOAL4M5D1m2OMjTzIfA1HA85EX9kblnfPgscScfu65hWggLG+OI2qTs7rQnRJd8EJJn8ouuFk8K5XD/CtQMMjL3NA3x2F3mswHJ4hjbGeeFi/PgCs/XgyhjgGFb0nT5LW3NtExfuXzhLSBneTYwDEjYDn45+mBIiLjvjMsaSgCx+43D45BXyLUYRPoE/F+qFu7g2+YgEPnBHGHI++8xyAFyIH0SRjSJOtJCLWsCf/JZhu0kaXKSkb1y0m5vU8BNh3ANk1DTM101WTNOExl80jyDqY/4SvJQ19JRZoN1+mY2zHECHZ9Zpd0LQXM7EigeOscTq9NMuLoz9qTc/uHBO7W4xfqESxGfSxRsXtJJTD2Gm4nsIuugYO51mRkrbWNOAHayPuqNHgeTYoyy7wMAd097Uz2+76rF7ooYW8K/hyYNsmUDM3EKbKRTSqYkg8ZL+NPm9l+9lsvnbF66ZA+ttwsvDokoaw+5ths07TToERYyYFb0vHCKp5OkJgxazkLjxuBlZAkhwPmT6XU/WB5/BLmJrMH8N46FeGCe7z6LFJkLjlHbFFyp+Ir5xir7jcRgbqobfNLfKEOJBJ2WJJM2hdsv5xkUfu+I9FY9FHQq+jm4zfUCPjDilzqlafsHZfUFpdkFKtc+nDjZ/OhdxXklynAHB642z++STxC5PcI/T7hU/92dMEzErY2Nwb/DeL7ionWhfFAl1hSBOnwXjM75BN4Ek6STkvfaXg/meNjbyaQZ3pk8aRm+Fky30GEEwsd76wn3u9eOAyjEX8KDxmUbqXjF33vgN82LXM08cdiiR47woOmIGCXcVbSiq/4wxm0PeAy7ziWuJx/TdWvOf/LDNhxzM+bRchUJ7nkvyr/LA8avYPYrfd4Vc7CLxc6/orcPt2gi2Qwzy+r4vgMnIqQTArjh4TZe06O1euBDFamUeWHbG9yzJuzxxdkvou6zaGNlsF2b2/qEcJCw2h4De2aBI+faRnOTnri93ZlCk4rMYcOrOR9kfIh8WM8uhb7/GCwelaYegCWanOD/tfjclomaxNzSlHj3VjNYDR8CPKFIfOcjx9sIhzw/vMg+ovNvqh/Cp4tt54jAo1J2uLJp5Xo2Y+mitMnC69pIlpb22lhWfOFSauvt9iJxIQ0PojAev6Qp9tgk0/HE/cmOST5/BZ5PhDZu5hS+tDhFpYKJda3fWIAlYfuIKOUB6QcSXGcB8gGBWvflW5Y/0+7E7x6i/4MhViEGxu2/m1tu91LX7nubdafYChCqmEZ44uwfLfR4UoOztdjK/RCpww+7PKBOFmJDC9/18MtsDN5KreBYHX13+4JLpEQ7M2Tu8fI/iFtMLx7FItzv2OzLuAxX8c46aXaehKnBEJFmF+cTBdNo6rJuul8I6o+X+Zu/jRBwjEsrWih7EFy75gJ84GAo0B17ax3I/50L6dmchpiHcM/P3/Am8zxwxf5gXIjGQxhCSR2gVPLWr+a51A35zfj9Pg6fT0M1wBBpkZBPcbCmaORJC/Jot4w1gyIe//uAK+X2nzU50uiWf9J3MT1jHlZLJB5jS73uGD04bc7tm3KNZn9nLJ+bB3o8xwdNrlREGFvS1Towb+9O5M46crsRe8RTEha5DzFaxC69503eeBhf85/3maYFpyaQGewlB1KcOw4pRaqUTS87f99cfHAMGz2+M9DzkPyYOfrGjJFARz3A3KCi2dDxxnze4vRR+rKSiI8aDx/z8utUpEZX4jrsu6YWTCi/VwD8QyizifOadujfsxQRNgbAHubxwtlb4TMhqWEg+Zfca9ion4pxWoow81N4A/oX78xdM1m3sL04FgtZP7uCEjJywlpSv5oDovnAwL3llkkhMnau3exTLxXUMfAim+5aLKY7riStiPHFlZYIeOQ6+Nz9huZj5m9SVvh/j8d7CflV6NpH/CDiTvt7H7tmJ1m40wr+9ZsiXkDrXNw4dS5GA00nHaIIR0afPkiXdZYluRXwm9iw2/42zl04Yij4geTqf3KF2LpwC/ULHMZZzF7N833xdjCbYXup+rAaxNRci5MT8UT8hhzN9pUF0d7X1jcOmqvlIunqGMTDG3t77Epd4HuvEZWEsFRZs6YHDt5Jw+6JBNQxvb+/sPoTDYYAr/hrru6boDu0bV+15+Ou/jd/3+a3/cX7+/PHbv/3BD+v38/OPPv/jv37b4/f/eWCCmR79J+YfP/748bOPnz/H+tu/n99+9t+xzn88AXSx/P9D1t9//PZj8bF//Dj//den/xf82RvwYiEAAA=='
  $input = [IO.MemoryStream]::new([Convert]::FromBase64String($encoded))
  $gzip = [IO.Compression.GzipStream]::new($input,[IO.Compression.CompressionMode]::Decompress)
  $reader = [IO.StreamReader]::new($gzip,[Text.Encoding]::UTF8)
  try {
    $files = @($reader.ReadToEnd().Trim() -split "`n")
  } finally {
    $reader.Dispose(); $gzip.Dispose(); $input.Dispose()
  }
  if ($files.Count -ne 153 -or @($files | Sort-Object -Unique).Count -ne 153 -or (($files -join "`n") -cne (($files | Sort-Object) -join "`n"))) { throw 'Task 4 baseline migration filename binding is invalid.' }
  return $files
}

function Get-Task4MigrationBindings {
  if ($Task4MigrationSpecifications.Count -ne 8) { throw 'Task 4 migration specification must contain exactly eight entries.' }
  $seenVersions = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  $seenFiles = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($specification in $Task4MigrationSpecifications) {
    if ($specification.version -notmatch '^\d{14}$' -or -not $specification.file.StartsWith(($specification.version + '_'), [StringComparison]::Ordinal) -or
        $specification.sha256 -notmatch '^[A-F0-9]{64}$' -or [string]$specification.name -ne ([IO.Path]::GetFileNameWithoutExtension([string]$specification.file)).Substring(15) -or
        [int]$specification.statementCount -le 0 -or [string]$specification.statementsSha256 -notmatch '^[A-F0-9]{64}$' -or
        -not $seenVersions.Add([string]$specification.version) -or -not $seenFiles.Add([string]$specification.file)) {
      throw 'Task 4 migration specification contains an invalid or duplicate identity.'
    }
    $path = Join-Path $RepositoryRoot ('supabase\migrations\' + $specification.file)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Task 4 migration is missing: $($specification.file)" }
    Assert-NotReparsePoint -Path $path -Label 'Task 4 migration'
    $actualSha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actualSha256 -ne $specification.sha256) { throw "Task 4 migration hash mismatch: $($specification.file)" }
    [ordered]@{ version=[string]$specification.version; file=[string]$specification.file; path=$path; sha256=$actualSha256; name=[string]$specification.name; statementCount=[int]$specification.statementCount; statementsSha256=[string]$specification.statementsSha256 }
  }
}

function Get-Task4MigrationStatements {
  param([Parameter(Mandatory)][AllowEmptyString()][string]$Sql)
  $statements = New-Object 'System.Collections.Generic.List[string]'
  $buffer = New-Object Text.StringBuilder
  $state = 'normal'; $blockDepth = 0; $dollarTag = $null
  $index = 0
  while ($index -lt $Sql.Length) {
    $character = $Sql[$index]
    if ($state -eq 'lineComment') {
      [void]$buffer.Append($character)
      if ($character -eq "`n") { $state = 'normal' }
      $index++; continue
    }
    if ($state -eq 'blockComment') {
      if ($character -eq '/' -and $index + 1 -lt $Sql.Length -and $Sql[$index + 1] -eq '*') { [void]$buffer.Append('/*'); $blockDepth++; $index += 2; continue }
      if ($character -eq '*' -and $index + 1 -lt $Sql.Length -and $Sql[$index + 1] -eq '/') { [void]$buffer.Append('*/'); $blockDepth--; $index += 2; if ($blockDepth -eq 0) { $state = 'normal' }; continue }
      [void]$buffer.Append($character); $index++; continue
    }
    if ($state -eq 'singleQuote') {
      [void]$buffer.Append($character)
      if ($character -eq "'" -and $index + 1 -lt $Sql.Length -and $Sql[$index + 1] -eq "'") { [void]$buffer.Append("'"); $index += 2; continue }
      if ($character -eq "'") { $state = 'normal' }
      $index++; continue
    }
    if ($state -eq 'doubleQuote') {
      [void]$buffer.Append($character)
      if ($character -eq '"' -and $index + 1 -lt $Sql.Length -and $Sql[$index + 1] -eq '"') { [void]$buffer.Append('"'); $index += 2; continue }
      if ($character -eq '"') { $state = 'normal' }
      $index++; continue
    }
    if ($state -eq 'dollarQuote') {
      if ($Sql.Substring($index).StartsWith($dollarTag,[StringComparison]::Ordinal)) { [void]$buffer.Append($dollarTag); $index += $dollarTag.Length; $state = 'normal'; $dollarTag = $null; continue }
      [void]$buffer.Append($character); $index++; continue
    }
    if ($character -eq '-' -and $index + 1 -lt $Sql.Length -and $Sql[$index + 1] -eq '-') { [void]$buffer.Append('--'); $index += 2; $state = 'lineComment'; continue }
    if ($character -eq '/' -and $index + 1 -lt $Sql.Length -and $Sql[$index + 1] -eq '*') { [void]$buffer.Append('/*'); $index += 2; $state = 'blockComment'; $blockDepth = 1; continue }
    if ($character -eq "'") { [void]$buffer.Append($character); $index++; $state = 'singleQuote'; continue }
    if ($character -eq '"') { [void]$buffer.Append($character); $index++; $state = 'doubleQuote'; continue }
    if ($character -eq '$') {
      $match = [regex]::Match($Sql.Substring($index),'^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$')
      if ($match.Success) { $dollarTag = $match.Value; [void]$buffer.Append($dollarTag); $index += $dollarTag.Length; $state = 'dollarQuote'; continue }
    }
    [void]$buffer.Append($character)
    $index++
    if ($character -eq ';') {
      $statement = $buffer.ToString().TrimEnd(';').Trim()
      if (-not [string]::IsNullOrWhiteSpace($statement)) { $statements.Add($statement) }
      [void]$buffer.Clear()
    }
  }
  $statement = $buffer.ToString().TrimEnd(';').Trim()
  if (-not [string]::IsNullOrWhiteSpace($statement)) { $statements.Add($statement) }
  return $statements.ToArray()
}

function Get-Task4MigrationHistorySummary {
  param([Parameter(Mandatory)]$Rows)
  foreach ($row in @($Rows)) {
    if ($row -is [Collections.IDictionary]) {
      foreach ($field in @('version','name','statements')) { if (-not $row.Contains($field)) { throw "Task 4 migration history row is missing $field." } }
      $version = $row['version']; $name = $row['name']; $rawStatements = $row['statements']
    } else {
      foreach ($field in @('version','name','statements')) { if ($null -eq $row.PSObject.Properties[$field]) { throw "Task 4 migration history row is missing $field." } }
      $version = $row.version; $name = $row.name; $rawStatements = $row.statements
    }
    if ($version -isnot [string] -or $name -isnot [string] -or [string]::IsNullOrWhiteSpace($version) -or [string]::IsNullOrWhiteSpace($name) -or
        $null -eq $rawStatements -or $rawStatements -is [string] -or $rawStatements -isnot [Array]) { throw 'Task 4 migration history row has invalid scalar fields or statements array.' }
    $statements = @($rawStatements | ForEach-Object { if ($_ -isnot [string]) { throw 'Task 4 migration history statements must be exact text values.' }; $_ })
    $statementHashes = @($statements | ForEach-Object { Get-StringSha256 -Value $_ })
    [ordered]@{
      version = $version
      name = $name
      statementCount = $statements.Count
      statementsSha256 = Get-StringSha256 -Value ($statementHashes -join "`n")
    }
  }
}

function Assert-Task4MigrationHistoryBindings {
  param([Parameter(Mandatory)]$Migrations,[Parameter(Mandatory)]$Rows)
  $expected = @(Get-PortableTask4MigrationBindings -Migrations $Migrations)
  $summary = @(Get-Task4MigrationHistorySummary -Rows $Rows)
  if ($expected.Count -ne 8 -or $summary.Count -ne 8) { throw 'Task 4 migration history must contain exactly the eight expected rows.' }
  $actual = @()
  for ($index = 0; $index -lt $expected.Count; $index++) {
    $expectedBinding = $expected[$index]; $actualSummary = $summary[$index]
    if ([string]$actualSummary.version -cne [string]$expectedBinding.version -or [string]$actualSummary.name -cne [string]$expectedBinding.name -or
        [int]$actualSummary.statementCount -ne [int]$expectedBinding.statementCount -or [string]$actualSummary.statementsSha256 -cne [string]$expectedBinding.statementsSha256) {
      throw 'Task 4 migration history binding differs from the exact ordered six-field contract.'
    }
    $actual += [ordered]@{ version=[string]$actualSummary.version; file=[string]$expectedBinding.file; sha256=[string]$expectedBinding.sha256; name=[string]$actualSummary.name; statementCount=[int]$actualSummary.statementCount; statementsSha256=[string]$actualSummary.statementsSha256 }
  }
  if ((Get-JsonSha256 -Value $actual) -cne $Task4MigrationHistoryBindingSha256) { throw 'Task 4 ordered migration history summary digest is invalid.' }
  return $actual
}

function Get-Task4MigrationHistoryRows {
  param([Parameter(Mandatory)]$Migrations,[Parameter(Mandatory)][string]$Label)
  $versions = @($Migrations | ForEach-Object { "'$([string]$_.version)'" }) -join ','
  $sql = "select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,'statements',statements) order by version),'[]'::jsonb)::text from (select version,name,to_jsonb(statements) as statements from supabase_migrations.schema_migrations where version in ($versions) order by version) task4_exact_history;"
  $text = Invoke-TargetQueryWithoutOutputLog -Label $Label -Sql $sql
  if ([string]::IsNullOrWhiteSpace($text)) { throw 'Task 4 exact migration history query returned no JSON.' }
  try {
    $parsed = ConvertFrom-Json -InputObject $text
    if ($parsed -is [Array]) { return $parsed }
    return ,$parsed
  } catch {
    throw 'Task 4 exact migration history query returned invalid JSON.'
  }
}

function Get-Task4MigrationWorkdirInventory {
  param([Parameter(Mandatory)][string]$Workdir)
  Assert-NoReparsePointInPath -Path $Workdir -Label 'Task 4 migration workdir'
  $workdirFull = [IO.Path]::GetFullPath($Workdir).TrimEnd('\')
  $supabaseDirectory = Join-Path $workdirFull 'supabase'
  if (-not (Test-Path -LiteralPath $supabaseDirectory -PathType Container)) { throw 'Task 4 migration workdir does not contain supabase.' }
  Assert-NoReparsePointInPath -Path $supabaseDirectory -Label 'Task 4 migration workdir supabase directory'
  $migrationDirectory = Join-Path $supabaseDirectory 'migrations'
  if (-not (Test-Path -LiteralPath $migrationDirectory -PathType Container)) { throw 'Task 4 migration workdir does not contain supabase/migrations.' }
  Assert-NoReparsePointInPath -Path $migrationDirectory -Label 'Task 4 migration workdir directory'
  $migrationDirectoryFull = [IO.Path]::GetFullPath($migrationDirectory).TrimEnd('\')
  $entries = @()
  foreach ($item in @(Get-ChildItem -LiteralPath $migrationDirectory -Force | Sort-Object Name)) {
    if (-not [IO.Path]::GetFullPath($item.FullName).StartsWith(($migrationDirectoryFull + '\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Task 4 migration workdir entry escapes its migration directory.' }
    Assert-NoReparsePointInPath -Path $item.FullName -Label 'Task 4 migration workdir entry'
    if ($item.PSIsContainer) { throw 'Task 4 migration workdir contains a non-file entry.' }
    $entries += [ordered]@{ filename=[string]$item.Name; bytes=[int64]$item.Length; sha256=(Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToUpperInvariant() }
  }
  $lines = @($entries | ForEach-Object { '{0}|{1}|{2}' -f $_.filename,$_.bytes,$_.sha256 })
  return [ordered]@{ files=$entries; sha256=Get-StringSha256 -Value ($lines -join "`n") }
}

function Assert-Task4MigrationWorkdirInventory {
  param([Parameter(Mandatory)]$Inventory,[Parameter(Mandatory)]$Migrations)
  $baseline = @(Get-Task4BaselineMigrationFiles)
  $pending = @(Get-PortableTask4MigrationBindings -Migrations $Migrations)
  if ($baseline.Count -ne 153 -or $pending.Count -ne 8) { throw 'Task 4 workdir contract inputs are incomplete.' }
  $expected = @()
  foreach ($file in $baseline) { $expected += [ordered]@{ filename=[string]$file; bytes=0L; sha256='E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855' } }
  foreach ($migration in $pending) {
    $path = Join-Path $RepositoryRoot ('supabase\migrations\' + $migration.file)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Task 4 pending migration source is missing while validating workdir.' }
    Assert-NotReparsePoint -Path $path -Label 'Task 4 pending migration source'
    $expected += [ordered]@{ filename=[string]$migration.file; bytes=[int64](Get-Item -LiteralPath $path).Length; sha256=[string]$migration.sha256 }
  }
  $expected = @($expected | Sort-Object { [string]$_['filename'] })
  if (@($Inventory.files).Count -ne 161) { throw 'Task 4 migration workdir does not contain exactly 161 files.' }
  for ($index = 0; $index -lt $expected.Count; $index++) {
    $actual = @($Inventory.files)[$index]
    if ([string]$actual.filename -cne [string]$expected[$index].filename -or [int64]$actual.bytes -ne [int64]$expected[$index].bytes -or [string]$actual.sha256 -cne [string]$expected[$index].sha256) { throw "Task 4 migration workdir inventory differs from its exact sorted file contract at index ${index}." }
  }
  $lines = @($expected | ForEach-Object { '{0}|{1}|{2}' -f $_.filename,$_.bytes,$_.sha256 })
  $digest = Get-StringSha256 -Value ($lines -join "`n")
  if ($digest -cne $Task4MigrationWorkdirDigest -or [string]$Inventory.sha256 -cne $digest) { throw 'Task 4 whole workdir inventory digest is invalid.' }
  return $Inventory
}

function Invoke-Task4ScratchMigrations {
  param([Parameter(Mandatory)][string]$Database,[Parameter(Mandatory)]$Migrations)
  $ordered = @($Migrations)
  if ($ordered.Count -eq 0) { throw 'Task 4 scratch migration set is empty.' }
  foreach ($migration in $ordered) {
    if (-not (Test-Path -LiteralPath $migration.path -PathType Leaf) -or
        (Get-FileHash -LiteralPath $migration.path -Algorithm SHA256).Hash.ToUpperInvariant() -ne [string]$migration.sha256) {
      throw "Task 4 scratch migration binding changed: $($migration.file)"
    }
    $existing = Invoke-LocalQuery -Database $Database -Label "check Task 4 migration history $($migration.version)" -Sql "select count(*) from supabase_migrations.schema_migrations where version='$($migration.version)';"
    if (-not [string]::IsNullOrWhiteSpace($existing) -and [int]$existing -ne 0) { throw "Task 4 scratch migration is already recorded: $($migration.version)" }
    Invoke-LocalFile -Database $Database -Path $migration.path -Label "apply Task 4 scratch migration $($migration.file)"
    $statements = @(Get-Task4MigrationStatements -Sql (Get-Content -LiteralPath $migration.path -Raw))
    if ($statements.Count -ne [int]$migration.statementCount) { throw "Task 4 scratch migration parser statement count changed: $($migration.file)" }
    $statementHashes = @($statements | ForEach-Object { Get-StringSha256 -Value $_ })
    if ((Get-StringSha256 -Value ($statementHashes -join "`n")) -cne [string]$migration.statementsSha256) { throw "Task 4 scratch migration parser statement digest changed: $($migration.file)" }
    $encodedStatements = @()
    foreach ($statement in $statements) {
      $tag = 'task4_' + [Guid]::NewGuid().ToString('N')
      while ($statement.IndexOf(('$' + $tag + '$'), [StringComparison]::Ordinal) -ge 0) { $tag = 'task4_' + [Guid]::NewGuid().ToString('N') }
      $encodedStatements += ('$' + $tag + '$' + $statement + '$' + $tag + '$')
    }
    $name = ([IO.Path]::GetFileNameWithoutExtension([string]$migration.file)).Substring(15).Replace("'","''")
    $recordSql = "insert into supabase_migrations.schema_migrations(version,statements,name) values ('$($migration.version)',array[$($encodedStatements -join ',')]::text[],'$name');"
    [void](Invoke-LocalQuery -Database $Database -Label "record task4 migration $($migration.version)" -Sql $recordSql)
    $recorded = Invoke-LocalQuery -Database $Database -Label "verify Task 4 migration history $($migration.version)" -Sql "select count(*) from supabase_migrations.schema_migrations where version='$($migration.version)';"
    if (-not [string]::IsNullOrWhiteSpace($recorded) -and [int]$recorded -ne 1) { throw "Task 4 scratch migration was not recorded exactly once: $($migration.version)" }
  }
}

function Invalidate-EvidenceFile {
  param([Parameter(Mandatory)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $invalidated = "$Path.invalidated-$PID-$([Guid]::NewGuid().ToString('N'))"
  Move-Item -LiteralPath $Path -Destination $invalidated
  Remove-Item -LiteralPath $invalidated -Force
}

function Invalidate-RehearsalEvidence {
  Invalidate-EvidenceFile -Path (Join-Path $ArtifactRoot $ReportName)
  foreach ($name in @($LoaderName, $HeldStaffLoaderName, $AuthLoaderName)) {
    Invalidate-EvidenceFile -Path (Join-Path $ArtifactRoot $name)
  }
}

function Invalidate-BackupEvidence {
  Invalidate-EvidenceFile -Path (Join-Path $ArtifactRoot $BackupManifestName)
  Invalidate-EvidenceFile -Path (Join-Path $ArtifactRoot $BackupHashName)
  Invalidate-EvidenceFile -Path (Join-Path $ArtifactRoot $BackupName)
  Invalidate-RehearsalEvidence
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
  $directHost = "db.$ExpectedRef.supabase.co"
  $isDirect = $uri.Host -eq $directHost -and $username -eq 'postgres'
  $isOfficialPooler = $uri.Host -match '^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$' -and $username -eq "postgres.$ExpectedRef"
  if (-not $isDirect -and -not $isOfficialPooler) {
    throw 'Refusing cutover operation: database host and username are not the exact direct target or an official target pooler.'
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
    [Parameter(Mandatory)][string]$Label,
    [switch]$NoOutputLog
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
  if (-not $NoOutputLog -and $captured.Count -gt 0) { $captured | ForEach-Object { Add-Content -LiteralPath $script:LogPath -Value ([string]$_) -Encoding UTF8 } }
  if ($exitCode -ne 0) {
    if ($NoOutputLog) { throw "$Label failed with exit code $exitCode." }
    throw "$Label failed with exit code $exitCode. See the protected log."
  }
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

function Invoke-TargetQueryWithoutOutputLog {
  param([Parameter(Mandatory)][string]$Sql, [Parameter(Mandatory)][string]$Label)
  $psql = Join-Path $PostgresBin 'psql.exe'
  $queryPath = New-ProtectedSqlFile -Sql $Sql
  $resultPath = Join-Path $ArtifactRoot ('.query-result-{0}-{1}.txt' -f $PID,[Guid]::NewGuid().ToString('N'))
  $errorPath = Join-Path $ArtifactRoot ('.query-error-{0}-{1}.txt' -f $PID,[Guid]::NewGuid().ToString('N'))
  try {
    $commandArguments = @('-X','-A','-t','-q','-v','ON_ERROR_STOP=1') + (Get-TargetArguments) + @('--file',$queryPath,'--output',$resultPath)
    Invoke-WithTargetEnvironment -ReadOnly -Action {
      $priorErrorActionPreference = $ErrorActionPreference
      try {
        $ErrorActionPreference = 'Continue'
        & $psql @commandArguments 2> $errorPath | Out-Null
        $exitCode = $LASTEXITCODE
      } finally {
        $ErrorActionPreference = $priorErrorActionPreference
      }
      if ($exitCode -ne 0) { throw "$Label failed." }
    }
    if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) { throw "$Label produced no protected result file." }
    return (Get-Content -LiteralPath $resultPath -Raw).Trim()
  } finally {
    foreach ($path in @($queryPath,$resultPath,$errorPath)) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force } }
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

function Get-TargetSchemaSha256 {
  $metadataText = Invoke-TargetQuery -Label 'target schema metadata digest input' -Sql @'
select jsonb_build_object(
  'relations', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' or (n.nspname='auth' and c.relname in ('users','identities'))
  ),'[]'::jsonb),
  'columns', coalesce((
    select jsonb_agg(jsonb_build_array(table_schema,table_name,ordinal_position,column_name,data_type,udt_schema,udt_name,is_nullable,column_default,is_identity,is_generated) order by table_schema,table_name,ordinal_position)
    from information_schema.columns
    where table_schema='public' or (table_schema='auth' and table_name in ('users','identities'))
  ),'[]'::jsonb),
  'constraints', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,c.relname,con.conname,con.contype,con.convalidated,pg_get_constraintdef(con.oid,true)) order by n.nspname,c.relname,con.conname)
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' or (n.nspname='auth' and c.relname in ('users','identities'))
  ),'[]'::jsonb),
  'indexes', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,c.relname,i.relname,pg_get_indexdef(i.oid)) order by n.nspname,c.relname,i.relname)
    from pg_index x join pg_class c on c.oid=x.indrelid join pg_namespace n on n.oid=c.relnamespace join pg_class i on i.oid=x.indexrelid
    where n.nspname='public' or (n.nspname='auth' and c.relname in ('users','identities'))
  ),'[]'::jsonb),
  'policies', coalesce((
    select jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) order by schemaname,tablename,policyname)
    from pg_policies where schemaname='public' or (schemaname='auth' and tablename in ('users','identities'))
  ),'[]'::jsonb),
  'functions', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid)) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth')
  ),'[]'::jsonb),
  'triggers', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid,true)) order by n.nspname,c.relname,t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname in ('users','identities')))
  ),'[]'::jsonb),
  'enums', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,t.typname,e.enumsortorder,e.enumlabel) order by n.nspname,t.typname,e.enumsortorder)
    from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','auth')
  ),'[]'::jsonb)
)::text;
'@
  return Get-StringSha256 -Value $metadataText
}

function Get-TargetExtendedSchemaSha256 {
  $metadataText = Invoke-TargetQuery -Label 'target Task 4 extended schema digest input' -Sql @'
select jsonb_build_object(
  'namespaces', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,pg_get_userbyid(n.nspowner),coalesce(n.nspacl::text,'')) order by n.nspname)
    from pg_namespace n where n.nspname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'relations', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner),c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,coalesce(c.relacl::text,''),coalesce(c.reloptions::text,''),coalesce(pg_get_expr(c.relpartbound,c.oid),'')) order by n.nspname,c.relname,c.oid)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'columns', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attisdropped,coalesce(pg_get_expr(d.adbin,d.adrelid),''),coalesce(a.attacl::text,''),a.attstorage,a.attcompression) order by n.nspname,c.relname,a.attnum)
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attnum>0 and n.nspname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'constraints', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,c.relname,con.conname,con.contype,con.convalidated,con.condeferrable,con.condeferred,pg_get_constraintdef(con.oid,true)) order by n.nspname,c.relname,con.conname)
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'indexes', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,c.relname,i.relname,x.indisunique,x.indisprimary,x.indisexclusion,x.indimmediate,x.indisclustered,x.indisvalid,x.indisready,x.indislive,pg_get_indexdef(i.oid)) order by n.nspname,c.relname,i.relname)
    from pg_index x join pg_class c on c.oid=x.indrelid join pg_namespace n on n.oid=c.relnamespace join pg_class i on i.oid=x.indexrelid
    where n.nspname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'policies', coalesce((
    select jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) order by schemaname,tablename,policyname)
    from pg_policies where schemaname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'routines', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prokind,pg_get_userbyid(p.proowner),p.prosecdef,p.proleakproof,p.provolatile,p.proparallel,coalesce(p.proconfig::text,''),coalesce(p.proacl::text,''),case when p.prokind in ('f','p') then pg_get_functiondef(p.oid) else '' end) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'triggers', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true)) order by n.nspname,c.relname,t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'types', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,t.typname,t.typtype,t.typcategory,pg_get_userbyid(t.typowner),coalesce(t.typacl::text,''),t.typnotnull,coalesce(pg_get_expr(t.typdefaultbin,0),t.typdefault,'')) order by n.nspname,t.typname,t.oid)
    from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'enums', coalesce((
    select jsonb_agg(jsonb_build_array(n.nspname,t.typname,e.enumsortorder,e.enumlabel) order by n.nspname,t.typname,e.enumsortorder)
    from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
    where n.nspname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'sequences', coalesce((
    select jsonb_agg(jsonb_build_array(schemaname,sequencename,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size) order by schemaname,sequencename)
    from pg_sequences where schemaname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'extensions', coalesce((
    select jsonb_agg(jsonb_build_array(e.extname,e.extversion,n.nspname,e.extrelocatable) order by e.extname)
    from pg_extension e join pg_namespace n on n.oid=e.extnamespace
  ),'[]'::jsonb),
  'publications', coalesce((
    select jsonb_agg(jsonb_build_array(pubname,puballtables,pubinsert,pubupdate,pubdelete,pubtruncate,pubviaroot) order by pubname) from pg_publication
  ),'[]'::jsonb),
  'publicationRelations', coalesce((
    select jsonb_agg(jsonb_build_array(pubname,schemaname,tablename) order by pubname,schemaname,tablename) from pg_publication_tables
  ),'[]'::jsonb),
  'defaultPrivileges', coalesce((
    select jsonb_agg(jsonb_build_array(coalesce(n.nspname,''),pg_get_userbyid(d.defaclrole),d.defaclobjtype,coalesce(d.defaclacl::text,'')) order by coalesce(n.nspname,''),pg_get_userbyid(d.defaclrole),d.defaclobjtype)
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    where n.nspname is null or n.nspname in ('public','auth','storage','private','extensions','supabase_migrations')
  ),'[]'::jsonb),
  'eventTriggers', coalesce((
    select jsonb_agg(jsonb_build_array(evtname,evtevent,evtenabled,evtfoid::regprocedure::text,coalesce(evttags::text,'')) order by evtname) from pg_event_trigger
  ),'[]'::jsonb)
)::text;
'@
  return Get-StringSha256 -Value $metadataText
}

function Get-TargetInventory {
  param([switch]$IncludeTask4Contract)
  $publicTables = [int](Invoke-TargetQuery -Label 'target public-table inventory' -Sql "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")
  $authUsers = [int](Invoke-TargetQuery -Label 'target Auth user inventory' -Sql 'select count(*) from auth.users;')
  $authIdentities = [int](Invoke-TargetQuery -Label 'target Auth identity inventory' -Sql 'select count(*) from auth.identities;')
  $migrationRows = [int](Invoke-TargetQuery -Label 'target migration inventory' -Sql 'select count(*) from supabase_migrations.schema_migrations;')
  $migrationText = Invoke-TargetQuery -Label 'target migration identity inventory' -Sql "select coalesce(jsonb_agg(version order by version),'[]'::jsonb)::text from supabase_migrations.schema_migrations;"
  $migrationIdentities = @(ConvertFrom-JsonArray -Text $migrationText)
  $migrationIdentitiesSha256 = Get-StringSha256 -Value ($migrationIdentities -join "`n")
  $schemaSha256 = Get-TargetSchemaSha256
  $inventory = [ordered]@{
    projectRef = $ExpectedRef
    publicTables = $publicTables
    authUsers = $authUsers
    authIdentities = $authIdentities
    migrationRows = $migrationRows
    migrationIdentities = $migrationIdentities
    migrationIdentitiesSha256 = $migrationIdentitiesSha256
    schemaSha256 = $schemaSha256
  }
  if ($IncludeTask4Contract) { $inventory['extendedSchemaSha256'] = Get-TargetExtendedSchemaSha256 }
  return $inventory
}

function Assert-RehearsalBinding {
  param([Parameter(Mandatory)]$Expected, [Parameter(Mandatory)]$Actual)
  if ((Get-JsonSha256 -Value $Expected) -ne (Get-JsonSha256 -Value $Actual)) {
    throw 'Rehearsal evidence binding does not match the current runner, loaders, archive, backup, baseline, and migrations.'
  }
}

function Assert-TargetBaselineUnchanged {
  param([Parameter(Mandatory)]$Expected, [Parameter(Mandatory)]$Actual)
  if ((Get-JsonSha256 -Value $Expected) -ne (Get-JsonSha256 -Value $Actual)) {
    throw 'Target baseline changed after the completed backup and rehearsal.'
  }
}

function Get-PortableTask4MigrationBindings {
  param([Parameter(Mandatory)]$Migrations)
  foreach ($migration in @($Migrations)) {
    $binding = [ordered]@{ version=[string]$migration.version; file=[string]$migration.file; sha256=([string]$migration.sha256).ToUpperInvariant() }
    if ($null -ne $migration.name -or $null -ne $migration.statementCount -or $null -ne $migration.statementsSha256) {
      if ([string]::IsNullOrWhiteSpace([string]$migration.name) -or [int]$migration.statementCount -le 0 -or [string]$migration.statementsSha256 -notmatch '^[A-F0-9]{64}$') { throw 'Task 4 migration portable binding is missing an exact history field.' }
      $binding['name'] = [string]$migration.name
      $binding['statementCount'] = [int]$migration.statementCount
      $binding['statementsSha256'] = ([string]$migration.statementsSha256).ToUpperInvariant()
    }
    $binding
  }
}

function Get-Task4LegacyMigrationBindings {
  param([Parameter(Mandatory)]$Migrations)
  foreach ($migration in @($Migrations)) {
    [ordered]@{ version=[string]$migration.version; file=[string]$migration.file; sha256=([string]$migration.sha256).ToUpperInvariant() }
  }
}

function New-PostMigrationExpectedInventory {
  param(
    [Parameter(Mandatory)]$PreBaseline,
    [Parameter(Mandatory)]$Migrations,
    [Parameter(Mandatory)][int]$PublicTables,
    [Parameter(Mandatory)][string]$SchemaSha256,
    [Parameter(Mandatory)][string]$ExtendedSchemaSha256
  )
  if ($SchemaSha256 -notmatch '^[A-Fa-f0-9]{64}$' -or $ExtendedSchemaSha256 -notmatch '^[A-Fa-f0-9]{64}$') { throw 'Expected post-migration schema digests are invalid.' }
  $preIdentities = @($PreBaseline.migrationIdentities | ForEach-Object { [string]$_ })
  if ([int]$PreBaseline.migrationRows -ne $preIdentities.Count -or
      (Get-StringSha256 -Value ($preIdentities -join "`n")) -ne ([string]$PreBaseline.migrationIdentitiesSha256).ToUpperInvariant()) {
    throw 'Pre-migration identity set is not internally consistent.'
  }
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($identity in $preIdentities) { if (-not $seen.Add($identity)) { throw 'Pre-migration identity set contains a duplicate.' } }
  $portableMigrations = @(Get-PortableTask4MigrationBindings -Migrations $Migrations)
  foreach ($migration in $portableMigrations) {
    if ($migration.version -notmatch '^\d{14}$' -or $migration.file -notlike ($migration.version + '_*.sql') -or $migration.sha256 -notmatch '^[A-F0-9]{64}$' -or -not $seen.Add($migration.version)) {
      throw 'Post-migration identity derivation received an invalid or pre-existing migration.'
    }
  }
  $postIdentities = $preIdentities + @($portableMigrations | ForEach-Object { $_.version })
  return [ordered]@{
    projectRef = [string]$PreBaseline.projectRef
    publicTables = $PublicTables
    authUsers = 0
    authIdentities = 0
    migrationRows = $postIdentities.Count
    migrationIdentities = $postIdentities
    migrationIdentitiesSha256 = Get-StringSha256 -Value ($postIdentities -join "`n")
    schemaSha256 = $SchemaSha256.ToUpperInvariant()
    extendedSchemaSha256 = $ExtendedSchemaSha256.ToUpperInvariant()
  }
}

function Assert-PostMigrationTransitionManifest {
  param(
    [Parameter(Mandatory)]$Manifest,
    [Parameter(Mandatory)]$VerifiedBackup,
    [Parameter(Mandatory)]$RehearsalReport,
    [Parameter(Mandatory)]$Migrations,
    [Parameter(Mandatory)]$Authorization
  )
  if ($null -eq $Manifest.payload -or ([string]$Manifest.payloadSha256).ToUpperInvariant() -ne (Get-JsonSha256 -Value $Manifest.payload)) { throw 'Post-migration transition manifest digest is invalid.' }
  $payload = $Manifest.payload
  if ($payload.formatVersion -ne 1 -or $payload.status -ne 'completed' -or $payload.targetRef -ne $ExpectedRef) { throw 'Post-migration transition manifest identity or status is invalid.' }
  if ([string]$payload.preBaselineSha256 -cne [string]$VerifiedBackup.manifest.targetBaselineSha256) { throw 'Transition manifest is not bound to the verified pre-migration baseline.' }
  if ([string]$payload.rehearsalBindingSha256 -cne [string]$RehearsalReport.currentBindingSha256) { throw 'Transition manifest is not bound to the current rehearsal artifacts and runner.' }
  if ([string]$payload.authorizationSha256 -cne [string]$Authorization.sha256) { throw 'Transition manifest is not bound to the approved rollback-validation evidence.' }
  $portableMigrations = @(Get-PortableTask4MigrationBindings -Migrations $Migrations)
  if ((Get-JsonSha256 -Value @($payload.migrations)) -ne (Get-JsonSha256 -Value $portableMigrations)) { throw 'Transition manifest migration set is not the exact current binding.' }
  if ((Get-JsonSha256 -Value $payload.expectedPostMigration) -ne (Get-JsonSha256 -Value $Authorization.expectedPersistentPost)) { throw 'Transition manifest expected post-state is not externally authorized.' }
  $derived = New-PostMigrationExpectedInventory -PreBaseline $VerifiedBackup.manifest.targetBaseline -Migrations $portableMigrations -PublicTables ([int]$payload.expectedPostMigration.publicTables) -SchemaSha256 ([string]$payload.expectedPostMigration.schemaSha256) -ExtendedSchemaSha256 ([string]$payload.expectedPostMigration.extendedSchemaSha256)
  if ((Get-JsonSha256 -Value $derived) -ne (Get-JsonSha256 -Value $payload.expectedPostMigration)) { throw 'Transition manifest post-state is not exactly derivable from the verified baseline and migrations.' }
  if ($portableMigrations.Count -eq 8 -and ($derived.publicTables -ne 102 -or $derived.authUsers -ne 0 -or $derived.authIdentities -ne 0 -or $derived.migrationRows -ne 161)) { throw 'Transition manifest does not describe the exact Task 4 pre-import target state.' }
  return $payload.expectedPostMigration
}

function Assert-PostMigrationTargetState {
  param([Parameter(Mandatory)]$Expected,[Parameter(Mandatory)]$Actual)
  if ([int]$Actual.authUsers -ne 0 -or [int]$Actual.authIdentities -ne 0) { throw 'Post-migration target contains Auth rows; refusing a non-idempotent import or retry.' }
  if ((Get-JsonSha256 -Value $Expected) -ne (Get-JsonSha256 -Value $Actual)) { throw 'Target does not match the exact completed post-migration transition state.' }
  return $Actual
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
  if ($targetInventory.publicTables -ne 93 -or $targetInventory.authUsers -ne 0 -or $targetInventory.authIdentities -ne 0 -or $targetInventory.migrationRows -ne 153) {
    throw 'Target baseline no longer matches the approved 93-table, zero-user, zero-identity, 153-migration inventory.'
  }
  Write-Summary "Inventory passed: source public tables=94; target public tables=93; target Auth users=0; target migrations=153; target ref=$ExpectedRef."
  return $inventory
}

function Assert-VerifiedBackup {
  $backup = Join-Path $ArtifactRoot $BackupName
  $hashFile = Join-Path $ArtifactRoot $BackupHashName
  $manifestPath = Join-Path $ArtifactRoot $BackupManifestName
  if (-not (Test-Path -LiteralPath $backup -PathType Leaf) -or
      -not (Test-Path -LiteralPath $hashFile -PathType Leaf) -or
      -not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'A completed backup, digest, and manifest are required before this phase.'
  }
  Assert-NotReparsePoint -Path $backup -Label 'target backup'
  Assert-NotReparsePoint -Path $hashFile -Label 'target backup digest'
  Assert-NotReparsePoint -Path $manifestPath -Label 'target backup manifest'
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.formatVersion -ne 1 -or $manifest.backup.file -ne $BackupName -or $manifest.sourceArchiveSha256 -ne $ApprovedArchiveSha256) {
    throw 'Target backup manifest identity is invalid.'
  }
  $expected = ((Get-Content -LiteralPath $hashFile -Raw).Trim() -split '\s+')[0].ToUpperInvariant()
  if ($expected -notmatch '^[A-F0-9]{64}$') { throw 'Target backup digest file is invalid.' }
  $actual = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToUpperInvariant()
  $bytes = (Get-Item -LiteralPath $backup).Length
  if ($actual -ne $expected -or $actual -ne ([string]$manifest.backup.sha256).ToUpperInvariant() -or $bytes -ne [int64]$manifest.backup.bytes) {
    throw 'Target backup artifact does not match its completed manifest and digest.'
  }
  $targetBaselineSha256 = Get-JsonSha256 -Value $manifest.targetBaseline
  if ($targetBaselineSha256 -ne ([string]$manifest.targetBaselineSha256).ToUpperInvariant()) {
    throw 'Target backup manifest baseline digest is invalid.'
  }
  [void](Get-ArchiveToc -Archive $backup -Label 'target backup list validation')
  return [ordered]@{
    path = $backup
    sha256 = $actual
    bytes = $bytes
    manifest = $manifest
    manifestPath = $manifestPath
    manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToUpperInvariant()
  }
}

function Invoke-BackupPhase {
  [void](Invoke-InventoryPhase)
  $inventory = Get-Content -LiteralPath (Join-Path $ArtifactRoot $InventoryName) -Raw | ConvertFrom-Json
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
    $manifest = [ordered]@{
      formatVersion = 1
      completedAtUtc = [DateTime]::UtcNow.ToString('o')
      sourceArchiveSha256 = $ApprovedArchiveSha256
      backup = [ordered]@{ file = $BackupName; sha256 = $hash; bytes = (Get-Item -LiteralPath $backup).Length }
      targetBaseline = $inventory.target
      targetBaselineSha256 = Get-JsonSha256 -Value $inventory.target
    }
    Write-ProtectedJson -Path (Join-Path $ArtifactRoot $BackupManifestName) -Value $manifest
    [void](Assert-VerifiedBackup)
    Write-Summary "Backup passed: $BackupName is non-empty, list-valid, and bound to a completed SHA-256 manifest in the protected artifact root."
  } catch {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    Invalidate-BackupEvidence
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
  if not exists (select 1 from pg_roles where rolname = 'dashboard_user') then create role dashboard_user nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'pgbouncer') then create role pgbouncer nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'sandbox_exec') then create role sandbox_exec nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_functions_admin') then create role supabase_functions_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_realtime_admin') then create role supabase_realtime_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin; end if;
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
  if ($Scope -eq 'storage') { return $Descriptor -match '\s+storage\s+' }
  if ($Scope -eq 'staff') { return $Descriptor -match '\s+public\s+staff_messages(\s+|$)' }
  return $false
}

function Get-TocId {
  param([Parameter(Mandatory)][string]$Line)
  if ($Line -notmatch '^\s*(\d+);') { throw 'Archive TOC line does not contain a valid dump ID.' }
  return [string]$Matches[1]
}

function Assert-UniqueTocSelections {
  param([Parameter(Mandatory)]$Selections)
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($selection in @($Selections)) {
    foreach ($line in @($selection)) {
      $id = Get-TocId -Line ([string]$line)
      if (-not $seen.Add($id)) { throw "Archive TOC dump ID was selected more than once: $id" }
    }
  }
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

function Write-TocPatternSelection {
  param(
    [Parameter(Mandatory)][string[]]$Toc,
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string[]]$Patterns
  )
  $selected = New-Object 'System.Collections.Generic.List[string]'
  $selectedIds = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($pattern in $Patterns) {
    $matches = @($Toc | Where-Object { (Get-TocDescriptor $_) -match $pattern })
    if ($matches.Count -ne 1) { throw "Archive prerequisite pattern must match exactly once: $pattern" }
    $id = Get-TocId -Line $matches[0]
    if (-not $selectedIds.Add($id)) { throw "Archive prerequisite patterns overlap on TOC dump ID: $id" }
    $selected.Add($matches[0])
  }
  Write-Utf8NoBom -Path $Path -Content (($selected -join "`n") + "`n")
}

function Restore-TocSelection {
  param([string]$Archive, [string]$Database, [string]$ListPath, [string]$Label)
  $restore = Join-Path $PostgresBin 'pg_restore.exe'
  $args = @('--exit-on-error','--use-list',$ListPath,'--host','127.0.0.1','--port',[string]$script:LocalPort,'--username','postgres','--dbname',$Database,$Archive)
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

function Get-Task4ScratchPrerequisiteSql {
  return @'
select jsonb_build_object(
  'pgJsonschema',exists(select 1 from pg_available_extensions where name='pg_jsonschema'),
  'storageBuckets',to_regclass('storage.buckets') is not null,
  'storageObjects',to_regclass('storage.objects') is not null,
  'storageFoldername',to_regprocedure('storage.foldername(text)') is not null,
  'dailyReportsBucket',exists(select 1 from storage.buckets where id='daily-reports' and public=false),
  'legacyPolicies',(select count(*) from (values
    ('public','clinic_reviews','Public can read clinic_reviews active'),
    ('public','attendance_records','Staff can view own attendance'),('public','attendance_records','Staff can insert own attendance'),
    ('public','daily_reports','Staff can view own daily reports'),('public','daily_reports','Staff can insert own daily reports'),('public','daily_reports','Staff can update own daily reports'),
    ('storage','objects','Staff view own daily report files'),('storage','objects','Staff can upload own daily report files'),('storage','objects','Staff can update own daily report files'),('storage','objects','Staff can delete own daily report files')
  ) expected(schemaname,tablename,policyname) where exists(select 1 from pg_policies actual where actual.schemaname=expected.schemaname and actual.tablename=expected.tablename and actual.policyname=expected.policyname)),
  'clinicSlugUnique',exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid='public.clinic_services'::regclass and (i.indisunique or i.indisprimary) and a.attname='slug'),
  'publication',exists(select 1 from pg_publication where pubname='supabase_realtime'),
  'isStaffOrAdmin',to_regprocedure('public.is_staff_or_admin(uuid)') is not null,
  'isClinical',to_regprocedure('public.is_clinical(uuid)') is not null,
  'isStaffOrClinical',to_regprocedure('public.is_staff_or_clinical(uuid)') is not null,
  'privateSafe',not exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='private' and a.privilege_type='CREATE' and (a.grantee=0 or a.grantee in (select oid from pg_roles where rolname in ('anon','authenticated'))))
)::text;
'@
}

function Assert-Task4PrerequisiteResult {
  param([Parameter(Mandatory)]$Result)
  if ([int]$Result.legacyPolicies -ne 10) { throw 'Task 4 prerequisite failed: legacyPolicies' }
  foreach ($field in @('pgJsonschema','storageBuckets','storageObjects','storageFoldername','dailyReportsBucket','clinicSlugUnique','publication','isStaffOrAdmin','isClinical','isStaffOrClinical','privateSafe')) {
    if (-not [bool]$Result.$field) { throw "Task 4 prerequisite failed: $field" }
  }
}

function Assert-Task4ScratchPrerequisites {
  param([Parameter(Mandatory)][string]$Database)
  $result = (Invoke-LocalQuery -Database $Database -Label 'task 4 scratch schema and dependency gates' -Sql (Get-Task4ScratchPrerequisiteSql)) | ConvertFrom-Json
  Assert-Task4PrerequisiteResult -Result $result
}

function Get-Task4PostContractSql {
  return @'
select jsonb_build_object(
  'publicTables',(select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'),
  'pgJsonschemaExact',exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_jsonschema' and e.extversion='0.3.3' and n.nspname='extensions') and to_regprocedure('extensions.jsonb_matches_schema(json,jsonb)') is not null,
  'task4Tables',(select count(*) from (values ('website_pages'),('website_page_drafts'),('website_content_drafts'),('website_content_versions'),('website_navigation_items'),('website_navigation_drafts'),('website_review_presentations'),('website_tracking_settings'),('staff_messages')) expected(name) where to_regclass('public.'||expected.name) is not null),
  'privateSafe',(not exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='private' and a.privilege_type='CREATE' and (a.grantee=0 or a.grantee in (select oid from pg_roles where rolname in ('anon','authenticated'))))) and has_schema_privilege('authenticated','private','USAGE'),
  'privateHelpers',to_regprocedure('private.can_manage_website()') is not null and to_regprocedure('private.can_manage_tracking_settings()') is not null,
  'staffHelpers',to_regprocedure('public.is_staff_or_admin(uuid)') is not null and to_regprocedure('public.is_clinical(uuid)') is not null and to_regprocedure('public.is_staff_or_clinical(uuid)') is not null,
  'storageSurface',to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null and to_regprocedure('storage.foldername(text)') is not null,
  'websiteMediaBucketExact',exists(select 1 from storage.buckets where id='website-media' and name='website-media' and public and file_size_limit=26214400 and allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm']::text[]),
  'dailyReportsBucketPrivate',exists(select 1 from storage.buckets where id='daily-reports' and name='daily-reports' and public=false),
  'googleTagSeed',(select count(*)=1 from public.website_tracking_settings) and exists(select 1 from public.website_tracking_settings where provider='google_tag' and enabled=false and pixel_id is null and measurement_id is null and ads_conversion_id is null and ads_conversion_labels='{}'::jsonb and consent_version=1 and updated_by is null),
  'clinicSlugUnique',exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid='public.clinic_services'::regclass and (i.indisunique or i.indisprimary) and a.attname='slug'),
  'realtime',exists(select 1 from pg_publication where pubname='supabase_realtime') and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='staff_messages'),
  'columnsExact',not exists(select 1 from (values
    ('appointments','patient_ic','text','YES',null),('appointments','service_slug','text','YES',null),('appointments','payment_reference','text','YES',null),('appointments','updated_at','timestamptz','YES','now()'),
    ('queue_entries','cancelled_at','timestamptz','YES',null),('queue_entries','cancelled_by','uuid','YES',null),('queue_entries','cancellation_reason','text','YES',null),('queue_entries','queue_sequence','int4','YES',null)
  ) expected(table_name,column_name,udt_name,is_nullable,column_default) where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=expected.table_name and c.column_name=expected.column_name and c.udt_name=expected.udt_name and c.is_nullable=expected.is_nullable and c.column_default is not distinct from expected.column_default)),
  'appointmentsFkExact',exists(select 1 from pg_constraint c where c.conrelid='public.appointments'::regclass and c.conname='appointments_service_slug_fkey' and c.contype='f' and c.confrelid='public.clinic_services'::regclass and c.confupdtype='a' and c.confdeltype='a' and c.confmatchtype='s' and c.convalidated and not c.condeferrable and pg_get_constraintdef(c.oid,true) is not null and c.conkey=ARRAY[(select attnum from pg_attribute where attrelid='public.appointments'::regclass and attname='service_slug')]::smallint[] and c.confkey=ARRAY[(select attnum from pg_attribute where attrelid='public.clinic_services'::regclass and attname='slug')]::smallint[]),
  'queueFkExact',exists(select 1 from pg_constraint c where c.conrelid='public.queue_entries'::regclass and c.conname='queue_entries_cancelled_by_fkey' and c.contype='f' and c.confrelid='auth.users'::regclass and c.confupdtype='a' and c.confdeltype='a' and c.confmatchtype='s' and c.convalidated and not c.condeferrable and pg_get_constraintdef(c.oid,true) is not null and c.conkey=ARRAY[(select attnum from pg_attribute where attrelid='public.queue_entries'::regclass and attname='cancelled_by')]::smallint[] and c.confkey=ARRAY[(select attnum from pg_attribute where attrelid='auth.users'::regclass and attname='id')]::smallint[]),
  'staffMessagesExact',exists(select 1 from pg_class where oid='public.staff_messages'::regclass and relrowsecurity) and (select count(*) from pg_policies where schemaname='public' and tablename='staff_messages' and policyname in ('staff_messages_staff_read','staff_messages_staff_send'))=2 and (select count(*) from pg_constraint where conrelid='public.staff_messages'::regclass and contype='f' and confrelid='auth.users'::regclass and confdeltype='c' and convalidated)=2
)::text;
'@
}

function Assert-Task4PostContractResult {
  param([Parameter(Mandatory)]$Result)
  if ([int]$Result.publicTables -ne 102 -or [int]$Result.task4Tables -ne 9) { throw 'Task 4 post-migration table surface is not exact.' }
  foreach ($field in @('pgJsonschemaExact','privateSafe','privateHelpers','staffHelpers','storageSurface','websiteMediaBucketExact','dailyReportsBucketPrivate','googleTagSeed','clinicSlugUnique','realtime','columnsExact','appointmentsFkExact','queueFkExact','staffMessagesExact')) {
    if (-not [bool]$Result.$field) { throw "Task 4 exact schema/dependency contract failed: $field" }
  }
}

function Assert-Task4LocalSchemaAndDependencies {
  param([Parameter(Mandatory)][string]$Database)
  $result = (Invoke-LocalQuery -Database $Database -Label 'task 4 local post-migration schema contract' -Sql (Get-Task4PostContractSql)) | ConvertFrom-Json
  Assert-Task4PostContractResult -Result $result
}

function Assert-Task4SchemaAndDependencies {
  $result = (Invoke-TargetQuery -Label 'Task 4 exact target schema and dependency contract' -Sql (Get-Task4PostContractSql)) | ConvertFrom-Json
  Assert-Task4PostContractResult -Result $result
  return $result
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
  $allowedDefaultDifferences = @()
  $blockingDefaultDifferences = @()
  $nullabilityDifferences = @()
  $sourceOnlyDetails = @()
  $targetRequiredOnlyDetails = @()
  $typeDifferenceDetails = @()
  $defaultDifferenceDetails = @()
  $nullabilityDifferenceDetails = @()
  $matchedTargetKeys = @{}
  foreach ($key in @($sourceMap.Keys | Sort-Object)) {
    $targetKey = $key
    if (-not $targetMap.ContainsKey($targetKey) -and $key.StartsWith('public.appointments.', [StringComparison]::Ordinal)) {
      $sourceColumn = $key.Substring('public.appointments.'.Length)
      if ($AppointmentColumnMap.Contains($sourceColumn)) {
        $targetKey = 'public.appointments.' + $AppointmentColumnMap[$sourceColumn]
      }
    }
    if (-not $targetMap.ContainsKey($targetKey)) {
      $left = $sourceMap[$key]
      $sourceOnly += $key
      $sourceOnlyDetails += [ordered]@{ identity = $key; dataType = $left.data_type; udtSchema = $left.udt_schema; udtName = $left.udt_name; nullable = $left.is_nullable; default = $left.column_default; identityColumn = $left.is_identity; generated = $left.is_generated }
      continue
    }
    $matchedTargetKeys[$targetKey] = $true
    $left = $sourceMap[$key]
    $right = $targetMap[$targetKey]
    $comparisonIdentity = if ($targetKey -eq $key) { $key } else { "$key -> $targetKey" }
    if ($left.data_type -ne $right.data_type -or $left.udt_schema -ne $right.udt_schema -or $left.udt_name -ne $right.udt_name) {
      $typeDifferences += $comparisonIdentity
      $typeDifferenceDetails += [ordered]@{ identity = $comparisonIdentity; source = [ordered]@{ dataType = $left.data_type; udtSchema = $left.udt_schema; udtName = $left.udt_name }; target = [ordered]@{ dataType = $right.data_type; udtSchema = $right.udt_schema; udtName = $right.udt_name } }
    }
    if ($left.is_nullable -ne $right.is_nullable) {
      $nullabilityDifferences += $comparisonIdentity
      $nullabilityDifferenceDetails += [ordered]@{ identity = $comparisonIdentity; sourceNullable = $left.is_nullable; targetNullable = $right.is_nullable }
    }
    if ([string]$left.column_default -ne [string]$right.column_default) {
      $defaultDifferences += $comparisonIdentity
      $defaultDifferenceDetails += [ordered]@{ identity = $comparisonIdentity; sourceDefault = $left.column_default; targetDefault = $right.column_default }
      if ($comparisonIdentity -eq 'public.appointments.status' -and
          [string]$left.column_default -eq "'pending_payment'::text" -and
          [string]$right.column_default -eq "'pending'::text") {
        $allowedDefaultDifferences += $comparisonIdentity
      } else {
        $blockingDefaultDifferences += $comparisonIdentity
      }
    }
  }
  foreach ($key in @($targetMap.Keys | Sort-Object)) {
    if ($matchedTargetKeys.ContainsKey($key)) { continue }
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
    nullabilityDifferences = $nullabilityDifferences
    nullabilityDifferenceDetails = $nullabilityDifferenceDetails
    defaultDifferences = $defaultDifferences
    defaultDifferenceDetails = $defaultDifferenceDetails
    allowedDefaultDifferences = $allowedDefaultDifferences
    blockingDefaultDifferences = $blockingDefaultDifferences
  }
}

function Classify-NullabilityDifferences {
  param([Parameter(Mandatory)][object[]]$Details, [Parameter(Mandatory)][hashtable]$SourceNullCounts)
  $allowed = @()
  $blocking = @()
  foreach ($detail in $Details) {
    $identity = [string]$detail.identity
    if ($detail.sourceNullable -eq 'YES' -and $detail.targetNullable -eq 'NO' -and
        $SourceNullCounts.ContainsKey($identity) -and [int64]$SourceNullCounts[$identity] -eq 0) {
      $allowed += $identity
    } else {
      $blocking += $identity
    }
  }
  return [ordered]@{ allowed = $allowed; blocking = $blocking }
}

function Get-SourceNullCounts {
  param([Parameter(Mandatory)][string]$Database, [Parameter(Mandatory)][object[]]$Details)
  $counts = @{}
  foreach ($detail in $Details) {
    $sourceIdentity = ([string]$detail.identity -split ' -> ', 2)[0]
    if ($sourceIdentity -notmatch '^(?<schema>[a-z_][a-z0-9_]*)\.(?<table>[a-z_][a-z0-9_]*)\.(?<column>[a-z_][a-z0-9_]*)$') {
      throw 'Refusing invalid source nullability identity.'
    }
    $sql = 'select count(*) from "{0}"."{1}" where "{2}" is null;' -f $Matches.schema,$Matches.table,$Matches.column
    $counts[[string]$detail.identity] = [int64](Invoke-LocalQuery -Database $Database -Sql $sql -Label "source nullability check for $sourceIdentity")
  }
  return $counts
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

function Get-TargetTableCounts {
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
  return (Invoke-TargetQuery -Sql $sql -Label 'post-import target table counts') | ConvertFrom-Json
}

function Get-SequenceCheckSql {
  return @'
with inventory as (
  select array_agg(format('%s.%s',n.nspname,c.relname) order by n.nspname,c.relname) as identities
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='S' and n.nspname='public'
), checks as (
  select 'public.client_invoice_seq'::text as sequence_identity,
         'public.client_invoices.invoice_no'::text as bound_data,
         2::numeric as expected_last_value,true as expected_is_called,
         (select last_value::numeric from public.client_invoice_seq) as actual_last_value,
         (select is_called from public.client_invoice_seq) as actual_is_called,
         (select max(substring(invoice_no from '-([0-9]+)$')::numeric) from public.client_invoices where invoice_no ~ '-[0-9]+$') as data_boundary,
         (select seqstart=1 and seqincrement=1 and seqmin=1 and seqmax=9223372036854775807 and not seqcycle and seqcache=1
            from pg_sequence where seqrelid='public.client_invoice_seq'::regclass)
           and not exists(select 1 from pg_depend where objid='public.client_invoice_seq'::regclass and deptype in ('a','i')) as config_matches
  union all
  select 'public.patient_reg_no_seq','public.patients.reg_no',117,true,
         (select last_value::numeric from public.patient_reg_no_seq),
         (select is_called from public.patient_reg_no_seq),
         (select max(substring(reg_no from '^KA-([0-9]+)$')::numeric) from public.patients where reg_no ~ '^KA-[0-9]+$'),
         (select seqstart=1 and seqincrement=1 and seqmin=1 and seqmax=9223372036854775807 and not seqcycle and seqcache=1
            from pg_sequence where seqrelid='public.patient_reg_no_seq'::regclass)
           and not exists(select 1 from pg_depend where objid='public.patient_reg_no_seq'::regclass and deptype in ('a','i'))
  union all
  select 'public.queue_number_seq','public.queue_entries.queue_number',1148,true,
         (select last_value::numeric from public.queue_number_seq),
         (select is_called from public.queue_number_seq),
         (select max(queue_number)::numeric from public.queue_entries),
         (select seqstart=1001 and seqincrement=1 and seqmin=1 and seqmax=9223372036854775807 and not seqcycle and seqcache=1
            from pg_sequence where seqrelid='public.queue_number_seq'::regclass)
           and not exists(select 1 from pg_depend where objid='public.queue_number_seq'::regclass and deptype in ('a','i'))
), evaluated as (
  select checks.*,
         coalesce((select identities from inventory)=array['public.client_invoice_seq','public.patient_reg_no_seq','public.queue_number_seq']::text[],false) as inventory_matches
  from checks
)
select coalesce(jsonb_agg(to_jsonb(x) order by sequence_identity),'[]'::jsonb)::text
from (
  select sequence_identity,bound_data,expected_last_value,expected_is_called,actual_last_value,actual_is_called,data_boundary,
         inventory_matches,coalesce(config_matches,false) as config_matches,
         inventory_matches and coalesce(config_matches,false)
           and actual_last_value=expected_last_value and actual_is_called is not distinct from expected_is_called
           and (data_boundary is null or (actual_is_called and actual_last_value>=data_boundary)) as passed
  from evaluated
) x;
'@
}

function Assert-Task4SequenceChecks {
  param([Parameter(Mandatory)]$SequenceChecks)
  $actual = @($SequenceChecks)
  $expected = @(Get-Task4StandaloneSequenceSpecifications)
  if ($actual.Count -ne $expected.Count) { throw 'Post-import standalone sequence audit cardinality is not exactly three.' }
  for ($index=0; $index -lt $expected.Count; $index++) {
    if ([string]$actual[$index].sequence_identity -cne [string]$expected[$index].identity -or
        [decimal]$actual[$index].actual_last_value -ne [decimal]$expected[$index].lastValue -or
        [bool]$actual[$index].actual_is_called -ne [bool]$expected[$index].isCalled -or
        -not [bool]$actual[$index].passed) {
      throw "Post-import standalone sequence identity/state mismatch: $($expected[$index].identity)"
    }
  }
  return $actual
}

function Get-TargetSequenceChecks {
  $sql = Get-SequenceCheckSql
  $text = Invoke-TargetQuery -Sql $sql -Label 'post-import target sequence checks'
  return @(ConvertFrom-JsonArray -Text $text)
}

function Get-TargetPostImportMetrics {
  $metrics = (Invoke-TargetQuery -Sql (Get-Task4AuthAggregateSql) -Label 'post-import portable Auth aggregate metrics') | ConvertFrom-Json
  $metrics | Add-Member -MemberType NoteProperty -Name authUsers -Value $metrics.users -Force
  $metrics | Add-Member -MemberType NoteProperty -Name authIdentities -Value $metrics.identities -Force
  $sql = @'
select jsonb_build_object(
  'sessions',(select count(*) from auth.sessions),
  'refreshTokens',(select count(*) from auth.refresh_tokens),
  'oneTimeTokens',(select count(*) from auth.one_time_tokens),
  'profilesMapped',(select count(*) from auth.users u join public.profiles p on p.id=u.id),
  'authWithoutProfile',(select count(*) from auth.users u where not exists(select 1 from public.profiles p where p.id=u.id)),
  'identitiesWithoutUser',(select count(*) from auth.identities i where not exists(select 1 from auth.users u where u.id=i.user_id))
)::text;
'@
  $profileMetrics = (Invoke-TargetQuery -Sql $sql -Label 'post-import Auth and profile integrity metrics') | ConvertFrom-Json
  foreach ($property in $profileMetrics.PSObject.Properties) { $metrics | Add-Member -MemberType NoteProperty -Name $property.Name -Value $property.Value -Force }
  return $metrics
}

function Get-TargetApprovedServiceLists {
  $sql = "select coalesce(jsonb_object_agg(slug,to_jsonb(services_list) order by slug),'{}'::jsonb)::text from public.clinic_services where slug in ('pemeriksaan-kesihatan','prosedur-minor','rawatan-am');"
  return (Invoke-TargetQuery -Sql $sql -Label 'post-import approved service-list strings') | ConvertFrom-Json
}

function Assert-Task4PostImportResult {
  param(
    [Parameter(Mandatory)]$ExpectedPost,
    [Parameter(Mandatory)]$ActualInventory,
    [Parameter(Mandatory)]$ExpectedTableCounts,
    [Parameter(Mandatory)]$ActualTableCounts,
    [Parameter(Mandatory)]$Metrics,
    [Parameter(Mandatory)]$AuthBaseline,
    [Parameter(Mandatory)]$SequenceChecks,
    [Parameter(Mandatory)]$ServiceLists,
    [Parameter(Mandatory)][int]$ForeignKeyCount
  )
  foreach ($field in @('projectRef','publicTables','migrationRows','migrationIdentitiesSha256','schemaSha256','extendedSchemaSha256')) {
    if ([string]$ActualInventory.$field -cne [string]$ExpectedPost.$field) { throw "Post-import target inventory mismatch: $field" }
  }
  if ((Get-JsonSha256 -Value @($ActualInventory.migrationIdentities)) -ne (Get-JsonSha256 -Value @($ExpectedPost.migrationIdentities))) {
    throw 'Post-import ordered migration identities changed.'
  }
  if ([int]$ActualInventory.authUsers -ne 11 -or [int]$ActualInventory.authIdentities -ne 11 -or
      [int]$Metrics.authUsers -ne 11 -or [int]$Metrics.authIdentities -ne 11 -or [int]$Metrics.sessions -ne 0 -or [int]$Metrics.refreshTokens -ne 0 -or [int]$Metrics.oneTimeTokens -ne 0 -or
      [int]$Metrics.profilesMapped -ne 11 -or [int]$Metrics.authWithoutProfile -ne 0 -or [int]$Metrics.identitiesWithoutUser -ne 0) {
    throw 'Post-import portable Auth/profile counts are not exactly 11/11 with zero managed-token rows and complete profile mapping.'
  }
  [void](Assert-Task4AuthAggregate -Actual $Metrics -Baseline $AuthBaseline -RequireNeutralized)
  $countDifferences = New-Object 'System.Collections.Generic.List[string]'
  foreach ($property in $ExpectedTableCounts.PSObject.Properties) {
    $actualProperty = $ActualTableCounts.PSObject.Properties[$property.Name]
    if ($null -eq $actualProperty -or [int64]$actualProperty.Value -ne [int64]$property.Value) { $countDifferences.Add([string]$property.Name) }
  }
  if ($countDifferences.Count -ne 0) { throw "Post-import source table counts differ: $($countDifferences -join ',')" }
  [void](Assert-Task4SequenceChecks -SequenceChecks $SequenceChecks)
  $actualServiceNames = @($ServiceLists.PSObject.Properties.Name | Sort-Object)
  $expectedServiceNames = @($Task4ApprovedServiceLists.Keys | Sort-Object)
  if ((Get-JsonSha256 -Value $actualServiceNames) -ne (Get-JsonSha256 -Value $expectedServiceNames)) { throw 'Post-import approved service-list slugs changed.' }
  $serviceStringCount = 0
  foreach ($slug in $Task4ApprovedServiceLists.Keys) {
    $actualStrings = @($ServiceLists.$slug | ForEach-Object { [string]$_ })
    $expectedStrings = @($Task4ApprovedServiceLists[$slug])
    $serviceStringCount += $actualStrings.Count
    if ((Get-JsonSha256 -Value $actualStrings) -ne (Get-JsonSha256 -Value $expectedStrings)) { throw "Post-import approved service-list strings changed: $slug" }
  }
  if ($serviceStringCount -ne 13 -or $ForeignKeyCount -le 0) { throw 'Post-import service-string or foreign-key audit cardinality is invalid.' }
  return [ordered]@{ tableCountDifferences=@(); failedSequences=@(); approvedServiceStrings=$serviceStringCount; foreignKeysAudited=$ForeignKeyCount }
}

function Get-SequenceChecks {
  param([string]$Database)
  $sql = Get-SequenceCheckSql
  return @(Get-JsonQueryResult -Database $Database -Sql $sql -Label "sequence checks from $Database")
}

function Convert-AppointmentInsertColumns {
  param([Parameter(Mandatory)][string]$Sql)
  $pattern = '(?im)^(INSERT INTO public\.appointments \()([^)]+)(\) VALUES )'
  return [regex]::Replace($Sql, $pattern, {
    param($match)
    $mappedColumns = @($match.Groups[2].Value.Split(',') | ForEach-Object {
      $column = $_.Trim()
      $unquoted = $column.Trim('"')
      if ($AppointmentColumnMap.Contains($unquoted)) {
        if ($column.StartsWith('"')) { '"' + $AppointmentColumnMap[$unquoted] + '"' } else { $AppointmentColumnMap[$unquoted] }
      } else {
        $column
      }
    })
    return $match.Groups[1].Value + ($mappedColumns -join ', ') + $match.Groups[3].Value
  })
}

function Get-ForeignKeyAuditSql {
  return @'
-- Catalog-driven audit includes every public FK, including both target-only
-- public.staff_messages sender_id and receiver_id references.
do $foreign_key_audit$
declare
  fk record;
  equality_predicate text;
  subject_predicate text;
  orphan_exists boolean;
begin
  for fk in
    select con.conname,
           child_ns.nspname as child_schema,
           child.relname as child_table,
           parent_ns.nspname as parent_schema,
           parent.relname as parent_table,
           con.confmatchtype,
           array_agg(child_att.attname order by key_columns.position) as child_columns,
           array_agg(parent_att.attname order by key_columns.position) as parent_columns
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    cross join lateral unnest(con.conkey, con.confkey) with ordinality
      as key_columns(child_attnum, parent_attnum, position)
    join pg_attribute child_att on child_att.attrelid = child.oid and child_att.attnum = key_columns.child_attnum
    join pg_attribute parent_att on parent_att.attrelid = parent.oid and parent_att.attnum = key_columns.parent_attnum
    where con.contype = 'f'
      and (child_ns.nspname = 'public' or (child_ns.nspname = 'auth' and child.relname in ('users','identities')))
    group by con.oid, con.conname, child_ns.nspname, child.relname, parent_ns.nspname, parent.relname, con.confmatchtype
  loop
    select string_agg(format('child_row.%I = parent_row.%I', fk.child_columns[i], fk.parent_columns[i]), ' and '),
           string_agg(format('child_row.%I is not null', fk.child_columns[i]), case when fk.confmatchtype = 'f' then ' or ' else ' and ' end)
      into equality_predicate, subject_predicate
    from generate_subscripts(fk.child_columns, 1) as i;

    execute format(
      'select exists (select 1 from %I.%I child_row where (%s) and not exists (select 1 from %I.%I parent_row where %s))',
      fk.child_schema, fk.child_table, subject_predicate,
      fk.parent_schema, fk.parent_table, equality_predicate
    ) into orphan_exists;

    if orphan_exists then
      raise exception 'Foreign key orphan audit failed for %.%.%', fk.child_schema, fk.child_table, fk.conname;
    end if;
  end loop;
end
$foreign_key_audit$;
'@
}

function Get-ForeignKeyConstraintCount {
  param([Parameter(Mandatory)][string]$Database)
  $sql = @'
select count(*)
from pg_constraint con
join pg_class child on child.oid = con.conrelid
join pg_namespace child_ns on child_ns.oid = child.relnamespace
where con.contype = 'f'
  and (child_ns.nspname = 'public' or (child_ns.nspname = 'auth' and child.relname in ('users','identities')));
'@
  return [int](Invoke-LocalQuery -Database $Database -Label 'foreign key audit coverage count' -Sql $sql)
}

function Get-Task4AuthUsersColumnContract {
  $preserved = @('instance_id','id','aud','role','email','encrypted_password','email_confirmed_at','last_sign_in_at','raw_app_meta_data','raw_user_meta_data','is_super_admin','created_at','updated_at','phone','phone_confirmed_at','banned_until','is_sso_user','deleted_at','is_anonymous')
  $emptyString = @('confirmation_token','recovery_token','email_change_token_new','email_change_token_current','phone_change_token','reauthentication_token','email_change','phone_change')
  $nullValue = @('invited_at','confirmation_sent_at','recovery_sent_at','email_change_sent_at','phone_change_sent_at','reauthentication_sent_at')
  $zeroValue = @('email_change_confirm_status')
  return [ordered]@{ preserved=$preserved; emptyString=$emptyString; nullValue=$nullValue; zeroValue=$zeroValue; columns=@($preserved + $emptyString + $nullValue + $zeroValue) }
}

function Get-Task4AuthIdentitiesColumnContract {
  return [ordered]@{ columns=@('provider_id','user_id','identity_data','provider','last_sign_in_at','created_at','updated_at','id') }
}

function Get-Task4AuthAggregateBaseline {
  return [ordered]@{
    users = 11
    identities = 11
    allowedUsersSha256 = 'C8FE0983897241106A2D48EBECBF6668D3090D37C5503127F1A2E10F4596F1A2'
    identitiesSha256 = '131A0B1D86D14333F4F9BA21C55E89C97DC0531CA516744E0AD7597F9804AFA4'
    userIdSetSha256 = '9CC534CF8C91698637DD1B346A4B9EC4E15D3F8D54E9D546AD4944081A6D9113'
    identityIdUserIdSetSha256 = 'E6899536EDEA0C7BDC092D349DDC556FF909CCC61C41CA419F680833C60ACEE7'
  }
}

function Get-PortableAuthExportSql {
  $users = Get-Task4AuthUsersColumnContract
  $identities = Get-Task4AuthIdentitiesColumnContract
  $userValues = @($users.preserved | ForEach-Object { '%L' }) + @($users.emptyString | ForEach-Object { "''" }) + @($users.nullValue | ForEach-Object { 'NULL' }) + @($users.zeroValue | ForEach-Object { '0' })
  $userStatement = 'insert into auth.users (' + ($users.columns -join ', ') + ') values (' + ($userValues -join ', ') + ');'
  $identityStatement = 'insert into auth.identities (' + ($identities.columns -join ', ') + ') values (' + ((@($identities.columns | ForEach-Object { '%L' }) -join ', ')) + ');'
  $userFormatLiteral = "'" + $userStatement.Replace("'","''") + "'"
  $identityFormatLiteral = "'" + $identityStatement.Replace("'","''") + "'"
  @"
with portable_auth_statements as (
  select 1 as import_order, id::text as sort_id,
    format($userFormatLiteral, $($users.preserved -join ', ')) as statement
  from auth.users
  union all
  select 2 as import_order, id::text as sort_id,
    format($identityFormatLiteral, $($identities.columns -join ', ')) as statement
  from auth.identities
)
select statement
from portable_auth_statements
order by import_order, sort_id;
"@
}

function New-PortableAuthLoaderBody {
  param([Parameter(Mandatory)][string]$SourceDatabase,[Parameter(Mandatory)][string]$OutputPath)
  $psql = Join-Path $PostgresBin 'psql.exe'
  $queryPath = New-ProtectedSqlFile -Sql (Get-PortableAuthExportSql)
  try {
    Invoke-External -File $psql -Arguments @('-X','-A','-t','-q','-v','ON_ERROR_STOP=1','--host','127.0.0.1','--port',[string]$script:LocalPort,'--username','postgres','--dbname',$SourceDatabase,'--file',$queryPath,'--output',$OutputPath) -Label 'generate transformed portable Auth SQL' | Out-Null
  } finally {
    if (Test-Path -LiteralPath $queryPath) { Remove-Item -LiteralPath $queryPath -Force }
  }
  if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) { throw 'Transformed portable Auth SQL was not created.' }
}

function Get-Task4AuthAggregateSql {
  $users = Get-Task4AuthUsersColumnContract
  $identities = Get-Task4AuthIdentitiesColumnContract
  # invited_at is deliberately part of the opaque digest because the approved source has 0/11 non-NULL values;
  # it binds that neutral pending-invitation state without treating it as a preserved import field.
  $digestUserFields = @('instance_id','id','aud','role','email','encrypted_password','email_confirmed_at','invited_at','last_sign_in_at','raw_app_meta_data','raw_user_meta_data','is_super_admin','created_at','updated_at','phone','phone_confirmed_at','banned_until','is_sso_user','deleted_at','is_anonymous')
  $timestamptzFields = @('email_confirmed_at','invited_at','last_sign_in_at','created_at','updated_at','phone_confirmed_at','banned_until','deleted_at')
  $userFields = @($digestUserFields | ForEach-Object {
    if ($_ -in $timestamptzFields) { "quote_nullable(to_char($_ at time zone 'UTC','YYYY-MM-DD`"T`"HH24:MI:SS.US`"Z`"'))" } else { "quote_nullable($_`::text)" }
  }) -join ",`n      "
  $identityFields = @($identities.columns | ForEach-Object {
    if ($_ -in $timestamptzFields) { "quote_nullable(to_char($_ at time zone 'UTC','YYYY-MM-DD`"T`"HH24:MI:SS.US`"Z`"'))" } else { "quote_nullable($_`::text)" }
  }) -join ",`n      "
  @"
with user_rows as (
  select id::text as sort_id,
    concat_ws(E'\n',
      $userFields
    ) as canonical_row
  from auth.users
), identity_rows as (
  select id::text as sort_id,
    concat_ws(E'\n',
      $identityFields
    ) as canonical_row,
    concat_ws(E'\n', quote_nullable(id::text), quote_nullable(user_id::text)) as canonical_id_set_row
  from auth.identities
)
select jsonb_build_object(
  'users',(select count(*) from auth.users),
  'identities',(select count(*) from auth.identities),
  'forbiddenState',(select count(*) from auth.users where confirmation_token is distinct from '' or recovery_token is distinct from '' or email_change_token_new is distinct from '' or email_change_token_current is distinct from '' or phone_change_token is distinct from '' or reauthentication_token is distinct from '' or email_change is distinct from '' or phone_change is distinct from '' or invited_at is not null or confirmation_sent_at is not null or recovery_sent_at is not null or email_change_sent_at is not null or phone_change_sent_at is not null or reauthentication_sent_at is not null or email_change_confirm_status is distinct from 0),
  'invitedAtNonNull',(select count(*) from auth.users where invited_at is not null),
  'allowedUsersSha256',(select upper(encode(extensions.digest(coalesce(string_agg(canonical_row,E'\n--ROW--\n' order by sort_id),''),'sha256'),'hex')) from user_rows),
  'identitiesSha256',(select upper(encode(extensions.digest(coalesce(string_agg(canonical_row,E'\n--ROW--\n' order by sort_id),''),'sha256'),'hex')) from identity_rows),
  'userIdSetSha256',(select upper(encode(extensions.digest(coalesce(string_agg(quote_nullable(id::text),E'\n--ROW--\n' order by id::text),''),'sha256'),'hex')) from auth.users),
  'identityIdUserIdSetSha256',(select upper(encode(extensions.digest(coalesce(string_agg(canonical_id_set_row,E'\n--ROW--\n' order by sort_id),''),'sha256'),'hex')) from identity_rows)
)::text;
"@
}

function Get-LocalTask4AuthAggregate {
  param([Parameter(Mandatory)][string]$Database,[Parameter(Mandatory)][string]$Label)
  return (Invoke-LocalQuery -Database $Database -Sql (Get-Task4AuthAggregateSql) -Label $Label) | ConvertFrom-Json
}

function Assert-Task4AuthAggregate {
  param([Parameter(Mandatory)]$Actual,[Parameter(Mandatory)]$Baseline,[switch]$RequireNeutralized)
  foreach ($field in @('users','identities','allowedUsersSha256','identitiesSha256','userIdSetSha256','identityIdUserIdSetSha256')) {
    $actualHasField = if ($Actual -is [Collections.IDictionary]) { $Actual.Contains($field) } else { $null -ne $Actual.PSObject.Properties[$field] }
    $baselineHasField = if ($Baseline -is [Collections.IDictionary]) { $Baseline.Contains($field) } else { $null -ne $Baseline.PSObject.Properties[$field] }
    if (-not $actualHasField) { throw "Portable Auth aggregate is missing required property: $field" }
    if (-not $baselineHasField) { throw "Portable Auth baseline is missing required property: $field" }
    if ([string]$Actual.$field -cne [string]$Baseline.$field) { throw "Portable Auth aggregate mismatch: $field" }
  }
  foreach ($field in @('forbiddenState','invitedAtNonNull')) {
    $actualHasField = if ($Actual -is [Collections.IDictionary]) { $Actual.Contains($field) } else { $null -ne $Actual.PSObject.Properties[$field] }
    if (-not $actualHasField) { throw "Portable Auth aggregate is missing required property: $field" }
    $actualValue = if ($Actual -is [Collections.IDictionary]) { $Actual[$field] } else { $Actual.$field }
    $isInteger = $false
    if ($null -ne $actualValue) {
      foreach ($integerType in @([byte],[sbyte],[int16],[uint16],[int32],[uint32],[int64],[uint64])) {
        if ($actualValue -is $integerType) { $isInteger = $true; break }
      }
    }
    if (-not $isInteger) { throw "Portable Auth aggregate property must be a non-null integer: $field" }
  }
  if ($Actual.invitedAtNonNull -ne 0) { throw 'Portable Auth source or import contains a pending invitation timestamp.' }
  if ($RequireNeutralized -and $Actual.forbiddenState -ne 0) { throw 'Portable Auth import retains one-time-token or pending-workflow state.' }
  return $Actual
}

function Get-Task4SqlCsv {
  param([Parameter(Mandatory)][string]$Text)
  $values = New-Object 'System.Collections.Generic.List[string]'
  $start = 0
  $inSingle = $false
  $singleEscapes = $false
  $inDouble = $false
  for ($index = 0; $index -lt $Text.Length; $index++) {
    $character = $Text[$index]
    if ($inSingle) {
      if ($singleEscapes -and $character -eq '\' -and $index + 1 -lt $Text.Length) { $index++; continue }
      if ($character -eq "'") {
        if ($index + 1 -lt $Text.Length -and $Text[$index + 1] -eq "'") { $index++; continue }
        $inSingle = $false
        $singleEscapes = $false
      }
      continue
    }
    if ($inDouble) {
      if ($character -eq '"') {
        if ($index + 1 -lt $Text.Length -and $Text[$index + 1] -eq '"') { $index++; continue }
        $inDouble = $false
      }
      continue
    }
    if ($character -eq "'") {
      $inSingle = $true
      $singleEscapes = $index -gt 0 -and ($Text[$index - 1] -eq 'E' -or $Text[$index - 1] -eq 'e') -and ($index -eq 1 -or $Text[$index - 2] -notmatch '[A-Za-z0-9_]')
      continue
    }
    if ($character -eq '"') { $inDouble = $true; continue }
    if ($character -eq ',') {
      $values.Add($Text.Substring($start,$index - $start).Trim())
      $start = $index + 1
    }
  }
  if ($inSingle -or $inDouble) { throw 'Portable Auth loader contains an unterminated SQL literal.' }
  $values.Add($Text.Substring($start).Trim())
  return @($values)
}

function Get-Task4SqlStatements {
  param([Parameter(Mandatory)][string]$Text)
  $statements = New-Object 'System.Collections.Generic.List[string]'
  $start = 0
  $inSingle = $false
  $singleEscapes = $false
  $inDouble = $false
  for ($index = 0; $index -lt $Text.Length; $index++) {
    $character = $Text[$index]
    if ($inSingle) {
      if ($singleEscapes -and $character -eq '\' -and $index + 1 -lt $Text.Length) { $index++; continue }
      if ($character -eq "'") {
        if ($index + 1 -lt $Text.Length -and $Text[$index + 1] -eq "'") { $index++; continue }
        $inSingle = $false
        $singleEscapes = $false
      }
      continue
    }
    if ($inDouble) {
      if ($character -eq '"') {
        if ($index + 1 -lt $Text.Length -and $Text[$index + 1] -eq '"') { $index++; continue }
        $inDouble = $false
      }
      continue
    }
    if ($character -eq "'") {
      $inSingle = $true
      $singleEscapes = $index -gt 0 -and ($Text[$index - 1] -eq 'E' -or $Text[$index - 1] -eq 'e') -and ($index -eq 1 -or $Text[$index - 2] -notmatch '[A-Za-z0-9_]')
      continue
    }
    if ($character -eq '"') { $inDouble = $true; continue }
    if ($character -eq ';') {
      $statements.Add($Text.Substring($start,$index - $start + 1))
      $start = $index + 1
    }
  }
  if ($inSingle -or $inDouble) { throw 'Portable Auth loader contains an unterminated SQL literal.' }
  if (-not [string]::IsNullOrWhiteSpace($Text.Substring($start))) { throw 'Portable Auth loader contains an unterminated SQL statement.' }
  return @($statements)
}

function Add-PortableAuthBodyToPgDump {
  param(
    [Parameter(Mandatory)][string]$PgDumpSql,
    [Parameter(Mandatory)][string]$PortableAuthSql
  )
  if ([string]::IsNullOrWhiteSpace($PortableAuthSql)) { throw 'Portable Auth SQL body is empty.' }
  $completeMarkers = [regex]::Matches($PgDumpSql,'(?m)^-- PostgreSQL database dump complete\r?$')
  $unrestrictMarkers = [regex]::Matches($PgDumpSql,'(?m)^\\unrestrict[ \t]+\S+[ \t]*\r?$')
  $trailerPattern = '(?ms)^--\r?\n-- PostgreSQL database dump complete\r?\n--\r?\n(?:\r?\n)?\\unrestrict[ \t]+\S+[ \t]*(?:\r?\n[ \t]*)*\z'
  $trailers = [regex]::Matches($PgDumpSql,$trailerPattern)
  if ($completeMarkers.Count -ne 1 -or $unrestrictMarkers.Count -ne 1 -or $trailers.Count -ne 1) {
    throw 'Selective pg_dump SQL does not contain exactly one complete PostgreSQL trailer.'
  }
  $newline = if ($PgDumpSql.Contains("`r`n")) { "`r`n" } else { "`n" }
  return $PgDumpSql.Insert($trailers[0].Index,$PortableAuthSql.Trim() + $newline + $newline)
}

function New-SelectiveLoader {
  param([string]$SourceDatabase, [string[]]$PublicTables, [string]$OutputPath, [switch]$StaffOnly, [switch]$AuthOnly)
  $rawPath = "$OutputPath.raw"
  $portableAuthPath = "$OutputPath.auth"
  $dump = Join-Path $PostgresBin 'pg_dump.exe'
  $args = @('--data-only','--column-inserts','--host','127.0.0.1','--port',[string]$script:LocalPort,'--username','postgres','--dbname',$SourceDatabase,'--file',$rawPath)
  if ($AuthOnly) {
    $truncate = 'truncate table auth.identities, auth.users restart identity cascade;'
  } elseif ($StaffOnly) {
    $args += @('--table','public.staff_messages')
    $truncate = 'truncate table public.staff_messages restart identity cascade;'
  } else {
    foreach ($table in @($PublicTables | Where-Object { $_ -ne 'public.staff_messages' })) {
      $args += @('--table',$table)
    }
    $quotedTables = @($PublicTables | Where-Object { $_ -ne 'public.staff_messages' } | ForEach-Object {
      $parts = $_.Split('.', 2); '"{0}"."{1}"' -f $parts[0].Replace('"','""'), $parts[1].Replace('"','""')
    })
    $truncate = 'truncate table auth.identities, auth.users, ' + ($quotedTables -join ', ') + ' restart identity cascade;'
  }
  try {
    if ($AuthOnly) {
      New-PortableAuthLoaderBody -SourceDatabase $SourceDatabase -OutputPath $portableAuthPath
      $body = Get-Content -LiteralPath $portableAuthPath -Raw
    } else {
      Invoke-External -File $dump -Arguments $args -Label 'generate protected selective public-data SQL' | Out-Null
      $body = Get-Content -LiteralPath $rawPath -Raw
      if (-not $StaffOnly) {
        $body = Convert-AppointmentInsertColumns -Sql $body
        New-PortableAuthLoaderBody -SourceDatabase $SourceDatabase -OutputPath $portableAuthPath
        $body = Add-PortableAuthBodyToPgDump -PgDumpSql $body -PortableAuthSql (Get-Content -LiteralPath $portableAuthPath -Raw)
      }
    }
  } finally {
    foreach ($path in @($rawPath,$portableAuthPath)) {
      if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }
  }
  $header = @"
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local lock_timeout = '30s';
set local session_replication_role = replica;
$truncate
"@
  $foreignKeyAuditSql = Get-ForeignKeyAuditSql
  $footer = "`nset local session_replication_role = origin;`n$foreignKeyAuditSql`ncommit;`n"
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
  $beginCount = [regex]::Matches($loaderText,'(?im)^\s*begin;\s*$').Count
  $commitCount = [regex]::Matches($loaderText,'(?im)^\s*commit;\s*$').Count
  $replicaIndex = $loaderText.IndexOf('set local session_replication_role = replica',[StringComparison]::OrdinalIgnoreCase)
  $originIndex = $loaderText.IndexOf('set local session_replication_role = origin',[StringComparison]::OrdinalIgnoreCase)
  $auditIndex = $loaderText.IndexOf('$foreign_key_audit$',[StringComparison]::OrdinalIgnoreCase)
  $commitIndex = $loaderText.LastIndexOf('commit;',[StringComparison]::OrdinalIgnoreCase)
  if ($beginCount -ne 1 -or $commitCount -ne 1 -or $replicaIndex -lt 0 -or $originIndex -le $replicaIndex -or $auditIndex -le $originIndex -or $commitIndex -le $auditIndex) {
    throw 'Selective loader is not one trigger-disabled transaction with origin restoration and a final FK audit before commit.'
  }
  $users = [regex]::Matches($loaderText,'(?i)insert\s+into\s+(?:"auth"|auth)\.(?:"users"|users)').Count
  $identities = [regex]::Matches($loaderText,'(?i)insert\s+into\s+(?:"auth"|auth)\.(?:"identities"|identities)').Count
  if (($users -eq 0) -xor ($identities -eq 0)) { throw 'Selective loader must carry Auth users and identities together.' }
  if ($users -eq 0) { return }
  $userContract = Get-Task4AuthUsersColumnContract
  $identityContract = Get-Task4AuthIdentitiesColumnContract
  $validatedUsers = 0
  $validatedIdentities = 0
  foreach ($statement in Get-Task4SqlStatements -Text $loaderText) {
    $authInsert = [regex]::Match($statement,'(?is)^\s*insert\s+into\s+(?:"?auth"?)\.(?<table>"?(?:users|identities)"?)(?=\s|\(|$)')
    if (-not $authInsert.Success) { continue }
    $match = [regex]::Match($statement,'(?is)^\s*insert\s+into\s+(?<schema>"?auth"?)\.(?<table>"?(?:users|identities)"?)\s*\((?<columns>[^)]*)\)\s*values\s*\((?<values>.*)\)\s*;\s*$')
    if (-not $match.Success) { throw 'Portable Auth INSERT is not an explicit column/value statement.' }
    $table = $match.Groups['table'].Value.Replace('"','').ToLowerInvariant()
    if ($table -eq 'users') { $validatedUsers++ } else { $validatedIdentities++ }
    $columns = @(Get-Task4SqlCsv -Text $match.Groups['columns'].Value | ForEach-Object { $_.Trim().Replace('"','') })
    $values = @(Get-Task4SqlCsv -Text $match.Groups['values'].Value)
    $expectedColumns = if ($table -eq 'users') { @($userContract.columns) } else { @($identityContract.columns) }
    if ($columns.Count -ne $expectedColumns.Count -or $values.Count -ne $expectedColumns.Count -or ($columns -join "`n") -cne ($expectedColumns -join "`n")) {
      throw "Portable Auth $table INSERT does not use the exact destination column contract."
    }
    if ($table -eq 'users') {
      foreach ($column in $userContract.emptyString) {
        $index = [array]::IndexOf($expectedColumns,$column)
        if ($values[$index].Trim() -cne "''") { throw "Portable Auth users INSERT retains forbidden value in $column." }
      }
      foreach ($column in $userContract.nullValue) {
        $index = [array]::IndexOf($expectedColumns,$column)
        if ($values[$index].Trim() -cne 'NULL') { throw "Portable Auth users INSERT retains pending workflow state in $column." }
      }
      $zeroIndex = [array]::IndexOf($expectedColumns,'email_change_confirm_status')
      if ($values[$zeroIndex].Trim() -cne '0') { throw 'Portable Auth users INSERT retains email-change confirmation state.' }
    }
  }
  if ($validatedUsers -ne $users -or $validatedIdentities -ne $identities) { throw 'Portable Auth boundary did not validate every Auth INSERT.' }
}

function New-InTransactionAuthZeroLoader {
  param([Parameter(Mandatory)][string]$SourcePath,[Parameter(Mandatory)][string]$DestinationPath)
  $resolvedRoot = Get-NormalizedPath $ArtifactRoot
  $resolvedDestination = Get-NormalizedPath $DestinationPath
  if (-not $resolvedDestination.StartsWith(($resolvedRoot + '\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing guarded loader outside protected artifacts.' }
  Assert-PortableAuthBoundary -LoaderPath $SourcePath
  $loaderText = Get-Content -LiteralPath $SourcePath -Raw
  $needle = "set local lock_timeout = '30s';"
  if ([regex]::Matches($loaderText,[regex]::Escape($needle),[Text.RegularExpressions.RegexOptions]::IgnoreCase).Count -ne 1 -or
      $loaderText.IndexOf('$auth_zero_guard$',[StringComparison]::OrdinalIgnoreCase) -ge 0) {
    throw 'Selective loader cannot receive the deterministic in-transaction Auth-zero guard.'
  }
  $truncatePattern = '(?is)truncate\s+table\s+(?<tables>.*?)\s+restart\s+identity\s+cascade;'
  $truncateMatch = [regex]::Match($loaderText,$truncatePattern)
  if (-not $truncateMatch.Success -or [regex]::Matches($loaderText,$truncatePattern).Count -ne 1) { throw 'Selective loader must contain exactly one bound source-table truncate statement.' }
  $tables = @($truncateMatch.Groups['tables'].Value -split ',' | ForEach-Object { $_.Trim() })
  if ($tables.Count -ne 95 -or $tables[0] -cne 'auth.identities' -or $tables[1] -cne 'auth.users') { throw 'Selective loader truncate inventory is not the exact rehearsed 2 Auth + 93 public table set.' }
  $publicTables = @($tables | Select-Object -Skip 2)
  $seenPublicTables = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($table in $publicTables) {
    if ($table -notmatch '^"public"\."[a-z_][a-z0-9_]*"$' -or $table -eq '"public"."staff_messages"' -or -not $seenPublicTables.Add($table)) {
      throw 'Selective loader contains a non-source-owned, duplicate, or invalid public deletion target.'
    }
  }
  $deleteSql = @($publicTables | ForEach-Object { "delete from $_;" }) -join "`n"
  $loaderText = [regex]::Replace($loaderText,$truncatePattern,[Text.RegularExpressions.MatchEvaluator]{ param($match) $deleteSql },[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $sourceTableNames = @($publicTables | ForEach-Object { [regex]::Match($_,'^"public"\."(?<name>[a-z_][a-z0-9_]*)"$').Groups['name'].Value })
  foreach ($standaloneSequence in @(Get-Task4StandaloneSequenceSpecifications)) {
    if ($sourceTableNames -cnotcontains [string]$standaloneSequence.table) { throw "Standalone sequence data table is not source-owned: $($standaloneSequence.table)" }
  }
  $sourceTableArray = @($sourceTableNames | ForEach-Object { "'$_'" }) -join ','
  $ownedSequenceReconcile = @"
do `$owned_sequence_reconcile`$
declare
  sequence_record record;
  data_boundary bigint;
begin
  for sequence_record in
    select seq.oid::regclass as sequence_identity, tab.relname as table_name, att.attname as column_name,
           sequence_state.seqstart as start_value, sequence_state.seqincrement as increment_by
    from pg_class seq
    join pg_namespace sequence_namespace on sequence_namespace.oid=seq.relnamespace
    join pg_depend dependency on dependency.objid=seq.oid and dependency.deptype in ('a','i')
    join pg_class tab on tab.oid=dependency.refobjid
    join pg_namespace table_namespace on table_namespace.oid=tab.relnamespace
    join pg_attribute att on att.attrelid=tab.oid and att.attnum=dependency.refobjsubid
    join pg_sequence sequence_state on sequence_state.seqrelid=seq.oid
    where seq.relkind='S' and table_namespace.nspname='public'
      and tab.relname=any(ARRAY[$sourceTableArray]::text[])
    order by table_namespace.nspname,tab.relname,att.attnum,seq.oid
  loop
    execute format('select %s(%I)::bigint from %I.%I',case when sequence_record.increment_by>0 then 'max' else 'min' end,sequence_record.column_name,'public',sequence_record.table_name)
      into data_boundary;
    if data_boundary is null then
      perform pg_catalog.setval(sequence_record.sequence_identity,sequence_record.start_value,false);
    else
      perform pg_catalog.setval(sequence_record.sequence_identity,data_boundary,true);
    end if;
  end loop;
end
`$owned_sequence_reconcile`$;
"@
  $standaloneSequenceReconcile = @"
do `$sequence_reconcile`$
begin
  if (select array_agg(format('%s.%s',n.nspname,c.relname) order by n.nspname,c.relname)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind='S' and n.nspname='public')
      is distinct from array['public.client_invoice_seq','public.patient_reg_no_seq','public.queue_number_seq']::text[] then
    raise exception 'Exact public standalone sequence inventory changed';
  end if;
  if not coalesce((select seqstart=1 and seqincrement=1 and seqmin=1 and seqmax=9223372036854775807 and not seqcycle and seqcache=1
                    from pg_sequence where seqrelid='public.client_invoice_seq'::regclass),false)
      or exists(select 1 from pg_depend where objid='public.client_invoice_seq'::regclass and deptype in ('a','i'))
      or not coalesce((select seqstart=1 and seqincrement=1 and seqmin=1 and seqmax=9223372036854775807 and not seqcycle and seqcache=1
                       from pg_sequence where seqrelid='public.patient_reg_no_seq'::regclass),false)
      or exists(select 1 from pg_depend where objid='public.patient_reg_no_seq'::regclass and deptype in ('a','i'))
      or not coalesce((select seqstart=1001 and seqincrement=1 and seqmin=1 and seqmax=9223372036854775807 and not seqcycle and seqcache=1
                       from pg_sequence where seqrelid='public.queue_number_seq'::regclass),false)
      or exists(select 1 from pg_depend where objid='public.queue_number_seq'::regclass and deptype in ('a','i')) then
    raise exception 'Exact public standalone sequence configuration changed';
  end if;
  perform pg_catalog.setval('public.client_invoice_seq'::regclass,2,true);
  perform pg_catalog.setval('public.patient_reg_no_seq'::regclass,117,true);
  perform pg_catalog.setval('public.queue_number_seq'::regclass,1148,true);
  if (select last_value<>2 or is_called is distinct from true from public.client_invoice_seq)
      or (select last_value<>117 or is_called is distinct from true from public.patient_reg_no_seq)
      or (select last_value<>1148 or is_called is distinct from true from public.queue_number_seq)
      or (select max(substring(invoice_no from '-([0-9]+)$')::bigint) from public.client_invoices where invoice_no ~ '-[0-9]+$') > 2
      or (select max(substring(reg_no from '^KA-([0-9]+)$')::bigint) from public.patients where reg_no ~ '^KA-[0-9]+$') > 117
      or (select max(queue_number)::bigint from public.queue_entries) > 1148 then
    raise exception 'Exact public standalone sequence state does not cover the approved source floor and imported data';
  end if;
end
`$sequence_reconcile`$;
"@
  $originNeedle = 'set local session_replication_role = origin'
  if ([regex]::Matches($loaderText,[regex]::Escape($originNeedle),[Text.RegularExpressions.RegexOptions]::IgnoreCase).Count -ne 1) { throw 'Selective loader origin-restoration marker is not exact.' }
  $loaderText = [regex]::Replace($loaderText,[regex]::Escape($originNeedle),[Text.RegularExpressions.MatchEvaluator]{ param($match) $ownedSequenceReconcile + $standaloneSequenceReconcile + $originNeedle },[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $lockedPublicTables = @($publicTables | Sort-Object)
  $publicLockSql = 'lock table ' + ($lockedPublicTables -join ', ') + ' in access exclusive mode;'
  $guard = @"
$needle
lock table auth.users, auth.identities in access exclusive mode;
do `$auth_zero_guard`$
begin
  if exists(select 1 from auth.users) or exists(select 1 from auth.identities) then
    raise exception 'Auth-zero guard failed inside the import transaction';
  end if;
end
`$auth_zero_guard`$;
$publicLockSql
"@
  $guarded = [regex]::Replace($loaderText,[regex]::Escape($needle),[Text.RegularExpressions.MatchEvaluator]{ param($match) $guard },[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  Write-Utf8NoBom -Path $DestinationPath -Content $guarded
}

function New-BoundLoaderSnapshot {
  param([Parameter(Mandatory)][string]$SourcePath,[Parameter(Mandatory)][string]$DestinationPath,[Parameter(Mandatory)][string]$ExpectedSha256)
  $resolvedRoot = Get-NormalizedPath $ArtifactRoot
  $resolvedDestination = Get-NormalizedPath $DestinationPath
  if (-not $resolvedDestination.StartsWith(($resolvedRoot + '\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing loader snapshot outside protected artifacts.' }
  Assert-NotReparsePoint -Path $SourcePath -Label 'bound loader source'
  if ((Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToUpperInvariant() -cne $ExpectedSha256.ToUpperInvariant()) { throw 'Bound loader source hash changed.' }
  Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
  Assert-NotReparsePoint -Path $DestinationPath -Label 'bound loader snapshot'
  if ((Get-FileHash -LiteralPath $DestinationPath -Algorithm SHA256).Hash.ToUpperInvariant() -cne $ExpectedSha256.ToUpperInvariant()) { throw 'Bound loader snapshot hash changed while copying.' }
  (Get-Item -LiteralPath $DestinationPath).IsReadOnly = $true
}

function Assert-InTransactionAuthZeroGuard {
  param([Parameter(Mandatory)][string]$LoaderPath)
  $loaderText = Get-Content -LiteralPath $LoaderPath -Raw
  $beginIndex = $loaderText.IndexOf('begin;',[StringComparison]::OrdinalIgnoreCase)
  $lockIndex = $loaderText.IndexOf('lock table auth.users, auth.identities in access exclusive mode;',[StringComparison]::OrdinalIgnoreCase)
  $guardIndex = $loaderText.IndexOf('$auth_zero_guard$',[StringComparison]::OrdinalIgnoreCase)
  $publicLockMatches = [regex]::Matches($loaderText,'(?is)lock\s+table\s+(?<tables>"public"\."[a-z_][a-z0-9_]*"(?:\s*,\s*"public"\."[a-z_][a-z0-9_]*")*)\s+in\s+access\s+exclusive\s+mode;')
  $publicLockIndex = if ($publicLockMatches.Count -eq 1) { $publicLockMatches[0].Index } else { -1 }
  $replicaIndex = $loaderText.IndexOf('set local session_replication_role = replica',[StringComparison]::OrdinalIgnoreCase)
  $ownedSequenceIndex = $loaderText.IndexOf('$owned_sequence_reconcile$',[StringComparison]::OrdinalIgnoreCase)
  $sequenceIndex = $loaderText.IndexOf('$sequence_reconcile$',[StringComparison]::OrdinalIgnoreCase)
  $originIndex = $loaderText.IndexOf('set local session_replication_role = origin',[StringComparison]::OrdinalIgnoreCase)
  $truncateIndex = $loaderText.IndexOf('truncate table auth.identities, auth.users',[StringComparison]::OrdinalIgnoreCase)
  $deleteMatches = [regex]::Matches($loaderText,'(?im)^delete from "public"\."[a-z_][a-z0-9_]*";\s*$')
  $firstDeleteIndex = if ($deleteMatches.Count -gt 0) { $deleteMatches[0].Index } else { -1 }
  $lockedTables = if ($publicLockMatches.Count -eq 1) { @($publicLockMatches[0].Groups['tables'].Value -split ',' | ForEach-Object { $_.Trim() }) } else { @() }
  $deletedTables = @($deleteMatches | ForEach-Object { [regex]::Match($_.Value,'"public"\."[a-z_][a-z0-9_]*"').Value })
  $expectedLockedTables = @($deletedTables | Sort-Object)
  if ($beginIndex -lt 0 -or $lockIndex -le $beginIndex -or $guardIndex -le $lockIndex -or $publicLockIndex -le $guardIndex -or $replicaIndex -le $publicLockIndex -or $firstDeleteIndex -le $replicaIndex -or $ownedSequenceIndex -le $firstDeleteIndex -or $sequenceIndex -le $ownedSequenceIndex -or $originIndex -le $sequenceIndex -or $truncateIndex -ge 0 -or
      [regex]::IsMatch($loaderText,'(?i)truncate\s+(?:table\s+)?auth\.') -or $deleteMatches.Count -ne 93 -or
      $lockedTables.Count -ne 93 -or ($lockedTables -join "`n") -cne ($expectedLockedTables -join "`n") -or
      [regex]::Matches($loaderText,'(?i)exists\s*\(\s*select\s+1\s+from\s+auth\.users\s*\)').Count -ne 1 -or
      [regex]::Matches($loaderText,'(?i)exists\s*\(\s*select\s+1\s+from\s+auth\.identities\s*\)').Count -ne 1) {
    throw 'Guarded loader does not lock Auth plus the exact sorted 93 source tables before trigger-disabled deletes.'
  }
}

function Invoke-GuardedLocalRehearsalLoader {
  param(
    [Parameter(Mandatory)][string]$Database,
    [Parameter(Mandatory)][string]$SourcePath,
    [Parameter(Mandatory)][string]$GuardedPath,
    [string]$Label = 'rehearse selective application and portable Auth loader'
  )
  $sourceSha256 = (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToUpperInvariant()
  try {
    New-InTransactionAuthZeroLoader -SourcePath $SourcePath -DestinationPath $GuardedPath
    Assert-NotReparsePoint -Path $GuardedPath -Label 'guarded rehearsal selective loader'
    Assert-PortableAuthBoundary -LoaderPath $GuardedPath
    Assert-InTransactionAuthZeroGuard -LoaderPath $GuardedPath
    $guardedSha256 = (Get-FileHash -LiteralPath $GuardedPath -Algorithm SHA256).Hash.ToUpperInvariant()
    (Get-Item -LiteralPath $GuardedPath).IsReadOnly = $true
    if ((Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToUpperInvariant() -cne $sourceSha256) { throw 'Canonical rehearsal loader changed while preparing guarded execution.' }
    if ((Get-FileHash -LiteralPath $GuardedPath -Algorithm SHA256).Hash.ToUpperInvariant() -cne $guardedSha256) { throw 'Guarded rehearsal loader changed before execution.' }
    Invoke-SelectiveDataLoader -Database $Database -LoaderPath $GuardedPath -Label $Label
  } finally {
    if (Test-Path -LiteralPath $GuardedPath) {
      (Get-Item -LiteralPath $GuardedPath).IsReadOnly = $false
      Remove-Item -LiteralPath $GuardedPath -Force
    }
  }
}

function Get-CurrentRehearsalBinding {
  param([Parameter(Mandatory)]$VerifiedBackup)
  $artifacts = [ordered]@{
    loaderSha256 = Join-Path $ArtifactRoot $LoaderName
    heldStaffLoaderSha256 = Join-Path $ArtifactRoot $HeldStaffLoaderName
    portableAuthLoaderSha256 = Join-Path $ArtifactRoot $AuthLoaderName
  }
  foreach ($entry in $artifacts.GetEnumerator()) {
    if (-not (Test-Path -LiteralPath $entry.Value -PathType Leaf)) { throw "Rehearsal artifact is missing: $($entry.Value | Split-Path -Leaf)" }
    Assert-NotReparsePoint -Path $entry.Value -Label 'rehearsal loader'
  }
  $migrationBindings = @(Get-PortableTask4MigrationBindings -Migrations @(Get-Task4MigrationBindings))
  $validationEvidencePath = Join-Path $ArtifactRoot $Task4ValidationEvidenceName
  $dryRunEvidencePath = Join-Path $ArtifactRoot $Task4DryRunEvidenceName
  foreach ($path in @($validationEvidencePath,$dryRunEvidencePath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Task 4 protected evidence is missing: $(Split-Path -Leaf $path)" }
    Assert-NotReparsePoint -Path $path -Label 'Task 4 protected evidence'
  }
  return [ordered]@{
    runnerSha256 = Get-Task4IsolationContractRunnerSha256
    loaderSha256 = (Get-FileHash -LiteralPath $artifacts.loaderSha256 -Algorithm SHA256).Hash.ToUpperInvariant()
    heldStaffLoaderSha256 = (Get-FileHash -LiteralPath $artifacts.heldStaffLoaderSha256 -Algorithm SHA256).Hash.ToUpperInvariant()
    portableAuthLoaderSha256 = (Get-FileHash -LiteralPath $artifacts.portableAuthLoaderSha256 -Algorithm SHA256).Hash.ToUpperInvariant()
    approvedArchiveSha256 = (Get-FileHash -LiteralPath $ApprovedArchive -Algorithm SHA256).Hash.ToUpperInvariant()
    backupSha256 = $VerifiedBackup.sha256
    backupManifestSha256 = $VerifiedBackup.manifestSha256
    targetBaselineSha256 = ([string]$VerifiedBackup.manifest.targetBaselineSha256).ToUpperInvariant()
    migrations = $migrationBindings
    task4ValidationEvidenceSha256 = (Get-FileHash -LiteralPath $validationEvidencePath -Algorithm SHA256).Hash.ToUpperInvariant()
    task4DryRunEvidenceSha256 = (Get-FileHash -LiteralPath $dryRunEvidencePath -Algorithm SHA256).Hash.ToUpperInvariant()
  }
}

function Assert-Task4ValidationEvidence {
  param([Parameter(Mandatory)]$VerifiedBackup,[Parameter(Mandatory)]$Migrations)
  $validationPath = Join-Path $ArtifactRoot $Task4ValidationEvidenceName
  $dryRunPath = Join-Path $ArtifactRoot $Task4DryRunEvidenceName
  foreach ($path in @($validationPath,$dryRunPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Task 4 validation evidence is missing: $(Split-Path -Leaf $path)" }
    Assert-NotReparsePoint -Path $path -Label 'Task 4 validation evidence'
  }
  $validationSha256 = (Get-FileHash -LiteralPath $validationPath -Algorithm SHA256).Hash.ToUpperInvariant()
  $dryRunSha256 = (Get-FileHash -LiteralPath $dryRunPath -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($validationSha256 -cne $Task4ValidationEvidenceSha256 -or $dryRunSha256 -cne $Task4DryRunEvidenceSha256) {
    throw 'Task 4 validation evidence does not match the independently pinned accepted digests.'
  }
  $portableMigrations = @(Get-PortableTask4MigrationBindings -Migrations $Migrations)
  $dryRun = Get-Content -LiteralPath $dryRunPath -Raw | ConvertFrom-Json
  if (-not $dryRun.dryRunPassed -or $dryRun.targetWriteConnections -ne 0 -or $dryRun.baselineRows -ne 153 -or $dryRun.placeholderRows -ne 153 -or
      -not $dryRun.placeholdersEmpty -or $dryRun.pendingRows -ne 8 -or
      (Get-JsonSha256 -Value @($dryRun.listedPendingMigrations)) -ne (Get-JsonSha256 -Value @($portableMigrations.file))) {
    throw 'Task 4 real-TLS exact-history dry-run evidence is invalid.'
  }
  $validation = Get-Content -LiteralPath $validationPath -Raw | ConvertFrom-Json
  if ($validation.formatVersion -ne 1 -or $validation.mode -ne 'Validate' -or $validation.status -ne 'passed-and-rolled-back' -or
      -not $validation.tlsRequired -or -not $validation.exactPrePostMatch -or -not $validation.pgJsonschemaRemainingUninstalled -or
      $validation.targetRef -ne $ExpectedRef -or $validation.targetWriteConnections -ne 1 -or $validation.inTransactionValidatedPost.publicTables -ne 102 -or
      $validation.inTransactionValidatedPost.migrationRows -ne 153 -or $validation.inTransactionValidatedPost.pendingHistoryRows -ne 0 -or
      $validation.inTransactionValidatedPost.authUsers -ne 0 -or $validation.inTransactionValidatedPost.authIdentities -ne 0 -or
      -not $validation.inTransactionValidatedPost.pgJsonschemaInstalled -or $validation.inTransactionValidatedPost.pgJsonschemaVersion -ne '0.3.3') {
    throw 'Task 4 rollback-only managed-extension validation evidence is invalid.'
  }
  if ([string]$validation.repository.head -cne $Task4ValidatedBaseHead -or
      [string]$validation.repository.runnerSha256 -cne $LegacyCompositeRehearsalRunnerSha256 -or
      [string]$validation.realTlsDryRun.evidenceSha256 -cne $dryRunSha256 -or
      $validation.realTlsDryRun.baselinePlaceholders -ne 153 -or $validation.realTlsDryRun.pendingMigrations -ne 8 -or $validation.realTlsDryRun.targetWrites -ne 0) {
    throw 'Task 4 rollback evidence is not bound to the exact validated base runner, commit, and real-TLS dry run.'
  }
  if ($validation.sourceArchive.bytes -ne $ApprovedArchiveBytes -or [string]$validation.sourceArchive.sha256 -cne $ApprovedArchiveSha256 -or
      $validation.backup.bytes -ne $VerifiedBackup.bytes -or [string]$validation.backup.sha256 -cne $VerifiedBackup.sha256 -or
      [string]$validation.backup.targetBaselineSha256 -cne [string]$VerifiedBackup.manifest.targetBaselineSha256) {
    throw 'Task 4 rollback evidence is not bound to the approved source archive and verified backup.'
  }
  $evidenceMigrations = @($validation.migrations | ForEach-Object { [ordered]@{ version=[string]$_.version; file=[string]$_.file; sha256=([string]$_.sourceSha256).ToUpperInvariant() } })
  $legacyPortableMigrations = @(Get-Task4LegacyMigrationBindings -Migrations $Migrations)
  if ((Get-JsonSha256 -Value $evidenceMigrations) -ne (Get-JsonSha256 -Value $legacyPortableMigrations)) { throw 'Task 4 rollback evidence migration binding differs from the current exact eight.' }
  $baseline = $VerifiedBackup.manifest.targetBaseline
  foreach ($field in @('projectRef','publicTables','authUsers','authIdentities','migrationRows','migrationIdentitiesSha256','schemaSha256')) {
    if ([string]$validation.preState.$field -cne [string]$baseline.$field -or [string]$validation.postState.$field -cne [string]$baseline.$field) { throw "Task 4 rollback evidence baseline mismatch: $field" }
  }
  if ((Get-JsonSha256 -Value @($validation.preState.migrationIdentities)) -ne (Get-JsonSha256 -Value @($baseline.migrationIdentities)) -or
      (Get-JsonSha256 -Value @($validation.postState.migrationIdentities)) -ne (Get-JsonSha256 -Value @($baseline.migrationIdentities))) {
    throw 'Task 4 rollback evidence ordered baseline identities differ from the verified backup.'
  }
  $expected = New-PostMigrationExpectedInventory -PreBaseline $baseline -Migrations $portableMigrations -PublicTables 102 -SchemaSha256 ([string]$validation.expectedPersistentPost.schemaSha256) -ExtendedSchemaSha256 ([string]$validation.expectedPersistentPost.extendedSchemaSha256)
  foreach ($field in @('publicTables','authUsers','authIdentities','migrationRows','migrationIdentitiesSha256','schemaSha256','extendedSchemaSha256')) {
    if ([string]$validation.expectedPersistentPost.$field -cne [string]$expected.$field) { throw "Task 4 authorized expected post-state mismatch: $field" }
  }
  if ((Get-JsonSha256 -Value @($validation.expectedPersistentPost.migrationIdentities)) -ne (Get-JsonSha256 -Value @($expected.migrationIdentities))) { throw 'Task 4 authorized expected ordered post identities are invalid.' }
  return [ordered]@{
    sha256 = $validationSha256
    dryRunSha256 = $dryRunSha256
    repositoryHead = [string]$validation.repository.head
    validatedRunnerSha256 = [string]$validation.repository.runnerSha256
    migrations = $portableMigrations
    expectedPersistentPost = $expected
  }
}

function Assert-RehearsalArtifactBinding {
  param([Parameter(Mandatory)]$Current,[Parameter(Mandatory)]$Recorded,[Parameter(Mandatory)]$Task4Authorization,[Parameter(Mandatory)][string]$RecordedReportSha256)
  foreach ($field in @('loaderSha256','heldStaffLoaderSha256','portableAuthLoaderSha256','approvedArchiveSha256','backupSha256','backupManifestSha256','targetBaselineSha256')) {
    if ([string]$Current.$field -cne [string]$Recorded.$field) { throw "Rehearsal artifact binding changed: $field" }
  }
  if ([string]$Task4Authorization.repositoryHead -cne $Task4ValidatedBaseHead -or
      [string]$Task4Authorization.validatedRunnerSha256 -cne $LegacyCompositeRehearsalRunnerSha256 -or
      [string]$Recorded.runnerSha256 -cne [string]$Task4Authorization.validatedRunnerSha256 -or
      $RecordedReportSha256.ToUpperInvariant() -cne $LegacyCompositeRehearsalReportSha256) {
    throw 'Legacy rehearsal is not cross-bound to the exact rollback-validated base runner and commit.'
  }
  if ((Get-JsonSha256 -Value @($Recorded.migrations)) -ne (Get-JsonSha256 -Value $LegacyCompositeRehearsalMigrations)) {
    throw 'Legacy rehearsal does not contain the exact two historically rehearsed loader-enabling migrations.'
  }
  if ([string]$Current.task4ValidationEvidenceSha256 -cne [string]$Task4Authorization.sha256 -or
      [string]$Current.task4DryRunEvidenceSha256 -cne [string]$Task4Authorization.dryRunSha256 -or
      (Get-JsonSha256 -Value @($Current.migrations)) -ne (Get-JsonSha256 -Value @($Task4Authorization.migrations))) {
    throw 'Current composite rehearsal binding is not cross-bound to the accepted exact-eight validation evidence.'
  }
}

function Invoke-RehearsePhase {
  [void](Assert-ApprovedArchive)
  $verifiedBackup = Assert-VerifiedBackup
  $task4Migrations = @(Get-Task4MigrationBindings)
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
    $targetData = Join-Path $lists 'target-data.list'
    $targetPost = Join-Path $lists 'target-post.list'
    $targetStorageSchema = Join-Path $lists 'target-storage-schema.list'
    $targetStorageBucketData = Join-Path $lists 'target-storage-bucket-data.list'
    $targetMigrationPrerequisites = Join-Path $lists 'target-migration-prerequisites.list'
    [void](Write-TocSelection -Toc $sourceToc -Path $sourcePre -Stage pre -Scopes @('public','auth','migrations'))
    [void](Write-TocSelection -Toc $sourceToc -Path $sourceData -Stage data -Scopes @('public','auth','migrations'))
    [void](Write-TocSelection -Toc $sourceToc -Path $sourcePost -Stage post -Scopes @('public','auth'))
    [void](Write-TocSelection -Toc $targetToc -Path $targetPre -Stage pre -Scopes @('public','auth','migrations','storage'))
    [void](Write-TocSelection -Toc $targetToc -Path $targetData -Stage data -Scopes @('public','auth','migrations'))
    [void](Write-TocSelection -Toc $targetToc -Path $targetPost -Stage post -Scopes @('public','auth','migrations','storage'))
    Write-TocPatternSelection -Toc $targetToc -Path $targetStorageSchema -Patterns @(
      '^SCHEMA - storage '
    )
    Write-TocPatternSelection -Toc $targetToc -Path $targetStorageBucketData -Patterns @(
      '^TABLE DATA storage buckets '
    )
    Write-TocPatternSelection -Toc $targetToc -Path $targetMigrationPrerequisites -Patterns @(
      '^FUNCTION public is_staff_or_admin\(uuid\) '
      '^FUNCTION public is_clinical\(uuid\) '
      '^FUNCTION public is_staff_or_clinical\(uuid\) '
      '^FUNCTION storage foldername\(text\) '
      '^PUBLICATION - supabase_realtime '
      '^POLICY public clinic_reviews Public can read clinic_reviews active '
      '^POLICY public attendance_records Staff can view own attendance '
      '^POLICY public attendance_records Staff can insert own attendance '
      '^POLICY public daily_reports Staff can view own daily reports '
      '^POLICY public daily_reports Staff can insert own daily reports '
      '^POLICY public daily_reports Staff can update own daily reports '
      '^POLICY storage objects Staff view own daily report files '
      '^POLICY storage objects Staff can upload own daily report files '
      '^POLICY storage objects Staff can update own daily report files '
      '^POLICY storage objects Staff can delete own daily report files '
    )
    Assert-UniqueTocSelections -Selections @(
      @(Get-Content -LiteralPath $targetStorageSchema),
      @(Get-Content -LiteralPath $targetPre),
      @(Get-Content -LiteralPath $targetData),
      @(Get-Content -LiteralPath $targetStorageBucketData),
      @(Get-Content -LiteralPath $targetPost),
      @(Get-Content -LiteralPath $targetMigrationPrerequisites)
    )

    Restore-TocSelection -Archive $ApprovedArchive -Database $sourceDatabase -ListPath $sourcePre -Label 'restore source rehearsal schema'
    Restore-TocSelection -Archive $ApprovedArchive -Database $sourceDatabase -ListPath $sourceData -Label 'restore source rehearsal selected data'
    $identityCardinalityText = Invoke-LocalQuery -Database $sourceDatabase -Sql "select jsonb_build_object('rows',count(*),'distinctIds',count(distinct id))::text from auth.identities;" -Label 'source Auth identity cardinality precheck'
    $identityCardinality = $identityCardinalityText | ConvertFrom-Json
    Write-Log "Source Auth identity cardinality: rows=$($identityCardinality.rows); distinctIds=$($identityCardinality.distinctIds)."
    if ([int]$identityCardinality.rows -ne [int]$identityCardinality.distinctIds) {
      throw 'Approved source Auth identities contain duplicate primary-key identifiers.'
    }
    Restore-TocSelection -Archive $ApprovedArchive -Database $sourceDatabase -ListPath $sourcePost -Label 'validate source rehearsal constraints'

    Restore-TocSelection -Archive $verifiedBackup.path -Database $targetDatabase -ListPath $targetStorageSchema -Label 'restore target rehearsal storage schema prerequisite'
    Restore-TocSelection -Archive $verifiedBackup.path -Database $targetDatabase -ListPath $targetPre -Label 'restore target rehearsal schema'
    Restore-TocSelection -Archive $verifiedBackup.path -Database $targetDatabase -ListPath $targetData -Label 'restore target rehearsal selected data'
    Restore-TocSelection -Archive $verifiedBackup.path -Database $targetDatabase -ListPath $targetStorageBucketData -Label 'restore target rehearsal storage bucket prerequisite data'
    $scratchBaselineText = Invoke-LocalQuery -Database $targetDatabase -Label 'target scratch pre-constraint baseline counts' -Sql "select jsonb_build_object('publicTables',(select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'),'authUsers',(select count(*) from auth.users),'authIdentities',(select count(*) from auth.identities),'migrationRows',(select count(*) from supabase_migrations.schema_migrations),'migrationIdentities',(select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations))::text;"
    $scratchBaseline = $scratchBaselineText | ConvertFrom-Json
    $scratchBaselineIdentities = @($scratchBaseline.migrationIdentities | ForEach-Object { [string]$_ })
    if ($scratchBaseline.publicTables -ne 93 -or $scratchBaseline.authUsers -ne 0 -or $scratchBaseline.authIdentities -ne 0 -or $scratchBaseline.migrationRows -ne 153 -or
        (Get-StringSha256 -Value ($scratchBaselineIdentities -join "`n")) -ne ([string]$verifiedBackup.manifest.targetBaseline.migrationIdentitiesSha256).ToUpperInvariant()) {
      throw 'Restored target scratch data does not match the backup-bound baseline counts and migration identities.'
    }
    Restore-TocSelection -Archive $verifiedBackup.path -Database $targetDatabase -ListPath $targetPost -Label 'restore target rehearsal constraints before Task 4 migrations'
    Restore-TocSelection -Archive $verifiedBackup.path -Database $targetDatabase -ListPath $targetMigrationPrerequisites -Label 'restore target scratch migration prerequisites'
    Assert-Task4ScratchPrerequisites -Database $targetDatabase
    Invoke-Task4ScratchMigrations -Database $targetDatabase -Migrations $task4Migrations
    Assert-Task4LocalSchemaAndDependencies -Database $targetDatabase
    $task4PostText = Invoke-LocalQuery -Database $targetDatabase -Label 'task 4 exact post-migration inventory' -Sql "select jsonb_build_object('publicTables',(select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'),'authUsers',(select count(*) from auth.users),'authIdentities',(select count(*) from auth.identities),'migrationRows',(select count(*) from supabase_migrations.schema_migrations),'migrationIdentities',(select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations))::text;"
    $task4PostInventory = $task4PostText | ConvertFrom-Json
    $expectedPostIdentities = @($verifiedBackup.manifest.targetBaseline.migrationIdentities | ForEach-Object { [string]$_ }) + @($task4Migrations | ForEach-Object { [string]$_.version })
    if ($task4PostInventory.publicTables -ne 102 -or $task4PostInventory.authUsers -ne 0 -or $task4PostInventory.authIdentities -ne 0 -or $task4PostInventory.migrationRows -ne 161 -or
        (Get-JsonSha256 -Value @($task4PostInventory.migrationIdentities)) -ne (Get-JsonSha256 -Value $expectedPostIdentities)) {
      throw 'Task 4 scratch post-migration inventory is not the exact 102-table, 161-identity state.'
    }

    $sourceColumns = @(Get-ColumnMetadata -Database $sourceDatabase)
    $targetColumns = @(Get-ColumnMetadata -Database $targetDatabase | Where-Object { $_.schema_name -eq 'auth' -or ("public.$($_.table_name)" -in $sourcePublicTables) })
    $columnDiff = Compare-ColumnMetadata -Source $sourceColumns -Target $targetColumns
    $sourceNullCounts = Get-SourceNullCounts -Database $sourceDatabase -Details @($columnDiff.nullabilityDifferenceDetails)
    $nullabilityClassification = Classify-NullabilityDifferences -Details @($columnDiff.nullabilityDifferenceDetails) -SourceNullCounts $sourceNullCounts
    $columnDiff['sourceNullCounts'] = $sourceNullCounts
    $columnDiff['allowedNullabilityDifferences'] = @($nullabilityClassification.allowed)
    $columnDiff['blockingNullabilityDifferences'] = @($nullabilityClassification.blocking)
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
    $guardedRehearsalLoader = Join-Path $ArtifactRoot ('.task4-rehearsal-auth-zero-loader-' + $PID + '.sql')
    $authBaseline = Get-Task4AuthAggregateBaseline
    $sourceAuthAggregate = Get-LocalTask4AuthAggregate -Database $sourceDatabase -Label 'source portable Auth preservation aggregate'
    [void](Assert-Task4AuthAggregate -Actual $sourceAuthAggregate -Baseline $authBaseline)
    New-SelectiveLoader -SourceDatabase $sourceDatabase -PublicTables $sourcePublicTables -OutputPath $mainLoader
    New-SelectiveLoader -SourceDatabase $sourceDatabase -PublicTables $sourcePublicTables -OutputPath $staffLoader -StaffOnly
    New-SelectiveLoader -SourceDatabase $sourceDatabase -PublicTables $sourcePublicTables -OutputPath $authLoader -AuthOnly

    $blockingColumnDiff = @($columnDiff.sourceOnly).Count -gt 0 -or
      @($columnDiff.targetRequiredOnly).Count -gt 0 -or
      @($columnDiff.typeDifferences).Count -gt 0 -or
      @($columnDiff.blockingNullabilityDifferences).Count -gt 0 -or
      @($columnDiff.blockingDefaultDifferences).Count -gt 0
    if ($blockingColumnDiff) {
      Invoke-SelectiveDataLoader -Database $targetDatabase -LoaderPath $authLoader -Label 'rehearse portable Auth-only loader'

      $sourceConstraints = @(Get-ConstraintMetadata -Database $sourceDatabase)
      $targetConstraints = @(Get-ConstraintMetadata -Database $targetDatabase | Where-Object { $_.schema_name -eq 'auth' -or ("public.$($_.table_name)" -in $sourcePublicTables) })
      $constraintDiff = Compare-ConstraintMetadata -Source $sourceConstraints -Target $targetConstraints
      $sourceCounts = Get-TableCounts -Database $sourceDatabase
      $sourceUsers = [int](Invoke-LocalQuery -Database $sourceDatabase -Sql 'select count(*) from auth.users;' -Label 'source rehearsal Auth user count')
      $sourceIdentities = [int](Invoke-LocalQuery -Database $sourceDatabase -Sql 'select count(*) from auth.identities;' -Label 'source rehearsal Auth identity count')
      $targetUsers = [int](Invoke-LocalQuery -Database $targetDatabase -Sql 'select count(*) from auth.users;' -Label 'target rehearsal Auth user count')
      $targetIdentities = [int](Invoke-LocalQuery -Database $targetDatabase -Sql 'select count(*) from auth.identities;' -Label 'target rehearsal Auth identity count')
      $targetAuthAggregate = Get-LocalTask4AuthAggregate -Database $targetDatabase -Label 'target rehearsal portable Auth aggregate'
      [void](Assert-Task4AuthAggregate -Actual $targetAuthAggregate -Baseline $authBaseline -RequireNeutralized)
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
        safety = [ordered]@{ targetWriteConnections = 0; localHost = '127.0.0.1'; protectedArtifactsOnly = $true; migrationsApplied = 8 }
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
        auth = [ordered]@{ sourceUsers = $sourceUsers; sourceIdentities = $sourceIdentities; importedUsers = $targetUsers; importedIdentities = $targetIdentities; sessions = 0; refreshTokens = 0; aggregate = $sourceAuthAggregate; importedAggregate = $targetAuthAggregate }
        loader = [ordered]@{ main = $LoaderName; heldStaffMessages = $HeldStaffLoaderName; portableAuth = $AuthLoaderName; publicDataExecuted = $false; productionTargetUsed = $false }
      }
      Write-ProtectedJson -Path (Join-Path $ArtifactRoot 'rehearsal-failure-report.json') -Value $report
      throw 'Scratch rehearsal blocked: populated source columns have no lossless representation in the authoritative target schema.'
    }

    Invoke-GuardedLocalRehearsalLoader -Database $targetDatabase -SourcePath $mainLoader -GuardedPath $guardedRehearsalLoader -Label 'rehearse selective application and portable Auth loader'
    Invoke-SelectiveDataLoader -Database $targetDatabase -LoaderPath $staffLoader -Label 'rehearse held staff_messages loader'

    $sourceConstraints = @(Get-ConstraintMetadata -Database $sourceDatabase)
    $targetConstraints = @(Get-ConstraintMetadata -Database $targetDatabase | Where-Object { $_.schema_name -eq 'auth' -or ("public.$($_.table_name)" -in $sourcePublicTables) })
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
    $targetAuthAggregate = Get-LocalTask4AuthAggregate -Database $targetDatabase -Label 'target rehearsal portable Auth aggregate'
    [void](Assert-Task4AuthAggregate -Actual $targetAuthAggregate -Baseline $authBaseline -RequireNeutralized)
    $sourceMigrationText = Invoke-LocalQuery -Database $sourceDatabase -Sql "select coalesce(jsonb_agg(version order by version),'[]'::jsonb)::text from supabase_migrations.schema_migrations;" -Label 'source rehearsal migration identities'
    $sourceMigrations = @(ConvertFrom-JsonArray -Text $sourceMigrationText)
    $targetInventoryPath = Join-Path $ArtifactRoot $InventoryName
    if (-not (Test-Path -LiteralPath $targetInventoryPath)) { [void](Invoke-InventoryPhase) }
    $targetInventory = (Get-Content -LiteralPath $targetInventoryPath -Raw | ConvertFrom-Json).target
    $sequenceChecks = @(Get-SequenceChecks -Database $targetDatabase)
    $failedSequences = @($sequenceChecks | Where-Object { -not $_.passed })
    $foreignKeyConstraintCount = Get-ForeignKeyConstraintCount -Database $targetDatabase
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
      @($columnDiff.blockingNullabilityDifferences).Count -eq 0 -and @($columnDiff.blockingDefaultDifferences).Count -eq 0 -and
      @($columnDiff.allowedDefaultDifferences).Count -eq 1 -and $columnDiff.allowedDefaultDifferences[0] -eq 'public.appointments.status' -and
      @($constraintDiff.unvalidated).Count -eq 0 -and $foreignKeyConstraintCount -gt 0 -and $failedSequences.Count -eq 0

    if (-not $pass) { throw 'Scratch rehearsal completed but reconciliation gates did not pass; inspect the protected diagnostics.' }
    $binding = Get-CurrentRehearsalBinding -VerifiedBackup $verifiedBackup
    $report = [ordered]@{
      pass = [bool]$pass
      generatedAtUtc = [DateTime]::UtcNow.ToString('o')
      safety = [ordered]@{ targetWriteConnections = 0; localHost = '127.0.0.1'; protectedArtifactsOnly = $true; migrationsApplied = 8 }
      source = [ordered]@{ publicTables = $sourcePublicTables.Count; tableCounts = $sourceCounts; migrations = $sourceMigrations; archiveSha256 = $ApprovedArchiveSha256 }
      targetBaseline = $verifiedBackup.manifest.targetBaseline
      task4ScratchPost = [ordered]@{ publicTables=102; authUsers=0; authIdentities=0; migrationRows=161; migrationIdentities=$expectedPostIdentities; migrations=@(Get-PortableTask4MigrationBindings -Migrations $task4Migrations) }
      tableDiff = $tableDiff
      columnDiff = $columnDiff
      constraintDiff = $constraintDiff
      foreignKeyAudit = [ordered]@{ checked = $foreignKeyConstraintCount; failures = 0; enforcedBeforeLoaderCommit = $true }
      policyDiff = $policyDiff
      functionDiff = $functionDiff
      rowCountDifferences = $countDifferences
      sequenceChecks = $sequenceChecks
      auth = [ordered]@{ sourceUsers = $sourceUsers; sourceIdentities = $sourceIdentities; importedUsers = $targetUsers; importedIdentities = $targetIdentities; sessions = 0; refreshTokens = 0; aggregate = $sourceAuthAggregate; importedAggregate = $targetAuthAggregate }
      loader = [ordered]@{ main = $LoaderName; heldStaffMessages = $HeldStaffLoaderName; productionTargetUsed = $false }
      binding = $binding
      bindingSha256 = Get-JsonSha256 -Value $binding
    }
    Write-ProtectedJson -Path (Join-Path $ArtifactRoot $ReportName) -Value $report
    Write-Summary 'Rehearsal passed locally: source public tables=94; source-only=public.staff_messages; Auth users=11; identities=11; imported sessions=0; refresh tokens=0; target writes=0.'
  } finally {
    Stop-DisposablePostgres -DataPath $scratch
    if (Test-Path -LiteralPath $lists) { Remove-Item -LiteralPath $lists -Recurse -Force }
  }
}

function Assert-RehearsalReport {
  param([Parameter(Mandatory)]$VerifiedBackup,[Parameter(Mandatory)]$Task4Authorization)
  $path = Join-Path $ArtifactRoot $ReportName
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Passing rehearsal report is required.' }
  Assert-NotReparsePoint -Path $path -Label 'rehearsal report'
  $reportSha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToUpperInvariant()
  $report = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if (-not $report.pass -or $report.auth.sessions -ne 0 -or $report.auth.refreshTokens -ne 0 -or
      $report.foreignKeyAudit.failures -ne 0 -or -not $report.foreignKeyAudit.enforcedBeforeLoaderCommit) {
    throw 'Rehearsal report does not pass the required Auth and referential-integrity gates.'
  }
  $authBaseline = Get-Task4AuthAggregateBaseline
  [void](Assert-Task4AuthAggregate -Actual $report.auth.aggregate -Baseline $authBaseline)
  [void](Assert-Task4AuthAggregate -Actual $report.auth.importedAggregate -Baseline $authBaseline -RequireNeutralized)
  if ((Get-JsonSha256 -Value $report.binding) -ne ([string]$report.bindingSha256).ToUpperInvariant()) {
    throw 'Rehearsal report binding digest is invalid.'
  }
  $currentBinding = Get-CurrentRehearsalBinding -VerifiedBackup $VerifiedBackup
  if ((Get-JsonSha256 -Value $currentBinding) -ne (Get-JsonSha256 -Value $report.binding)) {
    Assert-RehearsalArtifactBinding -Current $currentBinding -Recorded $report.binding -Task4Authorization $Task4Authorization -RecordedReportSha256 $reportSha256
  }
  Assert-TargetBaselineUnchanged -Expected $VerifiedBackup.manifest.targetBaseline -Actual $report.targetBaseline
  $report | Add-Member -MemberType NoteProperty -Name currentBinding -Value $currentBinding -Force
  $report | Add-Member -MemberType NoteProperty -Name currentBindingSha256 -Value (Get-JsonSha256 -Value $currentBinding) -Force
  return $report
}

function Assert-Task4PinnedSupabaseCli {
  if (-not (Test-Path -LiteralPath $SupabaseCli -PathType Leaf)) { throw 'Pinned Supabase CLI is missing.' }
  Assert-NotReparsePoint -Path $SupabaseCli -Label 'pinned Supabase CLI'
  if ((Get-FileHash -LiteralPath $SupabaseCli -Algorithm SHA256).Hash.ToUpperInvariant() -cne $Task4SupabaseCliSha256) { throw 'Pinned Supabase CLI executable digest does not match the approved v2.109.1 binary.' }
  $version = (& $SupabaseCli --version 2>$null | Out-String).Trim()
  if ($version -cne $Task4SupabaseCliVersion) { throw 'Pinned Supabase CLI version does not match the approved v2.109.1 binary.' }
}

function Get-Task4TlsDatabaseUrl {
  if ($null -eq $script:Target -or [string]::IsNullOrWhiteSpace([string]$script:Target.Host) -or [string]::IsNullOrWhiteSpace([string]$script:Target.Username) -or [string]::IsNullOrWhiteSpace([string]$script:Target.Database)) { throw 'Task 4 target connection identity is unavailable.' }
  if ([string]$script:Target.Host -match '[\[\]?#@/]') { throw 'Task 4 Push refuses an ambiguous target host.' }
  $user = [Uri]::EscapeDataString([string]$script:Target.Username)
  $database = [Uri]::EscapeDataString([string]$script:Target.Database)
  return "postgresql://$user@$($script:Target.Host):$($script:Target.Port)/${database}?sslmode=require"
}

function Assert-Task4MigrationWorkdirLayout {
  param([Parameter(Mandatory)][string]$Workdir)
  $supabaseDirectory = Join-Path $Workdir 'supabase'
  $tempDirectory = Join-Path $supabaseDirectory '.temp'
  $cliLatest = Join-Path $tempDirectory 'cli-latest'
  foreach ($path in @($Workdir,$supabaseDirectory,(Join-Path $supabaseDirectory 'migrations'),(Join-Path $supabaseDirectory 'config.toml'),$tempDirectory,$cliLatest)) { Assert-NoReparsePointInPath -Path $path -Label 'protected Task 4 migration workdir layout' }
  $rootEntries = @(Get-ChildItem -LiteralPath $Workdir -Force | ForEach-Object Name)
  if ($rootEntries.Count -ne 1 -or $rootEntries[0] -cne 'supabase') { throw 'Protected Task 4 migration workdir contains an unexpected root entry.' }
  $supabaseEntries = @(Get-ChildItem -LiteralPath $supabaseDirectory -Force | ForEach-Object Name | Sort-Object)
  if (($supabaseEntries -join "`n") -cne ((@('.temp','config.toml','migrations') | Sort-Object) -join "`n")) { throw 'Protected Task 4 migration workdir contains an unexpected supabase entry.' }
  if ((Get-Content -LiteralPath (Join-Path $supabaseDirectory 'config.toml') -Raw) -cne ("project_id = `"$ExpectedRef`"`n")) { throw 'Protected Task 4 migration workdir config is not bound to the exact target identity.' }
  if ((Get-ChildItem -LiteralPath $tempDirectory -Force | ForEach-Object Name) -cne 'cli-latest' -or (Get-Item -LiteralPath $cliLatest).Length -ne 8 -or (Get-FileHash -LiteralPath $cliLatest -Algorithm SHA256).Hash.ToUpperInvariant() -cne '0DAAAC4EB443724F347B3D1DF0DBACFFB1E0755F345412D1F9032EB664AA9B18') { throw 'Protected Task 4 CLI state file is invalid.' }
}

function Get-Task4SanitizedCliTranscript {
  param(
    [Parameter(Mandatory)][ValidateSet('DryRun','Push')][string]$Phase,
    [Parameter(Mandatory)]$Migrations,
    $PostHistory
  )
  $portable = @(Get-PortableTask4MigrationBindings -Migrations $Migrations)
  if ($portable.Count -ne 8 -or (Get-JsonSha256 -Value $portable) -cne $Task4MigrationHistoryBindingSha256) { throw 'Task 4 sanitized CLI transcript has an invalid migration binding.' }
  $lines = @('TASK4 SANITIZED CLI TRANSCRIPT',("phase=$Phase"),'status=validated',("migrationsSha256=$Task4MigrationHistoryBindingSha256"))
  if ($Phase -eq 'Push') {
    if ($null -eq $PostHistory -or (Get-JsonSha256 -Value @($PostHistory)) -cne $Task4MigrationHistoryBindingSha256) { throw 'Task 4 sanitized Push transcript has an invalid exact post-write history.' }
    $lines += "postHistorySha256=$Task4MigrationHistoryBindingSha256"
  }
  $lines += @($portable | ForEach-Object { "migration=$([string]$_.file)" })
  return (($lines -join "`n") + "`n")
}

function Write-Task4SanitizedCliTranscript {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][ValidateSet('DryRun','Push')][string]$Phase,
    [Parameter(Mandatory)]$Migrations,
    $PostHistory
  )
  $artifactRootPath = Get-NormalizedPath $ArtifactRoot
  $path = Get-NormalizedPath (Join-Path $ArtifactRoot $Name)
  if (-not $path.StartsWith(($artifactRootPath + '\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Task 4 CLI transcript destination escapes the protected artifact root.' }
  Assert-NoReparsePointInPath -Path $artifactRootPath -Label 'protected artifact root'
  Assert-NoReparsePointInPath -Path $path -Label 'Task 4 CLI transcript destination'
  $temporary = "$path.$PID.tmp"
  if (Test-Path -LiteralPath $temporary) {
    Assert-NoReparsePointInPath -Path $temporary -Label 'Task 4 CLI transcript temporary destination'
    throw 'Task 4 CLI transcript temporary destination already exists.'
  }
  $content = Get-Task4SanitizedCliTranscript -Phase $Phase -Migrations $Migrations -PostHistory $PostHistory
  Write-Utf8NoBom -Path $temporary -Content $content
  Assert-NoReparsePointInPath -Path $temporary -Label 'Task 4 CLI transcript temporary destination'
  Assert-NoReparsePointInPath -Path $path -Label 'Task 4 CLI transcript destination'
  Move-Item -LiteralPath $temporary -Destination $path -Force
  Assert-NoReparsePointInPath -Path $path -Label 'Task 4 CLI transcript'
  return [ordered]@{ file=$Name; bytes=[int64](Get-Item -LiteralPath $path).Length; sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToUpperInvariant() }
}

function Assert-Task4BaselinePlaceholderBinding {
  param([Parameter(Mandatory)]$VerifiedBackup)
  $versions = @((Get-Task4BaselineMigrationFiles) | ForEach-Object { $_.Substring(0,14) })
  if ($versions.Count -ne 153 -or (Get-JsonSha256 -Value $versions) -cne (Get-JsonSha256 -Value @($VerifiedBackup.manifest.targetBaseline.migrationIdentities))) { throw 'Exact 153 migration workdir placeholders are not bound to the verified remote baseline identities.' }
}

function Assert-Task4CliDryRunOutput {
  param([Parameter(Mandatory)]$Lines,[Parameter(Mandatory)]$Migrations)
  $text = @($Lines) -join "`n"
  $listed = @([regex]::Matches($text,'\b\d{14}_[A-Za-z0-9_-]+\.sql\b') | ForEach-Object Value)
  $expected = @($Migrations | ForEach-Object { [string]$_.file })
  if ($text -notmatch '(?i)dry\s+run' -or (Get-JsonSha256 -Value $listed) -cne (Get-JsonSha256 -Value $expected)) { throw 'Pinned Supabase CLI dry run did not list exactly the approved eight pending migrations in order.' }
  return $listed
}

function Assert-Task4TranscriptBinding {
  param(
    [Parameter(Mandatory)]$Binding,
    [Parameter(Mandatory)][string]$ExpectedName,
    [Parameter(Mandatory)][ValidateSet('DryRun','Push')][string]$Phase,
    [Parameter(Mandatory)]$Migrations,
    $PostHistory
  )
  if ([string]$Binding.file -cne $ExpectedName -or [int64]$Binding.bytes -le 0 -or [string]$Binding.sha256 -notmatch '^[A-F0-9]{64}$') { throw 'Task 4 CLI transcript binding is invalid.' }
  $path = Join-Path $ArtifactRoot $ExpectedName
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Task 4 CLI transcript is missing.' }
  Assert-NoReparsePointInPath -Path $path -Label 'Task 4 CLI transcript'
  if ((Get-Content -LiteralPath $path -Raw) -cne (Get-Task4SanitizedCliTranscript -Phase $Phase -Migrations $Migrations -PostHistory $PostHistory)) { throw 'Task 4 CLI transcript content is not the exact sanitized binding.' }
  if ([int64](Get-Item -LiteralPath $path).Length -ne [int64]$Binding.bytes -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToUpperInvariant() -cne [string]$Binding.sha256) { throw 'Task 4 CLI transcript changed after Push evidence was written.' }
}

function New-Task4MigrationWorkdir {
  param([Parameter(Mandatory)]$Migrations)
  $workdir = Join-Path $ArtifactRoot 'task4-migration-push-workdir'
  $supabaseDirectory = Join-Path $workdir 'supabase'
  $migrationDirectory = Join-Path $supabaseDirectory 'migrations'
  $tempDirectory = Join-Path $supabaseDirectory '.temp'
  $cliLatest = Join-Path $tempDirectory 'cli-latest'
  $configPath = Join-Path $supabaseDirectory 'config.toml'
  if (-not (Test-Path -LiteralPath $workdir)) {
    New-Item -ItemType Directory -Path $migrationDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $tempDirectory -Force | Out-Null
    Write-Utf8NoBom -Path $configPath -Content ("project_id = `"$ExpectedRef`"`n")
    Write-Utf8NoBom -Path $cliLatest -Content 'v2.109.1'
    foreach ($file in @(Get-Task4BaselineMigrationFiles)) { [IO.File]::WriteAllBytes((Join-Path $migrationDirectory $file),[byte[]]@()) }
    foreach ($migration in @($Migrations)) { Copy-Item -LiteralPath $migration.path -Destination (Join-Path $migrationDirectory $migration.file) }
  }
  foreach ($path in @($workdir,$supabaseDirectory,$migrationDirectory,$configPath,$tempDirectory,$cliLatest)) {
    if (-not (Test-Path -LiteralPath $path)) { throw 'Protected Task 4 migration workdir is incomplete.' }
    Assert-NoReparsePointInPath -Path $path -Label 'protected Task 4 migration workdir'
  }
  if ((Get-Content -LiteralPath $configPath -Raw).Trim() -cne ("project_id = `"$ExpectedRef`"")) { throw 'Protected Task 4 migration workdir config is not bound to the exact target identity.' }
  Assert-Task4MigrationWorkdirLayout -Workdir $workdir
  $inventory = Get-Task4MigrationWorkdirInventory -Workdir $workdir
  [void](Assert-Task4MigrationWorkdirInventory -Inventory $inventory -Migrations $Migrations)
  return [ordered]@{ path=$workdir; inventory=$inventory }
}

function Invoke-Task4PinnedCliDryRun {
  param([Parameter(Mandatory)][string]$Workdir)
  $arguments = @('db','push','--db-url',(Get-Task4TlsDatabaseUrl),'--workdir',$Workdir,'--include-all','--dry-run','--yes')
  $output = @(Invoke-WithTargetEnvironment -Action { Invoke-External -File $SupabaseCli -Arguments $arguments -Label 'Task 4 exact migration push dry run' -NoOutputLog })
  return [ordered]@{ log=$output }
}

function Assert-Task4FinalPushWorkdir {
  param([Parameter(Mandatory)][string]$Workdir,[Parameter(Mandatory)]$Migrations)
  Assert-Task4MigrationWorkdirLayout -Workdir $Workdir
  $inventory = Get-Task4MigrationWorkdirInventory -Workdir $Workdir
  return (Assert-Task4MigrationWorkdirInventory -Inventory $inventory -Migrations $Migrations)
}

function Invoke-Task4PinnedCliPush {
  param([Parameter(Mandatory)][string]$Workdir,[Parameter(Mandatory)]$Migrations)
  $dbUrl = Get-Task4TlsDatabaseUrl
  $execution = Invoke-WithTargetEnvironment -Action {
    $arguments = @('db','push','--db-url',$dbUrl,'--workdir',$Workdir,'--include-all','--yes')
    $priorErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      Assert-Task4PinnedSupabaseCli
      $finalWorkdir = Assert-Task4FinalPushWorkdir -Workdir $Workdir -Migrations $Migrations
      $pushLog = @(& $SupabaseCli @arguments 2>&1)
      $exitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $priorErrorActionPreference
    }
    if ($exitCode -ne 0) { throw "Task 4 exact migration push failed with exit code $exitCode." }
    return [pscustomobject]@{ inventory=$finalWorkdir; log=@($pushLog) }
  }
  return [ordered]@{ inventory=$execution.inventory; log=@($execution.log) }
}

function Assert-Task4MigrationPushEvidenceShape {
  param(
    [Parameter(Mandatory)]$Document,
    [DateTimeOffset]$NowUtc = [DateTimeOffset]::UtcNow
  )
  Assert-Task4IsolationExactProperties -Value $Document -Names @('payload','payloadSha256') -Label 'Task 4 migration Push evidence envelope'
  Assert-Task4IsolationSha256 -Value $Document.payloadSha256 -Label 'Task 4 migration Push evidence self-hash'
  if ([string]$Document.payloadSha256 -cne (Get-JsonSha256 -Value $Document.payload)) { throw 'Task 4 migration Push evidence self-hash is invalid.' }
  $payload = $Document.payload
  Assert-Task4IsolationExactProperties -Value $payload -Names @('formatVersion','status','completedAtUtc','targetRef','cli','producerRunnerSha256','connection','preBaseline','preBaselineSha256','stagingIsolation','workdir','migrations','migrationsSha256','listedPendingMigrations','dryRunTranscript','dryRunTranscriptSha256','pushTranscript','pushTranscriptSha256','postHistory','postHistorySha256','postTargetState','postWriteIsolationState','postWriteIsolationStateSha256') -Label 'Task 4 migration Push evidence payload'
  Assert-Task4IsolationInteger -Value $payload.formatVersion -Label 'Task 4 migration Push evidence formatVersion'
  if ([int64]$payload.formatVersion -ne 2 -or $payload.status -isnot [string] -or [string]$payload.status -cne 'completed' -or $payload.completedAtUtc -isnot [string] -or $payload.targetRef -isnot [string] -or [string]$payload.targetRef -cne $ExpectedRef) { throw 'Task 4 migration Push evidence identity, status, timestamp, or format type is invalid.' }
  Assert-Task4IsolationExactProperties -Value $payload.cli -Names @('version','sha256') -Label 'Task 4 migration Push evidence CLI binding'
  if ($payload.cli.version -isnot [string]) { throw 'Task 4 migration Push evidence CLI version must be a JSON string.' }
  Assert-Task4IsolationSha256 -Value $payload.cli.sha256 -Label 'Task 4 migration Push evidence CLI digest'
  Assert-Task4IsolationSha256 -Value $payload.producerRunnerSha256 -Label 'Task 4 migration Push producer runner digest'
  Assert-Task4IsolationExactProperties -Value $payload.connection -Names @('host','port','username','database','sslMode','credentialTransport') -Label 'Task 4 migration Push evidence connection binding'
  Assert-Task4IsolationInteger -Value $payload.connection.port -Label 'Task 4 migration Push evidence connection port'
  foreach ($name in @('host','username','database','sslMode','credentialTransport')) { if ($payload.connection.$name -isnot [string]) { throw "Task 4 migration Push evidence connection $name must be a JSON string." } }
  foreach ($name in @('preBaselineSha256','migrationsSha256','dryRunTranscriptSha256','pushTranscriptSha256','postHistorySha256','postWriteIsolationStateSha256')) { Assert-Task4IsolationSha256 -Value $payload.$name -Label "Task 4 migration Push evidence $name" }
  foreach ($name in @('migrations','listedPendingMigrations','postHistory')) { if ($payload.$name -isnot [Array]) { throw "Task 4 migration Push evidence $name must be a JSON array." } }
  foreach ($name in @('preBaseline','stagingIsolation','workdir','dryRunTranscript','pushTranscript','postTargetState','postWriteIsolationState')) {
    if ($payload.$name -isnot [Collections.IDictionary] -and $payload.$name -isnot [pscustomobject]) { throw "Task 4 migration Push evidence $name must be a JSON object." }
  }
  $completedAt = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse([string]$payload.completedAtUtc,[ref]$completedAt) -or $completedAt.Offset -ne [TimeSpan]::Zero -or $completedAt -gt $NowUtc.ToUniversalTime().AddMinutes(5) -or $NowUtc.ToUniversalTime() - $completedAt -gt [TimeSpan]::FromHours($Task4ImportPushEvidenceMaxAgeHours)) { throw 'Task 4 migration Push evidence is not fresh enough to authorize Import.' }
  return $payload
}

function Assert-Task4MigrationPushEvidence {
  param(
    [Parameter(Mandatory)]$VerifiedBackup,
    [Parameter(Mandatory)]$Migrations,
    [Parameter(Mandatory)]$Authorization,
    $StagingIsolationEvidence,
    $CurrentPostMigrationIsolation,
    [DateTimeOffset]$NowUtc = [DateTimeOffset]::UtcNow,
    [switch]$SkipIndependentPin
  )
  if (-not $SkipIndependentPin -and [string]::IsNullOrWhiteSpace($Task4MigrationPushEvidenceSha256)) { throw 'Task 4 migration Push evidence has not been independently pinned.' }
  if (-not $SkipIndependentPin -and [string]$Task4MigrationPushProducerRunnerSha256 -notmatch '^[A-F0-9]{64}$') { throw 'Task 4 migration Push producer runner has not been independently pinned.' }
  $evidencePath = Join-Path $ArtifactRoot $Task4MigrationPushEvidenceName
  if (-not (Test-Path -LiteralPath $evidencePath -PathType Leaf)) { throw 'Completed Task 4 migration Push evidence is required before import.' }
  Assert-NoReparsePointInPath -Path $evidencePath -Label 'Task 4 migration Push evidence'
  if (-not $SkipIndependentPin -and (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToUpperInvariant() -cne $Task4MigrationPushEvidenceSha256) { throw 'Task 4 migration Push evidence does not match its independent pin.' }
  try { $evidence = [Text.UTF8Encoding]::new($false,$true).GetString([IO.File]::ReadAllBytes((Get-NormalizedPath $evidencePath))) | ConvertFrom-Json -ErrorAction Stop } catch { throw 'Task 4 migration Push evidence is not strict UTF-8 JSON.' }
  $payload = Assert-Task4MigrationPushEvidenceShape -Document $evidence -NowUtc $NowUtc
  $currentRunnerSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($payload.formatVersion -ne 2 -or $payload.status -ne 'completed' -or [string]$payload.targetRef -cne $ExpectedRef -or
      [string]$payload.cli.version -cne $Task4SupabaseCliVersion -or [string]$payload.cli.sha256 -cne $Task4SupabaseCliSha256 -or
      (Get-JsonSha256 -Value $payload.preBaseline) -cne (Get-JsonSha256 -Value $VerifiedBackup.manifest.targetBaseline) -or
      [string]$payload.preBaselineSha256 -cne [string]$VerifiedBackup.manifest.targetBaselineSha256) { throw 'Task 4 migration Push evidence is not bound to the exact target, CLI, and pre-write baseline.' }
  if ($SkipIndependentPin -and [string]$payload.producerRunnerSha256 -cne $currentRunnerSha256) { throw 'Task 4 migration Push evidence producer runner does not match the current runner.' }
  if (-not $SkipIndependentPin -and [string]$payload.producerRunnerSha256 -cne $Task4MigrationPushProducerRunnerSha256) { throw 'Task 4 migration Push evidence producer runner is not independently pinned.' }
  if ([string]$payload.connection.host -cne [string]$script:Target.Host -or [int]$payload.connection.port -ne [int]$script:Target.Port -or [string]$payload.connection.username -cne [string]$script:Target.Username -or [string]$payload.connection.database -cne [string]$script:Target.Database -or [string]$payload.connection.sslMode -cne 'require' -or [string]$payload.connection.credentialTransport -cne 'PGPASSWORD') { throw 'Task 4 migration Push evidence connection identity is invalid.' }
  Assert-Task4BaselinePlaceholderBinding -VerifiedBackup $VerifiedBackup
  $workdir = Join-Path $ArtifactRoot 'task4-migration-push-workdir'
  $currentWorkdir = Assert-Task4FinalPushWorkdir -Workdir $workdir -Migrations $Migrations
  if ((Get-JsonSha256 -Value $payload.workdir) -cne (Get-JsonSha256 -Value $currentWorkdir)) { throw 'Task 4 migration Push evidence workdir inventory does not match the current protected workdir.' }
  $portable = @(Get-PortableTask4MigrationBindings -Migrations $Migrations)
  if ((Get-JsonSha256 -Value @($payload.migrations)) -cne (Get-JsonSha256 -Value $portable) -or
      (Get-JsonSha256 -Value @($payload.listedPendingMigrations)) -cne (Get-JsonSha256 -Value @($portable.file)) -or [string]$payload.migrationsSha256 -cne $Task4MigrationHistoryBindingSha256 -or
      (Get-JsonSha256 -Value @($payload.postHistory)) -cne (Get-JsonSha256 -Value $portable) -or [string]$payload.postHistorySha256 -cne $Task4MigrationHistoryBindingSha256 -or
      [string]$payload.dryRunTranscriptSha256 -notmatch '^[A-F0-9]{64}$' -or [string]$payload.pushTranscriptSha256 -notmatch '^[A-F0-9]{64}$') { throw 'Task 4 migration Push evidence does not bind the exact migration history and sanitized transcript hashes.' }
  Assert-Task4TranscriptBinding -Binding $payload.dryRunTranscript -ExpectedName 'task4-migration-dry-run-transcript.log' -Phase DryRun -Migrations $Migrations
  Assert-Task4TranscriptBinding -Binding $payload.pushTranscript -ExpectedName 'task4-migration-push-transcript.log' -Phase Push -Migrations $Migrations -PostHistory @($payload.postHistory)
  if ([string]$payload.dryRunTranscriptSha256 -cne [string]$payload.dryRunTranscript.sha256 -or [string]$payload.pushTranscriptSha256 -cne [string]$payload.pushTranscript.sha256) { throw 'Task 4 migration Push evidence sanitized transcript hashes are inconsistent.' }
  if ($null -ne $Authorization -and (Get-JsonSha256 -Value $payload.postTargetState) -cne (Get-JsonSha256 -Value $Authorization.expectedPersistentPost)) { throw 'Task 4 migration Push evidence post-write target state differs from the authorized exact state.' }
  Assert-Task4IsolationExactProperties -Value $payload.stagingIsolation -Names @('file','evidencePayloadSha256','contractRunnerSha256','liveFrontendSha256','targetPreWriteSha256') -Label 'Task 4 migration Push staging-isolation binding'
  Assert-Task4IsolationExactProperties -Value $payload.stagingIsolation.file -Names @('name','bytes','sha256') -Label 'Task 4 migration Push staging-isolation file binding'
  Assert-Task4IsolationInteger -Value $payload.stagingIsolation.file.bytes -Label 'Task 4 migration Push staging-isolation file bytes'
  if ([string]$payload.stagingIsolation.file.name -cne $Task4IsolationEvidenceName -or [int64]$payload.stagingIsolation.file.bytes -le 0) { throw 'Task 4 migration Push staging-isolation file binding is invalid.' }
  foreach ($name in @('evidencePayloadSha256','contractRunnerSha256','liveFrontendSha256','targetPreWriteSha256')) { Assert-Task4IsolationSha256 -Value $payload.stagingIsolation.$name -Label "Task 4 migration Push staging-isolation $name" }
  Assert-Task4IsolationSha256 -Value $payload.stagingIsolation.file.sha256 -Label 'Task 4 migration Push staging-isolation file digest'
  if ([string]$payload.stagingIsolation.contractRunnerSha256 -cne (Get-Task4IsolationContractRunnerSha256)) { throw 'Task 4 migration Push staging-isolation binding is stale for the current normalized runner contract.' }
  Assert-Task4IsolationSha256 -Value $payload.postWriteIsolationStateSha256 -Label 'Task 4 migration Push post-write isolation-state digest'
  [void](Assert-Task4IsolationSnapshotIntegrity -Snapshot $payload.postWriteIsolationState)
  if ([string]$payload.postWriteIsolationStateSha256 -cne [string]$payload.postWriteIsolationState.snapshotSha256) { throw 'Task 4 migration Push post-write isolation-state binding is invalid.' }
  if ($null -ne $StagingIsolationEvidence) {
    if ((Get-JsonSha256 -Value $payload.stagingIsolation.file) -cne (Get-JsonSha256 -Value $StagingIsolationEvidence.file) -or [string]$payload.stagingIsolation.evidencePayloadSha256 -cne (Get-JsonSha256 -Value $StagingIsolationEvidence.payload) -or [string]$payload.stagingIsolation.contractRunnerSha256 -cne [string]$StagingIsolationEvidence.payload.contractRunnerSha256 -or [string]$payload.stagingIsolation.liveFrontendSha256 -cne [string]$StagingIsolationEvidence.payload.liveFrontendSha256 -or [string]$payload.stagingIsolation.targetPreWriteSha256 -cne [string]$StagingIsolationEvidence.payload.targetPreWriteSha256) { throw 'Task 4 migration Push evidence is not bound to the validated staging-isolation evidence.' }
  }
  if ($null -ne $CurrentPostMigrationIsolation) {
    if ($null -eq $StagingIsolationEvidence) { throw 'Task 4 current post-migration isolation validation requires the bound staging-isolation evidence.' }
    if ((Get-JsonSha256 -Value $CurrentPostMigrationIsolation) -cne (Get-JsonSha256 -Value $payload.postWriteIsolationState)) { throw 'Task 4 current post-migration isolation state differs from the exact pinned Push result.' }
    [void](Assert-Task4IsolationPostMigrationState -Snapshot $CurrentPostMigrationIsolation -PreWriteSnapshot $StagingIsolationEvidence.payload.targetPreWrite -ExpectedPostState $Authorization.expectedPersistentPost)
  }
  return $payload
}

function Invoke-PushPhase {
  [void](Assert-ApprovedArchive)
  $verifiedBackup = Assert-VerifiedBackup
  $task4Migrations = @(Get-Task4MigrationBindings)
  $authorization = Assert-Task4ValidationEvidence -VerifiedBackup $verifiedBackup -Migrations $task4Migrations
  $rehearsalReport = Assert-RehearsalReport -VerifiedBackup $verifiedBackup -Task4Authorization $authorization
  $baseline = Get-TargetInventory
  Assert-TargetBaselineUnchanged -Expected $verifiedBackup.manifest.targetBaseline -Actual $baseline
  if ($baseline.publicTables -ne 93 -or $baseline.authUsers -ne 0 -or $baseline.authIdentities -ne 0 -or $baseline.migrationRows -ne 153) { throw 'Target changed after rehearsal; refusing the migration Push window.' }
  Assert-Task4BaselinePlaceholderBinding -VerifiedBackup $verifiedBackup
  Assert-Task4PinnedSupabaseCli
  $workdir = New-Task4MigrationWorkdir -Migrations $task4Migrations
  $dryRun = Invoke-Task4PinnedCliDryRun -Workdir $workdir.path
  $listedPendingMigrations = @(Assert-Task4CliDryRunOutput -Lines $dryRun.log -Migrations $task4Migrations)
  $dryRunTranscript = Write-Task4SanitizedCliTranscript -Name 'task4-migration-dry-run-transcript.log' -Phase DryRun -Migrations $task4Migrations
  $liveFrontend = Get-Task4LiveFrontendSnapshot
  $targetPreWrite = Get-Task4IsolationTargetSnapshot
  [void](Assert-Task4IsolationTargetBaseline -Snapshot $targetPreWrite -VerifiedBaseline $verifiedBackup.manifest.targetBaseline -ExpectedExtendedSchemaSha256 $Task4RollbackExtendedCatalogSha256)
  $isolationEvidence = Assert-Task4StagingIsolationEvidence -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $liveFrontend -CurrentTargetPreWrite $targetPreWrite -Purpose Push
  $contractRunnerSha256 = Get-Task4IsolationContractRunnerSha256
  $quarantine = New-Task4Quarantine -Phase Push -ContractRunnerSha256 $contractRunnerSha256 -IsolationEvidenceSha256 $isolationEvidence.file.sha256 -PreWriteObservationSha256 $targetPreWrite.snapshotSha256 -ExpectedTargetStateSha256 (Get-JsonSha256 -Value $authorization.expectedPersistentPost)
  $pushResult = Invoke-Task4PinnedCliPush -Workdir $workdir.path -Migrations $task4Migrations
  $historyRows = Get-Task4MigrationHistoryRows -Migrations $task4Migrations -Label 'post-Push exact Task 4 migration history'
  $postHistory = @(Assert-Task4MigrationHistoryBindings -Migrations $task4Migrations -Rows $historyRows)
  $actualPostState = Get-TargetInventory -IncludeTask4Contract
  [void](Assert-PostMigrationTargetState -Expected $authorization.expectedPersistentPost -Actual $actualPostState)
  [void](Assert-Task4SchemaAndDependencies)
  $postWriteIsolation = Get-Task4IsolationTargetSnapshot
  [void](Assert-Task4IsolationPostMigrationState -Snapshot $postWriteIsolation -PreWriteSnapshot $targetPreWrite -ExpectedPostState $authorization.expectedPersistentPost)
  $pushTranscript = Write-Task4SanitizedCliTranscript -Name 'task4-migration-push-transcript.log' -Phase Push -Migrations $task4Migrations -PostHistory $postHistory
  $payload = [ordered]@{
    formatVersion = 2
    status = 'completed'
    completedAtUtc = [DateTime]::UtcNow.ToString('o')
    targetRef = $ExpectedRef
    cli = [ordered]@{ version=$Task4SupabaseCliVersion; sha256=$Task4SupabaseCliSha256 }
    producerRunnerSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToUpperInvariant()
    connection = [ordered]@{ host=$script:Target.Host; port=$script:Target.Port; username=$script:Target.Username; database=$script:Target.Database; sslMode='require'; credentialTransport='PGPASSWORD' }
    preBaseline = $verifiedBackup.manifest.targetBaseline
    preBaselineSha256 = [string]$verifiedBackup.manifest.targetBaselineSha256
    stagingIsolation = [ordered]@{
      file=$isolationEvidence.file
      evidencePayloadSha256=Get-JsonSha256 -Value $isolationEvidence.payload
      contractRunnerSha256=[string]$isolationEvidence.payload.contractRunnerSha256
      liveFrontendSha256=[string]$isolationEvidence.payload.liveFrontendSha256
      targetPreWriteSha256=[string]$isolationEvidence.payload.targetPreWriteSha256
    }
    workdir = $pushResult.inventory
    migrations = @(Get-PortableTask4MigrationBindings -Migrations $task4Migrations)
    migrationsSha256 = $Task4MigrationHistoryBindingSha256
    listedPendingMigrations = $listedPendingMigrations
    dryRunTranscript = $dryRunTranscript
    dryRunTranscriptSha256 = [string]$dryRunTranscript.sha256
    pushTranscript = $pushTranscript
    pushTranscriptSha256 = [string]$pushTranscript.sha256
    postHistory = $postHistory
    postHistorySha256 = $Task4MigrationHistoryBindingSha256
    postTargetState = $actualPostState
    postWriteIsolationState = $postWriteIsolation
    postWriteIsolationStateSha256 = [string]$postWriteIsolation.snapshotSha256
  }
  $manifest = [ordered]@{ payload=$payload; payloadSha256=Get-JsonSha256 -Value $payload }
  $evidencePath = Join-Path $ArtifactRoot $Task4MigrationPushEvidenceName
  Write-ProtectedJson -Path $evidencePath -Value $manifest
  Assert-NoReparsePointInPath -Path $evidencePath -Label 'Task 4 migration Push evidence'
  [void](Assert-Task4MigrationPushEvidence -VerifiedBackup $verifiedBackup -Migrations $task4Migrations -Authorization $authorization -StagingIsolationEvidence $isolationEvidence -CurrentPostMigrationIsolation $postWriteIsolation -SkipIndependentPin)
  $completionLiveFrontend = Get-Task4LiveFrontendSnapshot
  $completionIsolationEvidence = Assert-Task4StagingIsolationEvidence -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $completionLiveFrontend -Purpose Push -ExpectedEvidenceSha256 $isolationEvidence.file.sha256
  $completionPostWriteIsolation = Get-Task4IsolationTargetSnapshot
  [void](Assert-Task4MigrationPushEvidence -VerifiedBackup $verifiedBackup -Migrations $task4Migrations -Authorization $authorization -StagingIsolationEvidence $completionIsolationEvidence -CurrentPostMigrationIsolation $completionPostWriteIsolation -SkipIndependentPin)
  Complete-Task4Quarantine -ExpectedPhase Push -ExpectedAttemptId $quarantine.payload.attemptId -ExpectedDocument $quarantine
  Write-Summary 'Push completed exact migrations and evidence validation; Import remains blocked pending independent evidence and producer-runner pins.'
}

function Invoke-VerifyPhase {
  [void](Assert-ApprovedArchive)
  $verifiedBackup = Assert-VerifiedBackup
  $task4Migrations = @(Get-Task4MigrationBindings)
  $authorization = Assert-Task4ValidationEvidence -VerifiedBackup $verifiedBackup -Migrations $task4Migrations
  [void](Assert-RehearsalReport -VerifiedBackup $verifiedBackup -Task4Authorization $authorization)
  $inventory = Get-TargetInventory
  Assert-TargetBaselineUnchanged -Expected $verifiedBackup.manifest.targetBaseline -Actual $inventory
  if ($inventory.publicTables -ne 93 -or $inventory.authUsers -ne 0 -or $inventory.authIdentities -ne 0 -or $inventory.migrationRows -ne 153) {
    throw 'Target changed after rehearsal; refusing the write window.'
  }
  $liveFrontend = Get-Task4LiveFrontendSnapshot
  $targetPreWrite = Get-Task4IsolationTargetSnapshot
  [void](Assert-Task4IsolationTargetBaseline -Snapshot $targetPreWrite -VerifiedBaseline $verifiedBackup.manifest.targetBaseline -ExpectedExtendedSchemaSha256 $Task4RollbackExtendedCatalogSha256)
  $observedAtUtc = [DateTimeOffset]::UtcNow
  $contractRunnerSha256 = Get-Task4IsolationContractRunnerSha256
  $document = New-Task4StagingIsolationEvidence -ObservedAtUtc $observedAtUtc -ContractRunnerSha256 $contractRunnerSha256 -VerifiedBackup $verifiedBackup -LiveFrontend $liveFrontend -TargetPreWrite $targetPreWrite
  [void](Assert-Task4StagingIsolationEvidenceDocument -Document $document -NowUtc $observedAtUtc -ExpectedContractRunnerSha256 $contractRunnerSha256 -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $liveFrontend -CurrentTargetPreWrite $targetPreWrite -Purpose Verify)
  Write-ProtectedJson -Path (Join-Path $ArtifactRoot $Task4IsolationEvidenceName) -Value $document
  [void](Assert-Task4StagingIsolationEvidence -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $liveFrontend -CurrentTargetPreWrite $targetPreWrite -Purpose Verify -NowUtc $observedAtUtc)
  Write-Summary 'Verify passed read-only target/live observation and wrote immediately revalidated, short-lived staging-isolation evidence.'
}

function Invoke-PostMigrationPhase {
  [void](Assert-ApprovedArchive)
  $verifiedBackup = Assert-VerifiedBackup
  $task4Migrations = @(Get-Task4MigrationBindings)
  $authorization = Assert-Task4ValidationEvidence -VerifiedBackup $verifiedBackup -Migrations $task4Migrations
  $rehearsalReport = Assert-RehearsalReport -VerifiedBackup $verifiedBackup -Task4Authorization $authorization
  $actualPostState = Get-TargetInventory -IncludeTask4Contract
  $historyRows = Get-Task4MigrationHistoryRows -Migrations $task4Migrations -Label 'PostMigration exact Task 4 migration history'
  [void](Assert-Task4MigrationHistoryBindings -Migrations $task4Migrations -Rows $historyRows)
  [void](Assert-PostMigrationTargetState -Expected $authorization.expectedPersistentPost -Actual $actualPostState)
  [void](Assert-Task4SchemaAndDependencies)
  $payload = [ordered]@{
    formatVersion = 1
    status = 'completed'
    completedAtUtc = [DateTime]::UtcNow.ToString('o')
    targetRef = $ExpectedRef
    preBaselineSha256 = [string]$verifiedBackup.manifest.targetBaselineSha256
    migrations = @(Get-PortableTask4MigrationBindings -Migrations $task4Migrations)
    expectedPostMigration = $authorization.expectedPersistentPost
    rehearsalBindingSha256 = [string]$rehearsalReport.currentBindingSha256
    authorizationSha256 = [string]$authorization.sha256
  }
  $manifest = [ordered]@{ payload=$payload; payloadSha256=Get-JsonSha256 -Value $payload }
  $transitionPath = Join-Path $ArtifactRoot $Task4TransitionManifestName
  Write-ProtectedJson -Path $transitionPath -Value $manifest
  Assert-NotReparsePoint -Path $transitionPath -Label 'post-migration transition manifest'
  $writtenManifest = Get-Content -LiteralPath $transitionPath -Raw | ConvertFrom-Json
  [void](Assert-PostMigrationTransitionManifest -Manifest $writtenManifest -VerifiedBackup $verifiedBackup -RehearsalReport $rehearsalReport -Migrations $task4Migrations -Authorization $authorization)
  Write-Summary 'PostMigration passed read-only against the target and wrote an immediately revalidated completed transition manifest in protected artifacts.'
}

function Invoke-ImportPhase {
  [void](Assert-ApprovedArchive)
  $verifiedBackup = Assert-VerifiedBackup
  $task4Migrations = @(Get-Task4MigrationBindings)
  $authorization = Assert-Task4ValidationEvidence -VerifiedBackup $verifiedBackup -Migrations $task4Migrations
  $rehearsalReport = Assert-RehearsalReport -VerifiedBackup $verifiedBackup -Task4Authorization $authorization
  $pushEvidence = Assert-Task4MigrationPushEvidence -VerifiedBackup $verifiedBackup -Migrations $task4Migrations -Authorization $authorization
  $currentLiveFrontend = Get-Task4LiveFrontendSnapshot
  $isolationEvidence = Assert-Task4StagingIsolationEvidence -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $currentLiveFrontend -Purpose Import -ExpectedEvidenceSha256 $pushEvidence.stagingIsolation.file.sha256
  $currentPostMigrationIsolation = Get-Task4IsolationTargetSnapshot
  [void](Assert-Task4IsolationPostMigrationState -Snapshot $currentPostMigrationIsolation -PreWriteSnapshot $isolationEvidence.payload.targetPreWrite -ExpectedPostState $authorization.expectedPersistentPost)
  $pushEvidence = Assert-Task4MigrationPushEvidence -VerifiedBackup $verifiedBackup -Migrations $task4Migrations -Authorization $authorization -StagingIsolationEvidence $isolationEvidence -CurrentPostMigrationIsolation $currentPostMigrationIsolation
  $historyRows = Get-Task4MigrationHistoryRows -Migrations $task4Migrations -Label 'Import authorization exact Task 4 migration history'
  [void](Assert-Task4MigrationHistoryBindings -Migrations $task4Migrations -Rows $historyRows)
  $transitionPath = Join-Path $ArtifactRoot $Task4TransitionManifestName
  if (-not (Test-Path -LiteralPath $transitionPath -PathType Leaf)) { throw 'Completed post-migration transition manifest is required before import.' }
  Assert-NotReparsePoint -Path $transitionPath -Label 'post-migration transition manifest'
  $transitionManifest = Get-Content -LiteralPath $transitionPath -Raw | ConvertFrom-Json
  $expectedPostState = Assert-PostMigrationTransitionManifest -Manifest $transitionManifest -VerifiedBackup $verifiedBackup -RehearsalReport $rehearsalReport -Migrations $task4Migrations -Authorization $authorization
  $targetInventory = Get-TargetInventory -IncludeTask4Contract
  [void](Assert-PostMigrationTargetState -Expected $expectedPostState -Actual $targetInventory)
  [void](Assert-Task4SchemaAndDependencies)
  $loader = Join-Path $ArtifactRoot $LoaderName
  $staffLoader = Join-Path $ArtifactRoot $HeldStaffLoaderName
  foreach ($path in @($loader,$staffLoader)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Protected selective data loader is missing: $(Split-Path -Leaf $path)" }
    Assert-NotReparsePoint -Path $path -Label 'selective data loader'
    Assert-PortableAuthBoundary -LoaderPath $path
  }
  $mainSnapshot = Join-Path $ArtifactRoot ('.task4-main-loader-snapshot-' + $PID + '.sql')
  $staffSnapshot = Join-Path $ArtifactRoot ('.task4-staff-loader-snapshot-' + $PID + '.sql')
  $guardedLoader = Join-Path $ArtifactRoot ('.task4-auth-zero-loader-' + $PID + '.sql')
  try {
    New-BoundLoaderSnapshot -SourcePath $loader -DestinationPath $mainSnapshot -ExpectedSha256 ([string]$rehearsalReport.currentBinding.loaderSha256)
    New-BoundLoaderSnapshot -SourcePath $staffLoader -DestinationPath $staffSnapshot -ExpectedSha256 ([string]$rehearsalReport.currentBinding.heldStaffLoaderSha256)
    New-InTransactionAuthZeroLoader -SourcePath $mainSnapshot -DestinationPath $guardedLoader
    Assert-NotReparsePoint -Path $guardedLoader -Label 'guarded Auth-zero selective loader'
    Assert-PortableAuthBoundary -LoaderPath $guardedLoader
    Assert-InTransactionAuthZeroGuard -LoaderPath $guardedLoader
    $guardedLoaderSha256 = (Get-FileHash -LiteralPath $guardedLoader -Algorithm SHA256).Hash.ToUpperInvariant()
    (Get-Item -LiteralPath $guardedLoader).IsReadOnly = $true
    $expectedImportContract = [ordered]@{
      expectedPostState=$expectedPostState; sourceTableCountsSha256=Get-JsonSha256 -Value $rehearsalReport.source.tableCounts
      authAggregateSha256=Get-JsonSha256 -Value $rehearsalReport.auth.aggregate
      standaloneSequences=Get-Task4StandaloneSequenceSpecifications; approvedServiceLists=$Task4ApprovedServiceLists
    }
    $quarantine = New-Task4Quarantine -Phase Import -ContractRunnerSha256 (Get-Task4IsolationContractRunnerSha256) -IsolationEvidenceSha256 $isolationEvidence.file.sha256 -PreWriteObservationSha256 $currentPostMigrationIsolation.snapshotSha256 -ExpectedTargetStateSha256 (Get-JsonSha256 -Value $expectedImportContract)
    if ((Get-FileHash -LiteralPath $guardedLoader -Algorithm SHA256).Hash.ToUpperInvariant() -cne $guardedLoaderSha256) { throw 'Guarded execution loader changed before execution.' }
    Invoke-TargetFile -Path $guardedLoader -Label 'guarded target selective data import with in-transaction Auth-zero lock'
    if ((Get-FileHash -LiteralPath $staffSnapshot -Algorithm SHA256).Hash.ToUpperInvariant() -cne [string]$rehearsalReport.currentBinding.heldStaffLoaderSha256) { throw 'Staff loader snapshot changed before execution.' }
    Invoke-TargetFile -Path $staffSnapshot -Label 'guarded target staff_messages import after portable Auth'
    [void](Invoke-TargetQuery -Sql (Get-ForeignKeyAuditSql) -Label 'post-import whole-target foreign-key audit')
    $foreignKeyCount = [int](Invoke-TargetQuery -Sql "select count(*) from pg_constraint c join pg_class child on child.oid=c.conrelid join pg_namespace n on n.oid=child.relnamespace where c.contype='f' and (n.nspname='public' or (n.nspname='auth' and child.relname in ('users','identities')));" -Label 'post-import foreign-key audit cardinality')
    [void](Assert-Task4SchemaAndDependencies)
    $actualInventory = Get-TargetInventory -IncludeTask4Contract
    $actualTableCounts = Get-TargetTableCounts
    $metrics = Get-TargetPostImportMetrics
    $sequenceChecks = @(Get-TargetSequenceChecks)
    $serviceLists = Get-TargetApprovedServiceLists
    $integrity = Assert-Task4PostImportResult -ExpectedPost $expectedPostState -ActualInventory $actualInventory -ExpectedTableCounts $rehearsalReport.source.tableCounts -ActualTableCounts $actualTableCounts -Metrics $metrics -AuthBaseline $rehearsalReport.auth.aggregate -SequenceChecks $sequenceChecks -ServiceLists $serviceLists -ForeignKeyCount $foreignKeyCount
    $postImportIsolation = Get-Task4IsolationTargetSnapshot
    [void](Assert-Task4IsolationPostImportState -Snapshot $postImportIsolation -ExpectedStorage $pushEvidence.postWriteIsolationState.storage)
    $reportPayload = [ordered]@{
      formatVersion = 1
      pass = $true
      completedAtUtc = [DateTime]::UtcNow.ToString('o')
      targetRef = $ExpectedRef
      transitionManifestSha256 = (Get-FileHash -LiteralPath $transitionPath -Algorithm SHA256).Hash.ToUpperInvariant()
      sourceTableCountsSha256 = Get-JsonSha256 -Value $rehearsalReport.source.tableCounts
      actualTableCountsSha256 = Get-JsonSha256 -Value $actualTableCounts
      mainLoaderSha256 = (Get-FileHash -LiteralPath $mainSnapshot -Algorithm SHA256).Hash.ToUpperInvariant()
      guardedExecutionLoaderSha256 = $guardedLoaderSha256
      staffLoaderSha256 = (Get-FileHash -LiteralPath $staffSnapshot -Algorithm SHA256).Hash.ToUpperInvariant()
      targetInventory = $actualInventory
      auth = $metrics
      integrity = $integrity
      sequenceChecks = $sequenceChecks
      approvedServiceListsSha256 = Get-JsonSha256 -Value $serviceLists
      stagingIsolationEvidenceSha256 = [string]$isolationEvidence.file.sha256
      preImportIsolationSha256 = [string]$currentPostMigrationIsolation.snapshotSha256
      postImportIsolation = $postImportIsolation
      postImportIsolationSha256 = [string]$postImportIsolation.snapshotSha256
    }
    $importReport = [ordered]@{ payload=$reportPayload; payloadSha256=Get-JsonSha256 -Value $reportPayload }
    $importReportPath = Join-Path $ArtifactRoot $ImportReportName
    Write-ProtectedJson -Path $importReportPath -Value $importReport
    Assert-NoReparsePointInPath -Path $importReportPath -Label 'Task 4 import integrity report'
    try { $writtenImportReport = Get-Content -LiteralPath $importReportPath -Raw | ConvertFrom-Json -ErrorAction Stop } catch { throw 'Task 4 import integrity report is invalid JSON after writing.' }
    Assert-Task4IsolationExactProperties -Value $writtenImportReport -Names @('payload','payloadSha256') -Label 'Task 4 import integrity report envelope'
    Assert-Task4IsolationSha256 -Value $writtenImportReport.payloadSha256 -Label 'Task 4 import integrity report self-hash'
    if ([string]$writtenImportReport.payloadSha256 -cne (Get-JsonSha256 -Value $writtenImportReport.payload) -or (Get-JsonSha256 -Value $writtenImportReport.payload) -cne (Get-JsonSha256 -Value $reportPayload)) { throw 'Task 4 import integrity report failed immediate readback validation.' }
    $completionLiveFrontend = Get-Task4LiveFrontendSnapshot
    [void](Assert-Task4StagingIsolationEvidence -VerifiedBackup $verifiedBackup -CurrentLiveFrontend $completionLiveFrontend -Purpose Import -ExpectedEvidenceSha256 $isolationEvidence.file.sha256)
    $completionPostImportIsolation = Get-Task4IsolationTargetSnapshot
    [void](Assert-Task4IsolationPostImportState -Snapshot $completionPostImportIsolation -ExpectedStorage $pushEvidence.postWriteIsolationState.storage)
    if ((Get-JsonSha256 -Value $completionPostImportIsolation) -cne (Get-JsonSha256 -Value $postImportIsolation)) { throw 'Task 4 target changed after the post-import report observation.' }
    Complete-Task4Quarantine -ExpectedPhase Import -ExpectedAttemptId $quarantine.payload.attemptId -ExpectedDocument $quarantine
    Write-Summary 'Import passed: both trigger-disabled loaders committed with FK audits; post-import 11/11 Auth, table-count, sequence, profile, and 13 service-string integrity gates passed.'
  } finally {
    foreach ($path in @($guardedLoader,$mainSnapshot,$staffSnapshot)) {
      if (Test-Path -LiteralPath $path) { (Get-Item -LiteralPath $path).IsReadOnly = $false; Remove-Item -LiteralPath $path -Force }
    }
  }
}

function Assert-Task4ExactEvidenceProperties {
  param([Parameter(Mandatory)]$Value,[Parameter(Mandatory)][string[]]$Names,[Parameter(Mandatory)][string]$Label)
  if ($null -eq $Value -or $Value -isnot [pscustomobject]) { throw "$Label must be a JSON object." }
  $actual = @($Value.PSObject.Properties.Name | Sort-Object)
  $expected = @($Names | Sort-Object)
  if (($actual -join "`n") -cne ($expected -join "`n")) { throw "$Label has missing or unexpected fields." }
}

function Assert-Task4EvidenceSha256 {
  param($Value,[Parameter(Mandatory)][string]$Label)
  if ($Value -isnot [string] -or $Value -cnotmatch '^[A-F0-9]{64}$') { throw "$Label is not an uppercase SHA-256 digest string." }
}

function Assert-Task4EvidenceBoolean {
  param($Value,[Parameter(Mandatory)][string]$Path)
  if ($Value -isnot [bool]) { throw "Task 4 rollback candidate field must be a JSON boolean: $Path" }
}

function Assert-Task4EvidenceInteger {
  param($Value,[Parameter(Mandatory)][string]$Path)
  if ($Value -isnot [int] -and $Value -isnot [long]) { throw "Task 4 rollback candidate field must be a JSON integer: $Path" }
}

function Get-Task4RollbackRequiredEvidencePaths {
  return @(
    'restore.environment','restore.productionTargetWrites','restore.executable.file','restore.executable.version','restore.executable.sha256','restore.arguments','restore.argumentsSha256','restore.ownerReplay','restore.privilegeReplay',
    'backup.file','backup.bytes','backup.sha256','backup.manifest.file','backup.manifest.sha256','backup.manifest.targetBaselineSha256','backup.toc.sha256','backup.toc.entries','backup.toc.aclEntries','backup.toc.defaultAclEntries','backup.toc.extensionEntries','backup.toc.publicationEntries','backup.toc.categoryCounts','backup.toc.categoryCountsSha256','backup.toc.tableDataRelations','backup.toc.tableDataRelationsSha256',
    'platform.provider','platform.postgresMajor','platform.roles','platform.rolesSha256','platform.extensions','platform.extensionsSha256','platform.capabilitiesSha256',
    'startingState.inventory','startingState.sha256',
    'cleanup.strategy','cleanup.strictAllowlist','cleanup.removesAllPostBackupObjects','cleanup.postBackupObjects','cleanup.postBackupObjectsSha256','cleanup.allowlistedOperations','cleanup.allowlistedOperationsSha256','cleanup.postCleanupObjectAbsenceVerified',
    'baseline.ordinaryCatalogSha256','baseline.extendedCatalogSha256','baseline.catalogComponents','baseline.catalogComponentsSha256','baseline.migrationHistory.fields','baseline.migrationHistory.records','baseline.migrationHistory.recordsSha256','baseline.tableData.counts','baseline.tableData.countsSha256','baseline.auth.users','baseline.auth.identities','baseline.auth.sessions','baseline.auth.refreshTokens','baseline.storageMetadata.buckets','baseline.storageMetadata.objects','baseline.storageMetadata.canonicalSha256','baseline.storageBytes.separateFromDatabaseRestore','baseline.storageBytes.beforeInventorySha256','baseline.storageBytes.afterInventorySha256','baseline.storageBytes.cleanupProofSha256','baseline.storageBytes.restoreProofSha256','baseline.storageBytes.exactByteFidelity',
    'postRestore.exactPostRestoreMatch','postRestore.ordinaryCatalogSha256','postRestore.extendedCatalogSha256','postRestore.catalogComponentsSha256','postRestore.migrationHistorySha256','postRestore.tableCountsSha256','postRestore.auth.users','postRestore.auth.identities','postRestore.auth.sessions','postRestore.auth.refreshTokens','postRestore.storageMetadataSha256','postRestore.storageByteInventorySha256'
  )
}

function Assert-Task4RollbackCandidateField {
  param([Parameter(Mandatory)]$Payload,[Parameter(Mandatory)][string]$Path)
  $current = $Payload
  foreach ($segment in $Path.Split('.')) {
    if ($null -eq $current -or $current -isnot [pscustomobject] -or $null -eq $current.PSObject.Properties[$segment] -or $null -eq $current.$segment) {
      throw "Task 4 rollback candidate required field is missing or null: $Path"
    }
    $current = $current.$segment
  }
}

function Get-Task4RollbackContractRunnerSha256 {
  param([string]$Path = $Task4RunnerPath)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'Task 4 rollback runner contract file is missing.' }
  $text = Get-Content -LiteralPath $Path -Raw
  $pattern = '(?m)^\$Task4RollbackRestoreEvidenceSha256\s*=\s*''[^''\r\n]*''\s*$'
  if ([regex]::Matches($text,$pattern).Count -ne 1) { throw 'Task 4 rollback runner pin assignment is not canonical.' }
  $normalized = [regex]::Replace($text,$pattern,"`$Task4RollbackRestoreEvidenceSha256 = ''")
  return Get-StringSha256 -Value $normalized
}

function Assert-RollbackRestoreReadiness {
  if ($null -eq $Task4RollbackRestoreEvidenceSha256 -or ($Task4RollbackRestoreEvidenceSha256 -is [string] -and [string]::IsNullOrWhiteSpace($Task4RollbackRestoreEvidenceSha256))) {
    throw 'Task 4 rollback restore evidence has not been independently pinned.'
  }
  Assert-Task4EvidenceSha256 -Value $Task4RollbackRestoreEvidenceSha256 -Label 'Task 4 rollback restore evidence pin'

  $evidencePath = Join-Path $ArtifactRoot $Task4RollbackRestoreEvidenceName
  Assert-NoReparsePointInPath -Path $evidencePath -Label 'Task 4 rollback restore evidence'
  if (-not (Test-Path -LiteralPath $evidencePath -PathType Leaf)) { throw 'Task 4 rollback restore evidence is missing.' }
  $evidenceFileSha256 = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($evidenceFileSha256 -cne $Task4RollbackRestoreEvidenceSha256) { throw 'Task 4 rollback restore evidence does not match its independent pin.' }

  try { $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json -ErrorAction Stop }
  catch { throw 'Task 4 rollback restore evidence is malformed JSON.' }
  Assert-Task4ExactEvidenceProperties -Value $evidence -Names @('payload','payloadSha256') -Label 'Task 4 rollback restore evidence envelope'
  Assert-Task4EvidenceSha256 -Value $evidence.payloadSha256 -Label 'Task 4 rollback restore evidence self-hash'
  if ($evidence.payloadSha256 -cne (Get-JsonSha256 -Value $evidence.payload)) { throw 'Task 4 rollback restore evidence self-hash is invalid.' }

  $payload = $evidence.payload
  Assert-Task4ExactEvidenceProperties -Value $payload -Names @('formatVersion','status','completedAtUtc','targetRef','contractRunnerSha256','restore','backup','platform','startingState','cleanup','baseline','postRestore') -Label 'Task 4 rollback restore evidence payload'
  Assert-Task4EvidenceInteger -Value $payload.formatVersion -Path 'formatVersion'
  if ($payload.formatVersion -ne 1 -or $payload.status -isnot [string] -or $payload.status -cne 'unreviewed-candidate' -or $payload.targetRef -isnot [string] -or $payload.targetRef -cne $ExpectedRef -or $payload.completedAtUtc -isnot [string]) { throw 'Task 4 rollback candidate identity, status, or timestamp type is invalid.' }
  $completedAt = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse($payload.completedAtUtc,[ref]$completedAt) -or $completedAt.Offset -ne [TimeSpan]::Zero -or $completedAt.UtcDateTime -gt [DateTime]::UtcNow.AddMinutes(5)) { throw 'Task 4 rollback candidate completion time is invalid.' }
  Assert-Task4EvidenceSha256 -Value $payload.contractRunnerSha256 -Label 'Task 4 rollback normalized contract runner digest'
  if ($payload.contractRunnerSha256 -cne (Get-Task4RollbackContractRunnerSha256)) { throw 'Task 4 rollback candidate is stale for the current normalized runner contract.' }

  foreach ($path in Get-Task4RollbackRequiredEvidencePaths) { Assert-Task4RollbackCandidateField -Payload $payload -Path $path }
  foreach ($path in @('restore.productionTargetWrites','backup.bytes','backup.toc.entries','backup.toc.aclEntries','backup.toc.defaultAclEntries','backup.toc.extensionEntries','backup.toc.publicationEntries','platform.postgresMajor','baseline.auth.users','baseline.auth.identities','baseline.auth.sessions','baseline.auth.refreshTokens','baseline.storageMetadata.buckets','baseline.storageMetadata.objects','postRestore.auth.users','postRestore.auth.identities','postRestore.auth.sessions','postRestore.auth.refreshTokens')) {
    $value = $payload; foreach ($segment in $path.Split('.')) { $value = $value.$segment }; Assert-Task4EvidenceInteger -Value $value -Path $path
  }
  foreach ($path in @('restore.ownerReplay','restore.privilegeReplay','cleanup.strictAllowlist','cleanup.removesAllPostBackupObjects','cleanup.postCleanupObjectAbsenceVerified','baseline.storageBytes.separateFromDatabaseRestore','baseline.storageBytes.exactByteFidelity','postRestore.exactPostRestoreMatch')) {
    $value = $payload; foreach ($segment in $path.Split('.')) { $value = $value.$segment }; Assert-Task4EvidenceBoolean -Value $value -Path $path
  }
  foreach ($path in @('restore.arguments','backup.toc.tableDataRelations','platform.roles','platform.extensions','cleanup.postBackupObjects','cleanup.allowlistedOperations','baseline.migrationHistory.fields','baseline.migrationHistory.records','baseline.tableData.counts')) {
    $value = $payload; foreach ($segment in $path.Split('.')) { $value = $value.$segment }; if ($value -isnot [Array]) { throw "Task 4 rollback candidate field must be a JSON array: $path" }
  }
  foreach ($path in @('restore.executable.sha256','restore.argumentsSha256','backup.sha256','backup.manifest.sha256','backup.manifest.targetBaselineSha256','backup.toc.sha256','backup.toc.categoryCountsSha256','backup.toc.tableDataRelationsSha256','platform.rolesSha256','platform.extensionsSha256','platform.capabilitiesSha256','startingState.sha256','cleanup.postBackupObjectsSha256','cleanup.allowlistedOperationsSha256','baseline.ordinaryCatalogSha256','baseline.extendedCatalogSha256','baseline.catalogComponentsSha256','baseline.migrationHistory.recordsSha256','baseline.tableData.countsSha256','baseline.storageMetadata.canonicalSha256','baseline.storageBytes.beforeInventorySha256','baseline.storageBytes.afterInventorySha256','baseline.storageBytes.cleanupProofSha256','baseline.storageBytes.restoreProofSha256','postRestore.ordinaryCatalogSha256','postRestore.extendedCatalogSha256','postRestore.catalogComponentsSha256','postRestore.migrationHistorySha256','postRestore.tableCountsSha256','postRestore.storageMetadataSha256','postRestore.storageByteInventorySha256')) {
    $value = $payload; foreach ($segment in $path.Split('.')) { $value = $value.$segment }; Assert-Task4EvidenceSha256 -Value $value -Label "Task 4 rollback candidate $path"
  }
  throw 'Task 4 rollback candidate is non-authorizing; semantic restore validation is not implemented.'
}

function Invoke-RollbackPhase {
  [void](Assert-RollbackRestoreReadiness)
  throw 'Task 4 Rollback remains unavailable until a separately reviewed execution implementation is added.'
}

if ($Phase -in @('Backup','Rehearse','Verify','Push','PostMigration','Import')) { Assert-NoTask4Quarantine }
if ($Phase -eq 'Backup') { Invalidate-BackupEvidence }
if ($Phase -eq 'Rehearse') { Invalidate-RehearsalEvidence }
if ($Phase -eq 'PostMigration') { Invalidate-EvidenceFile -Path (Join-Path $ArtifactRoot '.task4-postmigration-preflight-attempt') }
if ($Phase -eq 'Verify' -and (Test-Path -LiteralPath (Join-Path $ArtifactRoot $Task4MigrationPushEvidenceName))) { throw 'Verify cannot replace isolation evidence after completed migration Push evidence exists.' }
if ($Phase -eq 'Push' -and (Test-Path -LiteralPath (Join-Path $ArtifactRoot $Task4MigrationPushEvidenceName))) { throw 'Completed migration Push evidence already exists; refusing a repeated persistent phase.' }
if ($Phase -eq 'PostMigration' -and (Test-Path -LiteralPath (Join-Path $ArtifactRoot $ImportReportName))) { throw 'Completed Import evidence already exists; refusing to replace its transition dependency.' }
if ($Phase -eq 'Import' -and (Test-Path -LiteralPath (Join-Path $ArtifactRoot $ImportReportName))) { throw 'Completed Import evidence already exists; refusing a repeated persistent phase.' }
if (-not (Test-Path -LiteralPath $ProtectedEnv -PathType Leaf)) { throw 'Protected environment file is missing.' }
Assert-NotReparsePoint -Path $ProtectedEnv -Label 'protected environment file'

try {
  Assert-RequiredTools
  $environment = Import-ProtectedEnvironment -Path $ProtectedEnv
  $targetUri = Assert-TargetProjectRef -Environment $environment
  $script:TargetUri = $targetUri
  $script:Target = Get-TargetConnection -Environment $environment -Uri $targetUri
  Write-Log "Guard passed for target project ref $ExpectedRef."
  switch ($Phase) {
    'Inventory' { [void](Invoke-InventoryPhase) }
    'Backup' { Invoke-BackupPhase }
    'Rehearse' { Invoke-RehearsePhase }
    'Verify' { Invoke-VerifyPhase }
    'Push' { Invoke-PushPhase }
    'PostMigration' { Invoke-PostMigrationPhase }
    'Import' { Invoke-ImportPhase }
    'Rollback' { Invoke-RollbackPhase }
  }
} catch {
  Write-Log ('FAILED: ' + $_.Exception.Message)
  Write-Error $_.Exception.Message
  exit 1
}
