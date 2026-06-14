#!/usr/bin/env node

const DEFAULT_DB_URL = 'https://flat-notes-memory-default-rtdb.europe-west1.firebasedatabase.app';
const DEFAULT_TARGET_ROOM = 'flat-notes-shared';

const dbUrl = (process.env.FIREBASE_DB_URL || DEFAULT_DB_URL).replace(/\/$/, '');
const targetRoom = (process.env.TARGET_ROOM || DEFAULT_TARGET_ROOM).trim();
const apply = process.env.APPLY === 'true' || process.argv.includes('--apply');
const deleteSources = process.env.DELETE_SOURCES === 'true' || process.argv.includes('--delete-sources');

const arr = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const oneLine = (value = '') => String(value).replace(/\s+/g, ' ').trim();
const slug = (value = '') => oneLine(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stableId = (prefix, value) => `${prefix}_${slug(value) || 'item'}`;

const restoreKey = (key) => String(key)
  .replace(/\|dot\|/g, '.')
  .replace(/\|hash\|/g, '#')
  .replace(/\|dollar\|/g, '$')
  .replace(/\|slash\|/g, '/')
  .replace(/\|left\|/g, '[')
  .replace(/\|right\|/g, ']')
  .replace(/\|/g, '/');

const sanitizeKey = (key) => String(key)
  .replace(/\./g, '|dot|')
  .replace(/#/g, '|hash|')
  .replace(/\$/g, '|dollar|')
  .replace(/\//g, '|slash|')
  .replace(/\[/g, '|left|')
  .replace(/\]/g, '|right|');

const mapKeys = (value, transform) => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((child) => mapKeys(child, transform));
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [transform(key), mapKeys(child, transform)]));
};

const normalizeSection = (section = {}) => ({
  notes: section.notes || '',
  links: arr(section.links).map((link) => ({
    id: link.id || stableId('link', `${link.url || ''}|${link.title || ''}`),
    title: link.title || '',
    url: link.url || '',
    notes: link.notes || '',
  })),
  tasks: arr(section.tasks).map((task) => ({
    id: task.id || stableId('task', `${task.text || ''}|${task.done ? 'done' : 'open'}`),
    text: task.text || '',
    done: Boolean(task.done),
  })),
  imageOrder: arr(section.imageOrder).map(String),
});

const normalizeImages = (images) => arr(images).map((image) => ({
  id: image.id || image.srcRef || stableId('image', image.name || image.src || image.url || ''),
  src: image.src || image.dataUrl || image.url || '',
  srcRef: image.srcRef || image.id || stableId('image', image.name || image.src || image.url || ''),
  storage: image.storage || ((image.src || image.dataUrl || image.url) ? 'inline' : 'indexeddb'),
  name: image.name || '',
  addedAt: image.addedAt || 0,
  missing: Boolean(image.missing && !(image.src || image.dataUrl || image.url)),
})).filter((image) => image.src || image.srcRef);

const normalizeRoom = (room = {}) => {
  const name = room.name || 'Miestnosť';
  return {
    ...normalizeSection(room),
    id: room.id || stableId('room', name),
    name,
    measurements: room.measurements || '',
    decisions: room.decisions || '',
    images: normalizeImages(room.images),
  };
};

const normalizeNotebook = (value = {}) => ({
  version: 2,
  title: value.title || 'Poznámky k bytu',
  global: normalizeSection(value.global),
  rooms: arr(value.rooms).map(normalizeRoom),
  updatedAt: value.updatedAt || 0,
});

const mergeText = (a = '', b = '') => {
  const parts = [a, b].map((text) => String(text || '').trim()).filter(Boolean);
  return [...new Set(parts)].join('\n\n');
};

const mergeByKey = (items, keyFn, mergeFn = (a, b) => ({ ...a, ...b })) => {
  const out = new Map();
  for (const item of items.filter(Boolean)) {
    const key = keyFn(item);
    if (!key) continue;
    out.set(key, out.has(key) ? mergeFn(out.get(key), item) : item);
  }
  return [...out.values()];
};

const mergeSections = (a = {}, b = {}) => ({
  notes: mergeText(a.notes, b.notes),
  links: mergeByKey([...arr(a.links), ...arr(b.links)], (link) => link.url ? `url:${link.url}` : `id:${link.id}`),
  tasks: mergeByKey([...arr(a.tasks), ...arr(b.tasks)], (task) => task.text ? `text:${oneLine(task.text).toLowerCase()}` : `id:${task.id}`, (x, y) => ({ ...x, ...y, done: x.done || y.done })),
  imageOrder: [...new Set([...arr(a.imageOrder), ...arr(b.imageOrder)])],
});

const mergeRooms = (rooms) => mergeByKey(rooms, (room) => {
  const nameKey = slug(room.name);
  return nameKey ? `name:${nameKey}` : room.id;
}, (a, b) => ({
  ...a,
  ...b,
  name: a.name || b.name,
  notes: mergeText(a.notes, b.notes),
  measurements: mergeText(a.measurements, b.measurements),
  decisions: mergeText(a.decisions, b.decisions),
  links: mergeSections(a, b).links,
  tasks: mergeSections(a, b).tasks,
  imageOrder: mergeSections(a, b).imageOrder,
  images: mergeByKey([...arr(a.images), ...arr(b.images)], (image) => image.srcRef || image.id),
}));

const mergeNotebooks = (notebooks) => {
  const normalized = notebooks.map(normalizeNotebook);
  return {
    version: 2,
    title: normalized.map((n) => n.title).find(Boolean) || 'Poznámky k bytu',
    global: normalized.reduce((merged, notebook) => mergeSections(merged, notebook.global), normalizeSection()),
    rooms: mergeRooms(normalized.flatMap((notebook) => notebook.rooms)),
    updatedAt: Date.now(),
    consolidatedAt: Date.now(),
    consolidatedFrom: normalized.length,
  };
};

const request = async (path, options = {}) => {
  const response = await fetch(`${dbUrl}/${path}.json`, options);
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${response.statusText} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
};

const rawRooms = await request('roomNotes');
const roomEntries = Object.entries(rawRooms || {}).filter(([, value]) => value && typeof value === 'object');
if (!roomEntries.length) {
  console.log('No roomNotes records found.');
  process.exit(0);
}

const restored = roomEntries.map(([room, value]) => [room, mapKeys(value, restoreKey)]);
const merged = mergeNotebooks(restored.map(([, value]) => value));
const payload = mapKeys(merged, sanitizeKey);

console.log(`Found ${roomEntries.length} roomNotes record(s): ${roomEntries.map(([room]) => room).join(', ')}`);
console.log(`Merged notebook: ${merged.rooms.length} room(s), ${merged.global.tasks.length} global task(s), target=${targetRoom}`);

if (!apply) {
  console.log('Dry run only. Re-run with --apply or APPLY=true to write the consolidation.');
  process.exit(0);
}

const updates = { [`roomNotes/${targetRoom}`]: payload };
for (const [room] of roomEntries) {
  if (room !== targetRoom) updates[`roomNotes/${room}`] = deleteSources ? null : payload;
}
await request('', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(updates) });
console.log(`${deleteSources ? 'Moved' : 'Copied'} merged notebook to ${Object.keys(updates).length} roomNotes path(s).`);
