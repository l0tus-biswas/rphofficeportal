export const environment = {
  production: true,
  apiUrl: 'https://rhpoffice.com/api',
  baseUrl: 'https://rhpoffice.com',
  appUrl: 'https://rhpoffice.com',
  // Stripe publishable key is served at runtime from the backend .env
  // (GET /api/public/stripe-key). This is only a fallback if that fetch fails.
  stripePublishableKey: ''
};
