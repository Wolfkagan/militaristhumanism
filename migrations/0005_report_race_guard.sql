CREATE UNIQUE INDEX idx_reports_one_open_per_target
  ON reports (reporter_id, target_type, target_public_id)
  WHERE status IN ('open', 'reviewing');
