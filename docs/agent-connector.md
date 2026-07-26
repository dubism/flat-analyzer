# Flat Analyzer agent connector

The connector lets an agent browse a real-estate page with its normal browser/search tools, extract supported facts, and then write one offer into Flat Analyzer. It does not scrape arbitrary pages itself.

## What is exposed

| Surface | Endpoint/tool | Purpose |
|---|---|---|
| MCP | `POST /mcp` | Stateless Streamable HTTP MCP transport |
| MCP tool | `create_listing` | Create one listing; retry-safe by normalized source URL |
| MCP tool | `list_listings` | Verify recent listings in the permitted room |
| REST | `POST /api/v1/listings` | Create the same listing without MCP |
| REST | `GET /api/v1/listings` | List compact listing summaries |
| REST | `GET /openapi.json` | OpenAPI 3.1 contract |
| Health | `GET /health` | Unauthenticated liveness check |

Both MCP and listing API routes require `Authorization: Bearer <token>`. Room access fails closed: only `FLAT_ANALYZER_DEFAULT_ROOM_ID` and IDs in `FLAT_ANALYZER_ALLOWED_ROOM_IDS` can be used.

## Deploy to Firebase

Prerequisites:

- Firebase project `flat-notes-memory` with Realtime Database
- a Firebase plan that supports Cloud Functions
- Node.js 22 and Firebase CLI access
- a shared Flat Analyzer room code, visible in the app URL as `?room=<code>`

1. Install the function dependencies:

   ```bash
   npm --prefix functions ci
   ```

2. Copy the non-secret configuration:

   ```bash
   cp functions/.env.example functions/.env.flat-notes-memory
   ```

   Set the default room and the comma-separated allowlist. The local `.env*` file is ignored by Git.

3. Create a random bearer token of at least 32 characters and store it as a Firebase secret:

   ```bash
   npx firebase-tools functions:secrets:set FLAT_ANALYZER_API_TOKEN
   ```

4. Run the tests, then deploy:

   ```bash
   npm --prefix functions test
   npx firebase-tools deploy --only functions
   ```

5. Copy the exact `agentConnector` URL printed by Firebase. The MCP URL is that function URL plus `/mcp`.

No service-account key is committed or needed in Cloud Functions. Firebase Admin uses the function runtime identity and an atomic Realtime Database transaction.

## Connect Codex

Keep the bearer token in an environment variable and add the deployed endpoint to `~/.codex/config.toml` or a trusted project’s `.codex/config.toml`:

```toml
[mcp_servers.flat_analyzer]
url = "https://YOUR-DEPLOYED-FUNCTION-URL/mcp"
bearer_token_env_var = "FLAT_ANALYZER_API_TOKEN"
default_tools_approval_mode = "writes"
```

Restart Codex after changing the configuration. A typical instruction is:

> Browse this listing, copy only facts supported by the page, then use `create_listing` to add it to Flat Analyzer.

The server instructions repeat that evidence rule. Unknown fields should be omitted, not guessed.

## Connect ChatGPT

In the ChatGPT desktop app, add a Streamable HTTP MCP server under **Settings → MCP servers**, use the deployed `/mcp` URL, and configure the bearer token. The desktop app and local Codex clients can also share the Codex MCP configuration above.

ChatGPT web uses remote MCP tools through plugins. After deployment, register or bundle the same `/mcp` URL as a remote MCP connection in a personal/workspace plugin; keep the bearer token in the plugin’s secret or authorization configuration, never in this repository.

## REST example

```bash
curl \
  -H "Authorization: Bearer $FLAT_ANALYZER_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_url": "https://www.sreality.cz/detail/example",
    "name": "Tusarova 2+kk",
    "price_czk": 9400000,
    "size_m2": 60,
    "rooms": "2+kk",
    "address": "Tusarova, Praha 7",
    "observed_at": "2026-07-26T10:00:00+02:00",
    "agent_name": "Codex"
  }' \
  "https://YOUR-DEPLOYED-FUNCTION-URL/api/v1/listings"
```

When no default room is configured, include `room_id`. If the normalized `source_url` already exists, the API returns `200` with `"action": "existing"`; a new listing returns `201` with `"action": "created"`.

## Listing behavior

- The source URL is canonicalized by removing fragments and common tracking parameters.
- The URL produces a stable agent listing ID.
- An existing listing with the same canonical URL wins, including a listing created manually in the browser.
- New entries use the app’s current nested `data` and `subjectiveRatings` model.
- Missing subjective values default to neutral `5`; agents should submit subjective scores only when the user explicitly wants them inferred.
- Browsing provenance is stored in `offer.source`, while the source URL remains in `offer.data.URL` for the existing UI.
- Writes update the whole room through a Firebase transaction, preserving room metadata and concurrent offers.

## Local verification

```bash
npm --prefix functions test
npm run build
```

The test suite covers normalization, allowlisting, REST authentication, idempotency, and a real MCP client connecting over Streamable HTTP and calling both tools.
