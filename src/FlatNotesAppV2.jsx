import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  generateNotesRoomCode,
  initNotesFirebase,
  isNotesFirebaseConfigured,
  subscribeToNotesRoom,
  writeNotesRoom,
} from './notesFirebase';

const STORAGE_KEY = 'flat-notes-shared-data';
const IMAGE_DB_NAME = 'flat-notes-images';
const IMAGE_DB_VERSION = 1;
const IMAGE_STORE_NAME = 'images';
const THEME_STORAGE_KEY = 'flat-notes-theme';
const BOARD_OPEN_STORAGE_KEY = 'flat-notes-board-open';
const BOARD_MODE_STORAGE_KEY = 'flat-notes-board-mode';
const BOARD_WIDTH_STORAGE_KEY = 'flat-notes-board-width';
const DEFAULT_ROOM = 'flat-notes-shared';

const SYNC_COPY = {
  local: {
    label: 'Iba lokálne',
    detail: 'Poznámky sú uložené len v tomto prehliadači. Pripojte alebo vytvorte skupinu pre zdieľanie.',
  },
  connecting: {
    label: 'Pripájanie…',
    detail: 'Zobrazujem lokálnu kópiu, kým Firebase nepotvrdí dáta z cloudu.',
  },
  seeding: {
    label: 'Prázdna skupina — nahrávam lokálne poznámky…',
    detail: 'Táto Firebase skupina nemala dáta, preto sa do nej ukladá aktuálna lokálna kópia.',
  },
  pending: {
    label: 'Čaká na uloženie…',
    detail: 'Máte lokálne zmeny, ktoré ešte Firebase nepotvrdil.',
  },
  saving: {
    label: 'Ukladám do cloudu…',
    detail: 'Prosím nezatvárajte kartu, kým sa zmeny nepotvrdia.',
  },
  synced: {
    label: 'Synchronizované',
    detail: 'Firebase potvrdil čítanie aj posledný zápis pre túto skupinu.',
  },
  configError: {
    label: 'Firebase nie je nakonfigurovaný',
    detail: 'Zdieľanie nemôže fungovať bez Firebase konfigurácie v nasadenom webe.',
  },
  initError: {
    label: 'Synchronizácia nie je dostupná',
    detail: 'Firebase sa nepodarilo inicializovať. Skontrolujte konfiguráciu, sieť alebo blokovanie v prehliadači.',
  },
  readError: {
    label: 'Čítanie zlyhalo — zobrazujem lokálnu kópiu',
    detail: 'Firebase odmietol alebo prerušil čítanie tejto skupiny.',
  },
  writeError: {
    label: 'Cloud zápis zlyhal — overujem lokálnu kópiu',
    detail: 'Firebase nepotvrdil uloženie. Lokálna kópia sa považuje za bezpečnú až po overení textu aj obrázkov v prehliadači.',
  },
};

const ERROR_PHASES = new Set(['configError', 'initError', 'readError', 'writeError']);
const QUIET_TOPBAR_PHASES = new Set(['pending', 'saving']);

const formatSyncTime = (timestamp) => timestamp
  ? new Intl.DateTimeFormat('sk-SK', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp))
  : '';

const describeError = (error) => {
  if (!error) return '';
  const code = error.code ? `${error.code}: ` : '';
  return `${code}${error.message || String(error)}`;
};

const describeFirebaseError = describeError;

const syncLabel = (sync) => {
  const base = sync.message || SYNC_COPY[sync.phase]?.label || 'Synchronizácia';
  const time = sync.lastSuccessAt && sync.phase === 'synced' ? ` · ${formatSyncTime(sync.lastSuccessAt)}` : '';
  return `${base}${time}`;
};

const compactSyncLabel = (sync) => sync.phase === 'synced' ? SYNC_COPY.synced.label : syncLabel(sync);

const topbarSyncState = (sync) => (
  QUIET_TOPBAR_PHASES.has(sync.phase) && sync.lastSuccessAt
    ? { ...sync, phase: 'synced' }
    : sync
);

const syncDetail = (sync) => [
  sync.detail || SYNC_COPY[sync.phase]?.detail,
  sync.errorMessage ? `Detail: ${sync.errorMessage}` : '',
].filter(Boolean).join(' ');

const syncToneClasses = (phase) => {
  if (phase === 'synced') return {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100',
    text: 'text-emerald-700 dark:text-emerald-200',
  };
  if (ERROR_PHASES.has(phase)) return {
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-100',
    text: 'text-red-700 dark:text-red-200',
  };
  if (phase === 'local') return {
    dot: 'bg-stone-400',
    badge: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200',
    text: 'text-stone-600 dark:text-stone-300',
  };
  return {
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-100',
    text: 'text-amber-700 dark:text-amber-200',
  };
};
const STARTER_ROOMS = ['Vstup', 'Kuchyňa', 'Obývačka', 'Spálňa', 'Kúpeľňa', 'WC', 'Balkón', 'Sklad'];
const MIN_BOARD_WIDTH = 288;
const MAX_BOARD_WIDTH = 704;
const DEFAULT_BOARD_WIDTH = 360;

const FIELD_LABELS = {
  notes: 'Poznámky:',
  measurements: 'Rozmery:',
  decisions: 'Rozhodnutia:',
  tasks: 'Úlohy:',
  links: 'Odkazy:',
};

const LEGACY_FIELD_LABELS = {
  'Notes:': 'notes',
  'Measurements:': 'measurements',
  'Decisions:': 'decisions',
  'Tasks:': 'tasks',
  'Links:': 'links',
};

const SLOVAK_FIELD_LABELS = Object.fromEntries(
  Object.entries(FIELD_LABELS).map(([field, label]) => [label, field]),
);

const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const emptySection = () => ({ notes: '', links: [], tasks: [], imageOrder: [] });
const emptyRoom = (name) => ({
  id: makeId('room'),
  name,
  notes: '',
  measurements: '',
  decisions: '',
  links: [],
  tasks: [],
  images: [],
});
const createNotebook = () => ({
  version: 2,
  title: 'Poznámky k bytu',
  global: emptySection(),
  rooms: STARTER_ROOMS.map(emptyRoom),
  updatedAt: Date.now(),
});
const arr = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const oneLine = (value = '') => String(value).replace(/\r?\n/g, ' ').trim();

const normalizeLinks = (links) => arr(links).map((link) => ({
  id: link.id || makeId('link'),
  title: link.title || '',
  url: link.url || '',
  notes: link.notes || '',
}));
const normalizeTasks = (tasks) => arr(tasks).map((task) => ({
  id: task.id || makeId('task'),
  text: task.text || '',
  done: Boolean(task.done),
}));
const normalizeImages = (images) => arr(images).map((image) => {
  const id = image.id || image.srcRef || makeId('image');
  const src = image.src || image.dataUrl || image.url || '';
  const srcRef = image.srcRef || id;
  return {
    id,
    src,
    srcRef,
    storage: image.storage || (src ? 'inline' : 'indexeddb'),
    name: image.name || '',
    addedAt: image.addedAt || Date.now(),
    missing: Boolean(image.missing && !src),
  };
}).filter((image) => image.src || image.srcRef);
const normalizeSection = (section = {}) => ({
  notes: section.notes || '',
  links: normalizeLinks(section.links),
  tasks: normalizeTasks(section.tasks),
  imageOrder: arr(section.imageOrder).map(String),
});
const normalizeRoom = (room = {}) => ({
  ...normalizeSection(room),
  id: room.id || makeId('room'),
  name: room.name || 'Miestnosť',
  measurements: room.measurements || '',
  decisions: room.decisions || '',
  images: normalizeImages(room.images),
});

const normalizeNotebook = (value) => {
  const fallback = createNotebook();
  if (!value || typeof value !== 'object') return fallback;
  const rooms = arr(value.rooms).map(normalizeRoom);
  return {
    version: 2,
    title: value.title || 'Poznámky k bytu',
    global: normalizeSection(value.global),
    rooms: rooms.length ? rooms : fallback.rooms,
    updatedAt: value.updatedAt || Date.now(),
  };
};

const forEachNotebookImage = (notebook, callback) => {
  arr(notebook?.rooms).forEach((room) => {
    arr(room.images).forEach((image) => callback(image, room));
  });
};

const notebookImageIds = (notebook) => {
  const ids = [];
  forEachNotebookImage(notebook, (image) => {
    if (image.id) ids.push(image.id);
  });
  return ids;
};

const stripNotebookImagePayloads = (notebook) => normalizeNotebook({
  ...notebook,
  rooms: arr(notebook.rooms).map((room) => ({
    ...room,
    images: arr(room.images).map((image) => ({
      id: image.id,
      srcRef: image.srcRef || image.id,
      storage: image.storage === 'missing' ? 'missing' : 'indexeddb',
      name: image.name || '',
      addedAt: image.addedAt || Date.now(),
      missing: Boolean(image.missing && !image.src),
    })),
  })),
});

