import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  destroyCurrentSession
} from "@/lib/auth";

export async function POST() {
  try {
    await destroyCurrentSession();

    const response = NextResponse.json({ ok: true });
    return await clearSessionCookie(response);
  } catch {
    const response = NextResponse.json(
      { error: "Unexpected server error while logging out." },
      { status: 500 }
    );

    return await clearSessionCookie(response);
  }
}
