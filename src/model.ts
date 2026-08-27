export type Role = "member" | "moderator" | "admin";

export interface ProfileRow {
  user_id: string;
  public_id: string;
  handle: string;
  display_name: string;
  biography: string;
  role: Role;
  visibility: "public" | "limited";
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
}

export interface AppSession {
  id: string;
  expiresAt: Date;
  user: AppUser;
  profile: ProfileRow;
  isNewProfile: boolean;
}

export interface AppVariables {
  requestId: string;
  startedAt: number;
  session: AppSession | null;
  csrfToken: string | null;
  cspNonce: string;
}

export type AppBindings = {
  Bindings: Env;
  Variables: AppVariables;
};

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  is_visible: number;
  created_at: string;
  updated_at: string;
}

export interface ThreadRow {
  id: number;
  public_id: string;
  slug: string;
  category_id: string;
  author_id: string;
  title: string;
  body_markdown: string;
  body_rendered: string;
  status: "visible" | "hidden" | "deleted";
  is_official: number;
  is_pinned: number;
  is_locked: number;
  reply_count: number;
  reaction_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  deleted_at: string | null;
}

export interface ThreadCardRow extends ThreadRow {
  category_slug: string;
  category_name: string;
  author_handle: string;
  author_name: string;
}

export interface PostRow {
  id: number;
  public_id: string;
  thread_id: number;
  author_id: string;
  parent_post_id: number | null;
  body_markdown: string;
  body_rendered: string;
  status: "visible" | "hidden" | "deleted";
  reaction_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PostViewRow extends PostRow {
  author_handle: string;
  author_name: string;
  author_role: Role;
  parent_public_id: string | null;
  child_count: number;
}

export interface ReportRow {
  id: number;
  public_id: string;
  reporter_id: string;
  target_type: "thread" | "post" | "user";
  target_public_id: string;
  reason: string;
  details: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  assigned_moderator_id: string | null;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}
