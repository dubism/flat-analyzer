import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  generateNotesRoomCode,
  initNotesFirebase,
  isNotesFirebaseConfigured,
  subscribeToNotesRoom,
  writeNotesRoom,
} from './notesFirebase';

const STORAGE_KEY = 'flat-notes-shared-data';
const DEFAULT_ROOM = 'flat-notes-shared';
const STARTER_ROOMS = ['Entrance', 'Kitchen', 'Living room', 'Bedroom', 'Bathroom', 'WC', 'Balcony', 'Storage'];

const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const emptySection = () => ({ notes: '', links: [], tasks: [] });
const emptyRoom = (name) => ({ id: makeId('room'), name, notes: '', measurements: '', decisions: '', links: [], tasks: [] });
const createNotebook = () => ({ version: 2, title: 'Flat notes', global: emptySection(), rooms: STARTER_ROOMS.map(emptyRoom), updatedAt: Date.now() });
const arr = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const oneLine = (value = '') => String(value).replace(/\r?\n/g, ' ').trim();

const normalizeLinks = (links) => arr(links).map((link) => ({ id: link.id || makeId('link'), title: link.title || '', url: link.url || '', notes: link.notes || '' }));
const normalizeTasks = (tasks) => arr(tasks).map((task) => ({ id: task.id || makeId('task'), text: task.text || '', done: Boolean(task.done) }));
const normalizeSection = (section = {}) => ({ notes: section.notes || '', links: normalizeLinks(section.links), tasks: normalizeTasks(section.tasks) });
const normalizeRoom = (room = {}) => ({ ...normalizeSection(room), id: room.id || makeId('room'), name: room.name || 'Room', measurements: room.measurements || '', decisions: room.decisions || '' });

const normalizeNotebook = (value) => {
  const fallback = createNotebook();
  if (!value || typeof value !== 'object') return fallback;
  const rooms = arr(value.rooms).map(normalizeRoom);
  return { version: 2, title: value.title || 'Flat notes', global: normalizeSection(value.global), rooms: rooms.length ? rooms : fallback.rooms, updatedAt: value.updatedAt || Date.now() };
};

const loadNotebook = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeNotebook(JSON.parse(raw));
  } catch (error) {
    console.warn('Could not load flat notes:', error);
  }
  return createNotebook();
};