const openImageDb = () => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) {
    reject(new Error('IndexedDB nie je dostupný v tomto prehliadači.'));
    return;
  }

  const request = window.indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) db.createObjectStore(IMAGE_STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB otvorenie zlyhalo.'));
  request.onblocked = () => reject(new Error('IndexedDB je blokované inou otvorenou kartou.'));
});

const withImageStore = async (mode, operation) => {
  const db = await openImageDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(IMAGE_STORE_NAME, mode);
      const store = transaction.objectStore(IMAGE_STORE_NAME);
      let operationResult;
      transaction.oncomplete = () => resolve(operationResult);
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transakcia zlyhala.'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transakcia bola zrušená.'));
      operationResult = operation(store);
    });
  } finally {
    db.close();
  }
};

const requestToPromise = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB požiadavka zlyhala.'));
});

const saveNotebookImages = async (notebook) => {
  const images = [];
  forEachNotebookImage(notebook, (image) => {
    if (image.src) images.push(image);
  });
  if (!images.length) return;

  await withImageStore('readwrite', (store) => {
    images.forEach((image) => {
      store.put({
        src: image.src,
        name: image.name || '',
        addedAt: image.addedAt || Date.now(),
      }, image.srcRef || image.id);
    });
  });
};

const loadNotebookImages = async (notebook) => {
  const normalized = normalizeNotebook(notebook);
  const imageIds = notebookImageIds(normalized);
  if (!imageIds.length) return normalized;

  const loaded = await withImageStore('readonly', (store) => Promise.all(
    imageIds.map(async (id) => [id, await requestToPromise(store.get(id))]),
  ));
  const byId = new Map(loaded);

  return normalizeNotebook({
    ...normalized,
    rooms: normalized.rooms.map((room) => ({
      ...room,
      images: arr(room.images).map((image) => {
        if (image.src) return { ...image, storage: 'indexeddb', srcRef: image.srcRef || image.id };
        const stored = byId.get(image.srcRef || image.id);
        if (!stored?.src) return { ...image, storage: 'missing', missing: true };
        return {
          ...image,
          src: stored.src,
          name: image.name || stored.name || '',
          addedAt: image.addedAt || stored.addedAt || Date.now(),
          storage: 'indexeddb',
          missing: false,
        };
      }),
    })),
  });
};

const verifyNotebookPersisted = async (expected) => {
  const expectedIds = new Set(notebookImageIds(expected));
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ok: false, missingImageIds: [...expectedIds], errorMessage: 'Lokálna metadata kópia neexistuje.' };

  const restored = normalizeNotebook(JSON.parse(raw));
  const restoredIds = new Set(notebookImageIds(restored));
  const missingMetadataIds = [...expectedIds].filter((id) => !restoredIds.has(id));
  if (missingMetadataIds.length) {
    return { ok: false, missingImageIds: missingMetadataIds, errorMessage: `V lokálnej metadata kópii chýba ${missingMetadataIds.length} obrázok/obrázkov.` };
  }

  const loaded = await loadNotebookImages(restored);
  const missingImageIds = [];
  forEachNotebookImage(loaded, (image) => {
    if (expectedIds.has(image.id) && !image.src) missingImageIds.push(image.id);
  });

  return missingImageIds.length
    ? { ok: false, missingImageIds, errorMessage: `IndexedDB nevrátilo ${missingImageIds.length} obrázok/obrázkov.` }
    : { ok: true, missingImageIds: [], errorMessage: '' };
};

const loadNotebook = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeNotebook(JSON.parse(raw));
  } catch (error) {
    console.warn('Nepodarilo sa načítať poznámky k bytu:', error);
  }
  return createNotebook();
};

const saveNotebook = async (notebook) => {
  try {
    await saveNotebookImages(notebook);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripNotebookImagePayloads(notebook)));
    const verification = await verifyNotebookPersisted(notebook);
    if (!verification.ok) throw new Error(verification.errorMessage || 'Overenie lokálneho uloženia zlyhalo.');
    return { ok: true, savedAt: Date.now(), errorMessage: '', missingImageIds: [] };
  } catch (error) {
    console.warn('Nepodarilo sa uložiť poznámky k bytu:', error);
    return { ok: false, savedAt: 0, errorMessage: describeError(error), missingImageIds: [] };
  }
};

const mergeImages = (localImages, remoteImages) => {
  const merged = new Map();
  arr(remoteImages).forEach((image) => merged.set(image.id, image));
  arr(localImages).forEach((image) => {
    const existing = merged.get(image.id);
    merged.set(image.id, existing ? { ...existing, ...image, src: image.src || existing.src } : image);
  });
  return [...merged.values()].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
};

const mergeNotebookSections = (localSection = {}, remoteSection = {}, preferLocalText) => ({
  ...remoteSection,
  ...localSection,
  notes: preferLocalText ? (localSection.notes || remoteSection.notes || '') : (remoteSection.notes || localSection.notes || ''),
  links: preferLocalText ? arr(localSection.links) : arr(remoteSection.links).length ? arr(remoteSection.links) : arr(localSection.links),
  tasks: preferLocalText ? arr(localSection.tasks) : arr(remoteSection.tasks).length ? arr(remoteSection.tasks) : arr(localSection.tasks),
  imageOrder: [...new Set([...arr(localSection.imageOrder), ...arr(remoteSection.imageOrder)])],
});

const mergeNotebooks = (localNotebook, remoteNotebook) => {
  const local = normalizeNotebook(localNotebook);
  const remote = normalizeNotebook(remoteNotebook);
  const preferLocalText = (local.updatedAt || 0) >= (remote.updatedAt || 0);
  const roomsById = new Map(remote.rooms.map((room) => [room.id, room]));

  local.rooms.forEach((localRoom) => {
    const remoteRoom = roomsById.get(localRoom.id);
    if (!remoteRoom) {
      roomsById.set(localRoom.id, localRoom);
      return;
    }
    roomsById.set(localRoom.id, {
      ...remoteRoom,
      ...localRoom,
      name: preferLocalText ? (localRoom.name || remoteRoom.name) : (remoteRoom.name || localRoom.name),
      notes: preferLocalText ? (localRoom.notes || remoteRoom.notes || '') : (remoteRoom.notes || localRoom.notes || ''),
      measurements: preferLocalText ? (localRoom.measurements || remoteRoom.measurements || '') : (remoteRoom.measurements || localRoom.measurements || ''),
      decisions: preferLocalText ? (localRoom.decisions || remoteRoom.decisions || '') : (remoteRoom.decisions || localRoom.decisions || ''),
      links: preferLocalText ? arr(localRoom.links) : arr(remoteRoom.links).length ? arr(remoteRoom.links) : arr(localRoom.links),
      tasks: preferLocalText ? arr(localRoom.tasks) : arr(remoteRoom.tasks).length ? arr(remoteRoom.tasks) : arr(localRoom.tasks),
      images: mergeImages(localRoom.images, remoteRoom.images),
    });
  });

  return normalizeNotebook({
    ...remote,
    ...local,
    title: preferLocalText ? (local.title || remote.title) : (remote.title || local.title),
    global: mergeNotebookSections(local.global, remote.global, preferLocalText),
    rooms: [...roomsById.values()],
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0, Date.now()),
  });
};

const getHashRoom = () => {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) return '';
  return (new URLSearchParams(hash.slice(queryIndex + 1)).get('room') || '').trim().toLowerCase();
};

const setHashRoom = (room) => {
  const hash = room ? `#/notes?room=${encodeURIComponent(room)}` : '#/notes';
  if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
};

const loadBoardMode = () => {
  try {
    const saved = localStorage.getItem(BOARD_MODE_STORAGE_KEY);
    if (saved === 'whole' || saved === 'dense') return saved;
  } catch {
    // Ignore localStorage errors and keep the whole-image moodboard mode by default.
  }
  return 'whole';
};

const loadBoardOpen = () => {
  try {
    const saved = localStorage.getItem(BOARD_OPEN_STORAGE_KEY);
    if (saved === 'false') return false;
    if (saved === 'true') return true;
  } catch {
    // Ignore localStorage errors and keep the moodboard visible by default.
  }
  return true;
};

const clampBoardWidth = (value) => Math.min(MAX_BOARD_WIDTH, Math.max(MIN_BOARD_WIDTH, Number(value) || DEFAULT_BOARD_WIDTH));

const loadBoardWidth = () => {
  try {
    return clampBoardWidth(localStorage.getItem(BOARD_WIDTH_STORAGE_KEY));
  } catch {
    // Ignore localStorage errors and keep the default moodboard width.
  }
  return DEFAULT_BOARD_WIDTH;
};

const loadTheme = () => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Ignore localStorage errors and fall back to system preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const updatedLabel = (timestamp) => new Intl.DateTimeFormat('sk-SK', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(timestamp || Date.now()));
const openTaskCount = (section) => arr(section.tasks).filter((task) => !task.done).length;

