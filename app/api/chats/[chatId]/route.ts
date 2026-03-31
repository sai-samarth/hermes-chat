import { NextResponse } from "next/server";

import { AuthError, requireAuthenticatedUser } from "@/lib/auth";
import { ChatStoreError, getChat } from "@/lib/chat-store";

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
