// Calls every route as anon / agent / admin against the LOCAL backend and prints anomalies.
// Usage: node e2e/sweep.js   (backend on :5000 started via e2e/safe-env.sh; re-seed afterwards)
const routes = require('./routes.json');
const { USERS } = require('./helpers/users');
const API = 'http://localhost:5000';
const FAKE = '000000000000000000000000';

const login = async (k) =>
  (await (await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: USERS[k].email, password: USERS[k].password }) })).json()).token;

const SKIP = (r) => r.path === '*' || r.path.startsWith('/health');

async function call(r, path, token, body) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const init = { method: r.method, headers };
  if (!['GET', 'HEAD', 'DELETE'].includes(r.method)) init.body = JSON.stringify(body ?? {});
  try {
    const res = await fetch(API + path, { ...init, signal: AbortSignal.timeout(15000) });
    return res.status;
  } catch (e) {
    return e.name === 'TimeoutError' ? 'TIMEOUT' : 'ERR';
  }
}

(async () => {
  const [agent, admin] = [await login('agent'), await login('admin')];
  const rows = [];
  for (const r of routes) {
    if (SKIP(r)) continue;
    const real = r.path.replace(/:[A-Za-z]+/g, FAKE).replace(/\/\//g, '/');
    const bad = r.path.replace(/:[A-Za-z]+/g, 'not-an-id').replace(/\/\//g, '/');
    const hasParam = /:[A-Za-z]+/.test(r.path);
    rows.push({
      m: r.method, p: r.path,
      anon: await call(r, real, null),
      agent: await call(r, real, agent),
      admin: await call(r, real, admin),
      badId: hasParam ? await call(r, bad, admin) : null
    });
  }
  console.log('@@SWEEP@@' + JSON.stringify(rows));
})();
