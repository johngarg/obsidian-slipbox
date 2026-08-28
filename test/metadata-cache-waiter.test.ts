import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { MetadataCacheWaiter } from "../src/metadata-cache-waiter.js";

interface TestFile {
  readonly path: string;
}

describe("MetadataCacheWaiter", () => {
  test("resolves when the matching file reaches the expected value", async () => {
    const file = { path: "Card.md" };
    let value: unknown = "";
    let listener: ((changed: TestFile) => void) | null = null;
    let unsubscribed = false;
    const waiter = new MetadataCacheWaiter<TestFile>({
      current: () => value,
      subscribe: (callback) => {
        listener = callback;
        return () => { unsubscribed = true; };
      },
      schedule: () => 1,
      cancelScheduled: () => undefined,
    });

    const waiting = waiter.waitFor(file, "address", "A/1");
    value = "A/1";
    assert.ok(listener !== null);
    (listener as (changed: TestFile) => void)(file);
    assert.equal(await waiting, true);
    assert.equal(unsubscribed, true);
  });

  test("reports whether the value matched when the timeout fires", async () => {
    const file = { path: "Card.md" };
    let timeout: (() => void) | null = null;
    const waiter = new MetadataCacheWaiter<TestFile>({
      current: () => "",
      subscribe: () => () => undefined,
      schedule: (callback) => { timeout = callback; return 1; },
      cancelScheduled: () => undefined,
    });

    const waiting = waiter.waitFor(file, "address", "A/1");
    assert.ok(timeout !== null);
    (timeout as () => void)();
    assert.equal(await waiting, false);
  });
});
