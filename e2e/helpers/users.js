// Local-only throwaway credentials for the disposable e2e database. Never reuse these elsewhere.
const PASSWORD = 'E2e-Local-Pass-1!';

const USERS = {
  admin:   { name: 'E2E Admin',      email: 'e2e-admin@example.com',   phone: '5550000001', role: 'admin', password: PASSWORD },
  agent:   { name: 'Lotus Test',     email: 'lotushotmail111@gmail.com', phone: '5550000002', role: 'agent', password: PASSWORD, parent: 'admin' },
  child:   { name: 'E2E Downline',   email: 'e2e-child@example.com',   phone: '5550000003', role: 'agent', password: PASSWORD, parent: 'agent' },
  other:   { name: 'E2E Other Team', email: 'e2e-other@example.com',   phone: '5550000004', role: 'agent', password: PASSWORD, parent: 'admin' },
  inactive:{ name: 'E2E Inactive',   email: 'e2e-inactive@example.com', phone: '5550000005', role: 'agent', password: PASSWORD, isActive: false }
};

module.exports = { USERS, PASSWORD };
