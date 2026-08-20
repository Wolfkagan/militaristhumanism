import { describe, expect, it } from "vitest";
import { createPost, createThread, listPosts, listThreads, searchCommunity, toggleReaction, toggleThreadRelationship } from "../src/community-data";
import { deletePost, getPostByPublicId, getThreadByPublicId } from "../src/member-data";
import { getCommunityTrends } from "../src/admin-data";
import { seedUser, testEnv } from "./helpers";

describe("community D1 model", () => {
  it("applies deterministic migrations with required categories and FTS", async () => {
    const migrations = await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM d1_migrations").first<number>("count");
    const categories = await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM categories").first<number>("count");
    const fts = await testEnv.DB.prepare("SELECT name FROM sqlite_schema WHERE name = 'community_search' AND type = 'table'").first();
    expect(migrations).toBe(5);
    expect(categories).toBe(10);
    expect(fts).not.toBeNull();
  });

  it("enforces foreign keys", async () => {
    await expect(
      testEnv.DB.prepare(
        "INSERT INTO threads (public_id, slug, category_id, author_id, title, body_markdown, body_rendered) VALUES ('th_aaaaaaaaaaaa','x','cat_philosophy','missing','A valid title','A body long enough for storage.','<p>x</p>')",
      ).run(),
    ).rejects.toThrow();
  });

  it("creates threads, nested replies, notifications, and searchable FTS rows", async () => {
    await seedUser("alice");
    await seedUser("bob");
    const thread = await createThread(testEnv, "alice", {
      title: "How should strength remain accountable?",
      body: "A serious opening argument about strength, restraint, and institutional review.",
      categoryId: "cat_philosophy",
    });
    const first = await createPost(testEnv, thread, "bob", { body: "Accountability must be visible and independently reviewable." });
    const second = await createPost(testEnv, thread, "alice", {
      body: "Agreed. Which institutional checks are most durable?",
      parentPublicId: first.post.public_id,
    });
    expect(second.post.public_id).toMatch(/^po_[a-f0-9]{12}$/u);
    expect(await testEnv.DB.prepare("SELECT reply_count FROM threads WHERE id = ?").bind(thread.id).first<number>("reply_count")).toBe(2);
    expect(await testEnv.DB.prepare("SELECT COUNT(*) AS count FROM notifications").first<number>("count")).toBe(2);
    const search = await searchCommunity(testEnv, "institutional review", undefined);
    expect(search.items.some((row) => row.thread_public_id === thread.public_id)).toBe(true);
  });

  it("prevents duplicate relationships and toggles reactions without global karma", async () => {
    await seedUser("alice");
    const thread = await createThread(testEnv, "alice", {
      title: "A unique reaction model for serious discussion",
      body: "This discussion tests restrained reactions and database uniqueness constraints.",
      categoryId: "cat_ethics",
    });
    await expect(
      testEnv.DB.batch([
        testEnv.DB.prepare("INSERT INTO bookmarks (user_id, thread_id) VALUES (?, ?)").bind("alice", thread.id),
        testEnv.DB.prepare("INSERT INTO bookmarks (user_id, thread_id) VALUES (?, ?)").bind("alice", thread.id),
      ]),
    ).rejects.toThrow();
    expect(await toggleThreadRelationship(testEnv, "bookmarks", "alice", thread.public_id)).toBe(true);
    expect(await toggleThreadRelationship(testEnv, "bookmarks", "alice", thread.public_id)).toBe(false);
    expect(await toggleReaction(testEnv, "alice", { targetType: "thread", targetPublicId: thread.public_id, reactionType: "insightful" })).toBe(true);
    expect(await toggleReaction(testEnv, "alice", { targetType: "thread", targetPublicId: thread.public_id, reactionType: "insightful" })).toBe(false);
    expect(await testEnv.DB.prepare("SELECT reaction_count FROM threads WHERE id = ?").bind(thread.id).first<number>("reaction_count")).toBe(0);
  });

  it("uses bounded deterministic cursor pagination", async () => {
    await seedUser("alice");
    for (let index = 0; index < 7; index += 1) {
      await createThread(testEnv, "alice", {
        title: `Discussion number ${index.toString().padStart(2, "0")} has a stable identity`,
        body: `This is distinct, sufficiently long discussion body number ${index}.`,
        categoryId: "cat_questions",
      });
    }
    const first = await listThreads(testEnv, { limit: 3, sort: "latest" });
    const second = await listThreads(testEnv, { limit: 3, sort: "latest", cursor: first.nextCursor ?? undefined });
    expect(first.items).toHaveLength(3);
    expect(second.items).toHaveLength(3);
    expect(new Set([...first.items, ...second.items].map((row) => row.public_id)).size).toBe(6);
  });

  it("blocks replies to locked threads and removes deleted reply text from public storage", async () => {
    await seedUser("alice");
    const thread = await createThread(testEnv, "alice", {
      title: "Locked discussions must reject new replies",
      body: "This discussion exists to verify the authoritative lock invariant.",
      categoryId: "cat_general",
    });
    await testEnv.DB.prepare("UPDATE threads SET is_locked = 1 WHERE id = ?").bind(thread.id).run();
    const locked = await getThreadByPublicId(testEnv, thread.public_id);
    await expect(createPost(testEnv, locked!, "alice", { body: "This must not be accepted." })).rejects.toMatchObject({ code: "THREAD_LOCKED" });
    await testEnv.DB.prepare("UPDATE threads SET is_locked = 0 WHERE id = ?").bind(thread.id).run();
    const postResult = await createPost(testEnv, thread, "alice", { body: "A reply that will be deleted safely." });
    const post = await getPostByPublicId(testEnv, postResult.post.public_id);
    await deletePost(testEnv, post!);
    const deleted = await getPostByPublicId(testEnv, postResult.post.public_id);
    expect(deleted?.status).toBe("deleted");
    expect(deleted?.body_markdown).toBe("[deleted]");
    expect(deleted?.body_rendered).toBe("");
  });

  it("caps reply pages at fifty and provides a deterministic cursor", async () => {
    await seedUser("alice");
    const thread = await createThread(testEnv, "alice", {
      title: "Reply pagination remains bounded under long discussions",
      body: "This discussion verifies that no request loads an unbounded reply history.",
      categoryId: "cat_science",
    });
    for (let index = 0; index < 53; index += 1) {
      await createPost(testEnv, thread, "alice", { body: `Distinct paginated reply number ${index}.` });
    }
    const first = await listPosts(testEnv, thread.id, "oldest");
    const second = await listPosts(testEnv, thread.id, "oldest", first.nextCursor ?? undefined);
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items).toHaveLength(3);
    expect(new Set([...first.items, ...second.items].map((post) => post.public_id)).size).toBe(53);
  });

  it("builds first-party community time series from authoritative tables", async () => {
    await seedUser("analytics-member");
    const thread = await createThread(testEnv, "analytics-member", {
      title: "Community trends must come from authoritative records",
      body: "This discussion verifies member, thread, and reply trend aggregation without invented traffic data.",
      categoryId: "cat_science",
    });
    await createPost(testEnv, thread, "analytics-member", { body: "A real reply contributes to the time series." });
    const trends = await getCommunityTrends(testEnv, "24h");
    expect(trends).toHaveLength(1);
    expect(trends[0]).toMatchObject({ new_members: 1, threads_created: 1, replies_created: 1, moderation_events: 0 });
    expect(trends[0]?.bucket_start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/u);
  });
});
