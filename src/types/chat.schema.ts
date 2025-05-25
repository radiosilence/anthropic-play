import { z } from "zod";
import { MessageSchema } from "./anthropic.schema";

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.number().optional(),
});

export const StreamingResponseSchema = z.object({
  type: z.enum(["delta", "complete", "error"]),
  content: z.string().optional(),
  response: MessageSchema.optional(),
  error: z.string().optional(),
});

export const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  channelId: z.string().optional(),
});

// Export TypeScript types
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type StreamingResponse = z.infer<typeof StreamingResponseSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
