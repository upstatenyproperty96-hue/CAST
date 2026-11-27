import "server-only";
import Mux from "@mux/mux-node";
import { serverEnv } from "@/lib/server-env";
import { CAPTION_LANGUAGES, type CaptionLanguage } from "@/lib/validation";

let client: Mux | null = null;
export function mux() {
  const env = serverEnv();
  client ??= new Mux({ tokenId: env.MUX_TOKEN_ID, tokenSecret: env.MUX_TOKEN_SECRET, webhookSecret: env.MUX_WEBHOOK_SECRET });
  return client;
}

export const MAX_DURATION_S = 30 * 60;

export function autoCaptions(language: CaptionLanguage) {
  return [{ language_code: language, name: `${CAPTION_LANGUAGES[language]} (auto)` }];
}

// Finds the language of a video's auto captions so a clip cut from it gets the same captions.
export async function captionLanguageOf(assetId: string): Promise<CaptionLanguage> {
  try {
    const asset = await mux().video.assets.retrieve(assetId);
    const track = asset.tracks?.find((t) => t.type === "text" && t.text_source?.startsWith("generated"));
    const code = track?.language_code?.split("-")[0];
    return code && code in CAPTION_LANGUAGES ? (code as CaptionLanguage) : "en";
  } catch {
    return "en";
  }
}
