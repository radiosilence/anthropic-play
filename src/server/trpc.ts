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

const IS_LOGGING = false;

const log = (...args: unknown[]) => {
  IS_LOGGING && console.log(...args);
};

log("🚀 Initializing chat API with dependencies loaded");

const anthropic = new Anthropic({
  apiKey: ENV.ANTHROPIC_KEY,
});

log("🤖 Anthropic client initialized with API key");

// Context type
export function createContext(opts: FetchCreateContextFnOptions) {
  log("📋 Creating tRPC context for request");
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
    log(`⚡ Creating iterable for event: ${eventName}`);
    return on(this as any, eventName, opts) as any;
  }
}

export const ee = new IterableEventEmitter<{
  chunk: [data: z.infer<typeof StreamingResponseSchema>];
  dbg: [data: string];
}>();

log("📡 Event emitter initialized for streaming chunks");

type Context = Awaited<ReturnType<typeof createContext>>;

// Initialize tRPC
const t = initTRPC.context<Context>().create();

log("🔧 tRPC router initialized");

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

log("📝 Zod schemas defined for chat messages");

// Router
export const appRouter = t.router({
  // Health check endpoint
  health: t.procedure.query(() => {
    log("💚 Health check endpoint hit");
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    };
  }),

  debugSend: t.procedure.mutation(async () => {
    const now = new Date().toISOString();
    log(now, "DEBUG send");
    ee.emit("dbg", `DEBUG MESSAGE @ ${now}`);
  }),

  onDebug: t.procedure.subscription(async function* (opts) {
    log("DEBUG 🔔 New subscription to debug created");
    const iterable = ee.toIterable("dbg", {
      signal: opts.signal,
    });
    log("DEBUG 👂 Listening for chunk events");
    for await (const dbg of iterable) {
      log(`DEBUG 📺 Yielding chunk to subscriber: ${dbg}`);
      yield dbg;
    }
    log("DEBUG 👋 Subscription ended");
  }),

  sendMessages: t.procedure.input(ChatRequestSchema).mutation(async (opts) => {
    log("💬 New chat message request received");
    log(`📥 Input messages count: ${opts.input.messages.length}`);

    const sanitizedMessages = sanitizeMessages(opts.input.messages);
    log("🧹 Messages sanitized");

    const validatedMessages = validateConversation(sanitizedMessages);
    log("✅ Messages validated for conversation");

    const stream = anthropic.messages.stream({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 1024,
      messages: validatedMessages,
    });
    log("🌊 Started streaming from Anthropic API");

    const enqueue = (data: z.infer<typeof StreamingResponseSchema>) => {
      try {
        log(`📤 Emitting chunk: ${data.type}`);
        ee.emit("chunk", data);
      } catch (error) {
        console.error("❌ Failed to validate streaming response:", error);
      }
    };

    log("🔄 Starting to process stream chunks");
    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        log(
          `📝 Processing text delta: "${chunk.delta.text.substring(0, 20)}..."`,
        );
        enqueue({
          type: "delta",
          content: chunk.delta.text,
        });
      }
    }

    // Get final message
    log("🏁 Stream completed, getting final message");
    const finalMessage = await stream.finalMessage();
    log(
      `✨ Final message received with ${finalMessage.content.length} content blocks`,
    );
    enqueue({
      type: "complete",
      response: finalMessage,
    });
    log("🎉 Message processing completed");
  }),

  onMessageChunk: t.procedure.subscription(async function* (opts) {
    log("🔔 New subscription to message chunks created");
    const iterable = ee.toIterable("chunk", {
      signal: opts.signal,
    });
    log("👂 Listening for chunk events");
    for await (const chunk of iterable) {
      log(`📺 Yielding chunk to subscriber: ${chunk[0].type}`);
      yield chunk;
    }
    log("👋 Subscription ended");
  }),
});

log("🛠️ App router fully configured and ready");

// Export type router type signature
export type AppRouter = typeof appRouter;
