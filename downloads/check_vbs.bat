@echo off
setlocal EnableDelayedExpansion
if /I "%~1"=="--report" goto diagnostics
set "REPORT_FILE=%TEMP%\Nenyoo-vbs-check.txt"
call "%~f0" --report > "%REPORT_FILE%" 2>&1
type "%REPORT_FILE%"
echo.
echo Report saved to: "%REPORT_FILE%"
echo Attach this text file to your Discord support ticket.
pause
exit /b

:diagnostics
echo ======================================================================
echo  Nenyoo VBS / Memory Integrity diagnostic -- read-only
echo ======================================================================
echo.

REM --------------------------------------------------------------------
REM  Primary: WMI query of Win32_DeviceGuard (same namespace, same props)
REM --------------------------------------------------------------------
echo [1/2] WMI: ROOT\Microsoft\Windows\DeviceGuard  Win32_DeviceGuard
echo       (VirtualizationBasedSecurityStatus, SecurityServicesRunning,
echo        CodeIntegrityPolicyEnforcementStatus)
echo ----------------------------------------------------------------------

set "WMI_OK=0"
set "VBS_STATUS=?"
set "HVCI_RUNNING=0"
set "CI_POLICY=?"
set "SSR_RAW="

for /f "usebackq tokens=1,* delims==" %%A in (`powershell -NoProfile -Command ^
  "try {" ^
  "  $dg = Get-CimInstance -Namespace 'ROOT\Microsoft\Windows\DeviceGuard' -ClassName 'Win32_DeviceGuard' -ErrorAction Stop;" ^
  "  Write-Output ('OK=1');" ^
  "  Write-Output ('VBS=' + [int]$dg.VirtualizationBasedSecurityStatus);" ^
  "  Write-Output ('CI='  + [int]$dg.CodeIntegrityPolicyEnforcementStatus);" ^
  "  $arr = @($dg.SecurityServicesRunning);" ^
  "  Write-Output ('SSR=' + ($arr -join ','));" ^
  "  if ($arr -contains 2) { Write-Output 'HVCI=1' } else { Write-Output 'HVCI=0' };" ^
  "} catch { Write-Output 'OK=0'; Write-Output ('ERR=' + $_.Exception.Message) }" `) do (
    if /I "%%A"=="OK"   set "WMI_OK=%%B"
    if /I "%%A"=="VBS"  set "VBS_STATUS=%%B"
    if /I "%%A"=="CI"   set "CI_POLICY=%%B"
    if /I "%%A"=="SSR"  set "SSR_RAW=%%B"
    if /I "%%A"=="HVCI" set "HVCI_RUNNING=%%B"
    if /I "%%A"=="ERR"  echo    WMI ERROR: %%B
)

if "%WMI_OK%"=="1" (
    echo    VirtualizationBasedSecurityStatus = !VBS_STATUS!    ^(0=off 1=configured-not-running 2=RUNNING^)
    echo    SecurityServicesRunning           = [!SSR_RAW!]      ^(1=CG 2=HVCI 3=SysGuard 4=SMM 5=KHWStk 6=KHWStkAudit 7=HVPT^)
    echo    CodeIntegrityPolicyEnforcementStatus = !CI_POLICY!    ^(not used for trigger - WDAC signal only^)
) else (
    echo    WMI query failed. Falling back to registry.
)
echo.

REM --------------------------------------------------------------------
REM  Fallback: registry probe (loader uses this only when WMI fails,
REM  but we always show it so you can see configured vs running).
REM --------------------------------------------------------------------
echo [2/2] Registry fallback: HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard
echo ----------------------------------------------------------------------

set "REG_VBS=?"
set "REG_HVCI=?"

for /f "tokens=3" %%V in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard" /v EnableVirtualizationBasedSecurity 2^>nul ^| findstr /i "EnableVirtualizationBasedSecurity"') do (
    set "REG_VBS=%%V"
)
for /f "tokens=3" %%V in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity" /v Enabled 2^>nul ^| findstr /i "Enabled"') do (
    set "REG_HVCI=%%V"
)
echo    DeviceGuard\EnableVirtualizationBasedSecurity        = !REG_VBS!
echo    DeviceGuard\Scenarios\HVCI\Enabled                    = !REG_HVCI!
echo.

REM --------------------------------------------------------------------
REM  Verdict -- EXACT loader rule from vbs_guard.cpp:
REM    vbs_on  = (VirtualizationBasedSecurityStatus == 2)
REM    hvci_on = (SecurityServicesRunning contains 2) AND vbs_on
REM  Banner "Hypervisor / VBS is running" fires if either is true.
REM --------------------------------------------------------------------
echo ======================================================================
echo  VERDICT
echo ======================================================================

set "VBS_ON=0"
set "HVCI_ON=0"
set "SOURCE=WMI"

if "%WMI_OK%"=="1" (
    if "!VBS_STATUS!"=="2"       set "VBS_ON=1"
    if "!HVCI_RUNNING!"=="1" if "!VBS_ON!"=="1" set "HVCI_ON=1"
) else (
    set "SOURCE=REGISTRY"
    if "!REG_VBS!"=="0x1" set "VBS_ON=1"
    if "!REG_HVCI!"=="0x1" if "!VBS_ON!"=="1" set "HVCI_ON=1"
)

echo    Diagnostic source: !SOURCE!
echo    VBS flag        : !VBS_ON!
echo    HVCI flag       : !HVCI_ON!
echo.

if "%WMI_OK%"=="1" (
    if "!VBS_ON!"=="1" echo    [TRIGGER] VBS is running. Runtime status = !VBS_STATUS!.
    if "!HVCI_ON!"=="1" echo    [TRIGGER] HVCI / Memory Integrity is running. SecurityServicesRunning contains 2.
    if "!VBS_ON!"=="0" if "!HVCI_ON!"=="0" echo    [CLEAN] Neither VBS nor HVCI is reported running by WMI.
) else (
    echo    [INCONCLUSIVE] WMI failed. Registry values show configuration, not verified runtime state.
    echo    The inferred flags above are a best-effort fallback, not proof that VBS is running or off.
    echo    Re-run as administrator and send the full report to support if WMI still fails.
)

echo.
echo ======================================================================
echo  Extra context ^(not used by loader, informational^):
echo ======================================================================

echo    bcdedit hypervisorlaunchtype:
for /f "tokens=1,*" %%A in ('bcdedit /enum "{current}" 2^>nul ^| findstr /i "hypervisorlaunchtype"') do (
    echo        %%A %%B
)

echo    Hyper-V feature state:
powershell -NoProfile -Command "try { (Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-Hypervisor -ErrorAction Stop).State } catch { 'unknown' }" 2>nul

echo.
endlocal
exit /b
