import { AppError } from "./http";
import type { CategoryRow, PostViewRow, ThreadCardRow, ThreadRow } from "./model";
import { createPublicId, decodeCursor, encodeCursor, slugify, threadPath } from "./db";
import { enforceLinkBudget, renderMarkdown } from "./markdown";

export type FeedSort = "latest" | "active" | "popular" | "unanswered";
export type ReplySort = "best" | "newest" | "oldest" | "most-discussed";

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ThreadDetail extends ThreadCardRow {
  viewer_bookmarked: number;
  viewer_following: number;
}

export interface ReactionSummary {
  reaction_type: "insightful" | "agree" | "question" | "well_argued";
  reaction_count: number;
  viewer_reacted: number;
}

export interface TargetReactionSummary extends ReactionSummary {
  target_public_id: string;
}

export interface SearchRow {
  row_id: number;
  target_type: "thread" | "post";
  target_public_id: string;
  thread_public_id: string;
  thread_title: string;
  thread_slug: string;
  body: string;
}

export interface CommunityStats {
  members: number;
  discussions: number;
  replies: number;
  unanswered: number;
}

export async function getCommunityStats(env: Env): Promise<CommunityStats> {
  const results = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS value FROM user_profiles"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM threads WHERE status = 'visible'"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM posts WHERE status = 'visible'"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM threads WHERE status = 'visible' AND reply_count = 0"),
  ]);
  const value = (index: number): number => Number((results[index]?.results[0] as { value?: unknown } | undefined)?.value ?? 0);
  return { members: value(0), discussions: value(1), replies: value(2), unanswered: value(3) };
}

const threadSelection = `
  SELECT t.*, c.slug AS category_slug, c.name AS category_name,
         p.handle AS author_handle, p.display_name AS author_name
  FROM threads t
  JOIN categories c ON c.id = t.category_id
  JOIN user_profiles p ON p.user_id = t.author_id`;

export async function listCategories(env: Env, includeHidden = false): Promise<CategoryRow[]> {
  const query = includeHidden
    ? "SELECT * FROM categories ORDER BY sort_order ASC, name ASC"
    : "SELECT * FROM categories WHERE is_visible = 1 ORDER BY sort_order ASC, name ASC";
  const result = await env.DB.prepare(query).all<CategoryRow>();
  return result.results;
}

function normalizedFeedSort(value: string | undefined): FeedSort {
  return value === "active" || value === "popular" || value === "unanswered" ? value : "latest";
}

export async function listThreads(
  env: Env,
  options: { sort?: string | undefined; categorySlug?: string | undefined; cursor?: string | undefined; limit?: number | undefined } = {},
): Promise<PageResult<ThreadCardRow>> {
  const sort = normalizedFeedSort(options.sort);
  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const cursor = decodeCursor(options.cursor);
  const sortColumn = sort === "latest" ? "t.created_at" : sort === "popular" ? "t.reaction_count" : "t.last_activity_at";
  const sortValue = sort === "popular" ? (typeof cursor?.value === "number" ? cursor.value : null) : (typeof cursor?.value === "string" ? cursor.value : null);
  const clauses = ["t.status = 'visible'", "c.is_visible = 1"];
  const bindings: unknown[] = [];
  if (sort === "unanswered") {
    clauses.push("t.reply_count = 0");
  }
  if (options.categorySlug !== undefined) {
    clauses.push("c.slug = ?");
    bindings.push(options.categorySlug);
  }
  if (cursor !== null && sortValue !== null) {
    clauses.push(`(${sortColumn} < ? OR (${sortColumn} = ? AND t.id < ?))`);
    bindings.push(sortValue, sortValue, cursor.id);
  }
  bindings.push(limit + 1);
  const result = await env.DB.prepare(
    `${threadSelection} WHERE ${clauses.join(" AND ")}
     ORDER BY ${sortColumn} DESC, t.id DESC LIMIT ?`,
  )
    .bind(...bindings)
    .all<ThreadCardRow>();
  const hasNext = result.results.length > limit;
  const items = result.results.slice(0, limit);
  const last = items.at(-1);
  const cursorValue = last === undefined ? null : sort === "latest" ? last.created_at : sort === "popular" ? last.reaction_count : last.last_activity_at;
  return {
    items,
    nextCursor: hasNext && last !== undefined && cursorValue !== null ? encodeCursor({ value: cursorValue, id: last.id }) : null,
  };
}

