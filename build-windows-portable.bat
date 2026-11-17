@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM  DeepSeek Harness - Windows 便携版构建脚本
REM  输出: ZIP 压缩包，解压即可使用，数据保存在同级 data/ 目录
REM  产物位置: apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\
REM ============================================================

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM ===== 国内镜像加速（国内网络环境可显著加速构建）=====
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"

echo [1/7] 检查构建环境...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请安装 Node.js 22.19+ 或 24+
    echo        下载地址: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo       Node.js: %NODE_VER%

where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 pnpm，请先安装 pnpm 11.7.0
    echo        安装命令: corepack enable ^&^& corepack prepare pnpm@11.7.0 --activate
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('pnpm --version') do set PNPM_VER=%%i
echo       pnpm: %PNPM_VER%

where tar >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 tar 命令，请确保 Git for Windows 或 GNU Tar 已安装并在 PATH 中
    pause
    exit /b 1
)
echo       tar: 已就绪

echo.
echo [2/7] 安装依赖 (pnpm install)...
pnpm install
if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)

echo.
echo [3/7] 检查 Windows 打包环境配置...
if not exist "apps\desktop\.env.windows" (
    echo       未找到 apps\desktop\.env.windows，正在自动生成...
    (
        echo # Windows 本地打包配置 - 由 build-windows-portable.bat 自动生成
        echo DSH_DESKTOP_APP_ID=com.deepseek.harness
        echo DSH_DESKTOP_AUTO_UPDATE_ENV=test
        echo DOWNLOAD_TEST_ORIGIN=https://download.example.com/
        echo DOWNLOAD_TEST_RELEASE_ID=0123456789abcdef0123456789abcdef
        echo.
        echo REM 国内 npm 镜像加速（注释掉则使用官方源）
        echo DSH_DESKTOP_NPM_REGISTRY=https://registry.npmmirror.com
        echo.
        echo DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN=https://updates.example.com/
        echo DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN=https://updates.deepseek.com/
        echo DSH_DESKTOP_MANDATORY_UPDATE_CONFIG={"allowedAuthOrigins":["https://login.example.com"]}
        echo.
        echo REM 代码签名配置（无签名构建留空即可）
        echo DSH_DESKTOP_WINDOWS_CER_FILE=
        echo DSH_DESKTOP_WINDOWS_SIGNTOOL=
        echo DSH_DESKTOP_WINDOWS_KEY_CONTAINER=
        echo DSH_DESKTOP_WINDOWS_TOKEN_PIN=
        echo DSH_DESKTOP_WINDOWS_SIGNATURE_CACHE_CONCURRENCY=4
    ) > "apps\desktop\.env.windows"
    echo       已生成 apps\desktop\.env.windows
) else (
    echo       已加载 apps\desktop\.env.windows
)

echo.
echo [4/7] 清理旧构建产物（避免文件锁定）...
if exist "apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\win-unpacked" (
    ren "apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\win-unpacked" "win-unpacked.tmp" 2>nul
    if exist "apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\win-unpacked.tmp" (
        rmdir /s /q "apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\win-unpacked.tmp" 2>nul
    )
)

echo.
echo [5/7] 构建 Windows x64 便携版 (ZIP)...
echo       便携版解压后与安装版功能一致，数据保存在同级 data/ 目录
echo       这将需要较长时间（构建 + 打包运行时 + 生成 ZIP）
echo.

pnpm run package:desktop:win:x64:portable

set "BUILD_RESULT=%errorlevel%"

echo.
if %BUILD_RESULT% equ 0 (
    echo [6/7] 构建成功！
    echo.
    echo [7/7] 产物位置:
    echo       apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\
    echo.
    for %%f in (apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\*.zip) do (
        echo       %%~nxf
    )
) else (
    echo [错误] 构建失败，错误码: %BUILD_RESULT%
    echo        请查看上方日志定位问题
    pause
    exit /b %BUILD_RESULT%
)

echo.
echo 构建完成。
pause
endlocal
