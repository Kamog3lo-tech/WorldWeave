@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
title WorldWeave Launcher

echo =====================================
echo       WORLDWEAVE LAUNCHER
echo =====================================
echo.

where java >nul 2>nul
if errorlevel 1 goto missing_java
where javac >nul 2>nul
if errorlevel 1 goto missing_javac
set "PYTHON_EXE=python"
if exist "%~dp0backend\python\.venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0backend\python\.venv\Scripts\python.exe"
if not exist "%~dp0backend\python\.venv\Scripts\python.exe" (
  where python >nul 2>nul
  if errorlevel 1 goto missing_python
)
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_npm

if not exist "node_modules\vite\bin\vite.js" goto missing_frontend_deps
"%PYTHON_EXE%" -c "import fastapi, uvicorn, groq, instructor" >nul 2>nul
if errorlevel 1 goto missing_python_deps

if not exist "backend\java\out" mkdir "backend\java\out"
echo Compiling Java simulation...
pushd "backend\java"
javac -d out src\worldweave\*.java
if errorlevel 1 goto java_compile_failed
popd

echo Starting Java simulation...
start "WorldWeave Java Backend" /D "%~dp0backend\java" cmd /k "java -cp out worldweave.Main"
timeout /t 2 /nobreak >nul

echo Starting Python AI Director...
start "WorldWeave AI Director" /D "%~dp0backend\python" cmd /k ""%PYTHON_EXE%" -m uvicorn main:app --host 127.0.0.1 --port 8000"
timeout /t 2 /nobreak >nul

echo Starting Vite frontend...
start "WorldWeave Frontend" /D "%~dp0" cmd /k "npm run dev -- --host localhost"

echo.
echo Frontend:    http://localhost:5173
echo Java API:    http://localhost:8080
echo AI Director: http://localhost:8000
echo Groq is optional. Without GROQ_API_KEY, deterministic policy is used.
echo.
pause
exit /b 0

:java_compile_failed
popd
echo ERROR: Java compilation failed. See the messages above.
goto fail

:missing_java
echo ERROR: java was not found on PATH. Install a JDK and try again.
goto fail

:missing_javac
echo ERROR: javac was not found on PATH. Install a JDK, not only a JRE.
goto fail

:missing_python
echo ERROR: python was not found on PATH.
goto fail

:missing_node
echo ERROR: node was not found on PATH.
goto fail

:missing_npm
echo ERROR: npm was not found on PATH.
goto fail

:missing_frontend_deps
echo ERROR: Frontend dependencies are missing. Run npm ci from the project root.
goto fail

:missing_python_deps
echo ERROR: Python dependencies are missing. Install backend\python\requirements.txt first.
goto fail

:fail
pause
exit /b 1
