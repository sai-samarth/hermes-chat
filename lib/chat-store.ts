import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import DatabaseConstructor from "better-sqlite3";

import type {
  ChatDetail,
  ChatMessage,
  ChatMessageRole,
  ChatSummary,
  PersistedChatMessage
} from "@/lib/chat-types";

type DatabaseInstance = InstanceType<typeof DatabaseConstructor>;

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

declare global {
  var __hermesChatDb: DatabaseInstance | undefined;
}

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "hermes-chat.sqlite");
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

function resolveDatabasePath() {
  const configuredPath = process.env.SQLITE_DB_PATH?.trim();

  if (!configuredPath) {
    return DEFAULT_DB_PATH;
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), configuredPath);
}

export function getChatDatabasePath() {
  return resolveDatabasePath();
}

function initializeDatabase(db: DatabaseInstance) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    create table if not exists chats (
      id text primary key,
      title text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists messages (
      id text primary key,
      chat_id text not null references chats(id) on delete cascade,
      role text not null check (role in ('system', 'user', 'assistant')),
      content text not null,
      created_at text not null
    );

    create index if not exists idx_messages_chat_created_at
      on messages (chat_id, created_at, id);
  `);
}

function getDb() {
  if (globalThis.__hermesChatDb) {
    return globalThis.__hermesChatDb;
  }

  const databasePath = resolveDatabasePath();
  mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new DatabaseConstructor(databasePath);
  initializeDatabase(db);

  globalThis.__hermesChatDb = db;
  return db;
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

function getChatSummary(chatId: string) {
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
      `
    )
    .get(chatId) as ChatSummaryRow | undefined;

  return row ? mapChatSummary(row) : null;
}

function createChatInternal(title = DEFAULT_CHAT_TITLE) {
  const db = getDb();
  const chatId = randomUUID();
  const timestamp = new Date().toISOString();

  db.prepare(
    `
      insert into chats (id, title, created_at, updated_at)
      values (?, ?, ?, ?)
    `
  ).run(chatId, title, timestamp, timestamp);

  return chatId;
}

function ensureDefaultChat() {
  const db = getDb();
  const row = db
    .prepare("select count(*) as count from chats")
    .get() as { count: number };

  if (Number(row.count) === 0) {
    createChatInternal();
  }
}

export function listChats(): ChatSummary[] {
  ensureDefaultChat();

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
        order by c.updated_at desc, c.created_at desc, c.id desc
      `
    )
    .all() as ChatSummaryRow[];

  return rows.map(mapChatSummary);
}

export function getChat(chatId: string): ChatDetail | null {
  const chat = getChatSummary(chatId);

  if (!chat) {
    return null;
  }

  const db = getDb();
  const messages = db
    .prepare(
      `
        select id, role, content, created_at
        from messages
        where chat_id = ?
        order by created_at asc, id asc
      `
    )
    .all(chatId) as MessageRow[];

  return {
    chat,
    messages: messages.map(mapPersistedMessage)
  };
}

export function createChat(title?: string) {
  const chatId = createChatInternal(normalizeStoredChatTitle(title));
  const chat = getChat(chatId);

  if (!chat) {
    throw new ChatStoreError("Chat could not be created.", 500);
  }

  return chat;
}

export function appendMessage(
  chatId: string,
  message: ChatMessage
): PersistedChatMessage {
  const db = getDb();
  const messageId = randomUUID();
  const createdAt = new Date().toISOString();

  const insertMessage = db.transaction(() => {
    const chatRow = db
      .prepare("select title from chats where id = ?")
      .get(chatId) as { title: string } | undefined;

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

export function listMessagesForHermes(chatId: string, limit: number) {
  const db = getDb();
  const chatExists = db
    .prepare("select 1 as found from chats where id = ?")
    .get(chatId) as { found: number } | undefined;

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
