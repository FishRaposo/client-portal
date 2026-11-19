import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "../helpers/axe";

// Wait for real content before axe: the async pages render LoadingState first.
for (const [name, path, waitFor] of [
  ["home", "", "Sign in"],
  ["signin", "signin/", "Ada Acme"],
  ["project detail", "projects/1/", "Storefront rebuild"],
  ["audit", "audit/", "Audit log"],
] as const) {
  test(`axe: ${name}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText(waitFor).first()).toBeVisible();
    await expectNoA11yViolations(page);
  });
}