export async function listPinnedThreads(env: Env, limit = 3): Promise<ThreadCardRow[]> {
  const result = await env.DB.prepare(
    `${threadSelection} WHERE t.status = 'visible' AND t.is_pinned = 1 AND c.is_visible = 1
     ORDER BY t.last_activity_at DESC, t.id DESC LIMIT ?`,
  )
    .bind(Math.max(1, Math.min(limit, 10)))
    .all<ThreadCardRow>();
  return result.results;
}

export async function getThread(env: Env, publicId: string, viewerId: string | null): Promise<ThreadDetail | null> {
  return env.DB.prepare(
    `SELECT t.*, c.slug AS category_slug, c.name AS category_name,
       p.handle AS author_handle, p.display_name AS author_name,
       EXISTS(SELECT 1 FROM bookmarks b WHERE b.thread_id = t.id AND b.user_id = ?) AS viewer_bookmarked,
       EXISTS(SELECT 1 FROM thread_follows f WHERE f.thread_id = t.id AND f.user_id = ?) AS viewer_following
     FROM threads t
     JOIN categories c ON c.id = t.category_id
     JOIN user_profiles p ON p.user_id = t.author_id
     WHERE t.public_id = ? AND t.status = 'visible' AND c.is_visible = 1`,
  )
    .bind(viewerId ?? "", viewerId ?? "", publicId)
    .first<ThreadDetail>();
}

export async function listPosts(
  env: Env,
  threadId: number,
  sortValue: string | undefined,
  cursorValue?: string | undefined,
  requestedLimit = 50,
): Promise<PageResult<PostViewRow>> {
  const sort: ReplySort =
    sortValue === "newest" || sortValue === "best" || sortValue === "most-discussed" ? sortValue : "oldest";
  const limit = Math.max(1, Math.min(requestedLimit, 50));
  const cursor = decodeCursor(cursorValue);
  const sortColumn = sort === "best" ? "reaction_count" : sort === "most-discussed" ? "child_count" : "created_at";
  const order =
    sort === "newest"
      ? "created_at DESC, id DESC"
      : sort === "best"
        ? "reaction_count DESC, id ASC"
        : sort === "most-discussed"
          ? "child_count DESC, id ASC"
          : "created_at ASC, id ASC";
  const cursorIsValid = cursor !== null && (sortColumn === "created_at" ? typeof cursor.value === "string" : typeof cursor.value === "number");
  const cursorClause = !cursorIsValid
    ? ""
    : sort === "oldest"
      ? `AND (${sortColumn} > ? OR (${sortColumn} = ? AND id > ?))`
      : sort === "newest"
        ? `AND (${sortColumn} < ? OR (${sortColumn} = ? AND id < ?))`
        : `AND (${sortColumn} < ? OR (${sortColumn} = ? AND id > ?))`;
  const bindings: unknown[] = [threadId];
  if (cursorIsValid && cursor !== null) bindings.push(cursor.value, cursor.value, cursor.id);
  bindings.push(limit + 1);
  const result = await env.DB.prepare(
    `WITH post_rows AS (
       SELECT po.*, up.handle AS author_handle, up.display_name AS author_name, up.role AS author_role,
            parent.public_id AS parent_public_id,
            (SELECT COUNT(*) FROM posts child WHERE child.parent_post_id = po.id AND child.status = 'visible') AS child_count
       FROM posts po
       JOIN user_profiles up ON up.user_id = po.author_id
       LEFT JOIN posts parent ON parent.id = po.parent_post_id
     )
     SELECT * FROM post_rows WHERE thread_id = ? AND status IN ('visible', 'deleted') ${cursorClause}
     ORDER BY ${order} LIMIT ?`,
  )
    .bind(...bindings)
    .all<PostViewRow>();
  const hasNext = result.results.length > limit;
  const items = result.results.slice(0, limit);
  const last = items.at(-1);
  const nextValue = last === undefined ? null : sort === "best" ? last.reaction_count : sort === "most-discussed" ? last.child_count : last.created_at;
  return {
    items,
    nextCursor: hasNext && last !== undefined && nextValue !== null ? encodeCursor({ value: nextValue, id: last.id }) : null,
  };
}

