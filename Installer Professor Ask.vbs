Option Explicit

Dim shell, fso, baseDir, ps1, statusFile, command, exitCode, statusText
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = fso.BuildPath(fso.BuildPath(baseDir, "native-host"), "install.ps1")
statusFile = fso.BuildPath(fso.BuildPath(baseDir, "native-host"), "install-status.txt")

If Not fso.FileExists(ps1) Then
  MsgBox "Le dossier native-host est incomplet. Fais un git pull puis relance cet installateur.", vbCritical, "Professor Ask"
  WScript.Quit 1
End If

command = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File """ & ps1 & """"
exitCode = shell.Run(command, 0, True)

If fso.FileExists(statusFile) Then
  Dim file
  Set file = fso.OpenTextFile(statusFile, 1, False)
  statusText = file.ReadAll
  file.Close
Else
  statusText = "ERROR" & vbCrLf & "L'installation n'a pas renvoyé de diagnostic."
End If

If Left(statusText, 2) = "OK" Then
  MsgBox Mid(statusText, 5), vbInformation, "Professor Ask Companion"
Else
  MsgBox Replace(statusText, "ERROR" & vbCrLf, ""), vbCritical, "Professor Ask Companion"
End If

WScript.Quit exitCode
