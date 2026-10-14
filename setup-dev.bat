@echo off
setlocal EnableDelayedExpansion

echo ==========================================
echo  LeadJin Auto-Setup (Dev Environment)
echo ==========================================
echo.

REM Get the local IP address (WiFi/Ethernet, not WSL/Docker/VirtualBox)
echo [1/7] Detecting local IP address...

set "DETECTED_IP="

REM Create temporary PowerShell script for IP detection
echo Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '172.1[6-9].*' -and $_.IPAddress -notlike '172.2[0-9].*' -and $_.IPAddress -notlike '172.3[0-1].*' -and $_.IPAddress -notmatch '^169\.254\.' -and $_.InterfaceAlias -notmatch 'WSL^|Hyper-V^|Docker^|VirtualBox^|vEthernet' } ^| Select-Object -First 1 -ExpandProperty IPAddress > "%TEMP%\get-ip.ps1"

REM Run the PowerShell script
for /f "tokens=*" %%a in ('powershell -NoProfile -File "%TEMP%\get-ip.ps1"') do (
    set "DETECTED_IP=%%a"
)

REM Clean up temp file
del "%TEMP%\get-ip.ps1" 2>nul

REM If PowerShell method didn't work, fallback to ipconfig parsing
if "!DETECTED_IP!"=="" (
    echo [INFO] PowerShell method failed, trying ipconfig fallback...
    for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
        set "ip=%%a"
        set "ip=!ip: =!"
        REM Skip loopback, WSL, Hyper-V, Docker, and APIPA addresses
        set "SKIP=0"
        echo !ip! | findstr /B "127." >nul && set "SKIP=1"
        if "!SKIP!"=="0" echo !ip! | findstr /B "172.1" >nul && set "SKIP=1"
        if "!SKIP!"=="0" echo !ip! | findstr /B "172.2" >nul && set "SKIP=1"
        if "!SKIP!"=="0" echo !ip! | findstr /B "172.3" >nul && set "SKIP=1"
        if "!SKIP!"=="0" echo !ip! | findstr /B "169.254." >nul && set "SKIP=1"
        if "!SKIP!"=="0" set "DETECTED_IP=!ip!"
    )
)

REM Validate we got an IP
if "!DETECTED_IP!"=="" (
    echo [ERROR] Could not detect local IP address.
    echo Please check your network connection and try again.
    pause
    exit /b 1
)

echo [OK] Detected IP: !DETECTED_IP!
echo.

REM Run PowerShell helper to update all config files
echo [2-4/7] Updating config files...
powershell -NoProfile -File setup-helper.ps1 -IpAddress !DETECTED_IP!
if errorlevel 1 (
    echo [ERROR] Failed to update config files.
    pause
    exit /b 1
)

REM Sync Capacitor
echo.
echo [5/7] Syncing Capacitor with Android project...
call npx cap sync android
if errorlevel 1 (
    echo [ERROR] Capacitor sync failed.
    pause
    exit /b 1
)
echo [OK] Capacitor sync complete.
echo.

REM Re-apply Java version fix (cap sync regenerates capacitor.build.gradle back to VERSION_21)
powershell -NoProfile -Command "(Get-Content android\app\capacitor.build.gradle) -replace 'VERSION_21', 'VERSION_17' | Set-Content android\app\capacitor.build.gradle"
echo [OK] Java version re-patched to 17 after sync.
echo.

REM Build APK
echo [6/7] Building APK (this may take 3-5 minutes)...
cd android

call gradlew.bat assembleDebug --no-daemon
if errorlevel 1 (
    echo.
    echo [ERROR] APK build failed.
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo ==========================================
echo  SUCCESS! Setup Complete
echo ==========================================
echo.
echo Configuration Summary:
echo   Detected IP: !DETECTED_IP!
echo   Server URL:  http://!DETECTED_IP!:3001
echo.
echo APK Location:
echo   android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo File Details:
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    for %%F in ("android\app\build\outputs\apk\debug\app-debug.apk") do (
        echo   Size: %%~zF bytes
        echo   Modified: %%~tF
    )
    echo.
    echo [OK] APK is ready to install on your phone!
    echo [!] Make sure your phone is on the same WiFi network.
) else (
    echo   [WARNING] APK file not found at expected location.
)
echo.
echo NEXT STEPS:
echo   1. Make sure LeadJin server is running: set PORT=3001 ^& npm run dev
echo   2. Copy the APK to your phone (USB/WhatsApp/email)
echo   3. Install and open the app
echo   4. The app will connect to: http://!DETECTED_IP!:3001
echo.
echo ==========================================
pause
endlocal
