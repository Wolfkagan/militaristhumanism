import { AppError } from "./http";
import type { ReportRow, Role } from "./model";
import { createPublicId, decodeCursor, encodeCursor } from "./db";

export interface OverviewStats {
  members: number;
  new_members_today: number;
  new_members_range: number;
  active_members: number;
  threads: number;
  threads_today: number;
  replies: number;
  replies_today: number;
  reports_pending: number;
  locked_threads: number;
  moderation_actions: number;
  api_failures: number;
  rate_limited: number;
}

export interface AnalyticsPoint {
  bucket_start: string;
  event_type: string;
  dimension: string;
  event_count: number;
  average_latency_ms: number;
}

export interface CommunityTrendPoint {
  bucket_start: string;
  new_members: number;
  threads_created: number;
  replies_created: number;
  moderation_events: number;
}

export interface AdminUserRow {
  user_id: string;
  public_id: string;
  handle: string;
  display_name: string;
  role: Role;
  created_at: string;
  thread_count: number;
  reply_count: number;
  active_restrictions: number;
}

export interface AuditRow {
  id: number;
  actor_handle: string | null;
  action: string;
  target_type: string;
  target_public_id: string | null;
  reason: string | null;
  metadata_json: string;
  created_at: string;
}

export interface AdminThreadRow {
  public_id: string;
  title: string;
  status: string;
  is_pinned: number;
  is_locked: number;
  category_id: string;
  category_name: string;
  author_handle: string;
  reply_count: number;
  last_activity_at: string;
}

export interface TopContent {
  discussions: Array<{ public_id: string; slug: string; title: string; reply_count: number; reaction_count: number; activity: number }>;
  categories: Array<{ slug: string; name: string; thread_count: number; reply_count: number; activity: number }>;
}

function rangeHours(value: string | undefined): number {
  if (value === "24h") return 24;
  if (value === "30d") return 24 * 30;
  if (value === "90d") return 24 * 90;
  return 24 * 7;
}

function count(result: D1Result<unknown>): number {
  const row = result.results[0] as { value?: unknown } | undefined;
  return typeof row?.value === "number" ? row.value : Number(row?.value ?? 0);
}

