import "server-only";

import type { ChatMessage } from "@/lib/chat-types";

type HermesChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type HermesConfig = {
  apiKey?: string;
  baseUrl: string;
  model: string;
};

// This isolates the temporary OpenAI-compatible Hermes boundary so callers can
// later swap to a gateway-native adapter without reshaping the route contract.
export class HermesClientError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "HermesClientError";
    this.status = status;
  }
}

function getHermesConfig(): HermesConfig {
  const baseUrl = process.env.HERMES_API_BASE_URL?.trim();
  const model = process.env.HERMES_MODEL?.trim();
  const apiKey = process.env.HERMES_API_KEY?.trim();

  if (!baseUrl) {
    throw new HermesClientError(
      "Hermes backend is not configured. Set HERMES_API_BASE_URL.",
      500
    );
  }

  if (!model) {
    throw new HermesClientError(
      "Hermes backend is not configured. Set HERMES_MODEL.",
      500
    );
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model
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

export async function createHermesAssistantMessage(
  messages: ChatMessage[]
): Promise<ChatMessage> {
  const { apiKey, baseUrl, model } = getHermesConfig();

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model,
        messages
      }),
      cache: "no-store"
    });
  } catch {
    throw new HermesClientError(
      "Hermes API server is unreachable from the Next.js backend.",
      502
    );
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const message = detail
      ? `Hermes API server request failed: ${detail}`
      : `Hermes API server request failed with status ${response.status}.`;

    throw new HermesClientError(message, 502);
  }

  const payload = (await response.json()) as HermesChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new HermesClientError(
      "Hermes API server returned an empty assistant message.",
      502
    );
  }

  return {
    role: "assistant",
    content: content.trim()
  };
}
