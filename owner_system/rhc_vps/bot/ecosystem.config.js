// pm2 untuk VPS Linux. Jalankan dari folder bot/:  pm2 start ecosystem.config.js
// Setelan dibaca dari .env (Node >= 20.6 lewat --env-file).
module.exports = {
  apps: [{
    name: "rhc-paper",
    script: "paper_live.js",
    node_args: "--env-file=.env",
    cwd: __dirname,
    autorestart: true,
    max_restarts: 50,
    restart_delay: 10000,
    exp_backoff_restart_delay: 5000,
    max_memory_restart: "1500M",
    out_file: "runner_out.log",
    error_file: "runner_err.log",
    time: true,
  }],
};