export async function reactionSummary(
  env: Env,
  targetType: "thread" | "post",
  targetPublicId: string,
  viewerId: string | null,
): Promise<ReactionSummary[]> {
  const result = await env.DB.prepare(
    `SELECT reaction_type, COUNT(*) AS reaction_count,
            MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS viewer_reacted
     FROM reactions WHERE target_type = ? AND target_public_id = ?
     GROUP BY reaction_type ORDER BY reaction_type`,
  )
    .bind(viewerId ?? "", targetType, targetPublicId)
    .all<ReactionSummary>();
  return result.results;
}

export async function postReactionSummaries(
  env: Env,
  postPublicIds: string[],
  viewerId: string | null,
): Promise<TargetReactionSummary[]> {
  if (postPublicIds.length === 0) return [];
  const boundedIds = postPublicIds.slice(0, 50);
  const placeholders = boundedIds.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `SELECT r.target_public_id, r.reaction_type, COUNT(*) AS reaction_count,
            MAX(CASE WHEN r.user_id = ? THEN 1 ELSE 0 END) AS viewer_reacted
     FROM reactions r JOIN posts p ON p.public_id = r.target_public_id
     WHERE r.target_type = 'post' AND p.public_id IN (${placeholders}) AND p.status = 'visible'
     GROUP BY r.target_public_id, r.reaction_type ORDER BY r.target_public_id, r.reaction_type`,
  )
    .bind(viewerId ?? "", ...boundedIds)
    .all<TargetReactionSummary>();
  return result.results;
}

export async function createThread(
  env: Env,
  userId: string,
  input: { title: string; body: string; categoryId: string },
): Promise<ThreadRow> {
  enforceLinkBudget(input.body, 8);
  const category = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND is_visible = 1")
    .bind(input.categoryId)
    .first<{ id: string }>();
  if (category === null) {
    throw new AppError(422, "INVALID_CATEGORY", "Choose a valid category.");
  }
  const duplicate = await env.DB.prepare(
    `SELECT public_id FROM threads WHERE author_id = ? AND title = ? AND body_markdown = ?
     AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes') LIMIT 1`,
  )
    .bind(userId, input.title, input.body)
    .first<{ public_id: string }>();
  if (duplicate !== null) {
    throw new AppError(409, "DUPLICATE_DISCUSSION", "This discussion was already submitted.");
  }
  const publicId = createPublicId("th");
  const slug = slugify(input.title);
  const result = await env.DB.prepare(
    `INSERT INTO threads (public_id, slug, category_id, author_id, title, body_markdown, body_rendered)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(publicId, slug, input.categoryId, userId, input.title, input.body, renderMarkdown(input.body))
    .run();
  const created = await env.DB.prepare("SELECT * FROM threads WHERE id = ?")
    .bind(Number(result.meta.last_row_id))
    .first<ThreadRow>();
  if (created === null) {
    throw new Error("The new discussion could not be read after creation.");
  }
  return created;
}

export async function updateThread(
  env: Env,
  thread: ThreadRow,
  input: { title?: string | undefined; body?: string | undefined; categoryId?: string | undefined },
): Promise<ThreadRow> {
  if (input.categoryId !== undefined) {
    const category = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND is_visible = 1")
      .bind(input.categoryId)
      .first();
    if (category === null) {
      throw new AppError(422, "INVALID_CATEGORY", "Choose a valid category.");
    }
  }
  const title = input.title ?? thread.title;
  const body = input.body ?? thread.body_markdown;
  enforceLinkBudget(body, 8);
  await env.DB.prepare(
    `UPDATE threads SET title = ?, slug = ?, body_markdown = ?, body_rendered = ?, category_id = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  )
    .bind(title, slugify(title), body, renderMarkdown(body), input.categoryId ?? thread.category_id, thread.id)
    .run();
  const updated = await env.DB.prepare("SELECT * FROM threads WHERE id = ?").bind(thread.id).first<ThreadRow>();
  if (updated === null) {
    throw new Error("The discussion disappeared while updating.");
  }
  return updated;
}

