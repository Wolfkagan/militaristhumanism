PRAGMA foreign_keys = ON;

DELETE FROM reports WHERE reporter_id IN ('e2e-member', 'e2e-moderator', 'e2e-admin');
DELETE FROM moderation_actions WHERE moderator_id IN ('e2e-member', 'e2e-moderator', 'e2e-admin');
DELETE FROM audit_events WHERE actor_id IN ('e2e-member', 'e2e-moderator', 'e2e-admin');
DELETE FROM user_restrictions WHERE user_id IN ('e2e-member', 'e2e-moderator', 'e2e-admin') OR imposed_by IN ('e2e-member', 'e2e-moderator', 'e2e-admin');
DELETE FROM posts WHERE author_id IN ('e2e-member', 'e2e-moderator', 'e2e-admin');
DELETE FROM threads WHERE author_id IN ('e2e-member', 'e2e-moderator', 'e2e-admin');
DELETE FROM "user" WHERE id IN ('e2e-member', 'e2e-moderator', 'e2e-admin');
