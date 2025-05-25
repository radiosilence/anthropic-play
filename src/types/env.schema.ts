import { z } from "zod";

export const EnvSchema = z.object({
  ANTHROPIC_KEY: z.string().min(1).max(255),
  PORT: z.coerce.number().default(3000),
});
