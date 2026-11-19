import { expect, test } from "@playwright/test";

test("project deep link boots directly in the demo", async ({ page }) => {
  await page.goto("projects/1/");
  await expect(page.getByText("Storefront rebuild")).toBeVisible();
  await expect(page.getByText("Invoices")).toBeVisible();
});
