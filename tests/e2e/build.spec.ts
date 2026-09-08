import { expect, test } from "@playwright/test";

test("从报价想法生成可交互的沙箱预览", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();

  await expect(page.getByRole("heading", { name: "对话记录" })).toBeVisible();
  await expect(page.getByLabel("产品想法")).toBeVisible();
  await expect(page.locator(".composer textarea")).toHaveCount(1);
  await expect(page.getByText("本地模式 · 未连接云端")).toBeVisible();
  await page.getByRole("button", { name: "项目报价计算器" }).click();
  await page.getByRole("button", { name: /开始生成/ }).click();

  const preview = page.frameLocator('iframe[title="生成产品预览"]');
  await expect(
    preview.getByRole("heading", { name: /清楚报价/ }),
  ).toBeVisible();
  await expect(page.getByText("预览已就绪", { exact: true })).toBeVisible();

  const before = await preview.locator("#total").textContent();
  await preview.locator("#hours").fill("50");
  await expect(preview.locator("#total")).not.toHaveText(before ?? "");
  await expect(
    page.getByText("已就绪 · 交互已验证", { exact: true }),
  ).toBeVisible();
});

test("引导模式在 Product Brief 后暂停并从 Architecture 继续", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "引导模式", exact: true }).click();
  await page
    .getByLabel("目标用户（可选）")
    .fill("首次承接商业项目的独立设计师");
  await page.getByLabel("核心操作（可选）").fill("填写项目参数并复制透明报价");
  await page.getByRole("button", { name: /生成 Product Brief/ }).click();

  await expect(
    page.getByText("Product Brief 已生成，请检查或编辑后开始构建。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByText("Brief 等待确认")).toBeVisible();
  await page.getByRole("button", { name: "确认并开始构建" }).click();

  await expect(
    page.frameLocator('iframe[title="生成产品预览"]').getByRole("heading", {
      name: /清楚报价/,
    }),
  ).toBeVisible();
  await expect(page.getByText("预览已就绪", { exact: true })).toBeVisible();
});

test("编辑 Brief 后只重建下游，生成新版本并在刷新后恢复", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: /开始生成/ }).click();
  const preview = page.frameLocator('iframe[title="生成产品预览"]');
  await expect(
    preview.getByRole("heading", { name: /清楚报价/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "编辑结构化 Brief" }).click();
  await page
    .getByLabel("功能要求（每行一项）")
    .fill(
      [
        "R1：选择项目服务类型并设置预计工时与时薪。",
        "R2：选择标准或加急交付并计算价格系数。",
        "R3：勾选附加服务并显示分项费用。",
        "R4：生成总价和交付时间。",
        "R5：在结果中显示税费提示。",
      ].join("\n"),
    );
  await page.getByRole("button", { name: "保存修订" }).click();

  await expect(page.getByText("下游产物已标记为过期")).toBeVisible();
  await page.getByRole("button", { name: "重建受影响阶段" }).click();
  await expect(preview.locator("#brief-revision")).toContainText(
    "R5：在结果中显示税费提示。",
  );
  await expect(page.getByRole("button", { name: /v2/ })).toBeVisible();
  await expect(page.getByText("预览已就绪", { exact: true })).toBeVisible();

  await page.reload();
  await expect(
    page
      .frameLocator('iframe[title="生成产品预览"]')
      .locator("#brief-revision"),
  ).toContainText("R5：在结果中显示税费提示。");
  await expect(page.getByRole("button", { name: /v2/ })).toBeVisible();
});

test("预置成功项目不调用模型即可进入可交互预览", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page
    .getByRole("button", { name: "查看预置成功项目 · 零模型调用" })
    .click();

  await expect(page.getByText("预置成功项目 · 不调用模型")).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="生成产品预览"]').getByRole("heading", {
      name: /清楚报价/,
    }),
  ).toBeVisible();
  await expect(page.getByText("预览已就绪", { exact: true })).toBeVisible();
});

test("用自然语言生成新版本，并在虚拟文件树中切换源码", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page
    .getByRole("button", { name: "查看预置成功项目 · 零模型调用" })
    .click();
  await expect(page.getByText("预览已就绪", { exact: true })).toBeVisible();

  const instruction = "增加税费说明，并保留现有报价计算能力。";
  await page.getByLabel("后续修改要求").fill(instruction);
  await page.getByRole("button", { name: "发送修改" }).click();

  const preview = page.frameLocator('iframe[title="生成产品预览"]');
  await expect(preview.locator("#revision-request")).toContainText(instruction);
  await expect(page.getByRole("button", { name: /v2/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /v1/ })).toBeVisible();
  await expect(page.getByText(instruction, { exact: true })).toBeVisible();
  await expect(page.locator(".composer textarea")).toHaveCount(1);

  await page.getByRole("tab", { name: "代码" }).click();
  await expect(page.getByText("虚拟文件视图", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "index.html" })).toBeVisible();
  await page.getByRole("button", { name: "styles.css" }).click();
  await expect(page.locator(".source-content .code-view")).toContainText(
    "body",
  );
  await page.getByRole("button", { name: "app.js" }).click();
  await expect(page.locator(".source-content .code-view")).toContainText(
    "document",
  );
});

test("创建多个项目后可切换，并在刷新后恢复当前项目", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page
    .getByRole("button", { name: "查看预置成功项目 · 零模型调用" })
    .click();
  await expect(page.getByText("预览已就绪", { exact: true })).toBeVisible();

  await page.locator(".project-switcher").click();
  await page.getByRole("button", { name: /创建新项目/ }).click();
  await expect(
    page.getByRole("heading", { name: "等待第一个可运行版本" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "活动容量看板" }).click();
  await page.getByRole("button", { name: /开始生成/ }).click();
  await expect(
    page.frameLocator('iframe[title="生成产品预览"]').getByRole("heading", {
      name: /SeatFlow/,
    }),
  ).toBeVisible();
  await expect(page.getByText("预览已就绪", { exact: true })).toBeVisible();

  await page.locator(".project-switcher").click();
  await expect(
    page.locator(".project-list").getByText("SwiftQuote", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".project-list").getByText("SeatFlow", { exact: true }),
  ).toBeVisible();
  await page.locator(".project-list button", { hasText: "SwiftQuote" }).click();
  await expect(
    page.frameLocator('iframe[title="生成产品预览"]').getByRole("heading", {
      name: /清楚报价/,
    }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page.locator(".project-switcher")).toContainText("SwiftQuote");
  await expect(
    page.frameLocator('iframe[title="生成产品预览"]').getByRole("heading", {
      name: /清楚报价/,
    }),
  ).toBeVisible();
});
