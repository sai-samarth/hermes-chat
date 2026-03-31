# Current Status

Date: 2026-03-31

## Architecture Direction

The long-term target remains a true Hermes gateway web platform, not a thin
demo client. Over time, this repo should own the web product surface and the
Hermes-facing gateway responsibilities needed to support chat workflows cleanly.

## Phase 1 Decision

Phase 1 stays intentionally narrow. The repo now includes local auth, SQLite
persistence, a local Hermes bridge, per-user Hermes profiles, and per-chat
Hermes sessions, but it still stops well short of the final gateway-native web
adapter.

## Current Boundary

- Single App Router route exists at `app/page.tsx`
- API routes exist for chat send, chat list/create, chat detail loading, local
  register, login, logout, and current session lookup
- Server-side SQLite storage lives in `lib/chat-store.ts`, `lib/auth.ts`, and
  `lib/db.ts`
- The Next.js backend now talks to a localhost-only Python bridge in
  `bridge/hermes_bridge.py`
- The bridge lazily provisions one Hermes profile per authenticated app user
- Bridge-managed profiles clone baseline config but explicitly disable Honcho so
  they do not inherit the host's global peer memory
- The bridge resumes one Hermes session per app chat and returns those IDs to
  the app for persistence
- Users, sessions, chats, messages, Hermes profile names, and Hermes session
  IDs persist locally in SQLite and survive page refresh
- Older chats without a stored Hermes session ID send a one-time bootstrap
  history payload on their first bridge-backed turn
- UI supports a signed-out auth screen plus an authenticated workspace with
  persisted chats, selection, loading state, and assistant replies
- No OAuth, password reset, email verification, attachments, or streaming have
  been added
- Postgres and the final gateway-native Hermes web/session model are still
  deferred
