import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { CardDimensionsController, type CardDimensions } from "../src/card-dimensions.js";

function fixture() {
  const window = new Window();
  const document = window.document as unknown as Document;
  const observers: { fire: () => void; disconnected: boolean }[] = [];
  Object.assign(window, { ResizeObserver: class {
    readonly entry;
    constructor(callback: () => void) {
      this.entry = { fire: callback, disconnected: false };
      observers.push(this.entry);
    }
    observe() {}
    disconnect() { this.entry.disconnected = true; }
  } });
  function stage() {
    const element = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    Object.assign(element, { createDiv: () => element.appendChild(document.createElementNS("http://www.w3.org/1999/xhtml", "div")) });
    document.body.append(element);
    return element;
  }
  let measured: CardDimensions | null = { width: 480.25, height: 288.15 };
  const calls = { reads: 0, layouts: 0, changes: 0 };
  const controller = new CardDimensionsController({ width: 840, height: 560 }, {
    requestLayout: () => { calls.layouts++; },
    changed: () => { calls.changes++; },
    measure: () => { calls.reads++; return measured; },
  });
  return { controller, calls, observers, stage, document,
    measure: (value: CardDimensions | null) => { measured = value; },
    close: () => { controller.dispose(); void window.happyDOM.abort(); } };
}

test("initial dimensions resolve before rendering and preserve fractional border-box lengths", () => {
  const f = fixture();
  const stage = f.stage();
  f.controller.mount(stage);
  assert.deepEqual(f.controller.snapshot, { width: 480.25, height: 288.15 });
  assert.ok(Object.isFrozen(f.controller.snapshot));
  assert.equal(stage.querySelectorAll(".slipbox-deck-size-probe").length, 1);
  assert.equal(stage.querySelectorAll(".slipbox-card").length, 0);
  assert.equal(stage.firstElementChild?.getAttribute("aria-hidden"), "true");
  f.close();
});

test("style and resize invalidations coalesce; unchanged snapshots do not trigger changes", () => {
  const f = fixture(); f.controller.mount(f.stage());
  f.measure({ width: 600.5, height: 360.3 });
  f.controller.invalidate(); f.controller.invalidate(); f.observers[0]?.fire();
  assert.equal(f.calls.layouts, 1);
  assert.equal(f.calls.reads, 1);
  f.controller.flush();
  assert.deepEqual(f.controller.snapshot, { width: 600.5, height: 360.3 });
  assert.equal(f.calls.changes, 2);
  f.controller.invalidate(); f.controller.flush();
  assert.equal(f.calls.changes, 2);
  f.close();
});

test("width-only and aspect-only changes each invalidate cached geometry", () => {
  const f = fixture(); f.controller.mount(f.stage());
  for (const value of [{ width: 600, height: 288.15 }, { width: 600, height: 900 }]) {
    f.measure(value); f.observers[0]?.fire(); f.controller.flush();
    assert.deepEqual(f.controller.snapshot, value);
  }
  assert.equal(f.calls.changes, 3);
  f.close();
});

test("steady motion reads and flushes use the cache without any DOM measurement", () => {
  const f = fixture(); f.controller.mount(f.stage());
  const snapshot = f.controller.snapshot;
  for (let i = 0; i < 10000; i++) {
    f.controller.flush();
    assert.equal(f.controller.snapshot, snapshot);
  }
  assert.equal(f.calls.reads, 1);
  assert.equal(f.calls.layouts, 0);
  f.close();
});

test("hidden views and invalid sizes retain a valid fallback and recover on resize", () => {
  const f = fixture(); f.measure(null); f.controller.mount(f.stage());
  assert.deepEqual(f.controller.snapshot, { width: 840, height: 560 });
  for (const value of [null, { width: 0, height: 20 }, { width: 20, height: -1 },
    { width: Infinity, height: 20 }, { width: 20, height: NaN }]) {
    f.measure(value); f.controller.invalidate(); f.controller.flush();
    assert.deepEqual(f.controller.snapshot, { width: 840, height: 560 });
  }
  f.measure({ width: 320, height: 480 }); f.observers[0]?.fire(); f.controller.flush();
  assert.deepEqual(f.controller.snapshot, { width: 320, height: 480 });
  f.measure(null); f.controller.invalidate(); f.controller.flush();
  assert.deepEqual(f.controller.snapshot, { width: 320, height: 480 });
  f.close();
});

test("stage replacement and disposal reject stale observer callbacks and detached probes", () => {
  const f = fixture(); const oldStage = f.stage(); f.controller.mount(oldStage);
  const stale = f.observers[0];
  f.controller.invalidate();
  const stage = f.stage(); f.controller.mount(stage);
  assert.equal(oldStage.childElementCount, 0);
  assert.equal(stale?.disconnected, true);
  const layouts = f.calls.layouts;
  stale?.fire(); assert.equal(f.calls.layouts, layouts);
  stage.remove(); f.controller.invalidate(); f.controller.flush();
  assert.equal(f.calls.reads, 2);
  f.controller.dispose(); f.observers[1]?.fire(); f.controller.flush();
  assert.equal(stage.childElementCount, 0);
  assert.equal(f.calls.reads, 2);
  f.close();
});
