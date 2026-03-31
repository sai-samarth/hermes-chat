# Current Status

Date: 2026-03-31

## Architecture Direction

The long-term target is a true Hermes gateway web platform, not a thin demo client. Over time, this repo should own the web product surface and the Hermes-facing gateway responsibilities needed to support chat workflows cleanly.

## Phase 1 Decision

Phase 1 remains intentionally narrow. The repo now includes the first backend-backed vertical slice, but it still stops well short of the final gateway-native product model.

## Current Boundary

- Repo exists and direction is documented
- Single App Router route exists at `app/page.tsx`
- Single API route exists at `app/api/chat/route.ts`
- Server-side Hermes adapter exists in `lib/hermes.ts`
- UI now supports local in-browser chat state, message submission, loading state, and assistant replies
- Responsive styling lives in `app/globals.css`
- Core config files exist for Next.js, TypeScript, and ESLint
- The current backend boundary is the Hermes OpenAI-compatible API server, configured by environment variables
- No auth, persistence, attachments, or streaming have been added
- This is not yet the final gateway-native session model
