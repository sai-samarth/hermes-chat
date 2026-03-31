import "server-only";

import type { ChatMessage } from "@/lib/chat-types";

export type HermesBridgeChatRequest = {
  app_user_email: string;
  app_user_id: string;
  chat_id: string;
  hermes_session_id?: string;
  history?: ChatMessage[];
  message: string;
};

type HermesBridgeChatResponse = {
  hermes_profile_name?: string;
  hermes_session_id?: string;
  message?: string;
};

type HermesBridgeConfig = {
  apiKey?: string;
  baseUrl: string;
};

const DEFAULT_HERMES_BRIDGE_URL = "http://127.0.0.1:8643";

export type HermesChatTurnInput = {
  appUserEmail: string;
  appUserId: string;
  chatId: string;
  hermesSessionId?: string | null;
  history?: ChatMessage[];
  message: string;
};

export type HermesChatTurnResult = {
  assistantMessage: ChatMessage;
  hermesProfileName: string;
  hermesSessionId: string;
};

export class HermesClientError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "HermesClientError";
    this.status = status;
  }
}

function getHermesConfig(): HermesBridgeConfig {
  const configuredBaseUrl = process.env.HERMES_BRIDGE_URL?.trim();
  const legacyApiBaseUrl = process.env.HERMES_API_BASE_URL?.trim();
  const apiKey = process.env.HERMES_BRIDGE_API_KEY?.trim();

  if (!configuredBaseUrl && legacyApiBaseUrl) {
    console.warn(
      "HERMES_API_BASE_URL is still set, but hermes-chat now uses the local Hermes bridge. Falling back to the default bridge URL http://127.0.0.1:8643."
    );
  }

  const baseUrl = (configuredBaseUrl || DEFAULT_HERMES_BRIDGE_URL).replace(
    /\/+$/,
    ""
  );

  return {
    apiKey,
    baseUrl
  };
}

function buildBridgeRequestBody(input: HermesChatTurnInput): HermesBridgeChatRequest {
  const requestBody: HermesBridgeChatRequest = {
    app_user_id: input.appUserId,
    app_user_email: input.appUserEmail,
    chat_id: input.chatId,
    message: input.message
  };

  if (input.hermesSessionId) {
    requestBody.hermes_session_id = input.hermesSessionId;
  }

  if (input.history && input.history.length > 0) {
    requestBody.history = input.history;
  }

  return requestBody;
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as {
        error?: { message?: string } | string;
        message?: string;
      };

      if (typeof payload.error === "string") {
        return payload.error;
      }

      if (typeof payload.error?.message === "string") {
        return payload.error.message;
      }

      if (typeof payload.message === "string") {
        return payload.message;
      }

      return undefined;
    }

    const text = await response.text();
    return text.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function requestBridge(
  path: string,
  input: HermesChatTurnInput,
  headers?: Record<string, string>
) {
  const { apiKey, baseUrl } = getHermesConfig();

  try {
    return await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-Hermes-Bridge-Key": apiKey } : {}),
        ...headers
      },
      body: JSON.stringify(buildBridgeRequestBody(input)),
      cache: "no-store"
    });
  } catch {
    throw new HermesClientError(
      "Hermes bridge is unreachable from the Next.js backend.",
      502
    );
  }
}

export async function createHermesChatTurn(
  input: HermesChatTurnInput
): Promise<HermesChatTurnResult> {
  const response = await requestBridge("/v1/chat", input);

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const message = detail
      ? `Hermes bridge request failed: ${detail}`
      : `Hermes bridge request failed with status ${response.status}.`;

    throw new HermesClientError(message, 502);
  }

  const payload = (await response.json()) as HermesBridgeChatResponse;
  const content = payload.message?.trim();
  const hermesSessionId = payload.hermes_session_id?.trim();
  const hermesProfileName = payload.hermes_profile_name?.trim();

  if (!content) {
    throw new HermesClientError(
      "Hermes bridge returned an empty assistant message.",
      502
    );
  }

  if (!hermesSessionId) {
    throw new HermesClientError(
      "Hermes bridge returned an empty Hermes session id.",
      502
    );
  }

  if (!hermesProfileName) {
    throw new HermesClientError(
      "Hermes bridge returned an empty Hermes profile name.",
      502
    );
  }

  return {
    assistantMessage: {
      role: "assistant",
      content
    },
    hermesProfileName,
    hermesSessionId
  };
}

export async function createHermesChatTurnStream(input: HermesChatTurnInput) {
  const response = await requestBridge("/v1/chat/stream", input, {
    Accept: "text/event-stream"
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const message = detail
      ? `Hermes bridge stream failed: ${detail}`
      : `Hermes bridge stream failed with status ${response.status}.`;

    throw new HermesClientError(message, 502);
  }

  if (!response.body) {
    throw new HermesClientError(
      "Hermes bridge stream returned no response body.",
      502
    );
  }

  return response;
}
