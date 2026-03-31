# hermes-chat

Minimal foundation for a Hermes-powered chat application.

## Purpose

This repository is a disciplined Phase 1 baseline for a future Hermes gateway web platform. The current step adds the first useful backend slice while keeping the product surface intentionally small.

## Phase 1 Scope

- Keep the app foundation intentionally small.
- Ship a single App Router route with a restrained chat workspace.
- Add the smallest vertical slice that can send a message to Hermes and render the reply.
- Keep the conversation pane visually primary and the surrounding chrome quiet.
- Avoid auth, database work, uploads, attachments, streaming, and extra routes for now.

## Current Foundation

- Next.js App Router
- React
- TypeScript
- ESLint with Next.js config
- Local in-browser chat state
- Next.js API route at `app/api/chat/route.ts`
- Temporary Hermes API server adapter in `lib/hermes.ts`

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
5. Start the Hermes API server
6. If you changed the `hermes-agent` environment, restart or reload the Hermes gateway before testing the chat app, or message sends will keep failing against stale gateway state
7. Run `npm run dev`

This backend slice uses the Hermes OpenAI-compatible API server as a temporary boundary. It is not the final gateway-native session model.

## Local Commands

1. `npm run dev`
2. `npm run lint`
3. `npm run build`

## What Exists Today

- `app/layout.tsx`, `app/page.tsx`, and `app/globals.css`
- `app/api/chat/route.ts`
- `lib/chat-types.ts` and `lib/hermes.ts`
- Minimal Next.js configuration and TypeScript setup
- A single-route chat workspace with local transcript state, loading state, and a working composer
- A server-side Hermes client that calls the Hermes API server through environment variables
- Clear labels indicating that this is a temporary API-server-backed slice, not the final gateway-native model

## Not Included Yet

- Authentication
- Database or persistence
- File uploads
- Attachments
- Streaming responses
- Final gateway-native Hermes session adapter
- Additional application routes
