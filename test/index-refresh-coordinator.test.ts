import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  IndexRefreshCoordinator,
  type IndexRefreshBatch,
} from "../src/index-refresh-coordinator.js";

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

function deferred(): Deferred {
  let resolvePromise!: () => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function fakeTimers() {
  let sequence = 0;
  const callbacks = new Map<number, () => void>();
  return {
    callbacks,
    schedule(callback: () => void): number {
      sequence += 1;
      callbacks.set(sequence, callback);
      return sequence;
    },
    cancel(handle: unknown): void {
      callbacks.delete(handle as number);
    },
    runOnly(): void {
      assert.equal(callbacks.size, 1);
      const [handle, callback] = callbacks.entries().next().value as [
        number,
        () => void,
      ];
      callbacks.delete(handle);
      callback();
    },
  };
}

describe("index refresh coordination", () => {
  test("debounces queued work and gives ordering precedence", () => {
    const timers = fakeTimers();
    const batches: IndexRefreshBatch[] = [];
    const coordinator = new IndexRefreshCoordinator({
      delayMs: 80,
      schedule: (callback) => timers.schedule(callback),
      cancelScheduled: (handle) => timers.cancel(handle),
      run: (batch) => {
        batches.push(batch);
        return Promise.resolve();
      },
      reportBackgroundError: assert.fail,
    });

    coordinator.queue({ reason: "index" });
    coordinator.queue({ reason: "ordering" });
    assert.equal(timers.callbacks.size, 1);
    timers.runOnly();
    assert.deepEqual(batches.map((batch) => batch.reason), ["ordering"]);
  });

  test("an immediate refresh cancels a queued timer", async () => {
    const timers = fakeTimers();
    let runs = 0;
    const coordinator = new IndexRefreshCoordinator({
      delayMs: 80,
      schedule: (callback) => timers.schedule(callback),
      cancelScheduled: (handle) => timers.cancel(handle),
      run: () => {
        runs += 1;
        return Promise.resolve();
      },
      reportBackgroundError: assert.fail,
    });

    coordinator.queue();
    await coordinator.refresh();
    assert.equal(timers.callbacks.size, 0);
    assert.equal(runs, 1);
  });

  test("serializes one follow-up batch requested during a refresh", async () => {
    const timers = fakeTimers();
    const gates = [deferred(), deferred()];
    const started = [deferred(), deferred()];
    const reasons: string[] = [];
    let active = 0;
    let maximumActive = 0;
    const coordinator = new IndexRefreshCoordinator({
      delayMs: 80,
      schedule: (callback) => timers.schedule(callback),
      cancelScheduled: (handle) => timers.cancel(handle),
      run: async (batch) => {
        const gate = gates[reasons.length];
        assert.ok(gate);
        reasons.push(batch.reason);
        started[reasons.length - 1]?.resolve();
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await gate.promise;
        active -= 1;
      },
      reportBackgroundError: assert.fail,
    });

    const first = coordinator.refresh({ reason: "index" });
    coordinator.queue({ reason: "index" });
    const second = coordinator.refresh({ reason: "ordering" });
    gates[0]?.resolve();
    await started[1]?.promise;
    assert.deepEqual(reasons, ["index", "ordering"]);
    gates[1]?.resolve();
    await Promise.all([first, second]);
    assert.equal(maximumActive, 1);
  });

  test("retains after-reconcile callbacks in request order", async () => {
    const timers = fakeTimers();
    const mutations: string[] = [];
    const coordinator = new IndexRefreshCoordinator({
      delayMs: 80,
      schedule: (callback) => timers.schedule(callback),
      cancelScheduled: (handle) => timers.cancel(handle),
      run: (batch) => {
        for (const mutate of batch.afterReconcile) {
          mutate();
        }
        return Promise.resolve();
      },
      reportBackgroundError: assert.fail,
    });

    coordinator.queue({ afterReconcile: () => mutations.push("first") });
    coordinator.queue({ afterReconcile: () => mutations.push("second") });
    await coordinator.refresh();
    assert.deepEqual(mutations, ["first", "second"]);
  });

  test("recovers after a failed refresh", async () => {
    const timers = fakeTimers();
    let fail = true;
    let runs = 0;
    const coordinator = new IndexRefreshCoordinator({
      delayMs: 80,
      schedule: (callback) => timers.schedule(callback),
      cancelScheduled: (handle) => timers.cancel(handle),
      run: () => {
        runs += 1;
        return fail
          ? Promise.reject(new Error("refresh failed"))
          : Promise.resolve();
      },
      reportBackgroundError: assert.fail,
    });

    await assert.rejects(coordinator.refresh(), /refresh failed/);
    fail = false;
    await coordinator.refresh();
    assert.equal(runs, 2);
  });

  test("disposal cancels queued work", async () => {
    const timers = fakeTimers();
    let runs = 0;
    const coordinator = new IndexRefreshCoordinator({
      delayMs: 80,
      schedule: (callback) => timers.schedule(callback),
      cancelScheduled: (handle) => timers.cancel(handle),
      run: () => {
        runs += 1;
        return Promise.resolve();
      },
      reportBackgroundError: assert.fail,
    });

    coordinator.queue();
    coordinator.dispose();
    await coordinator.refresh();
    assert.equal(timers.callbacks.size, 0);
    assert.equal(runs, 0);
  });
});
