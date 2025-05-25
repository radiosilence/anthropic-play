import { httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../server/trpc";

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      // uses the httpSubscriptionLink for subscriptions
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({
        url: "/api/trpc",
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        headers: () => ({
          "x-trpc-source": "react-app",
        }),
        fetch: async (url, options) => {
          let lastError: Error | undefined;
          const maxRetries = 3;

          for (let i = 0; i <= maxRetries; i++) {
            try {
              const response = await fetch(url, options);

              if (!response.ok && response.status >= 500) {
                // Server error, retry
                throw new Error(`Server error: ${response.status}`);
              }

              return response;
            } catch (error) {
              lastError = error as Error;
              console.error(
                `❌ Request failed (attempt ${i + 1}/${maxRetries + 1}):`,
                error,
              );

              if (i < maxRetries) {
                const delay = Math.min(1000 * 2 ** i, 10000);
                console.log(`🔄 Retrying in ${delay}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
              }
            }
          }

          throw lastError || new Error("Request failed after all retries");
        },
      }),
    }),
  ],
});
