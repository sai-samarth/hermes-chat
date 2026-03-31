# hermes-chat

Minimal foundation for a Hermes-powered chat application.

## Purpose

This repository is a disciplined Phase 1 baseline for a future Hermes gateway web platform. The current step keeps the repo frontend-only and presents a restrained static chat app-shell preview for visual review.

## Phase 1 Scope

- Keep the app foundation intentionally small.
- Ship a single App Router route with a cleaner static chat workspace preview.
- Keep the conversation pane visually primary and the surrounding chrome quiet.
- Avoid interactivity, auth, database work, uploads, Hermes integration, and extra routes for now.

## Current Foundation

- Next.js App Router
- React
- TypeScript
- ESLint with Next.js config
- Static app-shell review preview

## Local Commands

1. `npm install`
2. `npm run dev`
3. `npm run lint`
4. `npm run build`

## What Exists Today

- `app/layout.tsx`, `app/page.tsx`, and `app/globals.css`
- Minimal Next.js configuration and TypeScript setup
- A single-route static preview with a quieter sidebar, primary conversation pane, and non-interactive composer
- Clear but restrained labels indicating that this is a Phase 1 visual review shell only

## Not Included Yet

- Interactive chat behavior
- Authentication
- Database or persistence
- File uploads
- Hermes integration
- Additional application routes
