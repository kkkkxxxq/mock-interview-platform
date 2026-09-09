@echo off
cd /d "%~dp0..\.."
powershell -Command "$env:PORT='3000'; node --experimental-loader=hijack-esm .\node_modules\.bin\..\..\node_modules\tsx\dist\loader\loader.cjs .\apps\server\src\index.ts" 2>&1