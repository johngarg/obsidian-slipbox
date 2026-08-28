import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { CardIndexRuntime } from "../src/card-index-runtime.js";
import type { CardIndex, VaultCardIndex } from "../src/card-index.js";

const SNAPSHOT = { filed: [] } as unknown as VaultCardIndex;

function subject() {
  const events: string[] = [];
  const scheduled = new Map<number, () => void>();
  let sequence = 0;
  const index = {
    buildSnapshot: () => {
      events.push("build");
      return SNAPSHOT;
    },
    publish: (snapshot: VaultCardIndex) => {
      assert.equal(snapshot, SNAPSHOT);
      events.push("publish-index");
    },
    configure: () => undefined,
  } as unknown as CardIndex;
  const runtime = new CardIndexRuntime(index, {
    reconcile: (snapshot) => {
      assert.equal(snapshot, SNAPSHOT);
      events.push("reconcile");
    },
    publish: () => {
      events.push("publish-views");
      return Promise.resolve();
    },
    schedule: (callback) => {
      sequence += 1;
      scheduled.set(sequence, callback);
      return sequence;
    },
    cancelScheduled: (handle) => scheduled.delete(handle as number),
    reportBackgroundError: assert.fail,
  });
  return { runtime, events, scheduled };
}

describe("CardIndexRuntime", () => {
  test("publishes, reconciles, runs callbacks, then refreshes views", async () => {
    const { runtime, events } = subject();
    await runtime.refresh({
      afterReconcile: (snapshot) => {
        assert.equal(snapshot, SNAPSHOT);
        events.push("callback");
      },
    });
    assert.deepEqual(events, [
      "build",
      "publish-index",
      "reconcile",
      "callback",
      "publish-views",
    ]);
  });

  test("suppresses queued refreshes across nesting and restores after errors", async () => {
    const { runtime, events, scheduled } = subject();
    await assert.rejects(runtime.suppressQueuedRefresh(async () => {
      runtime.queue();
      await runtime.suppressQueuedRefresh(async () => {
        runtime.queue();
      });
      throw new Error("write failed");
    }), /write failed/);
    assert.equal(scheduled.size, 0);
    runtime.queue();
    assert.equal(scheduled.size, 1);
    const callback = [...scheduled.values()][0];
    assert.ok(callback);
    callback();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(events, ["build", "publish-index", "reconcile", "publish-views"]);
  });
});
