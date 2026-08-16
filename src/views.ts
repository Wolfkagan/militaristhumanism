import type { AdminThreadRow, AdminUserRow, AnalyticsPoint, AuditRow, OverviewStats, TopContent } from "./admin-data";
import type { CommunityStats, PageResult, ReactionSummary, SearchRow, TargetReactionSummary, ThreadDetail } from "./community-data";
import type { NotificationRow, PublicProfile } from "./member-data";
import type { AppSession, CategoryRow, PostViewRow, ReportRow, ThreadCardRow } from "./model";
import { escapeHtml, highlightedSnippet, markdownToText } from "./markdown";
import { canonicalThreadPath } from "./community-data";

const siteName = "Militarist Humanism";
const canonicalOrigin = "https://militaristhumanism.com";

function esc(value: unknown): string {
  return escapeHtml(String(value ?? ""));
}

function isoDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
}

function displayDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Unknown date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(parsed);
}

function avatar(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("en-US") ?? "")
    .join("") || "M";
  return `<span class="avatar" aria-hidden="true">${esc(initials)}</span>`;
}

function nav(session: AppSession | null): string {
  const member = session === null
    ? `<a class="nav-action" href="/community/sign-in">Sign in</a>`
    : `<a href="/notifications">Notifications</a><a href="/u/${esc(session.profile.handle)}">${esc(session.profile.display_name)}</a>${session.profile.role !== "member" ? '<a href="/admin/overview">Admin</a>' : ""}<form action="/api/auth/sign-out" method="post" class="inline-form"><button class="nav-action" type="submit">Sign out</button></form>`;
  return `<header class="site-header"><a class="brand" href="/">${siteName}</a><nav aria-label="Primary"><a href="/community">Community</a><a href="/community/rules">Rules</a><a href="/community/search">Search</a>${member}</nav></header>`;
}

interface LayoutOptions {
  title: string;
  description: string;
  pathname: string;
  session: AppSession | null;
  body: string;
  noindex?: boolean;
  admin?: boolean;
  usesTurnstile?: boolean;
}

export function layout(options: LayoutOptions): string {
  const canonical = `${canonicalOrigin}${options.pathname}`;
  const robots = options.noindex === true ? '<meta name="robots" content="noindex,nofollow">' : "";
  const turnstile = options.usesTurnstile === true
    ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(options.title)} · ${siteName}</title><meta name="description" content="${esc(options.description)}">${robots}
<link rel="canonical" href="${esc(canonical)}"><meta property="og:title" content="${esc(options.title)}"><meta property="og:description" content="${esc(options.description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:type" content="website">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/community.css">
<script src="/${options.admin === true ? "admin" : "community"}.js" defer></script>${turnstile}</head>
<body>${nav(options.session)}<main id="main-content">${options.body}</main><footer><p>Open discussion without chaos. Human dignity remains the baseline.</p><a href="/community/privacy">Privacy &amp; retention</a></footer></body></html>`;
}

export function errorPage(
  session: AppSession | null,
  status: number,
  title: string,
  message: string,
  requestId?: string,
): string {
  return layout({
    title,
    description: message,
    pathname: "/community",
    session,
    noindex: status >= 400,
    body: `<section class="notice-page"><p class="eyebrow">${status}</p><h1>${esc(title)}</h1><p>${esc(message)}</p>${requestId === undefined ? "" : `<p class="request-id">Reference: ${esc(requestId)}</p>`}<a class="button" href="/community">Return to community</a></section>`,
  });
}

export function threadCard(thread: ThreadCardRow): string {
  const flags = `${thread.is_pinned === 1 ? '<span class="state">Pinned</span>' : ""}${thread.is_locked === 1 ? '<span class="state">Locked</span>' : ""}`;
  return `<article class="thread-card"><div class="thread-kicker"><a href="/community/c/${esc(thread.category_slug)}">${esc(thread.category_name)}</a>${flags}</div><h3><a href="${esc(canonicalThreadPath(thread))}">${esc(thread.title)}</a></h3><p>${esc(markdownToText(thread.body_markdown, 170))}</p><div class="thread-meta"><span>by <a href="/u/${esc(thread.author_handle)}">${esc(thread.author_name)}</a></span><time datetime="${esc(isoDate(thread.last_activity_at))}">${esc(displayDate(thread.last_activity_at))}</time><span>${thread.reply_count} replies</span><span>${thread.reaction_count} reactions</span></div></article>`;
}

function feedTabs(active: string, category?: string): string {
  const base = category === undefined ? "/community" : `/community/c/${encodeURIComponent(category)}`;
  return `<nav class="tabs" aria-label="Discussion order">${["latest", "active", "popular", "unanswered"].map((sort) => `<a ${sort === active ? 'aria-current="page"' : ""} href="${base}?sort=${sort}">${sort[0]!.toUpperCase()}${sort.slice(1)}</a>`).join("")}</nav>`;
}

export function communityHome(
  session: AppSession | null,
  categories: CategoryRow[],
  pinned: ThreadCardRow[],
  page: PageResult<ThreadCardRow>,
  sort: string,
  stats: CommunityStats,
  active: ThreadCardRow[],
  unanswered: ThreadCardRow[],
): string {
  const create = session === null ? "/community/sign-in?returnTo=%2Fcommunity%2Fnew" : "/community/new";
  return layout({
    title: "Community",
    description: "A calm forum for serious philosophical discussion, criticism, and public reasoning.",
    pathname: "/community",
    session,
    body: `<section class="community-hero"><p class="eyebrow">Disciplined public reason</p><h1>Community</h1><p>Examine ideas rigorously. Disagree openly. Keep human dignity intact.</p><div class="hero-actions"><a class="button" href="${create}">Create discussion</a><a class="button secondary" href="/community/rules">Read the rules</a></div></section>
