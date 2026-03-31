"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent
} from "react";

import type {
  ChatDetail,
  ChatSummary,
  PersistedChatMessage
} from "@/lib/chat-types";
import { renderChatMarkdown } from "@/lib/chat-markdown";
import { createSseParser, type ParsedSseEvent } from "@/lib/sse";

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

type SessionUser = {
  email: string;
  id: string;
};

type SessionResponse = {
  authenticated: boolean;
  user: SessionUser | null;
};

type AuthResponse = {
  user?: SessionUser;
};

type ApiErrorResponse = {
  error?: string;
};

type SendMessageResponse = {
  chat: ChatSummary;
  message: PersistedChatMessage;
  userMessage: PersistedChatMessage;
};

type StreamDeltaEvent = {
  snapshot?: string;
  text?: string;
};

type StreamDoneEvent = SendMessageResponse;

type StreamErrorEvent = {
  error?: string;
};

type AuthMode = "login" | "register";

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

function removeMessage(messages: PersistedChatMessage[], messageId: string) {
  return messages.filter((message) => message.id !== messageId);
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
  const [sessionState, setSessionState] = useState<
    "loading" | "anonymous" | "authenticated"
  >("loading");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PersistedChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const isAuthenticated =
    sessionState === "authenticated" && sessionUser !== null;
  const currentChat =
    chats.find((chat) => chat.id === selectedChatId) ?? null;
  const sessionUserId = sessionUser?.id ?? null;
  const sidebarBusy =
    isBootstrapping ||
    isLoadingChat ||
    isCreatingChat ||
    isSending ||
    isLoggingOut;
  const composerBusy = sidebarBusy || !selectedChatId;
  const authBusy = authPending || sessionState === "loading";

  const resetWorkspaceState = useCallback(() => {
    setChats([]);
    setSelectedChatId(null);
    setMessages([]);
    setDraft("");
    setIsBootstrapping(false);
    setIsLoadingChat(false);
    setIsCreatingChat(false);
    setIsSending(false);
    setLoadError(null);
    setComposerError(null);
  }, []);

  const moveToSignedOut = useCallback((message?: string) => {
    resetWorkspaceState();
    setSessionUser(null);
    setSessionState("anonymous");
    setAuthPassword("");
    setAuthError(message ?? null);
  }, [resetWorkspaceState]);

  useEffect(() => {
    const transcriptNode = transcriptRef.current;

    if (!transcriptNode || !isAuthenticated) {
      return;
    }

    transcriptNode.scrollTo({
      top: transcriptNode.scrollHeight,
      behavior: "smooth"
    });
  }, [isAuthenticated, isLoadingChat, isSending, messages]);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch("/api/session", {
          cache: "no-store"
        });
        const payload = await readJson<SessionResponse & ApiErrorResponse>(
          response
        );

        if (!response.ok) {
          throw new Error(payload?.error ?? "Could not load the current session.");
        }

        if (payload?.authenticated && payload.user) {
          setSessionUser(payload.user);
          setSessionState("authenticated");
          setAuthError(null);
          return;
        }

        moveToSignedOut();
      } catch (error) {
        moveToSignedOut(
          error instanceof Error
            ? error.message
            : "Could not load the current session."
        );
      }
    }

    void loadSession();
  }, [moveToSignedOut]);

  useEffect(() => {
    if (!isAuthenticated || !sessionUserId) {
      return;
    }

    let cancelled = false;

    async function bootstrapWorkspace() {
      setIsBootstrapping(true);
      setLoadError(null);
      setComposerError(null);

      try {
        const listResponse = await fetch("/api/chats", {
          cache: "no-store"
        });
        const listPayload = await readJson<
          ChatListResponse & ApiErrorResponse
        >(listResponse);

        if (listResponse.status === 401) {
          if (!cancelled) {
            moveToSignedOut(listPayload?.error ?? "Session expired. Log in again.");
          }
          return;
        }

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

        if (detailResponse.status === 401) {
          if (!cancelled) {
            moveToSignedOut(detailPayload?.error ?? "Session expired. Log in again.");
          }
          return;
        }

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
        setMessages(detailPayload.messages ?? []);
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
  }, [isAuthenticated, moveToSignedOut, sessionUserId]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (authBusy) {
      return;
    }

    setAuthPending(true);
    setAuthError(null);

    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword
        })
      });
      const payload = await readJson<AuthResponse & ApiErrorResponse>(response);

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            (authMode === "login"
              ? "Could not log in."
              : "Could not create the account.")
        );
      }

      if (!payload?.user) {
        throw new Error("Auth response was malformed.");
      }

      resetWorkspaceState();
      setSessionUser(payload.user);
      setSessionState("authenticated");
      setAuthPassword("");
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : authMode === "login"
            ? "Could not log in."
            : "Could not create the account."
      );
    } finally {
      setAuthPending(false);
    }
  }

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST"
      });
    } finally {
      setIsLoggingOut(false);
      moveToSignedOut();
    }
  }

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

      if (response.status === 401) {
        moveToSignedOut(payload?.error ?? "Session expired. Log in again.");
        return;
      }

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load chat history.");
      }

      if (!payload?.chat) {
        throw new Error("Chat response was malformed.");
      }

      setChats((currentChats) => upsertChat(currentChats, payload.chat));
      setMessages(payload.messages ?? []);
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

      if (response.status === 401) {
        moveToSignedOut(payload?.error ?? "Session expired. Log in again.");
        return;
      }

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
    const optimisticAssistantMessage: PersistedChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
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

    setMessages((currentMessages) => [
      ...currentMessages,
      optimisticMessage,
      optimisticAssistantMessage
    ]);
    setChats((currentChats) => upsertChat(currentChats, optimisticChat));
    setDraft("");
    setComposerError(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/chat?stream=1", {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chatId: selectedChatId,
          content
        })
      });

      if (response.status === 401) {
        const payload = await readJson<ApiErrorResponse>(response);
        moveToSignedOut(payload?.error ?? "Session expired. Log in again.");
        return;
      }

      if (!response.ok) {
        const payload = await readJson<ApiErrorResponse>(response);
        throw new Error(payload?.error ?? "The Hermes request failed.");
      }

      if (!response.body) {
        throw new Error("The Hermes stream returned no response body.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSseParser();
      let finished = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const events = parser.push(chunk);

        for (const streamEvent of events) {
          if (streamEvent.event === "delta") {
            const deltaEvent = streamEvent as ParsedSseEvent<StreamDeltaEvent>;
            const snapshot = deltaEvent.data?.snapshot ?? "";

            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === optimisticAssistantMessage.id
                  ? { ...message, content: snapshot }
                  : message
              )
            );
            continue;
          }

          if (streamEvent.event === "done") {
            const doneEvent = streamEvent as ParsedSseEvent<StreamDoneEvent>;
            const payload = doneEvent.data;

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

              return replaceMessage(
                messagesWithPersistedUser,
                optimisticAssistantMessage.id,
                payload.message
              );
            });
            finished = true;
            break;
          }

          if (streamEvent.event === "error") {
            const errorEvent = streamEvent as ParsedSseEvent<StreamErrorEvent>;
            throw new Error(errorEvent.data?.error ?? "The Hermes request failed.");
          }
        }

        if (finished) {
          await reader.cancel();
          break;
        }
      }

      if (!finished) {
        throw new Error("The Hermes stream ended before completion.");
      }
    } catch (error) {
      setMessages((currentMessages) =>
        removeMessage(currentMessages, optimisticAssistantMessage.id)
      );
      setComposerError(
        error instanceof Error
          ? error.message
          : "The Hermes request failed."
      );
    } finally {
      setIsSending(false);
    }
  }

  if (!isAuthenticated || !sessionUser) {
    return (
      <main className="preview-shell">
        <section className="auth-shell">
          <div className="auth-hero">
            <div className="sidebar-top auth-brand">
              <div className="brand-mark">H</div>

              <div>
                <p className="eyebrow">Hermes Chat</p>
                <p className="sidebar-title">Private by default</p>
              </div>
            </div>

            <div className="auth-copy-stack">
              <h1 className="auth-title">A quieter place to think with Hermes.</h1>
              <p className="auth-copy">
                Your chats stay personal, persistent, and easy to return to.
                Sign in to continue your workspace.
              </p>
            </div>

            <div className="auth-points" aria-label="Product benefits">
              <p>Private conversations on this machine</p>
              <p>One chat thread that stays in context</p>
              <p>Fast, focused workspace without extra noise</p>
            </div>
          </div>

          <section className="auth-panel" aria-label="Authentication">
            <div className="auth-toggle" role="tablist" aria-label="Auth mode">
              <button
                type="button"
                className={`auth-toggle-button${authMode === "login" ? " auth-toggle-button-active" : ""}`}
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                }}
                disabled={authBusy}
              >
                Log in
              </button>
              <button
                type="button"
                className={`auth-toggle-button${authMode === "register" ? " auth-toggle-button-active" : ""}`}
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                }}
                disabled={authBusy}
              >
                Register
              </button>
            </div>

            <div className="auth-panel-copy">
              <p className="eyebrow">Access</p>
              <h2>
                {authMode === "login"
                  ? "Return to your workspace"
                  : "Create your workspace"}
              </h2>
              <p>
                {authMode === "login"
                  ? "Pick up where you left off."
                  : "Set up a personal space for ongoing conversations with Hermes."}
              </p>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label className="auth-field">
                <span className="composer-label">Email</span>
                <input
                  className="auth-input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="name@company.com"
                  disabled={authBusy}
                />
              </label>

              <label className="auth-field">
                <span className="composer-label">Password</span>
                <input
                  className="auth-input"
                  type="password"
                  name="password"
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  disabled={authBusy}
                />
              </label>

              {authError ? (
                <p className="auth-status auth-status-error" role="alert">
                  {authError}
                </p>
              ) : (
                <p className="auth-status" aria-live="polite">
                  {sessionState === "loading"
                    ? "Getting things ready..."
                    : authMode === "login"
                      ? "Use the email and password for this workspace."
                      : "Use at least 8 characters for your password."}
                </p>
              )}

              <button className="auth-submit" type="submit" disabled={authBusy}>
                {authPending
                  ? authMode === "login"
                    ? "Signing in..."
                    : "Creating..."
                  : authMode === "login"
                    ? "Log in"
                    : "Create account"}
              </button>
            </form>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="preview-shell">
      <div className="workspace-shell">
        <aside className="sidebar" aria-label="Workspace navigation">
          <div className="sidebar-top">
            <div className="brand-mark">H</div>

            <div>
              <p className="eyebrow">Hermes Chat</p>
              <p className="sidebar-title">Workspace</p>
              <p className="sidebar-intro">
                Focused conversations, kept in place.
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
                className="sidebar-action sidebar-action-primary"
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
            <div className="sidebar-account">
              <p className="sidebar-note-title">Account</p>
              <p className="sidebar-account-email">{sessionUser.email}</p>
            </div>

            <button
              type="button"
              className="sidebar-secondary-action"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? "Signing out..." : "Log out"}
            </button>
          </div>
        </aside>

        <section className="chat-panel" aria-label="Chat workspace">
          <header className="chat-topbar">
            <div className="chat-title-block">
              <p className="eyebrow">Conversation</p>

              <div className="chat-heading-row">
                <h1>
                  {currentChat?.title ??
                    (isBootstrapping
                      ? "Loading chats"
                      : chats.length === 0
                        ? "Start a new chat"
                        : "Choose a chat")}
                </h1>
              </div>

              <p className="chat-summary">
                {currentChat
                  ? "A persistent thread with Hermes."
                  : chats.length === 0
                    ? "Create a chat to begin."
                    : "Pick a conversation from the sidebar."}
              </p>
            </div>
          </header>

          <div
            ref={transcriptRef}
            className="message-list"
            aria-label="Conversation transcript"
          >
            <p className="timeline-mark">
              {isBootstrapping
                ? "Loading"
                : isLoadingChat
                  ? "Opening chat"
                  : currentChat
                    ? "Live transcript"
                    : "Conversation"}
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
                  {selectedChatId
                    ? "Send the first message to begin the conversation."
                    : "Create a chat to get started."}
                </p>
              </article>
            ) : null}

            {messages.map((message) => (
              <article
                key={message.id}
                className={`message message-${message.role}`}
              >
                <div className="message-meta">
                  <div className="message-identity">
                    {message.role === "assistant" ? (
                      <span className="message-avatar" aria-hidden="true">
                        H
                      </span>
                    ) : null}
                    <span>{getMessageAuthor(message.role)}</span>
                  </div>
                  <span>{formatMessageTime(message.createdAt)}</span>
                </div>

                <div className="message-copy">
                  {renderChatMarkdown(
                    message.content ||
                      (message.role === "assistant" && isSending
                        ? "Thinking…"
                        : "")
                  )}
                </div>
              </article>
            ))}

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
                  placeholder="Message Hermes"
                  rows={4}
                  disabled={composerBusy}
                />
                <p className="composer-copy">
                  Keep it short, or paste a full prompt.
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
                      ? "Hermes is responding..."
                      : isLoadingChat
                        ? "Loading chat..."
                        : !selectedChatId
                          ? "Create a chat to begin."
                          : "Ready."}
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
