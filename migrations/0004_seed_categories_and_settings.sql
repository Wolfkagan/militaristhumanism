INSERT INTO categories (id, slug, name, description, sort_order) VALUES
  ('cat_general', 'general-discussion', 'General Discussion', 'Open conversation grounded in seriousness, evidence, and mutual dignity.', 10),
  ('cat_philosophy', 'philosophy', 'Philosophy', 'First principles, competing traditions, definitions, and conceptual analysis.', 20),
  ('cat_ethics', 'ethics', 'Ethics', 'Duties, limits, difficult choices, accountability, and moral reasoning.', 30),
  ('cat_society', 'society-and-institutions', 'Society & Institutions', 'Law, governance, public capacity, and institutions worthy of trust.', 40),
  ('cat_discipline', 'discipline-and-responsibility', 'Discipline & Responsibility', 'Self-command, preparedness, service, leadership, and duty.', 50),
  ('cat_strength', 'strength-and-restraint', 'Strength & Restraint', 'Legitimate power, proportionality, protection, and the limits of force.', 60),
  ('cat_science', 'science-and-education', 'Science & Education', 'Knowledge, technology, learning, resilience, and human development.', 70),
  ('cat_questions', 'questions', 'Questions', 'Good-faith questions from readers and new participants.', 80),
  ('cat_critiques', 'critiques', 'Critiques', 'Rigorous criticism of the doctrine, its assumptions, and its applications.', 90),
  ('cat_announcements', 'announcements', 'Announcements', 'Official community notices and release information.', 100);

INSERT INTO community_settings (setting_key, setting_value) VALUES
  ('community_read_only', 'false'),
  ('notifications_retention_days', '180'),
  ('operational_events_retention_days', '90'),
  ('allow_new_threads', 'true'),
  ('allow_new_replies', 'true');
