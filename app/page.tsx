"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type {
  ChatDetail,
  ChatSummary,
  PersistedChatMessage
} from "@/lib/chat-types";

const DEFAULT_CHAT_TITLE = "New chat";
const MAX_CHAT_TITLE_LENGTH = 80;
const MAX_PREVIEW_LENGTH = 120;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit"
});

const monthDayFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric"
});

const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric"
});

type ChatListResponse = {
  chats: ChatSummary[];
  selectedChatId: string | null;
};

type ApiErrorResponse = {
  error?: string;
};

type SendMessageResponse = {
  chat: ChatSummary;
  message: PersistedChatMessage;
  userMessage: PersistedChatMessage;
};

type ThreadDetailFact = {
  label: string;
  value: string;
};

async function readJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildPreview(content: string) {
  const normalized = normalizeText(content);

  if (normalized.length <= MAX_PREVIEW_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_PREVIEW_LENGTH - 3).trimEnd()}...`;
}

function buildChatTitle(content: string) {
  const normalized = normalizeText(content);

  if (normalized.length <= MAX_CHAT_TITLE_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_CHAT_TITLE_LENGTH - 3).trimEnd()}...`;
}

function sortChats(chats: ChatSummary[]) {
  return [...chats].sort((left, right) => {
    const updatedAtDelta =
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();

    if (updatedAtDelta !== 0) {
      return updatedAtDelta;
    }

    const createdAtDelta =
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();

    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }

    return right.id.localeCompare(left.id);
  });
}

function upsertChat(chats: ChatSummary[], nextChat: ChatSummary) {
  return sortChats([
    nextChat,
    ...chats.filter((chat) => chat.id !== nextChat.id)
  ]);
}

function replaceMessage(
  messages: PersistedChatMessage[],
  optimisticMessageId: string,
  persistedMessage: PersistedChatMessage
) {
  let replaced = false;
  const nextMessages = messages.map((message) => {
    if (message.id === optimisticMessageId) {
      replaced = true;
      return persistedMessage;
    }

    return message;
  });

  return replaced ? nextMessages : [...nextMessages, persistedMessage];
}

function formatMessageTime(value: string) {
  return timeFormatter.format(new Date(value));
}

function formatChatUpdatedAt(value: string) {
  const updatedAt = new Date(value);
  const elapsed = Date.now() - updatedAt.getTime();

  if (elapsed < 60 * 60 * 1000) {
    const minutes = Math.max(1, Math.floor(elapsed / (60 * 1000)));
    return `${minutes}m ago`;
  }

  const now = new Date();
  const isSameDay =
    now.getFullYear() === updatedAt.getFullYear() &&
    now.getMonth() === updatedAt.getMonth() &&
    now.getDate() === updatedAt.getDate();

  if (isSameDay) {
    return timeFormatter.format(updatedAt);
  }

  if (now.getFullYear() === updatedAt.getFullYear()) {
    return monthDayFormatter.format(updatedAt);
  }

  return fullDateFormatter.format(updatedAt);
}

function getChatBlurb(chat: ChatSummary) {
  return chat.lastMessagePreview ?? "Start the conversation with Hermes.";
}

function getChatMeta(chat: ChatSummary) {
  if (chat.messageCount === 0) {
    return "Empty chat";
  }

  return `${chat.messageCount} ${chat.messageCount === 1 ? "message" : "messages"}`;
}

function getMessageAuthor(role: PersistedChatMessage["role"]) {
  return role === "assistant" ? "Hermes" : "You";
}

