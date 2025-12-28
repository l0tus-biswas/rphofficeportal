const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { protect: authMiddleware } = require('./middleware/auth.middleware');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

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
}, express.static(path.join(__dirname, 'uploads')));

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/public', require('./routes/public.routes'));
app.use('/api/public', require('./routes/apa.routes')); // APA application routes
app.use('/api/agent', require('./routes/agent.routes'));
app.use('/api/onboarding', require('./routes/onboarding.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/admin', require('./routes/admin-apa.routes')); // Admin APA management
app.use('/api/admin/coupons', require('./routes/coupon.routes'));
app.use('/api/admin/config', require('./routes/config.routes'));
app.use('/api/training', require('./routes/training.routes'));
app.use('/api/payments', require('./routes/payment.routes'));
app.use('/api/user', require('./routes/user.routes'));
app.use('/api/licensing', require('./routes/licensing.routes'));
app.use('/api/production', require('./routes/production.routes'));
app.use('/api/notifications', authMiddleware, require('./routes/notification.routes'));
app.use('/api/carriers', require('./routes/carrier.routes'));

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
  res.sendFile(path.join(__dirname, '../frontend/dist/rhpoffice-frontend/index.html'));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
