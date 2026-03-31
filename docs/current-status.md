# Current Status

Date: 2026-03-31

## Architecture Direction

The long-term target is a true Hermes gateway web platform, not a thin demo client. Over time, this repo should own the web product surface and the Hermes-facing gateway responsibilities needed to support chat workflows cleanly.

## Phase 1 Decision

Phase 1 remains intentionally narrow. The repo now includes a practical SQLite-backed persistence and local-auth slice, but it still stops well short of the final gateway-native product model.

## Current Boundary

- Repo exists and direction is documented
- Single App Router route exists at `app/page.tsx`
- API routes now exist for chat send, chat list/create, and chat detail loading
- API routes now exist for local register, login, logout, and current session lookup
- Server-side Hermes adapter exists in `lib/hermes.ts`
- Server-side SQLite chat and auth storage now live in `lib/chat-store.ts`, `lib/auth.ts`, and `lib/db.ts`
- UI now supports a signed-out auth screen plus an authenticated workspace with persisted chats, sidebar selection, message submission, loading state, and assistant replies
- Responsive styling lives in `app/globals.css`
- Core config files exist for Next.js, TypeScript, and ESLint
- The current backend boundary is the Hermes OpenAI-compatible API server, configured by environment variables
- Users, sessions, chats, and messages persist locally in SQLite and survive page refresh
- Chats are now scoped to the authenticated local user via secure HttpOnly cookie sessions
- Existing legacy chats without owners may remain unreachable after the ownership migration
- No OAuth, password reset, email verification, attachments, or streaming have been added
- Postgres and gateway-native Hermes sessions are explicitly deferred to later phases
- This is not yet the final gateway-native session model
