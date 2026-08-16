import { AppError } from "./http";

interface TurnstileResponse {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
}

export function turnstileIsRequired(env: Env): boolean {
  if (env.APP_ENV === "production" || env.APP_ENV === "preview") {
    return true;
  }
  return env.TURNSTILE_MODE.toLocaleLowerCase("en-US") !== "disabled";
}

export async function validateTurnstile(
  request: Request,
  env: Env,
  token: string | undefined,
  expectedAction: string,
): Promise<void> {
  if (!turnstileIsRequired(env)) {
    return;
  }
  if (env.TURNSTILE_SECRET === undefined || env.TURNSTILE_SECRET.length < 10) {
    throw new AppError(503, "TURNSTILE_UNAVAILABLE", "Human verification is temporarily unavailable.");
  }
  if (token === undefined || token.length < 3) {
    throw new AppError(422, "TURNSTILE_REQUIRED", "Complete the human verification challenge.");
  }

  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET);
  body.set("response", token);
  body.set("idempotency_key", crypto.randomUUID());
  const transientAddress = request.headers.get("cf-connecting-ip");
  if (transientAddress !== null) {
    body.set("remoteip", transientAddress);
  }

  let response: Response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new AppError(503, "TURNSTILE_UNAVAILABLE", "Human verification is temporarily unavailable.");
  }
  if (!response.ok) {
    throw new AppError(503, "TURNSTILE_UNAVAILABLE", "Human verification is temporarily unavailable.");
  }
  const result = (await response.json()) as TurnstileResponse;
  const verifiedHostname = result.hostname?.trim().toLocaleLowerCase("en-US");
  const requestHostname = new URL(request.url).hostname.toLocaleLowerCase("en-US");
  const hostnameMismatch =
    (env.APP_ENV === "production" || env.APP_ENV === "preview") && verifiedHostname !== requestHostname;
  if (result.success !== true || result.action !== expectedAction || hostnameMismatch) {
    throw new AppError(403, "TURNSTILE_FAILED", "Human verification failed. Please try again.");
  }
}
