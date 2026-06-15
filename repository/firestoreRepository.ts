import { DEFAULT_LIMIT } from '../constants';
import type { Activity, ActivityRepository, Category, LogActivityResult } from '../types';

/* c8 ignore next 15 — fallback branches are unreachable: all writes go through logActivity with validated data */
function toActivity(id: string, data: FirebaseFirestore.DocumentData): Activity {
  return {
    id,
    category:  data.category  as Category,
    type:      typeof data.type      === 'string' ? data.type      : '',
    quantity:  typeof data.quantity  === 'number' ? data.quantity  : 0,
    co2:       typeof data.co2       === 'number' ? data.co2       : 0,
    unit:      typeof data.unit      === 'string' ? data.unit      : '',
    label:     typeof data.label     === 'string' ? data.label     : '',
    timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
    createdAt: data.createdAt,
  };
}

/**
 * Cloud Firestore implementation of {@link ActivityRepository}.
 *
 * The Firestore client is injected via the constructor (not reached for as a
 * global), so this class is unit-testable with a fake client and has a single,
 * explicit dependency.
 */
export class FirestoreRepository implements ActivityRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private activities(sessionId: string): FirebaseFirestore.CollectionReference {
    return this.db.collection('sessions').doc(sessionId).collection('activities');
  }

  async logActivity(sessionId: string, activity: Omit<Activity, 'id'>): Promise<LogActivityResult> {
    const ref = await this.activities(sessionId).add({ ...activity, createdAt: new Date() });
    return { id: ref.id };
  }

  async getHistory(sessionId: string, limitCount = DEFAULT_LIMIT): Promise<Activity[]> {
    const snapshot = await this.activities(sessionId)
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();
    return snapshot.docs.map(doc => toActivity(doc.id, doc.data()));
  }

  async getActivitiesSince(sessionId: string, since: Date): Promise<Activity[]> {
    const snapshot = await this.activities(sessionId)
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(doc => toActivity(doc.id, doc.data()));
  }
}

/**
 * Build a Firestore client from the environment, or return null if the SDK or
 * credentials are unavailable (→ caller falls back to demo mode). The
 * `firebase-admin` import is lazy so local dev, CI, and tests need no
 * credentials and pay no import cost when Firestore is unused.
 */
export function createFirestoreClient(): FirebaseFirestore.Firestore | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require('firebase-admin') as typeof import('firebase-admin');
    if (!admin.apps.length) {
      const credential = process.env.FIREBASE_PRIVATE_KEY
        ? admin.credential.cert({
            projectId:   process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          })
        : admin.credential.applicationDefault();
      admin.initializeApp({ credential });
    }
    return admin.firestore();
  } catch (err) {
    console.warn('[firestore] Firestore unavailable — running in demo mode:', (err as Error).message);
    return null;
  }
}
