import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  beginPointerActionAfterGate,
  beginThresholdPointerDrag,
} from "../src/pointer-drag.js";

function pointerEvent(
  window: Window,
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
) {
  return new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    clientX,
    clientY,
  });
}

describe("threshold pointer drag", () => {
  test("preserves a stationary pointer sequence for click and double-click", () => {
    const window = new Window();
    const target = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    window.document.body.append(target);
    const captures: number[] = [];
    Object.defineProperties(target, {
      setPointerCapture: {
        value: (pointerId: number) => captures.push(pointerId),
      },
      hasPointerCapture: {
        value: (pointerId: number) => captures.includes(pointerId),
      },
      releasePointerCapture: {
        value: (pointerId: number) => captures.splice(captures.indexOf(pointerId), 1),
      },
    });
    let starts = 0;
    let drops = 0;
    beginThresholdPointerDrag({
      captureTarget: target as unknown as HTMLElement,
      pointerId: 7,
      startX: 10,
      startY: 20,
      threshold: 5,
      onDragStart: () => starts += 1,
      onDragMove: () => undefined,
      onDrop: () => drops += 1,
      onCancel: () => undefined,
    });

    const smallMove = pointerEvent(window, "pointermove", 7, 13, 23);
    target.dispatchEvent(smallMove);
    const up = pointerEvent(window, "pointerup", 7, 13, 23);
    target.dispatchEvent(up);

    assert.deepEqual(captures, []);
    assert.equal(starts, 0);
    assert.equal(drops, 0);
    assert.equal(smallMove.defaultPrevented, false);
    assert.equal(up.defaultPrevented, false);
  });

  test("captures and consumes the pointer only after drag intent", () => {
    const window = new Window();
    const target = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    window.document.body.append(target);
    const captured = new Set<number>();
    Object.defineProperties(target, {
      setPointerCapture: {
        value: (pointerId: number) => captured.add(pointerId),
      },
      hasPointerCapture: {
        value: (pointerId: number) => captured.has(pointerId),
      },
      releasePointerCapture: {
        value: (pointerId: number) => captured.delete(pointerId),
      },
    });
    const moves: Array<readonly [number, number]> = [];
    let starts = 0;
    let drops = 0;
    beginThresholdPointerDrag({
      captureTarget: target as unknown as HTMLElement,
      pointerId: 9,
      startX: 10,
      startY: 20,
      threshold: 5,
      onDragStart: () => starts += 1,
      onDragMove: (_event, deltaX, deltaY) => moves.push([deltaX, deltaY]),
      onDrop: () => drops += 1,
      onCancel: () => undefined,
    });

    const move = pointerEvent(window, "pointermove", 9, 16, 28);
    target.dispatchEvent(move);
    assert.equal(captured.has(9), true);
    assert.equal(move.defaultPrevented, true);
    assert.equal(starts, 1);
    assert.deepEqual(moves, [[6, 8]]);

    const up = pointerEvent(window, "pointerup", 9, 16, 28);
    target.dispatchEvent(up);
    assert.equal(captured.has(9), false);
    assert.equal(up.defaultPrevented, true);
    assert.equal(drops, 1);
  });

  test("cancels an active drag and releases pointer capture", () => {
    const window = new Window();
    const target = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    window.document.body.append(target);
    const captured = new Set<number>();
    Object.defineProperties(target, {
      setPointerCapture: {
        value: (pointerId: number) => captured.add(pointerId),
      },
      hasPointerCapture: {
        value: (pointerId: number) => captured.has(pointerId),
      },
      releasePointerCapture: {
        value: (pointerId: number) => captured.delete(pointerId),
      },
    });
    let cancellations = 0;
    let drops = 0;
    beginThresholdPointerDrag({
      captureTarget: target as unknown as HTMLElement,
      pointerId: 11,
      startX: 0,
      startY: 0,
      threshold: 5,
      onDragStart: () => undefined,
      onDragMove: () => undefined,
      onDrop: () => drops += 1,
      onCancel: () => cancellations += 1,
    });

    target.dispatchEvent(pointerEvent(window, "pointermove", 11, 8, 0));
    target.dispatchEvent(pointerEvent(window, "pointercancel", 11, 8, 0));

    assert.equal(captured.has(11), false);
    assert.equal(cancellations, 1);
    assert.equal(drops, 0);
  });
});

describe("pointer action gate", () => {
  test("starts an action when the pointer remains active through the gate", async () => {
    const window = new Window();
    const target = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    window.document.body.append(target);
    let releaseGate: (() => void) | null = null;
    let starts = 0;
    target.addEventListener("pointerdown", (event) => {
      beginPointerActionAfterGate(
        event as unknown as PointerEvent,
        (action) => new Promise((resolve) => {
          releaseGate = () => {
            action();
            resolve(true);
          };
        }),
        () => starts += 1,
      );
    });

    target.dispatchEvent(pointerEvent(window, "pointerdown", 13, 0, 0));
    const release = releaseGate as (() => void) | null;
    if (release === null) {
      assert.fail("expected the pointer gate to be pending");
    }
    release();
    await Promise.resolve();

    assert.equal(starts, 1);
  });

  test("does not start after the pointer is released during the gate", async () => {
    const window = new Window();
    const target = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    window.document.body.append(target);
    let releaseGate: (() => void) | null = null;
    let starts = 0;
    target.addEventListener("pointerdown", (event) => {
      beginPointerActionAfterGate(
        event as unknown as PointerEvent,
        (action) => new Promise((resolve) => {
          releaseGate = () => {
            action();
            resolve(true);
          };
        }),
        () => starts += 1,
      );
    });

    target.dispatchEvent(pointerEvent(window, "pointerdown", 15, 0, 0));
    target.dispatchEvent(pointerEvent(window, "pointerup", 15, 0, 0));
    const release = releaseGate as (() => void) | null;
    if (release === null) {
      assert.fail("expected the pointer gate to be pending");
    }
    release();
    await Promise.resolve();

    assert.equal(starts, 0);
  });
});
