import "server-only";

import { randomUUID } from "node:crypto";

import type { ChatAttachmentKind } from "@/lib/attachment-types";
import type {
  ChatAttachment,
  ChatDetail,
  ChatMessage,
  ChatMessageRole,
  ChatSummary,
  PersistedChatMessage,
  ToolCall
} from "@/lib/chat-types";
import { getDb } from "@/lib/db";

type ChatSummaryRow = {
  created_at: string;
  id: string;
  last_message_preview: string | null;
  message_count: number;
  title: string;
  updated_at: string;
};

type MessageRow = {
  content: string;
  created_at: string;
  id: string;
  role: ChatMessageRole;
};

type MessageAttachmentRow = {
  filename: string;
  id: string;
  kind: ChatAttachmentKind;
  media_type: string;
  message_id: string;
  size_bytes: number;
};

type StoredAttachmentInput = {
  filename: string;
  kind: ChatAttachmentKind;
  mediaType: string;
  sizeBytes: number;
  storagePath: string;
};

type ChatHermesSessionRow = {
  hermes_session_id: string | null;
};

export const DEFAULT_CHAT_TITLE = "New chat";
export const MAX_CHAT_TITLE_LENGTH = 80;
const MAX_PREVIEW_LENGTH = 120;

export class ChatStoreError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ChatStoreError";
    this.status = status;
  }
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function createMessagePreview(content: string | null) {
  if (!content) {
    return null;
  }

  const normalized = normalizeWhitespace(content);

  if (normalized.length <= MAX_PREVIEW_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_PREVIEW_LENGTH - 3).trimEnd()}...`;
}

function buildChatTitleFromContent(content: string) {
  const normalized = normalizeWhitespace(content);

  if (normalized.length <= MAX_CHAT_TITLE_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_CHAT_TITLE_LENGTH - 3).trimEnd()}...`;
}

function normalizeStoredChatTitle(title?: string) {
  const normalizedTitle = normalizeWhitespace(title ?? "");

  if (!normalizedTitle) {
    return DEFAULT_CHAT_TITLE;
  }

  if (normalizedTitle.length <= MAX_CHAT_TITLE_LENGTH) {
    return normalizedTitle;
  }

  return `${normalizedTitle
    .slice(0, MAX_CHAT_TITLE_LENGTH - 3)
    .trimEnd()}...`;
}

function buildAttachmentUrl(attachmentId: string) {
  return `/api/attachments/${attachmentId}`;
}

function mapChatSummary(row: ChatSummaryRow): ChatSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessagePreview: createMessagePreview(row.last_message_preview),
    messageCount: Number(row.message_count)
  };
}

function mapAttachmentRow(row: MessageAttachmentRow): ChatAttachment {
  return {
    id: row.id,
    filename: row.filename,
    kind: row.kind,
    mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes),
    url: buildAttachmentUrl(row.id)
  };
}

function mapPersistedMessage(
  row: MessageRow & { tool_calls?: string | null },
  attachmentsByMessageId: Map<string, ChatAttachment[]>
): PersistedChatMessage {
  const toolCalls = row.tool_calls
    ? (JSON.parse(row.tool_calls) as ToolCall[])
    : undefined;

  return {
    id: row.id,
    role: row.role,
    content: row.content,
    attachments: attachmentsByMessageId.get(row.id) ?? [],
    createdAt: row.created_at,
    toolCalls
  };
}

function assertOwnedChatExists(userId: string, chatId: string) {
  const db = getDb();
  const chatExists = db
    .prepare(
      `
        select 1 as found
        from chats
        where id = ?
          and owner_user_id = ?
      `
    )
    .get(chatId, userId) as { found: number } | undefined;

  if (!chatExists) {
    throw new ChatStoreError("Chat not found.", 404);
  }
}

function getChatSummary(userId: string, chatId: string) {
  const db = getDb();
  const row = db
    .prepare(
      `
        select
          c.id,
          c.title,
          c.created_at,
          c.updated_at,
          (
            select m.content
            from messages m
            where m.chat_id = c.id
            order by m.created_at desc, m.id desc
            limit 1
          ) as last_message_preview,
          (
            select count(*)
            from messages m
            where m.chat_id = c.id
          ) as message_count
        from chats c
        where c.id = ?
          and c.owner_user_id = ?
      `
    )
    .get(chatId, userId) as ChatSummaryRow | undefined;

  return row ? mapChatSummary(row) : null;
}

