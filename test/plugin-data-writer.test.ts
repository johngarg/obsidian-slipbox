import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { SerializedPluginDataWriter } from "../src/plugin-data-writer.js";

describe("serialized plugin-data writer", () => {
  test("serializes writes in request order", async () => {
    const saved: number[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const writer = new SerializedPluginDataWriter<number>({
      write: async (value) => {
        if (value === 1) {
          await firstGate;
        }
        saved.push(value);
      },
      reportError: assert.fail,
    });

    const first = writer.save(1);
    const second = writer.save(2);
    await Promise.resolve();
    assert.deepEqual(saved, []);
    releaseFirst();
    assert.equal(await first, "saved");
    assert.equal(await second, "saved");
    assert.deepEqual(saved, [1, 2]);
  });

  test("reports failure and allows the next write to succeed", async () => {
    const errors: unknown[] = [];
    let fail = true;
    const writer = new SerializedPluginDataWriter<number>({
      write: (value) => {
        if (fail) {
          fail = false;
          return Promise.reject(new Error(`failed ${value}`));
        }
        return Promise.resolve();
      },
      reportError: (error) => errors.push(error),
    });

    assert.equal(await writer.save(1), "failed");
    assert.equal(await writer.save(2), "saved");
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /failed 1/);
  });
});
