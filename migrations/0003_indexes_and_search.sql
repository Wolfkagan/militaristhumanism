PRAGMA foreign_keys = ON;

CREATE INDEX idx_categories_visible_sort ON categories (is_visible, sort_order, name);
CREATE INDEX idx_threads_category_activity ON threads (category_id, status, is_pinned DESC, last_activity_at DESC, id DESC);
CREATE INDEX idx_threads_author_created ON threads (author_id, created_at DESC, id DESC);
CREATE INDEX idx_threads_status_created ON threads (status, created_at DESC, id DESC);
CREATE INDEX idx_posts_thread_created ON posts (thread_id, status, created_at ASC, id ASC);
CREATE INDEX idx_posts_parent ON posts (parent_post_id, created_at ASC);
CREATE INDEX idx_posts_author_created ON posts (author_id, created_at DESC, id DESC);
CREATE INDEX idx_reactions_target ON reactions (target_type, target_public_id, reaction_type);
CREATE INDEX idx_bookmarks_user_created ON bookmarks (user_id, created_at DESC);
CREATE INDEX idx_follows_user_created ON thread_follows (user_id, created_at DESC);
CREATE INDEX idx_notifications_user_read_created ON notifications (user_id, read_at, created_at DESC, id DESC);
CREATE INDEX idx_reports_status_created ON reports (status, created_at ASC, id ASC);
CREATE INDEX idx_moderation_created ON moderation_actions (created_at DESC, id DESC);
CREATE INDEX idx_moderation_target ON moderation_actions (target_type, target_public_id, created_at DESC);
CREATE INDEX idx_restrictions_user_active ON user_restrictions (user_id, lifted_at, expires_at DESC);
CREATE INDEX idx_audit_created ON audit_events (created_at DESC, id DESC);
CREATE INDEX idx_rollups_event_bucket ON product_event_rollups (event_type, bucket_start DESC);

CREATE VIRTUAL TABLE community_search USING fts5(
  target_type UNINDEXED,
  target_public_id UNINDEXED,
  thread_public_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER threads_search_insert AFTER INSERT ON threads
WHEN NEW.status = 'visible'
BEGIN
  INSERT INTO community_search (target_type, target_public_id, thread_public_id, title, body)
  VALUES ('thread', NEW.public_id, NEW.public_id, NEW.title, NEW.body_markdown);
END;

CREATE TRIGGER threads_search_update AFTER UPDATE ON threads
BEGIN
  DELETE FROM community_search WHERE target_type = 'thread' AND target_public_id = OLD.public_id;
  INSERT INTO community_search (target_type, target_public_id, thread_public_id, title, body)
  SELECT 'thread', NEW.public_id, NEW.public_id, NEW.title, NEW.body_markdown
  WHERE NEW.status = 'visible';
END;

CREATE TRIGGER threads_search_delete AFTER DELETE ON threads
BEGIN
  DELETE FROM community_search WHERE target_type = 'thread' AND target_public_id = OLD.public_id;
END;

CREATE TRIGGER posts_search_insert AFTER INSERT ON posts
WHEN NEW.status = 'visible'
BEGIN
  INSERT INTO community_search (target_type, target_public_id, thread_public_id, title, body)
  SELECT 'post', NEW.public_id, threads.public_id, '', NEW.body_markdown
  FROM threads WHERE threads.id = NEW.thread_id;
END;

CREATE TRIGGER posts_search_update AFTER UPDATE ON posts
BEGIN
  DELETE FROM community_search WHERE target_type = 'post' AND target_public_id = OLD.public_id;
  INSERT INTO community_search (target_type, target_public_id, thread_public_id, title, body)
  SELECT 'post', NEW.public_id, threads.public_id, '', NEW.body_markdown
  FROM threads WHERE threads.id = NEW.thread_id AND NEW.status = 'visible';
END;

CREATE TRIGGER posts_search_delete AFTER DELETE ON posts
BEGIN
  DELETE FROM community_search WHERE target_type = 'post' AND target_public_id = OLD.public_id;
END;
