# Work Log

## 2026-03-31

Initial repository bootstrap:

- Created the repo's first documentation foundation.
- Recorded the architecture direction toward a Hermes gateway web platform.
- Set the first-step intent to begin with a minimal app foundation rather than broad scaffolding.

Phase 1 app foundation scaffold:

- Added a very small Next.js App Router + TypeScript baseline.
- Created the initial landing page that labels this repo state as the Hermes Chat Phase 1 foundation.
- Added minimal project config for TypeScript, Next.js, and ESLint.
- Kept auth, database, uploads, and Hermes integration explicitly out of scope.

Static chat app-shell preview:

- Replaced the initial landing page with a single-route static chat interface preview for visual review.
- Added a left sidebar, top header, mocked history list, mocked messages, and a bottom composer shell.
- Updated the global styling to give the preview a responsive modern chat-product feel.
- Kept the work frontend-only with clear labels that Phase 1 is still static and non-interactive.

First backend vertical slice:

- Added `lib/hermes.ts` as a server-side adapter for the Hermes OpenAI-compatible API server.
- Added `app/api/chat/route.ts` to validate message lists and return a basic assistant reply payload.
- Converted the single-route UI into a working local-state chat flow with submit, loading, and transcript updates.
- Added `.env.example` and updated docs to describe the temporary Hermes API server boundary and setup.
- Manual testing confirmed the setup needs `hermes-chat/.env.local`, `API_SERVER_ENABLED=true` in the `hermes-agent` environment, a matching `API_SERVER_KEY` when auth is enabled, and a Hermes gateway restart or reload after `hermes-agent` env changes before the chat app can send messages.
- Kept auth, persistence, attachments, streaming, and the final gateway-native session model out of scope.

SQLite persistence slice:

- Added `better-sqlite3` and a small repository layer in `lib/chat-store.ts`.
- Configured a local SQLite database path via `SQLITE_DB_PATH`, defaulting to `./data/hermes-chat.sqlite`.
- Initialized the SQLite schema automatically, enabled WAL mode, and kept the persistence model intentionally small for a single-server app with a few concurrent users.
- Added chat list/create and chat detail API routes so the sidebar and transcript load from persisted data.
- Updated `app/api/chat/route.ts` so a user message is persisted first, Hermes is called with recent persisted context, and the assistant reply is persisted second.
- Rewired the UI to load real chats into the sidebar, create a default chat when the database is empty, switch between chats, and keep history across refreshes.
- Left auth, Postgres, streaming, attachments, and the final gateway-native Hermes session model out of scope for later phases.

Local auth and session slice:

- Added shared SQLite initialization in `lib/db.ts` and extended the schema with `users`, `sessions`, and nullable chat ownership via `owner_user_id`.
- Kept the existing chats/messages tables intact so prior data is not destroyed; legacy ownerless chats may remain unreachable after the migration.
- Added local email/password registration and login with password hashing based on Node's `scrypt`.
- Added secure HttpOnly session cookies issued by the Next.js backend and stored hashed session tokens in SQLite.
- Added `app/api/auth/register/route.ts`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, and `app/api/session/route.ts`.
- Scoped chat list, chat detail, chat creation, and message append/Hermes send operations to the authenticated user only.
- Reworked the single route so signed-out users see a clean auth screen while signed-in users see the existing chat workspace.
- Updated setup docs and environment examples for the local-auth phase while keeping Hermes behind the same server-side API boundary.

Hermes profile bridge migration:

- Replaced the temporary Hermes OpenAI-compatible API server boundary with a
  localhost-only Python bridge in `bridge/hermes_bridge.py`.
- Added additive SQLite schema columns for `users.hermes_profile_name` and
  `chats.hermes_session_id`.
- Added store helpers so the Next.js backend can persist Hermes profile/session
  mappings without changing the frontend API contract.
- Updated `lib/hermes.ts` to call the bridge over HTTP instead of
  `/v1/chat/completions`.
- Tightened bridge profile isolation after validation showed global Honcho
  context could still leak through the host-level Honcho config. Bridge-managed
  profiles now get a local `honcho.json` with `enabled: false` plus a matching
  `config.yaml` patch.
- Updated `app/api/chat/route.ts` so the user message is persisted first, the
  bridge is called second, returned Hermes profile/session IDs are stored third,
  and the assistant reply is persisted last.
- Added bridge-side request serialization keyed by Hermes session ID, or by
  `(profile, chat)` before a session exists, so overlapping sends do not fork a
  chat into multiple Hermes sessions.
- Added one-time bootstrap history handoff for older chats that have app-side
  history but no stored Hermes session ID yet.
- Documented bridge setup, bridge env vars, and the new Phase 1 boundary in
  `.env.example`, `README.md`, `docs/current-status.md`, and
  `bridge/README.md`.
