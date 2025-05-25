import { serve } from "bun";
import index from "./index.html";
import { Anthropic } from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_KEY,
});

const server = serve({
	port: 3000,
	routes: {
		// Serve index.html for all unmatched routes.
		"/*": index,

		"/api/chat": {
			async POST(req) {
				console.log(req);
				console.log(req.body);
				const body = await req.json();
				const messages = body.messages;
				if (!messages || messages.length === 0) return Response.error();

				// Transform messages to Claude API format
				const claudeMessages = messages.map((msg: any) => ({
					role: msg.role,
					content: Array.isArray(msg.content)
						? msg.content[0].text
						: msg.content,
				}));

				console.log({ claudeMessages });

				// Set up SSE headers
				const headers = new Headers({
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					"Connection": "keep-alive",
				});

				// Create a readable stream for SSE
				const stream = new ReadableStream({
					async start(controller) {
						const encoder = new TextEncoder();
						
						try {
							const stream = await anthropic.messages.stream({
								model: "claude-3-7-sonnet-20250219",
								max_tokens: 1024,
								messages: claudeMessages,
							});

							let accumulatedContent = "";
							
							for await (const chunk of stream) {
								if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
									accumulatedContent += chunk.delta.text;
									// Send the delta as an SSE event
									const data = JSON.stringify({ 
										type: 'delta',
										content: chunk.delta.text 
									});
									controller.enqueue(encoder.encode(`data: ${data}\n\n`));
								}
							}

							// Get the final message
							const finalMessage = await stream.finalMessage();
							
							// Send the complete message as final event
							const finalData = JSON.stringify({ 
								type: 'complete',
								response: finalMessage
							});
							controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
							controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
							
						} catch (error) {
							const errorData = JSON.stringify({ 
								type: 'error',
								error: error.message 
							});
							controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
						} finally {
							controller.close();
						}
					},
				});

				return new Response(stream, { headers });
			},
		},
	},

	development: process.env.NODE_ENV !== "production" && {
		// Enable browser hot reloading in development
		hmr: true,

		// Echo console logs from the browser to the server
		console: true,
	},
});
