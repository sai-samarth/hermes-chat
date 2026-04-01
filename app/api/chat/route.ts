import { NextResponse } from "next/server";

import { composerFileAccept } from "@/lib/attachment-types";
import { prepareMessageAttachments, AttachmentError } from "@/lib/attachments";
import {
  AuthError,
  requireAuthenticatedUser,
  setUserHermesProfileName
} from "@/lib/auth";
import {
  appendMessage,
  ChatStoreError,
  getChat,
  getChatHermesSessionId,
  listMessagesForHermes,
  setChatHermesSessionId
} from "@/lib/chat-store";
import {
  createHermesChatTurn,
  createHermesChatTurnStream,
  HermesClientError
} from "@/lib/hermes";
import { createSseParser, encodeSseEvent, type ParsedSseEvent } from "@/lib/sse";

const MAX_CONTEXT_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 8000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type BridgeDeltaEvent = {
  text?: string;
};

type BridgeDoneEvent = {
  hermes_profile_name?: string;
  hermes_session_id?: string;
  message?: string;
};

type BridgeErrorEvent = {
  error?: string;
};

type ParsedChatRequest = {
  chatId: string;
  content: string;
  files: File[];
};

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

function validateOptionalContent(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw new ChatStoreError("`content` must be a string.", 400);
  }

  const content = value.trim();

  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new ChatStoreError(
      `\`content\` exceeds ${MAX_MESSAGE_LENGTH} characters.`,
      400
    );
  }

  return content;
}

function isStreamingRequest(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  const { searchParams } = new URL(request.url);

  return searchParams.get("stream") === "1" || accept.includes("text/event-stream");
}

function buildBootstrapHistory(
  userId: string,
  chatId: string,
  hermesSessionId: string | null,
  excludeMessageId: string
) {
  if (hermesSessionId !== null) {
    return undefined;
  }

  const bootstrapHistory = listMessagesForHermes(userId, chatId, MAX_CONTEXT_MESSAGES, {
    excludeMessageId
  });

  return bootstrapHistory.length > 0 ? bootstrapHistory : undefined;
}

function streamHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  };
}

function errorJson(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Request body must be valid JSON or multipart form data." },
      { status: 400 }
    );
  }

  if (error instanceof HermesClientError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof AttachmentError) {
    return NextResponse.json(
      {
        error: `${error.message} Supported file types: ${composerFileAccept}`
      },
      { status: error.status }
    );
  }

  if (error instanceof ChatStoreError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { error: "Unexpected server error while requesting Hermes." },
    { status: 500 }
  );
}

async function parseRequest(request: Request): Promise<ParsedChatRequest> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const files = formData
      .getAll("attachments")
      .filter((entry): entry is File => entry instanceof File);
    const chatId = validateChatId(formData.get("chatId"));
    const content = validateOptionalContent(formData.get("content"));

    if (!content && files.length === 0) {
      throw new ChatStoreError("Add a message or attach at least one file.", 400);
    }

    return {
      chatId,
      content,
      files
    };
  }

  const payload = (await request.json()) as
    | { chatId?: unknown; content?: unknown }
    | null;

  if (!isRecord(payload)) {
    throw new ChatStoreError("Request body must be a JSON object.", 400);
  }

  const chatId = validateChatId(payload.chatId);
  const content = validateOptionalContent(payload.content);

  if (!content) {
    throw new ChatStoreError("`content` must not be empty.", 400);
  }

  return {
    chatId,
    content,
    files: []
  };
}

