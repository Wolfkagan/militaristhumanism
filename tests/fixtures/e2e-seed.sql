PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES
  ('e2e-member', 'E2E Member', 'e2e-member@test.invalid', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('e2e-member-r1', 'E2E Member R1', 'e2e-member-r1@test.invalid', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('e2e-member-r2', 'E2E Member R2', 'e2e-member-r2@test.invalid', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('e2e-moderator', 'E2E Moderator', 'e2e-moderator@test.invalid', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('e2e-admin', 'E2E Admin', 'e2e-admin@test.invalid', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO user_profiles (user_id, public_id, handle, display_name, role) VALUES
  ('e2e-member', 'usr_eeeeeeee0001', 'e2e-member', 'E2E Member', 'member'),
  ('e2e-member-r1', 'usr_eeeeeeee0004', 'e2e-member-r1', 'E2E Member R1', 'member'),
  ('e2e-member-r2', 'usr_eeeeeeee0005', 'e2e-member-r2', 'E2E Member R2', 'member'),
  ('e2e-moderator', 'usr_eeeeeeee0002', 'e2e-moderator', 'E2E Moderator', 'moderator'),
  ('e2e-admin', 'usr_eeeeeeee0003', 'e2e-admin', 'E2E Admin', 'admin');
