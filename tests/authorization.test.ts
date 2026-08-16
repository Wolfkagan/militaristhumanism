import { describe, expect, it } from "vitest";
import type { Context } from "hono";
import { requireRole } from "../src/access";
import type { AppBindings, AppSession, Role } from "../src/model";
import { createThread } from "../src/community-data";
import { createReport, markNotifications } from "../src/member-data";
import { performModeration } from "../src/admin-data";
import { seedUser, testEnv } from "./helpers";

function session(role: Role): AppSession {
  return {
    id: `session-${role}`,
    expiresAt: new Date(Date.now() + 60_000),
    isNewProfile: false,
    user: { id: role, name: role, email: `${role}@test.invalid` },
    profile: { user_id: role, public_id: `usr_${role.padEnd(12, "0").slice(0, 12)}`, handle: role, display_name: role, biography: "", role, visibility: "public", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  };
}

function contextFor(role: Role): Context<AppBindings> {
  return { get: (key: string) => (key === "session" ? session(role) : undefined) } as unknown as Context<AppBindings>;
}

describe("server-side authorization", () => {
  it("prevents members from moderating and moderators from becoming admin", () => {
    expect(() => requireRole(contextFor("member"), "moderator")).toThrowError(/permission/u);
    expect(() => requireRole(contextFor("moderator"), "admin")).toThrowError(/permission/u);
    expect(requireRole(contextFor("admin"), "admin").profile.role).toBe("admin");
  });

  it("prevents notification IDOR", async () => {
    await seedUser("alice");
    await seedUser("bob");
    const result = await testEnv.DB.prepare(
      "INSERT INTO notifications (user_id, event_type, summary) VALUES ('alice', 'moderation', 'Private notice')",
    ).run();
    await expect(markNotifications(testEnv, "bob", { notificationId: Number(result.meta.last_row_id) })).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND" });
    expect(await testEnv.DB.prepare("SELECT read_at FROM notifications WHERE id = ?").bind(Number(result.meta.last_row_id)).first<string>("read_at")).toBeNull();
  });

  it("records reasoned moderation, preserves a snapshot, and locks the thread", async () => {
    await seedUser("alice");
    await seedUser("moderator", "moderator");
    const thread = await createThread(testEnv, "alice", {
      title: "A thread requiring reasoned moderation",
      body: "This body must be preserved for restricted moderator evidence.",
      categoryId: "cat_critiques",
    });
    await performModeration(testEnv, "moderator", "moderator", { action: "hide", targetType: "thread", targetPublicId: thread.public_id, reason: "A sufficiently detailed moderation reason." });
    expect(await testEnv.DB.prepare("SELECT status FROM threads WHERE id = ?").bind(thread.id).first<string>("status")).toBe("hidden");
    expect(await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM moderation_content_snapshots").first<number>("count")).toBe(1);
    expect(await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM audit_events").first<number>("count")).toBe(1);
  });

  it("prevents duplicate open reports", async () => {
    await seedUser("alice");
    const thread = await createThread(testEnv, "alice", { title: "Report duplication should be bounded", body: "This is a real target for the report uniqueness behavior.", categoryId: "cat_general" });
    await createReport(testEnv, "alice", { targetType: "thread", targetPublicId: thread.public_id, reason: "other", details: "First report" });
    await expect(createReport(testEnv, "alice", { targetType: "thread", targetPublicId: thread.public_id, reason: "other", details: "Duplicate report" })).rejects.toMatchObject({ code: "REPORT_ALREADY_OPEN" });
  });
});
