import { Anthropic } from "@anthropic-ai/sdk";
import { z } from "zod";
import { StreamingResponseSchema } from "../types/chat.schema";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_KEY,
});

// Validation schema for chat requests
export const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
});

// Message sanitization function
function sanitizeMessages(messages: { role: string; content: string }[]) {
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
function validateConversation(
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

export async function handleChatRequest(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    // Validate request structure
    const parseResult = ChatRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return Response.json(
        {
          error: "Invalid request format",
          details: parseResult.error.issues,
        },
        { status: 400 },
      );
    }

    // Sanitize and validate messages
    const sanitizedMessages = sanitizeMessages(parseResult.data.messages);
    const validatedMessages = validateConversation(sanitizedMessages);

    // Check API key
    if (!process.env.ANTHROPIC_KEY) {
      return Response.json(
        { error: "Anthropic API key not configured" },
        { status: 500 },
      );
    }

    // Set up streaming headers
    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    });

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const enqueue = (data: z.infer<typeof StreamingResponseSchema>) => {
          try {
            const validated = StreamingResponseSchema.parse(data);
            controller.enqueue(
              encoder.encode(`${JSON.stringify(validated)}\n`),
            );
          } catch (error) {
            console.error("Failed to validate streaming response:", error);
          }
        };

        try {
          const stream = anthropic.messages.stream({
            model: "claude-3-7-sonnet-20250219",
            max_tokens: 1024,
            messages: validatedMessages,
          });

          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              enqueue({
                type: "delta",
                content: chunk.delta.text,
              });
            }
          }

          // Get final message
          const finalMessage = await stream.finalMessage();
          enqueue({
            type: "complete",
            response: finalMessage,
          });
        } catch (error: any) {
          console.error("Anthropic API error:", error);
          enqueue({
            type: "error",
            error: error.message || "Failed to generate response",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers });
  } catch (error: any) {
    console.error("Chat handler error:", error);
    return Response.json(
      {
        error: "Internal server error",
        message: error.message,
      },
      { status: 500 },
    );
  }
}
