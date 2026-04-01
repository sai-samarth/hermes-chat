import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { AuthError, requireAuthenticatedUser } from "@/lib/auth";
import { getAttachmentDownload } from "@/lib/chat-store";

type RouteContext = {
  params: Promise<{ attachmentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser();
    const { attachmentId } = await context.params;
    const normalizedAttachmentId = attachmentId.trim();

    if (!normalizedAttachmentId) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    const attachment = getAttachmentDownload(user.id, normalizedAttachmentId);

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    const fileBuffer = await readFile(attachment.storagePath);
    const disposition = attachment.kind === "image" ? "inline" : "attachment";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": `${disposition}; filename="${attachment.filename.replace(/"/g, "")}"`,
        "Content-Length": String(fileBuffer.byteLength),
        "Content-Type": attachment.mediaType
      }
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unexpected server error while loading the attachment." },
      { status: 500 }
    );
  }
}
