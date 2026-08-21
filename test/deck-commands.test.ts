import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  advancePendingDeckCommand,
  findAddressInitialIndex,
  firstUnicodeCharacter,
  installPendingDeckCommandKeyCapture,
  startAddressCommand,
  startPileCommand,
} from "../src/deck-commands.js";

const cards = [
  { address: "A/1", path: "first-a.md" },
  { address: "β/1", path: "beta.md" },
  { address: "A/2", path: "second-a.md" },
  { address: "a/1", path: "lower-a.md" },
  { address: "😀/1", path: "emoji-one.md" },
  { address: "😀/1", path: "emoji-two.md" },
] as const;

describe("address-initial Deck navigation", () => {
  test("searches forward strictly after the active card without wrapping", () => {
    assert.equal(findAddressInitialIndex(cards, 0, "A", "forward"), 2);
    assert.equal(findAddressInitialIndex(cards, 2, "A", "forward"), null);
    assert.equal(findAddressInitialIndex(cards, cards.length - 1, "A", "forward"), null);
  });

  test("searches backward strictly before the active card without wrapping", () => {
    assert.equal(findAddressInitialIndex(cards, 4, "A", "backward"), 2);
    assert.equal(findAddressInitialIndex(cards, 2, "A", "backward"), 0);
    assert.equal(findAddressInitialIndex(cards, 0, "A", "backward"), null);
  });

  test("searches absolutely from the beginning and remains case-sensitive", () => {
    assert.equal(findAddressInitialIndex(cards, 4, "A", "absolute"), 0);
    assert.equal(findAddressInitialIndex(cards, 0, "a", "absolute"), 3);
    assert.equal(findAddressInitialIndex(cards, 0, "B", "absolute"), null);
  });

  test("matches the first Unicode character and keeps duplicate paths distinct", () => {
    assert.equal(firstUnicodeCharacter("😀/1"), "😀");
    assert.equal(findAddressInitialIndex(cards, 3, "😀", "forward"), 4);
    assert.equal(findAddressInitialIndex(cards, 4, "😀", "forward"), 5);
    assert.equal(cards[4]?.path, "emoji-one.md");
    assert.equal(cards[5]?.path, "emoji-two.md");
  });

  test("uses the supplied Deck order rather than path or title order", () => {
    const reordered = [cards[5], cards[1], cards[4], cards[0]];
    assert.equal(findAddressInitialIndex(reordered, -1, "😀", "absolute"), 0);
    assert.equal(reordered[0]?.path, "emoji-two.md");
    assert.equal(findAddressInitialIndex(reordered, 0, "😀", "forward"), 2);
  });
});

describe("pending Deck command state", () => {
  test("does not consume the key event that started the pending command", () => {
    const window = new Window();
    const outside = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button",
    );
    window.document.body.append(outside);
    const documentValue = window.document as unknown as Document;
    let pending = false;
    let startingEvent: KeyboardEvent | null = null;
    const captured: string[] = [];

    // Obsidian's pre-existing scope listener runs before the Deck listener.
    documentValue.addEventListener("keydown", (event) => {
      if (event.key === "f") {
        pending = true;
        startingEvent = event;
      }
    }, { capture: true });
    installPendingDeckCommandKeyCapture(documentValue, {
      isPending: () => pending,
      isActive: () => true,
      shouldIgnore: (event) => event === startingEvent,
      handle: (event) => captured.push(event.key),
    });

    outside.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "f",
      bubbles: true,
    }));
    assert.deepEqual(captured, []);
    outside.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "a",
      bubbles: true,
    }));
    assert.deepEqual(captured, ["a"]);
  });

  test("captures continuation and Escape outside the Deck DOM", () => {
    const window = new Window();
    const deck = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    const outside = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button",
    );
    window.document.body.append(deck, outside);
    let pending = true;
    let active = true;
    const captured: string[] = [];
    const remove = installPendingDeckCommandKeyCapture(
      window.document as unknown as Document,
      {
        isPending: () => pending,
        isActive: () => active,
        handle: (event) => {
          captured.push(event.key);
          event.preventDefault();
        },
      },
    );

    const character = new window.KeyboardEvent("keydown", {
      key: "a",
      bubbles: true,
      cancelable: true,
    });
    outside.dispatchEvent(character);
    assert.deepEqual(captured, ["a"]);
    assert.equal(character.defaultPrevented, true);

    const escape = new window.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    outside.dispatchEvent(escape);
    assert.deepEqual(captured, ["a", "Escape"]);

    active = false;
    outside.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "g",
      bubbles: true,
    }));
    pending = false;
    active = true;
    outside.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "f",
      bubbles: true,
    }));
    remove();
    outside.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "j",
      bubbles: true,
    }));
    assert.deepEqual(captured, ["a", "Escape"]);
  });

  test("consumes a bound continuation before it can become an ordinary shortcut", () => {
    const step = advancePendingDeckCommand(startAddressCommand("forward"), "j");
    assert.equal(step.consumed, true);
    assert.deepEqual("completion" in step ? step.completion : null, {
      kind: "address",
      mode: "forward",
      initial: "j",
    });
    assert.deepEqual(step.state, { kind: "idle" });
  });

  test("preserves case and accepts a Unicode continuation character", () => {
    const upper = advancePendingDeckCommand(startAddressCommand("backward"), "J");
    assert.equal(
      "completion" in upper && upper.completion.kind === "address"
        ? upper.completion.initial
        : null,
      "J",
    );
    const emoji = advancePendingDeckCommand(startAddressCommand("absolute"), "😀");
    assert.equal(
      "completion" in emoji && emoji.completion.kind === "address"
        ? emoji.completion.initial
        : null,
      "😀",
    );
  });

  test("cancels with Escape and ignores modifier-only events", () => {
    const pending = startAddressCommand("absolute");
    const modifier = advancePendingDeckCommand(pending, "Shift");
    assert.equal(modifier.consumed, false);
    assert.deepEqual(modifier.state, pending);
    const escape = advancePendingDeckCommand(pending, "Escape");
    assert.equal(escape.consumed, true);
    assert.equal("cancelled" in escape && escape.cancelled, true);
    assert.deepEqual(escape.state, { kind: "idle" });
  });

  test("accumulates multi-digit piles, edits with Backspace, and confirms with Enter", () => {
    let state = startPileCommand();
    state = advancePendingDeckCommand(state, "1").state;
    state = advancePendingDeckCommand(state, "2").state;
    assert.deepEqual(state, { kind: "pile", digits: "12" });
    state = advancePendingDeckCommand(state, "Backspace").state;
    assert.deepEqual(state, { kind: "pile", digits: "1" });
    const enter = advancePendingDeckCommand(state, "Enter");
    assert.deepEqual("completion" in enter ? enter.completion : null, {
      kind: "pile",
      digits: "1",
    });
  });

  test("consumes unrelated non-modifier keys while waiting for a pile number", () => {
    const pending = startPileCommand();
    const step = advancePendingDeckCommand(pending, "j");
    assert.equal(step.consumed, true);
    assert.deepEqual(step.state, pending);
  });
});
