#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import os
import re
import shlex
import subprocess
import sys
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

API_KEY_HEADER = "X-Hermes-Bridge-Key"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8643
MAX_BODY_BYTES = 256 * 1024
PROFILE_CREATE_TIMEOUT_SECONDS = 180
CHAT_TIMEOUT_SECONDS = 600
QUIET_OUTPUT_PATTERN = re.compile(
    r"(?s)^(?P<message>.*?)(?:\n+session_id:\s*(?P<session_id>[^\n]+)\s*)$"
)
CREDENTIAL_MIGRATION_PATTERN = re.compile(
    r"(?s)^⚠️\s+Migrating Codex credentials to Hermes's own auth store\.\n"
    r"\s+This avoids conflicts with Codex CLI and VS Code\.\n"
    r"\s+Run `hermes login` to create a fully independent session\.\n+"
)
REPO_ROOT = Path(__file__).resolve().parent.parent
LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}

_provision_lock = threading.Lock()
_provisioned_profiles: set[str] = set()
_request_lock_registry: dict[str, threading.Lock] = {}
_request_lock_registry_lock = threading.Lock()


class BridgeError(Exception):
    def __init__(self, message: str, status: int = HTTPStatus.BAD_GATEWAY):
        super().__init__(message)
        self.status = status


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        if line.startswith("export "):
            line = line[len("export ") :].lstrip()

        if "=" not in line:
            continue

        key, raw_value = line.split("=", 1)
        key = key.strip()

        if not key or key in os.environ:
            continue

        value = raw_value.strip()

        if value and value[0] in {"'", '"'} and value[-1:] == value[0]:
            value = value[1:-1]
        else:
            hash_index = value.find(" #")
            if hash_index != -1:
                value = value[:hash_index].rstrip()

        os.environ[key] = value


def load_project_env() -> None:
    load_dotenv(REPO_ROOT / ".env.local")
    load_dotenv(REPO_ROOT / ".env")


def parse_port(raw_value: str | None) -> int:
    if not raw_value:
        return DEFAULT_PORT

    try:
        port = int(raw_value)
    except ValueError as exc:
        raise SystemExit("HERMES_BRIDGE_PORT must be an integer.") from exc

    if port < 1 or port > 65535:
        raise SystemExit("HERMES_BRIDGE_PORT must be between 1 and 65535.")

    return port


def validate_listen_host(host: str) -> str:
    normalized = host.strip() or DEFAULT_HOST

    if normalized not in LOOPBACK_HOSTS:
        raise SystemExit("HERMES_BRIDGE_HOST must stay on a loopback address.")

    return normalized


def get_hermes_command() -> list[str]:
    raw_command = os.environ.get("HERMES_BRIDGE_HERMES_CMD", "hermes").strip()

    if not raw_command:
        raise SystemExit("HERMES_BRIDGE_HERMES_CMD must not be empty.")

    return shlex.split(raw_command)


def get_baseline_profile() -> str | None:
    baseline_profile = os.environ.get("HERMES_BRIDGE_BASELINE_PROFILE", "").strip()

    if baseline_profile:
        return baseline_profile

    return "default"


def get_expected_api_key() -> str | None:
    api_key = os.environ.get("HERMES_BRIDGE_API_KEY", "").strip()
    return api_key or None