const saveNotebook = (notebook) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notebook));
  } catch (error) {
    console.warn('Could not save flat notes:', error);
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

const updatedLabel = (timestamp) => new Intl.DateTimeFormat('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp || Date.now()));
const openTaskCount = (section) => arr(section.tasks).filter((task) => !task.done).length;

const sectionToText = (section, room = false) => {
  const lines = ['Notes:', section.notes || '', ''];
  if (room) lines.push('Measurements:', section.measurements || '', '', 'Decisions:', section.decisions || '', '');
  lines.push('Tasks:');
  arr(section.tasks).forEach((task) => lines.push(`- [${task.done ? 'x' : ' '}] ${oneLine(task.text)}`));
  lines.push('', 'Links:');
  arr(section.links).forEach((link) => lines.push(`- ${oneLine(link.title)} | ${oneLine(link.url)} | ${oneLine(link.notes)}`));
  return lines.join('\n');
};

const notebookToText = (notebook) => {
  const data = normalizeNotebook(notebook);
  const blocks = ['# Flat Notes', `Updated: ${new Date(data.updatedAt || Date.now()).toISOString()}`, '', '## Global', sectionToText(data.global)];
  data.rooms.forEach((room) => blocks.push('', `## Room: ${room.name}`, sectionToText(room, true)));
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

const textToNotebook = (text) => {
  const notebook = { version: 2, title: 'Flat notes', global: emptySection(), rooms: [], updatedAt: Date.now() };
  let current = null;
  let field = null;
  let recognized = false;

  String(text || '').replace(/\r\n/g, '\n').split('\n').forEach((raw) => {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed === '# Flat Notes' || trimmed.startsWith('Updated:')) {
      if (current && ['notes', 'measurements', 'decisions'].includes(field)) appendField(current, field, '');
      return;
    }
    if (trimmed === '## Global') { current = notebook.global; field = null; recognized = true; return; }
    if (trimmed.startsWith('## Room:')) { const room = emptyRoom(trimmed.slice(8).trim() || 'Room'); notebook.rooms.push(room); current = room; field = null; recognized = true; return; }
    if (!current) return;
    if (trimmed === 'Notes:') { current.notes = ''; field = 'notes'; recognized = true; return; }
    if (trimmed === 'Measurements:') { current.measurements = ''; field = 'measurements'; recognized = true; return; }
    if (trimmed === 'Decisions:') { current.decisions = ''; field = 'decisions'; recognized = true; return; }
    if (trimmed === 'Tasks:') { current.tasks = []; field = 'tasks'; recognized = true; return; }
    if (trimmed === 'Links:') { current.links = []; field = 'links'; recognized = true; return; }
    if (field === 'tasks') { const task = parseTask(trimmed); if (task) current.tasks.push(task); return; }
    if (field === 'links') { const link = parseLink(trimmed); if (link) current.links.push(link); return; }
    if (['notes', 'measurements', 'decisions'].includes(field)) appendField(current, field, line);
  });

  if (!recognized) throw new Error('No Flat Notes sections found.');
  return normalizeNotebook({ ...notebook, rooms: notebook.rooms.length ? notebook.rooms : createNotebook().rooms, updatedAt: Date.now() });
};

const TEXT_EXAMPLE = `# Flat Notes
Updated: 2026-06-06T12:00:00.000Z

## Global
Notes:
Whole-flat notes. Multi-line text is allowed.

Tasks:
- [ ] Open task
- [x] Done task

Links:
- Title | https://example.com | Optional link note

## Room: Kitchen
Notes:
Room notes.

Measurements:
Width, sockets, windows, radiator positions...

Decisions:
Chosen materials, layout decisions, open questions...

Tasks:
- [ ] Room task

Links:
- Inspiration | https://example.com | Optional note`;

function Button({ children, onClick, type = 'button', className = '', title }) {
  return <button type={type} title={title} onClick={onClick} className={`min-h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 active:scale-[0.98] ${className}`}>{children}</button>;
}

function TextAreaCard({ label, value, rows = 6, placeholder, onChange }) {
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label><textarea value={value} rows={rows} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-base leading-6 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" /></section>;
}

function TaskList({ tasks, onAdd, onToggle, onRename, onDelete }) {
  const [draft, setDraft] = useState('');
  const submit = (event) => { event.preventDefault(); const text = draft.trim(); if (!text) return; onAdd(text); setDraft(''); };
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tasks</label><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{tasks.filter((task) => !task.done).length} open</span></div><form onSubmit={submit} className="mb-3 flex gap-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add task" className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" /><Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700">Add</Button></form><div className="space-y-2">{tasks.length ? tasks.map((task) => <div key={task.id} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-2 py-2"><button type="button" onClick={() => onToggle(task.id)} className={`h-7 w-7 rounded-lg border ${task.done ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-transparent'}`}>✓</button><input value={task.text} onChange={(event) => onRename(task.id, event.target.value)} className={`min-w-0 flex-1 bg-transparent px-1 py-1 text-base outline-none ${task.done ? 'text-gray-400 line-through' : ''}`} /><button type="button" onClick={() => onDelete(task.id)} className="h-8 w-8 rounded-lg text-gray-400 hover:bg-white hover:text-red-600">×</button></div>) : <p className="rounded-xl bg-gray-50 px-3 py-4 text-sm text-gray-500">No tasks yet.</p>}</div></section>;
}

function LinkList({ links, onAdd, onChange, onDelete }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const submit = (event) => { event.preventDefault(); const cleanTitle = title.trim(); const cleanUrl = url.trim(); if (!cleanTitle && !cleanUrl) return; onAdd({ title: cleanTitle || cleanUrl, url: cleanUrl, notes: '' }); setTitle(''); setUrl(''); };
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Links</label><form onSubmit={submit} className="mb-4 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." inputMode="url" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" /><Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700">Add</Button></form><div className="space-y-3">{links.length ? links.map((link) => <div key={link.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3"><div className="mb-2 flex gap-2"><input value={link.title} onChange={(event) => onChange(link.id, { title: event.target.value })} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><button type="button" onClick={() => onDelete(link.id)} className="h-9 w-9 rounded-lg text-gray-400 hover:bg-white hover:text-red-600">×</button></div><input value={link.url} onChange={(event) => onChange(link.id, { url: event.target.value })} placeholder="URL" className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><textarea value={link.notes} onChange={(event) => onChange(link.id, { notes: event.target.value })} placeholder="Link note" rows={2} className="w-full resize-none rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />{link.url ? <a href={link.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-medium text-blue-600">Open link</a> : null}</div>) : <p className="rounded-xl bg-gray-50 px-3 py-4 text-sm text-gray-500">No links yet.</p>}</div></section>;
}

function RoomList({ rooms, selectedId, onSelect, onRename, onDelete, onAddRoom }) {
  const [newRoom, setNewRoom] = useState('');
  const submit = (event) => { event.preventDefault(); const name = newRoom.trim(); if (!name) return; onAddRoom(name); setNewRoom(''); };
  return <aside className="flex h-full min-h-0 flex-col border-r border-gray-200 bg-white md:w-80"><div className="border-b border-gray-200 p-3"><button type="button" onClick={() => onSelect('global')} className={`mb-3 flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left ${selectedId === 'global' ? 'bg-blue-600 text-white' : 'bg-gray-50 hover:bg-gray-100'}`}><span className="font-semibold">Global</span><span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">All flat</span></button><form onSubmit={submit} className="flex gap-2"><input value={newRoom} onChange={(event) => setNewRoom(event.target.value)} placeholder="New room" className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" /><Button type="submit">Add</Button></form></div><div className="min-h-0 flex-1 overflow-y-auto p-3"><div className="space-y-2">{rooms.map((room) => <div key={room.id} className={`rounded-2xl border ${selectedId === room.id ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-gray-50 hover:bg-gray-100'}`}><button type="button" onClick={() => onSelect(room.id)} className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"><span className="min-w-0 flex-1 truncate font-medium">{room.name}</span><span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500">{openTaskCount(room)} open</span></button>{selectedId === room.id ? <div className="border-t border-blue-100 px-3 pb-3 pt-2"><input value={room.name} onChange={(event) => onRename(room.id, event.target.value)} className="mb-2 w-full rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><button type="button" onClick={() => onDelete(room.id)} className="text-xs font-medium text-red-600">Delete room</button></div> : null}</div>)}</div></div></aside>;
}

function TextModal({ value, onChange, onClose, onCopy, onDownload, onImport, onReset }) {
  return <div className="fixed inset-0 z-[70] flex bg-black/50 p-3 md:items-center md:justify-center" onClick={onClose}><div className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="sticky top-0 z-10 border-b border-gray-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Text import / export</h2><p className="mt-1 text-sm text-gray-500">Complete editable content format for the shared notes page.</p></div><button type="button" onClick={onClose} className="h-10 w-10 rounded-xl text-gray-500 hover:bg-gray-100">×</button></div></div><div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.2fr]"><section className="space-y-4"><div className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><h3 className="font-semibold">Formatting logic</h3><div className="mt-3 space-y-3 text-sm leading-6 text-gray-700"><p><strong>Sections:</strong> use <code>## Global</code> once and <code>## Room: Room name</code> for each room. Room order in the text becomes room order in the app.</p><p><strong>Text fields:</strong> <code>Notes:</code>, <code>Measurements:</code>, and <code>Decisions:</code> are multi-line. Content is captured until the next field label or section heading.</p><p><strong>Tasks:</strong> under <code>Tasks:</code>, use <code>- [ ] Task text</code> for open tasks and <code>- [x] Task text</code> for done tasks.</p><p><strong>Links:</strong> under <code>Links:</code>, use <code>- Title | URL | Optional note</code>. Extra pipes after URL stay in the note.</p><p><strong>Import:</strong> importing replaces the current notebook and then syncs it to the live shared page. JSON remains available for exact structured backup.</p></div></div><details className="rounded-2xl border border-gray-200 bg-white p-4"><summary className="cursor-pointer font-semibold">Example format</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-gray-900 p-3 text-xs leading-5 text-gray-100">{TEXT_EXAMPLE}</pre></details></section><section className="space-y-3"><div className="flex flex-wrap gap-2"><Button onClick={onReset}>Load current</Button><Button onClick={onCopy}>Copy text</Button><Button onClick={onDownload}>Download .txt</Button><Button onClick={onImport} className="bg-blue-600 text-white hover:bg-blue-700">Import text</Button></div><textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck="false" className="min-h-[62dvh] w-full resize-y rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 font-mono text-sm leading-6 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" /></section></div></div></div>;
}

export default function FlatNotesAppV2() {
  const [notebook, setNotebook] = useState(loadNotebook);
  const [selectedId, setSelectedId] = useState('global');
  const [roomCode, setRoomCode] = useState(() => getHashRoom() || DEFAULT_ROOM);
  const [joinCode, setJoinCode] = useState('');
  const [status, setStatus] = useState('Connecting…');
  const [mobileNav, setMobileNav] = useState(false);
  const [textModal, setTextModal] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const fileRef = useRef(null);
  const notebookRef = useRef(notebook);
  const localEditRef = useRef(false);
  const firstRemoteRef = useRef(true);
  const lastRemoteRef = useRef(0);
  const writeTimerRef = useRef(null);

  useEffect(() => { document.title = 'Flat Notes'; }, []);
  useEffect(() => { notebookRef.current = notebook; saveNotebook(notebook); }, [notebook]);

  useEffect(() => {
    if (!roomCode) { setStatus('Local only'); return undefined; }
    if (!isNotesFirebaseConfigured()) { setStatus('Firebase not configured'); return undefined; }
    if (!initNotesFirebase()) { setStatus('Sync unavailable'); return undefined; }

    firstRemoteRef.current = true;
    setHashRoom(roomCode);
    setStatus(roomCode === DEFAULT_ROOM ? 'Shared persistent page' : `Connected: ${roomCode}`);

    return subscribeToNotesRoom(roomCode, (remote) => {
      if (!remote) { writeNotesRoom(roomCode, notebookRef.current); firstRemoteRef.current = false; return; }
      const remoteNotebook = normalizeNotebook(remote);
      const first = firstRemoteRef.current;
      firstRemoteRef.current = false;
      localEditRef.current = false;
      lastRemoteRef.current = remoteNotebook.updatedAt || Date.now();
      setNotebook((current) => (first || (remoteNotebook.updatedAt || 0) >= (current.updatedAt || 0) ? remoteNotebook : current));
    });
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !localEditRef.current) return undefined;
    if ((notebook.updatedAt || 0) <= lastRemoteRef.current) return undefined;
    window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => { writeNotesRoom(roomCode, notebook); localEditRef.current = false; }, 450);
    return () => window.clearTimeout(writeTimerRef.current);
  }, [notebook, roomCode]);

  const current = useMemo(() => selectedId === 'global' ? notebook.global : notebook.rooms.find((room) => room.id === selectedId) || notebook.rooms[0] || emptyRoom('Room'), [notebook, selectedId]);
  const selectedTitle = selectedId === 'global' ? 'Global' : current.name;

  const mutate = (producer) => {
    localEditRef.current = true;
    setNotebook((old) => {
      const draft = JSON.parse(JSON.stringify(old));
      const next = producer(draft) || draft;
      return normalizeNotebook({ ...next, updatedAt: Date.now() });
    });
  };

  const patchCurrent = (patch) => mutate((draft) => {
    if (selectedId === 'global') draft.global = { ...draft.global, ...patch };
    else draft.rooms = draft.rooms.map((room) => room.id === selectedId ? { ...room, ...patch } : room);
  });

  const updateCollection = (key, updater) => patchCurrent({ [key]: updater(arr(current[key])) });
  const addRoom = (name) => { const room = emptyRoom(name); mutate((draft) => { draft.rooms.push(room); }); setSelectedId(room.id); setMobileNav(false); };
  const renameRoom = (id, name) => mutate((draft) => { draft.rooms = draft.rooms.map((room) => room.id === id ? { ...room, name } : room); });
  const deleteRoom = (id) => { const room = notebook.rooms.find((item) => item.id === id); if (!room || !window.confirm(`Delete ${room.name}?`)) return; mutate((draft) => { draft.rooms = draft.rooms.filter((item) => item.id !== id); }); setSelectedId('global'); };

  const download = (content, filename, type = 'text/plain') => { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); };
  const exportJson = () => download(JSON.stringify(notebook, null, 2), `flat-notes-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  const importJson = async (file) => { if (!file) return; try { const imported = normalizeNotebook(JSON.parse(await file.text())); if (!window.confirm('Replace current notes with the imported JSON?')) return; localEditRef.current = true; setNotebook({ ...imported, updatedAt: Date.now() }); setSelectedId('global'); } catch (error) { window.alert('Could not import this JSON file.'); } finally { if (fileRef.current) fileRef.current.value = ''; } };
  const openText = () => { setTextDraft(notebookToText(notebook)); setTextModal(true); };
  const importText = () => { try { const imported = textToNotebook(textDraft); if (!window.confirm('Replace current notes with this text import?')) return; localEditRef.current = true; setNotebook(imported); setSelectedId('global'); setTextModal(false); } catch (error) { window.alert(`Could not import this text. ${error.message}`); } };
  const copyText = async () => { try { await navigator.clipboard.writeText(textDraft); setStatus('Text copied'); window.setTimeout(() => setStatus(roomCode === DEFAULT_ROOM ? 'Shared persistent page' : `Connected: ${roomCode}`), 1200); } catch { window.prompt('Copy this text:', textDraft); } };
  const copyShare = async () => { const href = `${window.location.origin}${window.location.pathname}${window.location.search}#/notes?room=${encodeURIComponent(roomCode)}`; try { await navigator.clipboard.writeText(href); setStatus('Share link copied'); window.setTimeout(() => setStatus(roomCode === DEFAULT_ROOM ? 'Shared persistent page' : `Connected: ${roomCode}`), 1200); } catch { window.prompt('Copy this link:', href); } };
  const createRoom = () => { const code = generateNotesRoomCode(); setRoomCode(code); setHashRoom(code); };
  const joinRoom = (event) => { event.preventDefault(); const code = joinCode.trim().toLowerCase(); if (!code) return; setRoomCode(code); setHashRoom(code); setJoinCode(''); };
  const sharedPage = () => { setRoomCode(DEFAULT_ROOM); setHashRoom(DEFAULT_ROOM); };

  return <div className="flex h-screen min-h-0 flex-col bg-gray-100 text-gray-900"><header className="safe-top flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-3 md:px-5"><div className="flex min-w-0 items-center gap-2"><button type="button" onClick={() => setMobileNav(true)} className="h-10 w-10 rounded-xl border border-gray-200 md:hidden">☰</button><div className="min-w-0"><h1 className="truncate text-lg font-semibold md:text-xl">Flat Notes</h1><p className="truncate text-xs text-gray-500">Shared room notes, links, tasks, and decisions</p></div></div><div className="flex flex-shrink-0 items-center gap-2"><a href="#/analyzer" className="hidden min-h-10 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:inline-flex">Analyzer</a><Button onClick={openText}>Text I/E</Button><Button onClick={exportJson}>JSON</Button><Button onClick={() => fileRef.current?.click()}>Import</Button><input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => importJson(event.target.files?.[0])} /></div></header><div className="flex min-h-0 flex-1"><div className="hidden md:block"><RoomList rooms={notebook.rooms} selectedId={selectedId} onSelect={setSelectedId} onRename={renameRoom} onDelete={deleteRoom} onAddRoom={addRoom} /></div>{mobileNav ? <div className="fixed inset-0 z-50 flex bg-black/40 md:hidden" onClick={() => setMobileNav(false)}><div className="w-[88vw] max-w-sm" onClick={(event) => event.stopPropagation()}><RoomList rooms={notebook.rooms} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setMobileNav(false); }} onRename={renameRoom} onDelete={deleteRoom} onAddRoom={addRoom} /></div></div> : null}<main className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-5xl px-3 py-4 md:px-6 md:py-6"><section className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{selectedId === 'global' ? 'global' : 'room'}</span><span className="text-xs text-gray-500">Updated {updatedLabel(notebook.updatedAt)}</span></div><h2 className="truncate text-2xl font-semibold">{selectedTitle}</h2></div><div className="rounded-2xl border border-gray-200 bg-gray-50 p-2"><div className="flex flex-wrap items-center gap-2"><span className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white">{roomCode === DEFAULT_ROOM ? 'shared' : roomCode}</span><Button onClick={copyShare}>Copy link</Button>{roomCode !== DEFAULT_ROOM ? <Button onClick={sharedPage}>Shared page</Button> : null}<Button onClick={createRoom}>New room</Button><form onSubmit={joinRoom} className="flex gap-2"><input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Room code" className="w-32 rounded-xl border border-gray-200 bg-white px-3 py-2 text-base outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><Button type="submit">Join</Button></form></div><p className="mt-2 px-1 text-xs text-gray-500">{status}</p></div></div></section><div className="grid gap-4 lg:grid-cols-[1.25fr_0.9fr]"><div className="space-y-4"><TextAreaCard label="Notes" value={current.notes || ''} placeholder={selectedId === 'global' ? 'Whole-flat notes: budget, timing, contacts, constraints…' : 'Room notes: problems, ideas, things to check…'} rows={10} onChange={(notes) => patchCurrent({ notes })} />{selectedId !== 'global' ? <><TextAreaCard label="Measurements" value={current.measurements || ''} placeholder="Dimensions, sockets, windows, radiator positions, ceiling height…" rows={5} onChange={(measurements) => patchCurrent({ measurements })} /><TextAreaCard label="Decisions" value={current.decisions || ''} placeholder="Chosen materials, layout decisions, open questions…" rows={5} onChange={(decisions) => patchCurrent({ decisions })} /></> : null}</div><div className="space-y-4"><TaskList tasks={arr(current.tasks)} onAdd={(text) => updateCollection('tasks', (tasks) => [...tasks, { id: makeId('task'), text, done: false }])} onToggle={(id) => updateCollection('tasks', (tasks) => tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task))} onRename={(id, text) => updateCollection('tasks', (tasks) => tasks.map((task) => task.id === id ? { ...task, text } : task))} onDelete={(id) => updateCollection('tasks', (tasks) => tasks.filter((task) => task.id !== id))} /><LinkList links={arr(current.links)} onAdd={(link) => updateCollection('links', (links) => [...links, { id: makeId('link'), ...link }])} onChange={(id, patch) => updateCollection('links', (links) => links.map((link) => link.id === id ? { ...link, ...patch } : link))} onDelete={(id) => updateCollection('links', (links) => links.filter((link) => link.id !== id))} /></div></div></div></main></div>{textModal ? <TextModal value={textDraft} onChange={setTextDraft} onClose={() => setTextModal(false)} onCopy={copyText} onDownload={() => download(textDraft, `flat-notes-${new Date().toISOString().slice(0, 10)}.txt`)} onImport={importText} onReset={() => setTextDraft(notebookToText(notebook))} /> : null}</div>;
}
