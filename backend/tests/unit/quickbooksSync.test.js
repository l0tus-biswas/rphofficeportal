/**
 * Unit Tests: utils/quickbooksSync.js
 *
 * Covers the core business rule: agents are only ever synced to QuickBooks
 * (as 1099 contractors, never W-2 employees) once they are licensed, and no
 * SSN/banking data is ever sent to QBO.
 */

describe('Utils: quickbooksSync.js', () => {
  let quickbooksSync;
  let mockUser;
  let mockAPAApplication;
  let mockAuditLog;
  let mockQbo;
  let mockIsAgentLicensedById;

  const AGENT_ID = 'agent-1';
  const agentDoc = {
    _id: AGENT_ID,
    role: 'agent',
    name: 'Jane Doe',
    email: 'jane@test.com',
    phone: '555-0100',
    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62704' }
  };

  beforeEach(() => {
    jest.resetModules();

    mockUser = {
      findById: jest.fn().mockImplementation(() => ({ lean: jest.fn().mockResolvedValue(agentDoc) })),
      findByIdAndUpdate: jest.fn().mockResolvedValue({})
    };
    jest.doMock('../../models/User', () => mockUser);

    mockAPAApplication = {
      findOne: jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      }))
    };
    jest.doMock('../../models/APAApplication', () => mockAPAApplication);

    mockAuditLog = { create: jest.fn().mockResolvedValue({}) };
    jest.doMock('../../models/AuditLog', () => mockAuditLog);

    mockQbo = {
      getConnectionStatus: jest.fn().mockResolvedValue({ connected: true }),
      findVendorByDisplayName: jest.fn().mockResolvedValue(null),
      createVendor: jest.fn().mockResolvedValue({
        Id: 'qbo-vendor-1',
        DisplayName: 'Jane Doe',
        PrimaryEmailAddr: { Address: 'jane@test.com' }
      })
    };
    jest.doMock('../../utils/quickbooks', () => mockQbo);

    mockIsAgentLicensedById = jest.fn().mockResolvedValue(true);
    jest.doMock('../../utils/licensing', () => ({ isAgentLicensedById: mockIsAgentLicensedById }));

    quickbooksSync = require('../../utils/quickbooksSync');
  });

  it('returns not_found for a missing or non-agent user', async () => {
    mockUser.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });
    const result = await quickbooksSync.syncAgentToQBO(AGENT_ID);
    expect(result.status).toBe('not_found');
    expect(mockQbo.createVendor).not.toHaveBeenCalled();
  });

  it('skips unlicensed agents by default — the core rule', async () => {
    mockIsAgentLicensedById.mockResolvedValueOnce(false);
    const result = await quickbooksSync.syncAgentToQBO(AGENT_ID);
    expect(result.status).toBe('skipped_unlicensed');
    expect(mockQbo.createVendor).not.toHaveBeenCalled();
    expect(mockQbo.getConnectionStatus).not.toHaveBeenCalled();
  });

  it('skips the licensing check only when requireLicensed:false is explicitly passed', async () => {
    mockIsAgentLicensedById.mockResolvedValueOnce(false);
    const result = await quickbooksSync.syncAgentToQBO(AGENT_ID, null, { requireLicensed: false });
    expect(mockIsAgentLicensedById).not.toHaveBeenCalled();
    expect(result.status).toBe('created');
  });

  it('skips sync when QuickBooks is not connected', async () => {
    mockQbo.getConnectionStatus.mockResolvedValueOnce({ connected: false });
    const result = await quickbooksSync.syncAgentToQBO(AGENT_ID);
    expect(result.status).toBe('skipped_not_connected');
    expect(mockQbo.createVendor).not.toHaveBeenCalled();
  });

  it('links to an existing QBO vendor by display name instead of creating a duplicate', async () => {
    mockQbo.findVendorByDisplayName.mockResolvedValueOnce({ Id: 'existing-vendor-9', DisplayName: 'Jane Doe' });
    const result = await quickbooksSync.syncAgentToQBO(AGENT_ID, 'admin-1');

    expect(result.status).toBe('already_exists');
    expect(result.qboVendorId).toBe('existing-vendor-9');
    expect(result.nextStep).toMatch(/invite/i);
    expect(mockQbo.createVendor).not.toHaveBeenCalled();
    expect(mockUser.findByIdAndUpdate).toHaveBeenCalledWith(AGENT_ID, expect.objectContaining({ qboVendorId: 'existing-vendor-9' }));
  });

  it('creates a new contractor (Vendor) when licensed, connected, and not already synced', async () => {
    const result = await quickbooksSync.syncAgentToQBO(AGENT_ID, 'admin-1');

    expect(result.status).toBe('created');
    expect(result.qboVendorId).toBe('qbo-vendor-1');
    expect(result.nextStep).toMatch(/W-9/);

    // The vendor payload must never include SSN or banking info.
    const vendorArg = mockQbo.createVendor.mock.calls[0][0];
    expect(vendorArg.ssn).toBeUndefined();
    expect(vendorArg.bankInfo).toBeUndefined();
    expect(vendorArg.email).toBe('jane@test.com');

    expect(mockUser.findByIdAndUpdate).toHaveBeenCalledWith(AGENT_ID, expect.objectContaining({ qboVendorId: 'qbo-vendor-1', qboSyncError: null }));
    expect(mockAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'QBO_CONTRACTOR_SYNCED' }));
  });

  it('persists the error message on the agent record when QBO rejects the create, then rethrows', async () => {
    mockQbo.createVendor.mockRejectedValueOnce(new Error("QuickBooks API error: The name supplied already exists. : Id=400000001"));

    await expect(quickbooksSync.syncAgentToQBO(AGENT_ID, 'admin-1')).rejects.toThrow('name supplied already exists');

    expect(mockUser.findByIdAndUpdate).toHaveBeenCalledWith(AGENT_ID, expect.objectContaining({
      qboSyncError: expect.stringContaining('name supplied already exists')
    }));
    // Must not report success anywhere the error path could be confused with a real sync.
    expect(mockUser.findByIdAndUpdate).not.toHaveBeenCalledWith(AGENT_ID, expect.objectContaining({ qboVendorId: expect.any(String) }));
  });

  describe('buildVendorData', () => {
    it('prefers legal name from the APA application over the account display name', () => {
      const apa = { personalInfo: { legalFirstName: 'Janet', legalMiddleName: 'Q', legalLastName: 'Doeherty', mobilePhone: '555-9999' } };
      const vendorData = quickbooksSync.buildVendorData(agentDoc, apa);
      expect(vendorData).toMatchObject({ givenName: 'Janet', middleName: 'Q', familyName: 'Doeherty', phone: '555-9999' });
      expect(vendorData.ssn).toBeUndefined();
    });

    it('falls back to splitting the account name when no APA data exists', () => {
      const vendorData = quickbooksSync.buildVendorData(agentDoc, null);
      expect(vendorData).toMatchObject({ givenName: 'Jane', familyName: 'Doe', email: 'jane@test.com' });
      expect(vendorData.address).toMatchObject({ line1: '123 Main St', city: 'Springfield', state: 'IL', zip: '62704' });
    });
  });
});
