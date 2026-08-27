import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { seedUser, testEnv } from "./helpers";

async function request(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(`https://militaristhumanism.com${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function jwtSegment(value: Record<string, unknown>): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

describe("public application boundaries", () => {
  it("keeps health output minimal and independent of authentication tables", async () => {
    const statements: string[] = [];
    const isolatedEnv = {
      ...testEnv,
      DB: {
        prepare: (query: string) => {
          statements.push(query);
          return { first: async () => ({ healthy: 1 }) } as unknown as D1PreparedStatement;
        },
      } as unknown as D1Database,
    } as Env;
    const ctx = createExecutionContext();
    const response = await app.fetch(new Request("https://militaristhumanism.com/api/health", {
      headers: {
        cookie: "better-auth.session_token=untrusted-health-probe",
        "x-e2e-test-token": testEnv.E2E_TEST_TOKEN,
        "x-e2e-user-id": "missing-health-user",
      },
    }), isolatedEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(statements).toEqual(["SELECT 1 AS healthy"]);
  });

  it("serves the canonical static publication without depending on D1", async () => {
    const isolatedEnv = {
      ...testEnv,
      DB: {
        prepare: () => {
          throw new Error("The static publication must not query D1.");
        },
      } as unknown as D1Database,
      ASSETS: {
        fetch: async () => new Response("<!doctype html><html><body>Static publication</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=UTF-8" },
        }),
      } as unknown as Fetcher,
    } as Env;
    const ctx = createExecutionContext();
    const response = await app.fetch(new Request("https://militaristhumanism.com/"), isolatedEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Static publication");
    expect(response.headers.get("content-security-policy")).toMatch(/'nonce-[A-Za-z0-9_-]{24}'/u);
  });

  it("serves the public community with strict headers", async () => {
    const response = await request("/community");
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("<h1>Community</h1>");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self' https://accounts.google.com");
    expect(csp).toContain("connect-src 'self' https://cloudflareinsights.com");
    expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9_-]{24}'/u);
    const nonce = csp.match(/'nonce-([A-Za-z0-9_-]{24})'/u)?.[1];
    expect(nonce).toBeTruthy();
    expect(body).toContain(`nonce="${nonce}"`);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("https://appleid.apple.com");
    expect(csp).not.toContain("unsafe-eval");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("public");

    const second = await request("/community");
    const secondNonce = second.headers.get("content-security-policy")?.match(/'nonce-([A-Za-z0-9_-]{24})'/u)?.[1];
    expect(secondNonce).toBeTruthy();
    expect(secondNonce).not.toBe(nonce);
  });

  it("marks every authenticated response private even on a public route", async () => {
    await seedUser("cache-member");
    const response = await request("/community", {
      headers: {
        "x-e2e-test-token": testEnv.E2E_TEST_TOKEN,
        "x-e2e-user-id": "cache-member",
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("vary")).toContain("Cookie");
  });

  it("offers Google account access without a GitHub sign-in path", async () => {
    const response = await request("/community/sign-in", { headers: { accept: "text/html" } });
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('value="google"');
    expect(body).toContain("Continue with Google");
    expect(body).toContain("verified Google account");
    expect(body).not.toContain("Apple");
    expect(body.toLocaleLowerCase("en-US")).not.toContain("github");
  });

  it("preserves the OAuth state cookie on the Google authorization redirect", async () => {
    const response = await request("/community/sign-in", {
      method: "POST",
      headers: {
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        origin: "https://militaristhumanism.com",
      },
      body: new URLSearchParams({ provider: "google", returnTo: "/community", turnstileToken: "test-token" }),
    });
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").hostname).toBe("accounts.google.com");
    expect(response.headers.get("set-cookie")).toContain("better-auth.state");
  });

  it("stores OAuth access and refresh tokens encrypted, drops ID tokens, and records no session IP", async () => {
    const start = await request("/community/sign-in", {
      method: "POST",
      headers: {
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        origin: "https://militaristhumanism.com",
      },
      body: new URLSearchParams({ provider: "google", returnTo: "/community", turnstileToken: "test-token" }),
    });
    const authorization = new URL(start.headers.get("location") ?? "");
    const state = authorization.searchParams.get("state");
    const stateCookie = start.headers.get("set-cookie")?.split(";", 1)[0];
    expect(state).toBeTruthy();
    expect(stateCookie).toBeTruthy();

    const accessToken = `access-${crypto.randomUUID()}`;
    const refreshToken = `refresh-${crypto.randomUUID()}`;
    const idToken = `${jwtSegment({ alg: "none", typ: "JWT" })}.${jwtSegment({
      sub: `provider-${crypto.randomUUID()}`,
      name: "OAuth encryption test",
      email: `oauth-${crypto.randomUUID()}@test.invalid`,
      email_verified: true,
    })}.signature`;

    vi.stubGlobal("fetch", async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url !== "https://oauth2.googleapis.com/token") {
        throw new Error("Unexpected outbound request in OAuth storage regression test.");
      }
      return new Response(JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        id_token: idToken,
        token_type: "Bearer",
        expires_in: 3_600,
        scope: "openid email profile",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    try {
      const callback = await request(`/api/auth/callback/google?code=one-time-code&state=${encodeURIComponent(state!)}`, {
        headers: {
          cookie: stateCookie!,
          "x-forwarded-for": "192.0.2.10",
          "cf-connecting-ip": "192.0.2.10",
        },
      });
      expect(callback.status).toBeGreaterThanOrEqual(300);
      expect(callback.status).toBeLessThan(400);
    } finally {
      vi.unstubAllGlobals();
    }

    const account = await testEnv.DB.prepare(
      'SELECT "accessToken" AS access_token, "refreshToken" AS refresh_token, "idToken" AS id_token FROM "account" WHERE "providerId" = \'google\'',
    ).first<{ access_token: string | null; refresh_token: string | null; id_token: string | null }>();
    expect(account).not.toBeNull();
    expect(account?.access_token).not.toBe(accessToken);
    expect(account?.refresh_token).not.toBe(refreshToken);
    expect(account?.access_token).toMatch(/^(?:\$ba\$\d+\$)?[0-9a-f]+$/iu);
    expect(account?.refresh_token).toMatch(/^(?:\$ba\$\d+\$)?[0-9a-f]+$/iu);
    expect(account?.id_token).toBeNull();

    const sessionPrivacy = await testEnv.DB.prepare(
      'SELECT COUNT(*) AS total, SUM(CASE WHEN "ipAddress" IS NOT NULL THEN 1 ELSE 0 END) AS with_ip FROM "session"',
    ).first<{ total: number; with_ip: number }>();
    expect(Number(sessionPrivacy?.total ?? 0)).toBeGreaterThan(0);
    expect(Number(sessionPrivacy?.with_ip ?? 0)).toBe(0);
  });

  it("blocks anonymous writes with a consistent JSON error", async () => {
    const response = await request("/api/community/threads", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", origin: "https://militaristhumanism.com" },
      body: JSON.stringify({ title: "Anonymous posts must never be accepted", body: "This body is valid but the request has no authenticated session.", categoryId: "cat_general" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("protects admin routes and marks them noindex", async () => {
    const response = await request("/admin/overview", { headers: { accept: "text/html" } });
    expect(response.status).toBe(401);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await response.text()).not.toContain("Community overview</h1>");
  });

  it("parameterizes malicious search input without altering schema", async () => {
    const response = await request("/api/community/search?q=%22%3B%20DROP%20TABLE%20threads%3B--");
    expect(response.status).toBe(200);
    expect(await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM threads").first<number>("count")).toBe(0);
  });

  it("returns 429 and Retry-After at the configured search limit", async () => {
    const first = await request("/api/community/search?q=philosophy");
    const second = await request("/api/community/search?q=ethics");
    const third = await request("/api/community/search?q=society");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBe("60");
  });

  it("runs authenticated member, moderation, and admin workflows through the real API", async () => {
    await seedUser("e2e-member");
    await seedUser("e2e-moderator", "moderator");
    await seedUser("e2e-admin", "admin");
    const token = testEnv.E2E_TEST_TOKEN;
    const headersFor = (userId: string, accept = "application/json") => ({
      "x-e2e-test-token": token,
      "x-e2e-user-id": userId,
      accept,
    });
    const page = await request("/community/new", { headers: headersFor("e2e-member", "text/html") });
    const pageBody = await page.text();
    const csrf = pageBody.match(/name="csrf" value="([^"]+)"/u)?.[1];
    expect(csrf).toBeTruthy();
    const mutationHeaders = {
      ...headersFor("e2e-member"),
      origin: "https://militaristhumanism.com",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    };
    const threadResponse = await request("/api/community/threads", {
      method: "POST",
      headers: mutationHeaders,
      body: new URLSearchParams({
        csrf: csrf!,
        title: "A complete integration discussion for community verification",
        body: "This real Workers-runtime request verifies creation, replies, relationships, reporting, and moderation.",
        categoryId: "cat_philosophy",
      }),
    });
    expect(threadResponse.status).toBe(201);
    const threadPayload = await threadResponse.json() as { thread: { publicId: string; path: string } };
    const replyResponse = await request(`/api/community/threads/${threadPayload.thread.publicId}/posts`, {
      method: "POST",
      headers: mutationHeaders,
      body: new URLSearchParams({ csrf: csrf!, body: "The first integrated reply is concrete and reviewable." }),
    });
    expect(replyResponse.status).toBe(201);
    const replyPayload = await replyResponse.json() as { post: { publicId: string } };
    const nestedResponse = await request(`/api/community/threads/${threadPayload.thread.publicId}/posts`, {
      method: "POST",
      headers: mutationHeaders,
      body: new URLSearchParams({ csrf: csrf!, body: "A nested response preserves the logical discussion structure.", parentPublicId: replyPayload.post.publicId }),
    });
    expect(nestedResponse.status).toBe(201);
    const editResponse = await request(`/api/community/posts/${replyPayload.post.publicId}`, {
      method: "PATCH",
      headers: mutationHeaders,
      body: new URLSearchParams({ csrf: csrf!, body: "The edited integrated reply remains concrete and reviewable." }),
    });
    expect(editResponse.status).toBe(200);
    for (const [endpoint, body] of [
      ["/api/community/reactions", { csrf: csrf!, targetType: "thread", targetPublicId: threadPayload.thread.publicId, reactionType: "insightful" }],
      ["/api/community/bookmarks", { csrf: csrf!, threadPublicId: threadPayload.thread.publicId }],
      ["/api/community/follows", { csrf: csrf!, threadPublicId: threadPayload.thread.publicId }],
    ] as const) {
      const relationship = await request(endpoint, { method: "POST", headers: mutationHeaders, body: new URLSearchParams(body) });
      expect(relationship.status).toBe(200);
    }
    const reportResponse = await request("/api/community/reports", {
      method: "POST",
      headers: mutationHeaders,
      body: new URLSearchParams({ csrf: csrf!, targetType: "thread", targetPublicId: threadPayload.thread.publicId, reason: "other", details: "Deterministic integration report." }),
    });
    expect(reportResponse.status).toBe(201);
    const reportPayload = await reportResponse.json() as { report: { publicId: string } };

    const moderatorPage = await request("/admin/moderation", { headers: headersFor("e2e-moderator", "text/html") });
    const moderatorBody = await moderatorPage.text();
    const moderatorCsrf = moderatorBody.match(/name="csrf" value="([^"]+)"/u)?.[1];
    expect(moderatorCsrf).toBeTruthy();
    expect(moderatorBody).toContain('href="/admin/moderation"');
    expect(moderatorBody).not.toContain('href="/admin/overview"');
    expect(moderatorBody).not.toContain('href="/admin/analytics"');
    const moderatorHeaders = {
      ...headersFor("e2e-moderator"),
      origin: "https://militaristhumanism.com",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    };
    const review = await request("/api/admin/reports/review", { method: "POST", headers: moderatorHeaders, body: new URLSearchParams({ csrf: moderatorCsrf!, reportPublicId: reportPayload.report.publicId }) });
    expect(review.status).toBe(200);
    const hide = await request("/api/admin/moderation", { method: "POST", headers: moderatorHeaders, body: new URLSearchParams({ csrf: moderatorCsrf!, action: "hide", targetType: "thread", targetPublicId: threadPayload.thread.publicId, reason: "Integration moderation reason is sufficiently detailed." }) });
    expect(hide.status).toBe(200);
    const resolve = await request("/api/admin/moderation", { method: "POST", headers: moderatorHeaders, body: new URLSearchParams({ csrf: moderatorCsrf!, action: "resolve", targetType: "report", targetPublicId: reportPayload.report.publicId, reason: "Integration report reviewed and resolved with evidence." }) });
    expect(resolve.status).toBe(200);
    const admin = await request("/admin/analytics", { headers: headersFor("e2e-admin", "text/html") });
    expect(admin.status).toBe(200);
    const adminBody = await admin.text();
    expect(adminBody).toContain("Product analytics</h1>");
    expect(adminBody).toContain("Community activity over time");
    expect(adminBody).toContain("New members</h3>");
    expect(adminBody).toContain("Moderation events</h3>");
  });
});
