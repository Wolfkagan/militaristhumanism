# Moderation Report

The moderation system provides open/reviewing/resolved/dismissed report states, assignment, reasoned actions, target snapshots, member warnings and time-bounded restrictions, thread hide/restore/lock/unlock/pin/unpin/move actions, reply hide/restore actions, notifications, and append-only audit events.

Moderators cannot change roles, access owner analytics/audit, or moderate moderator/administrator accounts. Administrator accounts cannot be demoted through the ordinary role endpoint, and administrators cannot change their own role there. Duplicate open reports are prevented both in application logic and by a partial unique database index.

Attack verification covered protected roles, unauthorized moderation, duplicate reports, report transitions, snapshots, audit records, notification delivery, and read-only recovery.
