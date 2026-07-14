/**
 * Unit Tests: utils/quickbooks.js
 *
 * Agents are synced to QuickBooks as 1099 contractors (Vendor records with
 * Vendor1099=true), not W-2 employees — these tests cover the Vendor
 * operations plus OAuth token persistence/refresh.
 */

describe('Utils: quickbooks.js', () => {
  let quickbooks;
  let mockAxios;
  let mockOAuthClient;
  let mockSystemConfig;

  beforeEach(() => {
    jest.resetModules();

    mockOAuthClient = {
      createToken: jest.fn().mockResolvedValue({
        getJson: jest.fn().mockReturnValue({
          access_token: 'qb-access-token',
          refresh_token: 'qb-refresh-token',
          expires_in: 3600
        })
      }),
      refresh: jest.fn().mockResolvedValue({
        getJson: jest.fn().mockReturnValue({
          access_token: 'qb-refreshed-token',
          refresh_token: 'qb-new-refresh-token',
          expires_in: 3600
        })
      }),
      setToken: jest.fn(),
      authorizeUri: jest.fn().mockReturnValue('https://appcenter.intuit.com/connect/oauth2?client_id=test'),
      revoke: jest.fn().mockResolvedValue({})
    };
    jest.doMock('intuit-oauth', () => {
      const ctor = jest.fn().mockImplementation(() => mockOAuthClient);
      ctor.scopes = { Accounting: 'com.intuit.quickbooks.accounting' };
      return ctor;
    });

    // Real loadTokens() does `await SystemConfig.findOne({key}).value` — no
    // .lean() call — so the mock must resolve findOne directly to a
    // plain-object-shaped document (or null), matching actual usage.
    let storedTokens = {
      key: 'qbo_tokens',
      value: JSON.stringify({
        access_token: 'stored-token',
        refresh_token: 'stored-refresh',
        expires_at: Date.now() + 3600000,
        refresh_expires_at: Date.now() + 8640000000,
        realmId: 'test-realm'
      })
    };
    mockSystemConfig = {
      findOne: jest.fn().mockImplementation(({ key }) => {
        if (key === 'qbo_tokens') return Promise.resolve(storedTokens);
        return Promise.resolve(null);
      }),
      findOneAndUpdate: jest.fn().mockImplementation((query, update) => {
        if (query.key === 'qbo_tokens') storedTokens = { key: 'qbo_tokens', value: update.value };
        return Promise.resolve({});
      }),
      deleteOne: jest.fn().mockImplementation(() => {
        storedTokens = null;
        return Promise.resolve({ deletedCount: 1 });
      })
    };
    jest.doMock('../../models/SystemConfig', () => mockSystemConfig);

    // qboRequest calls `axios(config)` directly (not axios.get/.post) with the
    // HTTP method inside `config.method`.
    mockAxios = jest.fn().mockResolvedValue({ data: {} });
    jest.doMock('axios', () => mockAxios);

    process.env.QBO_CLIENT_ID = 'test-client-id';
    process.env.QBO_CLIENT_SECRET = 'test-client-secret';
    process.env.QBO_REDIRECT_URI = 'http://localhost:5000/api/quickbooks/callback';
    process.env.QBO_ENVIRONMENT = 'sandbox';

    quickbooks = require('../../utils/quickbooks');
  });

  afterEach(() => {
    delete process.env.QBO_CLIENT_ID;
    delete process.env.QBO_CLIENT_SECRET;
    delete process.env.QBO_REDIRECT_URI;
    delete process.env.QBO_ENVIRONMENT;
  });

  describe('module exports', () => {
    it('exposes Vendor operations, not Employee operations', () => {
      expect(typeof quickbooks.createVendor).toBe('function');
      expect(typeof quickbooks.updateVendor).toBe('function');
      expect(typeof quickbooks.findVendorByDisplayName).toBe('function');
      expect(quickbooks.createEmployee).toBeUndefined();
      expect(quickbooks.updateEmployee).toBeUndefined();
      expect(quickbooks.findEmployeeByEmail).toBeUndefined();
    });
  });

  describe('token persistence', () => {
    it('loadTokens parses the stored token JSON', async () => {
      const tokens = await quickbooks.loadTokens();
      expect(tokens).toMatchObject({ access_token: 'stored-token', realmId: 'test-realm' });
    });

    it('loadTokens returns null when nothing is stored', async () => {
      mockSystemConfig.findOne.mockResolvedValueOnce(null);
      const tokens = await quickbooks.loadTokens();
      expect(tokens).toBeNull();
    });

    it('saveTokens persists via findOneAndUpdate under the qbo_tokens key', async () => {
      await quickbooks.saveTokens({ access_token: 'a', refresh_token: 'b', realmId: 'r1', expires_in: 3600 });
      expect(mockSystemConfig.findOneAndUpdate).toHaveBeenCalledWith(
        { key: 'qbo_tokens' },
        expect.objectContaining({ key: 'qbo_tokens' }),
        expect.any(Object)
      );
    });

    it('clearTokens removes the stored token document', async () => {
      await quickbooks.clearTokens();
      expect(mockSystemConfig.deleteOne).toHaveBeenCalledWith({ key: 'qbo_tokens' });
    });
  });

  describe('getConnectionStatus', () => {
    it('reports connected when valid tokens exist', async () => {
      const status = await quickbooks.getConnectionStatus();
      expect(status.connected).toBe(true);
      expect(status.realmId).toBe('test-realm');
    });

    it('reports not connected when no tokens are stored', async () => {
      mockSystemConfig.findOne.mockResolvedValueOnce(null);
      const status = await quickbooks.getConnectionStatus();
      expect(status).toEqual({ connected: false });
    });
  });

  describe('getOAuthClient', () => {
    it('creates a singleton OAuth client', () => {
      const client1 = quickbooks.getOAuthClient();
      const client2 = quickbooks.getOAuthClient();
      expect(client1).toBe(client2);
    });
  });

  describe('createVendor', () => {
    it('POSTs a Vendor1099=true payload built from name/email/phone/address, with NO SSN', async () => {
      mockAxios.mockResolvedValueOnce({
        data: { Vendor: { Id: '42', DisplayName: 'Jane Q Doe', PrimaryEmailAddr: { Address: 'jane@test.com' } } }
      });

      const result = await quickbooks.createVendor({
        givenName: 'Jane',
        middleName: 'Q',
        familyName: 'Doe',
        email: 'jane@test.com',
        phone: '555-0100',
        address: { line1: '123 Main St', city: 'Springfield', state: 'IL', zip: '62704' }
      });

      expect(result).toEqual({ Id: '42', DisplayName: 'Jane Q Doe', PrimaryEmailAddr: { Address: 'jane@test.com' } });

      const call = mockAxios.mock.calls[0][0];
      expect(call.method).toBe('POST');
      expect(call.url).toContain('/vendor');
      expect(call.data).toMatchObject({
        GivenName: 'Jane',
        FamilyName: 'Doe',
        DisplayName: 'Jane Q Doe',
        Vendor1099: true,
        PrimaryEmailAddr: { Address: 'jane@test.com' },
        BillAddr: { Line1: '123 Main St', City: 'Springfield', CountrySubDivisionCode: 'IL', PostalCode: '62704' }
      });
      expect(call.data.SSN).toBeUndefined();
      expect(call.data.BirthDate).toBeUndefined();
    });
  });

  describe('updateVendor', () => {
    it('fetches the existing vendor for SyncToken, then POSTs the merged update', async () => {
      mockAxios
        .mockResolvedValueOnce({ data: { Vendor: { Id: '42', SyncToken: '3', DisplayName: 'Old Name' } } })
        .mockResolvedValueOnce({ data: { Vendor: { Id: '42', SyncToken: '4', DisplayName: 'Jane Doe' } } });

      const result = await quickbooks.updateVendor('42', { givenName: 'Jane', familyName: 'Doe', email: 'jane@test.com' });

      expect(result.DisplayName).toBe('Jane Doe');
      const getCall = mockAxios.mock.calls[0][0];
      expect(getCall.method).toBe('GET');
      expect(getCall.url).toContain('/vendor/42');

      const postCall = mockAxios.mock.calls[1][0];
      expect(postCall.method).toBe('POST');
      expect(postCall.data).toMatchObject({ Id: '42', SyncToken: '3', Vendor1099: true });
    });
  });

  describe('findVendorByDisplayName', () => {
    it('returns the first matching vendor, querying by DisplayName (not PrimaryEmailAddr, which QBO rejects as non-queryable)', async () => {
      mockAxios.mockResolvedValueOnce({ data: { QueryResponse: { Vendor: [{ Id: '9', DisplayName: 'Existing Vendor' }] } } });
      const result = await quickbooks.findVendorByDisplayName('Existing Vendor');
      expect(result).toEqual({ Id: '9', DisplayName: 'Existing Vendor' });

      const call = mockAxios.mock.calls[0][0];
      expect(call.method).toBe('GET');
      expect(decodeURIComponent(call.url)).toContain('FROM Vendor WHERE DisplayName =');
      expect(decodeURIComponent(call.url)).not.toContain('PrimaryEmailAddr');
    });

    it('returns null when no vendor matches', async () => {
      mockAxios.mockResolvedValueOnce({ data: { QueryResponse: {} } });
      const result = await quickbooks.findVendorByDisplayName('Nobody');
      expect(result).toBeNull();
    });
  });

  describe('getCompanyInfo', () => {
    it('fetches company info for the connected realm', async () => {
      mockAxios.mockResolvedValueOnce({ data: { CompanyInfo: { CompanyName: 'Acme Insurance' } } });
      const info = await quickbooks.getCompanyInfo();
      expect(info.CompanyName).toBe('Acme Insurance');
      expect(mockAxios.mock.calls[0][0].url).toContain('/companyinfo/test-realm');
    });
  });
});
