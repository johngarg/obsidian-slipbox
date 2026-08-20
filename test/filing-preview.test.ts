import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  cardComparatorFor,
  createFilingPreview,
  defaultFilingFocusIndex,
  deckDisplayItems,
  filingPlacementMatches,
  filingPreviewKey,
  removeFilingGhost,
  renderOrUpdateFilingGhost,
} from "../src/index.js";

const filed = [
  { address: "A/2", path: "one.md" },
  { address: "A/10", path: "a.md" },
  { address: "A/10", path: "z.md" },
  { address: "A/20", path: "last.md" },
] as const;

describe("filing placement preview", () => {
  test("calculates beginning, middle, end, and empty Deck positions", () => {
    const beginning = createFilingPreview(
      filed,
      { address: "A/1", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(beginning.insertionIndex, 0);
    assert.equal(beginning.previousPath, null);
    assert.equal(beginning.nextPath, "one.md");

    const middle = createFilingPreview(
      filed,
      { address: "A/12", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(middle.insertionIndex, 3);
    assert.equal(middle.previousPath, "z.md");
    assert.equal(middle.nextPath, "last.md");

    const end = createFilingPreview(
      filed,
      { address: "Z", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(end.insertionIndex, filed.length);
    assert.equal(end.nextPath, null);

    const empty = createFilingPreview(
      [],
      { address: "Anything", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(empty.insertionIndex, 0);
    assert.equal(empty.previousPath, null);
    assert.equal(empty.nextPath, null);
  });

  test("places a duplicate exactly by source path", () => {
    const preview = createFilingPreview(
      filed,
      { address: "A/10", path: "m.md" },
      "Duplicate",
      "natural",
    );
    assert.equal(preview.insertionIndex, 2);
    assert.equal(preview.previousPath, "a.md");
    assert.equal(preview.nextPath, "z.md");
  });

  test("focuses the card before the ghost by default", () => {
    const middle = createFilingPreview(
      filed,
      { address: "A/12", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(defaultFilingFocusIndex(middle), 2);
    assert.equal(middle.insertionIndex, 3);

    const beginning = createFilingPreview(
      filed,
      { address: "A/1", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(defaultFilingFocusIndex(beginning), 0);
    assert.equal(beginning.insertionIndex, 0);

    const empty = createFilingPreview(
      [],
      { address: "A/1", path: "source.md" },
      "Source",
      "natural",
    );
    assert.equal(defaultFilingFocusIndex(empty), 0);
  });

  test("derives one transient display item and reserves its gap", () => {
    const preview = createFilingPreview(
      filed,
      { address: "A/10", path: "m.md" },
      "Duplicate",
      "natural",
    );
    const display = deckDisplayItems(filed, preview);
    assert.equal(display.length, filed.length + 1);
    assert.equal(display.filter((item) => item.kind === "preview").length, 1);
    assert.equal(display[2]?.kind, "preview");
    assert.equal(display[1]?.displayIndex, 1);
    assert.equal(display[3]?.displayIndex, 3);
    assert.equal(filingPreviewKey(preview.sourcePath), "filing-preview:m.md");
    assert.deepEqual(
      deckDisplayItems(filed, null).map((item) => item.kind),
      ["filed", "filed", "filed", "filed"],
    );
  });

  test("the eventual card sort index equals the preview index", () => {
    const candidate = { address: "A/10", path: "m.md" };
    const preview = createFilingPreview(
      filed,
      candidate,
      "Duplicate",
      "natural",
    );
    const final = [...filed, candidate].sort(cardComparatorFor("natural"));
    assert.equal(
      final.findIndex((card) => card.path === candidate.path),
      preview.insertionIndex,
    );
  });

  test("changes the placement signature after concurrent movement", () => {
    const preview = createFilingPreview(
      filed,
      { address: "A/12", path: "source.md" },
      "Source",
      "natural",
    );
    const changed = createFilingPreview(
      [
        ...filed.slice(0, 3),
        { address: "A/11", path: "new.md" },
        filed[3],
      ],
      { address: "A/12", path: "source.md" },
      "Source",
      "natural",
    );
    assert.notEqual(changed.placementSignature, preview.placementSignature);
    assert.equal(changed.previousPath, "new.md");
    assert.equal(
      filingPlacementMatches(
        filed,
        { address: "A/12", path: "source.md" },
        "natural",
        preview,
      ),
      true,
    );
    assert.equal(
      filingPlacementMatches(
        [
          ...filed.slice(0, 3),
          { address: "A/11", path: "new.md" },
          filed[3],
        ],
        { address: "A/12", path: "source.md" },
        "natural",
        preview,
      ),
      false,
    );
    assert.equal(
      filingPlacementMatches(
        filed,
        { address: "A/12", path: "source.md" },
        "lexicographic",
        preview,
      ),
      false,
    );
  });
});

describe("filing ghost DOM", () => {
  test("renders and updates one non-interactive keyed ghost", () => {
    const window = new Window();
    const elementPrototype = window.HTMLElement.prototype as unknown as {
      createDiv(options?: { cls?: string }): HTMLElement;
      createSpan(options?: { cls?: string }): HTMLElement;
    };
    elementPrototype.createDiv = function createDiv(
      this: HTMLElement,
      options = {},
    ): HTMLElement {
      const child = this.ownerDocument.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div",
      );
      child.className = options.cls ?? "";
      this.append(child);
      return child;
    };
    elementPrototype.createSpan = function createSpan(
      this: HTMLElement,
      options = {},
    ): HTMLElement {
      const child = this.ownerDocument.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "span",
      );
      child.className = options.cls ?? "";
      this.append(child);
      return child;
    };
    const parent = (window.document.body as unknown as HTMLElement).createDiv();
    const first = createFilingPreview(
      filed,
      { address: " A/12 ".trim(), path: "source.md" },
      "Current resolved title",
      "natural",
    );
    const ghost = renderOrUpdateFilingGhost(parent, first, null);
    assert.equal(parent.querySelectorAll(".slipbox-filing-ghost").length, 1);
    assert.equal(
      ghost.querySelector(".slipbox-filing-ghost-address")?.textContent,
      "A/12",
    );
    assert.equal(
      ghost.querySelector(".slipbox-filing-ghost-title")?.textContent,
      "Current resolved title",
    );
    assert.equal(ghost.dataset.path, undefined);
    assert.equal(ghost.querySelector("button, a, input, [tabindex]"), null);
    assert.equal(ghost.querySelector(".slipbox-card-actions"), null);
    assert.equal(ghost.querySelector(".slipbox-card-footer"), null);

    const moved = createFilingPreview(
      filed,
      { address: "A/1", path: "source.md" },
      "Current resolved title",
      "natural",
    );
    const sameGhost = renderOrUpdateFilingGhost(parent, moved, ghost);
    assert.equal(sameGhost, ghost);
    assert.equal(sameGhost.dataset.index, "0");
    assert.equal(parent.querySelectorAll(".slipbox-filing-ghost").length, 1);
    assert.equal(removeFilingGhost(sameGhost), null);
    assert.equal(parent.querySelectorAll(".slipbox-filing-ghost").length, 0);
  });
});
