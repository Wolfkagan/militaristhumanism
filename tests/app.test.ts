import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { seedUser, testEnv } from "./helpers";

async function request(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(`https://militaristhumanism.com${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("public application boundaries", () => {
  it("keeps health output minimal", async () => {
    const response = await request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("serves the public community with strict headers", async () => {
    const response = await request("/community");
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("<h1>Community</h1>");
    expect(response.headers.get("content-security-policy")).toContain("object-src 'none'");
    expect(response.headers.get("content-security-policy")).not.toContain("unsafe-eval");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
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
    const token = "workers-runtime-e2e-test-token-with-more-than-thirty-two-characters";
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
    const moderatorCsrf = (await moderatorPage.text()).match(/name="csrf" value="([^"]+)"/u)?.[1];
    expect(moderatorCsrf).toBeTruthy();
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
    expect(await admin.text()).toContain("Product analytics</h1>");
  });
});
