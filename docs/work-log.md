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
- Kept auth, persistence, attachments, streaming, and the final gateway-native session model out of scope.
