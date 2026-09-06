@echo off
start /b cmd /c "npm run start:dev"
echo Servidor NestJS iniciado en segundo plano
echo Revisa server.log para ver el estado
timeout /t 2 /nobreak >nul