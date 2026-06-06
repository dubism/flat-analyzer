import { initializeApp, getApp, getApps } from 'firebase/app';
import { getDatabase, ref, set, onValue } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyAHEPrKyle1xNRXRBetDV0whgGTW-7_LlQ",
  authDomain: "flat-analyzer-memory.firebaseapp.com",
  databaseURL: "https://flat-analyzer-memory-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "flat-analyzer-memory",
  storageBucket: "flat-analyzer-memory.firebasestorage.app",
  messagingSenderId: "424420313683",
  appId: "1:424420313683:web:7b1193b612bd61839894a6",
};

let db = null;

export const isNotesFirebaseConfigured = () => !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;

export function initNotesFirebase() {
  if (db) return db;
  if (!isNotesFirebaseConfigured()) return null;

  try {
    const appName = 'flat-notes-app';
    const app = getApps().some((candidate) => candidate.name === appName)
      ? getApp(appName)
      : initializeApp(firebaseConfig, appName);
    db = getDatabase(app);
    return db;
  } catch (error) {
    console.error('Flat notes Firebase init failed:', error);
    return null;
  }
}

export function generateNotesRoomCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const KEY_REPLACEMENTS = [
  [/\./g, '|dot|'],
  [/#/g, '|hash|'],
  [/\$/g, '|dollar|'],
  [/\//g, '|slash|'],
  [/\[/g, '|left|'],
  [/\]/g, '|right|'],
];

const restoreKey = (key) => key
  .replace(/\|dot\|/g, '.')
  .replace(/\|hash\|/g, '#')
  .replace(/\|dollar\|/g, '$')
  .replace(/\|slash\|/g, '/')
  .replace(/\|left\|/g, '[')
  .replace(/\|right\|/g, ']');

const sanitizeKey = (key) => KEY_REPLACEMENTS.reduce(
  (result, [pattern, replacement]) => result.replace(pattern, replacement),
  key,
);

const sanitizeKeys = (value) => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitizeKeys);

  const output = {};
  for (const [key, childValue] of Object.entries(value)) {
    output[sanitizeKey(key)] = sanitizeKeys(childValue);
  }
  return output;
};

const restoreKeys = (value) => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(restoreKeys);

  const output = {};
  for (const [key, childValue] of Object.entries(value)) {
    output[restoreKey(key)] = restoreKeys(childValue);
  }
  return output;
};

export function writeNotesRoom(roomId, notebook) {
  if (!db || !roomId) return Promise.resolve();

  const payload = sanitizeKeys({
    ...notebook,
    updatedAt: Date.now(),
  });

  return set(ref(db, `roomNotes/${roomId}`), payload);
}

export function subscribeToNotesRoom(roomId, callback, onError = () => {}) {
  if (!db || !roomId) return () => {};

  return onValue(
    ref(db, `roomNotes/${roomId}`),
    (snapshot) => {
      const data = snapshot.val();
      callback(data ? restoreKeys(data) : null);
    },
    (error) => {
      console.error('Flat notes Firebase subscribe failed:', error);
      onError(error);
    },
  );
}
