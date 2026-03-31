export const chatMessageRoles = ["system", "user", "assistant"] as const;

export type ChatMessageRole = (typeof chatMessageRoles)[number];

export type ChatMessage = {
  role: ChatMessageRole;
  content: string;
};

export type PersistedChatMessage = ChatMessage & {
  id: string;
  createdAt: string;
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
