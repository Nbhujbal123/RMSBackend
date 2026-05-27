// Socket.io singleton — init once in index.js, then getIO() anywhere
const { Server } = require("socket.io");

let _io = null;

const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1"))
    return callback(null, true);
  if (origin.endsWith(".vercel.app")) return callback(null, true);
  if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL)
    return callback(null, true);
  callback(new Error("Not allowed by CORS: " + origin));
};

exports.init = (httpServer) => {
  _io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ["GET", "POST"], credentials: true },
  });

  _io.on("connection", (socket) => {
    // Client tells us which restaurant it belongs to
    socket.on("join-site", (siteCode) => {
      if (siteCode) socket.join(siteCode);
    });
  });

  return _io;
};

// Safe getter — silently no-ops if not yet initialised (e.g. tests)
exports.getIO = () => _io;

// Helper used by controllers: emit to everyone in the site room
exports.emitToSite = (siteCode, event, payload) => {
  if (_io && siteCode) _io.to(siteCode).emit(event, payload);
};
