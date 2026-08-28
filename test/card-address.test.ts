import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  renderCardAddress,
  UNFILED_ADDRESS_LABEL,
} from "../src/card-address.js";
import { renderInlineFilingEditor } from "../src/filing-editor.js";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

function container(): HTMLElement {
  const window = new Window();
  return window.document.createElementNS(
    HTML_NAMESPACE,
    "div",
  ) as unknown as HTMLElement;
}

describe("card address rendering", () => {
  test("prints a filed address as text", () => {
    const parent = container();
    const element = renderCardAddress(parent, {
      cls: "slipbox-card-address",
      address: "A/1",
    });

    assert.equal(element.textContent, "A/1");
    assert.equal(element.className, "slipbox-card-address");
    assert.equal(parent.childNodes.length, 1);
  });

  test("renders an unfiled card as an empty slot", () => {
    const parent = container();
    const element = renderCardAddress(parent, {
      cls: "slipbox-desk-card-address",
      address: null,
    });

    assert.equal(element.textContent, "");
    assert.equal(
      element.className,
      "slipbox-desk-card-address is-unfiled-slot",
    );
  });

  test("keeps a card filed at the literal address unfiled distinct from an unfiled card", () => {
    const parent = container();
    const filed = renderCardAddress(parent, {
      cls: "slipbox-card-address",
      address: "unfiled",
    });
    const unfiled = renderCardAddress(parent, {
      cls: "slipbox-card-address",
      address: null,
    });

    assert.equal(filed.textContent, "unfiled");
    assert.equal(filed.classList.contains("is-unfiled-slot"), false);
    assert.equal(unfiled.textContent, "");
    assert.equal(unfiled.classList.contains("is-unfiled-slot"), true);
  });

  test("supplies an accessible name for cards without an address", () => {
    assert.equal(UNFILED_ADDRESS_LABEL, "Unfiled");
  });

  test("hands the empty slot over to the inline filing editor", () => {
    const parent = container();
    const slot = renderCardAddress(parent, {
      cls: "slipbox-desk-card-address",
      address: null,
    });

    const { input } = renderInlineFilingEditor(
      slot,
      parent,
      {
        phase: "editing",
        sourcePath: "source.md",
        sourceSurface: "desk",
        value: "",
        address: null,
        preview: null,
        message: "",
        invalid: false,
        duplicatePaths: [],
        guidance: "Enter a valid address.",
      },
      {
        showTooltips: false,
        onInput: () => undefined,
        onConfirm: () => undefined,
        onCancel: () => undefined,
        onPreview: () => undefined,
        onFocusChange: () => undefined,
      },
    );

    assert.equal(slot.classList.contains("is-editing"), true);
    assert.equal(slot.classList.contains("is-unfiled-slot"), true);
    assert.equal(input.parentElement, slot);
  });
});
