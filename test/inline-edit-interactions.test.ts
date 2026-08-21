import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  isDeckInlineEditEnter,
  isInlineEditBodyTarget,
} from "../src/inline-edit-interactions.js";

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
