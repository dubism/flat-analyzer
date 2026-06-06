import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  generateNotesRoomCode,
  initNotesFirebase,
  isNotesFirebaseConfigured,
  subscribeToNotesRoom,
  writeNotesRoom,
} from './notesFirebase';

const STORAGE_KEY = 'flat-notes-shared-data';
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
    label: 'Zápis zlyhal — zmeny sú iba v tomto prehliadači',
    detail: 'Firebase nepotvrdil uloženie. Skontrolujte pravidlá, sieť alebo veľkosť poznámok/obrázkov.',
  },
};

const ERROR_PHASES = new Set(['configError', 'initError', 'readError', 'writeError']);

const formatSyncTime = (timestamp) => timestamp
  ? new Intl.DateTimeFormat('sk-SK', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp))
  : '';

const describeFirebaseError = (error) => {
  if (!error) return '';
  const code = error.code ? `${error.code}: ` : '';
  return `${code}${error.message || String(error)}`;
};

const syncLabel = (sync) => {
  const base = sync.message || SYNC_COPY[sync.phase]?.label || 'Synchronizácia';
  const time = sync.lastSuccessAt && sync.phase === 'synced' ? ` · ${formatSyncTime(sync.lastSuccessAt)}` : '';
  return `${base}${time}`;
};

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
const normalizeImages = (images) => arr(images).map((image) => ({
  id: image.id || makeId('image'),
  src: image.src || image.dataUrl || image.url || '',
  name: image.name || '',
  addedAt: image.addedAt || Date.now(),
})).filter((image) => image.src);
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

const loadNotebook = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeNotebook(JSON.parse(raw));
  } catch (error) {
    console.warn('Nepodarilo sa načítať poznámky k bytu:', error);
  }
  return createNotebook();
};

