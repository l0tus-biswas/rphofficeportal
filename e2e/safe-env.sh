# Environment for the LOCAL e2e backend. Overrides .env (dotenv never overrides existing vars)
# so no test can reach a real provider: Stripe, Zoho, QuickBooks, DocuSign, ExamFX, email.
export MONGODB_URI="mongodb://localhost:27018/rph_e2e"
export NODE_ENV=development PORT=5000
export STRIPE_SECRET_KEY="sk_test_local_dummy_not_real" STRIPE_PUBLISHABLE_KEY="pk_test_dummy" STRIPE_WEBHOOK_SECRET="whsec_local_dummy"
export STRIPE_MONTHLY_PRICE_ID="price_dummy" STRIPE_ONE_TIME_PRICE="" STRIPE_MONTHLY_SUBSCRIPTION_PRICE=""
export ZOHO_CLIENT_ID="" ZOHO_CLIENT_SECRET="" ZOHO_REFRESH_TOKEN="" ZOHO_SIGN_WEBHOOK_SECRET="local-dummy"
export QBO_CLIENT_ID="" QBO_CLIENT_SECRET="" EXAMFX_API_KEY="" EXAMFX_API_SECRET="" EXAMFX_WEBHOOK_SECRET="local-dummy"
export NEUZMAIL_API_TOKEN="" SMTP_HOST="" SMTP_USER="" SMTP_PASSWORD=""
export DOCUSIGN_INTEGRATION_KEY="" DOCUSIGN_ACCOUNT_ID="" DOCUSIGN_USER_ID=""
