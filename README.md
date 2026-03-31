# hermes-chat

Minimal foundation for a Hermes-powered chat application.

## Purpose

This repository is a disciplined Phase 1 baseline for a future Hermes gateway web platform. The current step adds only a very small Next.js + TypeScript application shell so later features can be introduced deliberately.

## Phase 1 Scope

- Keep the app foundation intentionally small.
- Ship a single App Router landing page and the minimum TypeScript and linting setup.
- Avoid auth, database work, uploads, Hermes integration, and extra routes for now.

## Current Foundation

- Next.js App Router
- React
- TypeScript
- ESLint with Next.js config

## Local Commands

1. `npm install`
2. `npm run dev`
3. `npm run lint`
4. `npm run build`

## What Exists Today

- `app/layout.tsx`, `app/page.tsx`, and `app/globals.css`
- Minimal Next.js configuration and TypeScript setup
- A landing page that explicitly marks this as the Phase 1 foundation for Hermes Chat

## Not Included Yet

- Authentication
- Database or persistence
- File uploads
- Hermes integration
- Additional application routes
