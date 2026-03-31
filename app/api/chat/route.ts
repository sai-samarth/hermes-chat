import { NextResponse } from "next/server";

import { chatMessageRoles, type ChatMessage } from "@/lib/chat-types";
import {
  createHermesAssistantMessage,
  HermesClientError
} from "@/lib/hermes";

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 8000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    throw new HermesClientError("`messages` must be an array.", 400);
  }

  if (value.length === 0) {
    throw new HermesClientError("`messages` must include at least one item.", 400);
  }

  if (value.length > MAX_MESSAGES) {
    throw new HermesClientError(
      `\`messages\` must include no more than ${MAX_MESSAGES} items.`,
      400
    );
  }

  const roles = new Set(chatMessageRoles);
  const messages = value.map((item, index) => {
    if (!isRecord(item)) {
      throw new HermesClientError(
        `Message at index ${index} must be an object.`,
        400
      );
    }

    const { content, role } = item;

    if (typeof role !== "string" || !roles.has(role as ChatMessage["role"])) {
      throw new HermesClientError(
        `Message at index ${index} has an invalid role.`,
        400
      );
    }

    if (typeof content !== "string") {
      throw new HermesClientError(
        `Message at index ${index} must include string content.`,
        400
      );
    }

    const normalizedContent = content.trim();

    if (normalizedContent.length === 0) {
      throw new HermesClientError(
        `Message at index ${index} must not be empty.`,
        400
      );
    }

    if (normalizedContent.length > MAX_MESSAGE_LENGTH) {
      throw new HermesClientError(
        `Message at index ${index} exceeds ${MAX_MESSAGE_LENGTH} characters.`,
        400
      );
    }

    return {
      role: role as ChatMessage["role"],
      content: normalizedContent
    };
  });

  if (messages.at(-1)?.role !== "user") {
    throw new HermesClientError(
      "The last message must be from the user.",
      400
    );
  }

  return messages;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { messages?: unknown } | null;

    if (!isRecord(payload)) {
      throw new HermesClientError("Request body must be a JSON object.", 400);
    }

    const messages = validateMessages(payload.messages);
    const message = await createHermesAssistantMessage(messages);

    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    if (error instanceof HermesClientError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "Unexpected server error while requesting Hermes." },
      { status: 500 }
    );
  }
}
