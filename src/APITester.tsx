import type { Message } from "@anthropic-ai/sdk/resources";
import { randomUUIDv7 } from "bun";
import { useRef, useState, type FormEvent } from "react";

export function APITester() {
	const responseInputRef = useRef<HTMLTextAreaElement>(null);
	const [messages, setMessages] = useState<Partial<Message>[]>([]);

	const testEndpoint = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		try {
			const form = e.currentTarget;
			const formData = new FormData(form);
			const endpoint = formData.get("endpoint") as string;
			const url = new URL(endpoint, location.href);
			const method = formData.get("method") as string;
			const content = formData.get("content") as string;

			const payload = { content };
			console.log({ url, method, endpoint, payload });

			setMessages((messages) => [
				...messages,
				{
					id: randomUUIDv7(),
					role: "user",
					content: [{ type: "text", text: content }],
				} as unknown as Message,
			]);
			const res = await fetch(url, {
				method,
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			const data = await res.json();
			setMessages((messages) => [...messages, data.response as Message]);
			responseInputRef.current!.value = JSON.stringify(data, null, 2);
		} catch (error) {
			responseInputRef.current!.value = String(error);
		}
	};

	return (
		<div className="mt-8 mx-8 text-left flex flex-col gap-4">
			<form
				onSubmit={testEndpoint}
				className="flex flex-col items-center gap-2 bg-[#1a1a1a] p-3 rounded-xl font-mono border-2 border-[#fbf0df] transition-colors duration-300 focus-within:border-[#f3d5a3] w-full"
			>
				<div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center w-full">
					<select
						name="method"
						className="bg-[#fbf0df] text-[#1a1a1a] py-1.5 px-3 rounded-lg font-bold text-sm min-w-[0px] appearance-none cursor-pointer hover:bg-[#f3d5a3] transition-colors duration-100"
					>
						<option value="POST" className="py-1">
							POST
						</option>
						<option value="GET" className="py-1">
							GET
						</option>
						<option value="PUT" className="py-1">
							PUT
						</option>
					</select>
					<input
						type="text"
						name="endpoint"
						defaultValue="/api/vibes"
						className="bg-transparent border-0 text-[#fbf0df] font-mono text-base py-1.5 px-2 outline-none focus:text-white placeholder-[#fbf0df]/40"
						placeholder="/api/vibes"
					/>
					<button
						type="submit"
						className="bg-[#fbf0df] text-[#1a1a1a] border-0 px-5 py-1.5 rounded-lg font-bold transition-all duration-100 hover:bg-[#f3d5a3] hover:-translate-y-px cursor-pointer whitespace-nowrap"
					>
						Send
					</button>
				</div>
				<textarea
					name="content"
					defaultValue=""
					className="w-full  flex-1 bg-transparent border-0 text-[#fbf0df] font-mono text-base py-1.5 px-2 outline-none focus:text-white placeholder-[#fbf0df]/40"
					placeholder="Message..."
				/>
			</form>
			{messages.map((message) => (
				<div
					key={message.id}
					className="w-full bg-[#1a1a1a] border-2 border-[#fbf0df] rounded-xl p-3 text-[#fbf0df] font-mono resize-y focus:border-[#f3d5a3] placeholder-[#fbf0df]/40"
				>
					{JSON.stringify(message)}
				</div>
			))}
			<textarea
				ref={responseInputRef}
				readOnly
				placeholder="Response will appear here..."
				className="w-full h-96 bg-[#1a1a1a] border-2 border-[#fbf0df] rounded-xl p-3 text-[#fbf0df] font-mono resize-y focus:border-[#f3d5a3] placeholder-[#fbf0df]/40"
			/>
		</div>
	);
}
