import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  cardDropTargetPile,
  pilePositionAtWorkspacePoint,
} from "../src/tray-drop.js";

function pile(
  window: Window,
  id: string,
): { pile: HTMLElement; card: HTMLElement } {
  const pile = window.document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  pile.className = "slipbox-tray-pile is-expanded";
  pile.dataset.pileId = id;
  const card = window.document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  card.className = "slipbox-tray-card";
  pile.append(card);
  return { pile, card };
}

describe("Desk card drops", () => {
  test("treats source-pile whitespace as empty while retaining card reorder targets", () => {
    const window = new Window();
    const source = pile(window, "source");

    assert.equal(cardDropTargetPile([source.pile], "source"), null);
    assert.equal(
      cardDropTargetPile([source.card, source.pile], "source"),
      source.pile,
    );
  });

  test("retains the complete drop region of another pile", () => {
    const window = new Window();
    const target = pile(window, "target");

    assert.equal(cardDropTargetPile([target.pile], "source"), target.pile);
  });

  test("accepts visible workspace outside a translated Desk layer", () => {
    const coordinateBounds = {
      left: 100,
      right: 1100,
      top: 50,
      bottom: 850,
      width: 1000,
      height: 800,
    };
    const workspaceBounds = {
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    };
    const geometry = {
      baseYRatio: 0.31,
      baseYOffsetPx: 126,
      cardHalfHeightPx: 58,
    };

    assert.deepEqual(
      pilePositionAtWorkspacePoint(
        50,
        400,
        coordinateBounds,
        workspaceBounds,
        geometry,
      ),
      { x: -550, y: 170 },
    );
    assert.equal(
      pilePositionAtWorkspacePoint(
        -1,
        400,
        coordinateBounds,
        workspaceBounds,
        geometry,
      ),
      null,
    );
  });
});
