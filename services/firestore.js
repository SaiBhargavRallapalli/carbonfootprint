'use strict';

let db = null;

function initFirestore() {
  if (db) return db;
  try {
    const admin = require('firebase-admin');
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
    console.warn('[firestore] Firestore unavailable — running in demo mode:', err.message);
    return null;
  }
}

/**
 * Persist an activity record. Falls back to no-op in demo mode.
 * @param {string} sessionId
 * @param {{ category, type, quantity, co2, label, timestamp }} activity
 */
async function logActivity(sessionId, activity) {
  const firestore = initFirestore();
  if (!firestore) return { id: `demo-${Date.now()}` };

  const ref = await firestore
    .collection('sessions')
    .doc(sessionId)
    .collection('activities')
    .add({ ...activity, createdAt: new Date() });
  return { id: ref.id };
}

/**
 * Retrieve activity records for a session, newest first.
 * @param {string} sessionId
 * @param {number} limitCount
 * @returns {Promise<Array>}
 */
async function getHistory(sessionId, limitCount = 50) {
  const firestore = initFirestore();
  if (!firestore) return getDemoHistory();

  const snapshot = await firestore
    .collection('sessions')
    .doc(sessionId)
    .collection('activities')
    .orderBy('createdAt', 'desc')
    .limit(limitCount)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Retrieve activities within a date range for insights aggregation.
 * @param {string} sessionId
 * @param {Date} since
 * @returns {Promise<Array>}
 */
async function getActivitiesSince(sessionId, since) {
  const firestore = initFirestore();
  if (!firestore) return getDemoHistory();

  const snapshot = await firestore
    .collection('sessions')
    .doc(sessionId)
    .collection('activities')
    .where('createdAt', '>=', since)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Deterministic demo data used when Firestore is not configured
function getDemoHistory() {
  const now = Date.now();
  return [
    { id: 'd1', category: 'transport', type: 'petrol_car', quantity: 30, co2: 5.13, label: 'Petrol Car', timestamp: now - 86400000 },
    { id: 'd2', category: 'energy',    type: 'electricity', quantity: 10, co2: 8.2,  label: 'Electricity (Indian grid)', timestamp: now - 172800000 },
    { id: 'd3', category: 'food',      type: 'chicken_meal', quantity: 3, co2: 3.78, label: 'Chicken Meal', timestamp: now - 259200000 },
    { id: 'd4', category: 'transport', type: 'metro',        quantity: 20, co2: 0.82, label: 'Metro / Local Train', timestamp: now - 345600000 },
    { id: 'd5', category: 'food',      type: 'veg_meal',     quantity: 10, co2: 3.5,  label: 'Vegetarian Meal', timestamp: now - 432000000 },
  ];
}

module.exports = { logActivity, getHistory, getActivitiesSince };
