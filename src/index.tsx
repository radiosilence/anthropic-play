import { serve } from "bun";
import index from "./index.html";
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from './server/router';
import { Anthropic } from "@anthropic-ai/sdk";
import { z } from 'zod';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_KEY,
});

// Zod schema for chat endpoint
const ChatRequestSchema = z.object({
	messages: z.array(z.object({
		role: z.enum(['user', 'assistant']),
		content: z.string(),
	})),
});

const server = serve({
	port: 3000,
	routes: {
		// tRPC endpoint
		"/api/trpc/*": async (req) => {
			return fetchRequestHandler({
				endpoint: '/api/trpc',
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
							{ error: 'Invalid request', details: result.error.issues },
							{ status: 400 }
						);
					}

					const { messages } = result.data;

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
									messages,
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
								controller.enqueue(encoder.encode("data: [DONE]\n\n"));
								
							} catch (error: any) {
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
				} catch (error) {
					return Response.json(
						{ error: 'Internal server error' },
						{ status: 500 }
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