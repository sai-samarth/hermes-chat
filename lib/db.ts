import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";

import DatabaseConstructor from "better-sqlite3";

type DatabaseInstance = InstanceType<typeof DatabaseConstructor>;

declare global {
  var __hermesChatDb: DatabaseInstance | undefined;
}

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "hermes-chat.sqlite");

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

function columnExists(
  db: DatabaseInstance,
  tableName: string,
  columnName: string
) {
  const columns = db
    .prepare(`pragma table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === columnName);
}

function initializeDatabase(db: DatabaseInstance) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    create table if not exists users (
      id text primary key,
      email text not null unique,
      password_hash text not null,
      hermes_profile_name text,
      created_at text not null
    );

    create table if not exists sessions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      token_hash text not null unique,
      created_at text not null,
      expires_at text not null
    );

    create table if not exists chats (
      id text primary key,
      title text not null,
      created_at text not null,
      updated_at text not null,
      owner_user_id text references users(id) on delete cascade,
      hermes_session_id text
    );

    create table if not exists messages (
      id text primary key,
      chat_id text not null references chats(id) on delete cascade,
      role text not null check (role in ('system', 'user', 'assistant')),
      content text not null,
      hermes_content text,
      created_at text not null
    );

    create table if not exists message_attachments (
      id text primary key,
      message_id text not null references messages(id) on delete cascade,
      chat_id text not null references chats(id) on delete cascade,
      owner_user_id text not null references users(id) on delete cascade,
      filename text not null,
      media_type text not null,
      kind text not null check (kind in ('image', 'document')),
      size_bytes integer not null,
      storage_path text not null,
      created_at text not null
    );
  `);

  if (!columnExists(db, "chats", "owner_user_id")) {
    db.exec(`
      alter table chats
      add column owner_user_id text references users(id) on delete cascade
    `);
  }

  if (!columnExists(db, "users", "hermes_profile_name")) {
    db.exec(`
      alter table users
      add column hermes_profile_name text
    `);
  }

  if (!columnExists(db, "chats", "hermes_session_id")) {
    db.exec(`
      alter table chats
      add column hermes_session_id text
    `);
  }

  if (!columnExists(db, "messages", "hermes_content")) {
    db.exec(`
      alter table messages
      add column hermes_content text
    `);
  }

  if (!columnExists(db, "messages", "tool_calls")) {
    db.exec(`
      alter table messages
      add column tool_calls text
    `);
  }

  db.exec(`
    create index if not exists idx_sessions_user_expires_at
      on sessions (user_id, expires_at);

    create index if not exists idx_chats_owner_updated_at
      on chats (owner_user_id, updated_at, created_at, id);

    create index if not exists idx_messages_chat_created_at
      on messages (chat_id, created_at, id);

    create index if not exists idx_message_attachments_message
      on message_attachments (message_id, created_at, id);

    create index if not exists idx_message_attachments_owner
      on message_attachments (owner_user_id, chat_id, created_at, id);
  `);
}

export function getDb() {
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
