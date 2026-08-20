# Analytics Report

Date: 2026-08-20

## Product analytics

Product events are aggregated by hour, event type, route outcome, coarse dimension, and role/anonymous class. The design excludes raw IP addresses, message bodies, tokens, cookie values, email addresses, and per-user behavioral profiles.

Administrator-only views provide community totals, registrations, active members, discussions, replies, pending reports, locks, moderation actions, API failures, rate-limit events, top discussions, and top categories over bounded 24-hour, 7-day, 30-day, and 90-day ranges.

Live production verification showed:

- a real `community_home_view` event
- all four bounded range controls
- nine SVG charts rendered on `/admin/analytics`
- Analytics Engine available for write-only event points
- D1 rollups available for bounded dashboard queries and retention cleanup

## Public traffic analytics

Public visitor measurement remains intentionally separate in Cloudflare Web Analytics. Automatic setup is enabled. Browser inspection found exactly one `static.cloudflareinsights.com` beacon with `data-cf-beacon` on `/` and exactly one on `/community`; no duplicate site-authored beacon exists.

At the final capture time, the Cloudflare dashboard still displayed `0` page views and `0` visits for the last 24 hours. The integration is therefore marked installed and injected, while aggregate traffic counts remain unconfirmed; this report does not fabricate a non-zero result.
