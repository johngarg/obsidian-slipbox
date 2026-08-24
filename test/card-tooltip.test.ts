import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import { setCardTooltip } from "../src/card-tooltip.js";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

function documentWithObsidianDom(): Document {
  const window = new Window();
  return window.document as unknown as Document;
}

function addObsidianCreateSpan(element: HTMLElement): void {
  Object.defineProperty(element, "createSpan", {
    value: () => {
      const span = element.ownerDocument.createElementNS(HTML_NAMESPACE, "span");
      element.append(span);
      return span;
    },
  });
}

describe("card tooltip accessibility", () => {
  test("uses a hidden accessible label when visual tooltips are disabled", () => {
    const document = documentWithObsidianDom();
    const parent = document.createElementNS(HTML_NAMESPACE, "div");
    const button = document.createElementNS(HTML_NAMESPACE, "button");
    addObsidianCreateSpan(parent);
    button.setAttribute("aria-label", "Old");
    button.setAttribute("data-tooltip-position", "bottom");
    parent.append(button);
    document.body.append(parent);

    setCardTooltip(button, "Edit card", false);

    assert.equal(button.getAttribute("aria-label"), null);
    assert.equal(button.getAttribute("data-tooltip-position"), null);
    const labelId = button.getAttribute("aria-labelledby");
    assert.notEqual(labelId, null);
    assert.equal(document.getElementById(labelId ?? "")?.textContent, "Edit card");
  });

  test("updates the existing hidden label instead of accumulating labels", () => {
    const document = documentWithObsidianDom();
    const parent = document.createElementNS(HTML_NAMESPACE, "div");
    const textarea = document.createElementNS(HTML_NAMESPACE, "textarea");
    addObsidianCreateSpan(parent);
    parent.append(textarea);
    document.body.append(parent);

    setCardTooltip(textarea, "First label", false);
    const labelId = textarea.getAttribute("aria-labelledby");
    setCardTooltip(textarea, "Second label", false);

    assert.equal(textarea.getAttribute("aria-labelledby"), labelId);
    assert.equal(document.querySelectorAll(".slipbox-visually-hidden").length, 1);
    assert.equal(document.getElementById(labelId ?? "")?.textContent, "Second label");
  });
});
