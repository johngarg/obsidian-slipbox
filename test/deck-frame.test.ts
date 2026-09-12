import assert from "node:assert/strict";
import { test } from "node:test";
import { DeckFrameScheduler } from "../src/deck-frame.js";
import { DeckViewport } from "../src/deck-viewport.js";

function subject() {
  let sequence = 0;
  const pending = new Map<number, () => void>();
  const flushes: boolean[] = [];
  let animating = false;
  const scheduler = new DeckFrameScheduler({
    request(callback) { pending.set(++sequence, callback); return sequence; },
    cancel(handle) { pending.delete(handle); },
    flush(changed) { flushes.push(changed); return animating; },
  });
  return { scheduler, pending, flushes,
    animate: (value: boolean) => { animating = value; },
    frame() { const jobs = [...pending.values()]; pending.clear(); jobs.forEach((job) => job()); },
  };
}

test("wheel bursts and transitions share one frame without losing UI dirtiness", () => {
  const value = subject();
  value.scheduler.request();
  value.scheduler.request(true);
  value.scheduler.request();
  assert.equal(value.pending.size, 1);
  value.animate(true);
  value.frame();
  assert.deepEqual(value.flushes, [true]);
  assert.equal(value.pending.size, 1);
  value.scheduler.request();
  value.animate(false);
  value.frame();
  assert.deepEqual(value.flushes, [true, false]);
  assert.equal(value.pending.size, 0);
});

test("cancelled frames cannot update a closed or rebuilt view", () => {
  const value = subject();
  value.scheduler.request(true);
  const stale = [...value.pending.values()][0]!;
  value.scheduler.cancel();
  value.scheduler.request();
  stale();
  assert.deepEqual(value.flushes, []);
  assert.equal(value.pending.size, 1);
  value.frame();
  assert.deepEqual(value.flushes, [false]);
});

test("cancellation within a flush does not restart its animation", () => {
  let callback: (() => void) | undefined;
  let requests = 0;
  const scheduler = new DeckFrameScheduler({
    request: (next) => { callback = next; return ++requests; },
    cancel: () => {},
    flush: () => { scheduler.cancel(); return true; },
  });
  scheduler.request();
  callback!();
  assert.equal(requests, 1);
});

test("opposite wheel deltas keep ordered hysteresis even when only one frame paints", () => {
  const cards = Array.from({ length: 10 }, (_, index) => ({ path: `${index}.md` }));
  const viewport = new DeckViewport();
  viewport.navigate("4.md", cards);
  const value = subject();
  // The forward crossing selects 5; a small reversal must retain it.
  for (const delta of [0.6, -0.1]) {
    const changed = viewport.panTo(viewport.position(cards) + delta, cards);
    value.scheduler.request(changed);
  }
  assert.equal(viewport.anchorPath, "5.md");
  assert.equal(viewport.position(cards), 4.5);
  assert.equal(value.pending.size, 1);
  value.frame();
  assert.deepEqual(value.flushes, [true]);
  viewport.moveBy(1, cards);
  assert.equal(viewport.anchorPath, "6.md");
});