export async function getOverviewStats(env: Env, range: string | undefined): Promise<OverviewStats> {
  const hours = rangeHours(range);
  const modifier = `-${hours} hours`;
  const results = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS value FROM user_profiles"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM user_profiles WHERE created_at >= date('now')"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM user_profiles WHERE datetime(created_at) >= datetime('now', ?)").bind(modifier),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT author_id) AS value FROM (
        SELECT author_id FROM threads WHERE datetime(created_at) >= datetime('now', ?)
        UNION ALL SELECT author_id FROM posts WHERE datetime(created_at) >= datetime('now', ?)
      )`,
    ).bind(modifier, modifier),
    env.DB.prepare("SELECT COUNT(*) AS value FROM threads WHERE status = 'visible'"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM threads WHERE status = 'visible' AND created_at >= date('now')"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM posts WHERE status = 'visible'"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM posts WHERE status = 'visible' AND created_at >= date('now')"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM reports WHERE status IN ('open', 'reviewing')"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM threads WHERE status = 'visible' AND is_locked = 1"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM moderation_actions WHERE datetime(created_at) >= datetime('now', ?)").bind(modifier),
    env.DB.prepare(
      "SELECT COALESCE(SUM(event_count), 0) AS value FROM product_event_rollups WHERE event_type = 'api_error' AND datetime(bucket_start) >= datetime('now', ?)",
    ).bind(modifier),
    env.DB.prepare(
      "SELECT COALESCE(SUM(event_count), 0) AS value FROM product_event_rollups WHERE event_type = 'rate_limited' AND datetime(bucket_start) >= datetime('now', ?)",
    ).bind(modifier),
  ]);
  return {
    members: count(results[0]!),
    new_members_today: count(results[1]!),
    new_members_range: count(results[2]!),
    active_members: count(results[3]!),
    threads: count(results[4]!),
    threads_today: count(results[5]!),
    replies: count(results[6]!),
    replies_today: count(results[7]!),
    reports_pending: count(results[8]!),
    locked_threads: count(results[9]!),
    moderation_actions: count(results[10]!),
    api_failures: count(results[11]!),
    rate_limited: count(results[12]!),
  };
}

export async function getAnalytics(env: Env, range: string | undefined): Promise<AnalyticsPoint[]> {
  const hours = rangeHours(range);
  const result = await env.DB.prepare(
    `SELECT bucket_start, event_type, dimension, event_count,
            CASE WHEN event_count = 0 THEN 0 ELSE total_latency_ms / event_count END AS average_latency_ms
     FROM product_event_rollups WHERE datetime(bucket_start) >= datetime('now', ?)
     ORDER BY bucket_start ASC, event_type ASC LIMIT 2000`,
  )
    .bind(`-${hours} hours`)
    .all<AnalyticsPoint>();
  return result.results;
}

export async function getCommunityTrends(env: Env, range: string | undefined): Promise<CommunityTrendPoint[]> {
  const hours = rangeHours(range);
  const modifier = `-${hours} hours`;
  const bucket = hours <= 24
    ? "strftime('%Y-%m-%dT%H:00:00Z', created_at)"
    : "strftime('%Y-%m-%dT00:00:00Z', created_at)";
  const result = await env.DB.prepare(
    `SELECT bucket_start,
            SUM(new_members) AS new_members,
            SUM(threads_created) AS threads_created,
            SUM(replies_created) AS replies_created,
            SUM(moderation_events) AS moderation_events
     FROM (
       SELECT ${bucket} AS bucket_start, COUNT(*) AS new_members, 0 AS threads_created,
              0 AS replies_created, 0 AS moderation_events
       FROM user_profiles WHERE datetime(created_at) >= datetime('now', ?) GROUP BY bucket_start
       UNION ALL
       SELECT ${bucket} AS bucket_start, 0, COUNT(*), 0, 0
       FROM threads WHERE datetime(created_at) >= datetime('now', ?) GROUP BY bucket_start
       UNION ALL
       SELECT ${bucket} AS bucket_start, 0, 0, COUNT(*), 0
       FROM posts WHERE datetime(created_at) >= datetime('now', ?) GROUP BY bucket_start
       UNION ALL
       SELECT ${bucket} AS bucket_start, 0, 0, 0, COUNT(*)
       FROM moderation_actions WHERE datetime(created_at) >= datetime('now', ?) GROUP BY bucket_start
     )
     WHERE bucket_start IS NOT NULL
     GROUP BY bucket_start ORDER BY bucket_start ASC LIMIT 366`,
  )
    .bind(modifier, modifier, modifier, modifier)
    .all<CommunityTrendPoint>();
  return result.results;
}

export async function getTopContent(env: Env, range: string | undefined): Promise<TopContent> {
  const modifier = `-${rangeHours(range)} hours`;
  const [discussionsResult, categoriesResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT public_id, slug, title, reply_count, reaction_count,
              (reply_count + reaction_count) AS activity
       FROM threads WHERE status = 'visible' AND datetime(last_activity_at) >= datetime('now', ?)
       ORDER BY activity DESC, last_activity_at DESC LIMIT 10`,
    ).bind(modifier),
    env.DB.prepare(
      `SELECT c.slug, c.name, COUNT(DISTINCT t.id) AS thread_count,
              COALESCE(SUM(t.reply_count), 0) AS reply_count,
              (COUNT(DISTINCT t.id) + COALESCE(SUM(t.reply_count), 0)) AS activity
       FROM categories c LEFT JOIN threads t ON t.category_id = c.id AND t.status = 'visible'
         AND datetime(t.last_activity_at) >= datetime('now', ?)
       GROUP BY c.id ORDER BY activity DESC, c.sort_order ASC LIMIT 10`,
    ).bind(modifier),
  ]);
  return {
    discussions: discussionsResult!.results as unknown as TopContent["discussions"],
    categories: categoriesResult!.results as unknown as TopContent["categories"],
  };
}