<section class="community-stats" aria-label="Community statistics"><div><strong>${stats.members}</strong><span>Members</span></div><div><strong>${stats.discussions}</strong><span>Discussions</span></div><div><strong>${stats.replies}</strong><span>Replies</span></div><div><strong>${stats.unanswered}</strong><span>Unanswered</span></div></section>
<section aria-labelledby="categories-title"><div class="section-heading"><h2 id="categories-title">Categories</h2><a href="/community/search">Search all discussions</a></div><div class="category-grid">${categories.map((category) => `<a class="category-card" href="/community/c/${esc(category.slug)}"><strong>${esc(category.name)}</strong><span>${esc(category.description)}</span></a>`).join("")}</div></section>
${pinned.length === 0 ? "" : `<section aria-labelledby="featured-title"><h2 id="featured-title">Featured</h2>${pinned.map(threadCard).join("")}</section>`}
${active.length === 0 ? "" : `<section aria-labelledby="active-title"><h2 id="active-title">Active discussions</h2>${active.map(threadCard).join("")}</section>`}${unanswered.length === 0 ? "" : `<section aria-labelledby="unanswered-title"><h2 id="unanswered-title">Unanswered</h2>${unanswered.map(threadCard).join("")}</section>`}
<section aria-labelledby="discussions-title"><div class="section-heading"><h2 id="discussions-title">Latest discussions</h2>${feedTabs(sort)}</div>${page.items.length === 0 ? '<p class="empty">No discussions yet. The first serious contribution can begin here.</p>' : page.items.map(threadCard).join("")}${page.nextCursor === null ? "" : `<a class="button secondary load-more" href="/community?sort=${esc(sort)}&amp;after=${esc(page.nextCursor)}">More discussions</a>`}</section>`,
  });
}

export function categoryPage(
  session: AppSession | null,
  category: CategoryRow,
  page: PageResult<ThreadCardRow>,
  sort: string,
): string {
  return layout({
    title: category.name,
    description: category.description,
    pathname: `/community/c/${category.slug}`,
    session,
    body: `<section class="page-head"><p class="eyebrow">Category</p><h1>${esc(category.name)}</h1><p>${esc(category.description)}</p></section><section>${feedTabs(sort, category.slug)}${page.items.length === 0 ? '<p class="empty">No discussions in this category yet.</p>' : page.items.map(threadCard).join("")}${page.nextCursor === null ? "" : `<a class="button secondary load-more" href="/community/c/${esc(category.slug)}?sort=${esc(sort)}&amp;after=${esc(page.nextCursor)}">More</a>`}</section>`,
  });
}

export function rulesPage(session: AppSession | null): string {
  const rules = [
    "Argue ideas, not identities.",
    "No threats or advocacy of political violence.",
    "No racism, ethnic hatred, supremacy, or dehumanization.",
    "No glorification of terrorism or extremist organizations.",
    "No targeted harassment or doxxing.",
    "No spam or coordinated manipulation.",
    "Make serious claims in good faith.",
    "Criticism of Militarist Humanism is explicitly permitted.",
    "Moderation decisions should be reasoned and reviewable.",
    "Human dignity remains the baseline.",
  ];
  return layout({
    title: "Community rules",
    description: "Rules for open, critical, and dignified discussion.",
    pathname: "/community/rules",
    session,
    body: `<article class="prose page-article"><p class="eyebrow">Discussion covenant</p><h1>Community rules</h1><p>Disagreement is welcome. Criticism of the philosophy is not a moderation offense. These rules protect the conditions for serious argument.</p><ol class="rules-list">${rules.map((rule) => `<li>${esc(rule)}</li>`).join("")}</ol><h2>Review and accountability</h2><p>Reports are reviewed by moderators. Destructive actions require a reason and create an audit record. A moderator may restrict conduct, never viewpoint alone.</p></article>`,
  });
}

export function privacyPage(session: AppSession | null): string {
  return layout({
    title: "Community privacy and retention",
    description: "How site analytics, accounts, posts, moderation records, and security telemetry are handled.",
    pathname: "/community/privacy",
    session,
    body: `<article class="prose page-article"><p class="eyebrow">Privacy by restraint</p><h1>Privacy and retention</h1><h2>Site analytics</h2><p>Cloudflare Web Analytics measures aggregate visits and performance. No advertising tracker or browser fingerprinting is used.</p><h2>Community account data</h2><p>OAuth provides identity. Secure server-managed sessions expire. Provider access tokens are never shown in community or admin pages.</p><h2>Public writing</h2><p>Discussions and replies remain public until their author deletes them or a moderator hides them. Deleted text is removed from public view.</p><h2>Moderation and security</h2><p>Moderation reasons and restricted evidence are retained for accountability. Rate-limit and application telemetry is aggregated; raw visitor IP addresses are not copied into the application database.</p><h2>Retention</h2><p>Notifications are retained for up to 180 days, operational aggregates for 90 days, sessions until expiry, and moderation audit records for accountability.</p></article>`,
  });
}

function csrfInput(token: string | null): string {
  return token === null ? "" : `<input type="hidden" name="csrf" value="${esc(token)}">`;
}

function turnstileWidget(siteKey: string | undefined, action: string): string {
  return siteKey === undefined || siteKey.length === 0 ? "" : `<div class="cf-turnstile" data-sitekey="${esc(siteKey)}" data-action="${esc(action)}" data-response-field-name="turnstileToken"></div>`;
}

export function newThreadPage(
  session: AppSession,
  categories: CategoryRow[],
  csrf: string,
  siteKey: string | undefined,
): string {
  return layout({
    title: "Create discussion",
    description: "Begin a serious community discussion.",
    pathname: "/community/new",
    session,
    noindex: true,
    usesTurnstile: siteKey !== undefined,
    body: `<section class="form-page"><p class="eyebrow">New discussion</p><h1>State a question worth examining.</h1><form action="/api/community/threads" method="post" data-api-form data-draft-key="new-thread"><label>Title<input name="title" minlength="8" maxlength="160" required></label><label>Category<select name="categoryId" required>${categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></label><div class="composer"><div class="composer-tabs"><button type="button" data-composer-write aria-pressed="true">Write</button><button type="button" data-composer-preview aria-pressed="false">Preview</button></div><label>Discussion<textarea name="body" minlength="20" maxlength="20000" rows="14" required data-markdown-input></textarea></label><div class="markdown-preview" data-markdown-preview hidden></div><div class="counter" data-counter>0 / 20,000</div></div>${turnstileWidget(siteKey, "thread_create")}${csrfInput(csrf)}<button class="button" type="submit">Publish discussion</button><p class="form-status" data-form-status role="status"></p></form></section>`,
  });
}

export function signInPage(
  session: AppSession | null,
  providers: string[],
  siteKey: string | undefined,
  returnTo: string,
  configured: boolean,
): string {
  const providerButtons = providers.map((provider) => `<button class="button" type="submit" name="provider" value="${esc(provider)}">Continue with ${esc(provider[0]!.toUpperCase() + provider.slice(1))}</button>`).join("");
  return layout({
    title: "Sign in",
    description: "Sign in securely with an approved OAuth provider.",
    pathname: "/community/sign-in",
    session,
    noindex: true,
    usesTurnstile: siteKey !== undefined,
    body: `<section class="sign-in-card"><p class="eyebrow">Secure access</p><h1>Join the discussion</h1><p>Reading is public. Publishing requires a verified account and a secure, server-managed session.</p>${configured ? `<form action="/community/sign-in" method="post">${turnstileWidget(siteKey, "oauth_start")}<input type="hidden" name="returnTo" value="${esc(returnTo)}"><div class="provider-list">${providerButtons}</div></form>` : '<p class="notice">Sign-in providers are not configured in this environment.</p>'}<p class="fine-print">By continuing, you agree to the community rules and privacy terms.</p></section>`,
  });
}

function reactionButtons(
  csrf: string | null,
  targetType: "thread" | "post",
  targetPublicId: string,
  summaries: ReactionSummary[],
  returnTo: string,
): string {
  const map = new Map(summaries.map((row) => [row.reaction_type, row]));
  return `<div class="reactions" aria-label="Reactions">${(["insightful", "agree", "question", "well_argued"] as const).map((type) => {
    const summary = map.get(type);
    const label = type === "well_argued" ? "Well argued" : type[0]!.toUpperCase() + type.slice(1);
    return `<form action="/api/community/reactions" method="post" data-api-form><input type="hidden" name="targetType" value="${targetType}"><input type="hidden" name="targetPublicId" value="${esc(targetPublicId)}"><input type="hidden" name="reactionType" value="${type}"><input type="hidden" name="returnTo" value="${esc(returnTo)}">${csrfInput(csrf)}<button type="submit" ${summary?.viewer_reacted === 1 ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${esc(label)} <span>${summary?.reaction_count ?? 0}</span></button></form>`;
  }).join("")}</div>`;
}

function postDepth(posts: PostViewRow[], post: PostViewRow): number {
  const byPublicId = new Map(posts.map((candidate) => [candidate.public_id, candidate]));
  let depth = 0;
  let parentId = post.parent_public_id;
  const visited = new Set<string>();
  while (parentId !== null && depth < 4 && !visited.has(parentId)) {
    visited.add(parentId);
    depth += 1;
    parentId = byPublicId.get(parentId)?.parent_public_id ?? null;
  }
  return depth;
}

export function threadPage(
  session: AppSession | null,
  thread: ThreadDetail,
  posts: PostViewRow[],
  threadReactions: ReactionSummary[],
  postReactions: TargetReactionSummary[],
  csrf: string | null,
  siteKey: string | undefined,
  related: ThreadCardRow[],
  replySort: string,
  nextRepliesCursor: string | null,
): string {
  const path = canonicalThreadPath(thread);
  const reactionsByPost = new Map<string, TargetReactionSummary[]>();
  for (const reaction of postReactions) {
    const current = reactionsByPost.get(reaction.target_public_id) ?? [];
    current.push(reaction);
    reactionsByPost.set(reaction.target_public_id, current);
  }
  const ownerActions = session?.user.id === thread.author_id ? `<div class="owner-actions"><a href="${esc(path)}/edit">Edit discussion</a><form action="/api/community/threads/${esc(thread.public_id)}" method="post" data-api-form data-method="DELETE">${csrfInput(csrf)}<input type="hidden" name="returnTo" value="/community"><button type="submit">Delete discussion</button></form></div>` : "";
  const sessionActions = session === null
    ? `<a class="button secondary" href="/community/sign-in?returnTo=${encodeURIComponent(path)}">Sign in to participate</a>`
    : `<div class="thread-actions"><form action="/api/community/bookmarks" method="post" data-api-form><input type="hidden" name="threadPublicId" value="${esc(thread.public_id)}"><input type="hidden" name="returnTo" value="${esc(path)}">${csrfInput(csrf)}<button type="submit">${thread.viewer_bookmarked === 1 ? "Remove bookmark" : "Bookmark"}</button></form><form action="/api/community/follows" method="post" data-api-form><input type="hidden" name="threadPublicId" value="${esc(thread.public_id)}"><input type="hidden" name="returnTo" value="${esc(path)}">${csrfInput(csrf)}<button type="submit">${thread.viewer_following === 1 ? "Unfollow" : "Follow"}</button></form><button type="button" data-copy-link>Copy link</button></div>`;
  const replyComposer = session === null || thread.is_locked === 1 ? "" : `<section class="reply-composer" id="reply"><h2>Join the discussion</h2><form action="/api/community/threads/${esc(thread.public_id)}/posts" method="post" data-api-form data-draft-key="reply-${esc(thread.public_id)}"><div class="composer"><div class="composer-tabs"><button type="button" data-composer-write aria-pressed="true">Write</button><button type="button" data-composer-preview aria-pressed="false">Preview</button></div><label>Your reply<textarea name="body" minlength="2" maxlength="10000" rows="8" required data-markdown-input></textarea></label><div class="markdown-preview" data-markdown-preview hidden></div><div class="counter" data-counter>0 / 10,000</div></div>${turnstileWidget(siteKey, "reply_create")}${csrfInput(csrf)}<input type="hidden" name="returnTo" value="${esc(path)}"><button class="button" type="submit">Publish reply</button><p class="form-status" data-form-status role="status"></p></form></section>`;
  const postsHtml = posts.map((post) => {
    if (post.status === "deleted") return `<article class="post deleted" id="${esc(post.public_id)}"><p>Reply deleted by its author.</p></article>`;
    const own = session?.user.id === post.author_id ? `<a href="/community/posts/${esc(post.public_id)}/edit">Edit</a><form action="/api/community/posts/${esc(post.public_id)}" method="post" data-api-form data-method="DELETE">${csrfInput(csrf)}<input type="hidden" name="returnTo" value="${esc(path)}"><button type="submit">Delete</button></form>` : "";
    return `<article class="post depth-${postDepth(posts, post)}" id="${esc(post.public_id)}"><header>${avatar(post.author_name)}<div><a href="/u/${esc(post.author_handle)}">${esc(post.author_name)}</a>${post.author_role !== "member" ? `<span class="state">${esc(post.author_role)}</span>` : ""}<time datetime="${esc(isoDate(post.created_at))}">${esc(displayDate(post.created_at))}</time>${post.updated_at !== post.created_at ? '<span class="edited">Edited</span>' : ""}</div></header><div class="prose">${post.body_rendered}</div>${session === null ? "" : reactionButtons(csrf, "post", post.public_id, reactionsByPost.get(post.public_id) ?? [], `${path}#${post.public_id}`)}<footer><a href="#${esc(post.public_id)}">Permalink</a>${session === null ? "" : `<button type="button" data-reply-to="${esc(post.public_id)}">Reply</button>`}${own}<a href="/community/report?targetType=post&amp;target=${esc(post.public_id)}&amp;returnTo=${encodeURIComponent(`${path}#${post.public_id}`)}">Report</a></footer></article>`;
  }).join("");
  return layout({
    title: thread.title,
    description: markdownToText(thread.body_markdown, 160),
    pathname: path,
    session,
    usesTurnstile: siteKey !== undefined && session !== null,
    body: `<article class="thread-full"><div class="thread-kicker"><a href="/community/c/${esc(thread.category_slug)}">${esc(thread.category_name)}</a>${thread.is_official === 1 ? '<span class="state">Official</span>' : ""}${thread.is_pinned === 1 ? '<span class="state">Pinned</span>' : ""}${thread.is_locked === 1 ? '<span class="state">Locked</span>' : ""}</div><h1>${esc(thread.title)}</h1><div class="author-line">${avatar(thread.author_name)}<span>By <a href="/u/${esc(thread.author_handle)}">${esc(thread.author_name)}</a></span><time datetime="${esc(isoDate(thread.created_at))}">${esc(displayDate(thread.created_at))}</time>${thread.updated_at !== thread.created_at ? '<span>Edited</span>' : ""}</div>${ownerActions}<div class="prose thread-body">${thread.body_rendered}</div>${session === null ? "" : reactionButtons(csrf, "thread", thread.public_id, threadReactions, path)}${sessionActions}<div class="report-link"><a href="/community/report?targetType=thread&amp;target=${esc(thread.public_id)}&amp;returnTo=${encodeURIComponent(path)}">Report discussion</a></div></article><section aria-labelledby="replies-title"><div class="section-heading"><h2 id="replies-title">Replies <span>${thread.reply_count}</span></h2><nav class="tabs" aria-label="Reply order">${["oldest", "newest", "best", "most-discussed"].map((sort) => `<a ${sort === replySort ? 'aria-current="page"' : ""} href="${esc(path)}?replies=${sort}">${sort.replace("-", " ")}</a>`).join("")}</nav></div>${posts.length === 0 ? '<p class="empty">No replies yet.</p>' : postsHtml}${nextRepliesCursor === null ? "" : `<a class="button secondary load-more" href="${esc(path)}?replies=${esc(replySort)}&amp;afterReplies=${esc(nextRepliesCursor)}">More replies</a>`}</section>${replyComposer}${related.length === 0 ? "" : `<section><h2>Related discussions</h2>${related.map(threadCard).join("")}</section>`}`,
  });
}

export function editThreadPage(session: AppSession, thread: ThreadDetail, categories: CategoryRow[], csrf: string): string {
  const path = canonicalThreadPath(thread);
  return layout({ title: "Edit discussion", description: "Edit your discussion.", pathname: `${path}/edit`, session, noindex: true, body: `<section class="form-page"><p class="eyebrow">Author controls</p><h1>Edit discussion</h1><form action="/api/community/threads/${esc(thread.public_id)}" method="post" data-api-form data-method="PATCH" data-draft-key="edit-${esc(thread.public_id)}">${csrfInput(csrf)}<input type="hidden" name="returnTo" value="${esc(path)}"><label>Title<input name="title" minlength="8" maxlength="160" value="${esc(thread.title)}" required></label><label>Category<select name="categoryId">${categories.map((category) => `<option value="${esc(category.id)}" ${category.id === thread.category_id ? "selected" : ""}>${esc(category.name)}</option>`).join("")}</select></label><div class="composer"><div class="composer-tabs"><button type="button" data-composer-write aria-pressed="true">Write</button><button type="button" data-composer-preview aria-pressed="false">Preview</button></div><label>Discussion<textarea name="body" minlength="20" maxlength="20000" rows="14" required data-markdown-input>${esc(thread.body_markdown)}</textarea></label><div class="markdown-preview" data-markdown-preview hidden></div><div class="counter" data-counter></div></div><button class="button" type="submit">Save changes</button><p class="form-status" data-form-status role="status"></p></form></section>` });
}

export function editPostPage(session: AppSession, post: PostViewRow, returnTo: string, csrf: string): string {
  return layout({ title: "Edit reply", description: "Edit your reply.", pathname: `/community/posts/${post.public_id}/edit`, session, noindex: true, body: `<section class="form-page"><p class="eyebrow">Author controls</p><h1>Edit reply</h1><form action="/api/community/posts/${esc(post.public_id)}" method="post" data-api-form data-method="PATCH" data-draft-key="edit-${esc(post.public_id)}">${csrfInput(csrf)}<input type="hidden" name="returnTo" value="${esc(returnTo)}"><div class="composer"><div class="composer-tabs"><button type="button" data-composer-write aria-pressed="true">Write</button><button type="button" data-composer-preview aria-pressed="false">Preview</button></div><label>Reply<textarea name="body" minlength="2" maxlength="10000" rows="10" required data-markdown-input>${esc(post.body_markdown)}</textarea></label><div class="markdown-preview" data-markdown-preview hidden></div><div class="counter" data-counter></div></div><button class="button" type="submit">Save changes</button><p class="form-status" data-form-status role="status"></p></form></section>` });
}

export function reportPage(
  session: AppSession,
  targetType: string,
  target: string,
  returnTo: string,
  csrf: string,
  siteKey: string | undefined,
): string {
  return layout({
    title: "Report content",
    description: "Send a reasoned report to the moderation queue.",
    pathname: "/community/report",
    session,
    noindex: true,
    usesTurnstile: siteKey !== undefined,
    body: `<section class="form-page"><p class="eyebrow">Moderation request</p><h1>Report content</h1><p>Reports are for rule violations, not disagreement. Provide enough context for a reasoned review.</p><form action="/api/community/reports" method="post" data-api-form><input type="hidden" name="targetType" value="${esc(targetType)}"><input type="hidden" name="targetPublicId" value="${esc(target)}"><input type="hidden" name="returnTo" value="${esc(returnTo)}"><label>Reason<select name="reason"><option value="threat">Threat or violence</option><option value="hatred">Hatred or dehumanization</option><option value="harassment">Harassment</option><option value="spam">Spam or manipulation</option><option value="doxxing">Doxxing</option><option value="misinformation">Serious false claim</option><option value="other">Other</option></select></label><label>Details<textarea name="details" maxlength="2000" rows="6"></textarea></label>${turnstileWidget(siteKey, "report_create")}${csrfInput(csrf)}<button class="button" type="submit">Submit report</button><p class="form-status" data-form-status role="status"></p></form></section>`,
  });
}

export function searchPage(
  session: AppSession | null,
  query: string,
  page: PageResult<SearchRow>,
): string {
  return layout({
    title: "Search community",
    description: "Search public discussions and replies.",
    pathname: "/community/search",
    session,
    body: `<section class="page-head"><p class="eyebrow">Full-text search</p><h1>Search the community</h1><form action="/community/search" method="get" class="search-form"><label for="q">Words or ideas</label><div><input id="q" name="q" value="${esc(query)}" minlength="2" maxlength="120"><button class="button" type="submit">Search</button></div></form></section><section aria-live="polite">${query.length < 2 ? '<p class="empty">Enter at least two letters or numbers.</p>' : page.items.length === 0 ? '<p class="empty">No matching public discussion was found.</p>' : page.items.map((result) => `<article class="search-result"><p class="eyebrow">${esc(result.target_type)}</p><h2><a href="/community/t/${esc(result.thread_slug)}-${esc(result.thread_public_id)}${result.target_type === "post" ? `#${esc(result.target_public_id)}` : ""}">${esc(result.thread_title)}</a></h2><p>${highlightedSnippet(result.body, query)}</p></article>`).join("")}${page.nextCursor === null ? "" : `<a class="button secondary" href="/community/search?q=${encodeURIComponent(query)}&amp;after=${esc(page.nextCursor)}">More results</a>`}</section>`,
  });
}

