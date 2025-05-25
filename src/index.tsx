import { Anthropic } from "@anthropic-ai/sdk";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { serve } from "bun";
import { z } from "zod";
import index from "./index.html";
import { appRouter, createContext } from "./server/router";
import { StreamingResponseSchema } from "./types/chat.schema";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_KEY,
});

// Zod schema for chat endpoint
const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
});

const server = serve({
  port: 3000,
  routes: {
    // tRPC endpoint
    "/api/trpc/*": async (req) => {
      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req,
        router: appRouter,
        createContext,
      });
    },

    // Streaming chat endpoint
    "/api/chat": {
      async POST(req) {
        try {
          const body = await req.json();

          // Validate with Zod
          const result = ChatRequestSchema.safeParse(body);
          if (!result.success) {
            return Response.json(
              { error: "Invalid request", details: result.error.issues },
              { status: 400 },
            );
          }

          const { messages } = result.data;

          // Set up SSE headers
          const headers = new Headers({
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          // Create a readable stream for SSE
          const stream = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();

              const enqueue = (
                data: z.infer<typeof StreamingResponseSchema>,
              ) => {
                controller.enqueue(
                  encoder.encode(
                    `${JSON.stringify(StreamingResponseSchema.parse(data))}\n`,
                  ),
                );
              };

              try {
                const stream = anthropic.messages.stream({
                  model: "claude-3-7-sonnet-20250219",
                  max_tokens: 1024,
                  messages,
                });

                let accumulatedContent = "";

                for await (const chunk of stream) {
                  if (
                    chunk.type === "content_block_delta" &&
                    chunk.delta.type === "text_delta"
                  ) {
                    accumulatedContent += chunk.delta.text;
                    // Send the delta as an SSE event
                    enqueue({
                      type: "delta",
                      content: chunk.delta.text,
                    });
                  }
                }

                // Get the final message
                const finalMessage = await stream.finalMessage();

                // Send the complete message as final event
                enqueue({
                  type: "complete",
                  response: finalMessage,
                });
              } catch (error: any) {
                enqueue({
                  type: "error",
                  error: error.message,
                });
              } finally {
                controller.close();
              }
            },
          });

          return new Response(stream, { headers });
        } catch (error) {
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },

    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`Server running at http://localhost:${server.port}`);