export async function listAdminThreads(env: Env): Promise<AdminThreadRow[]> {
  const result = await env.DB.prepare(
    `SELECT t.public_id, t.title, t.status, t.is_pinned, t.is_locked, t.category_id, c.name AS category_name,
            p.handle AS author_handle, t.reply_count, t.last_activity_at
     FROM threads t JOIN categories c ON c.id = t.category_id JOIN user_profiles p ON p.user_id = t.author_id
     ORDER BY t.last_activity_at DESC, t.id DESC LIMIT 100`,
  ).all<AdminThreadRow>();
  return result.results;
}

export async function cleanupRetention(env: Env): Promise<{ notifications: number; rollups: number }> {
  const notificationDays = Number(
    (await env.DB.prepare("SELECT setting_value FROM community_settings WHERE setting_key = 'notifications_retention_days'").first<string>("setting_value")) ?? 180,
  );
  const eventDays = Number(
    (await env.DB.prepare("SELECT setting_value FROM community_settings WHERE setting_key = 'operational_events_retention_days'").first<string>("setting_value")) ?? 90,
  );
  const safeNotificationDays = Number.isInteger(notificationDays) ? Math.max(7, Math.min(notificationDays, 730)) : 180;
  const safeEventDays = Number.isInteger(eventDays) ? Math.max(7, Math.min(eventDays, 365)) : 90;
  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM notifications WHERE datetime(created_at) < datetime('now', ?)").bind(`-${safeNotificationDays} days`),
    env.DB.prepare("DELETE FROM product_event_rollups WHERE datetime(bucket_start) < datetime('now', ?)").bind(`-${safeEventDays} days`),
  ]);
  return { notifications: Number(results[0]?.meta.changes ?? 0), rollups: Number(results[1]?.meta.changes ?? 0) };
}

export async function beginReportReview(env: Env, moderatorId: string, reportPublicId: string): Promise<void> {
  const result = await env.DB.prepare(
    `UPDATE reports SET status = 'reviewing', assigned_moderator_id = ?
     WHERE public_id = ? AND status = 'open'`,
  )
    .bind(moderatorId, reportPublicId)
    .run();
  if ((result.meta.changes ?? 0) === 0) throw new AppError(409, "REPORT_NOT_OPEN", "The report is no longer open.");
  await env.DB.prepare(
    `INSERT INTO audit_events (actor_id, action, target_type, target_public_id)
     VALUES (?, 'report.review_started', 'report', ?)`,
  )
    .bind(moderatorId, reportPublicId)
    .run();
}

export async function listReports(env: Env, status: string | undefined): Promise<ReportRow[]> {
  const safeStatus = status === "reviewing" || status === "resolved" || status === "dismissed" ? status : "open";
  const result = await env.DB.prepare(
    "SELECT * FROM reports WHERE status = ? ORDER BY created_at ASC, id ASC LIMIT 100",
  )
    .bind(safeStatus)
    .all<ReportRow>();
  return result.results;
}

