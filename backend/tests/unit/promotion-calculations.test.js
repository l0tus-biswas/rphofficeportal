/**
 * Unit Tests: Promotion calculation helpers (backend/routes/promotion.routes.js)
 *
 * Covers the new Producer/Builder career-path logic added for the
 * Advanced Income + rank-gated team composition feature:
 *   - sumApprovedIncome (rolling-window income sum, approved-only)
 *   - countDownlineAtOrAboveRank (rank-gated headcount, "at or above")
 *   - evaluateBuilderRankRequirement (OR-across-alternatives team composition)
 *   - evaluateTracks (single source of truth for producer/builder eligibility)
 *
 * All Mongoose models are manually mocked — no real DB connection is made.
 */

jest.mock('../../models/PromotionLevel', () => require('../helpers/mock-model')('PromotionLevel'));
jest.mock('../../models/ProductionSubmission', () => require('../helpers/mock-model')('ProductionSubmission'));
jest.mock('../../models/IncomePaid', () => require('../helpers/mock-model')('IncomePaid'));
jest.mock('../../models/User', () => require('../helpers/mock-model')('User'));
jest.mock('../../models/Notification', () => require('../helpers/mock-model')('Notification'));
jest.mock('../../models/LicensingProgress', () => require('../helpers/mock-model')('LicensingProgress'));

const User = require('../../models/User');
const ProductionSubmission = require('../../models/ProductionSubmission');
const IncomePaid = require('../../models/IncomePaid');
const LicensingProgress = require('../../models/LicensingProgress');

const {
  sumApprovedIncome,
  countDownlineAtOrAboveRank,
  evaluateBuilderRankRequirement,
  evaluateTracks
} = require('../../routes/promotion.routes');

// A small rank ladder matching the real seed's ordering, for readability in tests
const RANK_BY_NAME = new Map([
  ['representative', 1],
  ['broker', 2],
  ['advisor', 3],
  ['senior advisor', 4],
  ['executive advisor', 5],
  ['agency owner', 6],
  ['senior agency owner', 7]
]);

function userSelectLeanChain(result) {
  return { select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(result) }) };
}

/** Wire User.findById (BFS in getDownlineIds) from a simple { id: [childIds] } tree map */
function mockDownlineTree(tree) {
  User.findById.mockImplementation((id) => {
    const children = tree[id] || [];
    return userSelectLeanChain({ children });
  });
}

/** Wire User.find for BOTH getTransferDatesForDownline (transferredAt filter) and
 *  rank lookups (evaluateBuilderRankRequirement / countDownlineAtOrAboveRank),
 *  branching on which filter shape is passed in. */
function mockDownlineLevels(levelsById) {
  User.find.mockImplementation((filter) => {
    if (filter && filter.transferredAt) {
      // No transferred agents in these scenarios
      return userSelectLeanChain([]);
    }
    const ids = (filter?._id?.$in || []).map(String);
    const results = ids
      .filter(id => levelsById[id] !== undefined)
      .map(id => ({ _id: id, level: levelsById[id] }));
    return userSelectLeanChain(results);
  });
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — clearAllMocks leaves queued
  // mockResolvedValueOnce values in place, and sumQualifyingPremium/
  // sumApprovedIncome short-circuit without calling .aggregate() when their
  // id list is empty or a threshold is 0, so an unconsumed queued value from
  // one test would otherwise leak into and corrupt the next test's first call.
  jest.resetAllMocks();
});