const sectionToText = (section, room = false) => {
  const lines = [FIELD_LABELS.notes, section.notes || '', ''];
  if (room) {
    lines.push(
      FIELD_LABELS.measurements,
      section.measurements || '',
      '',
      FIELD_LABELS.decisions,
      section.decisions || '',
      '',
    );
  }
  lines.push(FIELD_LABELS.tasks);
  arr(section.tasks).forEach((task) => lines.push(`- [${task.done ? 'x' : ' '}] ${oneLine(task.text)}`));
  lines.push('', FIELD_LABELS.links);
  arr(section.links).forEach((link) => lines.push(`- ${oneLine(link.title)} | ${oneLine(link.url)} | ${oneLine(link.notes)}`));
  return lines.join('\n');
};

const notebookToText = (notebook) => {
  const data = normalizeNotebook(notebook);
  const blocks = [
    '# Poznámky k bytu',
    `Aktualizované: ${new Date(data.updatedAt || Date.now()).toISOString()}`,
    '',
    '## Celý byt',
    sectionToText(data.global),
  ];
  data.rooms.forEach((room) => blocks.push('', `## Miestnosť: ${room.name}`, sectionToText(room, true)));
  return `${blocks.join('\n')}\n`;
};

const parseTask = (line) => {
  const match = line.match(/^- \[( |x|X)\]\s*(.*)$/);
  return match ? { id: makeId('task'), done: match[1].toLowerCase() === 'x', text: match[2].trim() } : null;
};

const parseLink = (line) => {
  if (!line.startsWith('- ')) return null;
  const [title = '', url = '', ...notes] = line.slice(2).split('|').map((part) => part.trim());
  if (!title && !url) return null;
  return { id: makeId('link'), title: title || url, url, notes: notes.join(' | ') };
};

const appendField = (target, field, line) => {
  target[field] = target[field] ? `${target[field]}\n${line}` : line;
};

const getFieldFromLabel = (label) => SLOVAK_FIELD_LABELS[label] || LEGACY_FIELD_LABELS[label] || null;

const textToNotebook = (text) => {
  const notebook = { version: 2, title: 'Poznámky k bytu', global: emptySection(), rooms: [], updatedAt: Date.now() };
  let current = null;
  let field = null;
  let recognized = false;

  String(text || '').replace(/\r\n/g, '\n').split('\n').forEach((raw) => {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed === '# Flat Notes' || trimmed === '# Poznámky k bytu' || trimmed.startsWith('Updated:') || trimmed.startsWith('Aktualizované:')) {
      if (current && ['notes', 'measurements', 'decisions'].includes(field)) appendField(current, field, '');
      return;
    }
    if (trimmed === '## Global' || trimmed === '## Celý byt') {
      current = notebook.global;
      field = null;
      recognized = true;
      return;
    }
    if (trimmed.startsWith('## Room:') || trimmed.startsWith('## Miestnosť:')) {
      const separator = trimmed.indexOf(':');
      const room = emptyRoom(trimmed.slice(separator + 1).trim() || 'Miestnosť');
      notebook.rooms.push(room);
      current = room;
      field = null;
      recognized = true;
      return;
    }
    if (!current) return;

    const nextField = getFieldFromLabel(trimmed);
    if (nextField) {
      if (nextField === 'notes') current.notes = '';
      if (nextField === 'measurements') current.measurements = '';
      if (nextField === 'decisions') current.decisions = '';
      if (nextField === 'tasks') current.tasks = [];
      if (nextField === 'links') current.links = [];
      field = nextField;
      recognized = true;
      return;
    }
    if (field === 'tasks') {
      const task = parseTask(trimmed);
      if (task) current.tasks.push(task);
      return;
    }
    if (field === 'links') {
      const link = parseLink(trimmed);
      if (link) current.links.push(link);
      return;
    }
    if (['notes', 'measurements', 'decisions'].includes(field)) appendField(current, field, line);
  });

  if (!recognized) throw new Error('Nenašli sa žiadne sekcie FlatNotes.');
  return normalizeNotebook({
    ...notebook,
    rooms: notebook.rooms.length ? notebook.rooms : createNotebook().rooms,
    updatedAt: Date.now(),
  });
};

const TEXT_EXAMPLE = `# Poznámky k bytu
Aktualizované: 2026-06-06T12:00:00.000Z

## Celý byt
Poznámky:
Poznámky pre celý byt. Text môže mať viac riadkov.

Úlohy:
- [ ] Otvorená úloha
- [x] Hotová úloha

Odkazy:
- Názov | https://example.com | Voliteľná poznámka k odkazu

## Miestnosť: Kuchyňa
Poznámky:
Poznámky k miestnosti.

Rozmery:
Šírka, zásuvky, okná, poloha radiátora...

Rozhodnutia:
Vybrané materiály, rozloženie, otvorené otázky...

Úlohy:
- [ ] Úloha k miestnosti

Odkazy:
- Inšpirácia | https://example.com | Voliteľná poznámka`;

function Button({ children, onClick, type = 'button', className = '', title }) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      className={`min-h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 active:scale-[0.98] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800 ${className}`}
    >
      {children}
    </button>
  );
}

function TextAreaCard({ label, value, rows = 6, placeholder, onChange }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</label>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-base leading-6 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:bg-white focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-stone-500 dark:focus:bg-stone-950 dark:focus:ring-stone-700"
      />
    </section>
  );
}

function TaskList({ tasks, onAdd, onToggle, onRename, onDelete }) {
  const [draft, setDraft] = useState('');
  const submit = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft('');
  };

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-3 flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Úlohy</label>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {tasks.filter((task) => !task.done).length} otvorené
        </span>
      </div>
      <form onSubmit={submit} className="mb-3 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Pridať úlohu"
          className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-700"
        />
        <Button type="submit" className="border-stone-800 bg-stone-800 !text-white hover:bg-stone-700 dark:border-stone-200 dark:bg-stone-100 dark:!text-stone-900 dark:hover:bg-white">Pridať</Button>
      </form>
      <div className="space-y-2">
        {tasks.length ? tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 rounded-xl border border-stone-100 bg-stone-50 px-2 py-2 dark:border-stone-800 dark:bg-stone-950">
            <button
              type="button"
              onClick={() => onToggle(task.id)}
              className={`h-7 w-7 rounded-lg border ${task.done ? 'border-stone-700 bg-stone-700 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-950' : 'border-stone-300 bg-white text-transparent dark:border-stone-600 dark:bg-stone-900'}`}
            >
              ✓
            </button>
            <input
              value={task.text}
              onChange={(event) => onRename(task.id, event.target.value)}
              className={`min-w-0 flex-1 bg-transparent px-1 py-1 text-base text-stone-900 outline-none dark:text-stone-100 ${task.done ? 'text-stone-400 line-through dark:text-stone-500' : ''}`}
            />
            <button type="button" onClick={() => onDelete(task.id)} className="h-8 w-8 rounded-lg text-stone-400 hover:bg-white hover:text-red-600 dark:hover:bg-stone-900">×</button>
          </div>
        )) : <p className="rounded-xl bg-stone-50 px-3 py-4 text-sm text-stone-500 dark:bg-stone-950 dark:text-stone-400">Zatiaľ nie sú pridané žiadne úlohy.</p>}
      </div>
    </section>
  );
}

function LinkList({ links, onAdd, onChange, onDelete }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const submit = (event) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanUrl = url.trim();
    if (!cleanTitle && !cleanUrl) return;
    onAdd({ title: cleanTitle || cleanUrl, url: cleanUrl, notes: '' });
    setTitle('');
    setUrl('');
  };

  const inputClass = 'rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-700';

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Odkazy</label>
      <form onSubmit={submit} className="mb-4 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Názov" className={inputClass} />
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." inputMode="url" className={inputClass} />
        <Button type="submit" className="border-stone-800 bg-stone-800 !text-white hover:bg-stone-700 dark:border-stone-200 dark:bg-stone-100 dark:!text-stone-900 dark:hover:bg-white">Pridať</Button>
      </form>
      <div className="space-y-3">
        {links.length ? links.map((link) => (
          <div key={link.id} className="rounded-xl border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
            <div className="mb-2 flex items-center gap-2">
              {link.url ? (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-blue-300 dark:focus:ring-stone-700"
                  title={link.title || 'Odkaz'}
                >
                  {link.title || 'Odkaz'}
                </a>
              ) : (
                <input
                  value={link.title}
                  onChange={(event) => onChange(link.id, { title: event.target.value })}
                  placeholder="Odkaz"
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:ring-stone-700"
                />
              )}
              <button type="button" onClick={() => onDelete(link.id)} className="h-9 w-9 rounded-lg text-stone-400 hover:bg-white hover:text-red-600 dark:hover:bg-stone-900">×</button>
            </div>
            <textarea value={link.notes} onChange={(event) => onChange(link.id, { notes: event.target.value })} placeholder="Poznámka k odkazu" rows={2} className="w-full resize-none rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:ring-stone-700" />
          </div>
        )) : <p className="rounded-xl bg-stone-50 px-3 py-4 text-sm text-stone-500 dark:bg-stone-950 dark:text-stone-400">Zatiaľ nie sú pridané žiadne odkazy.</p>}
      </div>
    </section>
  );
}

