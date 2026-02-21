# Flat Analyzer

Compare Prague apartment listings side-by-side with radar charts, AI-powered data extraction, and subjective ratings.

## Features

- **Paste & extract** — paste listing text from Sreality, Bezrealitky, etc. Regex extraction works instantly; AI extraction (via Claude API) parses complex listings
- **Radar chart comparison** — star offers to overlay them on objective (price, size, rooms…) and subjective (location, vibe, noise…) radar charts
- **Auto-ranges** — one click to fit chart ranges to your actual data spread
- **Import/export** — JSON file drag & drop, export your comparison set
- **Mobile layout** — bottom tab navigation, touch-optimized

## Setup

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Deploy to GitHub Pages

1. Push to a GitHub repo
2. Go to **Settings → Pages → Source → GitHub Actions**
3. Push to `main` — the workflow builds and deploys automatically

Or build manually:

```bash
npm run build  # outputs to dist/
```

## Data

Offers persist in `localStorage`. Export to JSON to back up. The "Demo" button loads sample Holešovice listings.

## Tech

Vite + React 18 + Tailwind CSS 3 + Recharts
