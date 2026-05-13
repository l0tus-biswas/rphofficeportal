const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const User = require('./models/User');
const SystemConfig = require('./models/SystemConfig');
const { protect: authMiddleware } = require('./middleware/auth.middleware');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Set timezone to Eastern Time (America/New_York)
process.env.TZ = 'America/New_York';

const app = express();

// Trust proxy - necessary for getting real IP behind reverse proxy
app.set('trust proxy', true);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:4200',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve static files from Angular app FIRST
app.use(express.static(path.join(__dirname, '../frontend/dist/rhpoffice-frontend'), {
  maxAge: '1d',
  etag: false
}));

// Serve uploads folder for images and files
app.use('/uploads', (req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Allow-Origin', process.env.APP_URL || 'http://localhost:4200');
  next();
}, express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
      '.pdf': 'application/pdf', '.ico': 'image/x-icon'
    };
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
  }
}));

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected successfully');
  return mongoose.connection;
}

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/public', require('./routes/public.routes'));
app.use('/api/public', require('./routes/apa.routes')); // APA application routes
app.use('/api/agent', require('./routes/agent.routes'));
app.use('/api/onboarding', require('./routes/onboarding.routes'));
app.use('/api/admin/products', require('./routes/admin-products.routes'));
app.use('/api/admin/coupons', require('./routes/coupon.routes'));
app.use('/api/admin/config', require('./routes/config.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/admin', require('./routes/admin-apa.routes')); // Admin APA management
app.use('/api/training', require('./routes/training.routes'));
app.use('/api/payments', require('./routes/payment.routes'));
app.use('/api/user', require('./routes/user.routes'));
app.use('/api/licensing', require('./routes/licensing.routes'));
app.use('/api/examfx', require('./routes/examfx.routes'));
app.use('/api/production', require('./routes/production.routes'));
app.use('/api/notifications', authMiddleware, require('./routes/notification.routes'));
app.use('/api/broadcasts', require('./routes/broadcast.routes'));
app.use('/api/carriers', require('./routes/carrier.routes'));
app.use('/api/commission-statements', require('./routes/commission-statements.routes'));
app.use('/api/onboarding-hub', require('./routes/onboarding-hub.routes'));
app.use('/api/document-hub', require('./routes/document-hub.routes'));
app.use('/api', require('./routes/aca.routes'));
app.use('/api/business-cards', require('./routes/business-cards.routes'));
app.use('/api/promotion', require('./routes/promotion.routes'));
app.use('/api/quickbooks', require('./routes/quickbooks.routes'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Send all other non-API requests to Angular app (SPA fallback)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../frontend/dist/rhpoffice-frontend/index.html');
  
  // Check if frontend is built
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(503).json({
      success: false,
      message: 'Frontend not built. Please run: cd frontend && npm run build',
      error: 'Frontend build not found'
    });
  }
});

const PORT = process.env.PORT || 5000;

// Create HTTP server with Socket.IO
const httpServer = createServer(app);
const io = new Server(httpServer, {
  path: '/socket.io/',
  cors: {
    origin: process.env.APP_URL || 'http://localhost:4200',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
  allowEIO3: true
});

// Middleware: Authenticate socket connections
io.use((socket, next) => {
  (async () => {
    const token = socket.handshake.auth.token;
    if (!token) {
      console.warn('[Socket] Connection rejected: No token provided');
      return next(new Error('Authentication required'));
    }

    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('role isActive deletedAt').lean();

      if (!user || !user.isActive || user.deletedAt) {
        return next(new Error('User is not allowed to connect'));
      }

      if (user.role !== 'admin') {
        const enabledConfig = await SystemConfig.findOne({ key: 'site_access_enabled' }).lean();
        const siteAccessEnabled = (enabledConfig?.value || 'true').toLowerCase() !== 'false';
        if (!siteAccessEnabled) {
          return next(new Error('Maintenance mode active'));
        }
      }

      socket.user = decoded;
      socket.userId = decoded.id;
      console.log(`[Socket] User ${socket.userId} authenticated`);
      next();
    } catch (error) {
      console.warn(`[Socket] Authentication failed: ${error.message}`);
      next(new Error('Invalid token: ' + error.message));
    }
  })();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[Socket] User ${socket.userId} connected:`, socket.id);

  // Join a user-specific room
  socket.join(`user:${socket.userId}`);

  // Listen for disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket] User ${socket.userId} disconnected:`, socket.id);
  });
});

// Make io available to routes
app.locals.io = io;

async function startServer(port = PORT) {
  await connectDatabase();

  if (httpServer.listening) {
    return httpServer;
  }

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, () => {
      httpServer.removeListener('error', reject);
      console.log(`Server running on port ${port} with Socket.IO enabled`);
      resolve();
    });
  });

  return httpServer;
}

if (require.main === module) {
  startServer().catch(err => {
    console.error('Server startup error:', err);
    process.exit(1);
  });
}

module.exports = { app, httpServer, io, connectDatabase, startServer };
