import "server-only";
import Mux from "@mux/mux-node";
import { serverEnv } from "@/lib/server-env";

let client: Mux | null = null;
export function mux() {
  const env = serverEnv();
  client ??= new Mux({ tokenId: env.MUX_TOKEN_ID, tokenSecret: env.MUX_TOKEN_SECRET, webhookSecret: env.MUX_WEBHOOK_SECRET });
  return client;
}

export const MAX_DURATION_S = 30 * 60;
