' Jalankan proses latar tanpa jendela (dipakai Task Scheduler). Argumen 1 = perintah.
CreateObject("WScript.Shell").Run WScript.Arguments(0), 0, False
