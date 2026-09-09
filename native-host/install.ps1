$ErrorActionPreference = 'Stop'

$HostName = 'com.professorask.bridge'
$ExtensionId = 'geibmmecfgilkhncpcjjldbidnejflfb'
$BaseDir = $PSScriptRoot
$StatusFile = Join-Path $BaseDir 'install-status.txt'
$LauncherSource = Join-Path $BaseDir 'launcher.cs'
$LauncherExe = Join-Path $BaseDir 'ProfessorAskNativeHost.exe'
$NodePathFile = Join-Path $BaseDir 'node-path.txt'
$ManifestPath = Join-Path $BaseDir "$HostName.json"

function Write-Status([string]$Kind, [string]$Message) {
  [System.IO.File]::WriteAllText($StatusFile, "$Kind`r`n$Message", (New-Object System.Text.UTF8Encoding($false)))
}

try {
  if (-not (Test-Path $LauncherSource)) {
    throw 'launcher.cs est introuvable.'
  }

  if (-not (Test-Path (Join-Path $BaseDir 'host.js'))) {
    throw 'host.js est introuvable.'
  }

  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) {
    throw 'Node.js est requis pour cette version de développement du companion. Installe Node.js puis relance cet installateur.'
  }

  [System.IO.File]::WriteAllText($NodePathFile, $node.Source, (New-Object System.Text.UTF8Encoding($false)))

  if (Test-Path $LauncherExe) {
    Remove-Item $LauncherExe -Force
  }

  $source = Get-Content $LauncherSource -Raw
  Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly $LauncherExe -OutputType ConsoleApplication

  if (-not (Test-Path $LauncherExe)) {
    throw 'La compilation du companion Windows a échoué.'
  }

  $manifest = [ordered]@{
    name = $HostName
    description = 'Professor Ask native companion for Codex and Antigravity'
    path = $LauncherExe
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
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

  Write-Status 'OK' "Professor Ask Companion est installé. Chrome et Edge peuvent maintenant le lancer automatiquement. Aucun bridge, port ou terminal n'a besoin de rester ouvert."
  exit 0
}
catch {
  Write-Status 'ERROR' $_.Exception.Message
  exit 1
}
