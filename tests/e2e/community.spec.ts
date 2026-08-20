import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const e2eToken = process.env.E2E_TEST_TOKEN ?? "local-browser-e2e-token-with-more-than-thirty-two-characters";

async function authenticate(page: Page, userId: "e2e-member" | "e2e-moderator" | "e2e-admin"): Promise<void> {
  await page.setExtraHTTPHeaders({ "x-e2e-test-token": e2eToken, "x-e2e-user-id": userId });
}

test("visitor experience is responsive, accessible, and free of browser errors", async ({ page }) => {
  const errors: string[] = [];
  const failedAssets: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith("http://127.0.0.1:8789") && response.status() >= 400) failedAssets.push(`${response.status()} ${response.url()}`);
  });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/community");
    await expect(page.getByRole("heading", { level: 1, name: "Community" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.goto("/community/rules");
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.matches(":focus-visible") ?? false)).toBe(true);
  expect(errors).toEqual([]);
  expect(failedAssets).toEqual([]);
});

test("member, moderator, and admin complete the community workflow", async ({ page }) => {
  const unique = Date.now().toString(36);
  const title = `E2E discussion ${unique} on accountable strength`;
  const initialReply = `Initial E2E reply ${unique} with a concrete argument.`;
  const editedReply = `Edited E2E reply ${unique} with a stronger concrete argument.`;
  const reportDetails = `E2E report ${unique} for deterministic moderation review.`;

  await authenticate(page, "e2e-member");
  await page.goto("/community/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").selectOption("cat_philosophy");
  await page.getByRole("textbox", { name: "Discussion", exact: true }).fill(`E2E body ${unique}. This is long enough to test a complete authenticated publication workflow.`);
  await page.getByRole("button", { name: "Publish discussion" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  await page.locator(".reply-composer textarea").fill(initialReply);
  await page.getByRole("button", { name: "Publish reply" }).click();
  await expect(page.getByText(initialReply)).toBeVisible();
  const post = page.locator(".post", { hasText: initialReply });
  await post.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Reply").fill(editedReply);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(editedReply)).toBeVisible();

  await page.getByRole("button", { name: /Insightful/u }).first().click();
  await page.getByRole("button", { name: "Bookmark" }).click();
  await expect(page.getByRole("button", { name: "Remove bookmark" })).toBeVisible();
  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByRole("button", { name: "Unfollow" })).toBeVisible();
  await page.getByRole("link", { name: "Report discussion" }).click();
  await page.getByLabel("Reason").selectOption("other");
  await page.getByLabel("Details").fill(reportDetails);
  await page.getByRole("button", { name: "Submit report" }).click();

  await authenticate(page, "e2e-moderator");
  await page.goto("/admin/moderation?status=open");
  const report = page.locator(".report-card", { hasText: reportDetails });
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/admin/reports/review") && response.status() === 200),
    report.getByRole("button", { name: "Begin review" }).click(),
  ]);
  await page.waitForURL(/\/admin\/moderation\?status=reviewing$/u);
  const reviewingReport = page.locator(".report-card", { hasText: reportDetails });
  await reviewingReport.getByLabel("Target-action reason").fill("E2E target action with a reviewable reason.");
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/admin/moderation") && response.status() === 200),
    reviewingReport.getByRole("button", { name: "Hide target" }).click(),
  ]);
  await page.waitForURL(/\/admin\/moderation(?:\?|$)/u);
  await page.goto("/admin/moderation?status=reviewing");
  const stillReviewing = page.locator(".report-card", { hasText: reportDetails });
  await stillReviewing.getByLabel("Resolution reason").fill("E2E report resolved after a complete review.");
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/admin/moderation") && response.status() === 200),
    stillReviewing.getByRole("button", { name: "Resolve" }).click(),
  ]);
  await page.waitForURL(/\/admin\/moderation(?:\?|$)/u);

  await authenticate(page, "e2e-member");
  await page.goto("/notifications");
  await expect(page.getByText("A moderator hid your discussion.")).toBeVisible();

  await authenticate(page, "e2e-admin");
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { level: 1, name: "Product analytics" })).toBeVisible();
  await expect(page.getByText("thread_created")).toBeVisible();
});
