import assert from "node:assert/strict";
import { mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";

interface ReleaseFixtureOptions {
  readonly packageVersion?: string;
  readonly manifestVersion?: string;
  readonly mappedMinAppVersion?: string;
}

const validator = resolve(process.cwd(), "scripts/validate-release.mjs");

function writeJson(root: string, filename: string, value: unknown): void {
  writeFileSync(resolve(root, filename), `${JSON.stringify(value, null, 2)}\n`);
}

function releaseFixture(options: ReleaseFixtureOptions = {}): string {
  const root = mkdtempSync(resolve(tmpdir(), "slipbox-release-validation-"));
  const packageVersion = options.packageVersion ?? "0.11.0";
  const manifestVersion = options.manifestVersion ?? packageVersion;
  const minAppVersion = "1.13.0";
  const packageJson = {
    name: "slipbox",
    version: packageVersion,
    private: true,
    license: "0BSD",
    engines: { node: ">=20" },
    allowScripts: { "esbuild@0.25.12": true },
  };
  writeJson(root, "package.json", packageJson);
  writeJson(root, "package-lock.json", {
    name: "slipbox",
    version: packageVersion,
    lockfileVersion: 3,
    packages: {
      "": {
        name: "slipbox",
        version: packageVersion,
        license: "0BSD",
        engines: { node: ">=20" },
      },
      "node_modules/esbuild": {
        version: "0.25.12",
      },
    },
  });
  writeJson(root, "manifest.json", {
    id: "slipbox",
    name: "Slipbox Desk",
    version: manifestVersion,
    minAppVersion,
    description: "Browse ordinary Markdown notes as a card index.",
    author: "John Gargalionis",
    isDesktopOnly: true,
  });
  writeJson(root, "versions.json", {
    [packageVersion]: options.mappedMinAppVersion ?? minAppVersion,
  });
  writeFileSync(resolve(root, "main.js"), "module.exports = {};\n");
  writeFileSync(resolve(root, "styles.css"), ".slipbox { display: block; }\n");
  return root;
}

function validate(root: string, tag = "0.11.0") {
  return spawnSync(process.execPath, [validator, "--root", root, "--tag", tag], {
    encoding: "utf8",
  });
}

describe("release validation", () => {
  test("accepts synchronized metadata, assets, and tag", () => {
    const result = validate(releaseFixture());
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /valid for 0\.11\.0/);
  });

  test("rejects package and manifest version drift", () => {
    const result = validate(releaseFixture({ manifestVersion: "0.10.0" }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /package\.json and manifest\.json versions must match/);
  });

  test("rejects an incorrect versions.json mapping", () => {
    const result = validate(releaseFixture({ mappedMinAppVersion: "1.7.2" }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /versions\.json must map the current version/);
  });

  test("rejects a tag that differs from the package version", () => {
    const result = validate(releaseFixture(), "v0.11.0");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /release tag v0\.11\.0 must equal version 0\.11\.0/);
  });

  test("rejects a missing release asset", () => {
    const root = releaseFixture();
    unlinkSync(resolve(root, "styles.css"));
    const result = validate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /styles\.css must be a non-empty release asset/);
  });
});
