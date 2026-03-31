# hermes-chat

Minimal Phase 1 foundation for a Hermes-powered chat application.

## Purpose

This repo is the first narrow backend slice toward a future Hermes gateway web
platform. The current phase keeps the product surface intentionally small while
making local auth, local persistence, per-user Hermes isolation, and per-chat
Hermes continuity real.

## Current Foundation

- Next.js App Router
- React
- TypeScript
- SQLite-backed local users, sessions, chats, and messages
- Local email/password auth with secure password hashing
- HttpOnly session cookies issued by the Next.js backend
- A localhost-only Python bridge that provisions one Hermes profile per app
  user and resumes one Hermes session per app chat

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local`
3. By default the bridge clones new app-user profiles from your existing
   `default` Hermes profile so provider/model config carries over. Override that
   by setting `HERMES_BRIDGE_BASELINE_PROFILE` in `.env.local` if you want a
   different baseline profile.
4. Optionally set `HERMES_BRIDGE_API_KEY` if you want the Next.js backend to
   authenticate to the bridge over localhost
5. Optionally set `SQLITE_DB_PATH` if you do not want the default
   `./data/hermes-chat.sqlite`
6. Start the bridge with `npm run bridge`
7. Bridge-managed profiles automatically disable Honcho locally so web users do
   not inherit the host machine's global peer memory.
8. Start the app with `npm run dev`
9. Open the app, register a local account, create a chat, and send messages

The bridge loads `.env.local` directly, so the same file can configure both the
Next.js app and the Python bridge.

## Local Commands

1. `npm run bridge`
2. `npm run dev`
3. `npm run lint`
4. `npm run build`

## What Exists Today

- `app/layout.tsx`, `app/page.tsx`, and `app/globals.css`
- `app/api/chat/route.ts`
- `app/api/chats/route.ts` and `app/api/chats/[chatId]/route.ts`
- `app/api/auth/login/route.ts`, `app/api/auth/register/route.ts`,
  `app/api/auth/logout/route.ts`, and `app/api/session/route.ts`
- `lib/chat-store.ts`, `lib/db.ts`, `lib/auth.ts`, and `lib/hermes.ts`
- `bridge/hermes_bridge.py` and `bridge/README.md`
- A single-route app that shows a local auth screen when signed out and the
  chat workspace when signed in
- Per-user Hermes profile persistence in SQLite via `users.hermes_profile_name`
- Per-chat Hermes session persistence in SQLite via `chats.hermes_session_id`
- One-time bootstrap history handoff for older chats that predate bridge-backed
  Hermes sessions

## Not Included Yet

- Postgres or any external/shared database
- OAuth or SSO
- Password reset
- Email verification
- File uploads
- Attachments
- Streaming responses
- Final gateway-native Hermes web adapter
- Broader multi-route application structure
