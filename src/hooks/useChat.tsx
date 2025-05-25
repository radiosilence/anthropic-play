import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ChatMessage,
  StreamingResponseSchema,
} from "../types/chat.schema";
import { trpc } from "../utils/trpc";

interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  resetChat: () => void;
  saveCurrentChat: () => Promise<void>;
  isHealthy: boolean;
}

// Simple ID generator
const generateId = () => Date.now().toString(36) + Math.random().toString(36);

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  // tRPC queries and mutations
  const healthQuery = trpc.health.useQuery(undefined, {
    refetchInterval: 30000, // Check health every 30 seconds
  });
  const saveChat = trpc.saveChat.useMutation();

  // Load messages from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("chat-messages");
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load messages from localStorage:", e);
      }
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("chat-messages", JSON.stringify(messages));
  }, [messages]);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setStreamingMessageId(null);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      // Create user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      // Prepare messages for API (before updating state)
      const apiMessages = [...messages, userMessage]
        .filter((msg) => msg.content && msg.content.trim().length > 0)
        .map((msg) => ({
          role: msg.role,
          content: msg.content.trim(),
        }));

      // Create assistant message placeholder
      const assistantMessageId = generateId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      // Update messages
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);
      setStreamingMessageId(assistantMessageId);

      // Create abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        console.log("🚀 Sending chat request with messages:", apiMessages);

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abortController.signal,
        });

        console.log(
          "📡 Received response:",
          response.status,
          response.statusText,
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        let accumulatedContent = "";
        console.log("🌊 Starting to read stream...");

        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                console.log("✅ Stream reading completed");
                break;
              }

              const chunk = decoder.decode(value);
              console.log("📦 Received chunk:", chunk);
              const lines = chunk.split("\n");

              for (const line of lines) {
                if (!line.trim()) continue;
                console.log("🔍 Parsing line:", line);

                const { data, error } = StreamingResponseSchema.safeParse(
                  JSON.parse(line),
                );
                if (!data || error) {
                  console.log("❌ Failed to parse line:", error?.issues);
                  continue;
                }
                console.log(
                  "✅ Parsed data:",
                  data.type,
                  data.content?.slice(0, 50),
                );

                if (data.type === "delta") {
                  accumulatedContent += data.content;
                  console.log(
                    "📝 Accumulated content length:",
                    accumulatedContent.length,
                  );
                  // Update the assistant message
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: accumulatedContent }
                        : msg,
                    ),
                  );
                } else if (data.type === "complete") {
                  console.log("🏁 Received complete response");
                  // Update with final content
                  const textBlocks =
                    data.response?.content?.filter(
                      (block) => block.type === "text",
                    ) || [];
                  const finalContent =
                    textBlocks.length > 0
                      ? textBlocks.map((block) => (block as any).text).join("")
                      : accumulatedContent;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: finalContent }
                        : msg,
                    ),
                  );
                } else if (data.type === "error") {
                  console.error("💥 Received error from stream:", data.error);
                  throw new Error(data.error);
                }
              }
            }
          } catch (error) {
            console.error("🚨 Stream reading error:", error);
            if (error instanceof Error && error.name === "AbortError") {
              console.log("🛑 User cancelled request");
              // User cancelled - remove the empty assistant message
              setMessages((prev) =>
                prev.filter((msg) => msg.id !== assistantMessageId),
              );
            } else {
              throw error;
            }
          } finally {
            console.log("🔒 Releasing reader lock");
            reader.releaseLock();
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Chat error:", error);
          // Update assistant message with error
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: `Error: ${error.message}` }
                : msg,
            ),
          );
        }
      } finally {
        abortControllerRef.current = null;
        setIsStreaming(false);
        setStreamingMessageId(null);
      }
    },
    [messages, isStreaming],
  );

  const resetChat = useCallback(() => {
    if (isStreaming) {
      stopStreaming();
    }
    setMessages([]);
    localStorage.removeItem("chat-messages");
  }, [isStreaming, stopStreaming]);

  const saveCurrentChat = useCallback(async () => {
    if (messages.length === 0) return;

    try {
      const sessionId = generateId();
      await saveChat.mutateAsync({
        sessionId,
        messages,
      });
      console.log("Chat saved with session ID:", sessionId);
    } catch (error) {
      console.error("Failed to save chat:", error);
    }
  }, [messages, saveChat]);

  return {
    messages,
    isStreaming,
    streamingMessageId,
    sendMessage,
    stopStreaming,
    resetChat,
    saveCurrentChat,
    isHealthy: healthQuery.data?.status === "ok",
  };
}
