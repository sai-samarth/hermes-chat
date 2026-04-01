"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";

import { composerFileAccept } from "@/lib/attachment-types";
import type {
  ChatAttachment,
  ChatDetail,
  ChatSummary,
  PersistedChatMessage
} from "@/lib/chat-types";
import { renderChatMarkdown } from "@/lib/chat-markdown";
import { createSseParser, type ParsedSseEvent } from "@/lib/sse";

const DEFAULT_CHAT_TITLE = "New chat";
const MAX_CHAT_TITLE_LENGTH = 80;
const MAX_PREVIEW_LENGTH = 120;
const DAY_MS = 24 * 60 * 60 * 1000;
const MOBILE_SIDEBAR_BREAKPOINT_PX = 960;

const monthYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long",
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
  error?: string;
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

type ChatGroup = {
  key: string;
  label: string;
  chats: ChatSummary[];
};

type PendingAttachment = {
  file: File;
  id: string;
  kind: ChatAttachment["kind"];
  mediaType: string;
  sizeBytes: number;
};

function inferAttachmentKind(file: File): ChatAttachment["kind"] {
  return file.type.startsWith("image/") ? "image" : "document";
}

function buildAttachmentOnlyLabel(attachments: Array<{ filename: string }>) {
  if (attachments.length === 1) {
    return `Attached: ${attachments[0]?.filename ?? "file"}`;
  }

  return `Attached ${attachments.length} files`;
}

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

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function getChatGroupLabel(value: string) {
  const updatedAt = new Date(value);
  const today = startOfDay(new Date());
  const updatedDay = startOfDay(updatedAt);
  const dayDelta = Math.round((today.getTime() - updatedDay.getTime()) / DAY_MS);

  if (dayDelta <= 0) {
    return { key: "today", label: "Today" };
  }

  if (dayDelta === 1) {
    return { key: "yesterday", label: "Yesterday" };
  }

  if (dayDelta < 7) {
    return { key: "previous-7-days", label: "Previous 7 days" };
  }

  const monthLabel = monthYearFormatter.format(updatedAt);
  return {
    key: `month-${updatedAt.getFullYear()}-${updatedAt.getMonth() + 1}`,
    label: monthLabel
  };
}

