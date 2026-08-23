import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { modalChoice } from "../src/modal-choice.js";

/** A manual task queue standing in for window.setTimeout. */
function scheduler(): {
  schedule: (task: () => void) => void;
  run: () => void;
  pending: () => number;
} {
  const tasks: (() => void)[] = [];
  return {
    schedule: (task) => void tasks.push(task),
    run: () => {
      while (tasks.length > 0) {
        tasks.shift()?.();
      }
    },
    pending: () => tasks.length,
  };
}

function recorder(): {
  resolve: (value: string | null) => void;
  calls: (string | null)[];
} {
  const calls: (string | null)[] = [];
  return { resolve: (value) => void calls.push(value), calls };
}

describe("modalChoice", () => {
  test("resolves a choice made before the modal closes", () => {
    const clock = scheduler();
    const seen = recorder();
    const choice = modalChoice(seen.resolve, clock.schedule);

    choice.choose("1a");
    choice.cancel();
    clock.run();

    assert.deepEqual(seen.calls, ["1a"]);
  });

  test("resolves a choice made after the modal closes", () => {
    const clock = scheduler();
    const seen = recorder();
    const choice = modalChoice(seen.resolve, clock.schedule);

    // Obsidian may run onClose before onChooseSuggestion; the choice must win.
    choice.cancel();
    choice.choose("1a");
    clock.run();

    assert.deepEqual(seen.calls, ["1a"]);
  });

  test("resolves null when the modal closes without a choice", () => {
    const clock = scheduler();
    const seen = recorder();
    const choice = modalChoice(seen.resolve, clock.schedule);

    choice.cancel();
    clock.run();

    assert.deepEqual(seen.calls, [null]);
  });

  test("never resolves synchronously", () => {
    const clock = scheduler();
    const seen = recorder();
    const choice = modalChoice(seen.resolve, clock.schedule);

    choice.choose("1a");
    assert.deepEqual(seen.calls, []);
    assert.equal(clock.pending() > 0, true);

    clock.run();
    assert.deepEqual(seen.calls, ["1a"]);
  });

  test("resolves exactly once however many callbacks arrive", () => {
    const clock = scheduler();
    const seen = recorder();
    const choice = modalChoice(seen.resolve, clock.schedule);

    choice.choose("1a");
    choice.choose("1b");
    choice.cancel();
    choice.cancel();
    clock.run();

    assert.deepEqual(seen.calls, ["1a"]);
  });

  test("does not resolve at all until the queue runs", () => {
    const clock = scheduler();
    const seen = recorder();
    const choice = modalChoice(seen.resolve, clock.schedule);

    choice.cancel();
    assert.deepEqual(seen.calls, []);
  });
});
