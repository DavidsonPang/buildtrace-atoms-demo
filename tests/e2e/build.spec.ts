import { expect, test } from "@playwright/test";

test("从报价想法生成可交互的沙箱预览", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /把想法变成/ })).toBeVisible();
  await page.getByRole("button", { name: "项目报价计算器" }).click();
  await page.getByRole("button", { name: /开始生成/ }).click();

  const preview = page.frameLocator('iframe[title="生成产品预览"]');
  await expect(preview.getByRole("heading", { name: /清楚报价/ })).toBeVisible();
  await expect(page.getByText("预览已就绪", { exact: true })).toBeVisible();

  const before = await preview.locator("#total").textContent();
  await preview.locator("#hours").fill("50");
  await expect(preview.locator("#total")).not.toHaveText(before ?? "");
  await expect(page.getByText("已就绪 · 交互已验证", { exact: true })).toBeVisible();
});
