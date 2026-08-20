import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { readNonProductionTestSession } from "../src/auth";
import { createPost, createThread } from "../src/community-data";
import { createCsrfToken } from "../src/security";
import { validateTurnstile } from "../src/turnstile";
import { seedUser, testEnv } from "./helpers";

const origin = "https://militaristhumanism.com";
const e2eToken = testEnv.E2E_TEST_TOKEN;
const authSecret = testEnv.AUTH_SECRET;

async function request(path: string, init?: RequestInit, requestEnv: Env = testEnv): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(`${origin}${path}`, init), requestEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function identityHeaders(userId: string): Record<string, string> {
  return {
    "x-e2e-test-token": e2eToken,
    "x-e2e-user-id": userId,
  };
}

async function mutation(
  path: string,
  userId: string,
  values: Record<string, string>,
  method: "POST" | "PATCH" | "DELETE" = "POST",
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const csrf = await createCsrfToken(`e2e-${userId}`, authSecret);
  return request(path, {
    method,
    headers: {
      ...identityHeaders(userId),
      origin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      accept: "application/json",
      ...extraHeaders,
    },
    body: new URLSearchParams({ csrf, ...values }),
  });
}

async function errorCode(response: Response): Promise<string | undefined> {
  const payload = await response.json() as { error?: { code?: string } };
  return payload.error?.code;
}

