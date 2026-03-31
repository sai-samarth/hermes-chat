import { NextResponse } from "next/server";

import { AuthError, requireAuthenticatedUser } from "@/lib/auth";
import {
  appendMessage,
  ChatStoreError,
  getChat,
  listMessagesForHermes
} from "@/lib/chat-store";
import {
  createHermesAssistantMessage,
  HermesClientError
} from "@/lib/hermes";

const MAX_CONTEXT_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 8000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateChatId(value: unknown) {
  if (typeof value !== "string") {
    throw new ChatStoreError("`chatId` must be a string.", 400);
  }

  const chatId = value.trim();

  if (!chatId) {
    throw new ChatStoreError("`chatId` must not be empty.", 400);
  }

  return chatId;
}

function validateContent(value: unknown) {
  if (typeof value !== "string") {
    throw new ChatStoreError("`content` must be a string.", 400);
  }

  const content = value.trim();

  if (content.length === 0) {
    throw new ChatStoreError("`content` must not be empty.", 400);
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new ChatStoreError(
      `\`content\` exceeds ${MAX_MESSAGE_LENGTH} characters.`,
      400
    );
  }

  return content;
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const payload = (await request.json()) as
      | { chatId?: unknown; content?: unknown }
      | null;

    if (!isRecord(payload)) {
      throw new ChatStoreError("Request body must be a JSON object.", 400);
    }

    const chatId = validateChatId(payload.chatId);
    const content = validateContent(payload.content);

    const userMessage = appendMessage(user.id, chatId, {
      role: "user",
      content
    });

    const assistantMessage = await createHermesAssistantMessage(
      listMessagesForHermes(user.id, chatId, MAX_CONTEXT_MESSAGES)
    );
    const message = appendMessage(user.id, chatId, assistantMessage);
    const chat = getChat(user.id, chatId);

    if (!chat) {
      throw new ChatStoreError("Chat not found.", 404);
    }

    return NextResponse.json({
      chat: chat.chat,
      userMessage,
      message
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

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

    if (error instanceof ChatStoreError) {
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
