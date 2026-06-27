// Small registry that holds the single Socket.IO server instance so modules
// without access to the Express `req` (e.g. Mongoose models) can emit real-time
// events. server.js calls setIO(io) once at startup. Routes that DO have a
// request can keep using `req.app.locals.io` — both point at the same instance.

let io = null;

function setIO(instance) {
  io = instance;
}

function getIO() {
  return io;
}

/**
 * Emit an event to a specific user's room (`user:<userId>`).
 * No-ops safely if Socket.IO is not initialized yet.
 */
function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId.toString()}`).emit(event, payload);
}

module.exports = { setIO, getIO, emitToUser };
