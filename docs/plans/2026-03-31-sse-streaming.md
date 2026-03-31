# SSE Streaming Implementation Plan

> For Hermes: use subagent-driven-development if this plan is later split into independent follow-up tasks.

Goal: add real server-sent event streaming to hermes-chat so the browser can render Hermes output incrementally while preserving the existing per-user profile and per-chat session model.

Architecture: keep the Next.js app as the browser-facing product surface, but add a streaming path through the localhost Python bridge. The bridge should not scrape decorated terminal output. Instead, it should launch a small Python worker subprocess that sets the correct Hermes profile environment before importing Hermes modules, restores or bootstraps the Hermes conversation state, and emits structured JSON events that the bridge can convert into SSE.

Tech Stack: Next.js App Router, TypeScript, React, Python stdlib HTTP server, Hermes CLI internals via a profile-scoped worker subprocess, SQLite-backed app persistence.

---

## Streaming design

1. Browser sends `POST /api/chat?stream=1`.
2. Next.js persists the user message first, then opens a streaming request to the bridge.
3. Bridge launches a profile-scoped Python worker.
4. Worker emits line-delimited JSON events:
   - `delta`
   - `done`
   - `error`
5. Bridge converts those into SSE frames.
6. Next.js proxies those frames back to the browser.
7. Browser renders deltas into an optimistic assistant message.
8. On `done`, Next.js persists the final assistant message and emits a final SSE event containing the persisted message and updated chat summary.

## Why this approach

- Avoids scraping Rich/TTY-decorated Hermes CLI output.
- Keeps profile isolation correct by setting `HERMES_HOME` inside a fresh worker process before Hermes imports.
- Preserves existing bridge responsibility boundaries.
- Lets the non-streaming and streaming paths share the same worker protocol.

## Implementation tasks

### Task 1: Add streaming test scaffolding
- Add a small TS test setup for stream event parsing helpers.
- Add Python bridge tests for worker-event parsing and SSE frame formatting.

### Task 2: Add browser-side SSE parsing helper
- Create a small reusable helper for parsing `text/event-stream` chunks into typed events.
- Cover it with failing tests first.

### Task 3: Add Hermes worker protocol
- Create a Python worker script under `bridge/`.
- It should:
  - set the selected Hermes profile env before Hermes imports
  - restore existing Hermes session history from Hermes `state.db` when resuming
  - accept bootstrap history for pre-bridge chats
  - create an AIAgent with a delta callback
  - write JSON lines to stdout as structured events

### Task 4: Extend the bridge
- Add a streaming endpoint in `bridge/hermes_bridge.py`.
- Reuse the worker protocol for both blocking and streaming execution.
- Keep the existing JSON endpoint behavior stable.

### Task 5: Extend the Next.js API route
- Detect streaming requests with query param or Accept header.
- Proxy bridge SSE frames.
- Persist the assistant message only once the stream completes.
- Emit final metadata so the browser can reconcile optimistic state with persisted state.

### Task 6: Update the client UI
- Use `fetch` + readable stream for sends.
- Show an optimistic assistant message shell that fills incrementally.
- Reconcile with the persisted assistant message on completion.
- Preserve current non-streaming error behavior as fallback.

### Task 7: Validate
- Run tests, lint, and build.
- Manually verify first-turn bootstrap streaming and resumed-session streaming.
