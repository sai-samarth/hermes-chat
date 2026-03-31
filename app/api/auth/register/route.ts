import { NextResponse } from "next/server";

import {
  attachSessionCookie,
  AuthError,
  createUserSession,
  normalizeEmailAddress,
  registerLocalUser,
  validatePassword
} from "@/lib/auth";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as
      | { email?: unknown; password?: unknown }
      | null;

    if (!isRecord(payload)) {
      throw new AuthError("Request body must be a JSON object.", 400);
    }

    const user = await registerLocalUser(
      normalizeEmailAddress(payload.email),
      validatePassword(payload.password)
    );
    const response = NextResponse.json(
      {
        user
      },
      { status: 201 }
    );

    return attachSessionCookie(response, createUserSession(user.id));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "Unexpected server error while registering." },
      { status: 500 }
    );
  }
}
