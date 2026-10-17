// pm2: jalan terus, restart otomatis kalau mati, log terpisah.
module.exports = {
  apps: [{
    name: "rhc-paper",
    script: "paper_live.js",
    node_args: "--env-file=.env",
    cwd: __dirname,
    autorestart: true,
    restart_delay: 10000,
    max_restarts: 1000,
    max_memory_restart: "1500M",
    out_file: "logs/out.log",
    error_file: "logs/err.log",
    time: true,
  }],
};