export async function POST(request: Request) {
  const wantsStreaming = isStreamingRequest(request);

  try {
    const user = await requireAuthenticatedUser();
    const parsedRequest = await parseRequest(request);
    const preparedAttachments = await prepareMessageAttachments({
      userId: user.id,
      chatId: parsedRequest.chatId,
      content: parsedRequest.content,
      files: parsedRequest.files
    });

    const userMessage = appendMessage(
      user.id,
      parsedRequest.chatId,
      {
        role: "user",
        content: preparedAttachments.visibleContent
      },
      {
        attachments: preparedAttachments.attachments,
        hermesContent: preparedAttachments.hermesContent
      }
    );

    const hermesSessionId = getChatHermesSessionId(user.id, parsedRequest.chatId);
    const history = buildBootstrapHistory(
      user.id,
      parsedRequest.chatId,
      hermesSessionId,
      userMessage.id
    );

    if (!wantsStreaming) {
      const hermesTurn = await createHermesChatTurn({
        appUserId: user.id,
        appUserEmail: user.email,
        chatId: parsedRequest.chatId,
        message: preparedAttachments.hermesContent,
        hermesSessionId,
        history
      });

      setUserHermesProfileName(user.id, hermesTurn.hermesProfileName);
      setChatHermesSessionId(user.id, parsedRequest.chatId, hermesTurn.hermesSessionId);

      const message = appendMessage(user.id, parsedRequest.chatId, hermesTurn.assistantMessage);
      const chat = getChat(user.id, parsedRequest.chatId);

      if (!chat) {
        throw new ChatStoreError("Chat not found.", 404);
      }

      return NextResponse.json({
        chat: chat.chat,
        userMessage,
        message
      });
    }

    const bridgeResponse = await createHermesChatTurnStream({
      appUserId: user.id,
      appUserEmail: user.email,
      chatId: parsedRequest.chatId,
      message: preparedAttachments.hermesContent,
      hermesSessionId,
      history
    });

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const reader = bridgeResponse.body?.getReader();
        const parser = createSseParser();
        let assistantText = "";
        let completed = false;

        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(textEncoder.encode(encodeSseEvent(event, data)));
        };

        const finalizeFromDoneEvent = (event: ParsedSseEvent<BridgeDoneEvent>) => {
          const doneData = event.data ?? {};
          const finalAssistantText = (doneData.message?.trim() || assistantText).trim();
          const finalHermesSessionId = doneData.hermes_session_id?.trim();
          const finalHermesProfileName = doneData.hermes_profile_name?.trim();

          if (!finalAssistantText) {
            throw new HermesClientError(
              "Hermes stream completed without assistant text.",
              502
            );
          }

          if (!finalHermesSessionId) {
            throw new HermesClientError(
              "Hermes stream completed without a Hermes session id.",
              502
            );
          }

          if (!finalHermesProfileName) {
            throw new HermesClientError(
              "Hermes stream completed without a Hermes profile name.",
              502
            );
          }

          setUserHermesProfileName(user.id, finalHermesProfileName);
          setChatHermesSessionId(user.id, parsedRequest.chatId, finalHermesSessionId);

          const message = appendMessage(user.id, parsedRequest.chatId, {
            role: "assistant",
            content: finalAssistantText
          });
          const chat = getChat(user.id, parsedRequest.chatId);

          if (!chat) {
            throw new ChatStoreError("Chat not found.", 404);
          }

          sendEvent("done", {
            chat: chat.chat,
            message,
            userMessage
          });
          completed = true;
          controller.close();
        };

        try {
          if (!reader) {
            throw new HermesClientError(
              "Hermes bridge stream returned no response body.",
              502
            );
          }

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            const chunk = textDecoder.decode(value, { stream: true });
            const events = parser.push(chunk);

            for (const event of events) {
              if (event.event === "delta") {
                const deltaData = event.data as BridgeDeltaEvent | null;
                const deltaText = deltaData?.text ?? "";

                if (!deltaText) {
                  continue;
                }

                assistantText += deltaText;
                sendEvent("delta", {
                  text: deltaText,
                  snapshot: assistantText
                });
                continue;
              }

              if (event.event === "done") {
                finalizeFromDoneEvent(event as ParsedSseEvent<BridgeDoneEvent>);
                return;
              }

              if (event.event === "error") {
                const errorData = event.data as BridgeErrorEvent | null;
                throw new HermesClientError(
                  errorData?.error || "Hermes bridge stream failed.",
                  502
                );
              }
            }
          }

          if (!completed) {
            throw new HermesClientError(
              "Hermes bridge stream ended before a final event was received.",
              502
            );
          }
        } catch (error) {
          console.error("[hermes-chat stream] route stream failure", error);
          sendEvent("error", {
            error:
              error instanceof Error
                ? error.message
                : "Unexpected server error while streaming Hermes."
          });
          controller.close();
        } finally {
          try {
            await reader?.cancel();
          } catch {
            // Ignore stream cancellation failures.
          }
        }
      }
    });

    return new Response(stream, {
      headers: streamHeaders()
    });
  } catch (error) {
    return errorJson(error);
  }
}