export default function Home() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PersistedChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const currentChat =
    chats.find((chat) => chat.id === selectedChatId) ?? null;
  const sidebarBusy =
    isBootstrapping || isLoadingChat || isCreatingChat || isSending;
  const composerBusy = sidebarBusy || !selectedChatId;
  const threadFacts: ThreadDetailFact[] = [
    {
      label: "Boundary",
      value: "Hermes API server"
    },
    {
      label: "Persistence",
      value: "SQLite file"
    },
    {
      label: "Auth",
      value: "Local anonymous"
    }
  ];

  useEffect(() => {
    const transcriptNode = transcriptRef.current;

    if (!transcriptNode) {
      return;
    }

    transcriptNode.scrollTo({
      top: transcriptNode.scrollHeight,
      behavior: "smooth"
    });
  }, [isLoadingChat, isSending, messages]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapWorkspace() {
      setIsBootstrapping(true);
      setLoadError(null);

      try {
        const listResponse = await fetch("/api/chats", {
          cache: "no-store"
        });
        const listPayload = await readJson<
          ChatListResponse & ApiErrorResponse
        >(listResponse);

        if (!listResponse.ok) {
          throw new Error(listPayload?.error ?? "Could not load chats.");
        }

        const availableChats = sortChats(listPayload?.chats ?? []);
        const nextSelectedChatId =
          listPayload?.selectedChatId ?? availableChats[0]?.id ?? null;

        if (cancelled) {
          return;
        }

        setChats(availableChats);
        setSelectedChatId(nextSelectedChatId);

        if (!nextSelectedChatId) {
          setMessages([]);
          return;
        }

        const detailResponse = await fetch(`/api/chats/${nextSelectedChatId}`, {
          cache: "no-store"
        });
        const detailPayload = await readJson<ChatDetail & ApiErrorResponse>(
          detailResponse
        );

        if (!detailResponse.ok) {
          throw new Error(detailPayload?.error ?? "Could not load chat history.");
        }

        if (!detailPayload?.chat) {
          throw new Error("Chat response was malformed.");
        }

        if (cancelled) {
          return;
        }

        setChats((currentChats) => upsertChat(currentChats, detailPayload.chat));
        setMessages(detailPayload?.messages ?? []);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(
          error instanceof Error ? error.message : "Could not load chats."
        );
        setMessages([]);
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrapWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadChat(chatId: string) {
    setIsLoadingChat(true);
    setLoadError(null);
    setComposerError(null);
    setSelectedChatId(chatId);
    setMessages([]);

    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        cache: "no-store"
      });
      const payload = await readJson<ChatDetail & ApiErrorResponse>(response);

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load chat history.");
      }

      if (!payload?.chat) {
        throw new Error("Chat response was malformed.");
      }

      setChats((currentChats) => upsertChat(currentChats, payload.chat));
      setMessages(payload?.messages ?? []);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load chat history."
      );
    } finally {
      setIsLoadingChat(false);
    }
  }

  async function handleCreateChat() {
    if (sidebarBusy) {
      return;
    }

    setIsCreatingChat(true);
    setLoadError(null);
    setComposerError(null);

    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      const payload = await readJson<ChatDetail & ApiErrorResponse>(response);

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not create a chat.");
      }

      if (!payload?.chat) {
        throw new Error("Chat response was malformed.");
      }

      setChats((currentChats) => upsertChat(currentChats, payload.chat));
      setSelectedChatId(payload.chat.id);
      setMessages(payload.messages ?? []);
      setDraft("");
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not create a chat."
      );
    } finally {
      setIsCreatingChat(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedChatId || !currentChat || isSending) {
      return;
    }

    const content = draft.trim();

    if (!content) {
      return;
    }

    const submittedAt = new Date().toISOString();
    const optimisticMessage: PersistedChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: submittedAt
    };
    const optimisticChat: ChatSummary = {
      ...currentChat,
      title:
        currentChat.messageCount === 0 && currentChat.title === DEFAULT_CHAT_TITLE
          ? buildChatTitle(content)
          : currentChat.title,
      updatedAt: submittedAt,
      lastMessagePreview: buildPreview(content),
      messageCount: currentChat.messageCount + 1
    };

    setMessages((currentMessages) => [...currentMessages, optimisticMessage]);
    setChats((currentChats) => upsertChat(currentChats, optimisticChat));
    setDraft("");
    setComposerError(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chatId: selectedChatId,
          content
        })
      });
      const payload = await readJson<SendMessageResponse & ApiErrorResponse>(
        response
      );

      if (!response.ok) {
        throw new Error(payload?.error ?? "The Hermes request failed.");
      }

      if (!payload?.chat || !payload.message || !payload.userMessage) {
        throw new Error("Hermes returned an unexpected response shape.");
      }

      setChats((currentChats) => upsertChat(currentChats, payload.chat));
      setMessages((currentMessages) => {
        const messagesWithPersistedUser = replaceMessage(
          currentMessages,
          optimisticMessage.id,
          payload.userMessage
        );

        return [
          ...messagesWithPersistedUser.filter(
            (message) => message.id !== payload.message.id
          ),
          payload.message
        ];
      });
    } catch (error) {
      setComposerError(
        error instanceof Error
          ? error.message
          : "The Hermes request failed."
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="preview-shell">
      <div className="workspace-shell">
        <aside className="sidebar" aria-label="Workspace navigation">
          <div className="sidebar-top">
            <div className="brand-mark">H</div>

            <div>
              <p className="eyebrow">Hermes Chat</p>
              <p className="sidebar-title">Support workspace</p>
              <p className="sidebar-intro">
                Enterprise conversations, draft refinement, and Hermes-backed
                chat history in one restrained workspace.
              </p>
            </div>
          </div>

          <section aria-labelledby="threads-heading" className="sidebar-section">
            <div className="section-head">
              <div>
                <p id="threads-heading" className="section-label">
                  Chats
                </p>
                <p className="section-count">
                  {chats.length} {chats.length === 1 ? "chat" : "chats"}
                </p>
              </div>

              <button
                type="button"
                className="sidebar-action"
                onClick={handleCreateChat}
                disabled={sidebarBusy}
              >
                {isCreatingChat ? "Creating..." : "New chat"}
              </button>
            </div>

            <ul className="thread-list">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    className={`thread-item${chat.id === selectedChatId ? " thread-item-active" : ""}`}
                    onClick={() => void loadChat(chat.id)}
                    disabled={sidebarBusy || chat.id === selectedChatId}
                    aria-current={chat.id === selectedChatId ? "page" : undefined}
                  >
                    <div className="thread-row">
                      <p className="thread-title">{chat.title}</p>
                      <p className="thread-updated">
                        {formatChatUpdatedAt(chat.updatedAt)}
                      </p>
                    </div>

                    <p className="thread-blurb">{getChatBlurb(chat)}</p>
                    <p className="thread-meta">{getChatMeta(chat)}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="sidebar-foot">
            <p className="sidebar-note-title">Backend slice</p>
            <p className="sidebar-note">
              SQLite persistence is live for this local workspace. Postgres and
              gateway-native Hermes sessions can come later.
            </p>
          </div>
        </aside>

        <section className="chat-panel" aria-label="Support workspace">
          <header className="chat-topbar">
            <div className="chat-title-block">
              <p className="eyebrow">Local workspace</p>

              <div className="chat-heading-row">
                <h1>{currentChat?.title ?? "Loading chats"}</h1>
                <span className="review-pill">SQLite slice</span>
              </div>

              <p className="chat-summary">
                Messages now persist in a local SQLite file, refresh keeps the
                current history intact, and Hermes still sits behind the same
                server-side API boundary.
              </p>
            </div>

            <div className="chat-context">
              <dl className="chat-facts" aria-label="Thread details">
                {threadFacts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </header>

          <div
            ref={transcriptRef}
            className="message-list"
            aria-label="Conversation transcript"
          >
            <p className="timeline-mark">
              {isBootstrapping
                ? "Loading chats"
                : isLoadingChat
                  ? "Loading history"
                  : "Persisted history"}
            </p>

            {loadError ? (
              <p className="timeline-status timeline-status-error" role="alert">
                {loadError}
              </p>
            ) : null}

            {!loadError &&
            !isBootstrapping &&
            !isLoadingChat &&
            messages.length === 0 ? (
              <article className="message message-assistant message-empty">
                <div className="message-meta">
                  <span>Hermes</span>
                  <span>Ready</span>
                </div>
                <p className="message-copy">
                  This chat is empty. Send the first message and the transcript
                  will be stored in SQLite for the next refresh.
                </p>
              </article>
            ) : null}

            {messages.map((message) => (
              <article
                key={message.id}
                className={`message message-${message.role}`}
              >
                <div className="message-meta">
                  <span>{getMessageAuthor(message.role)}</span>
                  <span>{formatMessageTime(message.createdAt)}</span>
                </div>

                <p className="message-copy">{message.content}</p>
              </article>
            ))}

            {isSending ? (
              <article
                className="message message-assistant message-pending"
                aria-live="polite"
              >
                <div className="message-meta">
                  <span>Hermes</span>
                  <span>Drafting</span>
                </div>
                <p className="message-copy">
                  User message persisted. Request in flight through the Hermes
                  API server.
                </p>
              </article>
            ) : null}
          </div>

          <footer className="composer-shell" aria-label="Chat composer">
            <form className="composer-form" onSubmit={handleSubmit}>
              <div className="composer-field">
                <label className="composer-label" htmlFor="chat-draft">
                  Message Hermes
                </label>
                <textarea
                  id="chat-draft"
                  className="composer-input"
                  name="chat-draft"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Confirm procurement coverage, keep approval language precise, and leave the customer with one clear next step."
                  rows={4}
                  disabled={composerBusy}
                />
                <p className="composer-copy">
                  Single anonymous workspace with SQLite-backed chat history.
                  Postgres and gateway-native Hermes sessions stay out of scope
                  for this phase.
                </p>
              </div>

              <div className="composer-actions">
                {composerError ? (
                  <p className="composer-status composer-status-error" role="alert">
                    {composerError}
                  </p>
                ) : (
                  <p className="composer-status" aria-live="polite">
                    {isSending
                      ? "Hermes is drafting a persisted reply..."
                      : isLoadingChat
                        ? "Loading selected chat history..."
                        : "Messages are stored locally and survive refresh."}
                  </p>
                )}

                <button
                  className="composer-button"
                  type="submit"
                  disabled={composerBusy || draft.trim().length === 0}
                >
                  {isSending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </footer>
        </section>
      </div>
    </main>
  );
}
