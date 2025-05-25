import { useCallback, useEffect, useState } from "react";
import type { ChatMessage } from "../types/chat.schema";
import { trpc } from "../utils/trpc";

// Simple ID generator
const generateId = () => {
  const id = Date.now().toString(36) + Math.random().toString(36);
  console.log("🆔 Generated new ID:", id);
  return id;
};

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [channelId] = useState(() => {
    const id = crypto.randomUUID();
    console.log("🔑 Created channel ID:", id);
    return id;
  });
  const [error, setError] = useState<string | null>(null);

  // tRPC queries and mutations
  const healthQuery = trpc.health.useQuery(undefined, {
    refetchInterval: 30000, // Check health every 30 seconds
  });

  // Load messages from localStorage on mount
  useEffect(() => {
    console.log("🚀 Loading messages from localStorage...");
    const saved = localStorage.getItem("chat-messages");
    if (saved) {
      try {
        const parsedMessages = JSON.parse(saved);
        console.log(
          "📦 Successfully loaded",
          parsedMessages.length,
          "messages from localStorage",
        );
        setMessages(parsedMessages);
      } catch (e) {
        console.error("❌ Failed to load messages from localStorage:", e);
      }
    } else {
      console.log("📭 No saved messages found in localStorage");
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    console.log("💾 Saving", messages.length, "messages to localStorage");
    localStorage.setItem("chat-messages", JSON.stringify(messages));
  }, [messages]);

  const [accumulatedContent, setAccumulatedContent] = useState<string>("");
  const sendMessages = trpc.sendMessages.useMutation();
  trpc.onMessageChunk.useSubscription(
    { channelId },
    {
      enabled: isStreaming,
      onError: (err) => {
        console.error("❌ Subscription error:", err);
        setError(err.message);
        stopStreaming();
      },
      onData: ([data]) => {
        const assistantMessageId = streamingMessageId;
        console.log(
          "📡 Received chunk data:",
          data.type,
          data.content?.slice(0, 50),
        );
        console.log("🎯 Current streaming message ID:", assistantMessageId);

        switch (data.type) {
          case "delta": {
            console.log("⚡ Processing delta chunk...");
            console.log(
              "📝 Current accumulated content length:",
              accumulatedContent.length,
            );
            console.log(
              "➕ Adding content chunk:",
              `${data.content?.slice(0, 30)}...`,
            );

            const newAccumulated = `${accumulatedContent}${data.content}`;
            setAccumulatedContent(newAccumulated);
            console.log(
              "📊 New accumulated content length:",
              newAccumulated.length,
            );

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: newAccumulated }
                  : msg,
              ),
            );
            console.log("🔄 Updated message content in state");
            break;
          }

          case "complete": {
            console.log("🏁 Stream completed!");
            const textBlocks =
              data.response?.content?.filter(
                (block) => block.type === "text",
              ) || [];
            console.log(
              "📄 Found",
              textBlocks.length,
              "text blocks in response",
            );

            const finalContent =
              textBlocks.length > 0
                ? textBlocks.map((block) => (block as any).text).join("")
                : accumulatedContent;
            console.log("✨ Final content length:", finalContent.length);

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: finalContent }
                  : msg,
              ),
            );
            console.log(
              "🎉 Stream processing complete, setting isStreaming to false",
            );
            stopStreaming();
            break;
          }
          case "error":
            console.error("💥 Received error from stream:", data.error);
            setError(data.error || "Unknown streaming error");
            stopStreaming();
            break;
        }
      },
    },
  );

  const stopStreaming = useCallback(() => {
    console.log("🛑 Stopping stream...");
    setIsStreaming(false);
    setStreamingMessageId(null);
    setAccumulatedContent("");
    console.log("✅ Stream stopped successfully");
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      console.log(
        "💬 Attempting to send message:",
        `${content.slice(0, 50)}...`,
      );

      if (!content.trim()) {
        console.warn("⚠️ Message content is empty, aborting send");
        return;
      }

      if (isStreaming) {
        console.warn("⚠️ Already streaming, aborting new message send");
        return;
      }

      console.log("👤 Creating user message...");
      // Create user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };
      console.log("📝 User message created:", userMessage.id);

      // Prepare messages for API (before updating state)
      const apiMessages = [...messages, userMessage]
        .filter((msg) => msg.content && msg.content.trim().length > 0)
        .map((msg) => ({
          role: msg.role,
          content: msg.content.trim(),
        }));
      console.log("📤 Prepared", apiMessages.length, "messages for API");

      // Create assistant message placeholder
      const assistantMessageId = generateId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      console.log(
        "🤖 Assistant message placeholder created:",
        assistantMessageId,
      );

      // Update messages
      console.log("🔄 Updating messages state...");
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);
      setStreamingMessageId(assistantMessageId);
      setAccumulatedContent("");
      console.log("🌊 Streaming started for message:", assistantMessageId);

      try {
        console.log(
          "🌐 Sending POST request to /trpc with channel:",
          channelId,
        );
        const response = await sendMessages.mutateAsync({
          messages: apiMessages,
          channelId,
        });
        console.log("📡 Received response from /trpc:", response);
      } catch (err) {
        console.error("❌ Failed to send messages:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        // Remove the assistant placeholder message
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== assistantMessageId),
        );
        setIsStreaming(false);
        setStreamingMessageId(null);
      }
    },
    [messages, isStreaming, sendMessages.mutateAsync, channelId],
  );

  const resetChat = useCallback(() => {
    console.log("🔄 Resetting chat...");

    if (isStreaming) {
      console.log("🛑 Stopping active stream before reset");
      stopStreaming();
    }

    console.log("🗑️ Clearing messages state");
    setMessages([]);
    setError(null);

    console.log("🧹 Removing messages from localStorage");
    localStorage.removeItem("chat-messages");

    console.log("✨ Chat reset complete");
  }, [isStreaming, stopStreaming]);

  // Log health status changes
  useEffect(() => {
    const isHealthy = healthQuery.data?.status === "ok";
    if (healthQuery.data) {
      console.log(
        isHealthy ? "💚 Health check: OK" : "❤️ Health check: NOT OK",
        healthQuery.data,
      );
    }
  }, [healthQuery.data]);

  return {
    messages,
    isStreaming,
    streamingMessageId,
    sendMessage,
    stopStreaming,
    resetChat,
    isHealthy: healthQuery.data?.status === "ok",
    error,
    channelId,
  };
}
