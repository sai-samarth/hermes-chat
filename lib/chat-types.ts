import type { ChatAttachmentKind } from "@/lib/attachment-types";

export const chatMessageRoles = ["system", "user", "assistant"] as const;

export type ChatMessageRole = (typeof chatMessageRoles)[number];

export type ChatAttachment = {
  filename: string;
  id: string;
  kind: ChatAttachmentKind;
  mediaType: string;
  sizeBytes: number;
  url: string;
};

export type ChatMessage = {
  role: ChatMessageRole;
  content: string;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: "pending" | "complete" | "error";
  startedAt: string;
  completedAt?: string;
};

export type PersistedChatMessage = ChatMessage & {
  attachments: ChatAttachment[];
  createdAt: string;
  id: string;
  toolCalls?: ToolCall[];
};

export type ChatSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string | null;
  messageCount: number;
};

export type ChatDetail = {
  chat: ChatSummary;
  messages: PersistedChatMessage[];
};