describe('sumApprovedIncome', () => {
  it('returns the aggregated total when approved entries exist', async () => {
    IncomePaid.aggregate.mockResolvedValueOnce([{ _id: null, total: 45000 }]);
    const total = await sumApprovedIncome('507f1f77bcf86cd799439011', 180, null);
    expect(total).toBe(45000);
  });

  it('returns 0 when there are no matching entries', async () => {
    IncomePaid.aggregate.mockResolvedValueOnce([]);
    const total = await sumApprovedIncome('507f1f77bcf86cd799439011', 180, null);
    expect(total).toBe(0);
  });

  it('filters by status "approved" only (pending/rejected never counted)', async () => {
    IncomePaid.aggregate.mockResolvedValueOnce([]);
    await sumApprovedIncome('507f1f77bcf86cd799439011', 180, null);
    const pipeline = IncomePaid.aggregate.mock.calls[0][0];
    const matchStage = pipeline.find(stage => stage.$match);
    expect(matchStage.$match.status).toBe('approved');
  });

  it('uses the exact sinceDate as cutoff when provided (promotedAt reset point)', async () => {
    IncomePaid.aggregate.mockResolvedValueOnce([]);
    const promotedAt = new Date('2026-01-15T00:00:00.000Z');
    await sumApprovedIncome('507f1f77bcf86cd799439011', 180, promotedAt);
    const pipeline = IncomePaid.aggregate.mock.calls[0][0];
    const matchStage = pipeline.find(stage => stage.$match);
    expect(matchStage.$match.datePaidByCarrier.$gte.toISOString()).toBe(promotedAt.toISOString());
  });

  it('falls back to "now minus windowDays" when no sinceDate is given', async () => {
    IncomePaid.aggregate.mockResolvedValueOnce([]);
    const before = Date.now();
    await sumApprovedIncome('507f1f77bcf86cd799439011', 30, null);
    const pipeline = IncomePaid.aggregate.mock.calls[0][0];
    const matchStage = pipeline.find(stage => stage.$match);
    const cutoff = matchStage.$match.datePaidByCarrier.$gte.getTime();
    const expected = before - 30 * 24 * 60 * 60 * 1000;
    // Allow a small tolerance for test execution time
    expect(Math.abs(cutoff - expected)).toBeLessThan(5000);
  });
});

describe('countDownlineAtOrAboveRank', () => {
  it('counts members at or above the target rank, excludes members below it', async () => {
    mockDownlineLevels({ u1: 'advisor', u2: 'representative', u3: 'senior advisor' });
    const count = await countDownlineAtOrAboveRank(['u1', 'u2', 'u3'], RANK_BY_NAME.get('advisor'), RANK_BY_NAME);
    // advisor(3) >= 3 -> counts; representative(1) -> excluded; senior advisor(4) >= 3 -> counts
    expect(count).toBe(2);
  });

  it('returns 0 for an empty downline', async () => {
    const count = await countDownlineAtOrAboveRank([], RANK_BY_NAME.get('advisor'), RANK_BY_NAME);
    expect(count).toBe(0);
    expect(User.find).not.toHaveBeenCalled();
  });

  it('ignores members whose level is not in the rank map (unknown/blank level)', async () => {
    mockDownlineLevels({ u1: 'advisor', u2: 'some-removed-legacy-level' });
    const count = await countDownlineAtOrAboveRank(['u1', 'u2'], RANK_BY_NAME.get('advisor'), RANK_BY_NAME);
    expect(count).toBe(1);
  });
});

describe('evaluateBuilderRankRequirement', () => {
  it('is trivially met when no rank requirement is configured', async () => {
    const result = await evaluateBuilderRankRequirement([], ['u1'], RANK_BY_NAME);
    expect(result).toEqual({ met: true, details: [] });
  });

  it('is met when a single alternative requirement is satisfied', async () => {
    mockDownlineLevels({ u1: 'advisor' });
    const result = await evaluateBuilderRankRequirement(
      [{ rank: 'advisor', count: 1 }], ['u1'], RANK_BY_NAME
    );
    expect(result.met).toBe(true);
    expect(result.details[0]).toMatchObject({ rank: 'advisor', requiredCount: 1, currentCount: 1, met: true });
  });

  it('is unmet when the required count is not reached', async () => {
    mockDownlineLevels({ u1: 'advisor' });
    const result = await evaluateBuilderRankRequirement(
      [{ rank: 'advisor', count: 2 }], ['u1'], RANK_BY_NAME
    );
    expect(result.met).toBe(false);
    expect(result.details[0]).toMatchObject({ requiredCount: 2, currentCount: 1, met: false });
  });

  it('applies OR semantics: "2 Advisors OR 1 Senior Advisor" is met by either alternative', async () => {
    // Only 1 Senior Advisor on the team (a Senior Advisor also counts toward the
    // "at or above Advisor" alternative, since they outrank a plain Advisor —
    // but 1 is still short of the "2 Advisors" alternative's required count).
    mockDownlineLevels({ u1: 'senior advisor' });
    const requiredRanks = [
      { rank: 'advisor', count: 2 },
      { rank: 'senior advisor', count: 1 }
    ];
    const result = await evaluateBuilderRankRequirement(requiredRanks, ['u1'], RANK_BY_NAME);
    expect(result.met).toBe(true);
    expect(result.details).toEqual([
      { rank: 'advisor', requiredCount: 2, currentCount: 1, met: false },
      { rank: 'senior advisor', requiredCount: 1, currentCount: 1, met: true }
    ]);
  });

  it('does not crash and treats an unrecognized rank name as never satisfiable', async () => {
    mockDownlineLevels({ u1: 'advisor' });
    const result = await evaluateBuilderRankRequirement(
      [{ rank: 'typo-rank-name', count: 1 }], ['u1'], RANK_BY_NAME
    );
    expect(result.met).toBe(false);
    expect(result.details[0].currentCount).toBe(0);
  });
});

