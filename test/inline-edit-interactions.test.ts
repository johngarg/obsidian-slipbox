import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  consumeDeckEscape,
  dispatchInlineAwareDeckAction,
  isInlineEditBodyTarget,
  resolveDeckEscapeAction,
  shouldNavigateDeckFromWheel,
} from "../src/inline-edit-interactions.js";
import {
  advancePendingDeckCommand,
  IDLE_DECK_COMMAND,
  startAddressCommand,
  type PendingDeckCommand,
} from "../src/deck-commands.js";

describe("inline edit entry interactions", () => {
  test("contains repeated Escape presses inside the active Slipbox view", () => {
    const window = new Window();
    const deck = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    const textarea = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "textarea",
    );
    deck.append(textarea);
    window.document.body.append(deck);
    let editing = true;
    const actions: string[] = [];
    let parentNavigationCount = 0;
    deck.addEventListener("keydown", (event) => {
      const action = resolveDeckEscapeAction(
        event as unknown as KeyboardEvent,
        { editing, pendingCommand: false, filing: false },
      );
      if (action === null) {
        return;
      }
      consumeDeckEscape(event as unknown as KeyboardEvent);
      actions.push(action);
      if (action === "finish-editing") {
        editing = false;
      }
    }, { capture: true });
    window.document.addEventListener("keydown", () => {
      parentNavigationCount += 1;
    });

    const dispatchEscape = (target: typeof deck) => {
      const escape = new window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(escape);
      return escape;
    };
    const editorEscape = dispatchEscape(textarea);
    const postEditEscape = dispatchEscape(deck);

    assert.deepEqual(actions, ["finish-editing", "contain"]);
    assert.equal(editorEscape.defaultPrevented, true);
    assert.equal(postEditEscape.defaultPrevented, true);
    assert.equal(parentNavigationCount, 0);
  });

  test("resolves Slipbox-local Escape modes before the containment fallback", () => {
    const window = new Window();
    const escape = new window.KeyboardEvent("keydown", { key: "Escape" });
    const event = escape as unknown as KeyboardEvent;

    assert.equal(resolveDeckEscapeAction(event, {
      editing: true,
      pendingCommand: true,
      filing: true,
    }), "finish-editing");
    assert.equal(resolveDeckEscapeAction(event, {
      editing: false,
      pendingCommand: true,
      filing: true,
    }), "cancel-pending-command");
    assert.equal(resolveDeckEscapeAction(event, {
      editing: false,
      pendingCommand: false,
      filing: true,
    }), "cancel-filing");
    assert.equal(resolveDeckEscapeAction(event, {
      editing: false,
      pendingCommand: false,
      filing: false,
    }), "contain");
    const enter = new window.KeyboardEvent("keydown", { key: "Enter" });
    assert.equal(resolveDeckEscapeAction(
      enter as unknown as KeyboardEvent,
      { editing: false, pendingCommand: false, filing: false },
    ), null);
  });

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

  test("keeps textarea wheel gestures native while retaining Deck navigation", () => {
    const window = new Window();
    const stage = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    const textarea = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "textarea",
    );
    stage.append(textarea);
    window.document.body.append(stage);
    let navigations = 0;
    stage.addEventListener("wheel", (event) => {
      if (!shouldNavigateDeckFromWheel(
        event as unknown as WheelEvent,
        textarea as unknown as HTMLTextAreaElement,
      )) {
        return;
      }
      event.preventDefault();
      navigations += 1;
    });

    const editorWheel = new window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: -80,
      deltaY: 12,
    });
    textarea.dispatchEvent(editorWheel);
    assert.equal(navigations, 0);
    assert.equal(editorWheel.defaultPrevented, false);

    const deckWheel = new window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: -80,
      deltaY: 12,
    });
    stage.dispatchEvent(deckWheel);
    assert.equal(navigations, 1);
    assert.equal(deckWheel.defaultPrevented, true);

    const verticalDeckWheel = new window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 12,
      deltaY: -80,
    });
    stage.dispatchEvent(verticalDeckWheel);
    assert.equal(navigations, 1);
    assert.equal(verticalDeckWheel.defaultPrevented, false);
  });

});

describe("inline-aware Deck action dispatch", () => {
  test("starts the g prefix command synchronously before recording its event", () => {
    let pending: PendingDeckCommand = IDLE_DECK_COMMAND;
    const prefixEvent = { key: "g" };
    let pendingStartEvent: typeof prefixEvent | null = null;

    const accepted = dispatchInlineAwareDeckAction(
      { editing: false, starting: false },
      async () => true,
      () => {
        pendingStartEvent = null;
        pending = startAddressCommand();
      },
    );
    pendingStartEvent = prefixEvent;

    assert.equal(accepted, true);
    assert.deepEqual(pending, { kind: "address" });
    assert.equal(pendingStartEvent, prefixEvent);
    const continuation = advancePendingDeckCommand(pending, "f");
    assert.deepEqual(
      "completion" in continuation ? continuation.completion : null,
      { kind: "address", initial: "f" },
    );
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
