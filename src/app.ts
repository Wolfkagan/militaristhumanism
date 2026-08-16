import { Hono, type Context } from "hono";
import { AppError, apiError, mutationSuccess, parseInput, readInput, safeReturnPath, wantsHtml } from "./http";
import type { AppBindings, CategoryRow, PostViewRow } from "./model";
import { authIsConfigured, configuredProviders, createAuth, readAppSession } from "./auth";
import { actorRateKey, createCsrfToken, enforceRateLimit, requireCsrf, securityHeaders } from "./security";
import { turnstileIsRequired, validateTurnstile } from "./turnstile";
import { requireRole, requireSession } from "./access";
import { communityIsReadOnly, requireUnrestrictedUser, requireWritableCommunity, threadIdFromPath, threadPath } from "./db";
import {
  canonicalThreadPath,
  createPost,
  createThread,
  getThread,
  getCommunityStats,
  listCategories,
  listPinnedThreads,
  listPosts,
  postReactionSummaries,
  listThreads,
  reactionSummary,
  searchCommunity,
  toggleReaction,
  toggleThreadRelationship,
  updateThread,
} from "./community-data";
import {
  createReport,
  deletePost,
  deleteThread,
  getPostByPublicId,
  getPublicProfile,
  getThreadByPublicId,
  listNotifications,
  listSavedThreads,
  markNotifications,
  recentProfilePosts,
  recentProfileThreads,
  updatePost,
  updateProfile,
} from "./member-data";
import {
  categoryMutationSchema,
  communitySettingSchema,
  moderationSchema,
  markdownPreviewSchema,
  notificationMutationSchema,
  oauthStartSchema,
  postCreateSchema,
  postUpdateSchema,
  profileUpdateSchema,
  reactionSchema,
  reportSchema,
  reportReviewSchema,
  roleMutationSchema,
  threadCreateSchema,
  threadRelationshipSchema,
  threadUpdateSchema,
} from "./validation";
import { renderMarkdown } from "./markdown";
import {
  adminAnalyticsPage,
  adminAuditPage,
  adminCommunityPage,
  adminOverviewPage,
  adminReportsPage,
  adminUsersPage,
  categoryPage,
  communityHome,
  errorPage,
  editPostPage,
  editThreadPage,
  newThreadPage,
  notificationsPage,
  privacyPage,
  profilePage,
  reportPage,
  rulesPage,
  savedThreadsPage,
  searchPage,
  signInPage,
  threadPage,
} from "./views";
import {
  changeRole,
  beginReportReview,
  cleanupRetention,
  getAnalytics,
  getOverviewStats,
  getTopContent,
  listAdminUsers,
  listAdminThreads,
  listAudit,
  listReports,
  performModeration,
  setCommunityReadOnly,
  updateCategory,
} from "./admin-data";
import { recordProductEvent, type ProductEventType } from "./analytics";

export const app = new Hono<AppBindings>();

function turnstileSiteKey(env: Env): string | undefined {
  return turnstileIsRequired(env) ? env.TURNSTILE_SITE_KEY : undefined;
}

function record(c: Context<AppBindings>, type: ProductEventType, outcome = "ok", dimension?: string): void {
  const session = c.get("session");
  recordProductEvent(c.env, c.executionCtx, {
    type,
    route: new URL(c.req.url).pathname,
    outcome,
    ...(dimension === undefined ? {} : { dimension }),
    ...(session === null ? {} : { role: session.profile.role }),
    latencyMs: Date.now() - c.get("startedAt"),
  });
}

async function mutationGuard(
  c: Context<AppBindings>,
  input: { csrf?: string | undefined },
  rateLimiter: RateLimit,
): Promise<ReturnType<typeof requireSession>> {
  const session = requireSession(c);
  await requireCsrf(c.req.raw, session.id, c.env.AUTH_SECRET, input.csrf);
  await requireWritableCommunity(c.env);
  await requireUnrestrictedUser(c.env, session.user.id);
  await enforceRateLimit(rateLimiter, await actorRateKey(c.req.raw, session.user.id, c.env.AUTH_SECRET));
  return session;
}

