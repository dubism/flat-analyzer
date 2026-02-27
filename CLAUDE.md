# CLAUDE.md — Flat Analyzer

This file provides guidance for AI assistants working on this codebase.

## Project Overview

**Flat Analyzer** is a React single-page application for comparing Prague apartment listings. Users paste or fetch listing text from Czech real estate sites, the app extracts structured data via regex, and offers are displayed as a radar chart for side-by-side comparison. Optional Firebase integration allows real-time sharing via 6-character room codes.

The UI is in Czech; the target audience is Prague apartment hunters.

---

## Repository Structure

```
flat-analyzer/
├── src/
│   ├── App.jsx        # Entire UI: all sub-components, state, layout (1951 lines)
│   ├── main.jsx       # React 18 entry point, mounts App to #root
│   ├── config.js      # Constants: colors, parameters, schemas, sample data
│   ├── firebase.js    # Firebase Realtime Database integration
│   ├── utils.js       # Parsing, normalization, storage utilities
│   └── index.css      # Global styles (Tailwind directives)
├── index.html         # HTML root (lang="cs", mobile safe-area viewport)
├── vite.config.js     # Vite config (base: './' for GitHub Pages)
├── tailwind.config.js # Tailwind content paths + theme
├── postcss.config.js  # Tailwind + autoprefixer plugins
├── package.json       # Dependencies and npm scripts
└── .github/
    └── workflows/
        └── deploy.yml # CI/CD: push to main → build → GitHub Pages
```

There is no backend, no REST API, and no test suite.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| UI framework | React | 18.3.1 |
| Build tool | Vite | 6.0.5 |
| CSS | Tailwind CSS | 3.4.17 |
| Charts | Recharts | 2.15.0 |
| Cloud sync | Firebase Realtime Database | 11.0.0 |
| Deployment | GitHub Pages | via Actions |

---

## Development Commands

```bash
npm install       # Install dependencies
npm run dev       # Start dev server at http://localhost:5173 (HMR enabled)
npm run build     # Build production bundle to dist/
npm run preview   # Preview production build locally
```

There is no linter, formatter, or test runner configured. No pre-commit hooks exist.

---

## Key Source Files

### `src/config.js` — Configuration & Constants

Central source of truth for application data structures. Do not duplicate these values elsewhere.

- **`OBJECTIVE_PARAMS`** — 7 measurable criteria: price, price/m², area, rooms, parking, cellar, balcony
- **`SUBJECTIVE_PARAMS`** — 6 user-rated criteria (1–10): vibe, location, light/views, layout, renovation, noise
- **`ALL_PARAMS`** — Combined list used throughout rendering
- **`DEFAULT_PARAM_RANGES`** — Min/max for chart normalization; price params use **inverse scoring** (lower price = higher score)
- **`FIELD_SCHEMA`** — Typed field definitions (`PRICE`, `SIZE`, `ROOMS`, etc.)
- **`SAMPLE_DATA`** — 4 sample Prague (Holešovice) apartments for demo loading
- **`DEFAULT_PALETTE` / `generatePalette(count)`** — Color assignment for offers

### `src/utils.js` — Utilities & Parsing

Core logic for text extraction, normalization, and persistence.

**Parsing:**
- `parseListingTextWithSources(text)` — **Primary extraction function.** Applies regex patterns to Czech listing text to extract price, area, rooms, floor, balcony, cellar, parking, building type, neighborhood, address. Returns `{ data, sources }` where `sources` maps each field to its source text position.
- `parseListingText(text)` — Legacy wrapper around the above (returns only data).
- `parsePrice(priceStr)` / `parseSize(sizeStr)` — Standalone parsers for Czech number formats (handles invisible Unicode, comma decimals).

**Normalization (for radar chart):**
- `getNormalizedValue(param, offer, parameterRanges)` — Scales any param to 0–10 for chart rendering. Handles inverse pricing logic and discrete parking values.
- `getRawValue(param, offer)` — Returns human-readable original value for tooltips.

**Storage:**
- `loadFromStorage()` / `saveToStorage(offers, parameterRanges, palette)` — localStorage persistence.
- `loadDemoOffers()` — Returns sample data from `config.js`.

**Utilities:**
- `generateId()` — Unique offer IDs (timestamp + random string).
- `getNextColor(offers, palette)` — Assigns unused colors in round-robin.
- `formatPrice(price)` — Czech thousands formatting (space separator).

### `src/firebase.js` — Firebase Integration

Optional real-time collaboration. Firebase credentials are **hardcoded** (intentional for this public project; do not move to env unless the project scope changes).

- `isConfigured()` — Always returns `true` (credentials present).
- `generateRoomCode()` — 6-char alphanumeric code excluding visually ambiguous characters (i, l, o, 1, 0).
- `writeRoom(roomId, offers, parameterRanges, palette)` — Syncs state to Firebase. Sanitizes keys: replaces `/` with `|`.
- `subscribeToRoom(roomId, callback)` — Real-time listener; calls `callback(data)` on each update.

### `src/App.jsx` — Application Component (1951 lines)

All UI lives here as a single monolithic file with co-located sub-components. This is intentional for this project size.

**Sub-components (defined inside App.jsx):**

