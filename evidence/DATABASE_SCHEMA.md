# Database Schema

Five ordered D1 migrations define the data layer.

- Better Auth: `user`, `session`, `account`, `verification`.
- Community: `user_profiles`, `categories`, `threads`, `posts`, `reactions`, `bookmarks`, `thread_follows`, `notifications`.
- Governance: `reports`, `moderation_actions`, `moderation_content_snapshots`, `user_restrictions`, `audit_events`, `community_settings`.
- Analytics: `product_event_rollups`.
- Search: FTS5 `community_search` with synchronized insert/update/delete triggers.

Foreign keys, uniqueness constraints, bounded queries, cursor pagination, covering indexes, and a partial unique index preventing concurrent duplicate open reports are present. Local migration verification passed with all five migrations, ten canonical categories, foreign-key enforcement, FTS synchronization, and reply pages capped at 50.