function RoomList({ rooms, globalSection, selectedId, onSelect, onRename, onDelete, onAddRoom }) {
  const selectedRoomCardClasses = 'border-amber-500 bg-amber-100 text-stone-950 shadow-[inset_4px_0_0_rgb(245,158,11),0_10px_24px_rgba(245,158,11,0.2)] ring-2 ring-amber-300 dark:border-amber-300 dark:bg-amber-500/20 dark:text-amber-50 dark:shadow-[inset_4px_0_0_rgb(252,211,77),0_10px_24px_rgba(245,158,11,0.28)] dark:ring-amber-400/50';
  const idleRoomCardClasses = 'border-stone-200 bg-white hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800';
  const [newRoom, setNewRoom] = useState('');
  const [editingRoomId, setEditingRoomId] = useState(null);
  const submit = (event) => {
    event.preventDefault();
    const name = newRoom.trim();
    if (!name) return;
    onAddRoom(name);
    setNewRoom('');
  };
  const taskSummary = (room) => {
    const count = openTaskCount(room);
    if (!count) return 'bez aktívnych úloh';
    if (count === 1) return '1 aktívna úloha';
    if (count < 5) return `${count} aktívne úlohy`;
    return `${count} aktívnych úloh`;
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-stone-200 bg-white md:w-80 dark:border-stone-800 dark:bg-stone-900">
      <div className="border-b border-stone-200 p-3 dark:border-stone-800">
        <button
          type="button"
          onClick={() => onSelect('global')}
          className={`mb-3 flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition ${selectedId === 'global' ? selectedRoomCardClasses : idleRoomCardClasses}`}
        >
          <span className="min-w-0">
            <span className={`block truncate font-semibold ${selectedId === 'global' ? 'text-stone-950 dark:text-amber-50' : 'text-stone-900 dark:text-stone-100'}`}>Celý byt</span>
            <span className={`block truncate text-xs ${selectedId === 'global' ? 'font-medium text-amber-900 dark:text-amber-100' : 'text-stone-500 dark:text-stone-400'}`}>Spoločné poznámky</span>
          </span>
          {openTaskCount(globalSection) ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-200" title={taskSummary(globalSection)}>{openTaskCount(globalSection)}</span>
          ) : null}
        </button>
        <form onSubmit={submit} className="flex gap-2">
          <input value={newRoom} onChange={(event) => setNewRoom(event.target.value)} placeholder="Nová miestnosť" className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-base text-stone-900 outline-none focus:border-stone-400 focus:bg-white focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:ring-stone-700" />
          <Button type="submit">Pridať</Button>
        </form>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {rooms.map((room) => {
            const isSelected = selectedId === room.id;
            const isEditing = editingRoomId === room.id;
            const activeTasks = openTaskCount(room);

            return (
              <div key={room.id} className={`group flex items-center gap-2 rounded-2xl border px-3 py-2 transition ${isSelected ? selectedRoomCardClasses : idleRoomCardClasses}`}>
                {isEditing ? (
                  <input
                    value={room.name}
                    autoFocus
                    onChange={(event) => onRename(room.id, event.target.value)}
                    onBlur={() => setEditingRoomId(null)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') setEditingRoomId(null); }}
                    className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm font-medium text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:ring-stone-700"
                  />
                ) : (
                  <button type="button" onClick={() => onSelect(room.id)} className="min-w-0 flex-1 py-1 text-left">
                    <span className={`block truncate font-medium ${isSelected ? 'text-stone-950 dark:text-amber-50' : 'text-stone-900 dark:text-stone-100'}`}>{room.name}</span>
                    {activeTasks ? <span className={`block truncate text-xs ${isSelected ? 'font-medium text-amber-900 dark:text-amber-100' : 'text-stone-500 dark:text-stone-400'}`}>{taskSummary(room)}</span> : null}
                  </button>
                )}
                {activeTasks ? (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-200" title={taskSummary(room)}>{activeTasks}</span>
                ) : null}
                <button type="button" onClick={() => setEditingRoomId(room.id)} className="h-8 w-8 rounded-lg text-stone-400 hover:bg-white hover:text-stone-700 dark:hover:bg-stone-900 dark:hover:text-stone-100" title="Premenovať miestnosť">✎</button>
                <button type="button" onClick={() => onDelete(room.id)} className="h-8 w-8 rounded-lg text-stone-400 hover:bg-white hover:text-red-600 dark:hover:bg-stone-900 dark:hover:text-red-400" title="Vymazať miestnosť">×</button>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}



function MoodBoard({ open, title, images, isGlobal, mode, boardWidth, onModeChange, onWidthChange, onToggle, onAddImages, onRemoveImage, onMoveImage }) {
  const fileRef = useRef(null);
  const resizeRef = useRef({ startX: 0, startWidth: DEFAULT_BOARD_WIDTH });
  const dragStateRef = useRef({ ids: [], targetId: '', placement: 'before' });
  const [draggedId, setDraggedId] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const [dropHint, setDropHint] = useState({ targetId: '', placement: 'before' });
  const [previewOrder, setPreviewOrder] = useState([]);
  const [imageShapes, setImageShapes] = useState({});
  const shouldStretchLandscape = mode === 'dense' && boardWidth <= 520;
  const previewImages = useMemo(() => {
    if (!draggedId || !previewOrder.length) return images;
    const byId = new Map(images.map((image) => [image.id, image]));
    const ordered = previewOrder.map((id) => byId.get(id)).filter(Boolean);
    const orderedIds = new Set(ordered.map((image) => image.id));
    return [...ordered, ...images.filter((image) => !orderedIds.has(image.id))];
  }, [draggedId, images, previewOrder]);

  const rememberImageShape = (id, event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    const shape = naturalWidth / naturalHeight >= 1.18 ? 'landscape' : 'default';
    setImageShapes((current) => current[id] === shape ? current : { ...current, [id]: shape });
  };

  const addFiles = (files) => {
    const imageFiles = Array.from(files || []).filter((file) => file.type?.startsWith('image/'));
    if (imageFiles.length) onAddImages(imageFiles);
  };

  const moveIdForPreview = (ids, sourceId, targetId, placement = 'before') => {
    const next = ids.filter((id) => id !== sourceId);
    const targetIndex = next.indexOf(targetId);
    if (targetIndex < 0) return ids;
    next.splice(placement === 'after' ? targetIndex + 1 : targetIndex, 0, sourceId);
    return next;
  };

  const sameOrder = (first, second) => first.length === second.length && first.every((id, index) => id === second[index]);

  const clearDragPreview = () => {
    dragStateRef.current = { ids: [], targetId: '', placement: 'before' };
    setDraggedId('');
    setDropHint({ targetId: '', placement: 'before' });
    setPreviewOrder([]);
  };

  const startImageDrag = (event, imageId) => {
    const ids = images.map((image) => image.id);
    dragStateRef.current = { ids, targetId: imageId, placement: 'before' };
    setDraggedId(imageId);
    setPreviewOrder(ids);
    setDropHint({ targetId: imageId, placement: 'before' });
    event.dataTransfer.setData('text/plain', imageId);
    event.dataTransfer.effectAllowed = 'move';
  };

  const previewMove = (event, targetId) => {
    const sourceId = event.dataTransfer.getData('text/plain') || draggedId;
    if (!sourceId || sourceId === targetId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
    const baseIds = dragStateRef.current.ids.length ? dragStateRef.current.ids : images.map((image) => image.id);
    const nextOrder = moveIdForPreview(baseIds, sourceId, targetId, placement);
    dragStateRef.current = { ids: nextOrder, targetId, placement };
    setDropHint((current) => current.targetId === targetId && current.placement === placement ? current : { targetId, placement });
    setPreviewOrder((current) => sameOrder(current, nextOrder) ? current : nextOrder);
  };

  const handleDropOnBoard = (event) => {
    event.preventDefault();
    setDropActive(false);
    if (!isGlobal && event.dataTransfer.files?.length) {
      addFiles(event.dataTransfer.files);
      clearDragPreview();
      return;
    }

    clearDragPreview();
  };

  const handleItemDragOver = (event, targetId) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    previewMove(event, targetId);
  };

  const handleItemDrop = (event, targetId) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isGlobal && event.dataTransfer.files?.length) {
      addFiles(event.dataTransfer.files);
      clearDragPreview();
      setDropActive(false);
      return;
    }

    const sourceId = event.dataTransfer.getData('text/plain') || draggedId;
    const { targetId: previewTargetId, placement } = dragStateRef.current;
    clearDragPreview();
    const finalTargetId = previewTargetId || targetId;
    if (sourceId && sourceId !== finalTargetId) onMoveImage(sourceId, finalTargetId, placement);
  };

  const startResize = (event) => {
    event.preventDefault();
    resizeRef.current = { startX: event.clientX, startWidth: boardWidth };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const resizeBoard = (event) => {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    const nextWidth = resizeRef.current.startWidth + event.clientX - resizeRef.current.startX;
    onWidthChange(clampBoardWidth(nextWidth));
  };

  return (
    <aside
      className={`relative hidden min-h-0 shrink-0 overflow-hidden border-r border-stone-200 bg-stone-50 transition-[width,transform,opacity] duration-300 ease-out dark:border-stone-800 dark:bg-stone-950 md:flex ${open ? 'min-w-72 translate-x-0 opacity-100' : 'w-0 -translate-x-6 opacity-0'}`}
      style={open ? { width: `${boardWidth}px` } : undefined}
      aria-hidden={!open}
    >
      <div className="pointer-events-none absolute left-0 top-20 h-12 w-1 rounded-r-full bg-stone-800 dark:bg-stone-100" />
      <div
        className={`relative flex h-full w-full min-w-72 shrink-0 flex-col p-3 transition-colors ${dropActive ? 'bg-stone-100 ring-2 ring-inset ring-amber-300 dark:bg-stone-900' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          const hasFiles = Array.from(event.dataTransfer.types || []).includes('Files');
          event.dataTransfer.dropEffect = hasFiles ? 'copy' : 'move';
          if (!isGlobal && hasFiles) setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={handleDropOnBoard}
      >
        {dropActive ? (
          <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-amber-400 bg-amber-100/80 text-sm font-semibold text-amber-950 shadow-2xl backdrop-blur-sm dark:bg-amber-900/70 dark:text-amber-50">
            Pustite obrázky sem
          </div>
        ) : null}
        <div className="mb-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Moodboard</p>
              <h3 className="truncate text-lg font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
            </div>
            <button type="button" onClick={onToggle} className="h-9 w-9 rounded-xl text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" title="Skryť moodboard">‹</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-950">
            <button type="button" onClick={() => onModeChange('whole')} className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${mode === 'whole' ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-stone-100' : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'}`}>Celé fotky</button>
            <button type="button" onClick={() => onModeChange('dense')} className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${mode === 'dense' ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-stone-100' : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'}`}>Dense</button>
          </div>
          {mode === 'whole' ? (
            <p className="mt-3 text-xs leading-5 text-stone-500 dark:text-stone-400">
              {isGlobal ? 'Celý byt automaticky spája obrázky zo všetkých miestností. Poradie upravíte presunutím kariet.' : 'Presuňte sem obrázky alebo ich nahrajte. Poradie upravíte drag-dropom.'}
            </p>
          ) : null}
          {!isGlobal ? (
            <>
              <Button onClick={() => fileRef.current?.click()} className="mt-3 w-full border-stone-800 bg-stone-800 !text-white hover:bg-stone-700 dark:border-stone-200 dark:bg-stone-100 dark:!text-stone-900 dark:hover:bg-white">Pridať obrázky</Button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
            </>
          ) : null}
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto ${mode === 'whole' ? 'space-y-3 pr-1' : ''}`}>
          {images.length ? (mode === 'whole' ? previewImages.map((image, index) => (
            <article
              key={image.id}
              draggable
              onDragStart={(event) => startImageDrag(event, image.id)}
              onDragEnd={clearDragPreview}
              onDragOver={(event) => handleItemDragOver(event, image.id)}
              onDragEnter={(event) => previewMove(event, image.id)}
              onDrop={(event) => handleItemDrop(event, image.id)}
              className={`group cursor-grab overflow-hidden rounded-2xl border bg-white shadow-sm transition duration-150 active:cursor-grabbing dark:bg-stone-900 ${draggedId === image.id ? 'scale-[0.98] border-amber-400 opacity-60 shadow-inner ring-2 ring-amber-300/60 dark:border-amber-300' : dropHint.targetId === image.id ? 'border-amber-400 shadow-lg ring-2 ring-amber-300/60 dark:border-amber-300' : 'border-stone-200 hover:-translate-y-0.5 hover:shadow-md dark:border-stone-800'}`}
            >
              <div className="relative bg-stone-100 dark:bg-stone-800">
                {image.src ? (
                  <img src={image.src} alt={image.name || `Moodboard ${index + 1}`} className="max-h-[32rem] w-full object-contain" />
                ) : (
                  <div className="flex min-h-40 items-center justify-center p-4 text-center text-sm font-medium text-red-700 dark:text-red-200">Obrázok sa nepodarilo obnoviť z lokálneho úložiska.</div>
                )}
                <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white">{index + 1}</div>
                {!isGlobal ? <button type="button" onClick={() => onRemoveImage(image.id)} className="absolute right-2 top-2 h-8 w-8 rounded-full bg-black/55 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100" title="Odstrániť obrázok">×</button> : null}
              </div>
              <div className="relative flex items-center justify-between gap-2 px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                {dropHint.targetId === image.id && dropHint.placement === 'after' ? <div className="absolute inset-x-3 -top-0.5 h-1 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)]" /> : null}
                <span className="min-w-0 truncate">{image.roomName || image.name || 'Obrázok'}</span>
                <span className="select-none rounded-full bg-stone-100 px-2 py-1 transition group-active:bg-amber-100 dark:bg-stone-800 dark:group-active:bg-amber-900/50">↕ chytiť</span>
              </div>
            </article>
          )) : (
            <div className="[column-gap:3px] [column-width:14rem]">
              {previewImages.map((image, index) => {
                const stretchLandscape = shouldStretchLandscape && imageShapes[image.id] === 'landscape';

                return (
                  <button
                    key={image.id}
                    type="button"
                    draggable
                    aria-label={`Presunúť obrázok ${index + 1}`}
                    onDragStart={(event) => startImageDrag(event, image.id)}
                    onDragEnd={clearDragPreview}
                    onDragOver={(event) => handleItemDragOver(event, image.id)}
                    onDragEnter={(event) => previewMove(event, image.id)}
                    onDrop={(event) => handleItemDrop(event, image.id)}
                    className={`relative mb-[2px] block w-full cursor-grab break-inside-avoid overflow-hidden p-0 leading-none transition duration-150 active:cursor-grabbing ${stretchLandscape ? '[column-span:all]' : ''} ${draggedId === image.id ? 'scale-[0.98] opacity-55 ring-2 ring-amber-300/70' : ''} ${dropHint.targetId === image.id ? 'ring-2 ring-amber-300/70' : ''}`}
                  >
                    {image.src ? (
                      <img src={image.src} alt="" onLoad={(event) => rememberImageShape(image.id, event)} className="block h-auto w-full" />
                    ) : (
                      <span className="block rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium leading-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">Chýba lokálny obrázok</span>
                    )}
                  </button>
                );
              })}
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
              {isGlobal ? 'Zatiaľ nie sú pridané žiadne obrázky v miestnostiach.' : 'Zatiaľ prázdny moodboard. Pretiahnite sem obrázky alebo použite tlačidlo Pridať obrázky.'}
            </div>
          )}
        </div>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Zmeniť šírku moodboardu"
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-transparent transition hover:bg-amber-400/50"
        onPointerDown={startResize}
        onPointerMove={resizeBoard}
      />
    </aside>
  );
}

function MobileMoodBoard({ title, images, isGlobal, mode, onModeChange, onAddImages, onRemoveImage, onMoveImage }) {
  const fileRef = useRef(null);
  const [imageShapes, setImageShapes] = useState({});
  const shouldStretchLandscape = mode === 'dense';
  const rememberImageShape = (id, event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    const shape = naturalWidth / naturalHeight >= 1.18 ? 'landscape' : 'default';
    setImageShapes((current) => current[id] === shape ? current : { ...current, [id]: shape });
  };
  const addFiles = (files) => {
    const imageFiles = Array.from(files || []).filter((file) => file.type?.startsWith('image/'));
    if (imageFiles.length) onAddImages(imageFiles);
  };
  const moveImageByStep = (index, step) => {
    const target = images[index + step];
    const source = images[index];
    if (!source || !target) return;
    onMoveImage(source.id, target.id, step > 0 ? 'after' : 'before');
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20 md:hidden">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">Moodboard</p>
          <h3 className="truncate text-lg font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
          <p className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-300">
            {isGlobal ? 'Prehľad obrázkov zo všetkých miestností.' : 'Rovnaké obrázky ako na desktope, optimalizované pre dotyk.'}
          </p>
        </div>
        {!isGlobal ? (
          <>
            <Button onClick={() => fileRef.current?.click()} className="shrink-0 border-stone-800 bg-stone-800 !text-white hover:bg-stone-700 dark:border-stone-200 dark:bg-stone-100 dark:!text-stone-900 dark:hover:bg-white">Pridať</Button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
          </>
        ) : null}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-white/80 p-1 dark:bg-stone-950/80">
        <button type="button" onClick={() => onModeChange('whole')} className={`min-h-10 rounded-lg px-2 py-2 text-sm font-semibold transition ${mode === 'whole' ? 'bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900' : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100'}`}>Celé fotky</button>
        <button type="button" onClick={() => onModeChange('dense')} className={`min-h-10 rounded-lg px-2 py-2 text-sm font-semibold transition ${mode === 'dense' ? 'bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900' : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100'}`}>Dense</button>
      </div>
      {images.length ? (mode === 'whole' ? (
        <div className="space-y-3">
          {images.map((image, index) => (
            <article key={image.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <div className="relative bg-stone-100 dark:bg-stone-800">
                {image.src ? <img src={image.src} alt={image.name || `Moodboard ${index + 1}`} className="max-h-[70dvh] w-full object-contain" /> : <div className="flex min-h-40 items-center justify-center p-4 text-center text-sm font-medium text-red-700 dark:text-red-200">Obrázok sa nepodarilo obnoviť z lokálneho úložiska.</div>}
                <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white">{index + 1}</div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                <span className="min-w-0 flex-1 truncate">{image.roomName || image.name || 'Obrázok'}</span>
                <button type="button" onClick={() => moveImageByStep(index, -1)} disabled={index === 0} className="h-9 w-9 rounded-lg bg-stone-100 text-base disabled:opacity-30 dark:bg-stone-800" aria-label="Posunúť obrázok vyššie">↑</button>
                <button type="button" onClick={() => moveImageByStep(index, 1)} disabled={index === images.length - 1} className="h-9 w-9 rounded-lg bg-stone-100 text-base disabled:opacity-30 dark:bg-stone-800" aria-label="Posunúť obrázok nižšie">↓</button>
                {!isGlobal ? <button type="button" onClick={() => onRemoveImage(image.id)} className="h-9 w-9 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-200" aria-label="Odstrániť obrázok">×</button> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="columns-2 gap-1">
          {images.map((image, index) => (
            <div key={image.id} className={`mb-1 break-inside-avoid overflow-hidden rounded-xl bg-white dark:bg-stone-900 ${shouldStretchLandscape && imageShapes[image.id] === 'landscape' ? '[column-span:all]' : ''}`}>
              {image.src ? <img src={image.src} alt={image.name || `Moodboard ${index + 1}`} onLoad={(event) => rememberImageShape(image.id, event)} className="block h-auto w-full" /> : <span className="block border border-red-200 bg-red-50 p-3 text-xs font-medium leading-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">Chýba lokálny obrázok</span>}
            </div>
          ))}
        </div>
      )) : (
        <div className="rounded-2xl border border-dashed border-amber-300 bg-white/80 px-4 py-8 text-center text-sm text-stone-600 dark:border-amber-800 dark:bg-stone-900/80 dark:text-stone-300">
          {isGlobal ? 'Zatiaľ nie sú pridané žiadne obrázky v miestnostiach.' : 'Zatiaľ prázdny moodboard. Použite Pridať a nahrajte obrázky priamo z mobilu.'}
        </div>
      )}
    </section>
  );
}

function TextModal({ value, onChange, onClose, onCopy, onDownload, onImport, onReset }) {
  return (
    <div className="fixed inset-0 z-[70] flex bg-black/50 p-3 md:items-center md:justify-center" onClick={onClose}>
      <div className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-stone-900" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Textový import / export</h2>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Kompletný upraviteľný formát pre zdieľané poznámky.</p>
            </div>
            <button type="button" onClick={onClose} className="h-10 w-10 rounded-xl text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800">×</button>
          </div>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.2fr]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950">
              <h3 className="font-semibold text-stone-900 dark:text-stone-100">Pravidlá formátu</h3>
              <div className="mt-3 space-y-3 text-sm leading-6 text-stone-700 dark:text-stone-300">
                <p><strong>Sekcie:</strong> použite <code>## Celý byt</code> raz a <code>## Miestnosť: Názov miestnosti</code> pre každú miestnosť. Poradie miestností v texte sa zachová v aplikácii.</p>
                <p><strong>Textové polia:</strong> <code>Poznámky:</code>, <code>Rozmery:</code> a <code>Rozhodnutia:</code> môžu mať viac riadkov. Obsah sa načíta po ďalší názov poľa alebo sekciu.</p>
                <p><strong>Úlohy:</strong> pod <code>Úlohy:</code> použite <code>- [ ] Text úlohy</code> pre otvorenú úlohu a <code>- [x] Text úlohy</code> pre hotovú úlohu.</p>
                <p><strong>Odkazy:</strong> pod <code>Odkazy:</code> použite <code>- Názov | URL | Voliteľná poznámka</code>. Ďalšie zvislé čiary po URL zostanú v poznámke.</p>
                <p><strong>Import:</strong> import nahradí aktuálny zápisník a zosynchronizuje ho so zdieľanou stránkou. JSON zostáva dostupný ako presná štruktúrovaná záloha.</p>
              </div>
            </div>
            <details className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
              <summary className="cursor-pointer font-semibold text-stone-900 dark:text-stone-100">Ukážkový formát</summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-stone-900 p-3 text-xs leading-5 text-stone-100 dark:bg-stone-950">{TEXT_EXAMPLE}</pre>
            </details>
          </section>
          <section className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={onReset}>Načítať aktuálne</Button>
              <Button onClick={onCopy}>Kopírovať text</Button>
              <Button onClick={onDownload}>Stiahnuť .txt</Button>
              <Button onClick={onImport} className="border-stone-800 bg-stone-800 text-white hover:bg-stone-700 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white">Importovať text</Button>
            </div>
            <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck="false" className="min-h-[62dvh] w-full resize-y rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3 font-mono text-sm leading-6 text-stone-900 outline-none focus:border-stone-400 focus:bg-white focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-700" />
          </section>
        </div>
      </div>
    </div>
  );
}

export default function FlatNotesAppV2() {
  const [notebook, setNotebook] = useState(loadNotebook);
  const [selectedId, setSelectedId] = useState('global');
  const [roomCode, setRoomCode] = useState(() => getHashRoom() || DEFAULT_ROOM);
  const [joinCode, setJoinCode] = useState('');
  const [syncState, setSyncState] = useState({ phase: 'connecting' });
  const [localSaveState, setLocalSaveState] = useState({ ok: true, pending: true, savedAt: 0, errorMessage: '' });
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [textModal, setTextModal] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [theme, setTheme] = useState(loadTheme);
  const [boardOpen, setBoardOpen] = useState(loadBoardOpen);
  const [boardMode, setBoardMode] = useState(loadBoardMode);
  const [boardWidth, setBoardWidth] = useState(loadBoardWidth);
  const fileRef = useRef(null);
  const notebookRef = useRef(notebook);
  const localEditRef = useRef(false);
  const firstRemoteRef = useRef(true);
  const lastRemoteRef = useRef(0);
  const writeTimerRef = useRef(null);
  const noticeTimerRef = useRef(null);

  useEffect(() => { document.title = 'FlatNotes'; }, []);
  useEffect(() => {
    let cancelled = false;
    notebookRef.current = notebook;
    setLocalSaveState((current) => ({ ...current, pending: true }));
    saveNotebook(notebook).then((result) => {
      if (!cancelled) setLocalSaveState({ ...result, pending: false });
    });
    return () => { cancelled = true; };
  }, [notebook]);

  useEffect(() => {
    let cancelled = false;
    loadNotebookImages(notebookRef.current)
      .then((hydrated) => {
        if (cancelled) return;
        setNotebook((current) => {
          const currentIds = notebookImageIds(current).join('|');
          const hydratedIds = notebookImageIds(hydrated).join('|');
          if (currentIds !== hydratedIds) return current;
          return hydrated;
        });
      })
      .catch((error) => {
        console.warn('Nepodarilo sa obnoviť obrázky z IndexedDB:', error);
        setLocalSaveState({ ok: false, pending: false, savedAt: 0, errorMessage: describeError(error) });
      });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(BOARD_OPEN_STORAGE_KEY, String(boardOpen));
    } catch {
      // Ignore localStorage errors.
    }
  }, [boardOpen]);
  useEffect(() => {
    try {
      localStorage.setItem(BOARD_MODE_STORAGE_KEY, boardMode);
    } catch {
      // Ignore localStorage errors.
    }
  }, [boardMode]);
  useEffect(() => {
    try {
      localStorage.setItem(BOARD_WIDTH_STORAGE_KEY, String(boardWidth));
    } catch {
      // Ignore localStorage errors.
    }
  }, [boardWidth]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore localStorage errors.
    }
  }, [theme]);

  const showNotice = (message) => {
    setNotice(message);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 1600);
  };

  useEffect(() => () => {
    window.clearTimeout(writeTimerRef.current);
    window.clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!roomCode) { setSyncState({ phase: 'local' }); return undefined; }
    if (!isNotesFirebaseConfigured()) { setSyncState({ phase: 'configError' }); return undefined; }
    if (!initNotesFirebase()) { setSyncState({ phase: 'initError' }); return undefined; }

    firstRemoteRef.current = true;
    setHashRoom(roomCode);
    setSyncState({ phase: 'connecting' });

    return subscribeToNotesRoom(
      roomCode,
      (remote) => {
        if (!remote) {
          firstRemoteRef.current = false;
          setSyncState({ phase: 'seeding' });
          writeNotesRoom(roomCode, stripNotebookImagePayloads(notebookRef.current))
            .then(() => {
              const now = Date.now();
              lastRemoteRef.current = Math.max(notebookRef.current.updatedAt || 0, now);
              localEditRef.current = false;
              setSyncState({ phase: 'synced', lastSuccessAt: now });
            })
            .catch((error) => setSyncState({
              phase: 'writeError',
              errorMessage: describeFirebaseError(error),
            }));
          return;
        }

        const remoteNotebook = normalizeNotebook(remote);
        const first = firstRemoteRef.current;
        firstRemoteRef.current = false;
        localEditRef.current = false;
        lastRemoteRef.current = remoteNotebook.updatedAt || Date.now();
        setNotebook((current) => {
          if (first) {
            localEditRef.current = true;
            return mergeNotebooks(current, remoteNotebook);
          }
          return (remoteNotebook.updatedAt || 0) >= (current.updatedAt || 0) ? mergeNotebooks(current, remoteNotebook) : current;
        });
        setSyncState({ phase: 'synced', lastSuccessAt: Date.now() });
      },
      (error) => setSyncState({
        phase: 'readError',
        errorMessage: describeFirebaseError(error),
      }),
    );
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !localEditRef.current) return undefined;
    if ((notebook.updatedAt || 0) <= lastRemoteRef.current) return undefined;
    setSyncState((current) => ({ phase: 'pending', lastSuccessAt: current.lastSuccessAt }));
    window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => {
      setSyncState((current) => ({ phase: 'saving', lastSuccessAt: current.lastSuccessAt }));
      writeNotesRoom(roomCode, stripNotebookImagePayloads(notebook))
        .then(() => {
          const now = Date.now();
          lastRemoteRef.current = Math.max(notebook.updatedAt || 0, now);
          localEditRef.current = false;
          setSyncState({ phase: 'synced', lastSuccessAt: now });
        })
        .catch((error) => setSyncState({
          phase: 'writeError',
          errorMessage: describeFirebaseError(error),
        }));
    }, 450);
    return () => window.clearTimeout(writeTimerRef.current);
  }, [notebook, roomCode]);

  const current = useMemo(
    () => selectedId === 'global' ? notebook.global : notebook.rooms.find((room) => room.id === selectedId) || notebook.rooms[0] || emptyRoom('Miestnosť'),
    [notebook, selectedId],
  );
  const selectedTitle = selectedId === 'global' ? 'Celý byt' : current.name;
  const boardImages = useMemo(() => {
    if (selectedId !== 'global') return arr(current.images);
    const merged = notebook.rooms.flatMap((room) => arr(room.images).map((image) => ({ ...image, roomId: room.id, roomName: room.name })));
    const order = arr(notebook.global?.imageOrder);
    if (!order.length) return merged;
    const position = new Map(order.map((id, index) => [id, index]));
    return [...merged].sort((a, b) => {
      const aPosition = position.has(a.id) ? position.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bPosition = position.has(b.id) ? position.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (aPosition !== bPosition) return aPosition - bPosition;
      return (a.addedAt || 0) - (b.addedAt || 0);
    });
  }, [current, notebook.global?.imageOrder, notebook.rooms, selectedId]);
  const groupLabel = roomCode || 'lokálne';
  const calmSyncState = topbarSyncState(syncState);
  const topbarSyncLabel = notice || compactSyncLabel(calmSyncState);
  const localPersistenceSafe = localSaveState.ok && !localSaveState.pending;
  const topbarSyncDetail = localPersistenceSafe ? (notice || syncDetail(syncState)) : 'Lokálne uloženie textu a obrázkov sa ešte overuje alebo zlyhalo.';
  const detailSyncLabel = notice || syncLabel(syncState);
  const localSaveDetail = localSaveState.pending
    ? 'Kontrolujem lokálnu kópiu textu aj obrázkov v tomto prehliadači…'
    : localSaveState.ok
      ? `Lokálna kópia vrátane obrázkov je overená v tomto prehliadači${localSaveState.savedAt ? ` · ${formatSyncTime(localSaveState.savedAt)}` : ''}.`
      : `Pozor: lokálne uloženie textu alebo obrázkov zlyhalo. Detail: ${localSaveState.errorMessage || 'neznáma chyba'}`;
  const detailSyncDetail = [notice || syncDetail(syncState), localSaveDetail].filter(Boolean).join(' ');
  const topbarSyncClasses = syncToneClasses(localPersistenceSafe ? calmSyncState.phase : 'writeError');
  const detailSyncClasses = syncToneClasses(localPersistenceSafe ? syncState.phase : 'writeError');

  const mutate = (producer) => {
    localEditRef.current = true;
    setNotebook((prev) => normalizeNotebook({ ...producer(prev), updatedAt: Date.now() }));
  };
  const patchCurrent = (patch) => mutate((prev) => selectedId === 'global'
    ? { ...prev, global: { ...prev.global, ...patch } }
    : { ...prev, rooms: prev.rooms.map((room) => room.id === selectedId ? { ...room, ...patch } : room) });
  const updateCollection = (key, updater) => patchCurrent({ [key]: updater(arr(current[key])) });
  const readImageFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: makeId('image'), src: reader.result, name: file.name || '', addedAt: Date.now() });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const addBoardImages = async (files) => {
    if (selectedId === 'global') return;
    const targetRoomId = selectedId;
    const images = await Promise.all(Array.from(files || []).map(readImageFile));
    if (!images.length) return;
    mutate((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room) => room.id === targetRoomId ? { ...room, images: [...arr(room.images), ...images] } : room),
    }));
  };
  const removeBoardImage = (id) => {
    if (selectedId === 'global') return;
    updateCollection('images', (images) => images.filter((image) => image.id !== id));
  };
  const moveInOrder = (ids, sourceId, targetId, placement = 'before') => {
    const next = ids.filter((id) => id !== sourceId);
    const targetIndex = next.indexOf(targetId);
    if (targetIndex < 0) return ids;
    next.splice(placement === 'after' ? targetIndex + 1 : targetIndex, 0, sourceId);
    return next;
  };
  const moveBoardImage = (sourceId, targetId, placement = 'before') => {
    if (selectedId === 'global') {
      mutate((prev) => {
        const allIds = prev.rooms.flatMap((room) => arr(room.images).map((image) => image.id));
        const ordered = arr(prev.global?.imageOrder).filter((id) => allIds.includes(id));
        const ids = [...ordered, ...allIds.filter((id) => !ordered.includes(id))];
        return { ...prev, global: { ...prev.global, imageOrder: moveInOrder(ids, sourceId, targetId, placement) } };
      });
      return;
    }
    updateCollection('images', (images) => {
      const byId = new Map(images.map((image) => [image.id, image]));
      return moveInOrder(images.map((image) => image.id), sourceId, targetId, placement).map((id) => byId.get(id)).filter(Boolean);
    });
  };
  const addRoom = (name) => mutate((prev) => {
    const room = emptyRoom(name);
    setSelectedId(room.id);
    return { ...prev, rooms: [...prev.rooms, room] };
  });
  const renameRoom = (id, name) => mutate((prev) => ({ ...prev, rooms: prev.rooms.map((room) => room.id === id ? { ...room, name } : room) }));
  const deleteRoom = (id) => mutate((prev) => {
    const rooms = prev.rooms.filter((room) => room.id !== id);
    if (selectedId === id) setSelectedId('global');
    return { ...prev, rooms: rooms.length ? rooms : createNotebook().rooms };
  });

  const download = (content, filename) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportJson = () => download(JSON.stringify(notebook, null, 2), `flat-notes-${new Date().toISOString().slice(0, 10)}.json`);
  const importJson = async (file) => {
    if (!file) return;
    try {
      const imported = normalizeNotebook(JSON.parse(await file.text()));
      mutate(() => imported);
      showNotice('JSON bol importovaný');
    } catch (error) {
      window.alert(`Import zlyhal: ${error.message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const openText = () => { setTextDraft(notebookToText(notebook)); setTextModal(true); };
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(textDraft);
      showNotice('Text bol skopírovaný');
    } catch {
      window.prompt('Skopírujte tento text:', textDraft);
    }
  };
  const importText = () => {
    try {
      const parsed = textToNotebook(textDraft);
      mutate(() => parsed);
      setTextModal(false);
      showNotice('Text bol importovaný');
    } catch (error) {
      window.alert(`Import textu zlyhal: ${error.message}`);
    }
  };
  const copyShare = async () => {
    const href = `${window.location.origin}${window.location.pathname}#/notes?room=${encodeURIComponent(roomCode)}`;
    try {
      await navigator.clipboard.writeText(href);
      showNotice('Odkaz na zdieľanie bol skopírovaný');
      setShareMenuOpen(false);
    } catch {
      window.prompt('Skopírujte tento odkaz:', href);
      setShareMenuOpen(false);
    }
  };
  const createRoom = () => {
    const code = generateNotesRoomCode();
    setRoomCode(code);
    setHashRoom(code);
    setShareMenuOpen(false);
  };
  const joinRoom = (event) => {
    event.preventDefault();
    const code = joinCode.trim().toLowerCase();
    if (!code) return;
    setRoomCode(code);
    setHashRoom(code);
    setJoinCode('');
    setShareMenuOpen(false);
  };
  const sharedPage = () => { setRoomCode(DEFAULT_ROOM); setHashRoom(DEFAULT_ROOM); setShareMenuOpen(false); };
  const toggleTheme = () => setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark');

  return (
    <div className="flex h-screen min-h-0 flex-col bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="safe-top flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-3 py-3 dark:border-stone-800 dark:bg-stone-900 md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => setMobileNav(true)} className="h-10 w-10 rounded-xl border border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200 md:hidden">☰</button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold md:text-xl">FlatNotes</h1>
            <p className="truncate text-xs text-stone-500 dark:text-stone-400">Zdieľané poznámky, odkazy, úlohy a rozhodnutia k bytu</p>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="relative flex items-center gap-2 rounded-2xl bg-stone-100 px-2 py-1 dark:bg-stone-950">
            <span className="inline-flex max-w-[9rem] items-center gap-1.5 truncate rounded-full bg-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200" title={`Skupina: ${groupLabel}`}>
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-stone-400" />
              {groupLabel}
            </span>
            <span className={`inline-flex max-w-[16rem] items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-xs font-semibold ${topbarSyncClasses.badge}`} title={topbarSyncDetail || topbarSyncLabel}>
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${topbarSyncClasses.dot}`} />
              {topbarSyncLabel}
            </span>
            <Button onClick={() => setShareMenuOpen((open) => !open)} title="Spravovať zdieľanie">
              Spravovať ▾
            </Button>
            {shareMenuOpen ? (
              <>
                <button type="button" aria-label="Zavrieť zdieľanie" className="fixed inset-0 z-20 cursor-default bg-transparent" onClick={() => setShareMenuOpen(false)} />
                <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-1rem))] rounded-2xl border border-stone-200 bg-white p-3 shadow-2xl dark:border-stone-700 dark:bg-stone-900">
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Skupina</p>
                    <p className="mt-1 truncate text-sm font-medium text-stone-800 dark:text-stone-100">{groupLabel}</p>
                    <p className={`mt-1 text-xs font-semibold ${detailSyncClasses.text}`}>{detailSyncLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{detailSyncDetail}</p>
                    {ERROR_PHASES.has(syncState.phase) || !localSaveState.ok ? (
                      <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:bg-red-950/40 dark:text-red-200">
                        {localSaveState.ok
                          ? <>Čo spraviť: cloudové zdieľanie zlyhalo, ale lokálna kópia zostáva uložená v tomto prehliadači. Skontrolujte Firebase Realtime Database pravidlá pre <code className="font-mono">roomNotes/{groupLabel}</code>, sieť/ad-blocker a či poznámky s obrázkami nie sú príliš veľké.</>
                          : <>Čo spraviť: lokálne uloženie zlyhalo, pravdepodobne pre limit úložiska alebo blokovanie prehliadačom. Exportujte poznámky ako text/JSON a zmenšite alebo odstráňte veľké obrázky.</>}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button onClick={copyShare} className="w-full">Kopírovať odkaz</Button>
                    {roomCode !== DEFAULT_ROOM ? <Button onClick={sharedPage} className="w-full">Zdieľaná stránka</Button> : null}
                    <Button onClick={createRoom} className="w-full">Nová skupina</Button>
                  </div>
                  <form onSubmit={joinRoom} className="mt-3 flex gap-2">
                    <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Kód skupiny" className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:ring-stone-700" />
                    <Button type="submit">Pripojiť</Button>
                  </form>
                </div>
              </>
            ) : null}
          </div>
          <a href="#/analyzer" className="hidden min-h-10 items-center rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800 sm:inline-flex">Analyzátor</a>
          <Button onClick={toggleTheme}>{theme === 'dark' ? 'Svetlý režim' : 'Tmavý režim'}</Button>
          <Button onClick={openText}>Text</Button>
          <Button onClick={exportJson}>JSON</Button>
          <Button onClick={() => fileRef.current?.click()}>Nahrať</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => importJson(event.target.files?.[0])} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="hidden md:block">
          <RoomList rooms={notebook.rooms} globalSection={notebook.global} selectedId={selectedId} onSelect={setSelectedId} onRename={renameRoom} onDelete={deleteRoom} onAddRoom={addRoom} />
        </div>
        {!boardOpen ? (
          <button type="button" onClick={() => setBoardOpen(true)} className="group hidden w-12 shrink-0 border-r border-amber-300 bg-gradient-to-b from-amber-300 via-orange-300 to-rose-300 text-xs font-black uppercase tracking-[0.25em] text-stone-950 shadow-[0_0_24px_rgba(251,191,36,0.45)] [writing-mode:vertical-rl] hover:from-amber-200 hover:to-rose-200 dark:border-amber-500 dark:from-amber-500 dark:via-orange-500 dark:to-rose-500 dark:text-stone-950 md:block"><span className="inline-block animate-pulse group-hover:animate-none">Moodboard ✦</span></button>
        ) : null}
        <MoodBoard open={boardOpen} title={selectedTitle} images={boardImages} isGlobal={selectedId === 'global'} mode={boardMode} boardWidth={boardWidth} onModeChange={setBoardMode} onWidthChange={setBoardWidth} onToggle={() => setBoardOpen(false)} onAddImages={addBoardImages} onRemoveImage={removeBoardImage} onMoveImage={moveBoardImage} />
        {mobileNav ? (
          <div className="fixed inset-0 z-50 flex bg-black/40 md:hidden" onClick={() => setMobileNav(false)}>
            <div className="w-[88vw] max-w-sm" onClick={(event) => event.stopPropagation()}>
              <RoomList rooms={notebook.rooms} globalSection={notebook.global} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setMobileNav(false); }} onRename={renameRoom} onDelete={deleteRoom} onAddRoom={addRoom} />
            </div>
          </div>
        ) : null}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-3 py-4 md:px-6 md:py-6">
            <section className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">{selectedId === 'global' ? 'celý byt' : 'miestnosť'}</span>
                    <span className="text-xs text-stone-500 dark:text-stone-400">Aktualizované {updatedLabel(notebook.updatedAt)}</span>
                  </div>
                  <h2 className="truncate text-2xl font-semibold">{selectedTitle}</h2>
                </div>

              </div>
            </section>
            <MobileMoodBoard title={selectedTitle} images={boardImages} isGlobal={selectedId === 'global'} mode={boardMode} onModeChange={setBoardMode} onAddImages={addBoardImages} onRemoveImage={removeBoardImage} onMoveImage={moveBoardImage} />
            <div className="mt-4 grid gap-4 lg:mt-0 lg:grid-cols-[1.25fr_0.9fr]">
              <div className="space-y-4">
                <TextAreaCard label="Poznámky" value={current.notes || ''} placeholder={selectedId === 'global' ? 'Poznámky pre celý byt: rozpočet, termíny, kontakty, obmedzenia…' : 'Poznámky k miestnosti: problémy, nápady, veci na overenie…'} rows={10} onChange={(notes) => patchCurrent({ notes })} />
                {selectedId !== 'global' ? (
                  <>
                    <TextAreaCard label="Rozmery" value={current.measurements || ''} placeholder="Rozmery, zásuvky, okná, poloha radiátora, výška stropu…" rows={5} onChange={(measurements) => patchCurrent({ measurements })} />
                    <TextAreaCard label="Rozhodnutia" value={current.decisions || ''} placeholder="Vybrané materiály, rozhodnutia o rozložení, otvorené otázky…" rows={5} onChange={(decisions) => patchCurrent({ decisions })} />
                  </>
                ) : null}
              </div>
              <div className="space-y-4">
                <TaskList tasks={arr(current.tasks)} onAdd={(text) => updateCollection('tasks', (tasks) => [...tasks, { id: makeId('task'), text, done: false }])} onToggle={(id) => updateCollection('tasks', (tasks) => tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task))} onRename={(id, text) => updateCollection('tasks', (tasks) => tasks.map((task) => task.id === id ? { ...task, text } : task))} onDelete={(id) => updateCollection('tasks', (tasks) => tasks.filter((task) => task.id !== id))} />
                <LinkList links={arr(current.links)} onAdd={(link) => updateCollection('links', (links) => [...links, { id: makeId('link'), ...link }])} onChange={(id, patch) => updateCollection('links', (links) => links.map((link) => link.id === id ? { ...link, ...patch } : link))} onDelete={(id) => updateCollection('links', (links) => links.filter((link) => link.id !== id))} />
              </div>
            </div>
          </div>
        </main>
      </div>
      {textModal ? <TextModal value={textDraft} onChange={setTextDraft} onClose={() => setTextModal(false)} onCopy={copyText} onDownload={() => download(textDraft, `flat-notes-${new Date().toISOString().slice(0, 10)}.txt`)} onImport={importText} onReset={() => setTextDraft(notebookToText(notebook))} /> : null}
    </div>
  );
}
