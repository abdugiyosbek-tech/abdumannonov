@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON_CMD=py"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set "PYTHON_CMD=python"
  ) else (
    echo Python topilmadi. Python 3 ni o'rnating yoki VS Code Live Server orqali index.html ni oching.
    pause
    exit /b 1
  )
)

netstat -ano | findstr ":8000" >nul
if %errorlevel%==0 (
  echo 8000-port band. Brauzerda http://localhost:8000 manzilini tekshiring.
  start "" http://localhost:8000
  pause
  exit /b 0
)

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"
echo FIT JARVIS serveri ishga tushdi: http://localhost:8000
echo To'xtatish uchun Ctrl+C bosing.
%PYTHON_CMD% -m http.server 8000
endlocal
