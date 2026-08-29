import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import type {
  LocalBranchModel,
  LocalBranchNode,
} from "../src/local-branch-model.js";
import { localBranchDomWindow } from "../src/local-branch-dom.js";
import { LocalBranchViewController } from "../src/local-branch-view.js";

const branchNode = (
  path: string,
  address: string,
  departures = 0,
): LocalBranchNode => ({
  path,
  address,
  title: `Card ${address}`,
  duplicateIndex: 0,
  duplicateCount: 1,
  departures: departures === 0 ? [] : [{
    id: `departure:inferred:${address}`,
    kind: "inferred",
    label: "Address-inferred inserted strand",
    target: { path: `${path}-child`, address: `${address}a`, title: "Child" },
  }],
});

const MODEL: LocalBranchModel = {
  activePath: "b.md",
  activeAddress: "1b",
  strands: [{
    id: "current",
    role: "current",
    nodes: [branchNode("a.md", "1a", 1), branchNode("b.md", "1b")],
    selectedPath: "b.md",
    knownBeginning: true,
    knownEnd: true,
  }],
  navigation: {
    backward: [{
      id: "backward:1a",
      movement: "backward",
      label: "Move backward",
      targets: [{ path: "a.md", address: "1a", title: "Card 1a" }],
    }],
    forward: [],
    beginning: [{
      id: "beginning:1a",
      movement: "beginning",
      label: "Move to beginning",
      targets: [{ path: "a.md", address: "1a", title: "Card 1a" }],
    }],
    inferred: [],
    explicit: [],
    higher: [],
  },
};

function fixture(model: LocalBranchModel = MODEL, ownerWidth = 520) {
  const htmlNamespace = "http://www.w3.org/1999/xhtml";
  const window = new Window();
  const document = window.document as unknown as Document;
  const createNamespacedElement = document.createElementNS.bind(document);
  Object.assign(window, {
    createEl: (tag: string) => createNamespacedElement(htmlNamespace, tag),
    createDiv: () => createNamespacedElement(htmlNamespace, "div"),
    createSvg: (tag: string) =>
      createNamespacedElement("http://www.w3.org/2000/svg", tag),
  });
  Object.defineProperty(document, "win", { value: window });
  const obsidianWindow = localBranchDomWindow(document);
  const first = obsidianWindow.createEl("article");
  const second = obsidianWindow.createEl("article");
  Object.defineProperty(first, "offsetWidth", { value: ownerWidth });
  Object.defineProperty(second, "offsetWidth", { value: ownerWidth });
  document.body.append(first, second);
  const activations: readonly string[][] = [];
  const previews: string[] = [];
  const departureChoices: readonly string[][] = [];
  const mutableActivations = activations as string[][];
  let visible = true;
  const controller = new LocalBranchViewController({
    activeDocument: document,
    showView: () => visible,
    showTooltips: () => false,
    previewLinksOnHover: () => true,
    modelForPath: () => model,
    chooseDeparture: async (departures) => {
      (departureChoices as string[][]).push(
        departures.map((departure) => departure.id),
      );
      return departures[1] ?? departures[0] ?? null;
    },
    activate: (targets) => {
      mutableActivations.push(targets.map((target) => target.path));
    },
    preview: (_event, _target, destination) => {
      previews.push(destination.path);
    },
    runAfterEditing: (_reason, action) => void action(),
  });
  controller.attach(first, "b.md");
  return {
    window,
    document,
    first,
    second,
    controller,
    activations,
    previews,
    departureChoices,
    setVisible: (value: boolean) => { visible = value; },
  };
}

