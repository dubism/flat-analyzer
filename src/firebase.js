import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue } from 'firebase/database';

// ============================================================================
// 🔧 PASTE YOUR FIREBASE CONFIG HERE
// 
// Get it from: Firebase Console → Project Settings → General → Your apps → Web app
// Also need databaseURL from: Realtime Database → Data tab (URL at top)
// ============================================================================

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",          // ← REQUIRED: e.g. "https://your-project-default-rtdb.europe-west1.firebasedatabase.app"
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// ============================================================================
// INIT
// ============================================================================

let db = null;

export const isConfigured = () => !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;

export function initFirebase() {
  if (db) return db;
  if (!isConfigured()) return null;
  try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    return db;
  } catch (e) {
    console.error('Firebase init failed:', e);
    return null;
  }
}

// ============================================================================
// ROOM OPERATIONS
// ============================================================================

export function generateRoomCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Firebase forbids . # $ / [ ] in keys — sanitize on write, restore on read
const sanitizeKeys = (obj) => {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeKeys);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/\//g, '|')] = sanitizeKeys(v);
  }
  return out;
};

const restoreKeys = (obj) => {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(restoreKeys);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/\|/g, '/')] = restoreKeys(v);
  }
  return out;
};

export function writeRoom(roomId, offers, parameterRanges, palette = null) {
  if (!db || !roomId) return Promise.resolve();
  const meta = { parameterRanges };
  if (palette) meta.palette = palette;
  const data = sanitizeKeys({
    offers: offers.map(o => ({ ...o })),
    meta,
    updatedAt: Date.now(),
  });
  return set(ref(db, `rooms/${roomId}`), data).catch(e => {
    console.error('Firebase write failed:', e);
  });
}

export function subscribeToRoom(roomId, callback) {
  if (!db || !roomId) return () => {};
  const roomRef = ref(db, `rooms/${roomId}`);
  return onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    if (data) callback(restoreKeys(data));
  }, (error) => {
    console.error('Firebase subscribe error:', error);
  });
}
