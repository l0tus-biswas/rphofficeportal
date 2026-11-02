/**
 * Unit Tests: utils/helpers.getDownlineIds
 * Cycle-safe, de-duplicated, excludes deleted/inactive/admin members from the
 * result while still traversing through them.
 */
jest.mock('../../models/User', () => require('../helpers/mock-model')('User'));

const User = require('../../models/User');
const { getDownlineIds } = require('../../utils/helpers');

/** nodes: { id: { children?, role?, isActive?, deletedAt? } } */
function mockTree(nodes) {
  User.findById.mockImplementation((id) => ({
    select: () => ({ lean: () => Promise.resolve(nodes[id] || null) })
  }));
}

beforeEach(() => jest.resetAllMocks());

describe('helpers.getDownlineIds', () => {
  it('returns active agents breadth-first, excluding the root', async () => {
    mockTree({
      root: { children: ['a', 'b'], role: 'agent' },
      a: { children: ['c'], role: 'agent', isActive: true },
      b: { children: [], role: 'agent', isActive: true },
      c: { children: [], role: 'agent', isActive: true }
    });
    expect(await getDownlineIds('root')).toEqual(['a', 'b', 'c']);
  });

  it('excludes soft-deleted, inactive and admin members', async () => {
    mockTree({
      root: { children: ['del', 'off', 'adm', 'ok'] },
      del: { children: [], role: 'agent', isActive: true, deletedAt: new Date() },
      off: { children: [], role: 'agent', isActive: false },
      adm: { children: [], role: 'admin', isActive: true },
      ok: { children: [], role: 'agent', isActive: true }
    });
    expect(await getDownlineIds('root')).toEqual(['ok']);
  });

  it('still traverses through excluded members to reach active descendants', async () => {
    mockTree({
      root: { children: ['off', 'del', 'adm'] },
      off: { children: ['x'], role: 'agent', isActive: false },
      del: { children: ['y'], role: 'agent', deletedAt: new Date() },
      adm: { children: ['z'], role: 'admin' },
      x: { children: [], role: 'agent', isActive: true },
      y: { children: [], role: 'agent', isActive: true },
      z: { children: [], role: 'agent', isActive: true }
    });
    expect((await getDownlineIds('root')).sort()).toEqual(['x', 'y', 'z']);
  });

  it('terminates on a cycle in children[] and never returns the root', async () => {
    mockTree({
      root: { children: ['a'], role: 'agent' },
      a: { children: ['b'], role: 'agent', isActive: true },
      b: { children: ['a', 'root'], role: 'agent', isActive: true }
    });
    expect(await getDownlineIds('root')).toEqual(['a', 'b']);
  });

  it('counts a node with two parents only once', async () => {
    mockTree({
      root: { children: ['a', 'b'], role: 'agent' },
      a: { children: ['shared'], role: 'agent', isActive: true },
      b: { children: ['shared'], role: 'agent', isActive: true },
      shared: { children: [], role: 'agent', isActive: true }
    });
    const result = await getDownlineIds('root');
    expect(result.filter(id => id === 'shared')).toHaveLength(1);
    expect(result.sort()).toEqual(['a', 'b', 'shared']);
  });

  it('includeInactive option returns inactive agents but still not deleted/admin', async () => {
    mockTree({
      root: { children: ['off', 'del', 'adm'] },
      off: { children: [], role: 'agent', isActive: false },
      del: { children: [], role: 'agent', deletedAt: new Date() },
      adm: { children: [], role: 'admin' }
    });
    expect(await getDownlineIds('root', { includeInactive: true })).toEqual(['off']);
  });

  it('returns [] for a missing user', async () => {
    mockTree({});
    expect(await getDownlineIds('ghost')).toEqual([]);
  });
});
