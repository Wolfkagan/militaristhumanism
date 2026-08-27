PRAGMA foreign_keys = ON;

-- Existing provider tokens predate encrypted-at-rest storage. The community
-- does not call provider APIs after authentication, so clearing legacy token
-- material is safer than retaining plaintext. A later OAuth sign-in writes
-- fresh access/refresh tokens through Better Auth's AES-256-GCM protection;
-- ID tokens are deliberately not persisted by the application hook.
UPDATE "account"
SET "accessToken" = NULL,
    "refreshToken" = NULL,
    "idToken" = NULL,
    "accessTokenExpiresAt" = NULL,
    "refreshTokenExpiresAt" = NULL
WHERE "accessToken" IS NOT NULL
   OR "refreshToken" IS NOT NULL
   OR "idToken" IS NOT NULL;

-- Better Auth IP tracking is disabled in application configuration. Remove
-- legacy values without touching session identity, expiry, or user-agent data.
UPDATE "session"
SET "ipAddress" = NULL
WHERE "ipAddress" IS NOT NULL;
