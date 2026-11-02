/**
 * Unit Tests: utils/licensing.getLicensedMap
 * The bulk check behind My Team and Full Hierarchy must agree with the
 * Licensing page, i.e. not rely on the stored LicensingProgress.isLicensed flag alone.
 */
jest.mock('../../models/User', () => require('../helpers/mock-model')('User'));
jest.mock('../../models/LicensingProgress', () => require('../helpers/mock-model')('LicensingProgress'));
jest.mock('../../models/APAApplication', () => require('../helpers/mock-model')('APAApplication'));

const User = require('../../models/User');
const LicensingProgress = require('../../models/LicensingProgress');
const APAApplication = require('../../models/APAApplication');
const { getLicensedMap } = require('../../utils/licensing');

function setup({ progress = [], apa = [], users = [] }) {
  const chain = (rows) => ({ select: () => ({ lean: () => Promise.resolve(rows) }) });
  LicensingProgress.find.mockReturnValue(chain(progress));
  APAApplication.find.mockReturnValue(chain(apa));
  User.find.mockReturnValue(chain(users));
}

beforeEach(() => jest.resetAllMocks());

describe('getLicensedMap', () => {
  it('returns an empty map without querying for no ids', async () => {
    expect((await getLicensedMap([])).size).toBe(0);
    expect(LicensingProgress.find).not.toHaveBeenCalled();
  });

  it('treats each licensed signal as licensed and the rest as unlicensed', async () => {
    setup({
      progress: [
        { agent: 'flag', isLicensed: true },
        { agent: 'step', isLicensed: false, checklist: { stateAppointment: { approved: true } } },
        { agent: 'none', isLicensed: false }
      ],
      apa: [
        { userId: 'apaSelf', licensingStatus: { currentlyLicensed: true } },
        { user: 'apaTypes', licensingStatus: { licenseTypes: ['Life'] } }
      ],
      users: [{ _id: 'meta', metadata: { currentlyLicensed: 'true' } }]
    });

    const map = await getLicensedMap(['flag', 'step', 'apaSelf', 'apaTypes', 'meta', 'none', 'nothing']);
    expect(map.get('flag')).toBe(true);
    expect(map.get('step')).toBe(true);
    expect(map.get('apaSelf')).toBe(true);
    expect(map.get('apaTypes')).toBe(true);
    expect(map.get('meta')).toBe(true);
    expect(map.get('none')).toBe(false);
    expect(map.get('nothing')).toBe(false);
  });
});
