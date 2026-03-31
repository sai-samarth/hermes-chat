import { NextResponse } from "next/server";

import { clearSessionCookie, getSessionContext } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSessionContext();
    const response = NextResponse.json({
      authenticated: Boolean(session.user),
      user: session.user
    });

    if (!session.user && session.hasSessionCookie) {
      return clearSessionCookie(response);
    }

    return response;
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error while loading the session." },
      { status: 500 }
    );
  }
}
