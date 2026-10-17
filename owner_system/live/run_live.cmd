@echo off
rem Paper trading live (mode kertas). Restart otomatis kalau proses mati; lanjut dari blok terakhir.
cd /d C:\Users\horii\rhc-quant\live
:loop
node paper_live.js 61866034 >> runner_stdout.log 2>&1
timeout /t 10 /nobreak >nul
goto loop
