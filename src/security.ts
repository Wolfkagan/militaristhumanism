import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "./model";
import { AppError } from "./http";

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    return null;
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signHmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function timingSafeTextEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function createCsrfToken(sessionId: string, secret: string, now = Date.now()): Promise<string> {
  const expiresAt = Math.floor(now / 1000) + 7_200;
  const payload = `v1:${expiresAt}:${sessionId}`;
  const signature = await signHmac(secret, payload);
  return `${expiresAt}.${toBase64Url(signature)}`;
}

export async function verifyCsrfToken(
  token: string,
  sessionId: string,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  const [expiresText, encodedSignature, extra] = token.split(".");
  if (extra !== undefined || expiresText === undefined || encodedSignature === undefined) {
    return false;
  }
  const expiresAt = Number.parseInt(expiresText, 10);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(now / 1000) || expiresAt > Math.floor(now / 1000) + 7_300) {
    return false;
  }
  const received = fromBase64Url(encodedSignature);
  if (received === null) {
    return false;
  }
  const key = await importHmacKey(secret);
  const signature = new ArrayBuffer(received.byteLength);
  new Uint8Array(signature).set(received);
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(`v1:${expiresAt}:${sessionId}`));
}

export async function requireCsrf(request: Request, sessionId: string, secret: string, submittedToken?: string): Promise<void> {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin === null || origin !== requestOrigin) {
    throw new AppError(403, "CSRF_ORIGIN_REJECTED", "The request origin could not be verified.");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new AppError(403, "CSRF_SITE_REJECTED", "Cross-site state changes are not accepted.");
  }

  const token = request.headers.get("x-csrf-token") ?? submittedToken;
  if (token === undefined || !(await verifyCsrfToken(token, sessionId, secret))) {
    throw new AppError(403, "CSRF_TOKEN_INVALID", "The form security token is invalid or expired.");
  }
}

export async function actorRateKey(request: Request, userId: string | null, secret: string): Promise<string> {
  if (userId !== null) {
    return `user:${userId}`;
  }
  const transientAddress = request.headers.get("cf-connecting-ip") ?? "anonymous";
  const signature = await signHmac(secret, `anonymous:${transientAddress}`);
  return `anonymous:${toBase64Url(signature).slice(0, 24)}`;
}

export async function enforceRateLimit(binding: RateLimit, key: string): Promise<void> {
  const result = await binding.limit({ key });
  if (!result.success) {
    throw new AppError(429, "RATE_LIMITED", "Too many requests. Wait a moment and try again.");
  }
}

function isPrivatePath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/me/") ||
    pathname === "/notifications" ||
    pathname === "/community/sign-in" ||
    pathname === "/community/new" ||
    pathname === "/community/report" ||
    pathname.endsWith("/edit")
  );
}

function oauthFormAction(env: Env): string {
  const origins = ["'self'"];
  if (env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim()) {
    origins.push("https://accounts.google.com");
  }
  if (
    env.APPLE_CLIENT_ID?.trim() &&
    env.APPLE_TEAM_ID?.trim() &&
    env.APPLE_KEY_ID?.trim() &&
    env.APPLE_PRIVATE_KEY?.trim()
  ) {
    origins.push("https://appleid.apple.com");
  }
  return origins.join(" ");
}

export const securityHeaders: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();
  const pathname = new URL(c.req.url).pathname;
  const headers = c.res.headers;

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), xr-spatial-tracking=()",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("X-DNS-Prefetch-Control", "off");
  if (new URL(c.req.url).protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  headers.set(
    "Content-Security-Policy",
    `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action ${oauthFormAction(c.env)}; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com/beacon.min.js; connect-src 'self'; frame-src https://challenges.cloudflare.com; worker-src 'none'; manifest-src 'self'; upgrade-insecure-requests`,
  );
  headers.delete("Access-Control-Allow-Origin");
  headers.set("Vary", "Cookie, Accept-Encoding");

  if (isPrivatePath(pathname)) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Cache-Control", "private, no-store");
  } else if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  }
};