async function privilegedMutationGuard(
  c: Context<AppBindings>,
  minimumRole: "moderator" | "admin",
  csrf: string | undefined,
): Promise<ReturnType<typeof requireRole>> {
  const session = requireRole(c, minimumRole);
  await requireCsrf(c.req.raw, session.id, c.env.AUTH_SECRET, csrf);
  await enforceRateLimit(c.env.WRITE_RATE_LIMITER, await actorRateKey(c.req.raw, session.user.id, c.env.AUTH_SECRET));
  return session;
}

app.use("*", securityHeaders);
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  c.set("startedAt", Date.now());
  const session = await readAppSession(c.req.raw, c.env);
  c.set("session", session);
  c.set("csrfToken", session === null ? null : await createCsrfToken(session.id, c.env.AUTH_SECRET));
  if (session?.isNewProfile === true) record(c, "user_registered", "ok");
  await next();
});

app.onError((error, c) => {
  const appError = error instanceof AppError ? error : new AppError(500, "INTERNAL_ERROR", "The request could not be completed.");
  if (!(error instanceof AppError)) {
    console.error("Unhandled request error", {
      requestId: c.get("requestId"),
      method: c.req.method,
      pathname: new URL(c.req.url).pathname,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
  }
  if (appError.status === 429) c.header("Retry-After", "60");
  try {
    record(c, appError.status === 429 ? "rate_limited" : appError.code.startsWith("TURNSTILE") ? "turnstile_failed" : "api_error", appError.code);
  } catch {
    // Primary error responses must not be replaced by telemetry failures.
  }
  if (wantsHtml(c.req.raw) && !new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.html(errorPage(c.get("session"), appError.status, appError.status >= 500 ? "Temporarily unavailable" : "Request not completed", appError.message, c.get("requestId")), appError.status as 400);
  }
  return apiError(c, appError);
});

app.get("/api/health", async (c) => {
  const result = await c.env.DB.prepare("SELECT 1 AS healthy").first<{ healthy: number }>();
  if (result?.healthy !== 1) throw new AppError(503, "UNHEALTHY", "Service unavailable.");
  return c.json({ status: "ok" });
});

app.get("/community-sitemap.xml", async (c) => {
  const [categories, threads] = await Promise.all([
    listCategories(c.env),
    c.env.DB.prepare(
      "SELECT public_id, slug, updated_at FROM threads WHERE status = 'visible' ORDER BY updated_at DESC, id DESC LIMIT 5000",
    ).all<{ public_id: string; slug: string; updated_at: string }>(),
  ]);
  const xmlEscape = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  const fixed = [
    { path: "/community", updated: new Date().toISOString() },
    { path: "/community/rules", updated: new Date().toISOString() },
    { path: "/community/privacy", updated: new Date().toISOString() },
    ...categories.map((category) => ({ path: `/community/c/${category.slug}`, updated: category.updated_at })),
    ...threads.results.map((thread) => ({ path: threadPath(thread.slug, thread.public_id), updated: thread.updated_at })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${fixed.map((item) => `<url><loc>${xmlEscape(`https://militaristhumanism.com${item.path}`)}</loc><lastmod>${xmlEscape(item.updated.slice(0, 10))}</lastmod></url>`).join("")}</urlset>`;
  return c.body(body, 200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" });
});

app.all("/api/auth/*", async (c) => {
  if (!authIsConfigured(c.env)) throw new AppError(503, "AUTH_NOT_CONFIGURED", "Sign-in is not configured.");
  const pathname = new URL(c.req.url).pathname;
  const response = await createAuth(c.env).handler(c.req.raw);
  if (response.status < 400 && pathname.includes("/callback/")) record(c, "user_login", "ok");
  if (response.status < 400 && pathname.endsWith("/sign-out")) record(c, "user_logout", "ok");
  return response;
});

app.get("/community", async (c) => {
  const sort = c.req.query("sort") ?? "latest";
  const [categories, pinned, page, stats, activePage, unansweredPage] = await Promise.all([
    listCategories(c.env),
    listPinnedThreads(c.env),
    listThreads(c.env, { sort, cursor: c.req.query("after") }),
    getCommunityStats(c.env),
    listThreads(c.env, { sort: "active", limit: 3 }),
    listThreads(c.env, { sort: "unanswered", limit: 3 }),
  ]);
  record(c, "community_home_view", "ok", sort);
  return c.html(communityHome(c.get("session"), categories, pinned, page, sort, stats, activePage.items, unansweredPage.items));
});

app.get("/community/rules", (c) => c.html(rulesPage(c.get("session"))));
app.get("/community/privacy", (c) => c.html(privacyPage(c.get("session"))));

app.get("/community/sign-in", (c) => {
  if (c.get("session") !== null) return c.redirect(safeReturnPath(c.req.query("returnTo"), "/community"), 303);
  return c.html(
    signInPage(
      null,
      configuredProviders(c.env),
      turnstileSiteKey(c.env),
      safeReturnPath(c.req.query("returnTo"), "/community"),
      authIsConfigured(c.env),
    ),
  );
});

app.post("/community/sign-in", async (c) => {
  const raw = await readInput(c.req.raw, 16_384);
  const parsedInput = oauthStartSchema.safeParse({
    provider: raw.provider,
    returnTo: raw.returnTo,
    turnstileToken: raw["cf-turnstile-response"] ?? raw.turnstileToken,
  });
  if (!parsedInput.success) {
    throw new AppError(422, "VALIDATION_FAILED", parsedInput.error.issues[0]?.message ?? "The submitted data is invalid.");
  }
  const input = parsedInput.data;
  if (!configuredProviders(c.env).includes(input.provider)) {
    throw new AppError(422, "PROVIDER_UNAVAILABLE", "That sign-in provider is unavailable.");
  }
  const origin = c.req.header("origin");
  if (origin !== new URL(c.req.url).origin) throw new AppError(403, "ORIGIN_REJECTED", "The request origin could not be verified.");
  await enforceRateLimit(c.env.AUTH_RATE_LIMITER, await actorRateKey(c.req.raw, null, c.env.AUTH_SECRET));
  await validateTurnstile(c.req.raw, c.env, input.turnstileToken, "oauth_start");
  const result = await createAuth(c.env).api.signInSocial({
    body: { provider: input.provider, callbackURL: safeReturnPath(input.returnTo, "/community") },
    headers: c.req.raw.headers,
  });
  if (!result.redirect || result.url === undefined) throw new AppError(502, "OAUTH_START_FAILED", "Sign-in could not be started.");
  return c.redirect(result.url, 303);
});

app.get("/community/new", async (c) => {
  const session = requireSession(c);
  const csrf = c.get("csrfToken");
  if (csrf === null) throw new AppError(503, "SESSION_SECURITY_UNAVAILABLE", "Session security is unavailable.");
  return c.html(newThreadPage(session, await listCategories(c.env), csrf, turnstileSiteKey(c.env)));
});

app.get("/community/c/:slug", async (c) => {
  const slug = c.req.param("slug");
  const category = await c.env.DB.prepare("SELECT * FROM categories WHERE slug = ? AND is_visible = 1")
    .bind(slug)
    .first<CategoryRow>();
  if (category === null) throw new AppError(404, "CATEGORY_NOT_FOUND", "The category was not found.");
  const sort = c.req.query("sort") ?? "latest";
  const page = await listThreads(c.env, { sort, categorySlug: slug, cursor: c.req.query("after") });
  record(c, "category_view", "ok", slug);
  return c.html(categoryPage(c.get("session"), category, page, sort));
});

app.get("/community/search", async (c) => {
  const query = (c.req.query("q") ?? "").trim().slice(0, 120);
  if (query.length >= 2) {
    await enforceRateLimit(c.env.SEARCH_RATE_LIMITER, await actorRateKey(c.req.raw, c.get("session")?.user.id ?? null, c.env.AUTH_SECRET));
  }
  const page = query.length < 2 ? { items: [], nextCursor: null } : await searchCommunity(c.env, query, c.req.query("after"));
  if (query.length >= 2) record(c, "search_performed", "ok", query.split(/\s+/u).length.toString());
  return c.html(searchPage(c.get("session"), query, page));
});

app.get("/community/report", (c) => {
  const session = requireSession(c);
  const csrf = c.get("csrfToken");
  if (csrf === null) throw new AppError(503, "SESSION_SECURITY_UNAVAILABLE", "Session security is unavailable.");
  const targetType = c.req.query("targetType") ?? "";
  const target = c.req.query("target") ?? "";
  const returnTo = safeReturnPath(c.req.query("returnTo"), "/community");
  if (!/^(thread|post|user)$/u.test(targetType) || !/^(?:th|po|usr)_[a-f0-9]{12}$/u.test(target)) {
    throw new AppError(422, "INVALID_REPORT_TARGET", "The report target is invalid.");
  }
  return c.html(reportPage(session, targetType, target, returnTo, csrf, turnstileSiteKey(c.env)));
});

app.get("/community/t/:path", async (c) => {
  const routeValue = c.req.param("path");
  const publicId = threadIdFromPath(routeValue);
  if (publicId === null) throw new AppError(404, "THREAD_NOT_FOUND", "The discussion was not found.");
  const session = c.get("session");
  const thread = await getThread(c.env, publicId, session?.user.id ?? null);
  if (thread === null) throw new AppError(404, "THREAD_NOT_FOUND", "The discussion was not found.");
  const canonical = canonicalThreadPath(thread);
  if (`/community/t/${routeValue}` !== canonical) return c.redirect(canonical, 308);
  const requestedReplySort = c.req.query("replies") ?? "oldest";
  const replySort = ["oldest", "newest", "best", "most-discussed"].includes(requestedReplySort) ? requestedReplySort : "oldest";
  const [postsPage, reactions, relatedPage] = await Promise.all([
    listPosts(c.env, thread.id, replySort, c.req.query("afterReplies")),
    reactionSummary(c.env, "thread", thread.public_id, session?.user.id ?? null),
    listThreads(c.env, { categorySlug: thread.category_slug, sort: "active", limit: 5 }),
  ]);
  const postReactions = await postReactionSummaries(c.env, postsPage.items.map((post) => post.public_id), session?.user.id ?? null);
  c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE threads SET view_count = view_count + 1 WHERE id = ?").bind(thread.id).run().then(() => undefined));
  record(c, "thread_view", "ok", thread.category_slug);
  return c.html(threadPage(session, thread, postsPage.items, reactions, postReactions, c.get("csrfToken"), turnstileSiteKey(c.env), relatedPage.items.filter((item) => item.id !== thread.id).slice(0, 3), replySort, postsPage.nextCursor));
});

app.get("/community/t/:path/edit", async (c) => {
  const session = requireSession(c);
  const publicId = threadIdFromPath(c.req.param("path"));
  if (publicId === null) throw new AppError(404, "THREAD_NOT_FOUND", "The discussion was not found.");
  const thread = await getThread(c.env, publicId, session.user.id);
  if (thread === null) throw new AppError(404, "THREAD_NOT_FOUND", "The discussion was not found.");
  if (thread.author_id !== session.user.id) throw new AppError(403, "NOT_CONTENT_OWNER", "You may only edit your own discussion.");
  const csrf = c.get("csrfToken");
  if (csrf === null) throw new AppError(503, "SESSION_SECURITY_UNAVAILABLE", "Session security is unavailable.");
  return c.html(editThreadPage(session, thread, await listCategories(c.env), csrf));
});

app.get("/community/posts/:id/edit", async (c) => {
  const session = requireSession(c);
  const post = await getPostByPublicId(c.env, c.req.param("id"));
  if (post === null || post.status !== "visible") throw new AppError(404, "POST_NOT_FOUND", "The reply was not found.");
  if (post.author_id !== session.user.id) throw new AppError(403, "NOT_CONTENT_OWNER", "You may only edit your own reply.");
  const thread = await c.env.DB.prepare("SELECT slug, public_id FROM threads WHERE id = ?").bind(post.thread_id).first<{ slug: string; public_id: string }>();
  if (thread === null) throw new AppError(404, "THREAD_NOT_FOUND", "The discussion was not found.");
  const view = await c.env.DB.prepare(
    `SELECT p.*, up.handle AS author_handle, up.display_name AS author_name, up.role AS author_role,
            parent.public_id AS parent_public_id, 0 AS child_count FROM posts p
     JOIN user_profiles up ON up.user_id = p.author_id LEFT JOIN posts parent ON parent.id = p.parent_post_id
     WHERE p.id = ?`,
  ).bind(post.id).first<PostViewRow>();
  const csrf = c.get("csrfToken");
  if (view === null || csrf === null) throw new AppError(503, "SESSION_SECURITY_UNAVAILABLE", "Session security is unavailable.");
  return c.html(editPostPage(session, view, `${threadPath(thread.slug, thread.public_id)}#${post.public_id}`, csrf));
});

app.get("/me/bookmarks", async (c) => {
  const session = requireSession(c);
  return c.html(savedThreadsPage(session, "Bookmarks", await listSavedThreads(c.env, session.user.id, "bookmarks")));
});
app.get("/me/following", async (c) => {
  const session = requireSession(c);
  return c.html(savedThreadsPage(session, "Following", await listSavedThreads(c.env, session.user.id, "thread_follows")));
});
app.get("/notifications", async (c) => {
  const session = requireSession(c);
  const csrf = c.get("csrfToken");
  if (csrf === null) throw new AppError(503, "SESSION_SECURITY_UNAVAILABLE", "Session security is unavailable.");
  return c.html(notificationsPage(session, await listNotifications(c.env, session.user.id), csrf));
});

app.get("/u/:handle", async (c) => {
  const profile = await getPublicProfile(c.env, c.req.param("handle"));
  if (profile === null) throw new AppError(404, "PROFILE_NOT_FOUND", "The member profile was not found.");
  const isOwner = c.get("session")?.user.id === profile.user_id;
  const [threads, posts] = profile.visibility === "limited" && !isOwner
    ? [[], []]
    : await Promise.all([recentProfileThreads(c.env, profile.user_id), recentProfilePosts(c.env, profile.user_id)]);
  return c.html(profilePage(c.get("session"), profile, threads, posts, c.get("csrfToken")));
});

app.get("/api/community/categories", async (c) => c.json({ categories: await listCategories(c.env) }));
app.get("/api/community/threads", async (c) => c.json(await listThreads(c.env, { sort: c.req.query("sort"), categorySlug: c.req.query("category"), cursor: c.req.query("cursor"), limit: Number(c.req.query("limit") ?? 20) })));
app.get("/api/community/threads/:id", async (c) => {
  const thread = await getThread(c.env, c.req.param("id"), c.get("session")?.user.id ?? null);
  if (thread === null) throw new AppError(404, "THREAD_NOT_FOUND", "The discussion was not found.");
  return c.json({ thread });
});
app.get("/api/community/threads/:id/posts", async (c) => {
  const thread = await getThreadByPublicId(c.env, c.req.param("id"));
  if (thread === null || thread.status !== "visible") throw new AppError(404, "THREAD_NOT_FOUND", "The discussion was not found.");
  const page = await listPosts(c.env, thread.id, c.req.query("sort"), c.req.query("cursor"), Number(c.req.query("limit") ?? 50));
  return c.json({ posts: page.items, nextCursor: page.nextCursor });
});
app.get("/api/community/search", async (c) => {
  const query = (c.req.query("q") ?? "").trim().slice(0, 120);
  await enforceRateLimit(c.env.SEARCH_RATE_LIMITER, await actorRateKey(c.req.raw, c.get("session")?.user.id ?? null, c.env.AUTH_SECRET));
  return c.json(await searchCommunity(c.env, query, c.req.query("cursor")));
});

app.post("/api/community/preview", async (c) => {
  const input = await parseInput(c.req.raw, markdownPreviewSchema);
  const session = requireSession(c);
  await requireCsrf(c.req.raw, session.id, c.env.AUTH_SECRET, input.csrf);
  await enforceRateLimit(c.env.SEARCH_RATE_LIMITER, await actorRateKey(c.req.raw, session.user.id, c.env.AUTH_SECRET));
  return c.json({ rendered: renderMarkdown(input.body) });
});

app.post("/api/community/threads", async (c) => {
  const input = await parseInput(c.req.raw, threadCreateSchema);
  const session = await mutationGuard(c, input, c.env.WRITE_RATE_LIMITER);
  const prior = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM threads WHERE author_id = ?").bind(session.user.id).first<number>("count");
  if ((prior ?? 0) === 0) await validateTurnstile(c.req.raw, c.env, input.turnstileToken, "thread_create");
  const thread = await createThread(c.env, session.user.id, input);
  record(c, "thread_created", "ok", input.categoryId);
  return mutationSuccess(c, { thread: { publicId: thread.public_id, path: canonicalThreadPath(thread) } }, canonicalThreadPath(thread), 201);
});

app.patch("/api/community/threads/:id", async (c) => {
  const input = await parseInput(c.req.raw, threadUpdateSchema);
  const session = await mutationGuard(c, input, c.env.WRITE_RATE_LIMITER);
  const thread = await getThreadByPublicId(c.env, c.req.param("id"));
  if (thread === null) throw new AppError(404, "THREAD_NOT_FOUND", "The discussion was not found.");
  if (thread.author_id !== session.user.id) throw new AppError(403, "NOT_CONTENT_OWNER", "You may only edit your own discussion.");
  const updated = await updateThread(c.env, thread, input);
  return mutationSuccess(c, { thread: { publicId: updated.public_id, path: canonicalThreadPath(updated) } }, canonicalThreadPath(updated));
});

app.delete("/api/community/threads/:id", async (c) => {
  const input = await readInput(c.req.raw);
  const session = await mutationGuard(c, { csrf: typeof input.csrf === "string" ? input.csrf : undefined }, c.env.WRITE_RATE_LIMITER);
  const thread = await getThreadByPublicId(c.env, c.req.param("id"));
  if (thread === null) throw new AppError(404, "THREAD_NOT_FOUND", "The discussion was not found.");
  if (thread.author_id !== session.user.id) throw new AppError(403, "NOT_CONTENT_OWNER", "You may only delete your own discussion.");
  await deleteThread(c.env, thread);
  return mutationSuccess(c, { deleted: true }, "/community");
});

app.post("/api/community/threads/:id/posts", async (c) => {
  const input = await parseInput(c.req.raw, postCreateSchema);
  const session = await mutationGuard(c, input, c.env.WRITE_RATE_LIMITER);
  const thread = await getThreadByPublicId(c.env, c.req.param("id"));
  if (thread === null || thread.status !== "visible") throw new AppError(404, "THREAD_NOT_FOUND", "The discussion was not found.");
  const prior = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM posts WHERE author_id = ?").bind(session.user.id).first<number>("count");
  if ((prior ?? 0) === 0) await validateTurnstile(c.req.raw, c.env, input.turnstileToken, "reply_create");
  const result = await createPost(c.env, thread, session.user.id, { body: input.body, ...(input.parentPublicId ? { parentPublicId: input.parentPublicId } : {}) });
  record(c, "reply_created", "ok", thread.category_id);
  return mutationSuccess(c, { post: { publicId: result.post.public_id } }, `${threadPath(thread.slug, thread.public_id)}#${result.post.public_id}`, 201);
});

app.patch("/api/community/posts/:id", async (c) => {
  const input = await parseInput(c.req.raw, postUpdateSchema);
  const session = await mutationGuard(c, input, c.env.WRITE_RATE_LIMITER);
  const post = await getPostByPublicId(c.env, c.req.param("id"));
  if (post === null || post.status !== "visible") throw new AppError(404, "POST_NOT_FOUND", "The reply was not found.");
  if (post.author_id !== session.user.id) throw new AppError(403, "NOT_CONTENT_OWNER", "You may only edit your own reply.");
  await updatePost(c.env, post, input.body);
  record(c, "reply_edited");
  return mutationSuccess(c, { updated: true }, safeReturnPath(input.returnTo, "/community"));
});

app.delete("/api/community/posts/:id", async (c) => {
  const raw = await readInput(c.req.raw);
  const csrf = typeof raw.csrf === "string" ? raw.csrf : undefined;
  const session = await mutationGuard(c, { ...(csrf === undefined ? {} : { csrf }) }, c.env.WRITE_RATE_LIMITER);
  const post = await getPostByPublicId(c.env, c.req.param("id"));
  if (post === null) throw new AppError(404, "POST_NOT_FOUND", "The reply was not found.");
  if (post.author_id !== session.user.id) throw new AppError(403, "NOT_CONTENT_OWNER", "You may only delete your own reply.");
  await deletePost(c.env, post);
  const thread = await c.env.DB.prepare("SELECT slug, public_id FROM threads WHERE id = ?").bind(post.thread_id).first<{ slug: string; public_id: string }>();
  return mutationSuccess(c, { deleted: true }, thread === null ? "/community" : threadPath(thread.slug, thread.public_id));
});

app.post("/api/community/reactions", async (c) => {
  const input = await parseInput(c.req.raw, reactionSchema, 16_384);
  const session = await mutationGuard(c, input, c.env.REACTION_RATE_LIMITER);
  const active = await toggleReaction(c.env, session.user.id, input);
  record(c, active ? "reaction_added" : "reaction_removed", "ok", input.reactionType);
  return mutationSuccess(c, { active }, safeReturnPath(input.returnTo, "/community"));
});

async function relationshipMutation(c: Context<AppBindings>, relationship: "bookmarks" | "thread_follows"): Promise<Response> {
  const input = await parseInput(c.req.raw, threadRelationshipSchema, 16_384);
  const session = await mutationGuard(c, input, c.env.WRITE_RATE_LIMITER);
  const active = await toggleThreadRelationship(c.env, relationship, session.user.id, input.threadPublicId);
  if (relationship === "bookmarks" && active) record(c, "bookmark_added");
  return mutationSuccess(c, { active }, safeReturnPath(input.returnTo, "/community"));
}
app.post("/api/community/bookmarks", (c) => relationshipMutation(c, "bookmarks"));
app.post("/api/community/follows", (c) => relationshipMutation(c, "thread_follows"));

app.post("/api/community/reports", async (c) => {
  const raw = await readInput(c.req.raw);
  const parsedInput = reportSchema.safeParse({ ...raw, turnstileToken: raw["cf-turnstile-response"] ?? raw.turnstileToken });
  if (!parsedInput.success) {
    throw new AppError(422, "VALIDATION_FAILED", parsedInput.error.issues[0]?.message ?? "The submitted data is invalid.");
  }
  const input = parsedInput.data;
  const session = await mutationGuard(c, input, c.env.REPORT_RATE_LIMITER);
  await validateTurnstile(c.req.raw, c.env, input.turnstileToken, "report_create");
  const reportId = await createReport(c.env, session.user.id, input);
  record(c, "report_created", "ok", input.reason);
  return mutationSuccess(c, { report: { publicId: reportId } }, safeReturnPath(input.returnTo, "/community"), 201);
});

app.patch("/api/community/profile", async (c) => {
  const input = await parseInput(c.req.raw, profileUpdateSchema, 16_384);
  const session = await mutationGuard(c, input, c.env.WRITE_RATE_LIMITER);
  await updateProfile(c.env, session.user.id, input);
  return mutationSuccess(c, { updated: true }, safeReturnPath(input.returnTo, `/u/${session.profile.handle}`));
});

app.get("/api/notifications", async (c) => {
  const session = requireSession(c);
  return c.json({ notifications: await listNotifications(c.env, session.user.id) });
});
app.post("/api/notifications", async (c) => {
  const input = await parseInput(c.req.raw, notificationMutationSchema, 16_384);
  const session = requireSession(c);
  await requireCsrf(c.req.raw, session.id, c.env.AUTH_SECRET, input.csrf);
  await enforceRateLimit(c.env.WRITE_RATE_LIMITER, await actorRateKey(c.req.raw, session.user.id, c.env.AUTH_SECRET));
  await markNotifications(c.env, session.user.id, { ...(input.notificationId === undefined ? {} : { notificationId: input.notificationId }), markAll: input.markAll === "true" });
  return mutationSuccess(c, { updated: true }, safeReturnPath(input.returnTo, "/notifications"));
});

app.get("/admin", (c) => {
  const session = requireRole(c, "moderator");
  return c.redirect(session.profile.role === "admin" ? "/admin/overview" : "/admin/moderation", 308);
});
app.get("/admin/overview", async (c) => {
  const session = requireRole(c, "admin");
  const range = c.req.query("range") ?? "7d";
  c.executionCtx.waitUntil(cleanupRetention(c.env).then(() => undefined));
  return c.html(adminOverviewPage(session, await getOverviewStats(c.env, range), range));
});
app.get("/admin/analytics", async (c) => {
  const session = requireRole(c, "admin");
  const range = c.req.query("range") ?? "7d";
  const [points, top] = await Promise.all([getAnalytics(c.env, range), getTopContent(c.env, range)]);
  return c.html(adminAnalyticsPage(session, points, range, top));
});
app.get("/admin/community", async (c) => {
  const session = requireRole(c, "admin");
  const csrf = c.get("csrfToken");
  if (csrf === null) throw new AppError(503, "SESSION_SECURITY_UNAVAILABLE", "Session security is unavailable.");
  const [categories, threads, readOnly] = await Promise.all([listCategories(c.env, true), listAdminThreads(c.env), communityIsReadOnly(c.env)]);
  return c.html(adminCommunityPage(session, categories, threads, csrf, readOnly));
});
app.get("/admin/moderation", async (c) => {
  const session = requireRole(c, "moderator");
  const csrf = c.get("csrfToken");
  if (csrf === null) throw new AppError(503, "SESSION_SECURITY_UNAVAILABLE", "Session security is unavailable.");
  return c.html(adminReportsPage(session, await listReports(c.env, c.req.query("status")), csrf, "moderation"));
});
app.get("/admin/reports", async (c) => {
  const session = requireRole(c, "moderator");
  const csrf = c.get("csrfToken");
  if (csrf === null) throw new AppError(503, "SESSION_SECURITY_UNAVAILABLE", "Session security is unavailable.");
  return c.html(adminReportsPage(session, await listReports(c.env, c.req.query("status")), csrf));
});
app.get("/admin/users", async (c) => {
  const session = requireRole(c, "moderator");
  const csrf = c.get("csrfToken");
  if (csrf === null) throw new AppError(503, "SESSION_SECURITY_UNAVAILABLE", "Session security is unavailable.");
  const query = (c.req.query("q") ?? "").slice(0, 80);
  return c.html(adminUsersPage(session, await listAdminUsers(c.env, query), csrf, query));
});
app.get("/admin/audit", async (c) => {
  const session = requireRole(c, "admin");
  const page = await listAudit(c.env, c.req.query("after"));
  return c.html(adminAuditPage(session, page.items, page.nextCursor));
});

app.get("/api/admin/overview", async (c) => {
  requireRole(c, "admin");
  return c.json({ stats: await getOverviewStats(c.env, c.req.query("range")) });
});
app.get("/api/admin/analytics", async (c) => {
  requireRole(c, "admin");
  return c.json({ points: await getAnalytics(c.env, c.req.query("range")) });
});
app.get("/api/admin/reports", async (c) => {
  requireRole(c, "moderator");
  return c.json({ reports: await listReports(c.env, c.req.query("status")) });
});
app.post("/api/admin/moderation", async (c) => {
  const input = await parseInput(c.req.raw, moderationSchema);
  const session = await privilegedMutationGuard(c, "moderator", input.csrf);
  await performModeration(c.env, session.user.id, session.profile.role === "admin" ? "admin" : "moderator", input);
  record(c, "moderation_action", "ok", input.action);
  return mutationSuccess(c, { completed: true }, safeReturnPath(input.returnTo, "/admin/moderation"));
});
app.post("/api/admin/reports/review", async (c) => {
  const input = await parseInput(c.req.raw, reportReviewSchema, 16_384);
  const session = await privilegedMutationGuard(c, "moderator", input.csrf);
  await beginReportReview(c.env, session.user.id, input.reportPublicId);
  return mutationSuccess(c, { status: "reviewing" }, safeReturnPath(input.returnTo, "/admin/moderation?status=reviewing"));
});
app.patch("/api/admin/users/role", async (c) => {
  const input = await parseInput(c.req.raw, roleMutationSchema);
  const session = await privilegedMutationGuard(c, "admin", input.csrf);
  await changeRole(c.env, session.user.id, input.userId, input.role, input.reason);
  return mutationSuccess(c, { updated: true }, safeReturnPath(input.returnTo, "/admin/users"));
});
app.patch("/api/admin/categories", async (c) => {
  const input = await parseInput(c.req.raw, categoryMutationSchema);
  const session = await privilegedMutationGuard(c, "admin", input.csrf);
  const id = await updateCategory(c.env, session.user.id, { ...(input.id === undefined ? {} : { id: input.id }), name: input.name, slug: input.slug, description: input.description, sortOrder: input.sortOrder, isVisible: input.isVisible === "true" });
  return mutationSuccess(c, { category: { id } }, safeReturnPath(input.returnTo, "/admin/community"));
});
app.patch("/api/admin/settings/community", async (c) => {
  const input = await parseInput(c.req.raw, communitySettingSchema);
  const session = await privilegedMutationGuard(c, "admin", input.csrf);
  await setCommunityReadOnly(c.env, session.user.id, input.readOnly === "true", input.reason);
  return mutationSuccess(c, { readOnly: input.readOnly === "true" }, safeReturnPath(input.returnTo, "/admin/community"));
});

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) return apiError(c, new AppError(404, "NOT_FOUND", "The endpoint was not found."));
  return c.html(errorPage(c.get("session"), 404, "Not found", "The requested page was not found.", c.get("requestId")), 404);
});
