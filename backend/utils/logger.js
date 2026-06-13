const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');

// Custom format: timestamp + level + message + metadata
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development readability
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// Rotating file transport for combined logs
const combinedTransport = new DailyRotateFile({
  filename: path.join(logDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
  level: 'info'
});

// Rotating file transport for errors only
const errorTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: logFormat,
  level: 'error'
});

const transports = [combinedTransport, errorTransport];

// Add console transport in non-test environments
if (process.env.NODE_ENV !== 'test') {
  transports.push(new winston.transports.Console({ format: consoleFormat }));
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'rhp-office' },
  transports,
  // Don't exit on uncaught exceptions — let PM2 handle restarts
  exitOnError: false
});

// Stream for Morgan HTTP request logging
logger.stream = {
  write: (message) => logger.http(message.trim())
};

module.exports = logger;