function userPublicId(userId: string): string {
  return `usr_${userId.padEnd(12, "0").slice(0, 12)}`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adversarial application boundaries", () => {
  it("never accepts deterministic identity headers outside the local test environment", async () => {
    await seedUser("alice");
    const forged = new Request(`${origin}/community`, { headers: identityHeaders("alice") });
    expect(await readNonProductionTestSession(forged, { ...testEnv, APP_ENV: "preview" } as Env)).toBeNull();
    expect(await readNonProductionTestSession(forged, { ...testEnv, APP_ENV: "production" } as Env)).toBeNull();

    const wrongToken = new Request(`${origin}/community`, {
      headers: { ...identityHeaders("alice"), "x-e2e-test-token": `${e2eToken}-wrong` },
    });
    const malformedUser = new Request(`${origin}/community`, {
      headers: { ...identityHeaders("alice"), "x-e2e-user-id": "../../admin" },
    });
    expect(await readNonProductionTestSession(wrongToken, testEnv)).toBeNull();
    expect(await readNonProductionTestSession(malformedUser, testEnv)).toBeNull();
  });

  it("enforces the member, moderator, and administrator boundary server-side", async () => {
    await seedUser("member");
    await seedUser("moderator", "moderator");
    await seedUser("admin", "admin");

    const memberAdmin = await request("/api/admin/overview", { headers: identityHeaders("member") });
    expect(memberAdmin.status).toBe(403);
    expect(await errorCode(memberAdmin)).toBe("INSUFFICIENT_ROLE");

    const moderatorAnalytics = await request("/api/admin/analytics", { headers: identityHeaders("moderator") });
    expect(moderatorAnalytics.status).toBe(403);
    expect(await errorCode(moderatorAnalytics)).toBe("INSUFFICIENT_ROLE");

    const moderatorRoleChange = await mutation(
      "/api/admin/users/role",
      "moderator",
      { userId: "member", role: "moderator", reason: "Unauthorized role elevation attempt." },
      "PATCH",
    );
    expect(moderatorRoleChange.status).toBe(403);
    expect(await errorCode(moderatorRoleChange)).toBe("INSUFFICIENT_ROLE");

    const protectedAdmin = await mutation("/api/admin/moderation", "moderator", {
      action: "restrict",
      targetType: "user",
      targetPublicId: userPublicId("admin"),
      reason: "Attempt to restrict a protected administrator.",
      restrictionHours: "24",
    });
    expect(protectedAdmin.status).toBe(403);
    expect(await errorCode(protectedAdmin)).toBe("PROTECTED_ROLE");

    const protectedModerator = await mutation("/api/admin/moderation", "moderator", {
      action: "restrict",
      targetType: "user",
      targetPublicId: userPublicId("moderator"),
      reason: "Attempt to restrict another protected moderator.",
      restrictionHours: "24",
    });
    expect(protectedModerator.status).toBe(403);
    expect(await errorCode(protectedModerator)).toBe("PROTECTED_ROLE");
  });

  it("rejects thread, reply, and notification IDOR attempts", async () => {
    await seedUser("alice");
    await seedUser("bob");
    const thread = await createThread(testEnv, "alice", {
      title: "Ownership checks remain authoritative on every mutation",
      body: "This discussion gives the adversarial suite a concrete ownership target.",
      categoryId: "cat_philosophy",
    });
    const post = await createPost(testEnv, thread, "alice", { body: "Only the author may change this reply." });

    for (const response of [
      await mutation(`/api/community/threads/${thread.public_id}`, "bob", { title: "A hostile replacement title" }, "PATCH"),
      await mutation(`/api/community/threads/${thread.public_id}`, "bob", {}, "DELETE"),
      await mutation(`/api/community/posts/${post.post.public_id}`, "bob", { body: "A hostile replacement reply." }, "PATCH"),
      await mutation(`/api/community/posts/${post.post.public_id}`, "bob", {}, "DELETE"),
    ]) {
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe("NOT_CONTENT_OWNER");
    }

    const notice = await testEnv.DB.prepare(
      "INSERT INTO notifications (user_id, event_type, summary) VALUES ('alice', 'moderation', 'Private notice')",
    ).run();
    const notificationIdor = await mutation("/api/notifications", "bob", {
      notificationId: String(notice.meta.last_row_id),
    });
    expect(notificationIdor.status).toBe(404);
    expect(await errorCode(notificationIdor)).toBe("NOTIFICATION_NOT_FOUND");
    expect(await testEnv.DB.prepare("SELECT read_at FROM notifications WHERE id = ?")
      .bind(Number(notice.meta.last_row_id)).first<string>("read_at")).toBeNull();
  });

  it("requires an exact same-origin, session-bound CSRF token", async () => {
    await seedUser("alice");
    await seedUser("bob");
    const validCsrf = await createCsrfToken("e2e-alice", authSecret);
    const bobCsrf = await createCsrfToken("e2e-bob", authSecret);
    const body = (csrf: string) => new URLSearchParams({ csrf, displayName: "Alice", biography: "A bounded biography.", visibility: "public" });
    const baseHeaders = {
      ...identityHeaders("alice"),
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };

    const missingOrigin = await request("/api/community/profile", { method: "PATCH", headers: baseHeaders, body: body(validCsrf) });
    expect(missingOrigin.status).toBe(403);
    expect(await errorCode(missingOrigin)).toBe("CSRF_ORIGIN_REJECTED");

    const wrongOrigin = await request("/api/community/profile", {
      method: "PATCH",
      headers: { ...baseHeaders, origin: "https://attacker.invalid" },
      body: body(validCsrf),
    });
    expect(wrongOrigin.status).toBe(403);
    expect(await errorCode(wrongOrigin)).toBe("CSRF_ORIGIN_REJECTED");

    const crossSite = await request("/api/community/profile", {
      method: "PATCH",
      headers: { ...baseHeaders, origin, "sec-fetch-site": "cross-site" },
      body: body(validCsrf),
    });
    expect(crossSite.status).toBe(403);
    expect(await errorCode(crossSite)).toBe("CSRF_SITE_REJECTED");

    const otherSessionToken = await request("/api/community/profile", {
      method: "PATCH",
      headers: { ...baseHeaders, origin, "sec-fetch-site": "same-origin" },
      body: body(bobCsrf),
    });
    expect(otherSessionToken.status).toBe(403);
    expect(await errorCode(otherSessionToken)).toBe("CSRF_TOKEN_INVALID");

    const valid = await request("/api/community/profile", {
      method: "PATCH",
      headers: { ...baseHeaders, origin, "sec-fetch-site": "same-origin" },
      body: body(validCsrf),
    });
    expect(valid.status).toBe(200);
  });

  it("bounds request bodies and rejects ambiguous media types and JSON shapes", async () => {
    const oversized = await request("/api/community/threads", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: "x".repeat(65_537),
    });
    expect(oversized.status).toBe(413);
    expect(await errorCode(oversized)).toBe("PAYLOAD_TOO_LARGE");

    const unsupported = await request("/api/community/threads", {
      method: "POST",
      headers: { "content-type": "text/plain", accept: "application/json" },
      body: "plain text",
    });
    expect(unsupported.status).toBe(415);
    expect(await errorCode(unsupported)).toBe("UNSUPPORTED_MEDIA_TYPE");

    const arrayJson = await request("/api/community/threads", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: "[]",
    });
    expect(arrayJson.status).toBe(400);
    expect(await errorCode(arrayJson)).toBe("INVALID_JSON");
  });

  it("renders hostile stored content as inert text and never executable markup", async () => {
    await seedUser("alice");
    const thread = await createThread(testEnv, "alice", {
      title: "Stored <img src=x onerror=alert(1)> markup remains inert",
      body: '<script>alert("x")</script> **safe** [bad](javascript:alert(1)) <img src=x onerror=alert(2)>',
      categoryId: "cat_ethics",
    });
    const row = await testEnv.DB.prepare("SELECT body_rendered FROM threads WHERE id = ?")
      .bind(thread.id).first<{ body_rendered: string }>();
    expect(row?.body_rendered).toContain("&lt;script&gt;");
    expect(row?.body_rendered).not.toMatch(/<script|href=["']javascript:|<img[^>]+onerror/iu);

    const page = await request(`/community/t/${thread.slug}-${thread.public_id}`, { headers: { accept: "text/html" } });
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).not.toMatch(/<script[^>]*>alert|href=["']javascript:|<img[^>]+onerror/iu);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("keeps SQL and FTS metacharacters inside parameterized data boundaries", async () => {
    await seedUser("alice");
    const injectedTitle = "Robert'); DROP TABLE threads;-- remains ordinary text";
    const created = await mutation("/api/community/threads", "alice", {
      title: injectedTitle,
      body: "A parameterized body with SQL-looking text: '); DELETE FROM categories;--",
      categoryId: "cat_science",
    });
    expect(created.status).toBe(201);

    const search = await request("/api/community/search?q=%22%20OR%20*%20NEAR%20%28%29%20DROP%20TABLE%20threads%3B--");
    expect(search.status).toBe(200);
    expect(await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM threads").first<number>("count")).toBe(1);
    expect(await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM categories").first<number>("count")).toBe(10);
    expect(await testEnv.DB.prepare("SELECT name FROM sqlite_schema WHERE name = 'community_search'").first<string>("name")).toBe("community_search");
  });

  it("rejects forged identifiers, invalid enums, and cross-discussion reply parents", async () => {
    await seedUser("alice");
    const first = await createThread(testEnv, "alice", {
      title: "The first discussion owns its reply graph",
      body: "A parent reply may only be used in the discussion that contains it.",
      categoryId: "cat_questions",
    });
    const second = await createThread(testEnv, "alice", {
      title: "The second discussion has a separate reply graph",
      body: "This target verifies that reply parent identifiers are scoped by discussion.",
      categoryId: "cat_questions",
    });
    const parent = await createPost(testEnv, first, "alice", { body: "A parent in only the first discussion." });

    const forgedReaction = await mutation("/api/community/reactions", "alice", {
      targetType: "thread", targetPublicId: "th_aaaaaaaaaaaa", reactionType: "insightful",
    });
    expect(forgedReaction.status).toBe(404);

    const forgedBookmark = await mutation("/api/community/bookmarks", "alice", { threadPublicId: "th_aaaaaaaaaaaa" });
    expect(forgedBookmark.status).toBe(404);

    const forgedReport = await mutation("/api/community/reports", "alice", {
      targetType: "thread", targetPublicId: "th_aaaaaaaaaaaa", reason: "other", details: "Forged target.",
    });
    expect(forgedReport.status).toBe(404);

    const invalidReaction = await mutation("/api/community/reactions", "alice", {
      targetType: "thread", targetPublicId: first.public_id, reactionType: "admin_override",
    });
    expect(invalidReaction.status).toBe(422);

    const invalidCategory = await mutation("/api/community/threads", "alice", {
      title: "A discussion cannot select an invented category",
      body: "The server must validate category membership independently from the form.",
      categoryId: "cat_invented",
    });
    expect(invalidCategory.status).toBe(422);

    const crossThreadParent = await mutation(`/api/community/threads/${second.public_id}/posts`, "alice", {
      body: "This reply must not attach to a parent from another discussion.",
      parentPublicId: parent.post.public_id,
    });
    expect(crossThreadParent.status).toBe(422);
    expect(await errorCode(crossThreadParent)).toBe("INVALID_PARENT");
  });

  it("blocks duplicate spam, edit-time link spam, and replies to locked discussions", async () => {
    await seedUser("alice");
    const title = "Duplicate submissions are rejected deterministically";
    const body = "The same author cannot rapidly submit the same discussion twice.";
    const thread = await createThread(testEnv, "alice", { title, body, categoryId: "cat_general" });
    const duplicateThread = await mutation("/api/community/threads", "alice", { title, body, categoryId: "cat_general" });
    expect(duplicateThread.status).toBe(409);
    expect(await errorCode(duplicateThread)).toBe("DUPLICATE_DISCUSSION");

    const linkSpam = Array.from({ length: 9 }, (_, index) => `https://spam${index}.invalid`).join(" ");
    const editThread = await mutation(`/api/community/threads/${thread.public_id}`, "alice", { body: `Edited body ${linkSpam}` }, "PATCH");
    expect(editThread.status).toBe(422);
    expect(await errorCode(editThread)).toBe("LINK_LIMIT_EXCEEDED");

    const post = await createPost(testEnv, thread, "alice", { body: "A duplicate-safe reply target." });
    const duplicatePost = await mutation(`/api/community/threads/${thread.public_id}/posts`, "alice", {
      body: "A duplicate-safe reply target.",
    });
    expect(duplicatePost.status).toBe(409);
    expect(await errorCode(duplicatePost)).toBe("DUPLICATE_REPLY");

    const replyLinkSpam = Array.from({ length: 5 }, (_, index) => `https://reply-spam${index}.invalid`).join(" ");
    const editPost = await mutation(`/api/community/posts/${post.post.public_id}`, "alice", { body: `Edited reply ${replyLinkSpam}` }, "PATCH");
    expect(editPost.status).toBe(422);
    expect(await errorCode(editPost)).toBe("LINK_LIMIT_EXCEEDED");

    await testEnv.DB.prepare("UPDATE threads SET is_locked = 1 WHERE id = ?").bind(thread.id).run();
    const lockedReply = await mutation(`/api/community/threads/${thread.public_id}/posts`, "alice", {
      body: "A locked discussion must reject this reply.",
    });
    expect(lockedReply.status).toBe(409);
    expect(await errorCode(lockedReply)).toBe("THREAD_LOCKED");
  });

  it("honors emergency read-only mode while preserving an administrator recovery path", async () => {
    await seedUser("alice");
    await seedUser("admin", "admin");
    await testEnv.DB.prepare(
      "UPDATE community_settings SET setting_value = 'true' WHERE setting_key = 'community_read_only'",
    ).run();

    const blocked = await mutation("/api/community/threads", "alice", {
      title: "This discussion must wait until writes resume",
      body: "Emergency read-only mode blocks member state changes before persistence.",
      categoryId: "cat_general",
    });
    expect(blocked.status).toBe(503);
    expect(await errorCode(blocked)).toBe("COMMUNITY_READ_ONLY");
    expect(await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM threads").first<number>("count")).toBe(0);

    const recovery = await mutation(
      "/api/admin/settings/community",
      "admin",
      { readOnly: "false", reason: "Verified recovery after the security drill." },
      "PATCH",
    );
    expect(recovery.status).toBe(200);
    expect(await testEnv.DB.prepare(
      "SELECT setting_value FROM community_settings WHERE setting_key = 'community_read_only'",
    ).first<string>("setting_value")).toBe("false");
  });

  it("keeps Turnstile fail-closed and binds proof to action and hostname", async () => {
    const requestValue = new Request(`${origin}/api/community/reports`, { method: "POST" });
    const previewDisabled = {
      ...testEnv,
      APP_ENV: "preview",
      TURNSTILE_MODE: "disabled",
      TURNSTILE_SECRET: "",
    } as Env;
    await expect(validateTurnstile(requestValue, previewDisabled, "token", "report_create"))
      .rejects.toMatchObject({ code: "TURNSTILE_UNAVAILABLE" });

    const previewEnv = {
      ...testEnv,
      APP_ENV: "preview",
      TURNSTILE_MODE: "required",
      TURNSTILE_SECRET: testEnv.AUTH_SECRET,
    } as Env;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true,
      action: "oauth_start",
      hostname: "militaristhumanism.com",
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(validateTurnstile(requestValue, previewEnv, "token", "report_create"))
      .rejects.toMatchObject({ code: "TURNSTILE_FAILED" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true,
      action: "report_create",
      hostname: "attacker.invalid",
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(validateTurnstile(requestValue, previewEnv, "token", "report_create"))
      .rejects.toMatchObject({ code: "TURNSTILE_FAILED" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true,
      action: "report_create",
      hostname: "militaristhumanism.com",
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(validateTurnstile(requestValue, previewEnv, "token", "report_create")).resolves.toBeUndefined();
  });

  it("rejects invalid sessions and exposes no permissive cross-origin or framing surface", async () => {
    const invalidSession = await request("/notifications", {
      headers: { cookie: "better-auth.session_token=forged", accept: "application/json" },
    });
    expect(invalidSession.status).toBe(401);

    const page = await request("/community", { headers: { origin: "https://attacker.invalid" } });
    const csp = page.headers.get("content-security-policy") ?? "";
    expect(page.status).toBe(200);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/(?:^|;\s*)(?:default|script|connect|frame)-src\s+\*/u);
    expect(page.headers.get("access-control-allow-origin")).toBeNull();
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(page.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(page.headers.get("x-permitted-cross-domain-policies")).toBe("none");

    const admin = await request("/admin/overview", { headers: { accept: "application/json" } });
    expect(admin.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(admin.headers.get("cache-control")).toBe("private, no-store");

    const options = await request("/api/community/threads", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.invalid", "access-control-request-method": "POST" },
    });
    expect(options.status).toBeGreaterThanOrEqual(400);
    expect(options.headers.get("access-control-allow-origin")).toBeNull();
    expect(options.headers.get("access-control-allow-credentials")).toBeNull();
  });
});
