@echo off
echo === TypeScript Build ===
node node_modules\typescript\bin\tsc --build --force > tsc_output.txt 2>&1
echo TSC exit code: %errorlevel%
findstr /c:"error TS" tsc_output.txt | find /c "error TS" > tsc_count.txt 2>&1
echo TSC error count:
type tsc_count.txt
echo.
echo === ESLint (server-side only) ===
node node_modules\eslint\bin\eslint.js src --format json > eslint_output.json 2>&1
echo ESLint exit code: %errorlevel%
