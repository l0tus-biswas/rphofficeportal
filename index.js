const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_PORT = process.env.BACKEND_PORT || 5000;

// Start backend server
let backendProcess;

function startBackend() {
  console.log('Starting backend server...');
  backendProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, 'backend'),
    stdio: 'inherit',
    env: { ...process.env, PORT: BACKEND_PORT }
  });

  backendProcess.on('error', (error) => {
    console.error('Backend server error:', error);
  });

  backendProcess.on('exit', (code) => {
    console.log(`Backend server exited with code ${code}`);
    if (code !== 0 && code !== null) {
      console.log('Restarting backend server in 5 seconds...');
      setTimeout(startBackend, 5000);
    }
  });
}

// Start backend
startBackend();

// Serve static files from Angular build
const distPath = path.join(__dirname, 'frontend', 'dist', 'rhpoffice-frontend', 'browser');
app.use(express.static(distPath));

// API proxy - forward all /api requests to backend
app.use('/api', (req, res) => {
  const backendUrl = `http://localhost:${BACKEND_PORT}${req.originalUrl}`;
  console.log(`Proxying ${req.method} ${req.originalUrl} -> ${backendUrl}`);
  
  // Just inform that API calls should go directly to backend
  res.status(503).json({
    message: 'API requests should be made directly to backend server',
    backendUrl: `http://localhost:${BACKEND_PORT}`,
    hint: 'Update your Angular environment to point to the backend URL'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    frontend: 'running',
    backend: `http://localhost:${BACKEND_PORT}`,
    timestamp: new Date().toISOString()
  });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Start frontend server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('RHP Office Portal - Production Server');
  console.log('='.repeat(60));
  console.log(`Frontend: http://localhost:${PORT}`);
  console.log(`Backend:  http://localhost:${BACKEND_PORT}`);
  console.log(`Health:   http://localhost:${PORT}/health`);
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (backendProcess) {
    backendProcess.kill();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  if (backendProcess) {
    backendProcess.kill();
  }
  process.exit(0);
});
