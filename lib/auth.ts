import "server-only";

import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_BYTES = 16;
const SESSION_COOKIE_NAME = "hermes_session";
const SESSION_TOKEN_BYTES = 32;
const DEFAULT_SESSION_TTL_DAYS = 30;
const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 200;
const MIN_PASSWORD_LENGTH = 8;

const scrypt = promisify(scryptCallback);

type UserRow = {
  created_at: string;
  email: string;
  id: string;
  password_hash: string;
};

type SessionUserRow = {
  email: string;
  id: string;
};

export type AuthenticatedUser = {
  email: string;
  id: string;
};

export type SessionContext = {
  hasSessionCookie: boolean;
  user: AuthenticatedUser | null;
};

type CreatedSession = {
  expiresAt: string;
  token: string;
};

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function normalizeEmailAddress(value: unknown) {
  if (typeof value !== "string") {
    throw new AuthError("`email` must be a string.", 400);
  }

  const email = value.trim().toLowerCase();

  if (!email) {
    throw new AuthError("`email` must not be empty.", 400);
  }

  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new AuthError("`email` must be a valid email address.", 400);
  }

  return email;
}

export function validatePassword(value: unknown) {
  if (typeof value !== "string") {
    throw new AuthError("`password` must be a string.", 400);
  }

  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      `\`password\` must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      400
    );
  }

  if (value.length > MAX_PASSWORD_LENGTH) {
    throw new AuthError(
      `\`password\` must be no longer than ${MAX_PASSWORD_LENGTH} characters.`,
      400
    );
  }

  return value;
}

function isSqliteConstraintError(
  error: unknown
): error is { code?: string; message?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: string }).code === "string"
  );
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseSessionTtlDays() {
  const rawValue = process.env.AUTH_SESSION_TTL_DAYS?.trim();

  if (!rawValue) {
    return DEFAULT_SESSION_TTL_DAYS;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_SESSION_TTL_DAYS;
  }

  return parsed;
}

function cleanupExpiredSessions() {
  const db = getDb();

  db.prepare("delete from sessions where expires_at <= ?").run(
    new Date().toISOString()
  );
}

async function hashPassword(password: string) {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("base64url");
  const derivedKey = (await scrypt(
    password,
    salt,
    PASSWORD_KEY_LENGTH
  )) as Buffer;

  return `scrypt:${salt}:${derivedKey.toString("base64url")}`;
}

async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, encodedHash] = passwordHash.split(":");

  if (algorithm !== "scrypt" || !salt || !encodedHash) {
    return false;
  }

  const expectedHash = Buffer.from(encodedHash, "base64url");
  const derivedKey = (await scrypt(
    password,
    salt,
    expectedHash.length
  )) as Buffer;

  return (
    expectedHash.length === derivedKey.length &&
    timingSafeEqual(expectedHash, derivedKey)
  );
}

function mapAuthenticatedUser(row: SessionUserRow): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email
  };
}

export async function registerLocalUser(email: string, password: string) {
  const db = getDb();
  const userId = randomUUID();
  const createdAt = new Date().toISOString();
  const passwordHash = await hashPassword(password);

  try {
    db.prepare(
      `
        insert into users (id, email, password_hash, created_at)
        values (?, ?, ?, ?)
      `
    ).run(userId, email, passwordHash, createdAt);
  } catch (error) {
    if (isSqliteConstraintError(error) && error.code?.startsWith("SQLITE_CONSTRAINT")) {
      throw new AuthError("An account with that email already exists.", 409);
    }

    throw error;
  }

  return {
    id: userId,
    email
  };
}

export async function authenticateLocalUser(email: string, password: string) {
  const db = getDb();
  const row = db
    .prepare(
      `
        select id, email, password_hash, created_at
        from users
        where email = ?
        limit 1
      `
    )
    .get(email) as UserRow | undefined;

  if (!row) {
    throw new AuthError("Invalid email or password.", 401);
  }

  const passwordMatches = await verifyPassword(password, row.password_hash);

  if (!passwordMatches) {
    throw new AuthError("Invalid email or password.", 401);
  }

  return mapAuthenticatedUser(row);
}

export function createUserSession(userId: string): CreatedSession {
  cleanupExpiredSessions();

  const db = getDb();
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + parseSessionTtlDays() * 24 * 60 * 60 * 1000
  );
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");

  db.prepare(
    `
      insert into sessions (id, user_id, token_hash, created_at, expires_at)
      values (?, ?, ?, ?, ?)
    `
  ).run(
    randomUUID(),
    userId,
    hashSessionToken(token),
    createdAt.toISOString(),
    expiresAt.toISOString()
  );

  return {
    token,
    expiresAt: expiresAt.toISOString()
  };
}

async function readSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function getSessionContext(): Promise<SessionContext> {
  cleanupExpiredSessions();

  const token = await readSessionToken();

  if (!token) {
    return {
      hasSessionCookie: false,
      user: null
    };
  }

  const db = getDb();
  const row = db
    .prepare(
      `
        select u.id, u.email
        from sessions s
        join users u on u.id = s.user_id
        where s.token_hash = ?
          and s.expires_at > ?
        limit 1
      `
    )
    .get(
      hashSessionToken(token),
      new Date().toISOString()
    ) as SessionUserRow | undefined;

  return {
    hasSessionCookie: true,
    user: row ? mapAuthenticatedUser(row) : null
  };
}

export async function requireAuthenticatedUser() {
  const session = await getSessionContext();

  if (!session.user) {
    throw new AuthError("Authentication required.", 401);
  }

  return session.user;
}

export async function destroyCurrentSession() {
  const token = await readSessionToken();

  if (!token) {
    return;
  }

  const db = getDb();
  db.prepare("delete from sessions where token_hash = ?").run(
    hashSessionToken(token)
  );
}

function buildSessionCookieOptions(expiresAt: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    expires: new Date(expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production"
  };
}

export function attachSessionCookie(
  response: NextResponse,
  session: CreatedSession
) {
  response.cookies.set({
    ...buildSessionCookieOptions(session.expiresAt),
    value: session.token
  });

  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    ...buildSessionCookieOptions(new Date(0).toISOString()),
    expires: new Date(0)
  });

  return response;
}
