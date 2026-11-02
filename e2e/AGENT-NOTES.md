# Running the e2e suite on a private backend (for parallel work)

Each worker uses its OWN port and database name on the shared throwaway Mongo (docker `rph-e2e-mongo`, :27018):

    SUFFIX=a PORT_N=5101                      # pick your own pair, never reuse another worker's
    export DB=mongodb://localhost:27018/rph_e2e_$SUFFIX
    MONGODB_URI=$DB node e2e/seed.js          # drops + reseeds ONLY your database
    cd backend && (source ../e2e/safe-env.sh; export MONGODB_URI=$DB PORT=$PORT_N; nohup node server.js > ../e2e/.backend-$SUFFIX.log 2>&1 &)
    E2E_API=http://localhost:$PORT_N/api npx playwright test -c e2e/playwright.config.ts e2e/<your-spec>.spec.ts

Restart your backend after every backend code change (it does not hot-reload):
kill only the PID listening on YOUR port (`netstat -ano | grep ":$PORT_N .*LISTENING"`), reseed, start again.
safe-env.sh blanks/dummies every provider credential (Stripe, Zoho, QuickBooks, ExamFX, email), so nothing real is reachable.
