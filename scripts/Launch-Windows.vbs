' Lance LuLune sans fenetre terminal
Option Explicit
Dim sh, fso, dir, exe, ps
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\LuLuneAutoClicker.exe"

If Not fso.FileExists(exe) Then
  MsgBox "LuLuneAutoClicker.exe introuvable.", vbCritical, "LuLune AutoClicker"
  WScript.Quit 1
End If

' Debloque en arriere-plan (fenetre PowerShell cachee), puis lance l'exe
ps = "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command " & _
     """Get-ChildItem -LiteralPath '" & Replace(dir, "'", "''") & "' -Recurse -Force -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue"""
sh.Run ps, 0, True
sh.Run """" & exe & """", 1, False
