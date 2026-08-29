import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import { CARD_COLORS } from "../src/card-color.js";
import { renderNewCardOptionsForm } from "../src/new-card-options-dom.js";
import type { NewCardInput } from "../src/new-note.js";

function subject() {
  const window = new Window();
  const root = window.document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  let created: NewCardInput | null = null;
  let cancelled = 0;
  const form = renderNewCardOptionsForm(root, {
    placeholder: "Leave blank to use a timestamp",
    create: (input) => { created = input; },
    cancel: () => { cancelled += 1; },
  });
  return {
    window,
    root,
    form,
    created: () => created,
    cancelled: () => cancelled,
  };
}

describe("new card options form", () => {
  test("starts with an accessible pressed button and the fixed palette", () => {
    const value = subject();
    assert.equal(value.form.colorButtons.length, CARD_COLORS.length + 1);
    assert.equal(
      value.form.colorButtons[0]?.getAttribute("aria-label"),
      "No colour",
    );
    assert.equal(
      value.form.colorButtons[0]?.getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(
      value.form.colorButtons.slice(1).map(
        (button) => button.dataset.slipboxCardColor,
      ),
      CARD_COLORS,
    );
    assert.equal(value.form.selectedColor.textContent, "No colour");
  });

  test("submits a trimmed title and the selected colour", () => {
    const value = subject();
    value.form.titleInput.value = "  Chromodynamics  ";
    const blue = value.form.colorButtons.find(
      (button) => button.dataset.slipboxCardColor === "blue",
    );
    assert.ok(blue);
    blue.click();
    assert.equal(value.form.selectedColor.textContent, "Blue");
    assert.equal(blue.getAttribute("aria-pressed"), "true");
    assert.equal(
      value.form.colorButtons[0]?.getAttribute("aria-pressed"),
      "false",
    );

    value.form.form.dispatchEvent(new value.window.Event("submit", {
      bubbles: true,
      cancelable: true,
    }) as unknown as Event);
    assert.deepEqual(value.created(), {
      title: "Chromodynamics",
      color: "blue",
    });
  });

  test("submits no colour by default and cancels independently", () => {
    const value = subject();
    value.form.form.dispatchEvent(new value.window.Event("submit", {
      bubbles: true,
      cancelable: true,
    }) as unknown as Event);
    assert.deepEqual(value.created(), { title: "", color: null });

    value.form.cancelButton.click();
    assert.equal(value.cancelled(), 1);
  });

  test("submits from an unmodified Enter in the title field", () => {
    const value = subject();
    value.form.titleInput.value = "Keyboard card";
    value.form.titleInput.dispatchEvent(new value.window.KeyboardEvent(
      "keydown",
      { key: "Enter", bubbles: true, cancelable: true },
    ) as unknown as KeyboardEvent);
    assert.deepEqual(value.created(), {
      title: "Keyboard card",
      color: null,
    });
  });
});
