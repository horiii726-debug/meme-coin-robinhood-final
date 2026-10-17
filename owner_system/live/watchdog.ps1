$l = "C:\Users\horii\rhc-quant\live"
$env:FILTER = "1"; $env:HONEYPOT = "1"; $env:DEV_RULE = "1"; $env:START_USD = "100"; $env:QTHR = "0.90"
$env:RETRAIN_TIAP = "100"; $env:MAX_POS = "10"; $env:UP_TH = "0.5"; $env:EXP_MAX = "0.5"
$env:TP_UP = "0.5"; $env:KILL_DD = "0.60"; $env:REM = "1"
$restart = 0; $jamMulai = Get-Date
while (-not (Test-Path "$l\stop.txt")) {
  $p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'paper_live\.js' }
  $bunuh = $false; $alasan = ""
  if ($p) {
    # DETEKSI HANG / TERTINGGAL: proses hidup belum tentu bekerja.
    # status.json memberi umur laporan dan ketertinggalan blok.
    try {
      $s = Get-Content "$l\status.json" -Raw -ErrorAction Stop | ConvertFrom-Json
      $umurFile = ((Get-Date) - (Get-Item "$l\status.json").LastWriteTime).TotalSeconds
      if ($umurFile -gt 180) { $bunuh = $true; $alasan = "status.json basi $([int]$umurFile) dtk (bot hang)" }
      elseif ($s.lag_blocks -gt 20000 -and $s.uptime_min -gt 20) { $bunuh = $true; $alasan = "tertinggal $($s.lag_blocks) blok setelah $([int]$s.uptime_min) menit" }
    } catch { }
  }
  if ($bunuh) { Add-Content "$l\watchdog.log" ("[" + (Get-Date -Format s) + "] BUNUH: $alasan"); Stop-Process -Id $p.ProcessId -Force; $p = $null; Start-Sleep -Seconds 2 }
  if (-not $p) {
    $restart++
    if (((Get-Date) - $jamMulai).TotalHours -ge 1) { $restart = 1; $jamMulai = Get-Date }
    if ($restart -gt 5) { Add-Content "$l\watchdog.log" ("[" + (Get-Date -Format s) + "] ALARM: $restart restart dalam 1 jam - jeda 5 menit"); Start-Sleep -Seconds 300 }
    Add-Content "$l\watchdog.log" ("[" + (Get-Date -Format s) + "] paper_live dihidupkan (restart ke-$restart jam ini)")
    try { Start-Process -FilePath "node" -ArgumentList "paper_live.js" -WorkingDirectory $l -WindowStyle Hidden -RedirectStandardOutput "$l\runner_out.log" -RedirectStandardError "$l\runner_err.log" -ErrorAction Stop }
    catch { Add-Content "$l\watchdog.log" ("[" + (Get-Date -Format s) + "] GAGAL START: $_") }
  }
  Start-Sleep -Seconds 20
}
