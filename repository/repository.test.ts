process.env.NODE_ENV = 'test';

import { MemoryRepository, createDemoRepository, demoActivities } from './memoryRepository';
import { FirestoreRepository } from './firestoreRepository';
import type { Activity } from '../types';

const ACTIVITY: Omit<Activity, 'id'> = {
  category: 'transport', type: 'petrol_car', quantity: 10,
  co2: 1.71, label: 'Petrol Car', unit: 'km', timestamp: Date.now(),
};

// ── MemoryRepository ──────────────────────────────────────────────────────────
describe('MemoryRepository', () => {
  it('logActivity stores and returns a generated id', async () => {
    const repo = new MemoryRepository();
    const { id } = await repo.logActivity('sess1', ACTIVITY);
    expect(id).toMatch(/^mem-/);
    const history = await repo.getHistory('sess1');
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(id);
  });

  it('getHistory returns newest first and respects the limit', async () => {
    const repo = new MemoryRepository();
    await repo.logActivity('s', { ...ACTIVITY, timestamp: 1000 });
    await repo.logActivity('s', { ...ACTIVITY, timestamp: 3000 });
    await repo.logActivity('s', { ...ACTIVITY, timestamp: 2000 });
    const all = await repo.getHistory('s');
    expect(all.map(a => a.timestamp)).toEqual([3000, 2000, 1000]);
    const limited = await repo.getHistory('s', 2);
    expect(limited).toHaveLength(2);
  });

  it('getActivitiesSince filters by cutoff', async () => {
    const repo = new MemoryRepository();
    const now = Date.now();
    await repo.logActivity('s', { ...ACTIVITY, timestamp: now - 10 * 86_400_000 });
    await repo.logActivity('s', { ...ACTIVITY, timestamp: now - 1 * 86_400_000 });
    const recent = await repo.getActivitiesSince('s', new Date(now - 7 * 86_400_000));
    expect(recent).toHaveLength(1);
  });

  it('returns an empty array for an unknown session', async () => {
    const repo = new MemoryRepository();
    expect(await repo.getHistory('nobody')).toEqual([]);
    expect(await repo.getActivitiesSince('nobody', new Date(0))).toEqual([]);
  });

  it('isolates data between sessions', async () => {
    const repo = new MemoryRepository();
    await repo.logActivity('a', ACTIVITY);
    expect(await repo.getHistory('b')).toEqual([]);
  });
});

// ── Demo repository ─────────────────────────────────────────────────────────
describe('createDemoRepository', () => {
  it('serves seeded demo data for any session', async () => {
    const repo = createDemoRepository();
    const history = await repo.getHistory('any-session');
    expect(history.length).toBe(demoActivities().length);
    const since = await repo.getActivitiesSince('any-session', new Date(Date.now() - 30 * 86_400_000));
    expect(since.length).toBeGreaterThan(0);
  });
});

// ── FirestoreRepository (with a fake client) ─────────────────────────────────
function makeFakeFirestore() {
  const docRef = { id: 'new-doc-id' };
  const add = jest.fn().mockResolvedValue(docRef);
  const get = jest.fn().mockResolvedValue({
    docs: [{ id: 'doc1', data: () => ({ ...ACTIVITY, createdAt: new Date() }) }],
  });
  const limitChain = { get };
  const orderByChain = { limit: jest.fn().mockReturnValue(limitChain), get };
  const whereChain = { orderBy: jest.fn().mockReturnValue(orderByChain) };
  const activitiesCol = {
    add,
    orderBy: jest.fn().mockReturnValue(orderByChain),
    where: jest.fn().mockReturnValue(whereChain),
  };
  const docChain = { collection: jest.fn().mockReturnValue(activitiesCol) };
  const rootCol = { doc: jest.fn().mockReturnValue(docChain) };
  const db = { collection: jest.fn().mockReturnValue(rootCol) };
  return { db: db as unknown as FirebaseFirestore.Firestore, add, get };
}

