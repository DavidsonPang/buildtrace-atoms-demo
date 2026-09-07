import { describe, expect, it } from "vitest";

import { splitSelfContainedHtml } from "@/src/lib/source-files";

describe("virtual source files", () => {
  it("把自包含 HTML 投影为三个可切换文件", () => {
    const files = splitSelfContainedHtml(
      '<!doctype html><html><head><style>body{color:red}</style></head><body><button>保存</button><script>document.querySelector("button")</script></body></html>',
    );

    expect(files.map((file) => file.name)).toEqual([
      "index.html",
      "styles.css",
      "app.js",
    ]);
    expect(files[0].content).toContain('href="./styles.css"');
    expect(files[0].content).toContain('src="./app.js"');
    expect(files[0].content).not.toContain("body{color:red}");
    expect(files[1].content).toBe("body{color:red}");
    expect(files[2].content).toContain('document.querySelector("button")');
  });

  it("合并多个同类型源码块并标记来源顺序", () => {
    const files = splitSelfContainedHtml(
      "<html><head><style>.a{}</style><style>.b{}</style></head><body><script>one()</script><script>two()</script></body></html>",
    );

    expect(files[1].content).toContain("source block 2");
    expect(files[1].content).toContain(".b{}");
    expect(files[2].content).toContain("one()");
    expect(files[2].content).toContain("two()");
  });
});
