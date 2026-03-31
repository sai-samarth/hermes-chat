# Current Status

Date: 2026-03-31

## Architecture Direction

The long-term target is a true Hermes gateway web platform, not a thin demo client. Over time, this repo should own the web product surface and the Hermes-facing gateway responsibilities needed to support chat workflows cleanly.

## Phase 1 Decision

Phase 1 remains intentionally narrow. The repo now includes a practical SQLite-backed persistence slice, but it still stops well short of the final gateway-native product model.

## Current Boundary

- Repo exists and direction is documented
- Single App Router route exists at `app/page.tsx`
- API routes now exist for chat send, chat list/create, and chat detail loading
- Server-side Hermes adapter exists in `lib/hermes.ts`
- Server-side SQLite chat store exists in `lib/chat-store.ts`
- UI now supports persisted chats, sidebar selection, message submission, loading state, and assistant replies
- Responsive styling lives in `app/globals.css`
- Core config files exist for Next.js, TypeScript, and ESLint
- The current backend boundary is the Hermes OpenAI-compatible API server, configured by environment variables
- Chats and messages persist locally in SQLite and survive page refresh
- A first default chat is created automatically when the database is empty
- No auth, attachments, or streaming have been added
- This remains a single anonymous/local-user experience for now
- Postgres and gateway-native Hermes sessions are explicitly deferred to later phases
- This is not yet the final gateway-native session model