def run_command(
    args: list[str], *, timeout_seconds: int, description: str, cwd: Path | None = None
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            args,
            capture_output=True,
            check=False,
            cwd=str(cwd or REPO_ROOT),
            text=True,
            timeout=timeout_seconds
        )
    except FileNotFoundError as exc:
        raise BridgeError(
            f"{description} failed because the Hermes command was not found.",
            HTTPStatus.BAD_GATEWAY
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise BridgeError(
            f"{description} timed out after {timeout_seconds} seconds.",
            HTTPStatus.GATEWAY_TIMEOUT
        ) from exc


def command_output_detail(result: subprocess.CompletedProcess[str]) -> str:
    combined = "\n".join(
        part.strip() for part in (result.stdout, result.stderr) if part and part.strip()
    ).strip()
    return combined or "No output was returned."


def derive_profile_name(app_user_id: str) -> str:
    digest = hashlib.sha256(app_user_id.encode("utf-8")).hexdigest()
    return f"hcuser{digest[:24]}"


def get_profile_dir(profile_name: str) -> Path:
    return Path.home() / ".hermes" / "profiles" / profile_name


def get_profile_workspace(profile_name: str) -> Path:
    return get_profile_dir(profile_name) / "workspace" / "hermes-chat"


def ensure_profile_honcho_disabled(profile_name: str) -> None:
    profile_dir = get_profile_dir(profile_name)
    config_path = profile_dir / "config.yaml"
    honcho_config_path = profile_dir / "honcho.json"

    honcho_config_path.write_text(
        json.dumps({"enabled": False}, indent=2) + "\n",
        encoding="utf-8"
    )

    if not config_path.is_file():
        return

    text = config_path.read_text(encoding="utf-8")
    replacement = "honcho:\n  enabled: false"

    if re.search(r"(?m)^honcho:\s*\{\}\s*$", text):
        updated = re.sub(r"(?m)^honcho:\s*\{\}\s*$", replacement, text, count=1)
    elif re.search(r"(?m)^honcho:\s*$", text):
        lines = text.splitlines()
        updated_lines: list[str] = []
        index = 0

        while index < len(lines):
            line = lines[index]
            updated_lines.append(line)

            if line == "honcho:":
                block_start = len(updated_lines)
                index += 1
                block_end = index

                while block_end < len(lines):
                    next_line = lines[block_end]
                    if next_line and not next_line.startswith(" "):
                        break
                    updated_lines.append(next_line)
                    block_end += 1

                enabled_index = next(
                    (
                        position
                        for position in range(block_start, len(updated_lines))
                        if updated_lines[position].lstrip().startswith("enabled:")
                    ),
                    None
                )

                if enabled_index is None:
                    updated_lines.insert(block_start, "  enabled: false")
                else:
                    updated_lines[enabled_index] = "  enabled: false"

                index = block_end
                continue

            index += 1

        updated = "\n".join(updated_lines)
        if text.endswith("\n"):
            updated += "\n"
    else:
        updated = text.rstrip() + "\n\nhoncho:\n  enabled: false\n"

    if updated != text:
        config_path.write_text(updated, encoding="utf-8")


def ensure_profile_exists(profile_name: str) -> None:
    with _provision_lock:
        if profile_name in _provisioned_profiles:
            get_profile_workspace(profile_name).mkdir(parents=True, exist_ok=True)
            ensure_profile_honcho_disabled(profile_name)
            return

        command = get_hermes_command() + ["profile", "create", profile_name, "--no-alias"]
        baseline_profile = get_baseline_profile()

        if baseline_profile:
            command.extend(["--clone", "--clone-from", baseline_profile])

        result = run_command(
            command,
            timeout_seconds=PROFILE_CREATE_TIMEOUT_SECONDS,
            description=f"Hermes profile provisioning for {profile_name}"
        )

        if result.returncode == 0:
            get_profile_workspace(profile_name).mkdir(parents=True, exist_ok=True)
            ensure_profile_honcho_disabled(profile_name)
            _provisioned_profiles.add(profile_name)
            return

        detail = command_output_detail(result)

        if "already exists" in detail.lower():
            get_profile_workspace(profile_name).mkdir(parents=True, exist_ok=True)
            ensure_profile_honcho_disabled(profile_name)
            _provisioned_profiles.add(profile_name)
            return

        raise BridgeError(
            f"Failed to provision Hermes profile '{profile_name}': {detail}"
        )


def get_request_lock(lock_key: str) -> threading.Lock:
    with _request_lock_registry_lock:
        lock = _request_lock_registry.get(lock_key)
        if lock is None:
            lock = threading.Lock()
            _request_lock_registry[lock_key] = lock
        return lock


def normalize_history_entry(index: int, entry: Any) -> dict[str, str]:
    if not isinstance(entry, dict):
        raise BridgeError(
            f"`history[{index}]` must be an object.",
            HTTPStatus.BAD_REQUEST
        )

    role = entry.get("role")
    content = entry.get("content")

    if role not in {"system", "user", "assistant"}:
        raise BridgeError(
            f"`history[{index}].role` must be system, user, or assistant.",
            HTTPStatus.BAD_REQUEST
        )

    if not isinstance(content, str) or not content.strip():
        raise BridgeError(
            f"`history[{index}].content` must be a non-empty string.",
            HTTPStatus.BAD_REQUEST
        )

    return {
        "role": role,
        "content": content.strip()
    }


def require_non_empty_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)

    if not isinstance(value, str) or not value.strip():
        raise BridgeError(
            f"`{key}` must be a non-empty string.",
            HTTPStatus.BAD_REQUEST
        )

    return value.strip()


def build_query(message: str, history: list[dict[str, str]]) -> str:
    if not history:
        return message

    transcript_lines = [
        "Continue this existing conversation naturally.",
        "Treat the transcript below as prior context and reply only to the final user message.",
        "Do not mention that the transcript was provided out of band.",
        "",
        "Transcript:"
    ]

    role_labels = {
        "system": "System",
        "user": "User",
        "assistant": "Assistant"
    }

    for entry in history:
        transcript_lines.append(f"{role_labels[entry['role']]}: {entry['content']}")

    transcript_lines.extend(["", f"User: {message}"])
    return "\n".join(transcript_lines)


def parse_quiet_output(stdout: str) -> tuple[str, str]:
    normalized_stdout = CREDENTIAL_MIGRATION_PATTERN.sub("", stdout.lstrip())
    match = QUIET_OUTPUT_PATTERN.match(normalized_stdout.strip())

    if not match:
        raise BridgeError(
            "Hermes returned unexpected quiet-mode output.",
            HTTPStatus.BAD_GATEWAY
        )

    message = match.group("message").strip()
    session_id = match.group("session_id").strip()

    if not message:
        raise BridgeError(
            "Hermes returned an empty assistant message.",
            HTTPStatus.BAD_GATEWAY
        )

    if not session_id:
        raise BridgeError(
            "Hermes returned an empty session id.",
            HTTPStatus.BAD_GATEWAY
        )

    return message, session_id


