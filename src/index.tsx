import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { serve } from "bun";
import index from "./index.html";
import { handleChatRequest } from "./server/chat";
import { appRouter, createContext } from "./server/router";

const server = serve({
  port: 3000,
  routes: {
    // tRPC endpoint
    "/api/trpc/*": async (req) => {
      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req,
        router: appRouter,
        createContext,
      });
    },

    // Streaming chat endpoint
    "/api/chat": {
      POST: handleChatRequest,
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
