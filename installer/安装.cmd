@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

node "%~dp0install-cli.mjs" install
set "code=%errorlevel%"
echo.
if not "%code%"=="0" pause
exit /b %code%

:nonode
echo.
echo   [!] 未检测到 Node.js，无法继续。
echo       请先安装 Node.js LTS：https://nodejs.org/
echo       装好后关闭本窗口，重新双击本文件即可。
echo.
pause
exit /b 2