describe('FirestoreRepository', () => {
  it('logActivity writes to the activities sub-collection and returns the id', async () => {
    const { db, add } = makeFakeFirestore();
    const repo = new FirestoreRepository(db);
    const result = await repo.logActivity('sess2', ACTIVITY);
    expect(result.id).toBe('new-doc-id');
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ co2: 1.71, createdAt: expect.any(Date) }));
  });

  it('getHistory maps Firestore docs into activities', async () => {
    const { db } = makeFakeFirestore();
    const repo = new FirestoreRepository(db);
    const activities = await repo.getHistory('sess2', 10);
    expect(activities[0].id).toBe('doc1');
    expect(activities[0].category).toBe('transport');
  });

  it('getActivitiesSince queries with a createdAt filter', async () => {
    const { db, get } = makeFakeFirestore();
    const repo = new FirestoreRepository(db);
    const activities = await repo.getActivitiesSince('sess2', new Date(Date.now() - 30 * 86_400_000));
    expect(Array.isArray(activities)).toBe(true);
    expect(get).toHaveBeenCalled();
  });
});

// ── createFirestoreClient + composition root (firebase-admin mocked) ─────────
describe('createFirestoreClient — demo fallback when firebase-admin is unavailable', () => {
  beforeAll(() => {
    jest.resetModules();
    jest.doMock('firebase-admin', () => { throw new Error('Firebase unavailable in test'); });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => { jest.dontMock('firebase-admin'); jest.resetModules(); });

  it('createFirestoreClient returns null and getRepository falls back to demo data', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fsRepo = require('./firestoreRepository') as typeof import('./firestoreRepository');
    expect(fsRepo.createFirestoreClient()).toBeNull();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const repoIndex = require('./index') as typeof import('./index');
    repoIndex.resetRepository();
    const repo = repoIndex.getRepository();
    const history = await repo.getHistory('any');
    expect(history.length).toBeGreaterThan(0); // demo data
  });
});

describe('createFirestoreClient — uses cert credential when FIREBASE_PRIVATE_KEY is set', () => {
  const mockCert = jest.fn().mockReturnValue('cert');
  const mockInit = jest.fn();

  beforeAll(() => {
    jest.resetModules();
    process.env.FIREBASE_PRIVATE_KEY  = 'fake-key\\nmore-key';
    process.env.FIREBASE_PROJECT_ID   = 'test-project';
    process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
    jest.doMock('firebase-admin', () => ({
      apps: [],
      credential: { cert: mockCert, applicationDefault: jest.fn() },
      initializeApp: mockInit,
      firestore: jest.fn().mockReturnValue({}),
    }));
  });
  afterAll(() => {
    delete process.env.FIREBASE_PRIVATE_KEY;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    jest.dontMock('firebase-admin');
    jest.resetModules();
  });

  it('passes the parsed private key to admin.credential.cert', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fsRepo = require('./firestoreRepository') as typeof import('./firestoreRepository');
    fsRepo.createFirestoreClient();
    expect(mockCert).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'test-project',
      privateKey: 'fake-key\nmore-key',
    }));
    expect(mockInit).toHaveBeenCalled();
  });
});

describe('createFirestoreClient — reuses an already-initialised app', () => {
  const mockInit = jest.fn();

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('firebase-admin', () => ({
      apps: [{}],                    // non-empty → skip initializeApp
      credential: { cert: jest.fn(), applicationDefault: jest.fn() },
      initializeApp: mockInit,
      firestore: jest.fn().mockReturnValue({}),
    }));
  });
  afterAll(() => { jest.dontMock('firebase-admin'); jest.resetModules(); });

  it('does not call initializeApp when an app already exists', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fsRepo = require('./firestoreRepository') as typeof import('./firestoreRepository');
    const db = fsRepo.createFirestoreClient();
    expect(db).not.toBeNull();
    expect(mockInit).not.toHaveBeenCalled();
  });
});

// ── setRepository (DI seam) ──────────────────────────────────────────────────
describe('composition root — setRepository injects a custom repository', () => {
  afterAll(() => { jest.resetModules(); });

  it('getRepository returns the injected instance', async () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const repoIndex = require('./index') as typeof import('./index');
    const fake = new MemoryRepository();
    await fake.logActivity('s', ACTIVITY);
    repoIndex.setRepository(fake);
    expect(repoIndex.getRepository()).toBe(fake);
    expect(await repoIndex.getRepository().getHistory('s')).toHaveLength(1);
  });
});
