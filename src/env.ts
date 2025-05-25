import { EnvSchema } from "./types/env.schema";

export const ENV = EnvSchema.parse(process.env);
