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

export function APITester() {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const chatContainerRef = useRef<HTMLDivElement>(null);
	const [messages, setMessages] = useState<
		Partial<Message & { role?: "assistant" | "user" }>[]
	>([]);
	const [isLoading, setIsLoading] = useState(false);

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
			const endpoint = formData.get("endpoint") as string;
			const url = new URL(endpoint, location.href);
			const method = formData.get("method") as string;
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

			const res = await fetch(url, {
				method,
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			const data = await res.json();
			setMessages((messages) => [...messages, data.response as Message]);
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
						className="w-full bg-[#1a1a1a] border-2 border-[#fbf0df] rounded-xl p-3 text-[#fbf0df] font-mono focus:border-[#f3d5a3]"
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
				{isLoading && (
					<div className="w-full bg-[#1a1a1a] border-2 border-[#fbf0df] rounded-xl p-3 text-[#fbf0df] font-mono focus:border-[#f3d5a3]">
						<div className="font-bold mb-2 text-[#f3d5a3]">Claude</div>
						<div className="text-[#fbf0df]/60 italic">Thinking...</div>
					</div>
				)}
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
