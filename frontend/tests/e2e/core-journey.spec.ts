import { expect, test } from "@playwright/test";

// Runs against the static demo export (mock adapter). The local run exercises
// the same screens against real Postgres policies.
test("demo journey: persona -> projects -> denied deep link -> audit", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    const url = new URL(r.url());
    expect(url.host).toBe("127.0.0.1:3111");
  });

  await page.goto("signin/");
  await expect(page.getByRole("button", { name: /Ada Acme/ })).toBeVisible();
  await page.getByRole("button", { name: /Ada Acme/ }).click();

  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByText("Storefront rebuild")).toBeVisible();
  await expect(page.getByText("Sample data")).toBeVisible();

  // Cross-tenant denial is a first-class state, visibly explained.
  await page.goto("projects/3/");
  await expect(page.getByText("Access denied")).toBeVisible();

  // Audit page renders the deny row (owner persona).
  await page.goto("audit/");
  await expect(page.getByText("Audit log")).toBeVisible();
  await expect(page.getByText("deny").first()).toBeVisible();

  expect(errors).toEqual([]);
});
