// Main entry point for Plesk Node.js deployment
const { startServer } = require('./backend/server.js');

startServer().catch(err => {
	console.error('Failed to start server:', err);
	process.exit(1);
});