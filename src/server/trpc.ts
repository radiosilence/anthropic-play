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
import {
  getActiveRequests,
  getCompletedRequests,
  getRequestMetrics,
} from "./middleware/logging";

const IS_LOGGING = true;

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

// Map to store channel-specific event emitters
const channelEmitters = new Map<
  string,
  IterableEventEmitter<{
    chunk: [data: z.infer<typeof StreamingResponseSchema>];
    error: [error: Error];
  }>
>();

// Cleanup function to remove unused channels
const cleanupChannel = (channelId: string) => {
  log(`🧹 Cleaning up channel: ${channelId}`);
  const emitter = channelEmitters.get(channelId);
  if (emitter) {
    emitter.removeAllListeners();
    channelEmitters.delete(channelId);
  }
};

// Get or create channel-specific emitter
const getChannelEmitter = (channelId: string) => {
  if (!channelEmitters.has(channelId)) {
    log(`📺 Creating new channel emitter for: ${channelId}`);
    channelEmitters.set(channelId, new IterableEventEmitter());
  }
  return channelEmitters.get(channelId)!;
};

log("📡 Event emitter initialized for streaming chunks");

export type Context = Awaited<ReturnType<typeof createContext>>;

// Initialize tRPC with middleware
const t = initTRPC.context<Context>().create();

// Create procedures without middleware for now
const publicProcedure = t.procedure;

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
  health: publicProcedure.query(() => {
    log("💚 Health check endpoint hit");
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      activeChannels: channelEmitters.size,
    };
  }),

  sendMessages: publicProcedure
    .input(ChatRequestSchema)
    .mutation(async (opts) => {
      const channelId = opts.input.channelId || crypto.randomUUID();
      log(`💬 New chat message request received on channel: ${channelId}`);
      log(`📥 Input messages count: ${opts.input.messages.length}`);

      const channelEmitter = getChannelEmitter(channelId);

      try {
        const sanitizedMessages = sanitizeMessages(opts.input.messages);
        log("🧹 Messages sanitized");

        const validatedMessages = validateConversation(sanitizedMessages);
        log("✅ Messages validated for conversation");

        const stream = anthropic.messages.stream({
          model: "claude-3-7-sonnet-20250219",
          max_tokens: 1024,
          messages: validatedMessages,
        });
        log(
          `🌊 Started streaming from Anthropic API for channel: ${channelId}`,
        );

        const enqueue = (data: z.infer<typeof StreamingResponseSchema>) => {
          try {
            log(`📤 Emitting chunk on channel ${channelId}: ${data.type}`);
            channelEmitter.emit("chunk", data);
          } catch (error) {
            console.error("❌ Failed to validate streaming response:", error);
            channelEmitter.emit("error", error as Error);
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

        // Schedule cleanup after a delay
        setTimeout(() => cleanupChannel(channelId), 60000); // 1 minute

        log(`🎉 Message processing completed for channel: ${channelId}`);
        return { channelId };
      } catch (error) {
        log(`❌ Error processing messages for channel ${channelId}:`, error);
        channelEmitter.emit("error", error as Error);
        cleanupChannel(channelId);
        throw error;
      }
    }),

  onMessageChunk: publicProcedure
    .input(z.object({ channelId: z.string() }))
    .subscription(async function* (opts) {
      const { channelId } = opts.input;
      log(
        `🔔 New subscription to message chunks created for channel: ${channelId}`,
      );

      const channelEmitter = getChannelEmitter(channelId);
      const iterable = channelEmitter.toIterable("chunk", {
        signal: opts.signal,
      });

      // Also listen for errors
      const errorIterable = channelEmitter.toIterable("error", {
        signal: opts.signal,
      });

      // Set up error handling
      const errorPromise = (async () => {
        for await (const [error] of errorIterable) {
          throw error;
        }
      })();

      try {
        log(`👂 Listening for chunk events on channel: ${channelId}`);
        for await (const chunk of iterable) {
          log(
            `📺 Yielding chunk to subscriber on channel ${channelId}: ${chunk[0].type}`,
          );
          yield chunk;
        }
      } catch (error) {
        log(`❌ Error in subscription for channel ${channelId}:`, error);
        throw error;
      } finally {
        log(`👋 Subscription ended for channel: ${channelId}`);
        // Don't cleanup immediately - let ongoing streams finish
      }
    }),

  // Metrics endpoint
  metrics: publicProcedure.query(() => {
    log("📊 Fetching request metrics");
    return {
      ...getRequestMetrics(),
      activeChannels: channelEmitters.size,
      systemInfo: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        nodeVersion: process.version,
      },
    };
  }),

  // Get active requests
  activeRequests: publicProcedure.query(() => {
    return getActiveRequests();
  }),

  // Get recent completed requests
  recentRequests: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(1000).default(100) }))
    .query(({ input }) => {
      return getCompletedRequests(input.limit);
    }),
});

log("🛠️ App router fully configured and ready");

// Export type router type signature
export type AppRouter = typeof appRouter;
