# Current Status

Date: 2026-03-31

## Architecture Direction

The long-term target is a true Hermes gateway web platform, not a thin demo client. Over time, this repo should own the web product surface and the Hermes-facing gateway responsibilities needed to support chat workflows cleanly.

## Phase 1 Decision

Phase 1 remains intentionally narrow. The repo now includes a minimal Next.js + TypeScript foundation, but it still stops well short of product features or infrastructure.

## Current Boundary

- Repo exists and direction is documented
- App Router scaffold exists with `app/layout.tsx`, `app/page.tsx`, and `app/globals.css`
- Core config files exist for Next.js, TypeScript, and ESLint
- No auth, database, uploads, or Hermes integration have been added
