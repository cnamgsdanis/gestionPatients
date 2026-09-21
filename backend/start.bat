@echo off
echo ===== Compilation =====
rmdir /S /Q out
mkdir out
javac -encoding UTF-8 -cp "lib/*" -d out index.java controller/*.java dao/*.java db/*.java model/*.java security/*.java service/*.java

if %errorlevel% neq 0 (
    echo.
    echo ===== ERREUR DE COMPILATION - ARRET =====
    pause
    exit /b 1
)

echo.
echo ===== Demarrage du serveur =====
java -cp "out;lib/*" index