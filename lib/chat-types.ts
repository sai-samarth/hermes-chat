export const chatMessageRoles = ["system", "user", "assistant"] as const;

export type ChatMessageRole = (typeof chatMessageRoles)[number];

export type ChatMessage = {
  role: ChatMessageRole;
  content: string;
};