const saveNotebook = (notebook) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notebook));
  } catch (error) {
    console.warn('Nepodarilo sa uložiť poznámky k bytu:', error);
  }
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
        <Button type="submit" className="border-stone-800 bg-stone-800 text-white hover:bg-stone-700 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white">Pridať</Button>
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
        <Button type="submit" className="border-stone-800 bg-stone-800 text-white hover:bg-stone-700 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white">Pridať</Button>
      </form>
      <div className="space-y-3">
        {links.length ? links.map((link) => (
          <div key={link.id} className="rounded-xl border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
            <div className="mb-2 flex gap-2">
              <input value={link.title} onChange={(event) => onChange(link.id, { title: event.target.value })} className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:ring-stone-700" />
              <button type="button" onClick={() => onDelete(link.id)} className="h-9 w-9 rounded-lg text-stone-400 hover:bg-white hover:text-red-600 dark:hover:bg-stone-900">×</button>
            </div>
            <input value={link.url} onChange={(event) => onChange(link.id, { url: event.target.value })} placeholder="URL" className="mb-2 w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:ring-stone-700" />
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
  const [draggedId, setDraggedId] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const [imageShapes, setImageShapes] = useState({});
  const shouldStretchLandscape = mode === 'dense' && boardWidth <= 520;

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

  const handleDropOnBoard = (event) => {
    event.preventDefault();
    setDropActive(false);
    if (!isGlobal && event.dataTransfer.files?.length) {
      addFiles(event.dataTransfer.files);
      return;
    }

    setDraggedId('');
  };

  const handleItemDrop = (event, targetId) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isGlobal && event.dataTransfer.files?.length) {
      addFiles(event.dataTransfer.files);
      setDraggedId('');
      setDropActive(false);
      return;
    }

    const sourceId = event.dataTransfer.getData('text/plain') || draggedId;
    setDraggedId('');
    if (sourceId && sourceId !== targetId) onMoveImage(sourceId, targetId);
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
        className={`flex h-full w-full min-w-72 shrink-0 flex-col p-3 transition-colors ${dropActive ? 'bg-stone-100 dark:bg-stone-900' : ''}`}
        onDragOver={(event) => { event.preventDefault(); if (!isGlobal) setDropActive(true); }}
        onDragLeave={() => setDropActive(false)}
        onDrop={handleDropOnBoard}
      >
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
              <Button onClick={() => fileRef.current?.click()} className="mt-3 w-full border-stone-800 bg-stone-800 text-white hover:bg-stone-700 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white">Pridať obrázky</Button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
            </>
          ) : null}
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto ${mode === 'whole' ? 'space-y-3 pr-1' : ''}`}>
          {images.length ? (mode === 'whole' ? images.map((image, index) => (
            <article
              key={image.id}
              draggable
              onDragStart={(event) => { setDraggedId(image.id); event.dataTransfer.setData('text/plain', image.id); event.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => setDraggedId('')}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleItemDrop(event, image.id)}
              className="group overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="relative bg-stone-100 dark:bg-stone-800">
                <img src={image.src} alt={image.name || `Moodboard ${index + 1}`} className="max-h-[32rem] w-full object-contain" />
                <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white">{index + 1}</div>
                {!isGlobal ? <button type="button" onClick={() => onRemoveImage(image.id)} className="absolute right-2 top-2 h-8 w-8 rounded-full bg-black/55 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100" title="Odstrániť obrázok">×</button> : null}
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                <span className="min-w-0 truncate">{image.roomName || image.name || 'Obrázok'}</span>
                <span className="cursor-grab select-none rounded-full bg-stone-100 px-2 py-1 dark:bg-stone-800">↕ presunúť</span>
              </div>
            </article>
          )) : (
            <div className="[column-gap:3px] [column-width:14rem]">
              {images.map((image, index) => {
                const stretchLandscape = shouldStretchLandscape && imageShapes[image.id] === 'landscape';

                return (
                  <button
                    key={image.id}
                    type="button"
                    draggable
                    aria-label={`Presunúť obrázok ${index + 1}`}
                    onDragStart={(event) => { setDraggedId(image.id); event.dataTransfer.setData('text/plain', image.id); event.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDraggedId('')}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleItemDrop(event, image.id)}
                    className={`mb-[2px] block w-full break-inside-avoid overflow-hidden p-0 leading-none ${stretchLandscape ? '[column-span:all]' : ''} ${draggedId === image.id ? 'opacity-50' : ''}`}
                  >
                    <img src={image.src} alt="" onLoad={(event) => rememberImageShape(image.id, event)} className="block h-auto w-full" />
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
  useEffect(() => { notebookRef.current = notebook; saveNotebook(notebook); }, [notebook]);
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
          writeNotesRoom(roomCode, notebookRef.current)
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
        setNotebook((current) => (first || (remoteNotebook.updatedAt || 0) >= (current.updatedAt || 0) ? remoteNotebook : current));
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
    setSyncState({ phase: 'pending' });
    window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => {
      setSyncState({ phase: 'saving' });
      writeNotesRoom(roomCode, notebook)
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
  const displayedSyncLabel = notice || syncLabel(syncState);
  const displayedSyncDetail = notice || syncDetail(syncState);
  const syncClasses = syncToneClasses(syncState.phase);

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
  const moveInOrder = (ids, sourceId, targetId) => {
    const next = ids.filter((id) => id !== sourceId);
    const targetIndex = next.indexOf(targetId);
    if (targetIndex < 0) return ids;
    next.splice(targetIndex, 0, sourceId);
    return next;
  };
  const moveBoardImage = (sourceId, targetId) => {
    if (selectedId === 'global') {
      mutate((prev) => {
        const allIds = prev.rooms.flatMap((room) => arr(room.images).map((image) => image.id));
        const ordered = arr(prev.global?.imageOrder).filter((id) => allIds.includes(id));
        const ids = [...ordered, ...allIds.filter((id) => !ordered.includes(id))];
        return { ...prev, global: { ...prev.global, imageOrder: moveInOrder(ids, sourceId, targetId) } };
      });
      return;
    }
    updateCollection('images', (images) => {
      const byId = new Map(images.map((image) => [image.id, image]));
      return moveInOrder(images.map((image) => image.id), sourceId, targetId).map((id) => byId.get(id)).filter(Boolean);
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
            <span className={`inline-flex max-w-[16rem] items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-xs font-semibold ${syncClasses.badge}`} title={displayedSyncDetail || displayedSyncLabel}>
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${syncClasses.dot}`} />
              {displayedSyncLabel}
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
                    <p className={`mt-1 text-xs font-semibold ${syncClasses.text}`}>{displayedSyncLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{displayedSyncDetail}</p>
                    {ERROR_PHASES.has(syncState.phase) ? (
                      <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:bg-red-950/40 dark:text-red-200">
                        Čo spraviť: skontrolujte Firebase Realtime Database pravidlá pre <code className="font-mono">roomNotes/{groupLabel}</code>, sieť/ad-blocker a či poznámky s obrázkami nie sú príliš veľké. Aktuálna kópia zostáva uložená lokálne v tomto prehliadači.
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
            <div className="grid gap-4 lg:grid-cols-[1.25fr_0.9fr]">
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
