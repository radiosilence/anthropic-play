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

		"/api/hello": {
			async GET(req) {
				return Response.json({
					message: "Hello, world!",
					method: "GET",
				});
			},
			async PUT(req) {
				return Response.json({
					message: "Hello, world!",
					method: "PUT",
				});
			},
		},

		"/api/hello/:name": async (req) => {
			const name = req.params.name;
			return Response.json({
				message: `Hello, ${name}!`,
			});
		},

		"/api/vibes": {
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

				const response = await anthropic.messages.create({
					model: "claude-3-7-sonnet-20250219",
					max_tokens: 1024,
					messages: claudeMessages,
				});
				return Response.json({ response });
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
