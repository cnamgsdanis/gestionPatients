@echo off
rem ============================================================================
rem  Lance l'application en local : compile l'API, la demarre, sert le site et ouvre le navigateur.
rem  Prerequis : SQL Server demarre, Java 17+ (JDK) et Python dans le PATH, backend\db\local.properties.
rem  Guide complet : LANCER-EN-LOCAL.md
rem ============================================================================
setlocal
title PEC - lancement local
cd /d "%~dp0"

if not exist "backend\db\local.properties" (
    echo.
    echo  Il manque backend\db\local.properties ^(reglages de la base et du port^).
    echo  Copiez backend\db\local.properties.example en local.properties, puis adaptez-le.
    echo.
    pause
    exit /b 1
)

echo ===== 1/3  Compilation de l'API =====
pushd backend
call "%~dp0backend\compile.bat"
if errorlevel 1 (
    popd
    echo.
    echo  La compilation a echoue : lisez les messages ci-dessus.
    pause
    exit /b 1
)
popd

echo ===== 2/3  Demarrage de l'API (nouvelle fenetre) =====
start "PEC - API" /D "%~dp0backend" cmd /k "java -cp out;lib/* index"

echo ===== 3/3  Demarrage du site (nouvelle fenetre) =====
start "PEC - Site (5500)" /D "%~dp0frontend" cmd /k "python -m http.server 5500 --bind 127.0.0.1"

timeout /t 6 /nobreak >nul
start "" "http://localhost:5500"

echo.
echo  Site : http://localhost:5500      Connexion : admin / admin
echo  Pour tout arreter : fermez les deux fenetres "PEC - API" et "PEC - Site (5500)".
echo.
pause
