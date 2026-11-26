import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

// AI features turn on once ANTHROPIC_API_KEY is set in Vercel. Until then they explain that politely.
export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function anthropic() {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const AI_MODEL = "claude-opus-5-5";
