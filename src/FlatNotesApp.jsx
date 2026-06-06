import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  generateNotesRoomCode,
  initNotesFirebase,
  isNotesFirebaseConfigured,
  subscribeToNotesRoom,
  writeNotesRoom,
} from './notesFirebase';

const STORAGE_KEY = 'flat-notes-data';

const STARTER_ROOMS = [
  'Entrance',
  'Kitchen',
  'Living room',
  'Bedroom',
  'Bathroom',
  'WC',
  'Balcony',
  'Storage',
];

const makeId = (prefix = 'item') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const emptySection = () => ({
  notes: '',
  links: [],
  tasks: [],
});

const emptyRoom = (name) => ({
  id: makeId('room'),
  name,
  notes: '',
  measurements: '',
  decisions: '',
  links: [],
  tasks: [],
});

const createNotebook = () => ({
  version: 1,
  title: 'Flat notes',
  global: emptySection(),
  rooms: STARTER_ROOMS.map(emptyRoom),
  updatedAt: Date.now(),
});

const normalizeArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const normalizeSection = (section) => ({
  notes: section?.notes || '',
  links: normalizeArray(section?.links).map((link) => ({
    id: link.id || makeId('link'),
    title: link.title || '',
    url: link.url || '',
    notes: link.notes || '',
  })),
  tasks: normalizeArray(section?.tasks).map((task) => ({
    id: task.id || makeId('task'),
    text: task.text || '',
    done: Boolean(task.done),
  })),
});

const normalizeRoom = (room) => ({
  id: room?.id || makeId('room'),
  name: room?.name || 'Room',
  notes: room?.notes || '',
  measurements: room?.measurements || '',
  decisions: room?.decisions || '',
  links: normalizeArray(room?.links).map((link) => ({
    id: link.id || makeId('link'),
    title: link.title || '',
    url: link.url || '',
    notes: link.notes || '',
  })),
  tasks: normalizeArray(room?.tasks).map((task) => ({
    id: task.id || makeId('task'),
    text: task.text || '',
    done: Boolean(task.done),
  })),
});

const normalizeNotebook = (notebook) => {
  const fallback = createNotebook();
  if (!notebook || typeof notebook !== 'object') return fallback;

  const rooms = normalizeArray(notebook.rooms).map(normalizeRoom);
  return {
    version: 1,
    title: notebook.title || 'Flat notes',
    global: normalizeSection(notebook.global),
    rooms: rooms.length ? rooms : fallback.rooms,
    updatedAt: notebook.updatedAt || Date.now(),
  };
};

const loadNotebook = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeNotebook(JSON.parse(raw));
  } catch (error) {
    console.warn('Failed to load flat notes:', error);
  }
  return createNotebook();
};

const saveNotebook = (notebook) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notebook));
  } catch (error) {
    console.warn('Failed to save flat notes:', error);
  }
};

const getHashRoomCode = () => {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return '';
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  return (params.get('room') || '').trim().toLowerCase();
};

const setNotesHash = (roomCode = '') => {
  const nextHash = roomCode ? `#/notes?room=${encodeURIComponent(roomCode)}` : '#/notes';
  if (window.location.hash !== nextHash) window.history.replaceState(null, '', nextHash);
};