function createChatInternal(userId: string, title = DEFAULT_CHAT_TITLE) {
  const db = getDb();
  const chatId = randomUUID();
  const timestamp = new Date().toISOString();

  db.prepare(
    `
      insert into chats (id, title, created_at, updated_at, owner_user_id)
      values (?, ?, ?, ?, ?)
    `
  ).run(chatId, title, timestamp, timestamp, userId);

  return chatId;
}

function getAttachmentsForMessageIds(userId: string, messageIds: string[]) {
  if (messageIds.length === 0) {
    return new Map<string, ChatAttachment[]>();
  }

  const db = getDb();
  const placeholders = messageIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        select
          id,
          message_id,
          filename,
          media_type,
          kind,
          size_bytes
        from message_attachments
        where owner_user_id = ?
          and message_id in (${placeholders})
        order by created_at asc, id asc
      `
    )
    .all(userId, ...messageIds) as MessageAttachmentRow[];

  const attachmentsByMessageId = new Map<string, ChatAttachment[]>();

  for (const row of rows) {
    const current = attachmentsByMessageId.get(row.message_id) ?? [];
    current.push(mapAttachmentRow(row));
    attachmentsByMessageId.set(row.message_id, current);
  }

  return attachmentsByMessageId;
}

export function getAttachmentDownload(
  userId: string,
  attachmentId: string
): (StoredAttachmentInput & { id: string }) | null {
  const db = getDb();
  const row = db
    .prepare(
      `
        select id, filename, kind, media_type, size_bytes, storage_path
        from message_attachments
        where id = ?
          and owner_user_id = ?
        limit 1
      `
    )
    .get(attachmentId, userId) as
    | {
        filename: string;
        id: string;
        kind: ChatAttachmentKind;
        media_type: string;
        size_bytes: number;
        storage_path: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    filename: row.filename,
    kind: row.kind,
    mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes),
    storagePath: row.storage_path
  };
}

export function listChats(userId: string): ChatSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
        select
          c.id,
          c.title,
          c.created_at,
          c.updated_at,
          (
            select m.content
            from messages m
            where m.chat_id = c.id
            order by m.created_at desc, m.id desc
            limit 1
          ) as last_message_preview,
          (
            select count(*)
            from messages m
            where m.chat_id = c.id
          ) as message_count
        from chats c
        where c.owner_user_id = ?
        order by c.updated_at desc, c.created_at desc, c.id desc
      `
    )
    .all(userId) as ChatSummaryRow[];

  return rows.map(mapChatSummary);
}

export function getChat(userId: string, chatId: string): ChatDetail | null {
  const chat = getChatSummary(userId, chatId);

  if (!chat) {
    return null;
  }

  const db = getDb();
  const messageRows = db
    .prepare(
      `
        select m.id, m.role, m.content, m.created_at, m.tool_calls
        from messages m
        join chats c on c.id = m.chat_id
        where m.chat_id = ?
          and c.owner_user_id = ?
        order by m.created_at asc, m.id asc
      `
    )
    .all(chatId, userId) as (MessageRow & { tool_calls?: string | null })[];

  const attachmentsByMessageId = getAttachmentsForMessageIds(
    userId,
    messageRows.map((row) => row.id)
  );

  return {
    chat,
    messages: messageRows.map((row) => mapPersistedMessage(row, attachmentsByMessageId))
  };
}

export function createChat(userId: string, title?: string) {
  const chatId = createChatInternal(userId, normalizeStoredChatTitle(title));
  const chat = getChat(userId, chatId);

  if (!chat) {
    throw new ChatStoreError("Chat could not be created.", 500);
  }

  return chat;
}

