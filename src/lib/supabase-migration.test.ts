import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609070001_buildtrace_projects.sql",
  ),
  "utf8",
).toLowerCase();
const iterationMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609070002_iteration_metadata.sql",
  ),
  "utf8",
).toLowerCase();

describe("Supabase migration security contract", () => {
  it.each(["projects", "project_versions"])(
    "%s 启用 RLS 并只向 authenticated 授予数据权限",
    (table) => {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migration).toContain(
        `revoke all on table public.${table} from anon, authenticated`,
      );
      expect(migration).toContain(
        `grant select, insert, update, delete on table public.${table} to authenticated`,
      );
    },
  );

  it("为两张表的四类操作声明 owner policy", () => {
    for (const operation of ["select", "insert", "update", "delete"]) {
      expect(migration.match(new RegExp(`for ${operation}`, "g"))).toHaveLength(
        2,
      );
    }
    expect(migration.match(/auth\.uid\(\)/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it("HTML 仍有数据库体积上限，为后续 Storage 迁移保留边界", () => {
    expect(migration).toContain(
      "check (octet_length(accepted_html) <= 150000)",
    );
  });

  it("用向后兼容迁移保存每个版本的自然语言修改要求", () => {
    expect(iterationMigration).toContain(
      "add column revision_instruction text not null default ''",
    );
    expect(iterationMigration).toContain(
      "check (char_length(revision_instruction) <= 800)",
    );
  });
});
