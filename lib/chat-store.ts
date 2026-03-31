import "server-only";

import { randomUUID } from "node:crypto";

import type {
  ChatDetail,
  ChatMessage,
  ChatMessageRole,
  ChatSummary,
  PersistedChatMessage
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

function mapPersistedMessage(row: MessageRow): PersistedChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  };
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
  const messages = db
    .prepare(
      `
        select m.id, m.role, m.content, m.created_at
        from messages m
        join chats c on c.id = m.chat_id
        where m.chat_id = ?
          and c.owner_user_id = ?
        order by m.created_at asc, m.id asc
      `
    )
    .all(chatId, userId) as MessageRow[];

  return {
    chat,
    messages: messages.map(mapPersistedMessage)
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
  message: ChatMessage
): PersistedChatMessage {
  const db = getDb();
  const messageId = randomUUID();
  const createdAt = new Date().toISOString();

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
        insert into messages (id, chat_id, role, content, created_at)
        values (?, ?, ?, ?, ?)
      `
    ).run(messageId, chatId, message.role, message.content, createdAt);

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

  return {
    id: messageId,
    role: message.role,
    content: message.content,
    createdAt
  };
}

export function listMessagesForHermes(
  userId: string,
  chatId: string,
  limit: number
) {
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

  const rows = db
    .prepare(
      `
        select role, content
        from (
          select role, content, created_at, id
          from messages
          where chat_id = ?
          order by created_at desc, id desc
          limit ?
        ) recent_messages
        order by created_at asc, id asc
      `
    )
    .all(chatId, limit) as ChatMessage[];

  return rows;
}
