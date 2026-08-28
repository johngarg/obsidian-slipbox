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
  test("starts with an accessible No colour choice and the fixed palette", () => {
    const value = subject();
    assert.equal(value.form.colorInputs.length, CARD_COLORS.length + 1);
    assert.equal(value.form.colorInputs[0]?.checked, true);
    assert.equal(
      value.form.colorInputs[0]?.getAttribute("aria-label"),
      "No colour",
    );
    assert.deepEqual(
      value.form.colorInputs.slice(1).map((input) => input.value),
      CARD_COLORS,
    );
    assert.equal(value.form.selectedColor.textContent, "No colour");
  });

  test("submits a trimmed title and the selected colour", () => {
    const value = subject();
    value.form.titleInput.value = "  Chromodynamics  ";
    const blue = value.form.colorInputs.find((input) => input.value === "blue");
    assert.ok(blue);
    blue.checked = true;
    blue.dispatchEvent(new value.window.Event("change", {
      bubbles: true,
    }) as unknown as Event);
    assert.equal(value.form.selectedColor.textContent, "Blue");

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
