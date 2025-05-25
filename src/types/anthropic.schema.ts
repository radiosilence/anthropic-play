import { z } from "zod";

// Content Block schemas
export const TextBlockSchema = z.object({
  text: z.string(),
  type: z.literal("text"),
  citations: z
    .array(
      z.union([
        z.object({
          cited_text: z.string(),
          document_index: z.number(),
          document_title: z.string().nullable().optional(),
          end_char_index: z.number(),
          start_char_index: z.number(),
          type: z.literal("char_location"),
        }),
        z.object({
          cited_text: z.string(),
          document_index: z.number(),
          document_title: z.string().nullable().optional(),
          end_page_number: z.number(),
          start_page_number: z.number(),
          type: z.literal("page_location"),
        }),
        z.object({
          cited_text: z.string(),
          document_index: z.number(),
          document_title: z.string().nullable().optional(),
          end_block_index: z.number(),
          start_block_index: z.number(),
          type: z.literal("content_block_location"),
        }),
        z.object({
          cited_text: z.string(),
          encrypted_index: z.string(),
          title: z.string().nullable().optional(),
          type: z.literal("web_search_result_location"),
          url: z.string(),
        }),
      ]),
    )
    .nullable()
    .optional(),
});

export const ToolUseBlockSchema = z.object({
  id: z.string(),
  input: z.unknown(),
  name: z.string(),
  type: z.literal("tool_use"),
});

export const ServerToolUseBlockSchema = z.object({
  id: z.string(),
  input: z.unknown(),
  name: z.literal("web_search"),
  type: z.literal("server_tool_use"),
});

export const WebSearchToolResultBlockSchema = z.object({
  content: z.union([
    z.object({
      error_code: z.enum([
        "invalid_tool_input",
        "unavailable",
        "max_uses_exceeded",
        "too_many_requests",
        "query_too_long",
      ]),
      type: z.literal("web_search_tool_result_error"),
    }),
    z.array(
      z.object({
        encrypted_content: z.string(),
        page_age: z.string().nullable().optional(),
        title: z.string(),
        type: z.literal("web_search_result"),
        url: z.string(),
      }),
    ),
  ]),
  tool_use_id: z.string(),
  type: z.literal("web_search_tool_result"),
});

export const ThinkingBlockSchema = z.object({
  signature: z.string(),
  thinking: z.string(),
  type: z.literal("thinking"),
});

export const RedactedThinkingBlockSchema = z.object({
  data: z.string(),
  type: z.literal("redacted_thinking"),
});

export const ContentBlockSchema = z.union([
  TextBlockSchema,
  ToolUseBlockSchema,
  ServerToolUseBlockSchema,
  WebSearchToolResultBlockSchema,
  ThinkingBlockSchema,
  RedactedThinkingBlockSchema,
]);

export const ModelSchema = z.union([
  z.literal("claude-3-7-sonnet-latest"),
  z.literal("claude-3-7-sonnet-20250219"),
  z.literal("claude-3-5-haiku-latest"),
  z.literal("claude-3-5-haiku-20241022"),
  z.literal("claude-sonnet-4-20250514"),
  z.literal("claude-sonnet-4-0"),
  z.literal("claude-4-sonnet-20250514"),
  z.literal("claude-3-5-sonnet-latest"),
  z.literal("claude-3-5-sonnet-20241022"),
  z.literal("claude-3-5-sonnet-20240620"),
  z.literal("claude-opus-4-0"),
  z.literal("claude-opus-4-20250514"),
  z.literal("claude-4-opus-20250514"),
  z.literal("claude-3-opus-latest"),
  z.literal("claude-3-opus-20240229"),
  z.literal("claude-3-sonnet-20240229"),
  z.literal("claude-3-haiku-20240307"),
  z.literal("claude-2.1"),
  z.literal("claude-2.0"),
  z.string(),
]);

export const StopReasonSchema = z.enum([
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "pause_turn",
  "refusal",
]);

export const ServerToolUsageSchema = z.object({
  web_search_requests: z.number(),
});

export const UsageSchema = z.object({
  cache_creation_input_tokens: z.number().nullable().optional(),
  cache_read_input_tokens: z.number().nullable().optional(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  server_tool_use: ServerToolUsageSchema.nullable().optional(),
  service_tier: z.enum(["standard", "priority", "batch"]).nullable().optional(),
});

export const MessageSchema = z.object({
  id: z.string(),
  content: z.array(ContentBlockSchema),
  model: ModelSchema,
  role: z.literal("assistant"),
  stop_reason: StopReasonSchema.nullable().optional(),
  stop_sequence: z.string().nullable().optional(),
  type: z.literal("message"),
  usage: UsageSchema,
});
