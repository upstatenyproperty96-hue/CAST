import { z } from "zod";

// Languages Mux can auto-caption. The creator picks the spoken language at upload.
export const CAPTION_LANGUAGES = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese", nl: "Dutch",
  pl: "Polish", ru: "Russian", uk: "Ukrainian", ca: "Catalan", tr: "Turkish", sv: "Swedish", no: "Norwegian",
  fi: "Finnish", da: "Danish", sk: "Slovak", cs: "Czech", el: "Greek", hr: "Croatian", ro: "Romanian", bg: "Bulgarian",
} as const;
export type CaptionLanguage = keyof typeof CAPTION_LANGUAGES;
const CAPTION_CODES = Object.keys(CAPTION_LANGUAGES) as [CaptionLanguage, ...CaptionLanguage[]];

export const newUploadSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000).default(""),
  visibility: z.enum(["public", "followers", "unlisted"]).default("public"),
  topicId: z.number().int().positive().max(32767).nullable().default(null),
  // A clip points at the full-length video it was cut from.
  sourceVideoId: z.uuid().nullable().default(null),
  // ISO time to publish later; omitted = publish as soon as processing finishes.
  publishAt: z.iso.datetime({ offset: true }).nullable().default(null),
  rightsConfirmed: z.literal(true, { error: "Confirm you own the rights to this video." }),
  postText: z.string().trim().max(1000).default(""),
  // Spoken language, used for automatic captions.
  captionLanguage: z.enum(CAPTION_CODES).default("en"),
});
export type NewUpload = z.infer<typeof newUploadSchema>;

export const newClipSchema = z
  .object({
    sourceVideoId: z.uuid(),
    title: z.string().trim().min(1).max(120),
    start: z.number().min(0).max(1800),
    end: z.number().min(0).max(1800),
    postText: z.string().trim().max(1000).default(""),
    topicId: z.number().int().positive().max(32767).nullable().default(null),
  })
  .refine((c) => c.end - c.start >= 1, { message: "Clips must be at least 1 second long." })
  .refine((c) => c.end - c.start <= 600, { message: "Clips can be up to 10 minutes long." });
