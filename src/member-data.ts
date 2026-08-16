import { AppError } from "./http";
import type { PostRow, ProfileRow, ThreadCardRow, ThreadRow } from "./model";
import { createPublicId } from "./db";
import { enforceLinkBudget, renderMarkdown } from "./markdown";

export interface NotificationRow {
  id: number;
  event_type: string;
  summary: string;
  created_at: string;
  read_at: string | null;
  actor_handle: string | null;
  thread_public_id: string | null;
  thread_slug: string | null;
  post_public_id: string | null;
}

export interface PublicProfile extends ProfileRow {
  thread_count: number;
  reply_count: number;
}

export async function createReport(
  env: Env,
  reporterId: string,
  input: { targetType: "thread" | "post" | "user"; targetPublicId: string; reason: string; details: string },
): Promise<string> {
  const table = input.targetType === "thread" ? "threads" : input.targetType === "post" ? "posts" : "user_profiles";
  const targetColumn = input.targetType === "user" ? "public_id" : "public_id";
  const target = await env.DB.prepare(`SELECT 1 AS found FROM ${table} WHERE ${targetColumn} = ?`).bind(input.targetPublicId).first();
  if (target === null) {
    throw new AppError(404, "REPORT_TARGET_NOT_FOUND", "The content or member could not be found.");
  }
  const duplicate = await env.DB.prepare(
    `SELECT public_id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_public_id = ?
     AND status IN ('open', 'reviewing') LIMIT 1`,
  )
    .bind(reporterId, input.targetType, input.targetPublicId)
    .first();
  if (duplicate !== null) {
    throw new AppError(409, "REPORT_ALREADY_OPEN", "You already have an open report for this target.");
  }
  const publicId = createPublicId("rp");
  await env.DB.prepare(
    "INSERT INTO reports (public_id, reporter_id, target_type, target_public_id, reason, details) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(publicId, reporterId, input.targetType, input.targetPublicId, input.reason, input.details)
    .run();
  return publicId;
}

export async function listNotifications(env: Env, userId: string): Promise<NotificationRow[]> {
  const result = await env.DB.prepare(
    `SELECT n.id, n.event_type, n.summary, n.created_at, n.read_at, actor.handle AS actor_handle,
            t.public_id AS thread_public_id, t.slug AS thread_slug, p.public_id AS post_public_id
     FROM notifications n
     LEFT JOIN user_profiles actor ON actor.user_id = n.actor_id
     LEFT JOIN threads t ON t.id = n.thread_id
     LEFT JOIN posts p ON p.id = n.post_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 100`,
  )
    .bind(userId)
    .all<NotificationRow>();
  return result.results;
}

export async function markNotifications(
  env: Env,
  userId: string,
  input: { notificationId?: number; markAll?: boolean },
): Promise<void> {
  if (input.markAll === true) {
    await env.DB.prepare(
      "UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE user_id = ? AND read_at IS NULL",
    )
      .bind(userId)
      .run();
    return;
  }
  if (input.notificationId === undefined) {
    throw new AppError(422, "NOTIFICATION_REQUIRED", "Choose a notification to mark as read.");
  }
  const result = await env.DB.prepare(
    `UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(input.notificationId, userId)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new AppError(404, "NOTIFICATION_NOT_FOUND", "The notification was not found.");
  }
}

const savedThreadSelection = `
  SELECT t.*, c.slug AS category_slug, c.name AS category_name,
         p.handle AS author_handle, p.display_name AS author_name
  FROM threads t
  JOIN categories c ON c.id = t.category_id
  JOIN user_profiles p ON p.user_id = t.author_id`;

export async function listSavedThreads(
  env: Env,
  userId: string,
  relationship: "bookmarks" | "thread_follows",
): Promise<ThreadCardRow[]> {
  const relationshipAlias = relationship === "bookmarks" ? "b" : "f";
  const result = await env.DB.prepare(
    `${savedThreadSelection}
     JOIN ${relationship} ${relationshipAlias} ON ${relationshipAlias}.thread_id = t.id
     WHERE ${relationshipAlias}.user_id = ? AND t.status = 'visible'
     ORDER BY ${relationshipAlias}.created_at DESC LIMIT 100`,
  )
    .bind(userId)
    .all<ThreadCardRow>();
  return result.results;
}

export async function getPublicProfile(env: Env, handle: string): Promise<PublicProfile | null> {
  return env.DB.prepare(
    `SELECT p.*,
      (SELECT COUNT(*) FROM threads t WHERE t.author_id = p.user_id AND t.status = 'visible') AS thread_count,
      (SELECT COUNT(*) FROM posts po WHERE po.author_id = p.user_id AND po.status = 'visible') AS reply_count
     FROM user_profiles p WHERE p.handle = ? COLLATE NOCASE`,
  )
    .bind(handle)
    .first<PublicProfile>();
}

export async function recentProfileThreads(env: Env, userId: string): Promise<ThreadCardRow[]> {
  const result = await env.DB.prepare(
    `${savedThreadSelection} WHERE t.author_id = ? AND t.status = 'visible'
     ORDER BY t.created_at DESC LIMIT 12`,
  )
    .bind(userId)
    .all<ThreadCardRow>();
  return result.results;
}

export async function recentProfilePosts(
  env: Env,
  userId: string,
): Promise<Array<{ public_id: string; body_markdown: string; created_at: string; thread_public_id: string; thread_slug: string; thread_title: string }>> {
  const result = await env.DB.prepare(
    `SELECT p.public_id, p.body_markdown, p.created_at, t.public_id AS thread_public_id,
            t.slug AS thread_slug, t.title AS thread_title
     FROM posts p JOIN threads t ON t.id = p.thread_id
     WHERE p.author_id = ? AND p.status = 'visible' AND t.status = 'visible'
     ORDER BY p.created_at DESC LIMIT 12`,
  )
    .bind(userId)
    .all<{ public_id: string; body_markdown: string; created_at: string; thread_public_id: string; thread_slug: string; thread_title: string }>();
  return result.results;
}

export async function updateProfile(
  env: Env,
  userId: string,
  input: { displayName: string; biography: string; visibility: "public" | "limited" },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE user_profiles SET display_name = ?, biography = ?, visibility = ?,
     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE user_id = ?`,
  )
    .bind(input.displayName, input.biography, input.visibility, userId)
    .run();
}

export async function updatePost(env: Env, post: PostRow, body: string): Promise<void> {
  enforceLinkBudget(body, 4);
  await env.DB.prepare(
    `UPDATE posts SET body_markdown = ?, body_rendered = ?,
     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status = 'visible'`,
  )
    .bind(body, renderMarkdown(body), post.id)
    .run();
}

export async function deletePost(env: Env, post: PostRow): Promise<void> {
  if (post.status !== "visible") return;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE posts SET status = 'deleted', body_markdown = '[deleted]', body_rendered = '',
       deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ).bind(post.id),
    env.DB.prepare("UPDATE threads SET reply_count = MAX(0, reply_count - 1) WHERE id = ?").bind(post.thread_id),
    env.DB.prepare("DELETE FROM reactions WHERE target_type = 'post' AND target_public_id = ?").bind(post.public_id),
  ]);
}

export async function deleteThread(env: Env, thread: ThreadRow): Promise<void> {
  if (thread.status !== "visible") return;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE threads SET status = 'deleted', title = '[Deleted discussion]', body_markdown = '[deleted]', body_rendered = '',
       deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ).bind(thread.id),
    env.DB.prepare("DELETE FROM reactions WHERE target_type = 'thread' AND target_public_id = ?").bind(thread.public_id),
  ]);
}

export async function getPostByPublicId(env: Env, publicId: string): Promise<PostRow | null> {
  return env.DB.prepare("SELECT * FROM posts WHERE public_id = ?").bind(publicId).first<PostRow>();
}

export async function getThreadByPublicId(env: Env, publicId: string): Promise<ThreadRow | null> {
  return env.DB.prepare("SELECT * FROM threads WHERE public_id = ?").bind(publicId).first<ThreadRow>();
}
