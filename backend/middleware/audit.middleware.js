const AuditLog = require('../models/AuditLog');

// Helper function to get real client IP
function getClientIP(req) {
  // Check for X-Forwarded-For header (proxy/load balancer)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    const ip = forwarded.split(',')[0].trim();
    return ip;
  }
  
  // Check for X-Real-IP header (nginx)
  if (req.headers['x-real-ip']) {
    return req.headers['x-real-ip'];
  }
  
  // Fallback to req.ip (requires trust proxy)
  let ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  // Convert IPv6 localhost to IPv4
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }
  
  // Remove IPv6 prefix if present
  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  
  return ip;
}

exports.logAction = (action) => {
  return async (req, res, next) => {
    try {
      const originalJson = res.json.bind(res);
      
      res.json = function(data) {
        // Only log successful actions
        if (data.success !== false && req.user) {
          AuditLog.create({
            action,
            performedBy: req.user._id,
            targetUser: req.params.userId || req.body.userId || null,
            details: {
              method: req.method,
              path: req.path,
              body: req.body,
              params: req.params
            },
            ipAddress: getClientIP(req),
            userAgent: req.get('user-agent')
          }).catch(err => console.error('Audit log error:', err));
        }
        
        return originalJson(data);
      };
      
      next();
    } catch (error) {
      next();
    }
  };
};
