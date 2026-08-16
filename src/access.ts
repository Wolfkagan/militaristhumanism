import type { Context } from "hono";
import { AppError } from "./http";
import type { AppBindings, AppSession, Role } from "./model";

const roleWeight: Record<Role, number> = {
  member: 1,
  moderator: 2,
  admin: 3,
};

export function requireSession(c: Context<AppBindings>): AppSession {
  const session = c.get("session");
  if (session === null) {
    throw new AppError(401, "AUTH_REQUIRED", "Sign in to continue.");
  }
  return session;
}

export function requireRole(c: Context<AppBindings>, minimum: "moderator" | "admin"): AppSession {
  const session = requireSession(c);
  if (roleWeight[session.profile.role] < roleWeight[minimum]) {
    throw new AppError(403, "INSUFFICIENT_ROLE", "You do not have permission to perform this action.");
  }
  return session;
}

export function canModerate(role: Role): boolean {
  return role === "moderator" || role === "admin";
}

export function requireOwnerOrModerator(session: AppSession, ownerId: string): void {
  if (session.user.id !== ownerId && !canModerate(session.profile.role)) {
    throw new AppError(403, "NOT_CONTENT_OWNER", "You may only change your own content.");
  }
}
