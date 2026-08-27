import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  InferredNavigationManager,
  type InferredNavigationRelations,
  type InferredNavigationTarget,
} from "../src/index.js";

const target = (
  address: string,
  childCount = 0,
): InferredNavigationTarget => ({
  path: `${address}.md`,
  address,
  childCount,
});

const RELATIONS: InferredNavigationRelations = {
  parent: target("8", 2),
  previousSiblings: [target("8a"), target("7z")],
  nextSiblings: [target("8c", 1), target("8d")],
  children: [target("8b1"), target("8b2")],
};

function fixture(
  relations: InferredNavigationRelations = RELATIONS,
  interactive = true,
  showTooltips = true,
) {
  const window = new Window();
  const document = window.document as unknown as Document;
  const card = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "article",
  );
  document.body.append(card);
  const address = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "span",
  );
  address.className = "canonical-address";
  address.textContent = target("8b").address;
  card.append(address);
  let show = true;
  let previewEnabled = false;
  let currentRelations = relations;
  const previews: string[] = [];
  const activations: string[] = [];
  const manager = new InferredNavigationManager({
    showNavigation: () => show,
    showTooltips: () => showTooltips,
    previewLinksOnHover: () => previewEnabled,
    relationsForPath: () => currentRelations,
    preview: (_event, _row, destination) => previews.push(destination.path),
    activate: (destination) => { activations.push(destination.path); },
    runAfterEditing: (_reason, action) => void action(),
    openDelayMs: 0,
    closeDelayMs: 0,
  });
  const navigation = manager.render(card, { path: "8b.md", interactive });
  return {
    window,
    document,
    card,
    address,
    navigation,
    manager,
    previews,
    activations,
    setShow: (value: boolean) => { show = value; },
    setPreview: (value: boolean) => { previewEnabled = value; },
    setRelations: (value: InferredNavigationRelations) => {
      currentRelations = value;
    },
  };
}

function arrow(
  subject: ReturnType<typeof fixture>,
  side: "left" | "right",
): HTMLButtonElement | null {
  return subject.navigation.querySelector<HTMLButtonElement>(`.is-${side}`);
}

