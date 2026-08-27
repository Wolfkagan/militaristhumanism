PRAGMA foreign_keys = ON;

-- community_search is a derived FTS5 index, never an authoritative backup
-- source. Rebuild it only after authoritative threads/posts are restored.
DELETE FROM community_search;

INSERT INTO community_search (target_type, target_public_id, thread_public_id, title, body)
SELECT 'thread', public_id, public_id, title, body_markdown
FROM threads
WHERE status = 'visible';

INSERT INTO community_search (target_type, target_public_id, thread_public_id, title, body)
SELECT 'post', posts.public_id, threads.public_id, '', posts.body_markdown
FROM posts
JOIN threads ON threads.id = posts.thread_id
WHERE posts.status = 'visible' AND threads.status = 'visible';
