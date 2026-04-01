import "server-only";

import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  maxAttachmentSizeBytes,
  maxAttachmentsPerMessage,
  supportedImageExtensions,
  supportedStructuredDocumentExtensions,
  supportedTextDocumentExtensions,
  type ChatAttachmentKind,
  type SupportedAttachmentExtension
} from "@/lib/attachment-types";

const structuredDocumentMimeTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};

const textDocumentMimeTypes: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".log": "text/plain",
  ".py": "text/x-python",
  ".ts": "text/typescript",
  ".tsx": "text/tsx",
  ".js": "text/javascript",
  ".jsx": "text/jsx",
  ".css": "text/css",
  ".html": "text/html",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".toml": "application/toml",
  ".ini": "text/plain",
  ".sh": "text/x-shellscript",
  ".sql": "application/sql"
};

const imageMimeTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

const execFile = promisify(execFileCallback);

const supportedExtensionSet = new Set<string>([
  ...supportedImageExtensions,
  ...supportedStructuredDocumentExtensions,
  ...supportedTextDocumentExtensions
]);
const imageExtensionSet = new Set<string>(supportedImageExtensions);
const textDocumentExtensionSet = new Set<string>(supportedTextDocumentExtensions);
const MAX_EMBEDDED_TEXT_CHARS_PER_FILE = 20_000;
const MAX_EMBEDDED_TEXT_CHARS_TOTAL = 40_000;

export type StoredAttachmentInput = {
  filename: string;
  kind: ChatAttachmentKind;
  mediaType: string;
  sizeBytes: number;
  storagePath: string;
};

export type PreparedMessageAttachments = {
  attachments: StoredAttachmentInput[];
  hermesContent: string;
  visibleContent: string;
};

type ExtractedAttachmentText = {
  text: string | null;
  truncated: boolean;
};

type PreparedAttachment = StoredAttachmentInput & {
  extractedText: string | null;
  truncated: boolean;
};

export class AttachmentError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AttachmentError";
    this.status = status;
  }
}

function sanitizeFilename(filename: string) {
  const trimmed = filename.trim().replace(/\s+/g, " ");
  const basename = path.basename(trimmed || "attachment");
  const safe = basename.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180);
  return safe || "attachment";
}

function getExtension(filename: string) {
  return path.extname(filename).toLowerCase();
}

function inferMediaType(extension: SupportedAttachmentExtension) {
  return (
    imageMimeTypes[extension] ||
    structuredDocumentMimeTypes[extension] ||
    textDocumentMimeTypes[extension] ||
    "application/octet-stream"
  );
}

function classifyAttachmentKind(extension: SupportedAttachmentExtension): ChatAttachmentKind {
  return imageExtensionSet.has(extension) ? "image" : "document";
}

function isTextLikeExtension(extension: SupportedAttachmentExtension) {
  return textDocumentExtensionSet.has(extension);
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeExtractedText(value: string) {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
}

function truncateText(value: string, limit: number): ExtractedAttachmentText {
  if (value.length <= limit) {
    return {
      text: value,
      truncated: false
    };
  }

  return {
    text: `${value.slice(0, limit).trimEnd()}\n\n[Truncated for chat context]`,
    truncated: true
  };
}

async function extractPdfText(pdfPath: string) {
  const scriptPath = path.join(process.cwd(), "scripts", "extract-pdf.mjs");
  const { stdout } = await execFile(process.execPath, [scriptPath, pdfPath], {
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000
  });
  return normalizeExtractedText(stdout || "");
}

async function extractDocxText(buffer: Buffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return normalizeExtractedText(result.value || "");
}

async function extractXlsxText(buffer: Buffer) {
  const xlsx = await import("xlsx");
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const parts = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
    return csv ? `# Sheet: ${sheetName}\n${csv}` : `# Sheet: ${sheetName}`;
  });
  return normalizeExtractedText(parts.join("\n\n"));
}

async function extractPptxText(buffer: Buffer) {
  const jszipModule = await import("jszip");
  const JSZip = jszipModule.default;
  const archive = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(archive.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  const slideTexts: string[] = [];

  for (const slideName of slideNames) {
    const file = archive.file(slideName);

    if (!file) {
      continue;
    }

    const xml = await file.async("text");
    const matches = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) =>
      decodeXmlEntities(match[1] ?? "")
    );
    const slideText = normalizeExtractedText(matches.join(" "));

    if (slideText) {
      const slideNumber = slideTexts.length + 1;
      slideTexts.push(`# Slide ${slideNumber}\n${slideText}`);
    }
  }

  return normalizeExtractedText(slideTexts.join("\n\n"));
}

async function extractAttachmentText(
  buffer: Buffer,
  extension: SupportedAttachmentExtension,
  storagePath: string
): Promise<ExtractedAttachmentText> {
  if (imageExtensionSet.has(extension)) {
    return {
      text: null,
      truncated: false
    };
  }

  let extracted = "";

  if (isTextLikeExtension(extension)) {
    extracted = normalizeExtractedText(buffer.toString("utf8"));
  } else if (extension === ".pdf") {
    extracted = await extractPdfText(storagePath);
  } else if (extension === ".docx") {
    extracted = await extractDocxText(buffer);
  } else if (extension === ".xlsx") {
    extracted = await extractXlsxText(buffer);
  } else if (extension === ".pptx") {
    extracted = await extractPptxText(buffer);
  }

  if (!extracted) {
    return {
      text: null,
      truncated: false
    };
  }

  return truncateText(extracted, MAX_EMBEDDED_TEXT_CHARS_PER_FILE);
}

