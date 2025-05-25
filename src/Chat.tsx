import type { Message } from "@anthropic-ai/sdk/resources";
import {
	useRef,
	useState,
	useEffect,
	type FormEvent,
	useCallback,
} from "react";

// Simple ID generator for browser compatibility
const generateId = () => Date.now().toString(36) + Math.random().toString(36);

export function Chat() {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const chatContainerRef = useRef<HTMLDivElement>(null);
	const [messages, setMessages] = useState<
		Partial<Message & { role?: "assistant" | "user" }>[]
	>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

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

	// Scroll to bottom helper function
	const scrollToBottom = useCallback(() => {
		setTimeout(() => {
			window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
		}, 200);
	}, []);

	// Scroll to bottom on initial render
	useEffect(() => {
		scrollToBottom;
	}, [scrollToBottom]);

	const sendMessage = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		try {
			const form = e.currentTarget;
			const formData = new FormData(form);
			const content = formData.get("content") as string;

			if (!content.trim()) return;

			const newUserMessage = {
				id: generateId(),
				role: "user",
				content: [{ type: "text", text: content }],
			} as unknown as Message;

			const updatedMessages = [...messages, newUserMessage];
			const payload = { messages: updatedMessages };

			setMessages(updatedMessages);
			setIsLoading(true);
			scrollToBottom();

			// Clear the textarea
			if (textareaRef.current) {
				textareaRef.current.value = "";
			}

			const res = await fetch("/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			// Handle streaming response
			const reader = res.body?.getReader();
			const decoder = new TextDecoder();
			
			// Create a placeholder message for the assistant
			const assistantMessageId = generateId();
			let accumulatedContent = "";
			
			setMessages(prev => [...prev, {
				id: assistantMessageId,
				role: "assistant",
				content: "",
			} as unknown as Message]);
			setStreamingMessageId(assistantMessageId);
			setIsLoading(false);

			if (reader) {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						
						const chunk = decoder.decode(value);
						const lines = chunk.split('\n');
						
						for (const line of lines) {
							if (line.startsWith('data: ')) {
								const data = line.slice(6);
								if (data === '[DONE]') continue;
								
								try {
									const parsed = JSON.parse(data);
									
									if (parsed.type === 'delta') {
										accumulatedContent += parsed.content;
										// Update the message with accumulated content
										setMessages(prev => prev.map(msg => 
											msg.id === assistantMessageId 
												? { ...msg, content: accumulatedContent }
												: msg
										));
										scrollToBottom();
									} else if (parsed.type === 'complete') {
										// Replace with the final message from Claude
										setMessages(prev => prev.map(msg => 
											msg.id === assistantMessageId 
												? parsed.response
												: msg
										));
										setStreamingMessageId(null);
									} else if (parsed.type === 'error') {
										throw new Error(parsed.error);
									}
								} catch (e) {
									console.error('Error parsing SSE data:', e);
								}
							}
						}
					}
				} finally {
					reader.releaseLock();
					setStreamingMessageId(null);
				}
			}
			scrollToBottom();
		} catch (error) {
			console.error("API Error:", error);
			setMessages((prev) => [
				...prev,
				{
					id: generateId(),
					role: "assistant",
					content: `Error: ${String(error)}`,
				} as unknown as Message,
			]);
		} finally {
			setIsLoading(false);
			setStreamingMessageId(null);
		}
	};

	const resetChat = () => {
		if (
			confirm(
				"Are you sure you want to clear all messages? This cannot be undone.",
			)
		) {
			setMessages([]);
			localStorage.removeItem("chat-messages");
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

	return (
		<div className="mt-8 mx-8 text-left flex flex-col gap-4 pb-32">
			<div className="flex justify-between items-center">
				<h2 className="text-xl font-bold text-[#fbf0df]">Chat</h2>
				<button
					type="button"
					onClick={resetChat}
					className="bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors"
				>
					Reset Chat
				</button>
			</div>

			<div ref={chatContainerRef} className="flex-1 flex flex-col gap-4 pr-2">
				{messages.map((message) => (
					<div
						key={message.id}
						className={`w-full bg-[#1a1a1a] border-2 rounded-xl p-3 text-[#fbf0df] font-mono ${
							message.id === streamingMessageId 
								? 'animate-pulse border-[#f3d5a3]' 
								: 'border-[#fbf0df] focus:border-[#f3d5a3]'
						}`}
					>
						<div className="font-bold mb-2 text-[#f3d5a3]">
							{message.role === "assistant" ? "Claude" : "You"}
						</div>
						<div className="whitespace-pre-wrap">
							{Array.isArray(message.content)
								? message.content.map((c: any) => c.text || c).join("")
								: message.content}
						</div>
					</div>
				))}
			</div>

			<form
				onSubmit={sendMessage}
				className="fixed bottom-8 right-8 left-8 flex flex-row items-center gap-2 bg-[#1a1a1a] p-3 rounded-xl font-mono border-2 border-[#fbf0df] transition-colors duration-300 focus-within:border-[#f3d5a3] "
			>
				<textarea
					ref={textareaRef}
					name="content"
					defaultValue=""
					onKeyDown={handleKeyDown}
					className="flex-1 bg-transparent border-0 text-[#fbf0df] font-mono text-base py-1.5 px-2 outline-none focus:text-white placeholder-[#fbf0df]/40"
					placeholder="Message... (Cmd+Enter to send)"
				/>
				<button
					type="submit"
					className="bg-[#fbf0df] text-[#1a1a1a] border-0 px-5 py-1.5 rounded-lg font-bold transition-all duration-100 hover:bg-[#f3d5a3] hover:-translate-y-px cursor-pointer whitespace-nowrap"
				>
					Send
				</button>
			</form>
		</div>
	);
}
