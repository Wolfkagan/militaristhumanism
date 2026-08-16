# Analytics Report

Product events are aggregated by hour, event type, route outcome, coarse dimension, and role/anonymous class. The design explicitly excludes raw IP addresses, message bodies, tokens, cookie values, email addresses, and per-user behavioral profiles.

Administrator-only views provide community totals, registrations, active members, discussions, replies, pending reports, locks, moderation actions, API failures, rate-limit events, top discussions, and top categories over bounded ranges. Public visitor metrics remain the responsibility of Cloudflare Web Analytics.

Analytics Engine receives write-only event points; D1 rollups provide bounded dashboard queries and retention cleanup.
