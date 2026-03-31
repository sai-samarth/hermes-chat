# Hermes Profile Bridge Implementation Plan

> For Hermes: use subagent-driven-development if this plan is later split into independent follow-up tasks.

Goal: replace the shared OpenAI-compatible Hermes API server boundary with a narrow bridge that gives each authenticated hermes-chat user an isolated Hermes profile and gives each app chat a stable Hermes session.

Architecture: keep the Next.js app as the product surface and SQLite owner of app auth/chat metadata, but route all Hermes execution through a small local Python bridge. The bridge will provision one Hermes profile per app user, run Hermes via isolated subprocesses, and resume one Hermes session per app chat. This keeps Phase 1 minimal while aligning with the long-term gateway-native direction.

Tech Stack: Next.js, TypeScript, better-sqlite3, Python 3 stdlib HTTP server, Hermes CLI profiles/sessions.

---

## Task 1: Add bridge-aware persistence fields

Objective: extend the app database so users and chats can map to Hermes profile/session state without breaking current chat UX.

Files:
- Modify: `lib/db.ts`
- Modify: `lib/chat-store.ts`
- Modify: `lib/chat-types.ts`

Steps:
1. Add `hermes_profile_name` to `users` as a nullable column.
2. Add `hermes_session_id` to `chats` as a nullable column.
3. Add indexes only where they help lookup and do not complicate SQLite migration.
4. Add small repository helpers to:
   - read a user’s Hermes profile name
   - persist a user’s Hermes profile name
   - read a chat’s Hermes session id
   - persist a chat’s Hermes session id
5. Keep migrations additive only so existing local data is preserved.

Verification:
- App boots against an existing SQLite file.
- New columns exist after startup.
- Existing auth/chat flows still load.

Commit message:
- `feat: persist hermes profile and session ids`

## Task 2: Build a narrow Python bridge

Objective: create a local-only bridge service that provisions Hermes profiles and runs a single Hermes turn for the correct profile.

Files:
- Create: `bridge/hermes_bridge.py`
- Create: `bridge/README.md`

Steps:
1. Implement a tiny HTTP JSON server using Python stdlib only.
2. Add `GET /health` for readiness checks.
3. Add `POST /v1/chat` that accepts:
   - `app_user_id`
   - `app_user_email`
   - `chat_id`
   - `message`
   - optional `hermes_session_id`
   - optional `history` for first-turn bootstrap when a chat predates bridge sessions
4. Derive a deterministic profile name from `app_user_id`.
5. Ensure the profile exists using Hermes profiles:
   - use `--clone --clone-from <baseline>` when a baseline is configured
   - otherwise create a blank profile
6. Run Hermes via subprocess with `hermes -p <profile> chat -Q -q ...`.
7. If `hermes_session_id` is present, use `--resume`.
8. Parse quiet-mode stdout into:
   - assistant text
   - session id
9. Return JSON containing:
   - `message`
   - `hermes_session_id`
   - `hermes_profile_name`
10. Keep the bridge bound to localhost and allow an optional shared secret header.

Verification:
- `GET /health` returns ok.
- First request for a new user lazily creates a profile.
- First chat turn returns assistant text and a new Hermes session id.
- Second turn with the same session id resumes correctly.

Commit message:
- `feat: add isolated hermes bridge`

## Task 3: Replace the Next.js Hermes adapter

Objective: swap the app from the shared OpenAI-compatible API server to the new bridge without changing the UI contract.

Files:
- Modify: `lib/hermes.ts`
- Modify: `app/api/chat/route.ts`

Steps:
1. Replace `HERMES_API_BASE_URL` usage with bridge config.
2. Add a server-side bridge client that calls the Python bridge over HTTP.
3. Keep one narrow exported function for the chat route to use.
4. Make the chat route:
   - append the user message first
   - load the chat’s current Hermes session id
   - send the current user and chat context to the bridge
   - persist returned Hermes profile/session ids
   - append the assistant reply second
5. For chats that have old app-side history but no Hermes session id yet, send recent persisted history as bootstrap context only on the first bridge-backed turn.
6. Preserve existing error handling shape for the frontend.

Verification:
- Existing chat API response shape stays usable by the frontend.
- First send in a new chat creates a session.
- Later sends resume that session.
- Different authenticated users produce different Hermes profiles.

Commit message:
- `feat: route chat through hermes profile bridge`

## Task 4: Update setup docs and status docs

Objective: document the new boundary clearly so future work does not regress to the shared API server model.

Files:
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/current-status.md`
- Modify: `docs/work-log.md`

Steps:
1. Remove setup language that says the app depends on the OpenAI-compatible API server.
2. Add bridge env vars for:
   - bridge URL
   - optional bridge API key
   - optional baseline profile
   - optional Hermes command override
3. Add startup instructions for the local Python bridge.
4. State explicitly that Phase 1 now uses per-user Hermes profiles and per-chat Hermes sessions, but is still not the final gateway-native web adapter.

Verification:
- A new developer can start both the bridge and the app from the README.
- Docs match the implemented env var names exactly.

Commit message:
- `docs: document hermes profile bridge setup`

## Task 5: End-to-end validation

Objective: prove the new isolation boundary actually works.

Files:
- No code files required beyond any small local test helpers if needed.

Steps:
1. Start the Python bridge locally.
2. Start the Next.js app locally.
3. Register user A and send a message that writes memory/profile-specific context.
4. Register user B and confirm they do not inherit user A’s profile-level context.
5. Confirm repeated sends in the same chat reuse the same Hermes session id.
6. Run `npm run lint` and `npm run build`.
7. Commit the final verified state.

Verification:
- User isolation is real at the Hermes profile layer.
- Chat continuity is real at the Hermes session layer.
- Static checks pass.

Commit message:
- `feat: move hermes-chat to isolated profile bridge`
