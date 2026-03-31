import "server-only";

import type { ChatMessage } from "@/lib/chat-types";

type HermesBridgeChatRequest = {
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
  const baseUrl = process.env.HERMES_BRIDGE_URL?.trim();
  const apiKey = process.env.HERMES_BRIDGE_API_KEY?.trim();

  if (!baseUrl) {
    throw new HermesClientError(
      "Hermes bridge is not configured. Set HERMES_BRIDGE_URL.",
      500
    );
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, "")
  };
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

export async function createHermesChatTurn(
  input: HermesChatTurnInput
): Promise<HermesChatTurnResult> {
  const { apiKey, baseUrl } = getHermesConfig();
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

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-Hermes-Bridge-Key": apiKey } : {})
      },
      body: JSON.stringify(requestBody),
      cache: "no-store"
    });
  } catch {
    throw new HermesClientError(
      "Hermes bridge is unreachable from the Next.js backend.",
      502
    );
  }

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