export async function createPost(
  env: Env,
  thread: ThreadRow,
  userId: string,
  input: { body: string; parentPublicId?: string },
): Promise<{ post: { id: number; public_id: string }; notificationCount: number }> {
  enforceLinkBudget(input.body, 4);
  if (thread.is_locked === 1) {
    throw new AppError(409, "THREAD_LOCKED", "This discussion is locked.");
  }
  let parent: { id: number; author_id: string } | null = null;
  if (input.parentPublicId !== undefined && input.parentPublicId.length > 0) {
    parent = await env.DB.prepare(
      "SELECT id, author_id FROM posts WHERE public_id = ? AND thread_id = ? AND status = 'visible'",
    )
      .bind(input.parentPublicId, thread.id)
      .first<{ id: number; author_id: string }>();
    if (parent === null) {
      throw new AppError(422, "INVALID_PARENT", "The reply target is not part of this discussion.");
    }
  }
  const duplicate = await env.DB.prepare(
    `SELECT public_id FROM posts WHERE author_id = ? AND thread_id = ? AND body_markdown = ?
     AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 seconds') LIMIT 1`,
  )
    .bind(userId, thread.id, input.body)
    .first();
  if (duplicate !== null) {
    throw new AppError(409, "DUPLICATE_REPLY", "This reply was already submitted.");
  }
  const publicId = createPublicId("po");
  const inserted = await env.DB.prepare(
    `INSERT INTO posts (public_id, thread_id, author_id, parent_post_id, body_markdown, body_rendered)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(publicId, thread.id, userId, parent?.id ?? null, input.body, renderMarkdown(input.body))
    .run();
  const postId = Number(inserted.meta.last_row_id);
  const notificationRecipient = parent?.author_id ?? thread.author_id;
  const statements = [
    env.DB.prepare(
      `UPDATE threads SET reply_count = reply_count + 1,
       last_activity_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    ).bind(thread.id),
  ];
  let notificationCount = 0;
  if (notificationRecipient !== userId) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO notifications (user_id, actor_id, event_type, thread_id, post_id, summary)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        notificationRecipient,
        userId,
        parent === null ? "thread_reply" : "post_reply",
        thread.id,
        postId,
        parent === null ? "A member replied to your discussion." : "A member replied to your comment.",
      ),
    );
    notificationCount += 1;
  }
  if ((thread.reply_count + 1) % 5 === 0) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO notifications (user_id, actor_id, event_type, thread_id, post_id, summary)
         SELECT user_id, ?, 'follow_activity', ?, ?, 'A discussion you follow has new activity.'
         FROM thread_follows WHERE thread_id = ? AND user_id <> ? AND user_id <> ?`,
      ).bind(userId, thread.id, postId, thread.id, userId, notificationRecipient),
    );
  }
  await env.DB.batch(statements);
  return { post: { id: postId, public_id: publicId }, notificationCount };
}

export async function toggleReaction(
  env: Env,
  userId: string,
  input: { targetType: "thread" | "post"; targetPublicId: string; reactionType: string },
): Promise<boolean> {
  const table = input.targetType === "thread" ? "threads" : "posts";
  const target = await env.DB.prepare(`SELECT id FROM ${table} WHERE public_id = ? AND status = 'visible'`)
    .bind(input.targetPublicId)
    .first<{ id: number }>();
  if (target === null) {
    throw new AppError(404, "REACTION_TARGET_NOT_FOUND", "The content is no longer available.");
  }
  const existing = await env.DB.prepare(
    "SELECT id FROM reactions WHERE user_id = ? AND target_type = ? AND target_public_id = ? AND reaction_type = ?",
  )
    .bind(userId, input.targetType, input.targetPublicId, input.reactionType)
    .first<{ id: number }>();
  const counterStatement = env.DB.prepare(
    `UPDATE ${table} SET reaction_count = MAX(0, reaction_count + ?) WHERE id = ?`,
  ).bind(existing === null ? 1 : -1, target.id);
  if (existing === null) {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO reactions (user_id, target_type, target_public_id, reaction_type) VALUES (?, ?, ?, ?)",
      ).bind(userId, input.targetType, input.targetPublicId, input.reactionType),
      counterStatement,
    ]);
    return true;
  }
  await env.DB.batch([env.DB.prepare("DELETE FROM reactions WHERE id = ?").bind(existing.id), counterStatement]);
  return false;
}

export async function toggleThreadRelationship(
  env: Env,
  table: "bookmarks" | "thread_follows",
  userId: string,
  publicId: string,
): Promise<boolean> {
  const thread = await env.DB.prepare("SELECT id FROM threads WHERE public_id = ? AND status = 'visible'")
    .bind(publicId)
    .first<{ id: number }>();
  if (thread === null) {
    throw new AppError(404, "THREAD_NOT_FOUND", "The discussion is no longer available.");
  }
  const existing = await env.DB.prepare(`SELECT 1 AS found FROM ${table} WHERE user_id = ? AND thread_id = ?`)
    .bind(userId, thread.id)
    .first();
  if (existing === null) {
    await env.DB.prepare(`INSERT INTO ${table} (user_id, thread_id) VALUES (?, ?)`).bind(userId, thread.id).run();
    return true;
  }
  await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ? AND thread_id = ?`).bind(userId, thread.id).run();
  return false;
}

