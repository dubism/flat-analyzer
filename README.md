# Flat Analyzer

Compare Prague apartment listings side-by-side with radar charts, AI-powered data extraction, and subjective ratings.

## Features

- **Paste & extract** — paste listing text from Sreality, Bezrealitky, etc. Regex extraction works instantly; AI extraction (via Claude API) parses complex listings
- **Radar chart comparison** — star offers to overlay them on objective (price, size, rooms…) and subjective (location, vibe, noise…) radar charts
- **Auto-ranges** — one click to fit chart ranges to your actual data spread
- **Import/export** — JSON file drag & drop, export your comparison set
- **Mobile layout** — bottom tab navigation, touch-optimized
- **Agent connector** — authenticated REST + Streamable HTTP MCP endpoints let ChatGPT or Codex add facts from browsed listings directly to a shared Firebase room

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

## Agent connector

The optional Firebase Function in `functions/` exposes:

- `create_listing` — idempotently creates one listing from facts an agent found on its source page
- `list_listings` — verifies and lists recent room entries
- `POST /api/v1/listings` and `GET /api/v1/listings` — equivalent bearer-authenticated REST API
- `/openapi.json` — OpenAPI 3.1 description

The connector writes into the same Firebase room used by the app, so a connected browser receives agent-created listings in real time. Deployment, security, Codex, ChatGPT, and REST setup are documented in [docs/agent-connector.md](docs/agent-connector.md).

## Tech

Vite + React 18 + Tailwind CSS 3 + Recharts
