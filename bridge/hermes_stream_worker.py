#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_HERMES_REPO_ROOT = ROOT.parent / "hermes-agent"


def emit(event: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def read_payload() -> dict[str, Any]:
    raw = sys.stdin.read()

    if not raw.strip():
        raise ValueError("Worker received an empty payload.")

    payload = json.loads(raw)

    if not isinstance(payload, dict):
        raise ValueError("Worker payload must be a JSON object.")

    return payload


def require_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)

    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"`{key}` must be a non-empty string.")

    return value.strip()


def normalize_history(payload: dict[str, Any]) -> list[dict[str, str]]:
    raw_history = payload.get("history")

    if raw_history is None:
        return []

    if not isinstance(raw_history, list):
        raise ValueError("`history` must be an array when provided.")

    normalized: list[dict[str, str]] = []

    for index, entry in enumerate(raw_history):
        if not isinstance(entry, dict):
            raise ValueError(f"`history[{index}]` must be an object.")

        role = entry.get("role")
        content = entry.get("content")

        if role not in {"system", "user", "assistant"}:
            raise ValueError(
                f"`history[{index}].role` must be system, user, or assistant."
            )

        if not isinstance(content, str) or not content.strip():
            raise ValueError(
                f"`history[{index}].content` must be a non-empty string."
            )

        normalized.append({"role": role, "content": content.strip()})

    return normalized


def main() -> int:
    try:
        payload = read_payload()
        profile_name = require_string(payload, "profile_name")
        message = require_string(payload, "message")
        hermes_repo_root = Path(
            os.environ.get("HERMES_BRIDGE_HERMES_REPO_ROOT", str(DEFAULT_HERMES_REPO_ROOT))
        ).resolve()
        history = normalize_history(payload)
        raw_session_id = payload.get("hermes_session_id")
        hermes_session_id = raw_session_id.strip() if isinstance(raw_session_id, str) and raw_session_id.strip() else None

        if not hermes_repo_root.is_dir():
            raise FileNotFoundError(
                f"Hermes repo root does not exist: {hermes_repo_root}"
            )

        sys.path.insert(0, str(hermes_repo_root))

        from hermes_cli.profiles import resolve_profile_env

        os.environ["HERMES_HOME"] = resolve_profile_env(profile_name)

        from hermes_constants import get_hermes_home
        from hermes_cli.env_loader import load_hermes_dotenv

        load_hermes_dotenv(
            hermes_home=get_hermes_home(),
            project_env=hermes_repo_root / ".env"
        )

        from cli import HermesCLI

        cli = HermesCLI(verbose=False, compact=True, resume=hermes_session_id)
        cli.tool_progress_mode = "off"
        cli.show_reasoning = False
        cli.streaming_enabled = False

        if hermes_session_id:
            cli.session_id = hermes_session_id
            cli._resumed = True
            if cli._session_db:
                try:
                    cli._session_db.reopen_session(hermes_session_id)
                except Exception:
                    pass
                restored = cli._session_db.get_messages_as_conversation(hermes_session_id)
                cli.conversation_history = restored or []
        else:
            cli.conversation_history = history

        if not cli._ensure_runtime_credentials():
            raise RuntimeError("Hermes runtime credentials are unavailable.")

        turn_route = cli._resolve_turn_agent_config(message)
        if turn_route["signature"] != cli._active_agent_route_signature:
            cli.agent = None

        if not cli._init_agent(
            model_override=turn_route["model"],
            runtime_override=turn_route["runtime"],
            route_label=turn_route["label"]
        ):
            raise RuntimeError("Hermes agent initialization failed.")

        cli.agent._print_fn = lambda *args, **kwargs: None
        cli.agent.stream_delta_callback = (
            lambda delta: emit({"type": "delta", "delta": delta}) if delta else None
        )
        cli.agent.tool_gen_callback = None

        result = cli.agent.run_conversation(
            user_message=message,
            conversation_history=cli.conversation_history,
            persist_user_message=message
        )
        response = result.get("final_response", "") if isinstance(result, dict) else ""

        if not response and isinstance(result, dict) and result.get("error"):
            raise RuntimeError(str(result["error"]))

        if not response:
            raise RuntimeError("Hermes returned an empty final response.")

        emit(
            {
                "type": "done",
                "message": response,
                "hermes_profile_name": profile_name,
                "hermes_session_id": cli.session_id
            }
        )
        return 0
    except Exception as exc:
        emit({"type": "error", "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
