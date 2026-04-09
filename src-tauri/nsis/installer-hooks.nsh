; Weekly Review NSIS Installer Hooks
; SIMPLIFIED - using only basic NSIS commands

!macro NSIS_HOOK_PREINSTALL
  ; Kill processes - using simple ExecWait which is guaranteed to work
  ; Exit codes are ignored (process may not be running)

  ExecWait 'taskkill /F /IM "Weekly Review.exe" /T'
  ExecWait 'taskkill /F /IM "weekly-review.exe" /T'
  ExecWait 'taskkill /F /IM "weekly-review-backend.exe" /T'
  ExecWait 'taskkill /F /IM "weekly-review-backend-x86_64-pc-windows-msvc.exe" /T'

  ; Wait 5 seconds for file handles to be released
  Sleep 5000
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ExecWait 'taskkill /F /IM "Weekly Review.exe" /T'
  ExecWait 'taskkill /F /IM "weekly-review.exe" /T'
  ExecWait 'taskkill /F /IM "weekly-review-backend.exe" /T'
  ExecWait 'taskkill /F /IM "weekly-review-backend-x86_64-pc-windows-msvc.exe" /T'
  Sleep 5000
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
