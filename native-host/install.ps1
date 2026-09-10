$ErrorActionPreference = 'Stop'

$HostName = 'com.professorask.bridge'
$InstallVersion = '0.7.0'
$StableExtensionId = 'geibmmecfgilkhncpcjjldbidnejflfb'
$BaseDir = $PSScriptRoot
$RepoRoot = Split-Path $BaseDir -Parent
$ExtensionPath = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot 'extension'))
$HostScript = Join-Path $BaseDir 'host.js'
$LauncherSource = Join-Path $BaseDir 'launcher.cs'
$StatusFile = Join-Path $BaseDir 'install-status.txt'
$InstallRoot = Join-Path $env:LOCALAPPDATA 'ProfessorAsk\NativeHost'
$InstallDir = Join-Path $InstallRoot $InstallVersion
$ManifestPath = Join-Path $InstallRoot "$HostName.json"
$NodePathFile = Join-Path $InstallDir 'node-path.txt'
$HostPathFile = Join-Path $InstallDir 'host-path.txt'
$LauncherExe = Join-Path $InstallDir ("ProfessorAskAntigravityHost-" + [Guid]::NewGuid().ToString('N') + '.exe')

function Write-Status([string]$Kind, [string]$Message) {
  [System.IO.File]::WriteAllText($StatusFile, "$Kind`r`n$Message", (New-Object System.Text.UTF8Encoding($false)))
}

function Normalize-Path([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
  try { return [System.IO.Path]::GetFullPath($Path).TrimEnd('\').ToLowerInvariant() }
  catch { return $null }
}

function Find-UnpackedExtensionIds([string]$UserDataRoot, [string]$ExpectedPath) {
  $result = New-Object System.Collections.Generic.List[string]
  if (-not (Test-Path $UserDataRoot)) { return $result }

  $profiles = @()
  $defaultProfile = Join-Path $UserDataRoot 'Default'
  if (Test-Path $defaultProfile) { $profiles += Get-Item $defaultProfile }
  $profiles += @(Get-ChildItem $UserDataRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'Profile *' })
  $normalizedExpected = Normalize-Path $ExpectedPath

  foreach ($profile in $profiles) {
    $preferencesPath = Join-Path $profile.FullName 'Preferences'
    if (-not (Test-Path $preferencesPath)) { continue }

    try {
      $preferences = Get-Content $preferencesPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
      $settings = $preferences.extensions.settings
      if (-not $settings) { continue }

      foreach ($property in $settings.PSObject.Properties) {
        $candidatePath = Normalize-Path ([string]$property.Value.path)
        if ($candidatePath -and $candidatePath -eq $normalizedExpected) { $result.Add($property.Name) }
      }
    } catch {}
  }

  return $result
}

try {
  if (-not (Test-Path $LauncherSource)) { throw 'launcher.cs est introuvable.' }
  if (-not (Test-Path $HostScript)) { throw 'host.js est introuvable.' }

  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { throw 'Node.js est requis pour le companion Antigravity de développement.' }

  New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  [System.IO.File]::WriteAllText($NodePathFile, $node.Source, (New-Object System.Text.UTF8Encoding($false)))
  [System.IO.File]::WriteAllText($HostPathFile, $HostScript, (New-Object System.Text.UTF8Encoding($false)))

  $source = Get-Content $LauncherSource -Raw
  Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly $LauncherExe -OutputType ConsoleApplication
  if (-not (Test-Path $LauncherExe)) { throw 'La compilation du companion Windows a échoué.' }

  $extensionIds = New-Object System.Collections.Generic.List[string]
  $extensionIds.Add($StableExtensionId)
  $chromeRoot = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
  $edgeRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data'

  foreach ($id in (Find-UnpackedExtensionIds $chromeRoot $ExtensionPath)) {
    if (-not $extensionIds.Contains($id)) { $extensionIds.Add($id) }
  }
  foreach ($id in (Find-UnpackedExtensionIds $edgeRoot $ExtensionPath)) {
    if (-not $extensionIds.Contains($id)) { $extensionIds.Add($id) }
  }

  $allowedOrigins = @($extensionIds | ForEach-Object { "chrome-extension://$_/" })
  $manifest = [ordered]@{
    name = $HostName
    description = 'Professor Ask optional Antigravity companion'
    path = $LauncherExe
    type = 'stdio'
    allowed_origins = $allowedOrigins
  }

  [System.IO.File]::WriteAllText($ManifestPath, ($manifest | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false)))

  foreach ($registryPath in @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
  )) {
    New-Item -Path $registryPath -Force | Out-Null
    Set-Item -Path $registryPath -Value $ManifestPath
  }

  Write-Status 'OK' "Le companion Antigravity optionnel est installé. Codex n’utilise pas ce companion."
  exit 0
} catch {
  Write-Status 'ERROR' $_.Exception.Message
  exit 1
}
