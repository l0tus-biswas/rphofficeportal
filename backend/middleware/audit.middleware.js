const AuditLog = require('../models/AuditLog');

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
            ipAddress: req.ip || req.connection.remoteAddress,
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
