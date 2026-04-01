export const supportedImageExtensions = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif"
] as const;

export const supportedStructuredDocumentExtensions = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx"
] as const;

export const supportedTextDocumentExtensions = [
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".log",
  ".py",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".html",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".sh",
  ".sql"
] as const;

export const supportedAttachmentExtensions = [
  ...supportedImageExtensions,
  ...supportedStructuredDocumentExtensions,
  ...supportedTextDocumentExtensions
] as const;

export type SupportedAttachmentExtension =
  (typeof supportedAttachmentExtensions)[number];

export type ChatAttachmentKind = "image" | "document";

export const composerFileAccept = supportedAttachmentExtensions.join(",");

export const maxAttachmentsPerMessage = 5;
export const maxAttachmentSizeBytes = 15 * 1024 * 1024;
