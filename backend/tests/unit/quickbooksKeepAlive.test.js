/**
 * Unit Tests: QuickBooks token rotation, invalid_grant handling and the
 * keep-alive job.
 */

describe('QuickBooks token lifecycle', () => {
  let qbo;
  let keepAlive;
  let store;
  let oauth;
  let notify;

  const DAY = 24 * 60 * 60 * 1000;

  function seedTokens(overrides = {}) {
    store.qbo_tokens = JSON.stringify({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      realmId: 'realm-1',
      expires_at: Date.now() - 1000, // access token expired
      refresh_expires_at: Date.now() + 50 * DAY,
      ...overrides
    });
  }

  beforeEach(() => {
    jest.resetModules();
    store = {};

    jest.doMock('../../models/SystemConfig', () => ({
      findOne: jest.fn(async ({ key }) => (store[key] ? { key, value: store[key] } : null)),
      findOneAndUpdate: jest.fn(async ({ key }, update) => { store[key] = update.value; return {}; }),
      deleteOne: jest.fn(async ({ key }) => { delete store[key]; return {}; })
    }));

    oauth = {
      setToken: jest.fn(),
      refresh: jest.fn().mockResolvedValue({
        getJson: () => ({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 })
      })
    };
    jest.doMock('intuit-oauth', () => jest.fn().mockImplementation(() => oauth));

    notify = jest.fn().mockResolvedValue({});
    jest.doMock('../../models/Notification', () => ({ createNotification: notify }));
    jest.doMock('../../models/User', () => ({
      find: () => ({ select: () => ({ lean: async () => [{ _id: 'admin-1' }] }) })
    }));
    jest.doMock('../../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

    qbo = require('../../utils/quickbooks');
    keepAlive = require('../../jobs/qboTokenKeepAlive.job');
  });

  test('persists the rotated refresh token and resets the 100-day window', async () => {
    seedTokens();
    const tokens = await qbo.getValidToken();
    expect(tokens.refresh_token).toBe('new-refresh');
    const saved = JSON.parse(store.qbo_tokens);
    expect(saved.refresh_token).toBe('new-refresh');
    expect(saved.refresh_expires_at).toBeGreaterThan(Date.now() + 99 * DAY);
  });

  test('invalid_grant clears tokens, flags disconnected and notifies admins', async () => {
    seedTokens();
    oauth.refresh.mockRejectedValue(Object.assign(new Error('invalid_grant'), { error: 'invalid_grant' }));

    await expect(qbo.getValidToken()).rejects.toThrow(/invalid_grant/);

    expect(store.qbo_tokens).toBeUndefined();
    expect(JSON.parse(store.qbo_disconnect_state).reason).toBe('invalid_grant');
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'qbo_disconnected' }), true);

    const status = await qbo.getConnectionStatus();
    expect(status).toMatchObject({ connected: false, disconnected: true, disconnectReason: 'invalid_grant' });
  });

  test('transient refresh failure keeps tokens and does not flag disconnected', async () => {
    seedTokens();
    oauth.refresh.mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(qbo.getValidToken()).rejects.toThrow(/refresh failed/);

    expect(store.qbo_tokens).toBeDefined();
    expect(store.qbo_disconnect_state).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  test('concurrent callers share one refresh (rotation-safe)', async () => {
    seedTokens();
    await Promise.all([qbo.getValidToken(), qbo.getValidToken(), qbo.getValidToken()]);
    expect(oauth.refresh).toHaveBeenCalledTimes(1);
  });

  test('reconnecting clears the disconnect warning', async () => {
    store.qbo_disconnect_state = JSON.stringify({ reason: 'invalid_grant', at: new Date().toISOString() });
    await qbo.saveTokens({ access_token: 'a', refresh_token: 'r', realmId: 'realm-1', expires_in: 3600 });
    expect(store.qbo_disconnect_state).toBeUndefined();
  });

  describe('keep-alive job', () => {
    test('does nothing when not connected', async () => {
      expect(await keepAlive.keepQboTokenAlive()).toEqual({ status: 'not_connected' });
      expect(oauth.refresh).not.toHaveBeenCalled();
    });

    test('skips a recently refreshed token', async () => {
      seedTokens({ expires_at: Date.now() + 3600000, refresh_expires_at: Date.now() + 98 * DAY });
      expect((await keepAlive.keepQboTokenAlive()).status).toBe('fresh');
      expect(oauth.refresh).not.toHaveBeenCalled();
    });

    test('force-refreshes a token idle for more than 7 days even if the access token is still valid', async () => {
      seedTokens({ expires_at: Date.now() + 3600000, refresh_expires_at: Date.now() + 80 * DAY });
      expect((await keepAlive.keepQboTokenAlive()).status).toBe('refreshed');
      expect(oauth.refresh).toHaveBeenCalledTimes(1);
      expect(JSON.parse(store.qbo_tokens).refresh_token).toBe('new-refresh');
    });
  });
});
