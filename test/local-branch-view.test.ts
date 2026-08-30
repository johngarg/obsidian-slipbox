import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import type {
  LocalBranchModel,
  LocalBranchNode,
} from "../src/local-branch-model.js";
import { localBranchDomWindow } from "../src/local-branch-dom.js";
import {
  localBranchTrayWidth,
  LocalBranchViewController,
} from "../src/local-branch-view.js";

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
    label: "Inserted strand",
    target: { path: `${path}-child`, address: `${address}a`, title: "Child" },
  }],
});

const MODEL: LocalBranchModel = {
  activePath: "b.md",
  activeAddress: "1b",
  expandedDepartureId: null,
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

function fixture(
  model: LocalBranchModel = MODEL,
  ownerWidth = 520,
  stageWidth = 900,
  showTooltips = false,
) {
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
  const stage = obsidianWindow.createDiv();
  Object.defineProperty(first, "offsetWidth", { value: ownerWidth });
  Object.defineProperty(second, "offsetWidth", { value: ownerWidth });
  Object.defineProperty(stage, "clientWidth", { value: stageWidth });
  stage.append(first, second);
  document.body.append(stage);
  const activations: readonly string[][] = [];
  const previews: string[] = [];
  const departureChoices: readonly string[][] = [];
  const mutableActivations = activations as string[][];
  let available = true;
  const controller = new LocalBranchViewController({
    activeDocument: document,
    canShowView: () => available,
    showTooltips: () => showTooltips,
    previewLinksOnHover: () => true,
    setIcon: (control, icon) => {
      const svg = createNamespacedElement("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("data-icon", icon);
      control.append(svg);
    },
    modelForPath: (_path, expandedDepartureId) =>
      expandedDepartureId === null
        ? model
        : { ...model, expandedDepartureId },
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
  controller.attach(first, "b.md", stage);
  return {
    window,
    document,
    first,
    second,
    stage,
    controller,
    activations,
    previews,
    departureChoices,
    setAvailable: (value: boolean) => { available = value; },
  };
}

describe("local Branch View controller", () => {
  test("widens within the Deck stage and caps at the layout maximum", () => {
    const ownerWidth = 548;
    const stageWidth = 900;
    const subject = fixture(MODEL, ownerWidth, stageWidth);
    const root = subject.first.querySelector<HTMLElement>(
      ".slipbox-local-branch-view",
    );

    assert.equal(root?.style.width, "852px");
    assert.equal(root?.style.maxHeight, "");
    assert.equal(
      root?.querySelector<HTMLElement>(".slipbox-local-branch-header")
        ?.style.right,
      "152px",
    );
    assert.equal(localBranchTrayWidth(ownerWidth, 500), ownerWidth);
    assert.equal(localBranchTrayWidth(ownerWidth, 1_200), 900);
    assert.equal(localBranchTrayWidth(ownerWidth, 0), ownerWidth);
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
    const backward = root?.querySelector<HTMLElement>(
      "[data-movement='backward'] button",
    );
    const labelId = backward?.getAttribute("aria-labelledby") ?? "";
    assert.equal(
      subject.document.getElementById(labelId)?.textContent,
      "Move backward on strand",
    );
    assert.deepEqual(
      Array.from(root?.querySelectorAll(".slipbox-local-branch-control svg") ?? [])
        .map((icon) => icon.getAttribute("data-icon")),
      [
        "arrow-left",
        "arrow-right",
        "chevrons-left",
        "git-fork",
        "corner-down-right",
        "corner-up-left",
      ],
    );
    assert.equal(
      root?.querySelector(".slipbox-local-branch-toggle svg")
        ?.getAttribute("data-icon"),
      "git-branch",
    );
  });

  test("uses only the Obsidian tooltip on branch controls", () => {
    const subject = fixture(MODEL, 520, 900, true);
    const button = subject.first.querySelector<HTMLElement>(
      "[data-movement='backward'] button",
    );

    assert.equal(button?.getAttribute("aria-label"), "Move backward on strand");
    assert.equal(button?.getAttribute("data-tooltip-position"), "bottom");
    assert.equal(button?.getAttribute("title"), null);
  });

  test("names Branch View containers without visual tooltip attributes", () => {
    const subject = fixture();
    const containers = [
      [".slipbox-local-branch-view", "Local branch view"],
      [".slipbox-local-branch-toolbar", "Branch navigation"],
    ] as const;

    for (const [selector, label] of containers) {
      const container = subject.first.querySelector<HTMLElement>(selector);
      const labelId = container?.getAttribute("aria-labelledby") ?? "";
      assert.equal(container?.getAttribute("aria-label"), null);
      assert.equal(container?.getAttribute("title"), null);
      assert.equal(container?.getAttribute("data-tooltip-position"), null);
      assert.equal(subject.document.getElementById(labelId)?.textContent, label);
    }
  });

  test("uses one movement icon and passes every destination to the chooser path", () => {
    const subject = fixture({
      ...MODEL,
      navigation: {
        ...MODEL.navigation,
        explicit: [
          {
            id: "explicit:first",
            movement: "explicit",
            label: "First supplementary strand",
            targets: [{ path: "x.md", address: "1x", title: "First" }],
          },
          {
            id: "explicit:second",
            movement: "explicit",
            label: "Second supplementary strand",
            targets: [{ path: "y.md", address: "1y", title: "Second" }],
          },
        ],
      },
    });
    const slot = subject.first.querySelector("[data-movement='explicit']");

    assert.equal(slot?.querySelectorAll("button").length, 1);
    slot?.querySelector<HTMLButtonElement>("button")?.click();
    assert.deepEqual(subject.activations, [["x.md", "y.md"]]);
  });

  test("transfers one stable root between Deck owners", () => {
    const subject = fixture();
    const root = subject.first.querySelector(".slipbox-local-branch-view");
    subject.controller.attach(subject.second, "c.md", subject.stage);
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

  test("draws inter-strand connections as straight lines", () => {
    const target = branchNode("c.md", "1c");
    const subject = fixture({
      ...MODEL,
      strands: [
        MODEL.strands[0]!,
        {
          id: "departure:explicit:b.md:c.md",
          role: "departure",
          nodes: [target],
          selectedPath: target.path,
          knownBeginning: true,
          knownEnd: true,
          connection: {
            fromPath: "b.md",
            toPath: target.path,
            kind: "explicit",
          },
        },
      ],
    });

    assert.notEqual(
      subject.first.querySelector("line.slipbox-local-branch-edge.is-explicit"),
      null,
    );
    assert.equal(
      subject.first.querySelector("path.slipbox-local-branch-edge.is-explicit"),
      null,
    );
  });

  test("draws higher-to-current inferred and explicit connections", () => {
    for (const kind of ["inferred", "explicit"] as const) {
      const parent = branchNode("parent.md", "1");
      const current = branchNode("child.md", "1a");
      const subject = fixture({
        ...MODEL,
        activePath: current.path,
        activeAddress: current.address,
        strands: [
          {
            id: `higher:${kind}:parent.md`,
            role: "higher",
            nodes: [parent],
            selectedPath: parent.path,
            knownBeginning: true,
            knownEnd: true,
            connection: {
              fromPath: parent.path,
              toPath: current.path,
              kind,
            },
          },
          {
            id: "current",
            role: "current",
            nodes: [current],
            selectedPath: current.path,
            knownBeginning: true,
            knownEnd: true,
          },
        ],
      });

      assert.notEqual(
        subject.first.querySelector(
          `line.slipbox-local-branch-edge.is-${kind}`,
        ),
        null,
      );
    }
  });

  test("points higher-context stubs up and all other stubs down", () => {
    const subject = fixture({
      ...MODEL,
      strands: [{
        id: "higher",
        role: "higher",
        nodes: [branchNode("higher.md", "1", 1)],
        selectedPath: "higher.md",
        knownBeginning: true,
        knownEnd: true,
      }, ...MODEL.strands],
    });

    for (const [path, verticalDirection] of [
      ["higher.md", -1],
      ["a.md", 1],
    ] as const) {
      const line = subject.first.querySelector<SVGLineElement>(
        `[data-focus-id='stub:${path}'] .slipbox-local-branch-stub-line`,
      );
      const deltaX = Number(line?.getAttribute("x2")) -
        Number(line?.getAttribute("x1"));
      const deltaY = Number(line?.getAttribute("y2")) -
        Number(line?.getAttribute("y1"));

      assert.equal(deltaX > 0, true);
      assert.equal(Math.sign(deltaY), verticalDirection);
      assert.equal(Math.abs(deltaX - Math.abs(deltaY)) < 1e-9, true);
      assert.equal(Math.abs(Math.hypot(deltaX, deltaY) - 12) < 1e-9, true);
    }
  });

  test("keeps the branch-stub hit target outside the node", () => {
    const subject = fixture();
    const node = subject.first.querySelector<SVGCircleElement>(
      "[data-focus-id='node:a.md'] circle",
    );
    const visual = subject.first.querySelector<SVGLineElement>(
      "[data-focus-id='stub:a.md'] .slipbox-local-branch-stub-line",
    );
    const hit = subject.first.querySelector<SVGLineElement>(
      "[data-focus-id='stub:a.md'] .slipbox-local-branch-stub-hit",
    );
    const centerX = Number(node?.getAttribute("cx"));
    const centerY = Number(node?.getAttribute("cy"));
    const hitStartDistance = Math.hypot(
      Number(hit?.getAttribute("x1")) - centerX,
      Number(hit?.getAttribute("y1")) - centerY,
    );

    assert.equal(
      hitStartDistance > Number(node?.getAttribute("r")),
      true,
    );
    assert.equal(hit?.getAttribute("stroke-linecap"), "butt");
    assert.equal(visual?.getAttribute("pointer-events"), "none");
  });

  test("wraps node addresses onto two balanced lines", () => {
    const address = "57,2,25";
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
    const spans = node === null
      ? []
      : Array.from(node.querySelectorAll("tspan"));

    assert.deepEqual(spans.map((span) => span.textContent), ["57,", "2,25"]);
    assert.equal(spans[0]?.getAttribute("y"), "43.5");
    assert.equal(spans[1]?.getAttribute("y"), "52.5");
    assert.match(node?.getAttribute("aria-label") ?? "", /57,2,25/);
  });

  test("elides overlong wrapped addresses from the beginning", () => {
    const address = "123456789012345";
    const path = "very-long.md";
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
    const lines = node === null
      ? []
      : Array.from(node.querySelectorAll("tspan"))
        .map((span) => span.textContent);

    assert.deepEqual(lines, ["…7890", "12345"]);
    assert.match(node?.getAttribute("aria-label") ?? "", /123456789012345/);
  });

  test("renders omitted runs as a counted ellipsis slot", () => {
    const nodes = Array.from({ length: 12 }, (_, index) =>
      branchNode(`${index}.md`, String(index))
    );
    const subject = fixture({
      ...MODEL,
      activePath: "5.md",
      activeAddress: "5",
      strands: [{
        ...MODEL.strands[0]!,
        nodes,
        selectedPath: "5.md",
      }],
    }, 240, 360);
    const gap = subject.first.querySelector<SVGElement>(
      ".slipbox-local-branch-gap",
    );
    const focusId = gap?.getAttribute("data-focus-id") ?? "";

    assert.match(gap?.getAttribute("aria-label") ?? "", /Show \d+ omitted cards/);
    assert.match(
      gap?.querySelector(".slipbox-local-branch-gap-count")?.textContent ?? "",
      /^\d+$/,
    );
    assert.equal(
      gap?.querySelector(".slipbox-local-branch-gap-ellipsis")?.textContent,
      "…",
    );
    const compactScroller = subject.first.querySelector<HTMLElement>(
      ".slipbox-local-branch-scroller",
    );
    if (compactScroller !== null) {
      compactScroller.scrollLeft = 137;
    }
    gap?.dispatchEvent(new subject.window.KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
    }) as unknown as Event);
    assert.equal(
      subject.first.querySelector(`[data-focus-id='${focusId}']`),
      null,
    );
    const graph = subject.first.querySelector<SVGElement>(
      ".slipbox-local-branch-graph",
    );
    const expandedScroller = subject.first.querySelector<HTMLElement>(
      ".slipbox-local-branch-scroller",
    );
    assert.equal(Number(graph?.getAttribute("width")) > 312, true);
    assert.notEqual(expandedScroller, compactScroller);
    assert.equal(expandedScroller?.scrollLeft, 137);
  });

  test("expands one hidden departure and chooses when several exist", async () => {
    const owner = branchNode("a.md", "1a");
    const first = {
      id: "departure:inferred:1a",
      kind: "inferred" as const,
      label: "Inserted strand",
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
    assert.match(stub?.getAttribute("aria-label") ?? "", /inserted/);
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

  test("keeps one visibility override while the control rail changes owners", () => {
    const subject = fixture();
    const toggle = subject.first.querySelector<HTMLButtonElement>(
      ".slipbox-local-branch-toggle",
    );

    assert.equal(toggle?.getAttribute("aria-pressed"), "true");
    assert.equal(
      subject.document.getElementById(
        toggle?.getAttribute("aria-labelledby") ?? "",
      )?.textContent,
      "Hide Branch View",
    );
    toggle?.click();
    assert.equal(subject.first.querySelector(".slipbox-local-branch-graph"), null);
    assert.equal(subject.first.querySelector(".slipbox-local-branch-toolbar"), null);
    assert.equal(
      subject.first.querySelector(".slipbox-local-branch-view")?.getAttribute("hidden"),
      null,
    );
    subject.controller.attach(subject.second, "c.md", subject.stage);
    assert.equal(subject.second.querySelector(".slipbox-local-branch-graph"), null);
    assert.equal(
      subject.second.querySelector(".slipbox-local-branch-toggle")
        ?.getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(
      subject.document.getElementById(
        subject.second.querySelector(".slipbox-local-branch-toggle")
          ?.getAttribute("aria-labelledby") ?? "",
      )?.textContent,
      "Show Branch View",
    );
  });

  test("removes the controls while disabled and starts shown when re-enabled", () => {
    const subject = fixture();
    subject.first.querySelector<HTMLButtonElement>(
      ".slipbox-local-branch-toggle",
    )?.click();
    assert.equal(subject.first.querySelector(".slipbox-local-branch-graph"), null);

    subject.setAvailable(false);
    subject.controller.refresh();
    const root = subject.first.querySelector<HTMLElement>(
      ".slipbox-local-branch-view",
    );
    assert.equal(root?.hidden, true);
    assert.equal(root?.querySelector(".slipbox-local-branch-toggle"), null);

    subject.controller.toggleVisibility();
    subject.setAvailable(true);
    subject.controller.refresh();
    assert.notEqual(subject.first.querySelector(".slipbox-local-branch-graph"), null);
    assert.equal(
      subject.first.querySelector(".slipbox-local-branch-toggle")
        ?.getAttribute("aria-pressed"),
      "true",
    );
  });

  test("hides cleanly when no branch model is enabled", () => {
    const subject = fixture();
    subject.setAvailable(false);
    subject.controller.refresh();
    const root = subject.first.querySelector<HTMLElement>(
      ".slipbox-local-branch-view",
    );
    assert.equal(root?.hidden, true);
    assert.equal(root?.childElementCount, 1);
    assert.equal(root?.firstElementChild?.className, "slipbox-visually-hidden");
    assert.equal(root?.querySelector(".slipbox-local-branch-header"), null);
    assert.equal(root?.querySelector(".slipbox-local-branch-graph"), null);
  });
});
