# Hermes Bridge

`bridge/hermes_bridge.py` is the Phase 1 local boundary between the Next.js app
and Hermes CLI execution.

## Endpoints

- `GET /health`
- `POST /v1/chat`

`POST /v1/chat` accepts JSON with:

- `app_user_id`
- `app_user_email`
- `chat_id`
- `message`
- optional `hermes_session_id`
- optional `history`

It returns JSON with:

- `message`
- `hermes_session_id`
- `hermes_profile_name`

## Behavior

- Binds to localhost only.
- Lazily provisions one Hermes profile per app user.
- Derives a deterministic safe profile name from `app_user_id`.
- Uses `hermes profile create <name> --no-alias`.
- Uses `--clone --clone-from <baseline>` for new users.
- Defaults that baseline to the existing `default` Hermes profile.
- `HERMES_BRIDGE_BASELINE_PROFILE` can override the baseline profile name.
- Writes a profile-local `honcho.json` with `{"enabled": false}` and patches
  `config.yaml` so bridge-managed profiles do not inherit global Honcho context.
- Runs one Hermes subprocess per request with `hermes -p <profile> chat -Q -q`.
- Serializes requests per existing Hermes session, or per `(profile, chat)` before a
  session exists, so overlapping sends do not fork session state.
- Resumes existing Hermes sessions with `--resume`.

## Local Usage

1. Copy `.env.example` to `.env.local`.
2. Set `HERMES_BRIDGE_BASELINE_PROFILE=default` if you want new app users to
   inherit the config from your default Hermes profile.
3. Start the bridge with `npm run bridge`.
4. Check readiness with `curl http://127.0.0.1:8643/health`.

If `HERMES_BRIDGE_API_KEY` is set, callers must send it in the
`X-Hermes-Bridge-Key` header.
