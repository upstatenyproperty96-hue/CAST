import { z } from "zod";

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
});
export type NewUpload = z.infer<typeof newUploadSchema>;
