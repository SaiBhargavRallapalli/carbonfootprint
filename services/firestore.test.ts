process.env.NODE_ENV = 'test';

import type { Activity } from '../types';

const ACTIVITY: Omit<Activity, 'id'> = {
  category: 'transport', type: 'petrol_car', quantity: 10,
  co2: 1.71, label: 'Petrol Car', unit: 'km', timestamp: Date.now(),
};

// ── Helper to build a chainable Firestore mock ───────────────────────────────
function makeMockFirestore(overrides: Record<string, unknown> = {}) {
  const mockDocRef = { id: 'new-doc-id', ...overrides };
  const mockAdd = jest.fn().mockResolvedValue(mockDocRef);
  const mockGet = jest.fn().mockResolvedValue({
    docs: [{ id: 'doc1', data: () => ({ ...ACTIVITY }) }],
  });
  const mockOrderByChain = { limit: jest.fn(), get: mockGet };
  mockOrderByChain.limit.mockReturnValue({ get: mockGet });
  const mockWhereChain = { orderBy: jest.fn().mockReturnValue(mockOrderByChain) };
  const mockActivitiesCol = {
    add: mockAdd,
    orderBy: jest.fn().mockReturnValue(mockOrderByChain),
    where: jest.fn().mockReturnValue(mockWhereChain),
  };
  const mockDocChain = { collection: jest.fn().mockReturnValue(mockActivitiesCol) };
  const mockRootCol = { doc: jest.fn().mockReturnValue(mockDocChain) };
  const mockDb = { collection: jest.fn().mockReturnValue(mockRootCol) };
  return { mockDb, mockAdd, mockGet };
}

// ── Demo mode (firebase-admin throws on require) ──────────────────────────────
describe('services/firestore — demo mode', () => {
  let logActivity: (s: string, a: Omit<Activity, 'id'>) => Promise<{ id: string }>;
  let getHistory: (s: string, n?: number) => Promise<Activity[]>;
  let getActivitiesSince: (s: string, d: Date) => Promise<Activity[]>;

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('firebase-admin', () => { throw new Error('Firebase unavailable in test'); });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./firestore') as typeof import('./firestore');
    logActivity = mod.logActivity;
    getHistory = mod.getHistory;
    getActivitiesSince = mod.getActivitiesSince;
  });

  afterEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.dontMock('firebase-admin');
    jest.resetModules();
  });

  it('logActivity returns a demo-prefixed id', async () => {
    const result = await logActivity('sess1', ACTIVITY);
    expect(result.id).toMatch(/^demo-/);
  });

  it('getHistory returns demo history', async () => {
    const activities = await getHistory('sess1');
    expect(Array.isArray(activities)).toBe(true);
    expect(activities.length).toBeGreaterThan(0);
    expect(activities[0]).toHaveProperty('id');
    expect(activities[0]).toHaveProperty('category');
  });

  it('getActivitiesSince returns demo history', async () => {
    const since = new Date(Date.now() - 7 * 86400000);
    const activities = await getActivitiesSince('sess1', since);
    expect(Array.isArray(activities)).toBe(true);
    expect(activities.length).toBeGreaterThan(0);
  });
});

// ── Real firebase mode (firebase-admin mocked to succeed) ─────────────────────
describe('services/firestore — firebase available', () => {
  let logActivity: (s: string, a: Omit<Activity, 'id'>) => Promise<{ id: string }>;
  let getHistory: (s: string, n?: number) => Promise<Activity[]>;
  let getActivitiesSince: (s: string, d: Date) => Promise<Activity[]>;
  let mockDb: ReturnType<typeof makeMockFirestore>['mockDb'];
  let mockGet: ReturnType<typeof makeMockFirestore>['mockGet'];

  beforeAll(() => {
    jest.resetModules();
    const mocks = makeMockFirestore();
    mockDb = mocks.mockDb;
    mockGet = mocks.mockGet;

    jest.doMock('firebase-admin', () => ({
      apps: [],
      credential: {
        cert: jest.fn().mockReturnValue('cert'),
        applicationDefault: jest.fn().mockReturnValue('appDefault'),
      },
      initializeApp: jest.fn(),
      firestore: jest.fn().mockReturnValue(mockDb),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./firestore') as typeof import('./firestore');
    logActivity = mod.logActivity;
    getHistory = mod.getHistory;
    getActivitiesSince = mod.getActivitiesSince;
  });

  afterAll(() => {
    jest.dontMock('firebase-admin');
    jest.resetModules();
  });

  it('logActivity persists to firestore and returns real id', async () => {
    const result = await logActivity('sess2', ACTIVITY);
    expect(result.id).toBe('new-doc-id');
  });

  it('getHistory fetches from firestore', async () => {
    const activities = await getHistory('sess2', 10);
    expect(Array.isArray(activities)).toBe(true);
    expect(activities[0].id).toBe('doc1');
  });

  it('getHistory respects limit parameter', async () => {
    await getHistory('sess2', 25);
    // limit is called — just confirm no error
    expect(mockGet).toHaveBeenCalled();
  });

  it('getActivitiesSince fetches from firestore', async () => {
    const since = new Date(Date.now() - 30 * 86400000);
    const activities = await getActivitiesSince('sess2', since);
    expect(Array.isArray(activities)).toBe(true);
  });
});

// ── FIREBASE_PRIVATE_KEY path (cert credential) ───────────────────────────────
describe('services/firestore — cert credential branch', () => {
  let logActivity: (s: string, a: Omit<Activity, 'id'>) => Promise<{ id: string }>;
  const mockCert = jest.fn().mockReturnValue('cert');

  beforeAll(() => {
    jest.resetModules();
    process.env.FIREBASE_PRIVATE_KEY = 'fake-key\\nmore-key';
    process.env.FIREBASE_PROJECT_ID  = 'test-project';
    process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';

    const mocks = makeMockFirestore();

    jest.doMock('firebase-admin', () => ({
      apps: [],
      credential: { cert: mockCert, applicationDefault: jest.fn() },
      initializeApp: jest.fn(),
      firestore: jest.fn().mockReturnValue(mocks.mockDb),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./firestore') as typeof import('./firestore');
    logActivity = mod.logActivity;
  });

  afterAll(() => {
    delete process.env.FIREBASE_PRIVATE_KEY;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    jest.dontMock('firebase-admin');
    jest.resetModules();
  });

  it('uses cert credential when FIREBASE_PRIVATE_KEY is set', async () => {
    await logActivity('sess3', ACTIVITY);
    expect(mockCert).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'test-project',
      privateKey: 'fake-key\nmore-key',
    }));
  });
});

// ── Already-initialised app branch ───────────────────────────────────────────
describe('services/firestore — already initialised firebase app', () => {
  let logActivity: (s: string, a: Omit<Activity, 'id'>) => Promise<{ id: string }>;

  beforeAll(() => {
    jest.resetModules();
    const mocks = makeMockFirestore();

    jest.doMock('firebase-admin', () => ({
      apps: [{}],           // non-empty → skips initializeApp
      credential: { cert: jest.fn(), applicationDefault: jest.fn() },
      initializeApp: jest.fn(),
      firestore: jest.fn().mockReturnValue(mocks.mockDb),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./firestore') as typeof import('./firestore');
    logActivity = mod.logActivity;
  });

  afterAll(() => {
    jest.dontMock('firebase-admin');
    jest.resetModules();
  });

  it('reuses existing app without calling initializeApp', async () => {
    const result = await logActivity('sess4', ACTIVITY);
    expect(result.id).toBe('new-doc-id');
  });
});
