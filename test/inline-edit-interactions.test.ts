import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  dispatchInlineAwareDeckAction,
  isDeckInlineEditEnter,
  isInlineEditBodyTarget,
} from "../src/inline-edit-interactions.js";
import {
  advancePendingDeckCommand,
  IDLE_DECK_COMMAND,
  startAddressCommand,
  type PendingDeckCommand,
} from "../src/deck-commands.js";

describe("inline edit entry interactions", () => {
  test("accepts rendered body text and excludes interactive descendants", () => {
    const window = new Window();
    const create = (tag: string) => window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      tag,
    );
    const body = create("div");
    const paragraph = body.appendChild(create("p"));
    const link = body.appendChild(create("a"));
    const button = body.appendChild(create("button"));
    const input = body.appendChild(create("input"));
    const editable = body.appendChild(create("span"));
    (editable as unknown as HTMLElement).contentEditable = "true";
    const outside = create("p");

    const htmlBody = body as unknown as HTMLElement;
    assert.equal(isInlineEditBodyTarget(paragraph as unknown as EventTarget, htmlBody), true);
    assert.equal(isInlineEditBodyTarget(body as unknown as EventTarget, htmlBody), true);
    assert.equal(isInlineEditBodyTarget(link as unknown as EventTarget, htmlBody), false);
    assert.equal(isInlineEditBodyTarget(button as unknown as EventTarget, htmlBody), false);
    assert.equal(isInlineEditBodyTarget(input as unknown as EventTarget, htmlBody), false);
    assert.equal(isInlineEditBodyTarget(editable as unknown as EventTarget, htmlBody), false);
    assert.equal(isInlineEditBodyTarget(outside as unknown as EventTarget, htmlBody), false);
  });

  test("enters only from an unmodified Enter owned by an idle Deck", () => {
    const window = new Window();
    const deck = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    const child = deck.appendChild(window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button",
    ));
    const ready = {
      hasActiveCard: true,
      editing: false,
      starting: false,
      filing: false,
      pendingCommand: false,
    };
    const enter = new window.KeyboardEvent("keydown", { key: "Enter" });
    Object.defineProperty(enter, "target", { value: deck });
    assert.equal(isDeckInlineEditEnter(
      enter as unknown as KeyboardEvent,
      deck as unknown as HTMLElement,
      ready,
    ), true);

    const childEnter = new window.KeyboardEvent("keydown", { key: "Enter" });
    Object.defineProperty(childEnter, "target", { value: child });
    assert.equal(isDeckInlineEditEnter(
      childEnter as unknown as KeyboardEvent,
      deck as unknown as HTMLElement,
      ready,
    ), false);
    assert.equal(isDeckInlineEditEnter(
      enter as unknown as KeyboardEvent,
      deck as unknown as HTMLElement,
      { ...ready, pendingCommand: true },
    ), false);
    assert.equal(isDeckInlineEditEnter(
      enter as unknown as KeyboardEvent,
      deck as unknown as HTMLElement,
      { ...ready, editing: true },
    ), false);
    const shifted = new window.KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
    });
    Object.defineProperty(shifted, "target", { value: deck });
    assert.equal(isDeckInlineEditEnter(
      shifted as unknown as KeyboardEvent,
      deck as unknown as HTMLElement,
      ready,
    ), false);
  });
});

describe("inline-aware Deck action dispatch", () => {
  test("starts g and f prefix commands synchronously before recording their events", () => {
    for (const fixture of [
      { prefix: "g", mode: "absolute" as const, initial: "f" },
      { prefix: "f", mode: "forward" as const, initial: "g" },
    ]) {
      let pending: PendingDeckCommand = IDLE_DECK_COMMAND;
      const prefixEvent = { key: fixture.prefix };
      let pendingStartEvent: typeof prefixEvent | null = null;

      const accepted = dispatchInlineAwareDeckAction(
        { editing: false, starting: false },
        async () => true,
        () => {
          pendingStartEvent = null;
          pending = startAddressCommand(fixture.mode);
        },
      );
      pendingStartEvent = prefixEvent;

      assert.equal(accepted, true);
      assert.deepEqual(pending, { kind: "address", mode: fixture.mode });
      assert.equal(pendingStartEvent, prefixEvent);
      const continuation = advancePendingDeckCommand(pending, fixture.initial);
      assert.deepEqual(
        "completion" in continuation ? continuation.completion : null,
        { kind: "address", mode: fixture.mode, initial: fixture.initial },
      );
    }
  });

  test("gates only a mounted editor and blocks actions during startup", async () => {
    const events: string[] = [];
    let release: (() => void) | undefined;
    const saving = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runAfterEditing = async (action: () => void): Promise<boolean> => {
      events.push("save");
      await saving;
      action();
      return true;
    };

    assert.equal(dispatchInlineAwareDeckAction(
      { editing: true, starting: false },
      runAfterEditing,
      () => events.push("action"),
    ), true);
    assert.deepEqual(events, ["save"]);
    release?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ["save", "action"]);

    assert.equal(dispatchInlineAwareDeckAction(
      { editing: false, starting: true },
      runAfterEditing,
      () => events.push("starting-action"),
    ), false);
    assert.deepEqual(events, ["save", "action"]);
  });
});