describe('evaluateTracks', () => {
  const AGENT_ID = '507f1f77bcf86cd799439011';

  it('Producer track requires BOTH premium AND income thresholds (AND, not OR)', async () => {
    mockDownlineTree({ [AGENT_ID]: [] });
    mockDownlineLevels({});
    const nextLevel = {
      producerPremiumThreshold: 12500, producerWindowDays: 60,
      producerIncomeThreshold: 30000, producerIncomeWindowDays: 180,
      builderPremiumThreshold: 0, builderWindowDays: 60, builderAgentCountThreshold: 0,
      builderRequiredRanks: [], builderIncomeThreshold: 0, builderIncomeWindowDays: 180
    };

    // Premium met, income NOT met -> producerMet should be false
    ProductionSubmission.aggregate
      .mockResolvedValueOnce([{ _id: null, total: 12500 }]) // producer premium
      .mockResolvedValueOnce([{ _id: null, total: 0 }]);    // builder premium (downline empty)
    IncomePaid.aggregate.mockResolvedValueOnce([{ _id: null, total: 10000 }]); // producer income (short)

    const result = await evaluateTracks(AGENT_ID, nextLevel, null, RANK_BY_NAME);
    expect(result.producerPremiumMet).toBe(true);
    expect(result.producerIncomeMet).toBe(false);
    expect(result.producerMet).toBe(false);
  });

  it('Producer track is met once both premium and income thresholds clear', async () => {
    mockDownlineTree({ [AGENT_ID]: [] });
    mockDownlineLevels({});
    const nextLevel = {
      producerPremiumThreshold: 12500, producerWindowDays: 60,
      producerIncomeThreshold: 30000, producerIncomeWindowDays: 180,
      builderPremiumThreshold: 0, builderWindowDays: 60, builderAgentCountThreshold: 0,
      builderRequiredRanks: [], builderIncomeThreshold: 0, builderIncomeWindowDays: 180
    };

    ProductionSubmission.aggregate
      .mockResolvedValueOnce([{ _id: null, total: 15000 }])
      .mockResolvedValueOnce([{ _id: null, total: 0 }]);
    IncomePaid.aggregate.mockResolvedValueOnce([{ _id: null, total: 30000 }]);

    const result = await evaluateTracks(AGENT_ID, nextLevel, null, RANK_BY_NAME);
    expect(result.producerMet).toBe(true);
  });

  it('a level with all thresholds at 0 is trivially met on both tracks (e.g. entry-level Representative)', async () => {
    mockDownlineTree({ [AGENT_ID]: [] });
    mockDownlineLevels({});
    const entryLevel = {
      producerPremiumThreshold: 0, producerWindowDays: 30, producerIncomeThreshold: 0, producerIncomeWindowDays: 180,
      builderPremiumThreshold: 0, builderWindowDays: 30, builderAgentCountThreshold: 0,
      builderRequiredRanks: [], builderIncomeThreshold: 0, builderIncomeWindowDays: 180
    };
    ProductionSubmission.aggregate.mockResolvedValue([]); // no submissions at all

    const result = await evaluateTracks(AGENT_ID, entryLevel, null, RANK_BY_NAME);
    expect(result.producerMet).toBe(true);
    expect(result.builderMet).toBe(true);
  });

  it('Builder track: rank requirement blocks promotion even when team premium and income are met', async () => {
    // Executive Advisor requires "1 Advisor on team" — team has premium+income but no Advisor-ranked member
    mockDownlineTree({ [AGENT_ID]: ['507f1f77bcf86cd799439012'], '507f1f77bcf86cd799439012': [] });
    mockDownlineLevels({ '507f1f77bcf86cd799439012': 'representative' }); // below Advisor rank
    const nextLevel = {
      producerPremiumThreshold: 999999, producerWindowDays: 60, producerIncomeThreshold: 0, producerIncomeWindowDays: 180,
      builderPremiumThreshold: 25000, builderWindowDays: 60, builderAgentCountThreshold: 0,
      builderRequiredRanks: [{ rank: 'advisor', count: 1 }],
      builderIncomeThreshold: 30000, builderIncomeWindowDays: 180
    };

    ProductionSubmission.aggregate
      .mockResolvedValueOnce([{ _id: null, total: 0 }])       // producer premium (irrelevant, way under threshold)
      .mockResolvedValueOnce([{ _id: null, total: 25000 }]);  // builder premium: met
    IncomePaid.aggregate.mockResolvedValueOnce([{ _id: null, total: 30000 }]); // builder income: met

    const result = await evaluateTracks(AGENT_ID, nextLevel, null, RANK_BY_NAME);
    expect(result.builderPremiumMet).toBe(true);
    expect(result.builderIncomeMet).toBe(true);
    expect(result.rankMet).toBe(false);
    expect(result.builderMet).toBe(false); // AND across premium + rank + income
  });

  it('Builder track: fully met once the required rank is present on the team', async () => {
    mockDownlineTree({ [AGENT_ID]: ['507f1f77bcf86cd799439012'], '507f1f77bcf86cd799439012': [] });
    mockDownlineLevels({ '507f1f77bcf86cd799439012': 'advisor' }); // satisfies "1 Advisor"
    const nextLevel = {
      producerPremiumThreshold: 999999, producerWindowDays: 60, producerIncomeThreshold: 0, producerIncomeWindowDays: 180,
      builderPremiumThreshold: 25000, builderWindowDays: 60, builderAgentCountThreshold: 0,
      builderRequiredRanks: [{ rank: 'advisor', count: 1 }],
      builderIncomeThreshold: 30000, builderIncomeWindowDays: 180
    };

    ProductionSubmission.aggregate
      .mockResolvedValueOnce([{ _id: null, total: 0 }])
      .mockResolvedValueOnce([{ _id: null, total: 25000 }]);
    IncomePaid.aggregate.mockResolvedValueOnce([{ _id: null, total: 30000 }]);

    const result = await evaluateTracks(AGENT_ID, nextLevel, null, RANK_BY_NAME);
    expect(result.rankMet).toBe(true);
    expect(result.builderMet).toBe(true);
  });

  it('Builder track: falls back to plain headcount when no rank requirement is configured', async () => {
    const TEAMMATE_ID = '507f1f77bcf86cd799439013';
    mockDownlineTree({ [AGENT_ID]: [TEAMMATE_ID], [TEAMMATE_ID]: [] });
    mockDownlineLevels({});
    LicensingProgress.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ agent: TEAMMATE_ID }]) })
    });
    const nextLevel = {
      producerPremiumThreshold: 999999, producerWindowDays: 60, producerIncomeThreshold: 0, producerIncomeWindowDays: 180,
      builderPremiumThreshold: 10000, builderWindowDays: 30, builderAgentCountThreshold: 1,
      builderRequiredRanks: [], builderIncomeThreshold: 0, builderIncomeWindowDays: 180
    };

    ProductionSubmission.aggregate
      .mockResolvedValueOnce([{ _id: null, total: 0 }])        // producer premium
      .mockResolvedValueOnce([{ _id: null, total: 10000 }])    // builder premium
      .mockResolvedValueOnce([{ _id: TEAMMATE_ID }]);           // countProducingAgents distinct-agent group

    const result = await evaluateTracks(AGENT_ID, nextLevel, null, RANK_BY_NAME);
    expect(result.activeAgents).toBe(1);
    expect(result.rankMet).toBe(true);
    expect(result.builderMet).toBe(true);
  });
});
