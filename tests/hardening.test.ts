import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { appendAuditEvent, verifyAuditIntegrity } from "../src/audit";
import { createCsrfToken } from "../src/security";
import { seedUser, testEnv } from "./helpers";

async function request(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(`https://militaristhumanism.com${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function authenticatedHeaders(userId: string): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    origin: "https://militaristhumanism.com",
    "x-e2e-test-token": testEnv.E2E_TEST_TOKEN,
    "x-e2e-user-id": userId,
  };
}

async function seedSessions(userId: string, count: number): Promise<void> {
  const now = new Date();
  const expires = new Date(now.getTime() + 60 * 60 * 1000);
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < count; index += 1) {
    statements.push(testEnv.DB.prepare(
      `INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).bind(
      `session-${userId}-${index}`,
      expires.toISOString(),
      `token-${userId}-${index}`,
      now.toISOString(),
      now.toISOString(),
      "security-test-agent",
      userId,
    ));
  }
  if (statements.length > 0) await testEnv.DB.batch(statements);
}

describe("production hardening invariants", () => {
  it("seals migration-window legacy events before enforcing the chain", async () => {
    await testEnv.DB.prepare(
      "INSERT INTO audit_events (actor_id, action, target_type) VALUES (NULL, 'legacy.transition', 'test')",
    ).run();
    expect(await testEnv.DB.prepare(
      "SELECT enforcement_enabled FROM audit_chain_state WHERE id = 1",
    ).first<number>("enforcement_enabled")).toBe(0);

    await appendAuditEvent(testEnv, {
      actorId: null,
      action: "security.transition_complete",
      targetType: "test",
    });
    expect(await verifyAuditIntegrity(testEnv)).toMatchObject({
      valid: true,
      legacyEvents: 1,
      chainedEvents: 1,
    });
    expect(await testEnv.DB.prepare(
      "SELECT enforcement_enabled FROM audit_chain_state WHERE id = 1",
    ).first<number>("enforcement_enabled")).toBe(1);
  });

  it("serializes concurrent audit events into a verifiable HMAC chain", async () => {
    await seedUser("aabbccddeeff", "admin");
    await Promise.all([
      appendAuditEvent(testEnv, {
        actorId: "aabbccddeeff",
        action: "security.concurrent_one",
        targetType: "test",
        targetPublicId: "test_one",
      }),
      appendAuditEvent(testEnv, {
        actorId: "aabbccddeeff",
        action: "security.concurrent_two",
        targetType: "test",
        targetPublicId: "test_two",
      }),
    ]);

    const status = await verifyAuditIntegrity(testEnv);
    expect(status).toMatchObject({ valid: true, legacyEvents: 0, chainedEvents: 2 });
    expect(status.headFingerprint).toMatch(/^[A-Za-z0-9_-]{16}$/u);
    const rows = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN previous_hash IS NOT NULL AND event_hash IS NOT NULL THEN 1 ELSE 0 END) AS chained FROM audit_events",
    ).first<{ total: number; chained: number }>();
    expect(rows).toEqual({ total: 2, chained: 2 });
  });

  it("rejects audit updates, deletes, and unchained inserts", async () => {
    await seedUser("aabbccddeeff", "admin");
    await appendAuditEvent(testEnv, {
      actorId: "aabbccddeeff",
      action: "security.immutable",
      targetType: "test",
    });
    await expect(testEnv.DB.prepare("UPDATE audit_events SET action = 'tampered'").run()).rejects.toThrow(/AUDIT_EVENTS_IMMUTABLE/u);
    await expect(testEnv.DB.prepare("DELETE FROM audit_events").run()).rejects.toThrow(/AUDIT_EVENTS_IMMUTABLE/u);
    await expect(testEnv.DB.prepare(
      "INSERT INTO audit_events (actor_id, action, target_type) VALUES (?, 'security.unchained', 'test')",
    ).bind("aabbccddeeff").run()).rejects.toThrow(/AUDIT_CHAIN_REQUIRED/u);
    expect((await verifyAuditIntegrity(testEnv)).valid).toBe(true);
  });

  it("detects control-plane tampering with the recorded chain head", async () => {
    await appendAuditEvent(testEnv, {
      actorId: null,
      action: "security.tamper_probe",
      targetType: "test",
    });
    await testEnv.DB.prepare("UPDATE audit_chain_state SET head_hash = 'invalid-head'").run();
    expect((await verifyAuditIntegrity(testEnv)).valid).toBe(false);
  });

  it("keeps the audit key independent from auth rotation and fails closed without it", async () => {
    await appendAuditEvent(testEnv, {
      actorId: null,
      action: "security.key_separation",
      targetType: "test",
    });
    const authRotatedEnv = {
      ...testEnv,
      AUTH_SECRET: "rotated-auth-secret-with-at-least-thirty-two-characters",
    } as Env;
    expect((await verifyAuditIntegrity(authRotatedEnv)).valid).toBe(true);

    const missingAuditSecretEnv = { ...testEnv, AUDIT_INTEGRITY_SECRET: "" } as Env;
    await expect(appendAuditEvent(missingAuditSecretEnv, {
      actorId: null,
      action: "security.must_fail_closed",
      targetType: "test",
    })).rejects.toMatchObject({ code: "AUDIT_CHAIN_SECRET_UNAVAILABLE", status: 503 });
  });

  it("lets a member revoke every own session and expires the browser cookie", async () => {
    const memberId = "aabbccddeeff";
    await seedUser(memberId);
    await seedSessions(memberId, 3);
    const csrf = await createCsrfToken(`e2e-${memberId}`, testEnv.AUTH_SECRET);
    const response = await request("/api/account/sessions/revoke-all", {
      method: "POST",
      headers: authenticatedHeaders(memberId),
      body: new URLSearchParams({ csrf, returnTo: "/community/sign-in" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revoked: 3, signedOut: true });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM "session" WHERE "userId" = ?')
      .bind(memberId).first<number>("count")).toBe(0);
    expect((await verifyAuditIntegrity(testEnv)).valid).toBe(true);
  });

  it("allows only admins to revoke non-admin sessions with a reason", async () => {
    const adminId = "aabbccddeeff";
    const moderatorId = "abcdef123456";
    const targetId = "112233445566";
    const protectedAdminId = "ffeeddccbbaa";
    await seedUser(adminId, "admin");
    await seedUser(moderatorId, "moderator");
    await seedUser(targetId);
    await seedUser(protectedAdminId, "admin");
    await seedSessions(targetId, 2);
    await seedSessions(protectedAdminId, 1);

    const moderatorCsrf = await createCsrfToken(`e2e-${moderatorId}`, testEnv.AUTH_SECRET);
    const denied = await request("/api/admin/sessions/revoke", {
      method: "POST",
      headers: authenticatedHeaders(moderatorId),
      body: new URLSearchParams({
        csrf: moderatorCsrf,
        targetPublicId: `usr_${targetId}`,
        reason: "Moderator must not receive administrator session controls.",
      }),
    });
    expect(denied.status).toBe(403);

    const adminCsrf = await createCsrfToken(`e2e-${adminId}`, testEnv.AUTH_SECRET);
    const revoked = await request("/api/admin/sessions/revoke", {
      method: "POST",
      headers: authenticatedHeaders(adminId),
      body: new URLSearchParams({
        csrf: adminCsrf,
        targetPublicId: `usr_${targetId}`,
        reason: "Confirmed account security response requires session revocation.",
      }),
    });
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ revoked: 2 });

    const protectedResponse = await request("/api/admin/sessions/revoke", {
      method: "POST",
      headers: authenticatedHeaders(adminId),
      body: new URLSearchParams({
        csrf: adminCsrf,
        targetPublicId: `usr_${protectedAdminId}`,
        reason: "Attempted protected administrator session action.",
      }),
    });
    expect(protectedResponse.status).toBe(403);
    expect(await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM "session" WHERE "userId" = ?')
      .bind(protectedAdminId).first<number>("count")).toBe(1);
    expect((await verifyAuditIntegrity(testEnv)).valid).toBe(true);
  });
});
