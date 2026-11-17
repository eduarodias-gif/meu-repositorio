@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === SIED SYSTEM V5 - gerar aplicativo Windows ===
where cargo >nul 2>&1 || (echo [ERRO] Rust nao instalado. Instale em https://rustup.rs e rode de novo. & pause & exit /b 1)
where link >nul 2>&1 || echo [AVISO] Se a compilacao falhar com "link.exe not found", instale o Visual Studio Build Tools com "Desenvolvimento para desktop com C++".
call npm.cmd install || (pause & exit /b 1)
call npm.cmd run desktop:build || (pause & exit /b 1)
echo.
echo Instalador gerado em: src-tauri\target\release\bundle\nsis\
explorer "src-tauri\target\release\bundle\nsis"
pause
