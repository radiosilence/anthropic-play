import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

// Context type
export function createContext(opts: FetchCreateContextFnOptions) {
  return {
    req: opts.req,
  };
}

type Context = Awaited<ReturnType<typeof createContext>>;

// Initialize tRPC
const t = initTRPC.context<Context>().create();

// Zod schemas
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.number().optional(),
});

export const SavedChatSchema = z.object({
  messages: z.array(ChatMessageSchema),
  lastUpdated: z.string(),
});

// Router
export const appRouter = t.router({
  // Health check endpoint
  health: t.procedure
    .query(() => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    })),

  // Get saved chats (example of how we might extend this)
  getSavedChats: t.procedure
    .query(async () => {
      // This could be extended to fetch from a database
      return {
        chats: [],
      };
    }),

  // Save chat session (example)
  saveChat: t.procedure
    .input(z.object({
      sessionId: z.string(),
      messages: z.array(ChatMessageSchema),
    }))
    .mutation(async ({ input }) => {
      // This could be extended to save to a database
      console.log('Saving chat session:', input.sessionId);
      return {
        success: true,
        sessionId: input.sessionId,
      };
    }),

  // Clear all chats
  clearChats: t.procedure
    .mutation(async () => {
      // This could clear from database
      return {
        success: true,
        clearedAt: new Date().toISOString(),
      };
    }),
});

// Export type router type signature
export type AppRouter = typeof appRouter;