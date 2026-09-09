$ErrorActionPreference = 'Stop'

$HostName = 'com.professorask.bridge'
$InstallVersion = '0.5.1'
$StableExtensionId = 'geibmmecfgilkhncpcjjldbidnejflfb'
$BaseDir = $PSScriptRoot
$RepoRoot = Split-Path $BaseDir -Parent
$ExtensionPath = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot 'extension'))
$HostScript = Join-Path $BaseDir 'host.js'
$LauncherSource = Join-Path $BaseDir 'launcher.cs'
$StatusFile = Join-Path $BaseDir 'install-status.txt'

# Native Messaging executables should not live in the Git working tree. Apart from
# avoiding locked-file errors during git pull/install, this gives Chrome a stable,
# user-writable location that does not require administrator privileges.
$InstallRoot = Join-Path $env:LOCALAPPDATA 'ProfessorAsk\NativeHost'
$InstallDir = Join-Path $InstallRoot $InstallVersion
$ManifestPath = Join-Path $InstallRoot "$HostName.json"
$NodePathFile = Join-Path $InstallDir 'node-path.txt'
$HostPathFile = Join-Path $InstallDir 'host-path.txt'
$LauncherExe = Join-Path $InstallDir ("ProfessorAskNativeHost-" + [Guid]::NewGuid().ToString('N') + '.exe')

function Write-Status([string]$Kind, [string]$Message) {
  [System.IO.File]::WriteAllText($StatusFile, "$Kind`r`n$Message", (New-Object System.Text.UTF8Encoding($false)))
}

function Normalize-Path([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
  try {
    return [System.IO.Path]::GetFullPath($Path).TrimEnd('\').ToLowerInvariant()
  }
  catch {
    return $null
  }
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
        if ($candidatePath -and $candidatePath -eq $normalizedExpected) {
          $result.Add($property.Name)
        }
      }
    }
    catch {
      # Chrome can rewrite Preferences while the installer is reading it.
      # The stable manifest key still provides the production extension ID.
    }
  }

  return $result
}

try {
  if (-not (Test-Path $LauncherSource)) {
    throw 'launcher.cs est introuvable.'
  }

  if (-not (Test-Path $HostScript)) {
    throw 'host.js est introuvable.'
  }

  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) {
    throw 'Node.js est requis pour cette version de développement du companion.'
  }

  New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

  [System.IO.File]::WriteAllText($NodePathFile, $node.Source, (New-Object System.Text.UTF8Encoding($false)))
  [System.IO.File]::WriteAllText($HostPathFile, $HostScript, (New-Object System.Text.UTF8Encoding($false)))

  # Compile to a unique file. A running Native Messaging process can lock its EXE;
  # using a new name means reinstall/update never has to overwrite that process.
  $source = Get-Content $LauncherSource -Raw
  Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly $LauncherExe -OutputType ConsoleApplication

  if (-not (Test-Path $LauncherExe)) {
    throw 'La compilation du companion Windows a échoué.'
  }

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
    description = 'Professor Ask native companion for Codex and Antigravity'
    path = $LauncherExe
    type = 'stdio'
    allowed_origins = $allowedOrigins
  }

  $json = $manifest | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($ManifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))

  $registryPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
  )

  foreach ($registryPath in $registryPaths) {
    New-Item -Path $registryPath -Force | Out-Null
    Set-Item -Path $registryPath -Value $ManifestPath
  }

  $idsText = ($extensionIds -join ', ')
  Write-Status 'OK' "Professor Ask Companion est installé. À partir de maintenant, clique simplement sur Se connecter dans l'extension : Chrome lance le companion automatiquement et le fournisseur ouvre son OAuth dans le navigateur. Aucun terminal à ouvrir. Extension(s) autorisée(s) : $idsText"
  exit 0
}
catch {
  Write-Status 'ERROR' $_.Exception.Message
  exit 1
}
