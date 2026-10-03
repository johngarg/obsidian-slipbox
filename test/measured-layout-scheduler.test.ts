import assert from "node:assert/strict";
import { test } from "node:test";
import { MeasuredLayoutScheduler } from "../src/measured-layout-scheduler.js";

function clock() {
  let sequence = 0;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, () => void>();
  const window = {
    requestAnimationFrame(callback: () => void) {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelAnimationFrame(id: number) { frames.delete(id); },
    setTimeout(callback: () => void, delay: number) {
      assert.equal(delay, 120);
      timers.set(++sequence, callback);
      return sequence;
    },
    clearTimeout(id: number) { timers.delete(id); },
  } as unknown as Window;
  return { window, frames, timers, pending: () => frames.size + timers.size };
}

for (const first of ["frames", "timers"] as const) {
  test(first + " first: coalesce and invalidate the losing callback", () => {
    const c = clock();
    let layouts = 0;
    const scheduler = new MeasuredLayoutScheduler(() => layouts++);
    scheduler.schedule(c.window);
    scheduler.schedule(c.window);
    assert.equal(c.pending(), 2);
    const stale = [...c.frames.values(), ...c.timers.values()];
    c[first].values().next().value!();
    assert.equal(layouts, 1);
    assert.equal(c.pending(), 0);
    stale.forEach(callback => callback());
    assert.equal(layouts, 1);
    scheduler.schedule(c.window);
    assert.equal(c.pending(), 2);
    scheduler.cancel();
    assert.equal(c.pending(), 0);
  });
}

test("immediate flush, repeated cancellation and a changed window release all pending work", () => {
  const a = clock(), b = clock();
  let layouts = 0;
  const scheduler = new MeasuredLayoutScheduler(() => layouts++);
  scheduler.schedule(null);
  assert.equal(a.pending(), 0);
  scheduler.schedule(a.window);
  const stale = [...a.frames.values(), ...a.timers.values()];
  scheduler.schedule(b.window);
  assert.equal(a.pending(), 0);
  assert.equal(b.pending(), 2);
  stale.forEach(callback => callback());
  assert.equal(layouts, 0);
  scheduler.flushNow();
  assert.equal(b.pending(), 0);
  assert.equal(layouts, 1);
  scheduler.schedule(a.window);
  scheduler.cancel();
  scheduler.cancel();
  stale.forEach(callback => callback());
  assert.equal(layouts, 1);
  scheduler.flushNow();
  assert.equal(layouts, 2);
});

test("a request made during layout survives as a separate pass", () => {
  const c = clock();
  let layouts = 0;
  const scheduler = new MeasuredLayoutScheduler(() => { if (++layouts === 1) scheduler.schedule(c.window); });
  scheduler.schedule(c.window);
  c.frames.values().next().value!();
  assert.equal(layouts, 1);
  assert.equal(c.pending(), 2);
  c.timers.values().next().value!();
  assert.equal(layouts, 2);
  assert.equal(c.pending(), 0);
});
