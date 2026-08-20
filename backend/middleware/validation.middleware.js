const Joi = require('joi');

exports.validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    next();
  };
};

// Common validation schemas
exports.schemas = {
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),
  
  applyForm: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().trim().min(10).max(15).required(),
    address: Joi.string().trim().max(200).optional(),
    city: Joi.string().trim().max(50).optional(),
    state: Joi.string().trim().max(50).optional(),
    zipCode: Joi.string().trim().max(10).optional(),
    metadata: Joi.object().optional()
  }),
  
  updateProfile: Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    phone: Joi.string().trim().min(10).max(15).optional(),
    address: Joi.string().trim().max(200).optional(),
    city: Joi.string().trim().max(50).optional(),
    state: Joi.string().trim().max(50).optional(),
    zipCode: Joi.string().trim().max(10).optional(),
    dateOfBirth: Joi.date().optional(),
    timezone: Joi.string().trim().max(50).optional().allow('', null)
  }),
  
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required()
  }),
  
  forgotPassword: Joi.object({
    email: Joi.string().email().required()
  }),
  
  resetPassword: Joi.object({
    password: Joi.string().min(6).required()
  }),
  
  createUser: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().trim().min(10).max(15).required(),
    role: Joi.string().valid('admin', 'agent').required(),
    password: Joi.string().min(6).optional()
  }),
  
  updateUser: Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    phone: Joi.string().trim().min(10).max(15).optional(),
    role: Joi.string().valid('admin', 'agent').optional(),
    isActive: Joi.boolean().optional(),
    address: Joi.string().trim().max(200).optional().allow('', null),
    city: Joi.string().trim().max(50).optional().allow('', null),
    state: Joi.string().trim().max(50).optional().allow('', null)
  }),
  
  trainingMaterial: Joi.object({
    title: Joi.string().trim().min(2).max(200).required(),
    description: Joi.string().trim().max(1000).optional(),
    type: Joi.string().valid('link', 'youtube', 'loom', 'document', 'video', 'article', 'other').required(),
    url: Joi.string().uri().optional().allow(''),
    category: Joi.string().trim().max(50).optional(),
    folder: Joi.string().hex().length(24).optional().allow(null, ''),
    tags: Joi.array().items(Joi.string()).optional(),
    duration: Joi.string().trim().max(50).optional().allow(''),
    accessLevel: Joi.string().valid('all', 'agent', 'recruit').optional(),
    thumbnail: Joi.string().uri().optional(),
    order: Joi.number().integer().min(0).optional()
  }),

  updateTrainingMaterial: Joi.object({
    title: Joi.string().trim().min(2).max(200).optional(),
    description: Joi.string().trim().max(1000).optional(),
    type: Joi.string().valid('link', 'youtube', 'loom', 'document', 'video', 'article', 'other').optional(),
    url: Joi.string().uri().optional().allow(''),
    category: Joi.string().trim().max(50).optional(),
    folder: Joi.string().hex().length(24).optional().allow(null, ''),
    tags: Joi.array().items(Joi.string()).optional(),
    duration: Joi.string().trim().max(50).optional().allow(''),
    accessLevel: Joi.string().valid('all', 'agent', 'recruit').optional(),
    thumbnail: Joi.string().uri().optional(),
    order: Joi.number().integer().min(0).optional()
  }),

  coupon: Joi.object({
    code: Joi.string().trim().min(3).max(20).uppercase().required(),
    description: Joi.string().trim().min(5).max(500).required(),
    discountType: Joi.string().valid('percentage', 'fixed').required(),
    discountValue: Joi.number().min(0).required(),
    minPurchaseAmount: Joi.number().min(0).optional().default(0),
    maxDiscountAmount: Joi.number().min(0).optional().allow(null),
    validFrom: Joi.date().required(),
    validUntil: Joi.date().greater(Joi.ref('validFrom')).required(),
    usageLimit: Joi.number().min(0).optional().allow(null),
    userUsageLimit: Joi.number().min(1).optional().default(1),
    applicableRoles: Joi.array().items(Joi.string().valid('admin', 'agent')).optional(),
    isActive: Joi.boolean().optional().default(true)
  }),

  updateCoupon: Joi.object({
    code: Joi.string().trim().min(3).max(20).uppercase().optional(),
    description: Joi.string().trim().min(5).max(500).optional(),
    discountType: Joi.string().valid('percentage', 'fixed').optional(),
    discountValue: Joi.number().min(0).optional(),
    minPurchaseAmount: Joi.number().min(0).optional(),
    maxDiscountAmount: Joi.number().min(0).optional().allow(null),
    validFrom: Joi.date().optional(),
    validUntil: Joi.date().optional(),
    usageLimit: Joi.number().min(0).optional().allow(null),
    userUsageLimit: Joi.number().min(1).optional(),
    applicableRoles: Joi.array().items(Joi.string().valid('admin', 'agent')).optional(),
    isActive: Joi.boolean().optional()
  }),

  productionSubmission: Joi.object({
    submissionDate: Joi.date().optional(),
    clientName: Joi.string().trim().min(1).max(500).required(),
    numberOfMembers: Joi.number().integer().min(0).optional().allow(null),
    productSold: Joi.string().trim().min(1).max(200).required(),
    productOtherDescription: Joi.string().trim().max(500).optional().allow('', null),
    productCategory: Joi.string().trim().max(100).optional(),
    carrier: Joi.string().hex().length(24).required(),
    premiumAmount: Joi.number().min(0).required(),
    notes: Joi.string().trim().max(2000).optional().allow('', null),
    status: Joi.string().valid('Submitted', 'Pending', 'In Force', 'Lapsed', 'Cancelled', 'Lost').optional(),
    isTrainingPeriod: Joi.boolean().optional(),
    customFields: Joi.object().optional(),
    inForceDate: Joi.date().optional().allow(null),
    priority: Joi.string().valid('Low', 'Medium', 'High', 'Urgent').optional().allow(null)
  })
};
