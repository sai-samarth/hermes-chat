import { NextResponse } from "next/server";

import { AuthError, requireAuthenticatedUser } from "@/lib/auth";
import {
  ChatStoreError,
  deleteChat,
  getChat,
  updateChat
} from "@/lib/chat-store";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

function validateChatId(value: string) {
  const chatId = value.trim();

  if (!chatId) {
    throw new ChatStoreError("`chatId` is required.", 400);
  }

  return chatId;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser();
    const { chatId: rawChatId } = await context.params;
    const chatId = validateChatId(rawChatId);
    const chat = getChat(user.id, chatId);

    if (!chat) {
      throw new ChatStoreError("Chat not found.", 404);
    }

    return NextResponse.json(chat);
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
      { error: "Unexpected server error while loading the chat." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser();
    const { chatId: rawChatId } = await context.params;
    const chatId = validateChatId(rawChatId);

    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
    };

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json(
        { error: "Title is required." },
        { status: 400 }
      );
    }

    const chat = updateChat(user.id, chatId, body.title);
    return NextResponse.json(chat);
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
      { error: "Unexpected server error while updating the chat." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser();
    const { chatId: rawChatId } = await context.params;
    const chatId = validateChatId(rawChatId);

    deleteChat(user.id, chatId);
    return NextResponse.json({ success: true });
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
      { error: "Unexpected server error while deleting the chat." },
      { status: 500 }
    );
  }
}
