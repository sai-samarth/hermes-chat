import { NextResponse } from "next/server";

import { AuthError, requireAuthenticatedUser } from "@/lib/auth";
import {
  ChatStoreError,
  createChat,
  listChats,
  MAX_CHAT_TITLE_LENGTH
} from "@/lib/chat-store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateTitle(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ChatStoreError("`title` must be a string.", 400);
  }

  const normalizedTitle = value.replace(/\s+/g, " ").trim();

  if (normalizedTitle.length === 0) {
    return undefined;
  }

  if (normalizedTitle.length > MAX_CHAT_TITLE_LENGTH) {
    throw new ChatStoreError(
      `\`title\` must be no longer than ${MAX_CHAT_TITLE_LENGTH} characters.`,
      400
    );
  }

  return normalizedTitle;
}

async function readOptionalPayload(request: Request) {
  try {
    return (await request.json()) as { title?: unknown } | null;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const chats = listChats(user.id);

    return NextResponse.json({
      chats,
      selectedChatId: chats[0]?.id ?? null
    });
  } catch (error) {
    if (error instanceof ChatStoreError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "Unexpected server error while loading chats." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const payload = await readOptionalPayload(request);

    if (payload !== null && !isRecord(payload)) {
      throw new ChatStoreError("Request body must be a JSON object.", 400);
    }

    const chat = createChat(user.id, validateTitle(payload?.title));

    return NextResponse.json(chat, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
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
      { error: "Unexpected server error while creating a chat." },
      { status: 500 }
    );
  }
}
