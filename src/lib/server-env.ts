import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  MUX_TOKEN_ID: z.string().min(1),
  MUX_TOKEN_SECRET: z.string().min(1),
  MUX_WEBHOOK_SECRET: z.string().min(1),
});

let cached: z.infer<typeof serverSchema> | null = null;

// Read lazily so a missing secret fails loudly at request time, never at build time.
export function serverEnv() {
  cached ??= serverSchema.parse(process.env);
  return cached;
}
