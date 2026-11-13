module.exports = {
  apps: [
    {
      name: 'gricc-backend',
      script: 'server/index.js',
      // IMPORTANT: Keep instances: 1 (fork mode).
      // In-memory cacheService and SSE client registry are single-process only.
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 5000,
      wait_ready: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      out_file: './logs/gricc-out.log',
      error_file: './logs/gricc-err.log',
      merge_logs: true,
      time: true,
    },
  ],
};

