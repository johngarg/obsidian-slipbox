import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { describe, test } from "node:test";

import {
  deskClassNames,
  setDeskCardSizeData,
  setDeskCustomProperty,
  toggleDeskPresenceClass,
} from "../src/desk-dom.js";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

function element(): HTMLElement {
  return new Window().document.createElementNS(
    HTML_NAMESPACE,
    "div",
  ) as unknown as HTMLElement;
}

describe("Desk DOM compatibility", () => {
  test("emits canonical Desk classes with legacy Tray aliases", () => {
    assert.equal(
      deskClassNames(
        "slipbox-desk-card is-on-desk",
        "slipbox-card-desk-toggle is-expanded",
      ),
      "slipbox-desk-card slipbox-tray-card is-on-desk is-in-tray " +
        "slipbox-card-desk-toggle slipbox-card-tray-toggle is-expanded",
    );
  });

  test("keeps canonical and legacy presence classes synchronized", () => {
    const target = element();
    toggleDeskPresenceClass(target, true);
    assert.equal(target.classList.contains("is-on-desk"), true);
    assert.equal(target.classList.contains("is-in-tray"), true);
    toggleDeskPresenceClass(target, false);
    assert.equal(target.classList.contains("is-on-desk"), false);
    assert.equal(target.classList.contains("is-in-tray"), false);
  });

  test("bridges Desk data and custom properties to legacy Tray hooks", () => {
    const target = element();
    setDeskCardSizeData(target, "large");
    setDeskCustomProperty(target, "--slipbox-desk-card-tilt", "1.25deg");
    assert.equal(target.dataset.deskCardSize, "large");
    assert.equal(target.dataset.trayCardSize, "large");
    assert.equal(
      target.style.getPropertyValue("--slipbox-desk-card-tilt"),
      "var(--slipbox-tray-card-tilt)",
    );
    assert.equal(
      target.style.getPropertyValue("--slipbox-tray-card-tilt"),
      "1.25deg",
    );
  });
});
