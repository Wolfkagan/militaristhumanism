PRAGMA foreign_keys = ON;

CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
  public_id TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  biography TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'limited')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  author_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 8 AND 160),
  body_markdown TEXT NOT NULL CHECK (length(body_markdown) BETWEEN 20 AND 20000),
  body_rendered TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  is_official INTEGER NOT NULL DEFAULT 0 CHECK (is_official IN (0, 1)),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
  reply_count INTEGER NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  reaction_count INTEGER NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
  view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_activity_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  thread_id INTEGER NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
  parent_post_id INTEGER REFERENCES posts (id) ON DELETE SET NULL,
  body_markdown TEXT NOT NULL CHECK (length(body_markdown) BETWEEN 2 AND 10000),
  body_rendered TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  reaction_count INTEGER NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE TABLE reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'post')),
  target_public_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('insightful', 'agree', 'question', 'well_argued')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, target_type, target_public_id, reaction_type)
);

CREATE TABLE bookmarks (
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  thread_id INTEGER NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, thread_id)
);

CREATE TABLE thread_follows (
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  thread_id INTEGER NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, thread_id)
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('thread_reply', 'post_reply', 'moderation', 'follow_activity')),
  thread_id INTEGER REFERENCES threads (id) ON DELETE CASCADE,
  post_id INTEGER REFERENCES posts (id) ON DELETE CASCADE,
  summary TEXT NOT NULL CHECK (length(summary) <= 240),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at TEXT
);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  reporter_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'post', 'user')),
  target_public_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('threat', 'hatred', 'harassment', 'spam', 'doxxing', 'misinformation', 'other')),
  details TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  assigned_moderator_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  resolution TEXT CHECK (resolution IS NULL OR length(resolution) <= 2000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);

CREATE TABLE moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  moderator_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'post', 'user', 'category', 'report')),
  target_public_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('hide', 'restore', 'lock', 'unlock', 'pin', 'unpin', 'move', 'warn', 'restrict', 'unrestrict', 'resolve', 'dismiss', 'role_change')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 8 AND 2000),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE moderation_content_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moderation_action_id INTEGER NOT NULL REFERENCES moderation_actions (id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'post')),
  target_public_id TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  body_rendered TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE user_restrictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  imposed_by TEXT NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 8 AND 2000),
  starts_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  lifted_at TEXT,
  lifted_by TEXT REFERENCES "user" (id) ON DELETE SET NULL
);

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_public_id TEXT,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE product_event_rollups (
  bucket_start TEXT NOT NULL,
  event_type TEXT NOT NULL,
  dimension TEXT NOT NULL DEFAULT 'all',
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  total_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (total_latency_ms >= 0),
  PRIMARY KEY (bucket_start, event_type, dimension)
);

CREATE TABLE community_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
