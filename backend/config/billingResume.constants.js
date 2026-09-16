// Shared timing/retry config for the "resume billing after Free Access ends"
// flow. Used by routes/admin.routes.js (schedules the first attempt) and
// jobs/resumeBilling.job.js (executes attempts/retries). Confirmed with the
// client: 3-day initial notice, then up to 3 retries every 2 days.
module.exports = {
  RESUME_GRACE_PERIOD_DAYS: 3,
  RESUME_RETRY_INTERVAL_DAYS: 2,
  // 1 initial attempt + 3 retries
  RESUME_MAX_ATTEMPTS: 4
};
