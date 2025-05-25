import { type FormEvent, useCallback, useEffect, useRef } from "react";
import { useChat } from "./hooks/useChat";

export function Chat() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    messages,
    isStreaming,
    streamingMessageId,
    sendMessage,
    stopStreaming,
    resetChat,
  } = useChat();

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }, 200);
  }, []);

  // Scroll on initial render
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Scroll when messages change or streaming
  // biome-ignore lint/correctness/useExhaustiveDependencies: It needs to react to these
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessageId, scrollToBottom]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const content = textareaRef.current?.value || "";

    if (content.trim()) {
      await sendMessage(content);
      if (textareaRef.current) {
        textareaRef.current.value = "";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      const form = e.currentTarget.closest("form");
      if (form) {
        form.requestSubmit();
      }
    }
  };

  const handleResetChat = () => {
    if (
      confirm(
        "Are you sure you want to clear all messages? This cannot be undone.",
      )
    ) {
      resetChat();
    }
  };

  return (
    <div className="mt-8 mx-8 text-left flex flex-col gap-4 pb-32">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-[#fbf0df]">Chat</h2>
        <button
          type="button"
          onClick={handleResetChat}
          className="bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors"
        >
          Reset Chat
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-4 pr-2">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`w-full bg-[#1a1a1a] border-2 rounded-xl p-3 text-[#fbf0df] font-mono transition-colors ${
              message.id === streamingMessageId
                ? "animate-pulse border-[#f3d5a3]"
                : "border-[#fbf0df]"
            }`}
          >
            <div className="font-bold mb-2 text-[#f3d5a3]">
              {message.role === "assistant" ? "Claude" : "You"}
            </div>
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="fixed bottom-8 right-8 left-8 flex flex-row items-center gap-2 bg-[#1a1a1a] p-3 rounded-xl font-mono border-2 border-[#fbf0df] transition-colors duration-300 focus-within:border-[#f3d5a3]"
      >
        <textarea
          ref={textareaRef}
          name="content"
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          className="flex-1 bg-transparent border-0 text-[#fbf0df] font-mono text-base py-1.5 px-2 outline-none focus:text-white placeholder-[#fbf0df]/40 disabled:opacity-50"
          placeholder={
            isStreaming
              ? "Claude is responding..."
              : "Message... (Cmd+Enter to send)"
          }
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={stopStreaming}
            className="bg-red-600 text-white border-0 px-5 py-1.5 rounded-lg font-bold transition-all duration-100 hover:bg-red-700 hover:-translate-y-px cursor-pointer whitespace-nowrap"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="bg-[#fbf0df] text-[#1a1a1a] border-0 px-5 py-1.5 rounded-lg font-bold transition-all duration-100 hover:bg-[#f3d5a3] hover:-translate-y-px cursor-pointer whitespace-nowrap"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
