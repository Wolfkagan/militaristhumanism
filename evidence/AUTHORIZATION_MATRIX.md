# Authorization Matrix

| Capability | Visitor | Member | Moderator | Administrator |
|---|---:|---:|---:|---:|
| Read visible community | Yes | Yes | Yes | Yes |
| Create/reply/react/save/follow/report | No | Yes | Yes | Yes |
| Edit/delete own content | No | Yes | Yes | Yes |
| Edit/delete another member's content | No | No | Moderation workflow only | Moderation workflow only |
| Read private notifications/saved lists | No | Own only | Own only | Own only |
| Review reports | No | No | Yes | Yes |
| Warn/restrict ordinary members | No | No | Yes | Yes |
| Moderate moderator/admin account | No | No | No | Admin accounts remain protected |
| View owner analytics/audit | No | No | No | Yes |
| Change roles/categories/read-only mode | No | No | No | Yes |

The matrix is enforced server-side and covered by role-elevation, protected-role, IDOR, notification-isolation, and ownership attack tests.