function buildAttachmentOnlyLabel(attachments: StoredAttachmentInput[]) {
  if (attachments.length === 1) {
    return `Attached: ${attachments[0]?.filename ?? "file"}`;
  }

  return `Attached ${attachments.length} files`;
}

function buildHermesAttachmentSection(attachments: PreparedAttachment[]) {
  const lines = [
    `[The user attached ${attachments.length} ${attachments.length === 1 ? "file" : "files"}:]`
  ];
  let remainingTextBudget = MAX_EMBEDDED_TEXT_CHARS_TOTAL;

  attachments.forEach((attachment, index) => {
    lines.push(
      `${index + 1}. ${attachment.filename} (${attachment.mediaType}, ${attachment.sizeBytes} bytes)`
    );
    lines.push(`   Saved at: ${attachment.storagePath}`);

    if (attachment.kind === "image") {
      lines.push(
        `   This is an image. If the user asks about its contents, inspect it with vision_analyze using image_url: ${attachment.storagePath}`
      );
      return;
    }

    if (attachment.extractedText) {
      const clipped = truncateText(
        attachment.extractedText,
        Math.max(0, remainingTextBudget)
      );

      if (clipped.text) {
        lines.push("   Extracted text:");
        lines.push("   ---");
        lines.push(
          clipped.text
            .split("\n")
            .map((line) => `   ${line}`)
            .join("\n")
        );
        lines.push("   ---");
        remainingTextBudget = Math.max(0, remainingTextBudget - clipped.text.length);
        return;
      }
    }

    lines.push(
      "   No text could be extracted automatically. You can still work from the saved file path if needed."
    );
  });

  return lines.join("\n");
}

function buildHermesContent(content: string, attachments: PreparedAttachment[]) {
  if (attachments.length === 0) {
    return content;
  }

  const attachmentSection = buildHermesAttachmentSection(attachments);

  if (!content) {
    return `${attachmentSection}\n\nPlease help with the attached file${attachments.length === 1 ? "" : "s"}.`;
  }

  return `${attachmentSection}\n\nUser message:\n${content}`;
}

async function saveAttachmentFile(
  buffer: Buffer,
  userId: string,
  chatId: string,
  filename: string
) {
  const storageDir = path.join(process.cwd(), "data", "attachments", userId, chatId);
  await mkdir(storageDir, { recursive: true });
  const storagePath = path.join(storageDir, `${randomUUID()}_${filename}`);
  await writeFile(storagePath, buffer);
  return storagePath;
}

export async function prepareMessageAttachments(input: {
  chatId: string;
  content: string;
  files: File[];
  userId: string;
}): Promise<PreparedMessageAttachments> {
  const files = input.files.filter((file) => file.size > 0);

  if (files.length === 0) {
    return {
      attachments: [],
      hermesContent: input.content,
      visibleContent: input.content
    };
  }

  if (files.length > maxAttachmentsPerMessage) {
    throw new AttachmentError(
      `You can attach up to ${maxAttachmentsPerMessage} files per message.`,
      400
    );
  }

  const preparedAttachments: PreparedAttachment[] = [];

  for (const file of files) {
    if (file.size > maxAttachmentSizeBytes) {
      throw new AttachmentError(
        `${file.name} exceeds the ${(maxAttachmentSizeBytes / (1024 * 1024)).toFixed(0)} MB limit.`,
        400
      );
    }

    const filename = sanitizeFilename(file.name);
    const extension = getExtension(filename);

    if (!supportedExtensionSet.has(extension)) {
      throw new AttachmentError(
        `${filename} is not supported in Hermes Chat yet.`,
        400
      );
    }

    const typedExtension = extension as SupportedAttachmentExtension;
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = await saveAttachmentFile(buffer, input.userId, input.chatId, filename);
    const extraction = await extractAttachmentText(buffer, typedExtension, storagePath);

    const normalizedFileType = file.type.trim().toLowerCase();
    const mediaType =
      !normalizedFileType || normalizedFileType === "application/octet-stream"
        ? inferMediaType(typedExtension)
        : normalizedFileType;

    preparedAttachments.push({
      filename,
      kind: classifyAttachmentKind(typedExtension),
      mediaType,
      sizeBytes: file.size,
      storagePath,
      extractedText: extraction.text,
      truncated: extraction.truncated
    });
  }

  const visibleContent = input.content || buildAttachmentOnlyLabel(preparedAttachments);

  return {
    attachments: preparedAttachments.map((attachment) => ({
      filename: attachment.filename,
      kind: attachment.kind,
      mediaType: attachment.mediaType,
      sizeBytes: attachment.sizeBytes,
      storagePath: attachment.storagePath
    })),
    hermesContent: buildHermesContent(input.content, preparedAttachments),
    visibleContent
  };
}