const formatUpdated = (timestamp) => {
  if (!timestamp) return 'Not saved yet';
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const countOpenTasks = (section) => normalizeArray(section?.tasks).filter((task) => !task.done).length;

function IconButton({ children, onClick, title, className = '', type = 'button' }) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 active:scale-[0.98] ${className}`}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }) {
  return <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</label>;
}

function TextPanel({ label, value, placeholder, rows = 7, onChange }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-base leading-6 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
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
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <FieldLabel>Tasks</FieldLabel>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          {tasks.filter((task) => !task.done).length} open
        </span>
      </div>

      <form onSubmit={submit} className="mb-3 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add task"
          className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
        <IconButton type="submit" className="bg-blue-600 text-white hover:bg-blue-700">Add</IconButton>
      </form>

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-3 py-4 text-sm text-gray-500">No tasks yet.</p>
        ) : tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-2 py-2">
            <button
              type="button"
              onClick={() => onToggle(task.id)}
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border text-sm ${task.done ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-transparent'}`}
              aria-label={task.done ? 'Mark task open' : 'Mark task done'}
            >
              ✓
            </button>
            <input
              value={task.text}
              onChange={(event) => onRename(task.id, event.target.value)}
              className={`min-w-0 flex-1 bg-transparent px-1 py-1 text-base outline-none ${task.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}
            />
            <button
              type="button"
              onClick={() => onDelete(task.id)}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-red-600"
              aria-label="Delete task"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function LinkList({ links, onAdd, onChange, onDelete }) {
  const [draftTitle, setDraftTitle] = useState('');
  const [draftUrl, setDraftUrl] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const url = draftUrl.trim();
    const title = draftTitle.trim();
    if (!url && !title) return;
    onAdd({ title: title || url, url, notes: '' });
    setDraftTitle('');
    setDraftUrl('');
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <FieldLabel>Links</FieldLabel>
      <form onSubmit={submit} className="mb-4 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          placeholder="Title"
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
        <input
          value={draftUrl}
          onChange={(event) => setDraftUrl(event.target.value)}
          placeholder="https://..."
          inputMode="url"
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
        <IconButton type="submit" className="bg-blue-600 text-white hover:bg-blue-700">Add</IconButton>
      </form>

      <div className="space-y-3">
        {links.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-3 py-4 text-sm text-gray-500">No links yet.</p>
        ) : links.map((link) => (
          <div key={link.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="mb-2 flex gap-2">
              <input
                value={link.title}
                onChange={(event) => onChange(link.id, { title: event.target.value })}
                placeholder="Title"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => onDelete(link.id)}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-red-600"
                aria-label="Delete link"
              >
                ×
              </button>
            </div>
            <input
              value={link.url}
              onChange={(event) => onChange(link.id, { url: event.target.value })}
              placeholder="URL"
              inputMode="url"
              className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <textarea
              value={link.notes}
              onChange={(event) => onChange(link.id, { notes: event.target.value })}
              placeholder="Link note"
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            {link.url ? (
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Open link
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function RoomList({ rooms, selectedId, onSelect, onRename, onDelete, onAddRoom }) {
  const [newRoomName, setNewRoomName] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const name = newRoomName.trim();
    if (!name) return;
    onAddRoom(name);
    setNewRoomName('');
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-gray-200 bg-white md:w-80">
      <div className="border-b border-gray-200 p-3">
        <button
          type="button"
          onClick={() => onSelect('global')}
          className={`mb-3 flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition ${selectedId === 'global' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-900 hover:bg-gray-100'}`}
        >
          <span className="font-semibold">Global</span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${selectedId === 'global' ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>All flat</span>
        </button>

        <form onSubmit={submit} className="flex gap-2">
          <input
            value={newRoomName}
            onChange={(event) => setNewRoomName(event.target.value)}
            placeholder="New room"
            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
          <IconButton type="submit">Add</IconButton>
        </form>
      </div>

      <div className="ios-scroll min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {rooms.map((room) => (
            <div
              key={room.id}
              className={`group rounded-2xl border transition ${selectedId === room.id ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-gray-50 hover:bg-gray-100'}`}
            >
              <button
                type="button"
                onClick={() => onSelect(room.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{room.name}</span>
                <span className="flex-shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-gray-500">
                  {countOpenTasks(room)} open
                </span>
              </button>
              {selectedId === room.id ? (
                <div className="border-t border-blue-100 px-3 pb-3 pt-2">
                  <input
                    value={room.name}
                    onChange={(event) => onRename(room.id, event.target.value)}
                    className="mb-2 w-full rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => onDelete(room.id)}
                    className="text-xs font-medium text-red-600 hover:text-red-800"
                  >
                    Delete room
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export default function FlatNotesApp() {
  const [notebook, setNotebook] = useState(loadNotebook);
  const [selectedId, setSelectedId] = useState('global');
  const [roomCode, setRoomCode] = useState(getHashRoomCode);
  const [joinCode, setJoinCode] = useState('');
  const [syncStatus, setSyncStatus] = useState('Local only');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const fileInputRef = useRef(null);
  const notebookRef = useRef(notebook);
  const hasLocalEditRef = useRef(false);
  const writeTimerRef = useRef(null);
  const lastRemoteAtRef = useRef(0);

  useEffect(() => {
    document.title = 'Flat Notes';
  }, []);

  useEffect(() => {
    notebookRef.current = notebook;
    saveNotebook(notebook);
  }, [notebook]);

  useEffect(() => {
    if (!roomCode) {
      setSyncStatus('Local only');
      return undefined;
    }

    if (!isNotesFirebaseConfigured()) {
      setSyncStatus('Firebase not configured');
      return undefined;
    }

    const database = initNotesFirebase();
    if (!database) {
      setSyncStatus('Sync unavailable');
      return undefined;
    }

    setNotesHash(roomCode);
    setSyncStatus(`Connected: ${roomCode}`);

    const unsubscribe = subscribeToNotesRoom(roomCode, (remoteData) => {
      if (!remoteData) {
        writeNotesRoom(roomCode, notebookRef.current);
        return;
      }

      const remoteNotebook = normalizeNotebook(remoteData);
      lastRemoteAtRef.current = remoteNotebook.updatedAt || Date.now();
      hasLocalEditRef.current = false;
      setNotebook((current) => {
        if ((remoteNotebook.updatedAt || 0) >= (current.updatedAt || 0)) return remoteNotebook;
        return current;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !hasLocalEditRef.current) return undefined;
    if ((notebook.updatedAt || 0) <= lastRemoteAtRef.current) return undefined;

    window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => {
      writeNotesRoom(roomCode, notebook);
      hasLocalEditRef.current = false;
    }, 450);

    return () => window.clearTimeout(writeTimerRef.current);
  }, [notebook, roomCode]);

  const selectedSection = useMemo(() => {
    if (selectedId === 'global') return notebook.global;
    return notebook.rooms.find((room) => room.id === selectedId) || notebook.rooms[0] || emptyRoom('Room');
  }, [notebook, selectedId]);

  const selectedTitle = selectedId === 'global' ? 'Global' : selectedSection.name;
  const selectedType = selectedId === 'global' ? 'global' : 'room';

  const updateNotebook = (producer) => {
    hasLocalEditRef.current = true;
    setNotebook((current) => {
      const draft = JSON.parse(JSON.stringify(current));
      const next = producer(draft) || draft;
      return normalizeNotebook({ ...next, updatedAt: Date.now() });
    });
  };

  const updateCurrent = (patch) => {
    updateNotebook((draft) => {
      if (selectedId === 'global') {
        draft.global = { ...draft.global, ...patch };
      } else {
        draft.rooms = draft.rooms.map((room) => (
          room.id === selectedId ? { ...room, ...patch } : room
        ));
      }
      return draft;
    });
  };

  const updateCurrentCollection = (collection, updater) => {
    const current = normalizeArray(selectedSection[collection]);
    updateCurrent({ [collection]: updater(current) });
  };

  const addRoom = (name) => {
    const room = emptyRoom(name);
    updateNotebook((draft) => {
      draft.rooms.push(room);
      return draft;
    });
    setSelectedId(room.id);
    setIsMobileNavOpen(false);
  };

  const renameRoom = (id, name) => {
    updateNotebook((draft) => {
      draft.rooms = draft.rooms.map((room) => (room.id === id ? { ...room, name } : room));
      return draft;
    });
  };

  const deleteRoom = (id) => {
    const room = notebook.rooms.find((candidate) => candidate.id === id);
    if (!room) return;
    const confirmed = window.confirm(`Delete ${room.name}? Notes, links, and tasks in this room will be removed.`);
    if (!confirmed) return;

    updateNotebook((draft) => {
      draft.rooms = draft.rooms.filter((candidate) => candidate.id !== id);
      return draft;
    });
    setSelectedId('global');
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flat-notes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = normalizeNotebook(JSON.parse(text));
      const confirmed = window.confirm('Replace current notes with the imported file?');
      if (!confirmed) return;
      hasLocalEditRef.current = true;
      setNotebook({ ...imported, updatedAt: Date.now() });
      setSelectedId('global');
    } catch (error) {
      window.alert('Could not import this JSON file.');
      console.error(error);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const createRoomSync = () => {
    const nextCode = generateNotesRoomCode();
    setRoomCode(nextCode);
    setJoinCode('');
    setNotesHash(nextCode);
  };

  const joinRoomSync = (event) => {
    event.preventDefault();
    const code = joinCode.trim().toLowerCase();
    if (!code) return;
    setRoomCode(code);
    setJoinCode('');
    setNotesHash(code);
  };

  const disconnectSync = () => {
    setRoomCode('');
    setNotesHash('');
  };

  const copyShareLink = async () => {
    const href = `${window.location.origin}${window.location.pathname}${window.location.search}#/notes${roomCode ? `?room=${encodeURIComponent(roomCode)}` : ''}`;
    try {
      await navigator.clipboard.writeText(href);
      setSyncStatus('Share link copied');
      window.setTimeout(() => setSyncStatus(roomCode ? `Connected: ${roomCode}` : 'Local only'), 1200);
    } catch {
      window.prompt('Copy this link:', href);
    }
  };

  return (
    <div className="flex h-screen min-h-0 flex-col bg-gray-100 text-gray-900">
      <header className="safe-top flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-3 md:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 md:hidden"
              aria-label="Open room list"
            >
              ☰
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold md:text-xl">Flat Notes</h1>
              <p className="truncate text-xs text-gray-500">Room notes, links, tasks, and decisions</p>
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <a
            href="#/analyzer"
            className="hidden min-h-10 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:inline-flex"
          >
            Analyzer
          </a>
          <IconButton onClick={exportJson} title="Export JSON">Export</IconButton>
          <IconButton onClick={() => fileInputRef.current?.click()} title="Import JSON">Import</IconButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => importJson(event.target.files?.[0])}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="hidden md:block">
          <RoomList
            rooms={notebook.rooms}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRename={renameRoom}
            onDelete={deleteRoom}
            onAddRoom={addRoom}
          />
        </div>

        {isMobileNavOpen ? (
          <div className="fixed inset-0 z-50 flex bg-black/40 md:hidden" onClick={() => setIsMobileNavOpen(false)}>
            <div className="w-[88vw] max-w-sm" onClick={(event) => event.stopPropagation()}>
              <RoomList
                rooms={notebook.rooms}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  setIsMobileNavOpen(false);
                }}
                onRename={renameRoom}
                onDelete={deleteRoom}
                onAddRoom={addRoom}
              />
            </div>
          </div>
        ) : null}

        <main className="ios-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-3 py-4 md:px-6 md:py-6">
            <section className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{selectedType}</span>
                    <span className="text-xs text-gray-500">Updated {formatUpdated(notebook.updatedAt)}</span>
                  </div>
                  <h2 className="truncate text-2xl font-semibold">{selectedTitle}</h2>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-2">
                  {roomCode ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white">{roomCode}</span>
                      <IconButton onClick={copyShareLink}>Copy link</IconButton>
                      <IconButton onClick={disconnectSync}>Disconnect</IconButton>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <IconButton onClick={createRoomSync} className="bg-blue-600 text-white hover:bg-blue-700">Create live room</IconButton>
                      <form onSubmit={joinRoomSync} className="flex gap-2">
                        <input
                          value={joinCode}
                          onChange={(event) => setJoinCode(event.target.value)}
                          placeholder="Room code"
                          className="w-32 rounded-xl border border-gray-200 bg-white px-3 py-2 text-base outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                        <IconButton type="submit">Join</IconButton>
                      </form>
                    </div>
                  )}
                  <p className="mt-2 px-1 text-xs text-gray-500">{syncStatus}</p>
                </div>
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-[1.25fr_0.9fr]">
              <div className="space-y-4">
                <TextPanel
                  label="Notes"
                  value={selectedSection.notes || ''}
                  placeholder={selectedId === 'global' ? 'Whole-flat notes: budget, timing, contacts, constraints…' : 'Room notes: problems, ideas, things to check…'}
                  rows={10}
                  onChange={(notes) => updateCurrent({ notes })}
                />

                {selectedId !== 'global' ? (
                  <>
                    <TextPanel
                      label="Measurements"
                      value={selectedSection.measurements || ''}
                      placeholder="Dimensions, sockets, windows, radiator positions, ceiling height…"
                      rows={5}
                      onChange={(measurements) => updateCurrent({ measurements })}
                    />
                    <TextPanel
                      label="Decisions"
                      value={selectedSection.decisions || ''}
                      placeholder="Chosen materials, layout decisions, open questions…"
                      rows={5}
                      onChange={(decisions) => updateCurrent({ decisions })}
                    />
                  </>
                ) : null}
              </div>

              <div className="space-y-4">
                <TaskList
                  tasks={normalizeArray(selectedSection.tasks)}
                  onAdd={(text) => updateCurrentCollection('tasks', (tasks) => [...tasks, { id: makeId('task'), text, done: false }])}
                  onToggle={(taskId) => updateCurrentCollection('tasks', (tasks) => tasks.map((task) => (
                    task.id === taskId ? { ...task, done: !task.done } : task
                  )))}
                  onRename={(taskId, text) => updateCurrentCollection('tasks', (tasks) => tasks.map((task) => (
                    task.id === taskId ? { ...task, text } : task
                  )))}
                  onDelete={(taskId) => updateCurrentCollection('tasks', (tasks) => tasks.filter((task) => task.id !== taskId))}
                />

                <LinkList
                  links={normalizeArray(selectedSection.links)}
                  onAdd={(link) => updateCurrentCollection('links', (links) => [...links, { id: makeId('link'), ...link }])}
                  onChange={(linkId, patch) => updateCurrentCollection('links', (links) => links.map((link) => (
                    link.id === linkId ? { ...link, ...patch } : link
                  )))}
                  onDelete={(linkId) => updateCurrentCollection('links', (links) => links.filter((link) => link.id !== linkId))}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