export function appendMessage(
  userId: string,
  chatId: string,
  message: ChatMessage,
  options?: {
    attachments?: StoredAttachmentInput[];
    hermesContent?: string;
    toolCalls?: ToolCall[];
  }
): PersistedChatMessage {
  const db = getDb();
  const messageId = randomUUID();
  const createdAt = new Date().toISOString();
  const attachments = options?.attachments ?? [];
  const hermesContent = options?.hermesContent?.trim() || null;
  const toolCallsJson = options?.toolCalls
    ? JSON.stringify(options.toolCalls)
    : null;

  const insertMessage = db.transaction(() => {
    const chatRow = db
      .prepare(
        `
          select title
          from chats
          where id = ?
            and owner_user_id = ?
        `
      )
      .get(chatId, userId) as { title: string } | undefined;

    if (!chatRow) {
      throw new ChatStoreError("Chat not found.", 404);
    }

    const existingMessageCount = db
      .prepare("select count(*) as count from messages where chat_id = ?")
      .get(chatId) as { count: number };

    db.prepare(
      `
        insert into messages (id, chat_id, role, content, hermes_content, tool_calls, created_at)
        values (?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      messageId,
      chatId,
      message.role,
      message.content,
      hermesContent,
      toolCallsJson,
      createdAt
    );

    if (attachments.length > 0) {
      const insertAttachment = db.prepare(
        `
          insert into message_attachments (
            id,
            message_id,
            chat_id,
            owner_user_id,
            filename,
            media_type,
            kind,
            size_bytes,
            storage_path,
            created_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const attachment of attachments) {
        insertAttachment.run(
          randomUUID(),
          messageId,
          chatId,
          userId,
          attachment.filename,
          attachment.mediaType,
          attachment.kind,
          attachment.sizeBytes,
          attachment.storagePath,
          createdAt
        );
      }
    }

    if (
      message.role === "user" &&
      Number(existingMessageCount.count) === 0 &&
      chatRow.title === DEFAULT_CHAT_TITLE
    ) {
      db.prepare("update chats set title = ?, updated_at = ? where id = ?").run(
        buildChatTitleFromContent(message.content),
        createdAt,
        chatId
      );
    } else {
      db.prepare("update chats set updated_at = ? where id = ?").run(
        createdAt,
        chatId
      );
    }
  });

  insertMessage();

  const persisted = getChat(userId, chatId)?.messages.find(
    (storedMessage) => storedMessage.id === messageId
  );

  if (!persisted) {
    throw new ChatStoreError("Message could not be persisted.", 500);
  }

  return persisted;
}

export function getChatHermesSessionId(userId: string, chatId: string) {
  const db = getDb();
  const row = db
    .prepare(
      `
        select hermes_session_id
        from chats
        where id = ?
          and owner_user_id = ?
        limit 1
      `
    )
    .get(chatId, userId) as ChatHermesSessionRow | undefined;

  if (!row) {
    throw new ChatStoreError("Chat not found.", 404);
  }

  return row.hermes_session_id;
}

export function setChatHermesSessionId(
  userId: string,
  chatId: string,
  hermesSessionId: string
) {
  const db = getDb();
  const result = db
    .prepare(
      `
        update chats
        set hermes_session_id = ?
        where id = ?
          and owner_user_id = ?
      `
    )
    .run(hermesSessionId, chatId, userId);

  if (result.changes === 0) {
    throw new ChatStoreError("Chat not found.", 404);
  }
}

export function listMessagesForHermes(
  userId: string,
  chatId: string,
  limit: number,
  options?: {
    excludeMessageId?: string;
  }
) {
  const db = getDb();
  const excludeMessageId = options?.excludeMessageId?.trim();
  const excludeClause = excludeMessageId ? "and id != ?" : "";
  const parameters: Array<number | string> = [chatId];

  assertOwnedChatExists(userId, chatId);

  if (excludeMessageId) {
    parameters.push(excludeMessageId);
  }

  parameters.push(limit);

  const rows = db
    .prepare(
      `
        select role, coalesce(hermes_content, content) as content
        from (
          select role, content, hermes_content, created_at, id
          from messages
          where chat_id = ?
            ${excludeClause}
          order by created_at desc, id desc
          limit ?
        ) recent_messages
        order by created_at asc, id asc
      `
    )
    .all(...parameters) as ChatMessage[];

  return rows;
}

export function updateChat(userId: string, chatId: string, title: string) {
  const normalizedTitle = normalizeWhitespace(title);

  if (!normalizedTitle) {
    throw new ChatStoreError("Title cannot be empty.", 400);
  }

  if (normalizedTitle.length > MAX_CHAT_TITLE_LENGTH) {
    throw new ChatStoreError(
      `Title exceeds ${MAX_CHAT_TITLE_LENGTH} characters.`,
      400
    );
  }

  assertOwnedChatExists(userId, chatId);

  const db = getDb();
  const timestamp = new Date().toISOString();

  db.prepare(
    `
      update chats
      set title = ?, updated_at = ?
      where id = ? and owner_user_id = ?
    `
  ).run(normalizedTitle, timestamp, chatId, userId);

  return getChatSummary(userId, chatId);
}

export function deleteChat(userId: string, chatId: string) {
  assertOwnedChatExists(userId, chatId);

  const db = getDb();

  // Use cascading delete - foreign keys with on delete cascade handle the rest
  // Just delete the chat and let SQLite handle messages, attachments, etc.
  db.prepare(
    `
      delete from chats
      where id = ? and owner_user_id = ?
    `
  ).run(chatId, userId);
}
