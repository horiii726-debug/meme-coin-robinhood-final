# mulai salinan bot, kembalikan PID
param([string]$arg = "")
$B = "C:\Users\horii\rhc-quant\rhc_vps\hasil\audit\kerja_10\bot_salinan"
$a = @("--env-file=.env", "paper_live.js"); if ($arg) { $a += $arg }
$p = Start-Process -FilePath "node" -ArgumentList $a -WorkingDirectory $B -WindowStyle Hidden -RedirectStandardOutput "$B\run_out.log" -RedirectStandardError "$B\run_err.log" -PassThru
$p.Id | Out-File -Encoding ascii "$B\..\pid_bot.txt"
"PID $($p.Id)"
