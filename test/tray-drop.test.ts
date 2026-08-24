import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  cardDropTargetPile,
  deckCardPileDropFocusPath,
  deckCardDropTarget,
  pilePositionAtWorkspacePoint,
  resolveDeckCardDrop,
} from "../src/tray-drop.js";
import type { TrayState } from "../src/tray-state.js";

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

function div(window: Window, className = ""): HTMLElement {
  const element = window.document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  element.className = className;
  return element;
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

describe("Deck card drops", () => {
  const state: TrayState = {
    piles: [{
      id: "target",
      cards: [
        { cardRef: "Top.md", kind: "filed" },
        { cardRef: "Second.md", kind: "filed" },
      ],
      position: { x: 12, y: 34 },
    }],
    expandedPileIds: [],
    unfiledPileId: null,
  };

  test("resolves free workspace into a positioned collapsed singleton", () => {
    const result = resolveDeckCardDrop(state, "Dropped.md", {
      kind: "workspace",
      pileId: "new",
      position: { x: -42, y: 65 },
    });

    assert.deepEqual(result, {
      state: {
        ...state,
        piles: [...state.piles, {
          id: "new",
          cards: [{ cardRef: "Dropped.md", kind: "filed" }],
          position: { x: -42, y: 65 },
        }],
      },
      focusPath: "Dropped.md",
      pileId: "new",
    });
  });

  test("appends to piles without changing expansion and resolves visible focus", () => {
    const collapsed = resolveDeckCardDrop(state, "Collapsed.md", {
      kind: "pile",
      pileId: "target",
    });
    const expandedState = { ...state, expandedPileIds: ["target"] };
    const expanded = resolveDeckCardDrop(expandedState, "Expanded.md", {
      kind: "pile",
      pileId: "target",
    });

    assert.deepEqual(
      collapsed?.state.piles[0]?.cards.map((card) => card.cardRef),
      ["Top.md", "Second.md", "Collapsed.md"],
    );
    assert.deepEqual(collapsed?.state.expandedPileIds, []);
    assert.equal(collapsed?.focusPath, "Top.md");
    assert.deepEqual(
      expanded?.state.piles[0]?.cards.map((card) => card.cardRef),
      ["Top.md", "Second.md", "Expanded.md"],
    );
    assert.deepEqual(expanded?.state.expandedPileIds, ["target"]);
    assert.equal(expanded?.focusPath, "Expanded.md");
  });

  test("does not resolve duplicate cards or nonexistent piles", () => {
    assert.equal(resolveDeckCardDrop(state, "Top.md", {
      kind: "pile",
      pileId: "target",
    }), null);
    assert.equal(resolveDeckCardDrop(state, "Other.md", {
      kind: "pile",
      pileId: "missing",
    }), null);
  });

  test("accepts expanded and collapsed piles as targets", () => {
    const window = new Window();
    const expanded = pile(window, "expanded");
    const collapsed = pile(window, "collapsed");
    collapsed.pile.className = "slipbox-tray-pile is-collapsed";

    const expandedTarget = deckCardDropTarget([
      expanded.card,
      expanded.pile,
    ]);
    assert.equal(expandedTarget?.kind, "pile");
    assert.equal(
      expandedTarget?.kind === "pile" ? expandedTarget.pile : null,
      expanded.pile,
    );

    const collapsedTarget = deckCardDropTarget([
      collapsed.card,
      collapsed.pile,
    ]);
    assert.equal(collapsedTarget?.kind, "pile");
    assert.equal(
      collapsedTarget?.kind === "pile" ? collapsedTarget.pile : null,
      collapsed.pile,
    );
  });

  test("focuses an appended card only when its target pile is expanded", () => {
    const pile = {
      cards: [
        { cardRef: "Top.md", kind: "filed" as const },
        { cardRef: "Second.md", kind: "filed" as const },
      ],
    };

    assert.equal(
      deckCardPileDropFocusPath(pile, "Dropped.md", true),
      "Dropped.md",
    );
    assert.equal(
      deckCardPileDropFocusPath(pile, "Dropped.md", false),
      "Top.md",
    );
  });

  test("gives a pile precedence over an underlying Deck card", () => {
    const window = new Window();
    const target = pile(window, "target");
    const deck = div(window, "slipbox-card");
    const map = div(window, "slipbox-deck-map");
    const stage = div(window, "slipbox-deck-stage");

    const result = deckCardDropTarget([
      target.card,
      target.pile,
      deck,
      map,
      stage,
    ]);
    assert.equal(result?.kind, "pile");
    assert.equal(result?.kind === "pile" ? result.pile : null, target.pile);
  });

  test("accepts only unobstructed visible workspace", () => {
    const window = new Window();
    const stage = div(window, "slipbox-deck-stage");
    const deck = div(window, "slipbox-card");
    const map = div(window, "slipbox-deck-map");
    const outside = div(window);

    assert.deepEqual(deckCardDropTarget([stage]), { kind: "workspace" });
    assert.equal(deckCardDropTarget([deck, stage]), null);
    assert.equal(deckCardDropTarget([map, stage]), null);
    assert.equal(deckCardDropTarget([outside]), null);
  });

  test("rejects interactive controls even when they are inside a pile", () => {
    const window = new Window();
    const target = pile(window, "target");
    const button = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button",
    ) as unknown as HTMLButtonElement;
    target.pile.append(button);

    assert.equal(
      deckCardDropTarget([button, target.pile]),
      null,
    );
  });

  test("does not let an underlying control block a visible pile", () => {
    const window = new Window();
    const target = pile(window, "target");
    const button = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button",
    ) as unknown as HTMLButtonElement;

    const result = deckCardDropTarget([target.card, target.pile, button]);
    assert.equal(result?.kind, "pile");
    assert.equal(result?.kind === "pile" ? result.pile : null, target.pile);
  });
});