describe("local Branch View controller", () => {
  test("matches the owning card width", () => {
    const ownerWidth = 548;
    const subject = fixture(MODEL, ownerWidth);
    const root = subject.first.querySelector<HTMLElement>(
      ".slipbox-local-branch-view",
    );

    assert.equal(root?.style.width, `${ownerWidth}px`);
    assert.equal(root?.style.maxHeight, "");
  });

  test("renders six stable movement slots with unavailable controls disabled", () => {
    const subject = fixture();
    const root = subject.first.querySelector(".slipbox-local-branch-view");
    assert.notEqual(root, null);
    assert.equal(root?.querySelectorAll(".slipbox-local-branch-control-slot").length, 6);
    assert.equal(root?.querySelectorAll("button.slipbox-local-branch-control").length, 6);
    assert.equal(
      root?.querySelectorAll("button.slipbox-local-branch-control:disabled").length,
      4,
    );
    assert.equal(root?.querySelector("[data-movement='backward'] button")
      ?.getAttribute("aria-label"), "Move backward");
  });

  test("transfers one stable root between Deck owners", () => {
    const subject = fixture();
    const root = subject.first.querySelector(".slipbox-local-branch-view");
    subject.controller.attach(subject.second, "c.md");
    assert.equal(subject.first.querySelector(".slipbox-local-branch-view"), null);
    assert.equal(subject.second.querySelector(".slipbox-local-branch-view"), root);
    assert.equal(subject.document.querySelectorAll(".slipbox-local-branch-view").length, 1);
  });

  test("activates controls and exact graph nodes structurally", () => {
    const subject = fixture();
    subject.first.querySelector<HTMLButtonElement>(
      "[data-movement='backward'] button",
    )?.click();
    const node = subject.first.querySelector<SVGElement>(
      "[data-focus-id='node:a.md']",
    );
    node?.dispatchEvent(new subject.window.MouseEvent("mouseover", {
      bubbles: true,
    }) as unknown as Event);
    node?.dispatchEvent(new subject.window.MouseEvent("click", {
      bubbles: true,
    }) as unknown as Event);
    assert.deepEqual(subject.activations, [["a.md"], ["a.md"]]);
    assert.deepEqual(subject.previews, ["a.md"]);
  });

  test("supports keyboard node activation without visual tooltips", () => {
    const subject = fixture();
    const node = subject.first.querySelector<SVGElement>(
      "[data-focus-id='node:a.md']",
    );
    node?.dispatchEvent(new subject.window.KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
    }) as unknown as Event);
    assert.deepEqual(subject.activations, [["a.md"]]);
    assert.equal(subject.first.querySelector("title"), null);
    assert.match(node?.getAttribute("aria-label") ?? "", /a\.md/);
  });

  test("elides long node addresses from the beginning with circle clearance", () => {
    const address = "25,2,2";
    const path = "long.md";
    const subject = fixture({
      ...MODEL,
      activePath: path,
      activeAddress: address,
      strands: [{
        ...MODEL.strands[0]!,
        nodes: [branchNode(path, address)],
        selectedPath: path,
      }],
    });
    const node = subject.first.querySelector<SVGElement>(
      `[data-focus-id='node:${path}']`,
    );

    assert.equal(node?.querySelector("text")?.textContent, "…2,2");
    assert.match(node?.getAttribute("aria-label") ?? "", /25,2,2/);
  });

  test("expands one hidden departure and chooses when several exist", async () => {
    const owner = branchNode("a.md", "1a");
    const first = {
      id: "departure:inferred:1a",
      kind: "inferred" as const,
      label: "Address-inferred inserted strand",
      target: { path: "a1.md", address: "1a1", title: "First" },
    };
    const second = {
      id: "departure:explicit:a.md:x.md",
      kind: "explicit" as const,
      label: "Supplementary strand x",
      target: { path: "x.md", address: "9", title: "Second" },
    };
    const subject = fixture({
      ...MODEL,
      strands: [{
        ...MODEL.strands[0]!,
        nodes: [{ ...owner, departures: [first, second] }, branchNode("b.md", "1b")],
      }],
    });
    const stub = subject.first.querySelector<SVGElement>(
      "[data-focus-id='stub:a.md']",
    );
    assert.match(stub?.getAttribute("aria-label") ?? "", /address-inferred/);
    assert.match(stub?.getAttribute("aria-label") ?? "", /supplementary/);
    stub?.dispatchEvent(new subject.window.MouseEvent("click", {
      bubbles: true,
    }) as unknown as Event);
    await Promise.resolve();
    assert.deepEqual(subject.departureChoices, [[first.id, second.id]]);
    assert.equal(
      subject.first.querySelector("[data-focus-id='stub:a.md']")
        ?.classList.contains("is-expanded"),
      true,
    );
  });

  test("remembers collapsed state for the controller lifetime", () => {
    const subject = fixture();
    subject.first.querySelector<HTMLButtonElement>(
      ".slipbox-local-branch-collapse",
    )?.click();
    assert.equal(subject.first.querySelector(".slipbox-local-branch-graph"), null);
    subject.controller.attach(subject.second, "c.md");
    assert.equal(subject.second.querySelector(".slipbox-local-branch-graph"), null);
    assert.equal(
      subject.second.querySelector(".slipbox-local-branch-collapse")
        ?.getAttribute("aria-expanded"),
      "false",
    );
  });

  test("hides cleanly when the presentation setting turns off", () => {
    const subject = fixture();
    subject.setVisible(false);
    subject.controller.refresh();
    const root = subject.first.querySelector<HTMLElement>(
      ".slipbox-local-branch-view",
    );
    assert.equal(root?.hidden, true);
    assert.equal(root?.childElementCount, 0);
  });
});
