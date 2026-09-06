import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";

export function checkToolchain(): void {
  const packageVersion = (name: string): string => JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version;
  const profile = JSON.parse(readFileSync("fixtures/harness/profile.json", "utf8"));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(process.versions.node, profile.runtime.node, "Use the pinned .node-version");
  assert.equal(readFileSync(".node-version", "utf8").trim(), profile.runtime.node);
  assert.equal(execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(), profile.runtime.npm);
  for (const [name, version] of Object.entries(pkg.devDependencies)) {
    assert.equal(packageVersion(name), version, `Run npm ci: ${name}`);
  }
  assert.equal(packageVersion("workerd"), profile.runtime.workerd);
  const browsers = JSON.parse(readFileSync("node_modules/playwright-core/browsers.json", "utf8"));
  const chromium = browsers.browsers.find((browser: { name: string }) => browser.name === "chromium");
  assert.equal(chromium.revision, profile.runtime.chromiumRevision);
  assert.equal(chromium.browserVersion, profile.runtime.chromium);
  const wrangler = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
  assert.equal(wrangler.compatibility_date, profile.runtime.workersCompatibilityDate);
}

if (import.meta.main) checkToolchain();
