import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("standard_site_single_pipeline_contract", async () => {
  for (const path of ["src/standard-site/converter.ts", "scripts/generate_standard_site.py", "tests/test_generate_standard_site.py"]) {
    await assert.rejects(access(new URL(`../${path}`, import.meta.url)), { code: "ENOENT" });
  }
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.dependencies["hast-util-from-html"], "2.0.3");
  assert.equal(pkg.dependencies["hast-util-to-text"], "4.0.2");
  assert.doesNotMatch(pkg.scripts.test, /python/i);
  assert.doesNotMatch(await read(".github/workflows/deploy.yml"), /setup-python/);
  assert.doesNotMatch(await read(".gitignore"), /generated\/standard-site/);
  const expectations = await read("tests/published-blog-content.ts");
  assert.match(expectations, /parseFrontmatter/);
  assert.doesNotMatch(expectations, /standard-site\/converter|records\.json/);
  assert.match(await read("src/pages/standard-site/records.json.ts"), /getCollection/);
});
