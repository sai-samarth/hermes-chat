# Current Status

Date: 2026-03-31

## Architecture Direction

The long-term target is a true Hermes gateway web platform, not a thin demo client. Over time, this repo should own the web product surface and the Hermes-facing gateway responsibilities needed to support chat workflows cleanly.

## Phase 1 Decision

Phase 1 remains intentionally narrow. The repo now includes a static frontend app-shell preview for visual feedback, but it still stops well short of product behavior or infrastructure.

## Current Boundary

- Repo exists and direction is documented
- Single App Router route exists at `app/page.tsx`
- Static chat-style shell includes a sidebar, top header, mocked chat history, mocked messages, and a composer preview
- Responsive styling lives in `app/globals.css`
- Core config files exist for Next.js, TypeScript, and ESLint
- No interactivity, auth, state management, database work, uploads, or Hermes integration have been added