export function savedThreadsPage(session: AppSession, title: string, threads: ThreadCardRow[]): string {
  return layout({
    title,
    description: `${title} for your account.`,
    pathname: title === "Bookmarks" ? "/me/bookmarks" : "/me/following",
    session,
    noindex: true,
    body: `<section class="page-head"><p class="eyebrow">Private collection</p><h1>${esc(title)}</h1></section><section>${threads.length === 0 ? '<p class="empty">Nothing here yet.</p>' : threads.map(threadCard).join("")}</section>`,
  });
}

export function notificationsPage(session: AppSession, notifications: NotificationRow[], csrf: string): string {
  return layout({
    title: "Notifications",
    description: "Private community notifications.",
    pathname: "/notifications",
    session,
    noindex: true,
    body: `<section class="page-head"><p class="eyebrow">Private inbox</p><div class="section-heading"><h1>Notifications</h1><form action="/api/notifications" method="post" data-api-form>${csrfInput(csrf)}<input type="hidden" name="markAll" value="true"><input type="hidden" name="returnTo" value="/notifications"><button type="submit">Mark all read</button></form></div></section><section class="notification-list">${notifications.length === 0 ? '<p class="empty">No notifications.</p>' : notifications.map((item) => `<article class="notification ${item.read_at === null ? "unread" : ""}"><div><p>${esc(item.summary)}</p><time datetime="${esc(isoDate(item.created_at))}">${esc(displayDate(item.created_at))}</time></div>${item.thread_public_id === null ? "" : `<a href="/community/t/${esc(item.thread_slug)}-${esc(item.thread_public_id)}${item.post_public_id === null ? "" : `#${esc(item.post_public_id)}`}">Open</a>`}${item.read_at === null ? `<form action="/api/notifications" method="post" data-api-form>${csrfInput(csrf)}<input type="hidden" name="notificationId" value="${item.id}"><input type="hidden" name="returnTo" value="/notifications"><button type="submit">Mark read</button></form>` : ""}</article>`).join("")}</section>`,
  });
}

export function profilePage(
  session: AppSession | null,
  profile: PublicProfile,
  threads: ThreadCardRow[],
  posts: Array<{ public_id: string; body_markdown: string; created_at: string; thread_public_id: string; thread_slug: string; thread_title: string }>,
  csrf: string | null,
): string {
  const isOwner = session?.user.id === profile.user_id;
  const privateProfile = profile.visibility === "limited" && !isOwner;
  const reportMember = session !== null && !isOwner
    ? `<p class="report-link"><a href="/community/report?targetType=user&amp;target=${esc(profile.public_id)}&amp;returnTo=${encodeURIComponent(`/u/${profile.handle}`)}">Report member</a></p>`
    : "";
  return layout({
    title: profile.display_name,
    description: privateProfile ? "A community member profile." : profile.biography || `Community profile for ${profile.display_name}.`,
    pathname: `/u/${profile.handle}`,
    session,
    noindex: profile.visibility === "limited",
    body: `<section class="profile-head">${avatar(profile.display_name)}<div><p class="eyebrow">@${esc(profile.handle)}</p><h1>${esc(profile.display_name)}</h1><p>Joined ${esc(displayDate(profile.created_at))}</p>${profile.role !== "member" ? `<span class="state">${esc(profile.role)}</span>` : ""}</div></section>${reportMember}${privateProfile ? '<p class="empty">This member limits profile activity visibility.</p>' : `<section class="prose"><p>${esc(profile.biography || "No biography provided.")}</p><p>${profile.thread_count} discussions · ${profile.reply_count} replies</p></section><section><h2>Recent discussions</h2>${threads.length === 0 ? '<p class="empty">No public discussions.</p>' : threads.map(threadCard).join("")}</section><section><h2>Recent replies</h2>${posts.length === 0 ? '<p class="empty">No public replies.</p>' : posts.map((post) => `<article class="search-result"><h3><a href="/community/t/${esc(post.thread_slug)}-${esc(post.thread_public_id)}#${esc(post.public_id)}">${esc(post.thread_title)}</a></h3><p>${esc(markdownToText(post.body_markdown, 220))}</p><time datetime="${esc(isoDate(post.created_at))}">${esc(displayDate(post.created_at))}</time></article>`).join("")}</section>`}${isOwner ? `<section class="form-page"><h2>Edit profile</h2><form action="/api/community/profile" method="post" data-api-form data-method="PATCH">${csrfInput(csrf)}<input type="hidden" name="returnTo" value="/u/${esc(profile.handle)}"><label>Display name<input name="displayName" maxlength="80" value="${esc(profile.display_name)}" required></label><label>Biography<textarea name="biography" maxlength="500" rows="5">${esc(profile.biography)}</textarea></label><label>Profile visibility<select name="visibility"><option value="public" ${profile.visibility === "public" ? "selected" : ""}>Public</option><option value="limited" ${profile.visibility === "limited" ? "selected" : ""}>Limited</option></select></label><button class="button" type="submit">Save profile</button><p class="form-status" data-form-status role="status"></p></form></section>` : ""}`,
  });
}

function adminNav(active: string): string {
  const items = ["overview", "analytics", "community", "moderation", "users", "reports", "audit"];
  return `<nav class="admin-nav" aria-label="Administration">${items.map((item) => `<a href="/admin/${item}" ${active === item ? 'aria-current="page"' : ""}>${item[0]!.toUpperCase()}${item.slice(1)}</a>`).join("")}</nav>`;
}

function adminLayout(session: AppSession, active: string, title: string, body: string): string {
  return layout({
    title,
    description: "Protected community administration.",
    pathname: `/admin/${active}`,
    session,
    noindex: true,
    admin: true,
    body: `${adminNav(active)}${body}`,
  });
}

export function adminOverviewPage(session: AppSession, stats: OverviewStats, range: string): string {
  const cards: Array<[string, number]> = [
    ["Community members", stats.members], ["New members today", stats.new_members_today], ["New members in range", stats.new_members_range],
    ["Active members", stats.active_members], ["Threads", stats.threads], ["Threads today", stats.threads_today],
    ["Replies", stats.replies], ["Replies today", stats.replies_today], ["Pending reports", stats.reports_pending],
    ["Locked threads", stats.locked_threads], ["Moderation actions", stats.moderation_actions], ["API failures", stats.api_failures], ["Rate-limited requests", stats.rate_limited],
  ];
  return adminLayout(session, "overview", "Admin overview", `<section class="page-head"><p class="eyebrow">Owner view</p><div class="section-heading"><h1>Community overview</h1>${rangeSelector("/admin/overview", range)}</div><p>Website visitor metrics remain in Cloudflare Web Analytics; only reliable first-party community values are shown here.</p></section><section class="metric-grid">${cards.map(([label, value]) => `<article><span>${esc(label)}</span><strong>${value}</strong></article>`).join("")}</section>`);
}

function rangeSelector(path: string, current: string): string {
  return `<nav class="tabs" aria-label="Time range">${["24h", "7d", "30d", "90d"].map((range) => `<a href="${path}?range=${range}" ${range === current ? 'aria-current="page"' : ""}>${range}</a>`).join("")}</nav>`;
}

export function adminAnalyticsPage(session: AppSession, points: AnalyticsPoint[], range: string, top: TopContent): string {
  const totals = new Map<string, number>();
  for (const point of points) totals.set(point.event_type, (totals.get(point.event_type) ?? 0) + point.event_count);
  const rows = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  const maximum = Math.max(1, ...rows.map(([, count]) => count));
  return adminLayout(session, "analytics", "Product analytics", `<section class="page-head"><p class="eyebrow">First-party aggregates</p><div class="section-heading"><h1>Product analytics</h1>${rangeSelector("/admin/analytics", range)}</div><p>No message bodies, raw IP addresses, session tokens, or fingerprints are stored in these aggregates.</p></section><section class="chart" aria-labelledby="events-chart"><h2 id="events-chart">Engagement and operations</h2>${rows.length === 0 ? '<p class="empty">No aggregate events in this range.</p>' : rows.map(([event, total]) => `<div class="bar-row"><span>${esc(event)}</span><svg viewBox="0 0 100 10" role="img" aria-label="${esc(event)}: ${total}"><rect width="100" height="10" class="bar-track"></rect><rect width="${Math.max(1, Math.round((total / maximum) * 100))}" height="10" class="bar-value"></rect></svg><strong>${total}</strong></div>`).join("")}</section><section class="admin-split"><div><h2>Top discussions</h2>${top.discussions.length === 0 ? '<p class="empty">No activity in range.</p>' : `<ol class="ranked-list">${top.discussions.map((item) => `<li><a href="/community/t/${esc(item.slug)}-${esc(item.public_id)}">${esc(item.title)}</a><span>${item.reply_count} replies · ${item.reaction_count} reactions</span></li>`).join("")}</ol>`}</div><div><h2>Top categories</h2>${top.categories.length === 0 ? '<p class="empty">No category activity.</p>' : `<ol class="ranked-list">${top.categories.map((item) => `<li><a href="/community/c/${esc(item.slug)}">${esc(item.name)}</a><span>${item.thread_count} discussions · ${item.reply_count} replies</span></li>`).join("")}</ol>`}</div></section>`);
}

export function adminCommunityPage(session: AppSession, categories: CategoryRow[], threads: AdminThreadRow[], csrf: string, readOnly: boolean): string {
  const categoryForms = categories.map((category) => `
    <form action="/api/admin/categories" method="post" data-api-form data-method="PATCH" class="category-admin">
      ${csrfInput(csrf)}<input type="hidden" name="id" value="${esc(category.id)}"><input type="hidden" name="returnTo" value="/admin/community">
      <label>Name<input name="name" value="${esc(category.name)}" required></label>
      <label>Slug<input name="slug" value="${esc(category.slug)}" required></label>
      <label>Description<input name="description" value="${esc(category.description)}" required></label>
      <label>Order<input name="sortOrder" type="number" value="${category.sort_order}"></label>
      <label>Visibility<select name="isVisible"><option value="true" ${category.is_visible === 1 ? "selected" : ""}>Visible</option><option value="false" ${category.is_visible === 0 ? "selected" : ""}>Hidden</option></select></label>
      <button type="submit">Save</button>
    </form>`).join("");
  const threadForms = threads.map((thread) => `
    <article class="admin-thread"><div><strong>${esc(thread.title)}</strong><span>${esc(thread.status)} · ${esc(thread.category_name)} · @${esc(thread.author_handle)} · ${thread.reply_count} replies</span></div>
      <form action="/api/admin/moderation" method="post" data-api-form>${csrfInput(csrf)}
        <input type="hidden" name="targetType" value="thread"><input type="hidden" name="targetPublicId" value="${esc(thread.public_id)}"><input type="hidden" name="returnTo" value="/admin/community">
        <label>Reason<input name="reason" minlength="8" maxlength="2000" required></label>
        <label>Move to<select name="categoryId">${categories.map((category) => `<option value="${esc(category.id)}" ${category.id === thread.category_id ? "selected" : ""}>${esc(category.name)}</option>`).join("")}</select></label>
        <div class="compact-actions"><button name="action" value="move" type="submit">Move</button><button name="action" value="${thread.is_pinned === 1 ? "unpin" : "pin"}" type="submit">${thread.is_pinned === 1 ? "Unpin" : "Pin"}</button><button name="action" value="${thread.is_locked === 1 ? "unlock" : "lock"}" type="submit">${thread.is_locked === 1 ? "Unlock" : "Lock"}</button><button name="action" value="${thread.status === "hidden" ? "restore" : "hide"}" type="submit">${thread.status === "hidden" ? "Restore" : "Hide"}</button></div>
      </form>
    </article>`).join("");
  return adminLayout(session, "community", "Community management", `
    <section class="page-head"><p class="eyebrow">Configuration</p><h1>Community management</h1></section>
    <section class="admin-panel"><h2>Emergency write control</h2><form action="/api/admin/settings/community" method="post" data-api-form data-method="PATCH">${csrfInput(csrf)}<input type="hidden" name="readOnly" value="${readOnly ? "false" : "true"}"><input type="hidden" name="returnTo" value="/admin/community"><label>Reason<input name="reason" minlength="8" maxlength="2000" required></label><button class="button" type="submit">${readOnly ? "Resume community writes" : "Set community read-only"}</button></form></section>
    <section class="admin-panel"><div class="section-heading"><h2>Categories</h2><span>${categories.length}</span></div><details><summary>Create category</summary><form action="/api/admin/categories" method="post" data-api-form data-method="PATCH" class="category-admin">${csrfInput(csrf)}<input type="hidden" name="returnTo" value="/admin/community"><label>Name<input name="name" required></label><label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required></label><label>Description<input name="description" minlength="8" maxlength="300" required></label><label>Order<input name="sortOrder" type="number" value="100"></label><label>Visibility<select name="isVisible"><option value="true">Visible</option><option value="false">Hidden</option></select></label><button type="submit">Create</button></form></details>${categoryForms}</section>
    <section class="admin-panel"><h2>Recent discussions</h2>${threads.length === 0 ? '<p class="empty">No discussions.</p>' : threadForms}</section>`);
}

export function adminReportsPage(session: AppSession, reports: ReportRow[], csrf: string, active: "reports" | "moderation" = "reports"): string {
  return adminLayout(session, active, active === "reports" ? "Reports" : "Moderation queue", `<section class="page-head"><p class="eyebrow">Reasoned review</p><h1>${active === "reports" ? "Reports" : "Moderation queue"}</h1><nav class="tabs"><a href="/admin/${active}?status=open">Open</a><a href="/admin/${active}?status=reviewing">Reviewing</a><a href="/admin/${active}?status=resolved">Resolved</a><a href="/admin/${active}?status=dismissed">Dismissed</a></nav></section><section>${reports.length === 0 ? '<p class="empty">The queue is clear.</p>' : reports.map((report) => { const actionButtons = report.target_type === "thread" ? '<button name="action" value="hide" type="submit">Hide target</button><button name="action" value="lock" type="submit">Lock target</button><button name="action" value="pin" type="submit">Pin target</button>' : report.target_type === "post" ? '<button name="action" value="hide" type="submit">Hide target</button>' : '<input name="restrictionHours" type="number" min="1" max="8760" value="24"><button name="action" value="warn" type="submit">Warn</button><button name="action" value="restrict" type="submit">Restrict</button>'; return `<article class="report-card"><header><strong>${esc(report.reason)}</strong><span>${esc(report.status)}</span><time datetime="${esc(isoDate(report.created_at))}">${esc(displayDate(report.created_at))}</time></header><p>${esc(report.details || "No additional details.")}</p><dl><dt>Target</dt><dd>${esc(report.target_type)} · ${esc(report.target_public_id)}</dd><dt>Report</dt><dd>${esc(report.public_id)}</dd></dl>${report.status === "open" ? `<form action="/api/admin/reports/review" method="post" data-api-form>${csrfInput(csrf)}<input type="hidden" name="reportPublicId" value="${esc(report.public_id)}"><input type="hidden" name="returnTo" value="/admin/${active}?status=reviewing"><button type="submit">Begin review</button></form>` : ""}${report.status === "open" || report.status === "reviewing" ? `<form action="/api/admin/moderation" method="post" data-api-form>${csrfInput(csrf)}<input type="hidden" name="targetType" value="${esc(report.target_type)}"><input type="hidden" name="targetPublicId" value="${esc(report.target_public_id)}"><input type="hidden" name="returnTo" value="/admin/${active}"><label>Target-action reason<input name="reason" minlength="8" maxlength="2000" required></label><div class="compact-actions">${actionButtons}</div></form><form action="/api/admin/moderation" method="post" data-api-form>${csrfInput(csrf)}<input type="hidden" name="targetType" value="report"><input type="hidden" name="targetPublicId" value="${esc(report.public_id)}"><input type="hidden" name="returnTo" value="/admin/${active}"><label>Resolution reason<input name="reason" minlength="8" maxlength="2000" required></label><button name="action" value="resolve" type="submit">Resolve</button><button name="action" value="dismiss" type="submit">Dismiss</button></form>` : `<p class="fine-print">Resolution: ${esc(report.resolution ?? "No resolution text.")}</p>`}</article>`; }).join("")}</section>`);
}

export function adminUsersPage(session: AppSession, users: AdminUserRow[], csrf: string, query: string): string {
  return adminLayout(session, "users", "Users", `<section class="page-head"><p class="eyebrow">Least-privilege account view</p><h1>Members</h1><form method="get" action="/admin/users" class="search-form"><label for="user-q">Search public profile fields</label><div><input id="user-q" name="q" value="${esc(query)}"><button type="submit">Search</button></div></form></section><section class="user-table"><table><thead><tr><th>Member</th><th>Role</th><th>Activity</th><th>Restrictions</th><th>Moderation</th><th>Role action</th></tr></thead><tbody>${users.map((user) => `<tr><td><a href="/u/${esc(user.handle)}">${esc(user.display_name)}</a><small>@${esc(user.handle)}</small></td><td>${esc(user.role)}</td><td>${user.thread_count} / ${user.reply_count}</td><td>${user.active_restrictions}</td><td>${user.role === "admin" ? "Protected" : `<form action="/api/admin/moderation" method="post" data-api-form>${csrfInput(csrf)}<input type="hidden" name="targetType" value="user"><input type="hidden" name="targetPublicId" value="${esc(user.public_id)}"><input type="hidden" name="returnTo" value="/admin/users"><input name="reason" minlength="8" maxlength="2000" placeholder="Reason" required><input name="restrictionHours" type="number" min="1" max="8760" value="24"><div class="compact-actions"><button name="action" value="warn" type="submit">Warn</button><button name="action" value="restrict" type="submit">Restrict</button>${user.active_restrictions > 0 ? '<button name="action" value="unrestrict" type="submit">Lift</button>' : ""}</div></form>`}</td><td>${session.profile.role !== "admin" || user.role === "admin" ? "—" : `<form action="/api/admin/users/role" method="post" data-api-form data-method="PATCH">${csrfInput(csrf)}<input type="hidden" name="userId" value="${esc(user.user_id)}"><input type="hidden" name="returnTo" value="/admin/users"><select name="role"><option value="member">Member</option><option value="moderator" ${user.role === "moderator" ? "selected" : ""}>Moderator</option></select><input name="reason" minlength="8" maxlength="2000" placeholder="Reason" required><button type="submit">Apply</button></form>`}</td></tr>`).join("")}</tbody></table></section>`);
}

export function adminAuditPage(session: AppSession, rows: AuditRow[], nextCursor: string | null): string {
  return adminLayout(session, "audit", "Audit log", `<section class="page-head"><p class="eyebrow">Append-only accountability</p><h1>Audit log</h1></section><section class="audit-list">${rows.length === 0 ? '<p class="empty">No audit events.</p>' : rows.map((row) => `<article><time datetime="${esc(isoDate(row.created_at))}">${esc(displayDate(row.created_at))}</time><strong>${esc(row.action)}</strong><span>${esc(row.actor_handle ?? "system")}</span><span>${esc(row.target_type)} · ${esc(row.target_public_id ?? "—")}</span><p>${esc(row.reason ?? "No reason recorded.")}</p></article>`).join("")}${nextCursor === null ? "" : `<a class="button secondary" href="/admin/audit?after=${esc(nextCursor)}">Older events</a>`}</section>`);
}