export async function searchCommunity(
  env: Env,
  rawQuery: string,
  cursorValue: string | undefined,
  limit = 20,
): Promise<PageResult<SearchRow>> {
  const terms = (rawQuery.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 8);
  if (terms.length === 0) {
    return { items: [], nextCursor: null };
  }
  const matchQuery = terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(" AND ");
  const cursor = decodeCursor(cursorValue);
  const rowCursor = typeof cursor?.value === "number" ? cursor.value : Number.MAX_SAFE_INTEGER;
  const boundedLimit = Math.max(1, Math.min(limit, 50));
  const result = await env.DB.prepare(
    `SELECT community_search.rowid AS row_id, community_search.target_type, community_search.target_public_id,
            community_search.thread_public_id, t.title AS thread_title, t.slug AS thread_slug,
            community_search.body
     FROM community_search
     JOIN threads t ON t.public_id = community_search.thread_public_id
     WHERE community_search MATCH ? AND community_search.rowid < ? AND t.status = 'visible'
     ORDER BY community_search.rowid DESC LIMIT ?`,
  )
    .bind(matchQuery, rowCursor, boundedLimit + 1)
    .all<SearchRow>();
  const hasNext = result.results.length > boundedLimit;
  const items = result.results.slice(0, boundedLimit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasNext && last !== undefined ? encodeCursor({ value: last.row_id, id: last.row_id }) : null,
  };
}

export function canonicalThreadPath(thread: Pick<ThreadRow, "slug" | "public_id">): string {
  return threadPath(thread.slug, thread.public_id);
}
