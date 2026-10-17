# Penjaga bot RHC untuk PC Windows (pengganti pm2 + cek_sehat.sh di VPS).
# Jalankan:  powershell -ExecutionPolicy Bypass -File jalankan_windows.ps1
# Hentikan:  buat file stop.txt di folder ini.
# Setelan dibaca dari .env lewat --env-file (Node >= 20.6).
$l = $PSScriptRoot
$restart = 0; $jamMulai = Get-Date
Remove-Item "$l\stop.txt" -ErrorAction SilentlyContinue
function Tulis($pesan) { Add-Content "$l\penjaga.log" ("[" + (Get-Date -Format s) + "] " + $pesan) }
while (-not (Test-Path "$l\stop.txt")) {
  $p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'paper_live\.js' } | Select-Object -First 1
  if ($p) {
    # proses hidup belum tentu bekerja: periksa umur status.json dan ketertinggalan blok
    try {
      $umur = ((Get-Date) - (Get-Item "$l\status.json" -ErrorAction Stop).LastWriteTime).TotalSeconds
      $s = Get-Content "$l\status.json" -Raw | ConvertFrom-Json
      $alasan = $null
      if ($umur -gt 180) { $alasan = "status.json basi $([int]$umur) dtk (bot hang)" }
      elseif ($s.lag_blocks -gt 20000 -and $s.uptime_min -gt 20) { $alasan = "tertinggal $($s.lag_blocks) blok setelah $([int]$s.uptime_min) menit" }
      if ($alasan) { Tulis "BUNUH: $alasan"; Stop-Process -Id $p.ProcessId -Force; $p = $null; Start-Sleep -Seconds 2 }
    } catch { }
  }
  if (-not $p -and -not (Test-Path "$l\stop.txt")) {
    if (((Get-Date) - $jamMulai).TotalHours -ge 1) { $restart = 0; $jamMulai = Get-Date }
    $restart++
    if ($restart -gt 5) { Tulis "ALARM: $restart restart dalam 1 jam - jeda 5 menit"; Start-Sleep -Seconds 300 }
    Tulis "bot dihidupkan (restart ke-$restart jam ini)"
    try { Start-Process -FilePath "node" -ArgumentList "--env-file=.env","paper_live.js" -WorkingDirectory $l -WindowStyle Hidden -RedirectStandardOutput "$l\runner_out.log" -RedirectStandardError "$l\runner_err.log" -ErrorAction Stop }
    catch { Tulis "GAGAL START: $_" }
  }
  Start-Sleep -Seconds 20
}
Tulis "stop.txt ditemukan - penjaga berhenti; bot dimatikan"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'paper_live\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
