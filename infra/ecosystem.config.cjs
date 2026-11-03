module.exports = {
  apps: [{
    name: 'leadjin',
    script: 'node_modules\\tsx\\dist\\cli.cjs',
    args: 'server.ts',
    cwd: 'D:\\DRIVE\\LEADJIN\\leadjin v9\\leadjin',
    interpreter: 'C:\\Program Files\\nodejs\\node.exe',
    env: {
      NODE_ENV: 'development',
      PORT: '3001',
      LEADJIN_PROJECT_ROOT: 'D:\\DRIVE\\LEADJIN\\leadjin v9\\leadjin'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: '3001',
      LEADJIN_PROJECT_ROOT: 'D:\\DRIVE\\LEADJIN\\leadjin v9\\leadjin'
    },
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 3000,
    kill_timeout: 5000,
    listen_timeout: 10000
  }]
};
