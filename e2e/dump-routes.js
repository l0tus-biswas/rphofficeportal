// Prints every Express route with its middleware names, read from the app itself.
// Usage: (source e2e/safe-env.sh; node e2e/dump-routes.js > e2e/routes.json)
const path = require('path');
const { app } = require(path.join(__dirname, '../backend/server.js'));

// Express 4 stores a mount path only as a regexp such as ^\/api\/admin\/?(?=\/|$)
function mountPath(layer) {
  if (layer.regexp.fast_slash) return '';
  let s = layer.regexp.source;
  s = s.replace(/^\^/, '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
  return s.replace('(?:([^/]+?))', ':p');
}

const out = [];
const walk = (stack, prefix) => {
  for (const l of stack) {
    if (l.route) {
      const mw = l.route.stack.map((s) => s.name || (s.handle && s.handle.name) || '');
      for (const m of Object.keys(l.route.methods)) out.push({ method: m.toUpperCase(), path: prefix + l.route.path, mw });
    } else if (l.name === 'router' && l.handle.stack) {
      walk(l.handle.stack, prefix + mountPath(l));
    }
  }
};
walk(app._router.stack, '');
process.stdout.write('\n@@ROUTES@@' + JSON.stringify(out) + '\n');
process.exit(0);
