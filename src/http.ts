import type { Context } from "hono";
import { ZodError, type ZodType } from "zod";
import type { AppBindings } from "./model";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function apiError(c: Context<AppBindings>, error: AppError): Response {
  return c.json(
    {
      error: {
        code: error.code,
        message: error.message,
        requestId: c.get("requestId"),
      },
    },
    error.status as 400 | 401 | 403 | 404 | 405 | 409 | 413 | 422 | 429 | 500 | 503,
  );
}

async function readBoundedText(request: Request, maximumBytes: number): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number.parseInt(declaredLength, 10);
    if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maximumBytes) {
      throw new AppError(413, "PAYLOAD_TOO_LARGE", "The submitted data is too large.");
    }
  }

  if (request.body === null) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let result = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      received += chunk.value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel("payload limit exceeded");
        throw new AppError(413, "PAYLOAD_TOO_LARGE", "The submitted data is too large.");
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

export async function readInput(request: Request, maximumBytes = 65_536): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const body = await readBoundedText(request, maximumBytes);

  if (contentType === "application/json") {
    if (body.length === 0) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new AppError(400, "INVALID_JSON", "The request body must be a JSON object.");
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(400, "INVALID_JSON", "The request body contains invalid JSON.");
    }
  }

  if (contentType === "application/x-www-form-urlencoded") {
    const values: Record<string, unknown> = {};
    for (const [key, value] of new URLSearchParams(body)) {
      values[key] = value;
    }
    return values;
  }

  throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Use JSON or a standard URL-encoded form.");
}

export async function parseInput<T>(request: Request, schema: ZodType<T>, maximumBytes = 65_536): Promise<T> {
  const input = await readInput(request, maximumBytes);
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      const first = error.issues[0];
      throw new AppError(422, "VALIDATION_FAILED", first?.message ?? "The submitted data is invalid.");
    }
    throw error;
  }
}

export function wantsHtml(request: Request): boolean {
  return request.headers.get("accept")?.includes("text/html") === true;
}

export function safeReturnPath(value: string | undefined, fallback: string): string {
  if (
    value === undefined ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/u.test(value)
  ) {
    return fallback;
  }
  try {
    const base = new URL("https://return-path.invalid/");
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin || parsed.username.length > 0 || parsed.password.length > 0) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function mutationSuccess(
  c: Context<AppBindings>,
  payload: Record<string, unknown>,
  redirectPath: string,
  status: 200 | 201 = 200,
): Response {
  if (wantsHtml(c.req.raw)) {
    return c.redirect(redirectPath, 303);
  }
  return c.json(payload, status);
}
