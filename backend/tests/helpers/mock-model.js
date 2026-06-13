/**
 * Creates a mock Mongoose model with all common static and instance methods.
 * Returns a chainable mock that supports find().sort().limit().lean() etc.
 */
module.exports = function createMockModel(name) {
  function createChain(defaultValue) {
    const chain = {};
    const methods = ['sort', 'limit', 'skip', 'select', 'populate', 'lean', 'collation', 'where', 'equals', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'or', 'and', 'nor', 'regex', 'slice', 'maxTimeMS', 'batchSize', 'cursor', 'hint', 'comment', 'snapshot', 'setOptions'];
    methods.forEach(m => { chain[m] = jest.fn().mockReturnValue(chain); });
    chain.exec = jest.fn().mockResolvedValue(defaultValue);
    chain.then = function(resolve, reject) { return chain.exec().then(resolve, reject); };
    chain.catch = function(reject) { return chain.exec().catch(reject); };
    return chain;
  }

  const mockModel = jest.fn().mockImplementation((data) => ({
    ...data,
    _id: data?._id || 'mock-id',
    save: jest.fn().mockResolvedValue(data || {}),
    toJSON: jest.fn().mockReturnValue(data || {}),
    toObject: jest.fn().mockReturnValue(data || {}),
    populate: jest.fn().mockResolvedValue(data || {}),
  }));

  // Query methods returning chainable
  mockModel.find = jest.fn().mockReturnValue(createChain([]));
  mockModel.findOne = jest.fn().mockReturnValue(createChain(null));
  mockModel.findById = jest.fn().mockReturnValue(createChain(null));
  mockModel.findByIdAndUpdate = jest.fn().mockReturnValue(createChain(null));
  mockModel.findByIdAndDelete = jest.fn().mockReturnValue(createChain(null));
  mockModel.findOneAndUpdate = jest.fn().mockReturnValue(createChain(null));
  mockModel.findOneAndDelete = jest.fn().mockReturnValue(createChain(null));

  // Direct methods
  mockModel.create = jest.fn().mockResolvedValue({});
  mockModel.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
  mockModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
  mockModel.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  mockModel.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
  mockModel.countDocuments = jest.fn().mockReturnValue(createChain(0));
  mockModel.aggregate = jest.fn().mockReturnValue(createChain([]));
  mockModel.distinct = jest.fn().mockResolvedValue([]);
  mockModel.insertMany = jest.fn().mockResolvedValue([]);
  mockModel.bulkWrite = jest.fn().mockResolvedValue({});
  mockModel.exists = jest.fn().mockResolvedValue(null);
  mockModel.watch = jest.fn().mockReturnValue({ on: jest.fn(), close: jest.fn() });

  // Static utility methods
  mockModel.init = jest.fn().mockResolvedValue(true);
  mockModel.ensureIndexes = jest.fn().mockResolvedValue(true);
  mockModel.createIndexes = jest.fn().mockResolvedValue(true);

  // Notification-specific statics
  mockModel.createNotification = jest.fn().mockResolvedValue({});

  // Schema and metadata
  mockModel.schema = { path: jest.fn(), paths: {}, obj: {} };
  mockModel.collection = { name: name || 'mock', collectionName: name || 'mock' };
  mockModel.modelName = name || 'MockModel';
  mockModel.db = { name: 'test' };
  mockModel.prototype.save = jest.fn().mockResolvedValue({});
  mockModel.prototype.remove = jest.fn().mockResolvedValue({});

  return mockModel;
};
