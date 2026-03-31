# hermes-chat

Minimal foundation for a Hermes-powered chat application.

## Purpose

This repository starts as a disciplined Phase 1 baseline for a future Hermes gateway web platform. The immediate goal is to capture direction, scope, and next steps before scaffolding application code.

## Phase 1 Scope

- Create only the repo foundation and decision records.
- Avoid premature app, database, auth, or deployment scaffolding.
- Keep the next implementation step small and intentional.

## Stack Recommendation Summary

- Web app: Next.js with TypeScript
- Runtime: Node.js
- Persistence: Postgres
- Development approach: local-first, minimal dependencies, add infrastructure only when needed

## Immediate Next Steps

1. Initialize the app foundation deliberately instead of using heavy default scaffolding.
2. Define environment variable conventions and local development workflow.
3. Choose the first persistence path for chat/session data in Postgres.
4. Establish the initial Hermes gateway boundary inside the web platform.
