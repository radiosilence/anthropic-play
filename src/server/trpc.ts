import EventEmitter, { on } from "events";
import { ENV } from "@/env";
import {
  ChatRequestSchema,
  type StreamingResponseSchema,
} from "@/types/chat.schema";
import { Anthropic } from "@anthropic-ai/sdk";
import { initTRPC } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { z } from "zod";

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

// Message sanitization function
export function sanitizeMessages(
  messages: { role: string; content: string }[],
) {
  return messages
    .filter((msg) => {
      // Remove messages with empty or whitespace-only content
      const content = msg.content?.trim();
      return content && content.length > 0;
    })
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content.trim(),
    }))
    .filter((msg, index, arr) => {
      // Remove consecutive messages from the same role (keep the last one)
      if (index === arr.length - 1) return true;
      return msg.role !== arr[index + 1].role;
    });
}

// Additional validation for conversation flow
export function validateConversation(
  messages: { role: "user" | "assistant"; content: string }[],
) {
  if (messages.length === 0) {
    throw new Error("No valid messages found");
  }

  // Check that the last message is from the user
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== "user") {
    throw new Error("Conversation must end with a user message");
  }

  // Check for reasonable message lengths
  for (const msg of messages) {
    if (msg.content.length > 10000) {
      throw new Error("Message too long (max 10,000 characters)");
    }
  }

  // Check for reasonable conversation length
  if (messages.length > 100) {
    throw new Error("Conversation too long (max 100 messages)");
  }

  return messages;
}

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
