import { z } from "zod";

const trimmed = (minimum: number, maximum: number, label: string) =>
  z
    .string()
    .trim()
    .min(minimum, `${label} must be at least ${minimum} characters.`)
    .max(maximum, `${label} must be no more than ${maximum} characters.`);

const csrfFields = {
  csrf: z.string().max(512).optional(),
};

export const threadCreateSchema = z.object({
  title: trimmed(8, 160, "Title"),
  body: trimmed(20, 20_000, "Discussion"),
  categoryId: z.string().regex(/^cat_[a-z0-9_]{2,40}$/u, "Choose a valid category."),
  turnstileToken: z.string().max(4_096).optional(),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const threadUpdateSchema = z
  .object({
    title: trimmed(8, 160, "Title").optional(),
    body: trimmed(20, 20_000, "Discussion").optional(),
    categoryId: z.string().regex(/^cat_[a-z0-9_]{2,40}$/u, "Choose a valid category.").optional(),
    returnTo: z.string().max(512).optional(),
    ...csrfFields,
  })
  .refine((value) => value.title !== undefined || value.body !== undefined || value.categoryId !== undefined, {
    message: "Submit at least one change.",
  });

export const postCreateSchema = z.object({
  body: trimmed(2, 10_000, "Reply"),
  parentPublicId: z.string().regex(/^po_[a-f0-9]{12}$/u).optional().or(z.literal("")),
  turnstileToken: z.string().max(4_096).optional(),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const postUpdateSchema = z.object({
  body: trimmed(2, 10_000, "Reply"),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const reactionSchema = z.object({
  targetType: z.enum(["thread", "post"]),
  targetPublicId: z.string().regex(/^(?:th|po)_[a-f0-9]{12}$/u, "The reaction target is invalid."),
  reactionType: z.enum(["insightful", "agree", "question", "well_argued"]),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const threadRelationshipSchema = z.object({
  threadPublicId: z.string().regex(/^th_[a-f0-9]{12}$/u, "The discussion is invalid."),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const reportSchema = z.object({
  targetType: z.enum(["thread", "post", "user"]),
  targetPublicId: z.string().regex(/^(?:th|po|usr)_[a-f0-9]{12}$/u, "The report target is invalid."),
  reason: z.enum(["threat", "hatred", "harassment", "spam", "doxxing", "misinformation", "other"]),
  details: z.string().trim().max(2_000, "Details must be no more than 2,000 characters.").default(""),
  turnstileToken: z.string().max(4_096).optional(),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const profileUpdateSchema = z.object({
  displayName: trimmed(1, 80, "Display name"),
  biography: z.string().trim().max(500, "Biography must be no more than 500 characters."),
  visibility: z.enum(["public", "limited"]),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const notificationMutationSchema = z.object({
  notificationId: z.coerce.number().int().positive().optional(),
  markAll: z.enum(["true", "false"]).optional(),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const moderationSchema = z.object({
  action: z.enum(["hide", "restore", "lock", "unlock", "pin", "unpin", "move", "warn", "restrict", "unrestrict", "resolve", "dismiss"]),
  targetType: z.enum(["thread", "post", "user", "report"]),
  targetPublicId: z.string().min(3).max(160),
  reason: trimmed(8, 2_000, "Reason"),
  categoryId: z.string().regex(/^cat_[a-z0-9_]{2,40}$/u).optional(),
  restrictionHours: z.coerce.number().int().min(1).max(24 * 365).optional(),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const categoryMutationSchema = z.object({
  id: z.string().regex(/^cat_[a-z0-9_]{2,40}$/u).optional(),
  name: trimmed(2, 80, "Category name"),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80),
  description: trimmed(8, 300, "Description"),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  isVisible: z.enum(["true", "false"]),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const roleMutationSchema = z.object({
  userId: z.string().min(3).max(160),
  role: z.enum(["member", "moderator"]),
  reason: trimmed(8, 2_000, "Reason"),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const communitySettingSchema = z.object({
  readOnly: z.enum(["true", "false"]),
  reason: trimmed(8, 2_000, "Reason"),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const reportReviewSchema = z.object({
  reportPublicId: z.string().regex(/^rp_[a-f0-9]{12}$/u),
  returnTo: z.string().max(512).optional(),
  ...csrfFields,
});

export const oauthStartSchema = z.object({
  provider: z.enum(["google", "apple"]),
  returnTo: z.string().max(512).optional(),
  turnstileToken: z.string().max(4_096),
});

export const markdownPreviewSchema = z.object({
  body: z.string().max(20_000),
  ...csrfFields,
});

export type ThreadCreateInput = z.infer<typeof threadCreateSchema>;
export type PostCreateInput = z.infer<typeof postCreateSchema>;
