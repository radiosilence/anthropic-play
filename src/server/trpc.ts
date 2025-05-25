import EventEmitter, { on } from "events";
import { ENV } from "@/env";
import {
  ChatRequestSchema,
  type StreamingResponseSchema,
} from "@/types/chat.schema";
import { Anthropic } from "@anthropic-ai/sdk";
import { initTRPC } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { z } from "zod";
import { sanitizeMessages, validateConversation } from "./chat";

console.log("🚀 Initializing chat API with dependencies loaded");

const anthropic = new Anthropic({
  apiKey: ENV.ANTHROPIC_KEY,
});

console.log("🤖 Anthropic client initialized with API key");

// Context type
export function createContext(opts: FetchCreateContextFnOptions) {
  console.log("📋 Creating tRPC context for request");
  return {
    req: opts.req,
  };
}

type EventMap<T, E> = Record<keyof T, E[]>;
class IterableEventEmitter<
  T extends EventMap<T, unknown>,
> extends EventEmitter<T> {
  toIterable<TEventName extends keyof T & string>(
    eventName: TEventName,
    opts?: NonNullable<Parameters<typeof on>[2]>,
  ): AsyncIterable<T[TEventName]> {
    console.log(`⚡ Creating iterable for event: ${eventName}`);
    return on(this as any, eventName, opts) as any;
  }
}

export const ee = new IterableEventEmitter<{
  chunk: [data: z.infer<typeof StreamingResponseSchema>];
}>();

console.log("📡 Event emitter initialized for streaming chunks");

type Context = Awaited<ReturnType<typeof createContext>>;

// Initialize tRPC
const t = initTRPC.context<Context>().create();

console.log("🔧 tRPC router initialized");

// Zod schemas
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.number().optional(),
});

export const SavedChatSchema = z.object({
  messages: z.array(ChatMessageSchema),
  lastUpdated: z.string(),
});

console.log("📝 Zod schemas defined for chat messages");

// Router
export const appRouter = t.router({
  // Health check endpoint
  health: t.procedure.query(() => {
    console.log("💚 Health check endpoint hit");
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    };
  }),

  sendMessages: t.procedure.input(ChatRequestSchema).mutation(async (opts) => {
    console.log("💬 New chat message request received");
    console.log(`📥 Input messages count: ${opts.input.messages.length}`);

    const sanitizedMessages = sanitizeMessages(opts.input.messages);
    console.log("🧹 Messages sanitized");

    const validatedMessages = validateConversation(sanitizedMessages);
    console.log("✅ Messages validated for conversation");

    const stream = anthropic.messages.stream({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 1024,
      messages: validatedMessages,
    });
    console.log("🌊 Started streaming from Anthropic API");

    const enqueue = (data: z.infer<typeof StreamingResponseSchema>) => {
      try {
        console.log(`📤 Emitting chunk: ${data.type}`);
        ee.emit("chunk", data);
      } catch (error) {
        console.error("❌ Failed to validate streaming response:", error);
      }
    };

    console.log("🔄 Starting to process stream chunks");
    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        console.log(
          `📝 Processing text delta: "${chunk.delta.text.substring(0, 20)}..."`,
        );
        enqueue({
          type: "delta",
          content: chunk.delta.text,
        });
      }
    }

    // Get final message
    console.log("🏁 Stream completed, getting final message");
    const finalMessage = await stream.finalMessage();
    console.log(
      `✨ Final message received with ${finalMessage.content.length} content blocks`,
    );
    enqueue({
      type: "complete",
      response: finalMessage,
    });
    console.log("🎉 Message processing completed");
  }),

  onMessageChunk: t.procedure.subscription(async function* (opts) {
    console.log("🔔 New subscription to message chunks created");
    const iterable = ee.toIterable("chunk", {
      signal: opts.signal,
    });
    console.log("👂 Listening for chunk events");
    for await (const chunk of iterable) {
      console.log(`📺 Yielding chunk to subscriber: ${chunk[0].type}`);
      yield chunk;
    }
    console.log("👋 Subscription ended");
  }),
});

console.log("🛠️ App router fully configured and ready");

// Export type router type signature
export type AppRouter = typeof appRouter;
