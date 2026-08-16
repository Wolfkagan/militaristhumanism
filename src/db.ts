import { AppError } from "./http";

export function createPublicId(prefix: "th" | "po" | "rp" | "ma" | "usr"): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return slug.length > 0 ? slug : "discussion";
}

export function threadPath(slug: string, publicId: string): string {
  return `/community/t/${slug}-${publicId}`;
}

export function threadIdFromPath(value: string): string | null {
  return value.match(/-(th_[a-f0-9]{12})$/u)?.[1] ?? null;
}

export async function communityIsReadOnly(env: Env): Promise<boolean> {
  if (env.COMMUNITY_READ_ONLY.toLocaleLowerCase("en-US") === "true") {
    return true;
  }
  const value = await env.DB.prepare(
    "SELECT setting_value FROM community_settings WHERE setting_key = 'community_read_only'",
  ).first<string>("setting_value");
  return value === "true";
}

export async function requireWritableCommunity(env: Env): Promise<void> {
  if (await communityIsReadOnly(env)) {
    throw new AppError(503, "COMMUNITY_READ_ONLY", "Community discussions are temporarily read-only.");
  }
}

export async function requireUnrestrictedUser(env: Env, userId: string): Promise<void> {
  const restriction = await env.DB.prepare(
    `SELECT id FROM user_restrictions
     WHERE user_id = ? AND lifted_at IS NULL AND datetime(expires_at) > datetime('now')
     ORDER BY expires_at DESC LIMIT 1`,
  )
    .bind(userId)
    .first<{ id: number }>();
  if (restriction !== null) {
    throw new AppError(403, "USER_RESTRICTED", "Posting is temporarily unavailable for this account.");
  }
}

interface CursorValue {
  value: string | number;
  id: number;
}

export function encodeCursor(cursor: CursorValue): string {
  const payload = JSON.stringify(cursor);
  const bytes = new TextEncoder().encode(payload);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function decodeCursor(value: string | undefined): CursorValue | null {
  if (value === undefined || !/^[A-Za-z0-9_-]{4,256}$/u.test(value)) {
    return null;
  }
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("value" in parsed) ||
      !("id" in parsed) ||
      (typeof parsed.value !== "string" && typeof parsed.value !== "number") ||
      typeof parsed.id !== "number" ||
      !Number.isSafeInteger(parsed.id)
    ) {
      return null;
    }
    return { value: parsed.value, id: parsed.id };
  } catch {
    return null;
  }
}
