import { betterAuth } from "better-auth";
import type { AppSession, ProfileRow, Role } from "./model";
import { timingSafeTextEqual } from "./security";
import { createPublicId } from "./db";

function configured(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

export function configuredProviders(env: Env): Array<"github" | "google"> {
  const providers: Array<"github" | "google"> = [];
  if (configured(env.GITHUB_CLIENT_ID) && configured(env.GITHUB_CLIENT_SECRET)) {
    providers.push("github");
  }
  if (configured(env.GOOGLE_CLIENT_ID) && configured(env.GOOGLE_CLIENT_SECRET)) {
    providers.push("google");
  }
  return providers;
}

export function authIsConfigured(env: Env): boolean {
  return configured(env.AUTH_SECRET) && env.AUTH_SECRET.length >= 32 && configuredProviders(env).length > 0;
}

function trustedOrigins(env: Env, allowedHosts: string[]): string[] {
  const origins = new Set<string>();
  for (const candidate of [env.CANONICAL_ORIGIN, env.AUTH_BASE_FALLBACK]) {
    try {
      origins.add(new URL(candidate).origin);
    } catch {
      // Invalid deployment configuration is rejected by Better Auth's base URL handling.
    }
  }
  for (const host of allowedHosts) {
    if (host.includes("*")) {
      origins.add(`https://${host}`);
    } else if (!/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?$/u.test(host)) {
      origins.add(`https://${host}`);
    }
  }
  return [...origins];
}

export function createAuth(env: Env) {
  const providers = configuredProviders(env);
  const socialProviders = {
    ...(providers.includes("github")
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {}),
    ...(providers.includes("google")
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
  };
  const allowedHosts = env.AUTH_ALLOWED_HOSTS.split(",").map((host) => host.trim()).filter(Boolean);

  return betterAuth({
    database: env.DB,
    secret: env.AUTH_SECRET,
    baseURL: {
      allowedHosts,
      protocol: "auto",
      fallback: env.AUTH_BASE_FALLBACK,
    },
    trustedOrigins: trustedOrigins(env, allowedHosts),
    socialProviders,
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      useSecureCookies: env.APP_ENV !== "development",
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
  });
}

function normalizedHandleBase(name: string, email: string): string {
  const source = name.trim().length > 0 ? name : email.split("@", 1)[0] ?? "member";
  const normalized = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 24);
  return normalized.length >= 3 ? normalized : "member";
}

function randomSuffix(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function bootstrapRole(email: string, env: Env): Promise<Role> {
  const candidates = (env.ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((candidate) => candidate.trim().toLocaleLowerCase("en-US"))
    .filter(Boolean);
  const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
  for (const candidate of candidates) {
    if (await timingSafeTextEqual(normalizedEmail, candidate)) {
      return "admin";
    }
  }
  return "member";
}

async function ensureProfile(user: { id: string; name: string; email: string }, env: Env): Promise<{ profile: ProfileRow; isNew: boolean }> {
  const current = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id = ?")
    .bind(user.id)
    .first<ProfileRow>();
  if (current !== null) {
    return { profile: current, isNew: false };
  }

  const role = await bootstrapRole(user.email, env);
  const handleBase = normalizedHandleBase(user.name, user.email);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const handle = `${handleBase}-${randomSuffix()}`;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO user_profiles (user_id, public_id, handle, display_name, role) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(user.id, createPublicId("usr"), handle, user.name.trim().slice(0, 80) || handle, role)
      .run();
    const created = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id = ?")
      .bind(user.id)
      .first<ProfileRow>();
    if (created !== null) {
      return { profile: created, isNew: true };
    }
  }
  throw new Error("Unable to create a unique member profile.");
}

export async function readAppSession(request: Request, env: Env): Promise<AppSession | null> {
  const testSession = await readNonProductionTestSession(request, env);
  if (testSession !== null) return testSession;
  if (!authIsConfigured(env) || !request.headers.has("cookie")) {
    return null;
  }
  const auth = createAuth(env);
  const result = await auth.api.getSession({ headers: request.headers });
  if (result === null) {
    return null;
  }
  const ensured = await ensureProfile(
    { id: result.user.id, name: result.user.name, email: result.user.email },
    env,
  );
  return {
    id: result.session.id,
    expiresAt: result.session.expiresAt,
    user: { id: result.user.id, name: result.user.name, email: result.user.email },
    profile: ensured.profile,
    isNewProfile: ensured.isNew,
  };
}

export async function readNonProductionTestSession(request: Request, env: Env): Promise<AppSession | null> {
  // This identity shim exists only for local, deterministic browser/runtime tests.
  // Preview deployments are internet-accessible and must never accept test headers.
  if (env.APP_ENV !== "test") return null;
  const configuredToken = env.E2E_TEST_TOKEN;
  const submittedToken = request.headers.get("x-e2e-test-token");
  const userId = request.headers.get("x-e2e-user-id");
  if (
    configuredToken === undefined ||
    configuredToken.length < 32 ||
    submittedToken === null ||
    userId === null ||
    !/^[a-z0-9_-]{3,64}$/u.test(userId) ||
    !(await timingSafeTextEqual(configuredToken, submittedToken))
  ) {
    return null;
  }
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.email, p.public_id, p.handle, p.display_name, p.biography,
            p.role, p.visibility, p.created_at, p.updated_at
     FROM "user" u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`,
  )
    .bind(userId)
    .first<{
      id: string;
      name: string;
      email: string;
      public_id: string;
      handle: string;
      display_name: string;
      biography: string;
      role: Role;
      visibility: "public" | "limited";
      created_at: string;
      updated_at: string;
    }>();
  if (row === null) return null;
  return {
    id: `e2e-${row.id}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    isNewProfile: false,
    user: { id: row.id, name: row.name, email: row.email },
    profile: {
      user_id: row.id,
      public_id: row.public_id,
      handle: row.handle,
      display_name: row.display_name,
      biography: row.biography,
      role: row.role,
      visibility: row.visibility,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  };
}
