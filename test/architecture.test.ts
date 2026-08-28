import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "node:test";

const sourceDirectory = resolve(process.cwd(), "src");

function source(name: string): string {
  return readFileSync(resolve(sourceDirectory, name), "utf8");
}

describe("module architecture", () => {
  test("views and settings do not depend on the plugin lifecycle class", () => {
    for (const name of ["deck-view.ts", "desk-view.ts", "settings-tab.ts"]) {
      assert.doesNotMatch(source(name), /from ["']\.\/main(?:\.js)?["']/);
    }
  });

  test("only CardIndexRuntime publishes a shared CardIndex snapshot", () => {
    const publishers = readdirSync(sourceDirectory)
      .filter((name) => name.endsWith(".ts"))
      .filter((name) => /\b(?:this\.)?index\.publish\(/.test(source(name)));
    assert.deepEqual(publishers, ["card-index-runtime.ts"]);
  });
});
