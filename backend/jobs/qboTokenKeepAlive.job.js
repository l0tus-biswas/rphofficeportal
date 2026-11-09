/**
 * Keeps the QuickBooks Online connection alive.
 *
 * Intuit refresh tokens expire ~100 days after their last use. The portal only
 * refreshes lazily when an API call happens, so a quiet period (no contractor
 * syncs) lets the token lapse and the connection silently dies. This job
 * force-refreshes the token whenever it hasn't been refreshed for
 * REFRESH_AFTER_DAYS, so the 100-day window keeps sliding forward.
 *
 * Checked daily; refreshes at most about once a week. If Intuit rejects the
 * token (invalid_grant), refreshTokens() flags the connection as disconnected
 * and notifies admins.
 */
const qbo = require('../utils/quickbooks');
const logger = require('../utils/logger');

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const REFRESH_AFTER_DAYS = 7;
const REFRESH_TOKEN_LIFETIME_DAYS = 100; // matches saveTokens() in utils/quickbooks.js
const DAY_MS = 24 * 60 * 60 * 1000;

async function keepQboTokenAlive({ now = Date.now() } = {}) {
  const tokens = await qbo.loadTokens();
  if (!tokens) return { status: 'not_connected' };

  // refresh_expires_at = last refresh + 100 days, so age = lifetime - remaining
  const remainingMs = (tokens.refresh_expires_at || 0) - now;
  const ageDays = REFRESH_TOKEN_LIFETIME_DAYS - remainingMs / DAY_MS;

  if (tokens.refresh_expires_at && ageDays < REFRESH_AFTER_DAYS) {
    return { status: 'fresh', ageDays };
  }

  try {
    await qbo.refreshTokens({ force: true });
    logger.info('QBO keep-alive: token refreshed');
    return { status: 'refreshed' };
  } catch (err) {
    logger.error('QBO keep-alive: refresh failed', { message: err.message });
    return { status: 'failed', error: err.message };
  }
}

let intervalHandle = null;

function startQboTokenKeepAliveJob() {
  if (intervalHandle) return intervalHandle;
  // Run once shortly after boot (covers long downtime), then daily.
  const bootTimer = setTimeout(() => {
    keepQboTokenAlive().catch(err =>
      logger.error('QBO keep-alive: unhandled error', { message: err.message }));
  }, 60 * 1000);
  bootTimer.unref?.();

  intervalHandle = setInterval(() => {
    keepQboTokenAlive().catch(err =>
      logger.error('QBO keep-alive: unhandled error', { message: err.message }));
  }, CHECK_INTERVAL_MS);
  intervalHandle.unref?.();
  return intervalHandle;
}

function stopQboTokenKeepAliveJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startQboTokenKeepAliveJob, stopQboTokenKeepAliveJob, keepQboTokenAlive };
