#!/usr/bin/env bash
# Rebuilds e2e/routes.json from the running app definition (no server needed, safe env).
cd "$(dirname "$0")/.." && source e2e/safe-env.sh && node e2e/dump-routes.js 2>/dev/null | grep @@ROUTES@@ | sed "s/^@@ROUTES@@//" > e2e/routes.json