function groupChats(chats: ChatSummary[]): ChatGroup[] {
  const groups: ChatGroup[] = [];

  for (const chat of chats) {
    const bucket = getChatGroupLabel(chat.updatedAt);
    const existingGroup = groups.find((group) => group.key === bucket.key);

    if (existingGroup) {
      existingGroup.chats.push(chat);
      continue;
    }

    groups.push({
      key: bucket.key,
      label: bucket.label,
      chats: [chat]
    });
  }

  return groups;
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
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const composerFileInputRef = useRef<HTMLInputElement>(null);

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
  const authBusy = authPending || isLoggingOut || sessionState === "loading";
  const groupedChats = useMemo(() => groupChats(chats), [chats]);

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
    setPendingAttachments([]);
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
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(
      `(max-width: ${MOBILE_SIDEBAR_BREAKPOINT_PX}px)`
    );

    const syncViewport = () => {
      const compact = mediaQuery.matches;
      setIsCompactViewport(compact);
      setIsSidebarOpen(!compact);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

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

  async function handleCreateChat(prefillDraft = "") {
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
      setDraft(prefillDraft);
      requestAnimationFrame(() => {
        composerInputRef.current?.focus();
      });
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not create a chat."
      );
    } finally {
      setIsCreatingChat(false);
    }
  }

  function handleAttachmentInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);

    if (nextFiles.length === 0) {
      return;
    }

    setComposerError(null);
    setPendingAttachments((currentAttachments) => {
      const existingKeys = new Set(
        currentAttachments.map((attachment) =>
          `${attachment.file.name}:${attachment.file.size}:${attachment.file.lastModified}`
        )
      );
      const nextAttachments = [...currentAttachments];

      for (const file of nextFiles) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;

        if (existingKeys.has(key)) {
          continue;
        }

        existingKeys.add(key);
        nextAttachments.push({
          id: crypto.randomUUID(),
          file,
          kind: inferAttachmentKind(file),
          mediaType: file.type,
          sizeBytes: file.size
        });
      }

      return nextAttachments;
    });

    event.target.value = "";
  }

  function handleRemovePendingAttachment(attachmentId: string) {
    setPendingAttachments((currentAttachments) =>
      currentAttachments.filter((attachment) => attachment.id !== attachmentId)
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedChatId || !currentChat || isSending) {
      return;
    }

    const content = draft.trim();
    const attachmentsForSend = [...pendingAttachments];

    if (!content && attachmentsForSend.length === 0) {
      return;
    }

    const visibleContent =
      content ||
      buildAttachmentOnlyLabel(
        attachmentsForSend.map((attachment) => ({ filename: attachment.file.name }))
      );
    const submittedAt = new Date().toISOString();
    const optimisticMessage: PersistedChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: visibleContent,
      attachments: attachmentsForSend.map((attachment) => ({
        id: attachment.id,
        filename: attachment.file.name,
        kind: attachment.kind,
        mediaType: attachment.mediaType,
        sizeBytes: attachment.sizeBytes,
        url: ""
      })),
      createdAt: submittedAt
    };
    const optimisticAssistantMessage: PersistedChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      attachments: [],
      createdAt: submittedAt
    };
    const optimisticPreview = buildPreview(visibleContent);
    const optimisticChat: ChatSummary = {
      ...currentChat,
      title:
        currentChat.messageCount === 0 && currentChat.title === DEFAULT_CHAT_TITLE
          ? buildChatTitle(visibleContent)
          : currentChat.title,
      updatedAt: submittedAt,
      lastMessagePreview: optimisticPreview,
      messageCount: currentChat.messageCount + 1
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      optimisticMessage,
      optimisticAssistantMessage
    ]);
    setChats((currentChats) => upsertChat(currentChats, optimisticChat));
    setDraft("");
    setPendingAttachments([]);
    setComposerError(null);
    setIsSending(true);

    try {
      const formData = new FormData();
      formData.set("chatId", selectedChatId);
      formData.set("content", content);

      attachmentsForSend.forEach((attachment) => {
        formData.append("attachments", attachment.file);
      });

      const response = await fetch("/api/chat?stream=1", {
        method: "POST",
        headers: {
          Accept: "text/event-stream"
        },
        body: formData
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
      setDraft(content);
      setPendingAttachments(attachmentsForSend);
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

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    composerFormRef.current?.requestSubmit();
  }

  if (!isAuthenticated || !sessionUser) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <div className="auth-header">
            <h1>Hermes Chat</h1>
            <p>Private conversations, kept in place.</p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab${authMode === "login" ? ' auth-tab-active' : ''}`}
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
              className={`auth-tab${authMode === "register" ? ' auth-tab-active' : ''}`}
              onClick={() => {
                setAuthMode("register");
                setAuthError(null);
              }}
              disabled={authBusy}
            >
              Register
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                name="email"
                autoComplete="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="name@company.com"
                disabled={authBusy}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                name="password"
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder={authMode === "login" ? "Password" : "At least 8 characters"}
                disabled={authBusy}
              />
            </div>

            {authError && (
              <div className="auth-error">{authError}</div>
            )}

            <button className="auth-submit" type="submit" disabled={authBusy}>
              {authPending
                ? authMode === "login" ? "Signing in..." : "Creating..."
                : authMode === "login" ? "Log in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-shell">
      {/* Mobile sidebar scrim */}
      {isCompactViewport && isSidebarOpen && (
        <button
          type="button"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 99,
            border: 'none',
            cursor: 'pointer'
          }}
          aria-label="Close sidebar"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar${isSidebarOpen ? '' : ' sidebar-collapsed'}${isCompactViewport && isSidebarOpen ? ' sidebar-open' : ''}`}
        aria-label="Workspace navigation"
      >
        <div className={`sidebar-header${isSidebarOpen ? '' : ' sidebar-header-collapsed'}`}>
          {isSidebarOpen && <span className="brand-text">Hermes</span>}
          <button
            type="button"
            className={`sidebar-toggle${isSidebarOpen ? '' : ' sidebar-toggle-collapsed'}`}
            onClick={() => setIsSidebarOpen(v => !v)}
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarOpen ? '‹' : '›'}
          </button>
        </div>

        <button
          type="button"
          className={`new-chat-btn${isSidebarOpen ? '' : ' new-chat-btn-collapsed'}`}
          onClick={() => {
            if (isCompactViewport) setIsSidebarOpen(false);
            void handleCreateChat();
          }}
          disabled={sidebarBusy}
        >
          <span>+</span>
          {isSidebarOpen && (isCreatingChat ? 'Creating...' : 'New chat')}
        </button>

        <div className="thread-list">
          {groupedChats.map((group) => (
            <div key={group.key} className="thread-group">
              {isSidebarOpen && <div className="thread-group-label">{group.label}</div>}
              <ul className="thread-group-list">
                {group.chats.map((chat) => (
                  <li key={chat.id}>
                    <button
                      type="button"
                      className={`thread-item${chat.id === selectedChatId ? ' thread-item-active' : ''}${isSidebarOpen ? '' : ' thread-item-collapsed'}`}
                      onClick={() => {
                        if (isCompactViewport) setIsSidebarOpen(false);
                        void loadChat(chat.id);
                      }}
                      disabled={sidebarBusy || chat.id === selectedChatId}
                      title={chat.title}
                    >
                      {isSidebarOpen ? (
                        <>{chat.title}</>
                      ) : (
                        <span style={{fontSize: '11px'}}>{chat.title.slice(0, 2)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className="user-btn"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
          >
            <div className="user-avatar">{sessionUser.email.charAt(0).toUpperCase()}</div>
            {isSidebarOpen && <span className="user-email">{sessionUser.email}</span>}
          </button>
        </div>
      </aside>

      {/* Main chat area */}
      <section className="chat-panel" aria-label="Chat workspace">
        <header className="chat-topbar">
          <div className="chat-topbar-left">
            <button
              type="button"
              className="menu-btn"
              onClick={() => setIsSidebarOpen(v => !v)}
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
            <h1 className="chat-title">
              {currentChat?.title || (chats.length === 0 ? 'New chat' : 'Select a chat')}
            </h1>
          </div>
          <div className="chat-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => void handleCreateChat()}
              disabled={sidebarBusy}
              title="New chat"
            >
              +
            </button>
          </div>
        </header>

        <div ref={transcriptRef} className="message-list">
          <div className="chat-container">
            {/* Status */}
            {(isBootstrapping || isLoadingChat) && (
              <div className="status-indicator">
                {isBootstrapping ? 'Loading...' : 'Opening chat...'}
              </div>
            )}

            {loadError && (
              <div className="status-indicator" style={{color: 'var(--danger)'}}>
                {loadError}
              </div>
            )}

            {/* Empty state - minimal */}
            {!isBootstrapping && !isLoadingChat && messages.length === 0 && (
              <div className="empty-state">
                <h1 className="empty-state-title">What can I help you with?</h1>
              </div>
            )}

            {/* Messages */}
            {messages.map((message) => (
              <article key={message.id} className={`message message-${message.role}`}>
                <div className="message-header">
                  <div className={`message-avatar message-avatar-${message.role}`}>
                    {message.role === 'assistant' ? 'H' : 'Y'}
                  </div>
                  <span className="message-role">
                    {message.role === 'assistant' ? 'Hermes' : 'You'}
                  </span>
                </div>
                <div className="message-content">
                  {renderChatMarkdown(
                    message.content || (message.role === 'assistant' && isSending ? 'Thinking...' : '')
                  )}
                </div>
                {message.attachments.length > 0 && (
                  <div className="attachment-list">
                    {message.attachments.map((att) => (
                      <a
                        key={att.id}
                        className="attachment-chip"
                        href={att.url || undefined}
                        target={att.url ? '_blank' : undefined}
                        rel={att.url ? 'noreferrer' : undefined}
                      >
                        {att.kind === 'image' ? '📷' : '📄'} {att.filename}
                      </a>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        {/* Composer */}
        <footer className="composer">
          <div className="composer-container">
            <form onSubmit={handleSubmit}>
              <div className="composer-box">
                {/* Attachments */}
                {pendingAttachments.length > 0 && (
                  <div className="attachment-list">
                    {pendingAttachments.map((att) => (
                      <div key={att.id} className="attachment-chip">
                        {att.kind === 'image' ? '📷' : '📄'} {att.file.name}
                        <button
                          type="button"
                          className="attachment-remove"
                          onClick={() => handleRemovePendingAttachment(att.id)}
                          disabled={composerBusy}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  ref={composerInputRef}
                  className="composer-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Message Hermes..."
                  disabled={composerBusy}
                  rows={1}
                />

                <div className="composer-toolbar">
                  <div className="composer-actions">
                    <button
                      type="button"
                      className="composer-action-btn"
                      onClick={() => composerFileInputRef.current?.click()}
                      disabled={composerBusy}
                      title="Attach file"
                    >
                      📎
                    </button>
                    <input
                      ref={composerFileInputRef}
                      type="file"
                      multiple
                      accept={composerFileAccept}
                      onChange={handleAttachmentInputChange}
                      disabled={composerBusy}
                      style={{display: 'none'}}
                    />
                  </div>
                  <span className="composer-status">
                    {composerError || (isSending ? 'Sending...' : '')}
                  </span>
                  <button
                    type="submit"
                    className="composer-send"
                    disabled={composerBusy || (!draft.trim() && pendingAttachments.length === 0)}
                  >
                    ↑
                  </button>
                </div>
              </div>
            </form>
          </div>
        </footer>
      </section>
    </div>
  );
}
