import { ENV } from "@/env";
import index from "@/index.html";
import { appRouter, createContext } from "@/server/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { serve } from "bun";

const server = serve({
  port: ENV.PORT,
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
