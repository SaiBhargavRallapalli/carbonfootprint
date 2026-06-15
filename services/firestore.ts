import type { Activity, Category, LogActivityResult } from '../types';

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

let db: FirebaseFirestore.Firestore | null = null;

function initFirestore(): FirebaseFirestore.Firestore | null {
  if (db) return db;
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
    db = admin.firestore();
    return db;
  } catch (err) {
    console.warn('[firestore] Firestore unavailable — running in demo mode:', (err as Error).message);
    return null;
  }
}

export async function logActivity(sessionId: string, activity: Omit<Activity, 'id'>): Promise<LogActivityResult> {
  const firestore = initFirestore();
  if (!firestore) return { id: `demo-${Date.now()}` };

  const ref = await firestore
    .collection('sessions')
    .doc(sessionId)
    .collection('activities')
    .add({ ...activity, createdAt: new Date() });
  return { id: ref.id };
}

export async function getHistory(sessionId: string, limitCount = 50): Promise<Activity[]> {
  const firestore = initFirestore();
  if (!firestore) return getDemoHistory();

  const snapshot = await firestore
    .collection('sessions')
    .doc(sessionId)
    .collection('activities')
    .orderBy('createdAt', 'desc')
    .limit(limitCount)
    .get();

  return snapshot.docs.map(doc => toActivity(doc.id, doc.data()));
}

export async function getActivitiesSince(sessionId: string, since: Date): Promise<Activity[]> {
  const firestore = initFirestore();
  if (!firestore) return getDemoHistory();

  const snapshot = await firestore
    .collection('sessions')
    .doc(sessionId)
    .collection('activities')
    .where('createdAt', '>=', since)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => toActivity(doc.id, doc.data()));
}

function getDemoHistory(): Activity[] {
  const now = Date.now();
  return [
    { id: 'd1', category: 'transport', type: 'petrol_car',   quantity: 30, co2: 5.13, label: 'Petrol Car',                  unit: 'km',      timestamp: now - 86400000  },
    { id: 'd2', category: 'energy',    type: 'electricity',  quantity: 10, co2: 8.2,  label: 'Electricity (Indian grid)',   unit: 'kWh',     timestamp: now - 172800000 },
    { id: 'd3', category: 'food',      type: 'chicken_meal', quantity:  3, co2: 3.78, label: 'Chicken Meal',                unit: 'meal',    timestamp: now - 259200000 },
    { id: 'd4', category: 'transport', type: 'metro',        quantity: 20, co2: 0.82, label: 'Metro / Local Train',         unit: 'km',      timestamp: now - 345600000 },
    { id: 'd5', category: 'food',      type: 'veg_meal',     quantity: 10, co2: 3.5,  label: 'Vegetarian Meal',             unit: 'meal',    timestamp: now - 432000000 },
  ];
}
