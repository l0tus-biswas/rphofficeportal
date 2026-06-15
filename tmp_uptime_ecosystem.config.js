module.exports = {
  apps: [{
    name: 'uptime-kuma',
    script: 'server/server.js',
    cwd: '/opt/uptime-kuma',
    interpreter: '/opt/plesk/node/25/bin/node',
    args: '--port=3001',
    env: {
      UPTIME_KUMA_BASE_PATH: '/uptime'
    }
  }]
};