def run_chat(
    *,
    profile_name: str,
    message: str,
    hermes_session_id: str | None,
    history: list[dict[str, str]]
) -> dict[str, str]:
    query = build_query(message, history if hermes_session_id is None else [])
    command = get_hermes_command() + ["-p", profile_name, "chat", "-Q", "-q", query]
    workspace = get_profile_workspace(profile_name)
    workspace.mkdir(parents=True, exist_ok=True)

    if hermes_session_id:
        command.extend(["--resume", hermes_session_id])

    result = run_command(
        command,
        timeout_seconds=CHAT_TIMEOUT_SECONDS,
        description="Hermes chat request",
        cwd=workspace
    )

    try:
        assistant_message, next_session_id = parse_quiet_output(result.stdout)
    except BridgeError:
        if result.returncode != 0:
            raise BridgeError(
                f"Hermes chat request failed: {command_output_detail(result)}"
            )

        raise

    return {
        "message": assistant_message,
        "hermes_profile_name": profile_name,
        "hermes_session_id": next_session_id
    }


class HermesBridgeHandler(BaseHTTPRequestHandler):
    server_version = "HermesBridge/0.1"

    def do_GET(self) -> None:
        if self.path != "/health":
            self.write_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})
            return

        self.write_json(HTTPStatus.OK, {"ok": True})

    def do_POST(self) -> None:
        if self.path != "/v1/chat":
            self.write_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})
            return

        if not self.client_is_loopback():
            self.write_json(HTTPStatus.FORBIDDEN, {"error": "Loopback access only."})
            return

        expected_api_key = get_expected_api_key()
        provided_api_key = self.headers.get(API_KEY_HEADER, "")

        if expected_api_key and not hmac.compare_digest(provided_api_key, expected_api_key):
            self.write_json(HTTPStatus.UNAUTHORIZED, {"error": "Invalid bridge API key."})
            return

        try:
            payload = self.read_json_body()
            app_user_id = require_non_empty_string(payload, "app_user_id")
            require_non_empty_string(payload, "app_user_email")
            chat_id = require_non_empty_string(payload, "chat_id")
            message = require_non_empty_string(payload, "message")

            raw_session_id = payload.get("hermes_session_id")
            if raw_session_id is None:
                hermes_session_id = None
            elif isinstance(raw_session_id, str) and raw_session_id.strip():
                hermes_session_id = raw_session_id.strip()
            else:
                raise BridgeError(
                    "`hermes_session_id` must be a non-empty string when provided.",
                    HTTPStatus.BAD_REQUEST
                )

            raw_history = payload.get("history")
            if raw_history is None:
                history: list[dict[str, str]] = []
            elif isinstance(raw_history, list):
                history = [
                    normalize_history_entry(index, entry)
                    for index, entry in enumerate(raw_history)
                ]
            else:
                raise BridgeError(
                    "`history` must be an array when provided.",
                    HTTPStatus.BAD_REQUEST
                )

            profile_name = derive_profile_name(app_user_id)
            ensure_profile_exists(profile_name)
            lock_key = hermes_session_id or f"{profile_name}:{chat_id}"

            with get_request_lock(lock_key):
                response_payload = run_chat(
                    profile_name=profile_name,
                    message=message,
                    hermes_session_id=hermes_session_id,
                    history=history
                )

            self.write_json(HTTPStatus.OK, response_payload)
        except BridgeError as exc:
            self.write_json(exc.status, {"error": str(exc)})
        except Exception:
            self.write_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "Unexpected bridge server error."}
            )

    def read_json_body(self) -> dict[str, Any]:
        content_length_header = self.headers.get("Content-Length")

        if content_length_header is None:
            raise BridgeError("Missing Content-Length header.", HTTPStatus.BAD_REQUEST)

        try:
            content_length = int(content_length_header)
        except ValueError as exc:
            raise BridgeError("Invalid Content-Length header.", HTTPStatus.BAD_REQUEST) from exc

        if content_length < 0 or content_length > MAX_BODY_BYTES:
            raise BridgeError("Request body is too large.", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)

        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise BridgeError("Request body must be valid JSON.", HTTPStatus.BAD_REQUEST) from exc

        if not isinstance(payload, dict):
            raise BridgeError("Request body must be a JSON object.", HTTPStatus.BAD_REQUEST)

        return payload

    def write_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def client_is_loopback(self) -> bool:
        raw_host = self.client_address[0]

        try:
            return ipaddress.ip_address(raw_host).is_loopback
        except ValueError:
            return False

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))


def main() -> None:
    load_project_env()

    host = validate_listen_host(os.environ.get("HERMES_BRIDGE_HOST", DEFAULT_HOST))
    port = parse_port(os.environ.get("HERMES_BRIDGE_PORT"))
    server = ThreadingHTTPServer((host, port), HermesBridgeHandler)

    print(f"Hermes bridge listening on http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
