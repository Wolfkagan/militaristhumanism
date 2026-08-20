import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/markdown";
import { createCsrfToken, verifyCsrfToken } from "../src/security";
import { safeReturnPath } from "../src/http";
import { reactionSchema, threadCreateSchema } from "../src/validation";
import { validateTurnstile } from "../src/turnstile";
import { testEnv } from "./helpers";
import { configuredProviders, readNonProductionTestSession } from "../src/auth";
import { seedUser } from "./helpers";

describe("security boundaries", () => {
  it("sanitizes the allowed Markdown subset and rejects raw HTML", () => {
    const rendered = renderMarkdown('<script>alert("x")</script> **safe** [link](https://example.org) ![image](x)');
    expect(rendered).not.toContain("<script>");
    expect(rendered).not.toContain("<img");
    expect(rendered).toContain("&lt;script&gt;");
    expect(rendered).toContain('rel="nofollow ugc noreferrer noopener"');
  });

  it("binds CSRF tokens to one session and an expiry", async () => {
    const secret = crypto.randomUUID().repeat(2);
    const token = await createCsrfToken("session-a", secret, 1_000_000);
    expect(await verifyCsrfToken(token, "session-a", secret, 1_000_500)).toBe(true);
    expect(await verifyCsrfToken(token, "session-b", secret, 1_000_500)).toBe(false);
    expect(await verifyCsrfToken(token, "session-a", secret, 9_000_000)).toBe(false);
  });

  it("rejects open redirects and invalid bounded input", () => {
    expect(safeReturnPath("//evil.invalid/path", "/community")).toBe("/community");
    expect(safeReturnPath("https://evil.invalid", "/community")).toBe("/community");
    expect(safeReturnPath("/community/t/example", "/community")).toBe("/community/t/example");
    expect(reactionSchema.safeParse({ targetType: "thread", targetPublicId: "th_aaaaaaaaaaaa", reactionType: "karma" }).success).toBe(false);
    expect(threadCreateSchema.safeParse({ title: "short", body: "x", categoryId: "bad" }).success).toBe(false);
    expect(threadCreateSchema.safeParse({ title: "A valid discussion title", body: "x".repeat(20_001), categoryId: "cat_ethics" }).success).toBe(false);
  });

  it("fails closed when Turnstile is required but not configured", async () => {
    const env = { ...testEnv, TURNSTILE_MODE: "required", TURNSTILE_SECRET: "" } as Env;
    const request = new Request("https://militaristhumanism.com/api/community/reports", { method: "POST" });
    await expect(validateTurnstile(request, env, "token", "report_create")).rejects.toMatchObject({ code: "TURNSTILE_UNAVAILABLE" });
  });

  it("enables only complete Google and Apple OAuth configurations", () => {
    const env = {
      ...testEnv,
      APPLE_CLIENT_ID: crypto.randomUUID(),
      APPLE_TEAM_ID: crypto.randomUUID(),
      APPLE_KEY_ID: crypto.randomUUID(),
      APPLE_PRIVATE_KEY: testEnv.AUTH_SECRET,
    } as Env;
    expect(configuredProviders(env)).toEqual(["google", "apple"]);
    expect(configuredProviders({ ...env, APPLE_PRIVATE_KEY: "" } as Env)).toEqual(["google"]);
  });

  it("keeps the deterministic test identity gate disabled in production", async () => {
    await seedUser("test-member");
    const request = new Request("https://militaristhumanism.com/community", {
      headers: {
        "x-e2e-test-token": testEnv.E2E_TEST_TOKEN,
        "x-e2e-user-id": "test-member",
      },
    });
    const productionEnv = { ...testEnv, APP_ENV: "production" } as Env;
    expect(await readNonProductionTestSession(request, productionEnv)).toBeNull();
  });
});