| Component | Purpose |
|-----------|---------|
| `LinkTooltip` | Hover tooltip showing URL domain and path |
| `FloorVisualizer` | Visual floor indicator (e.g., 3/6) |
| `DeleteConfirmModal` | Confirmation dialog before deleting an offer |
| `CustomTooltip` | Interactive tooltip on radar chart hover |
| `ZoomableChart` | Radar chart wrapper with mouse/touch zoom+pan |
| `ImagePasteModal` | Upload/paste photos for an offer |
| `AddOfferModal` | Primary modal for adding apartments (text input or URL fetch) |
| `EditOfferModal` | Edit offer name, price, notes, etc. |
| `EmailModal` | Share offer details via email |
| `PaletteEditor` | Customize per-offer colors |
| `FlatOfferAnalyzer` | Root component — full application state and layout |

**State is managed with `useState` + `useCallback` only.** There is no Redux, Zustand, or Context API.

**Responsive layout:**
- Desktop: side-by-side chart + offer list
- Mobile: bottom tab navigation (detected via `useIsMobile()` hook, threshold: 768px)

---

## Data Model

### Offer Object

```js
{
  id: "offer_1710000000000_abc",  // generated by generateId()
  name: "Holešovice 2+1",         // display name
  color: "#4CAF50",               // from palette
  starred: false,                 // featured/pinned
  price: 5800000,                 // CZK
  size: 58,                       // m²
  rooms: "2+1",                   // Czech notation
  floor: 3,
  totalFloors: 6,
  balcony: true,
  balconySize: 8,                 // m² (optional)
  cellar: false,
  cellarSize: null,
  parking: "Garage",              // "Garage" | "Dedicated" | false
  brick: true,                    // true = brick, false = panel
  neighborhood: "Holešovice",
  address: "Dělnická 12",
  subjective: {                   // 1–10 user ratings
    vibe: 7,
    location: 8,
    light: 6,
    layout: 7,
    renovation: 5,
    noise: 6
  },
  notes: "",
  images: [],                     // base64 data URLs (localStorage)
  rawText: "",                    // original pasted text
  extractedAt: 1710000000000
}
```

### Parameter Ranges

```js
{
  price:       { min: 3000000, max: 10000000 },
  pricePerM2:  { min: 60000,   max: 150000  },
  size:        { min: 30,      max: 120     },
  rooms:       { min: 1,       max: 5       },
  // ...
}
```

Price-related params use **inverse normalization**: lower price → higher radar score.

---

## Core Conventions

### Adding a New Parameter

1. Add to `OBJECTIVE_PARAMS` or `SUBJECTIVE_PARAMS` in `src/config.js`
2. Add a default range to `DEFAULT_PARAM_RANGES` in `src/config.js`
3. Add normalization logic in `getNormalizedValue()` in `src/utils.js`
4. Add display logic in `getRawValue()` in `src/utils.js`
5. Update the offer data model and any edit/display UI in `src/App.jsx`

### Adding a New Prague Neighborhood

The neighborhood list is maintained inside `parseListingTextWithSources()` in `src/utils.js`. Add the neighborhood name to the existing array (Czech diacritics are handled).

### Modifying Regex Extraction

Text extraction happens in `parseListingTextWithSources()` in `src/utils.js`. The function:
- Uses multiple fallback patterns per field (most-specific first)
- Records source position for each matched field (for source highlighting in UI)
- Handles Czech locale: decimal commas, `Kč`/`,-` currency, `m²`/`m2`

When editing regex patterns:
- Test against real listings from Sreality.cz and Bezrealitky.cz
- Preserve the `sources` output — it powers the source highlighting UI feature
- Czech number formats use spaces as thousands separators and commas as decimal separators

### Styles

Use **Tailwind CSS utility classes only**. Custom CSS is limited to `src/index.css` (Tailwind directives + a few global overrides). Do not add inline `style` props unless necessary for dynamic values (e.g., chart colors).

### Firebase Key Sanitization

Firebase keys cannot contain `/`. When storing offer data, keys are sanitized by replacing `/` with `|`. This is handled in `writeRoom()` — do not bypass this.

---

## Data Flow

```
User pastes text
     │
     ▼
parseListingTextWithSources(text)    ← src/utils.js
     │
     ▼
Offer added to state (useState)      ← src/App.jsx FlatOfferAnalyzer
     │
     ├──► saveToStorage(...)          ← localStorage (src/utils.js)
     │
     └──► writeRoom(...) [optional]   ← Firebase (src/firebase.js)
               │
               ▼
          Other clients subscribeToRoom() → state update → re-render
```

---

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`:
1. `npm ci`
2. `npm run build` → outputs to `dist/`
3. Deploys `dist/` to GitHub Pages

Vite is configured with `base: './'` for relative asset paths on GitHub Pages. Do not change this to `/` without also updating the deployment workflow.

---

## Known Limitations & Planned Features

- **No test suite** — there are zero tests. Be cautious when modifying parsing logic in `utils.js`.
- **Claude API integration** — mentioned in README but not yet implemented. The planned feature would provide AI-assisted extraction as an alternative to regex.
- **Firebase credentials are hardcoded** — acceptable for this project scope; do not refactor to env vars without a corresponding deployment change.
- **App.jsx is monolithic** — all components live in one 1951-line file. This is the current project style; do not split into separate files without explicit instruction.
- **No error boundary** — runtime errors in sub-components will unmount the entire app.
- **Image storage in localStorage** — base64 images can exhaust localStorage quota for many high-res photos.

---

## Language Note

The application UI, comments, and sample data are in **Czech**. Neighborhood names, street types, and real estate terminology in `utils.js` are Czech. Preserve Czech text when modifying these areas.
