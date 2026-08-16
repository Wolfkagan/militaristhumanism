export type ProductEventType =
  | "community_home_view"
  | "category_view"
  | "thread_view"
  | "thread_created"
  | "reply_created"
  | "reply_edited"
  | "reaction_added"
  | "reaction_removed"
  | "bookmark_added"
  | "user_registered"
  | "user_login"
  | "user_logout"
  | "search_performed"
  | "report_created"
  | "moderation_action"
  | "rate_limited"
  | "turnstile_failed"
  | "api_error";

export interface ProductEvent {
  type: ProductEventType;
  route: string;
  outcome: string;
  dimension?: string;
  role?: string;
  latencyMs?: number;
}

function hourBucket(now = new Date()): string {
  return `${now.toISOString().slice(0, 13).replace("T", " ")}:00:00`;
}

export function recordProductEvent(
  env: Env,
  executionContext: { waitUntil(promise: Promise<unknown>): void },
  event: ProductEvent,
): void {
  const dimension = event.dimension?.slice(0, 120) || "all";
  const privacySafeIndex = event.role ?? "anonymous";
  env.ANALYTICS.writeDataPoint({
    blobs: [event.type, event.route.slice(0, 180), event.outcome.slice(0, 80), dimension, event.role ?? "anonymous"],
    doubles: [event.latencyMs ?? 0, 1],
    indexes: [privacySafeIndex],
  });

  executionContext.waitUntil(
    env.DB.prepare(
      `INSERT INTO product_event_rollups (bucket_start, event_type, dimension, event_count, total_latency_ms)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT (bucket_start, event_type, dimension)
       DO UPDATE SET event_count = event_count + 1, total_latency_ms = total_latency_ms + excluded.total_latency_ms`,
    )
      .bind(hourBucket(), event.type, dimension, Math.max(0, Math.round(event.latencyMs ?? 0)))
      .run()
      .then(() => undefined),
  );
}