describe("inferred branch navigation", () => {
  test("renders eligible arrows without replacing card content", () => {
    const subject = fixture();
    assert.equal(subject.card.firstElementChild, subject.address);
    assert.equal(subject.address.textContent, "8b");
    assert.equal(arrow(subject, "left")?.disabled, false);
    assert.equal(arrow(subject, "right")?.disabled, false);
    assert.equal(
      arrow(subject, "left")?.getAttribute("aria-label"),
      "Show inferred parent and preceding siblings",
    );
    assert.equal(arrow(subject, "left")?.getAttribute("title"), null);
    assert.equal(
      arrow(subject, "left")?.getAttribute("data-tooltip-position"),
      "bottom",
    );

    subject.manager.setInteractive(subject.card, false);
    assert.equal(subject.navigation.hidden, true);
    assert.equal(subject.navigation.childElementCount, 0);
    assert.equal(subject.card.firstElementChild, subject.address);
    subject.manager.setInteractive(subject.card, true);
    assert.equal(subject.navigation.hidden, false);
    assert.equal(subject.address.textContent, "8b");
  });

  test("hides visual tooltips while retaining accessible navigation labels", () => {
    const subject = fixture(RELATIONS, true, false);
    const left = arrow(subject, "left");
    assert.equal(subject.navigation.getAttribute("aria-label"), null);
    assert.equal(subject.navigation.getAttribute("data-tooltip-position"), null);
    assert.equal(left?.getAttribute("aria-label"), null);
    assert.equal(left?.getAttribute("title"), null);
    assert.equal(left?.getAttribute("data-tooltip-position"), null);
    const leftLabel = left?.getAttribute("aria-labelledby") ?? "";
    assert.equal(
      subject.document.getElementById(leftLabel)?.textContent,
      "Show inferred parent and preceding siblings",
    );

    left?.click();
    const row = subject.document.querySelector<HTMLButtonElement>(
      ".slipbox-inferred-navigation-item",
    );
    assert.equal(row?.getAttribute("aria-label"), null);
    assert.equal(row?.getAttribute("data-tooltip-position"), null);
    const rowLabel = row?.getAttribute("aria-labelledby") ?? "";
    assert.equal(
      subject.document.getElementById(rowLabel)?.textContent,
      "Inferred parent 8, 2 children",
    );
  });

  test("moves controls between interactive Desk card owners", () => {
    const subject = fixture();
    const secondCard = subject.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "article",
    );
    subject.document.body.append(secondCard);
    const secondNavigation = subject.manager.render(secondCard, {
      path: "8c.md",
      interactive: false,
    });

    assert.equal(subject.navigation.hidden, false);
    assert.equal(secondNavigation.hidden, true);
    assert.equal(secondNavigation.childElementCount, 0);

    subject.manager.setInteractive(subject.card, false);
    subject.manager.setInteractive(secondCard, true);

    assert.equal(subject.navigation.hidden, true);
    assert.equal(subject.navigation.childElementCount, 0);
    assert.equal(secondNavigation.hidden, false);
    assert.notEqual(secondNavigation.querySelector(".is-left"), null);
    assert.notEqual(secondNavigation.querySelector(".is-right"), null);
  });

  test("orders left and right relation groups with accessible address-only rows", () => {
    const subject = fixture();
    arrow(subject, "left")?.click();
    let menu = subject.document.querySelector<HTMLElement>(
      ".slipbox-inferred-navigation-menu",
    );
    assert.notEqual(menu, null);
    assert.deepEqual(
      Array.from(menu?.querySelectorAll(".slipbox-inferred-navigation-address") ?? [])
        .map((row) => row.textContent),
      ["8", "8a"],
    );
    assert.equal(menu?.querySelectorAll(".slipbox-inferred-navigation-gap").length, 1);
    assert.equal(menu?.textContent, "8› 28a");
    assert.equal(menu?.textContent?.includes("Parent"), false);
    assert.equal(
      menu?.querySelector("button")?.getAttribute("aria-label"),
      "Inferred parent 8, 2 children",
    );

    arrow(subject, "right")?.click();
    menu = subject.document.querySelector<HTMLElement>(
      ".slipbox-inferred-navigation-menu",
    );
    assert.deepEqual(
      Array.from(menu?.querySelectorAll(".slipbox-inferred-navigation-address") ?? [])
        .map((row) => row.textContent),
      ["8c", "8b1", "8b2"],
    );
    assert.equal(menu?.querySelectorAll(".slipbox-inferred-navigation-gap").length, 1);
    assert.equal(
      menu?.querySelector("button")?.getAttribute("aria-label"),
      "Next inferred sibling 8c, one child",
    );
    assert.equal(menu?.textContent?.includes("8d"), false);
    assert.equal(menu?.textContent?.includes("7z"), false);
  });

  test("keeps unavailable sides visible but disabled and hides both settings-off", () => {
    const subject = fixture({
      previousSiblings: [],
      nextSiblings: [],
      children: [],
    });
    assert.equal(arrow(subject, "left")?.disabled, true);
    assert.equal(arrow(subject, "right")?.disabled, true);
    subject.setShow(false);
    subject.manager.refresh();
    assert.equal(subject.navigation.hidden, true);
    assert.equal(subject.navigation.childElementCount, 0);
    subject.setShow(true);
    subject.manager.refresh();
    assert.equal(subject.navigation.hidden, false);
  });

  test("activates structurally and gates row previews by policy", () => {
    const subject = fixture();
    arrow(subject, "right")?.click();
    const row = subject.document.querySelector<HTMLButtonElement>(
      ".slipbox-inferred-navigation-item",
    );
    row?.dispatchEvent(new subject.window.MouseEvent("mouseover", {
      bubbles: true,
    }) as unknown as Event);
    assert.deepEqual(subject.previews, []);
    subject.setPreview(true);
    row?.dispatchEvent(new subject.window.MouseEvent("mouseover", {
      bubbles: true,
    }) as unknown as Event);
    row?.dispatchEvent(new subject.window.MouseEvent("click", {
      bubbles: true,
      metaKey: true,
    }) as unknown as Event);
    assert.deepEqual(subject.previews, ["8c.md"]);
    assert.deepEqual(subject.activations, ["8c.md"]);
    assert.equal(
      subject.document.querySelector(".slipbox-inferred-navigation-menu"),
      null,
    );
  });

  test("supports keyboard opening and Escape focus return", () => {
    const subject = fixture();
    const right = arrow(subject, "right");
    right?.focus();
    right?.dispatchEvent(new subject.window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
    }) as unknown as Event);
    const first = subject.document.querySelector<HTMLButtonElement>(
      ".slipbox-inferred-navigation-item",
    );
    assert.equal(subject.document.activeElement, first);
    first?.dispatchEvent(new subject.window.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    }) as unknown as Event);
    assert.equal(subject.document.activeElement, right);
    assert.equal(
      subject.document.querySelector(".slipbox-inferred-navigation-menu"),
      null,
    );
  });

  test("allows only one open inferred-navigation menu per document", () => {
    const subject = fixture();
    const secondCard = subject.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "article",
    );
    subject.document.body.append(secondCard);
    const second = new InferredNavigationManager({
      showNavigation: () => true,
      showTooltips: () => true,
      previewLinksOnHover: () => false,
      relationsForPath: () => RELATIONS,
      preview: () => undefined,
      activate: () => undefined,
      runAfterEditing: (_reason, action) => void action(),
    });
    const secondNavigation = second.render(secondCard, {
      path: "Other.md",
      interactive: true,
    });
    arrow(subject, "left")?.click();
    secondNavigation.querySelector<HTMLButtonElement>(".is-right")?.click();
    assert.equal(
      subject.document.querySelectorAll(".slipbox-inferred-navigation-menu").length,
      1,
    );
  });
});
