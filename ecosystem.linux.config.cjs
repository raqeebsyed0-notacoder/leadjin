module.exports = {
  apps: [{
    name: 'leadjin',
    script: 'node_modules/tsx/dist/cli.cjs',
    args: 'server.ts',
    interpreter: 'node',
    cwd: '/home/euphoria/LEADJIN SEPERATE BUSINESS MODULE/leadjin/leadjin',
    env: {
      NODE_ENV: 'production',
      PORT: '3001',
      LEADJIN_PROJECT_ROOT: '/home/euphoria/LEADJIN SEPERATE BUSINESS MODULE/leadjin/leadjin',
    },
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 3000,
    kill_timeout: 5000,
    listen_timeout: 15000,
    max_memory_restart: '1G',
    out_file: '/home/euphoria/.pm2/logs/leadjin-out.log',
    error_file: '/home/euphoria/.pm2/logs/leadjin-error.log',
  }]
};