export async function listAdminUsers(env: Env, query: string | undefined): Promise<AdminUserRow[]> {
  const normalized = query?.trim().slice(0, 80) ?? "";
  const pattern = `%${normalized.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const result = await env.DB.prepare(
    `SELECT p.user_id, p.public_id, p.handle, p.display_name, p.role, p.created_at,
            (SELECT COUNT(*) FROM threads t WHERE t.author_id = p.user_id AND t.status = 'visible') AS thread_count,
            (SELECT COUNT(*) FROM posts po WHERE po.author_id = p.user_id AND po.status = 'visible') AS reply_count,
            (SELECT COUNT(*) FROM user_restrictions ur WHERE ur.user_id = p.user_id AND ur.lifted_at IS NULL
              AND datetime(ur.expires_at) > datetime('now')) AS active_restrictions
     FROM user_profiles p
     WHERE (? = '' OR p.handle LIKE ? ESCAPE '\\' OR p.display_name LIKE ? ESCAPE '\\')
     ORDER BY p.created_at DESC LIMIT 100`,
  )
    .bind(normalized, pattern, pattern)
    .all<AdminUserRow>();
  return result.results;
}

export async function listAudit(
  env: Env,
  cursorValue: string | undefined,
): Promise<{ items: AuditRow[]; nextCursor: string | null }> {
  const cursor = decodeCursor(cursorValue);
  const beforeId = cursor === null ? Number.MAX_SAFE_INTEGER : cursor.id;
  const result = await env.DB.prepare(
    `SELECT a.*, p.handle AS actor_handle FROM audit_events a
     LEFT JOIN user_profiles p ON p.user_id = a.actor_id
     WHERE a.id < ? ORDER BY a.id DESC LIMIT 51`,
  )
    .bind(beforeId)
    .all<AuditRow>();
  const items = result.results.slice(0, 50);
  const last = items.at(-1);
  return { items, nextCursor: result.results.length > 50 && last !== undefined ? encodeCursor({ value: last.id, id: last.id }) : null };
}

interface ModerationInput {
  action: "hide" | "restore" | "lock" | "unlock" | "pin" | "unpin" | "move" | "warn" | "restrict" | "unrestrict" | "resolve" | "dismiss";
  targetType: "thread" | "post" | "user" | "report";
  targetPublicId: string;
  reason: string;
  categoryId?: string | undefined;
  restrictionHours?: number | undefined;
}

export async function performModeration(
  env: Env,
  moderatorId: string,
  moderatorRole: "moderator" | "admin",
  input: ModerationInput,
): Promise<void> {
  const pastTense: Record<string, string> = {
    hide: "hid",
    restore: "restored",
    lock: "locked",
    unlock: "unlocked",
    pin: "pinned",
    unpin: "unpinned",
    move: "moved",
  };
  const actionId = createPublicId("ma");
  const metadata: Record<string, unknown> = {};
  if (input.categoryId !== undefined) metadata.categoryId = input.categoryId;
  if (input.restrictionHours !== undefined) metadata.restrictionHours = input.restrictionHours;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO moderation_actions
       (public_id, moderator_id, target_type, target_public_id, action, reason, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(actionId, moderatorId, input.targetType, input.targetPublicId, input.action, input.reason, JSON.stringify(metadata)),
  ];

  if (input.targetType === "thread") {
    const thread = await env.DB.prepare("SELECT id, author_id FROM threads WHERE public_id = ?")
      .bind(input.targetPublicId)
      .first<{ id: number; author_id: string }>();
    if (thread === null) throw new AppError(404, "THREAD_NOT_FOUND", "The discussion was not found.");
    if (input.action === "hide" || input.action === "restore") {
      if (input.action === "hide") {
        statements.push(
          env.DB.prepare(
            `INSERT INTO moderation_content_snapshots
             (moderation_action_id, target_type, target_public_id, body_markdown, body_rendered)
             SELECT ma.id, 'thread', t.public_id, t.body_markdown, t.body_rendered
             FROM moderation_actions ma, threads t WHERE ma.public_id = ? AND t.id = ?`,
          ).bind(actionId, thread.id),
        );
      }
      statements.push(env.DB.prepare("UPDATE threads SET status = ? WHERE id = ?").bind(input.action === "hide" ? "hidden" : "visible", thread.id));
    } else if (input.action === "lock" || input.action === "unlock") {
      statements.push(env.DB.prepare("UPDATE threads SET is_locked = ? WHERE id = ?").bind(input.action === "lock" ? 1 : 0, thread.id));
    } else if (input.action === "pin" || input.action === "unpin") {
      statements.push(env.DB.prepare("UPDATE threads SET is_pinned = ? WHERE id = ?").bind(input.action === "pin" ? 1 : 0, thread.id));
    } else if (input.action === "move") {
      if (input.categoryId === undefined) throw new AppError(422, "CATEGORY_REQUIRED", "Choose a destination category.");
      const category = await env.DB.prepare("SELECT id FROM categories WHERE id = ?").bind(input.categoryId).first();
      if (category === null) throw new AppError(422, "INVALID_CATEGORY", "Choose a valid destination category.");
      statements.push(env.DB.prepare("UPDATE threads SET category_id = ? WHERE id = ?").bind(input.categoryId, thread.id));
    } else {
      throw new AppError(422, "INVALID_ACTION", "That action cannot be applied to a discussion.");
    }
    statements.push(
      env.DB.prepare(
        "INSERT INTO notifications (user_id, actor_id, event_type, thread_id, summary) VALUES (?, ?, 'moderation', ?, ?)",
      ).bind(thread.author_id, moderatorId, thread.id, `A moderator ${pastTense[input.action] ?? "updated"} your discussion.`),
    );
  } else if (input.targetType === "post") {
    const post = await env.DB.prepare("SELECT id, author_id, thread_id FROM posts WHERE public_id = ?")
      .bind(input.targetPublicId)
      .first<{ id: number; author_id: string; thread_id: number }>();
    if (post === null) throw new AppError(404, "POST_NOT_FOUND", "The reply was not found.");
    if (input.action !== "hide" && input.action !== "restore") {
      throw new AppError(422, "INVALID_ACTION", "That action cannot be applied to a reply.");
    }
    if (input.action === "hide") {
      statements.push(
        env.DB.prepare(
          `INSERT INTO moderation_content_snapshots
           (moderation_action_id, target_type, target_public_id, body_markdown, body_rendered)
           SELECT ma.id, 'post', p.public_id, p.body_markdown, p.body_rendered
           FROM moderation_actions ma, posts p WHERE ma.public_id = ? AND p.id = ?`,
        ).bind(actionId, post.id),
      );
    }
    statements.push(env.DB.prepare("UPDATE posts SET status = ? WHERE id = ?").bind(input.action === "hide" ? "hidden" : "visible", post.id));
    statements.push(
      env.DB.prepare(
        "INSERT INTO notifications (user_id, actor_id, event_type, thread_id, post_id, summary) VALUES (?, ?, 'moderation', ?, ?, ?)",
      ).bind(post.author_id, moderatorId, post.thread_id, post.id, `A moderator ${pastTense[input.action] ?? "updated"} your reply.`),
    );
  } else if (input.targetType === "report") {
    if (input.action !== "resolve" && input.action !== "dismiss") {
      throw new AppError(422, "INVALID_ACTION", "That action cannot be applied to a report.");
    }
    const report = await env.DB.prepare("SELECT id FROM reports WHERE public_id = ?")
      .bind(input.targetPublicId)
      .first<{ id: number }>();
    if (report === null) throw new AppError(404, "REPORT_NOT_FOUND", "The report was not found.");
    statements.push(
      env.DB.prepare(
        `UPDATE reports SET status = ?, assigned_moderator_id = ?, resolution = ?,
         resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      ).bind(input.action === "resolve" ? "resolved" : "dismissed", moderatorId, input.reason, report.id),
    );
  } else {
    const profile = await env.DB.prepare("SELECT user_id, role FROM user_profiles WHERE public_id = ?")
      .bind(input.targetPublicId)
      .first<{ user_id: string; role: Role }>();
    if (profile === null) throw new AppError(404, "USER_NOT_FOUND", "The member was not found.");
    if (profile.role === "admin" || (moderatorRole === "moderator" && profile.role !== "member")) {
      throw new AppError(403, "PROTECTED_ROLE", "You cannot moderate an account with this role.");
    }
    if (input.action === "warn") {
      statements.push(
        env.DB.prepare(
          "INSERT INTO notifications (user_id, actor_id, event_type, summary) VALUES (?, ?, 'moderation', ?)",
        ).bind(profile.user_id, moderatorId, `Moderator notice: ${input.reason.slice(0, 200)}`),
      );
    } else if (input.action === "restrict") {
      const hours = input.restrictionHours ?? 24;
      statements.push(
        env.DB.prepare(
          `INSERT INTO user_restrictions (user_id, imposed_by, reason, expires_at)
           VALUES (?, ?, ?, datetime('now', ?))`,
        ).bind(profile.user_id, moderatorId, input.reason, `+${hours} hours`),
      );
    } else if (input.action === "unrestrict") {
      statements.push(
        env.DB.prepare(
          `UPDATE user_restrictions SET lifted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), lifted_by = ?
           WHERE user_id = ? AND lifted_at IS NULL AND expires_at > datetime('now')`,
        ).bind(moderatorId, profile.user_id),
      );
    } else {
      throw new AppError(422, "INVALID_ACTION", "That action cannot be applied to a member.");
    }
  }

  statements.push(
    env.DB.prepare(
      `INSERT INTO audit_events (actor_id, action, target_type, target_public_id, reason, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(moderatorId, `moderation.${input.action}`, input.targetType, input.targetPublicId, input.reason, JSON.stringify(metadata)),
  );
  await env.DB.batch(statements);
}

export async function changeRole(
  env: Env,
  adminId: string,
  targetUserId: string,
  role: "member" | "moderator",
  reason: string,
): Promise<void> {
  if (targetUserId === adminId) {
    throw new AppError(409, "SELF_ROLE_CHANGE_REJECTED", "Administrators cannot change their own role here.");
  }
  const target = await env.DB.prepare("SELECT public_id, role FROM user_profiles WHERE user_id = ?")
    .bind(targetUserId)
    .first<{ public_id: string; role: Role }>();
  if (target === null) throw new AppError(404, "USER_NOT_FOUND", "The member was not found.");
  if (target.role === "admin") throw new AppError(403, "ADMIN_ROLE_PROTECTED", "Another administrator cannot be demoted here.");
  await env.DB.batch([
    env.DB.prepare("UPDATE user_profiles SET role = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE user_id = ?").bind(role, targetUserId),
    env.DB.prepare(
      `INSERT INTO moderation_actions
       (public_id, moderator_id, target_type, target_public_id, action, reason, metadata_json)
       VALUES (?, ?, 'user', ?, 'role_change', ?, ?)`,
    ).bind(createPublicId("ma"), adminId, target.public_id, reason, JSON.stringify({ from: target.role, to: role })),
    env.DB.prepare(
      `INSERT INTO audit_events (actor_id, action, target_type, target_public_id, reason, metadata_json)
       VALUES (?, 'role.change', 'user', ?, ?, ?)`,
    ).bind(adminId, target.public_id, reason, JSON.stringify({ from: target.role, to: role })),
  ]);
}

export async function updateCategory(
  env: Env,
  adminId: string,
  input: { id?: string; name: string; slug: string; description: string; sortOrder: number; isVisible: boolean },
): Promise<string> {
  const id = input.id ?? `cat_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO categories (id, slug, name, description, sort_order, is_visible)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name,
       description = excluded.description, sort_order = excluded.sort_order, is_visible = excluded.is_visible,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).bind(id, input.slug, input.name, input.description, input.sortOrder, input.isVisible ? 1 : 0),
    env.DB.prepare(
      `INSERT INTO audit_events (actor_id, action, target_type, target_public_id, metadata_json)
       VALUES (?, 'category.upsert', 'category', ?, ?)`,
    ).bind(adminId, id, JSON.stringify({ slug: input.slug, visible: input.isVisible, sortOrder: input.sortOrder })),
  ]);
  return id;
}

export async function setCommunityReadOnly(env: Env, adminId: string, readOnly: boolean, reason: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO community_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES ('community_read_only', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).bind(readOnly ? "true" : "false", adminId),
    env.DB.prepare(
      `INSERT INTO audit_events (actor_id, action, target_type, target_public_id, reason, metadata_json)
       VALUES (?, 'community.read_only', 'setting', 'community_read_only', ?, ?)`,
    ).bind(adminId, reason, JSON.stringify({ readOnly })),
  ]);
}
