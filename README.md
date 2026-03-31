# hermes-chat

Minimal foundation for a Hermes-powered chat application.

## Purpose

This repository is a disciplined Phase 1 baseline for a future Hermes gateway web platform. The current step adds the first useful backend slice while keeping the product surface intentionally small.

## Phase 1 Scope

- Keep the app foundation intentionally small.
- Ship a single App Router route with a restrained chat workspace.
- Add the smallest vertical slice that can persist chats locally, authenticate a local user, send a message to Hermes, and render the reply.
- Keep the conversation pane visually primary and the surrounding chrome quiet.
- Keep OAuth, password reset, email verification, uploads, attachments, streaming, and broad application routing out of scope for now.

## Current Foundation

- Next.js App Router
- React
- TypeScript
- ESLint with Next.js config
- SQLite-backed local chat persistence via `better-sqlite3`
- Local email/password auth with secure password hashing
- HttpOnly session cookies issued by the Next.js backend
- Next.js API routes for chat send, chat list/create, and chat detail loading
- Next.js API routes for register, login, logout, and current session lookup
- Temporary Hermes API server adapter in `lib/hermes.ts`
- Per-user chat ownership scoped in SQLite

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local`
3. In the `hermes-agent` environment, enable the Hermes API server:
   `API_SERVER_ENABLED=true`
   If auth is enabled there, set a matching `API_SERVER_KEY` and use the same value for `HERMES_API_KEY` in this app
4. Set the Hermes API server values in `hermes-chat/.env.local`:
   `HERMES_API_BASE_URL` should include the OpenAI-compatible `/v1` prefix and defaults to `http://localhost:8642/v1`
   `HERMES_MODEL` should match the model exposed by the Hermes API server and defaults to `hermes-agent`
   `HERMES_API_KEY` is optional if your local Hermes API server does not require auth
5. Optionally set `SQLITE_DB_PATH` in `hermes-chat/.env.local` if you do not want the default `./data/hermes-chat.sqlite`
   Relative paths resolve from the project root and parent directories are created automatically
6. Optionally set `AUTH_SESSION_TTL_DAYS` if you want local sessions to expire sooner or later than the default 30 days
7. Local auth cookies stay usable on plain `http://localhost` by default. Set `AUTH_COOKIE_SECURE=true` only when you want to force `Secure` session cookies, such as behind HTTPS locally or in a custom deployment
8. Start the Hermes API server
9. If you changed the `hermes-agent` environment, restart or reload the Hermes gateway before testing the chat app, or message sends will keep failing against stale gateway state
10. Run `npm run dev`
11. Open the app, register a local account, and then create chats inside that authenticated workspace

This slice stores users, sessions, chats, and messages in a local SQLite file while still using the Hermes OpenAI-compatible API server as the temporary model boundary. Existing pre-auth chats without owners are intentionally left unreachable after the migration; new chats are always attached to the authenticated user who created them.

## Local Commands

1. `npm run dev`
2. `npm run lint`
3. `npm run build`

## What Exists Today

- `app/layout.tsx`, `app/page.tsx`, and `app/globals.css`
- `app/api/chat/route.ts`
- `app/api/chats/route.ts` and `app/api/chats/[chatId]/route.ts`
- `app/api/auth/login/route.ts`, `app/api/auth/register/route.ts`, `app/api/auth/logout/route.ts`, and `app/api/session/route.ts`
- `lib/chat-types.ts`, `lib/chat-store.ts`, `lib/db.ts`, `lib/auth.ts`, and `lib/hermes.ts`
- Minimal Next.js configuration and TypeScript setup
- A single-route app that shows a local auth screen when signed out and the chat workspace when signed in
- A server-side Hermes client that calls the Hermes API server through environment variables
- SQLite-backed users, sessions, chats, and messages that survive page refresh
- Per-user chat ownership so authenticated users only see their own chats and messages
- Secure password hashing and HttpOnly cookie sessions managed by the Next.js backend, with `Secure` enabled automatically on HTTPS requests or via `AUTH_COOKIE_SECURE=true`
- Clear labels indicating that this is a temporary API-server-backed slice, not the final gateway-native model

## Not Included Yet

- Postgres or any external/shared database
- OAuth or SSO
- Password reset
- Email verification
- File uploads
- Attachments
- Streaming responses
- Final gateway-native Hermes session adapter
- Broader multi-route application structure
