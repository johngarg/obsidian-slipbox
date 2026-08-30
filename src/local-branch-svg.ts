import {
  layoutLocalBranchModel,
  type LocalBranchLayout,
  type LocalBranchLayoutNode,
  type LocalBranchLayoutStrand,
} from "./local-branch-layout.js";
import { localBranchDomWindow } from "./local-branch-dom.js";
import type {
  LocalBranchDeparture,
  LocalBranchModel,
  LocalBranchTarget,
} from "./local-branch-types.js";

export interface LocalBranchSvgOptions {
  readonly parent: HTMLElement;
  readonly model: LocalBranchModel;
  readonly width: number;
  readonly expandedGapIds: ReadonlySet<string>;
  readonly expandedDepartureId: string | null;
  readonly showTooltips: boolean;
  readonly previewLinksOnHover: boolean;
  readonly activate: (targets: readonly LocalBranchTarget[]) => void | Promise<void>;
  readonly preview: (
    event: MouseEvent,
    target: SVGElement,
    destination: LocalBranchTarget,
    sourcePath: string,
  ) => void;
  readonly runAfterEditing: (reason: string, action: () => void) => void;
  readonly expandGap: (id: string) => void;
  readonly toggleDeparture: (
    departures: readonly LocalBranchDeparture[],
  ) => void | Promise<void>;
}

const EDGE_LABEL_MAX_CHARACTERS = 14;
const NODE_LABEL_MAX_LINE_CHARACTERS = 5;
const NODE_LABEL_MAX_LINES = 2;
const NODE_LABEL_LINE_HEIGHT = 9;
const BRANCH_STUB_LENGTH = 12;
const BRANCH_STUB_HIT_EXTENSION = 10;
const BRANCH_STUB_HIT_CLEARANCE = 1;
const DIAGONAL_COMPONENT = Math.SQRT1_2;

/** Render a complete SVG projection without owning Deck or controller state. */
export function renderLocalBranchSvg(options: LocalBranchSvgOptions): void {
  new LocalBranchSvgRenderer(options).render();
}

class LocalBranchSvgRenderer {
  private readonly activeDocument: Document;
  private readonly visibleDepartureIds: ReadonlySet<string>;

  constructor(private readonly options: LocalBranchSvgOptions) {
    this.activeDocument = options.parent.ownerDocument;
    this.visibleDepartureIds = new Set(
      options.model.strands
        .filter((strand) =>
          strand.role === "departure" &&
          strand.id !== options.model.expandedDepartureId
        )
        .map((strand) => strand.id),
    );
  }

  render(): void {
    const scroller = localBranchDomWindow(this.activeDocument).createDiv();
    scroller.className = "slipbox-local-branch-scroller";
    this.options.parent.append(scroller);
    const layout = layoutLocalBranchModel(this.options.model, {
      width: this.options.width,
      expandedGapIds: this.options.expandedGapIds,
    });
    const svg = this.svg("svg");
    svg.classList.add("slipbox-local-branch-graph");
    svg.setAttribute("width", String(layout.contentWidth));
    svg.setAttribute("height", String(layout.height));
    svg.setAttribute("viewBox", `0 0 ${layout.contentWidth} ${layout.height}`);
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "Local branch diagram");
    scroller.append(svg);

    const edges = this.svg("g");
    edges.classList.add("slipbox-local-branch-edges");
    svg.append(edges);
    this.renderContinuationEdges(edges, layout);
    this.renderBranchEdges(edges, layout);

    const items = this.svg("g");
    items.classList.add("slipbox-local-branch-items");
    svg.append(items);
    for (const row of layout.strands) {
      for (const item of row.items) {
        if (item.kind === "gap") {
          this.renderGap(
            items,
            item.id,
            item.count,
            item.x,
            item.y,
          );
        } else {
          this.renderNode(items, item, layout.nodeRadius);
        }
      }
    }

    const active = this.findNode(
      layout,
      this.options.model.activePath,
      "current",
    );
    if (active !== null && layout.contentWidth > layout.viewportWidth) {
      scroller.scrollLeft = Math.max(0, active.x - layout.viewportWidth / 2);
    }
  }

  private renderContinuationEdges(
    parent: SVGElement,
    layout: LocalBranchLayout,
  ): void {
    for (const row of layout.strands) {
      for (let index = 1; index < row.items.length; index += 1) {
        const left = row.items[index - 1];
        const right = row.items[index];
        if (left === undefined || right === undefined) {
          continue;
        }
        const line = this.svg("line");
        line.classList.add("slipbox-local-branch-edge", "is-continuation");
        line.setAttribute("x1", String(left.x));
        line.setAttribute("y1", String(left.y));
        line.setAttribute("x2", String(right.x));
        line.setAttribute("y2", String(right.y));
        parent.append(line);
      }
    }
  }

  private renderBranchEdges(
    parent: SVGElement,
    layout: LocalBranchLayout,
  ): void {
    for (const row of layout.strands) {
      const connection = row.strand.connection;
      if (connection === undefined) {
        continue;
      }
      const fromRole = row.strand.role === "higher" ? "higher" : "current";
      const toRole = row.strand.role === "higher" ? "current" : "departure";
      const from = this.findNode(layout, connection.fromPath, fromRole);
      const to = this.findNode(
        layout,
        connection.toPath,
        toRole,
        row.strand.role === "departure" ? row.strand.id : undefined,
      );
      if (from === null || to === null) {
        continue;
      }
      const line = this.svg("line");
      line.classList.add("slipbox-local-branch-edge", `is-${connection.kind}`);
      line.setAttribute("x1", String(from.x));
      line.setAttribute("y1", String(from.y));
      line.setAttribute("x2", String(to.x));
      line.setAttribute("y2", String(to.y));
      const middleY = (from.y + to.y) / 2;
      parent.append(line);
      if (connection.label !== undefined) {
        this.renderEdgeLabel(
          parent,
          connection.label,
          (from.x + to.x) / 2,
          middleY,
        );
      }
    }
  }

  private renderEdgeLabel(
    parent: SVGElement,
    label: string,
    x: number,
    y: number,
  ): void {
    const group = this.svg("g");
    group.classList.add("slipbox-local-branch-edge-label");
    const visible = truncateEnd(label, EDGE_LABEL_MAX_CHARACTERS);
    const width = Math.max(18, visible.length * 7 + 8);
    const background = this.svg("rect");
    background.setAttribute("x", String(x - width / 2));
    background.setAttribute("y", String(y - 9));
    background.setAttribute("width", String(width));
    background.setAttribute("height", "18");
    background.setAttribute("rx", "4");
    const text = this.svg("text");
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(y + 4));
    text.textContent = visible;
    group.append(background, text);
    this.appendTitle(group, label);
    parent.append(group);
  }

  private renderNode(
    parent: SVGElement,
    item: LocalBranchLayoutNode,
    radius: number,
  ): void {
    const node = item.node;
    const group = this.svg("g");
    group.classList.add("slipbox-local-branch-node");
    if (node.path === this.options.model.activePath) {
      group.classList.add("is-active");
    }
    if (node.duplicateCount > 1) {
      group.classList.add("is-duplicate");
    }
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("data-focus-id", `node:${node.path}`);
    const duplicate = node.duplicateCount > 1
      ? `, duplicate ${node.duplicateIndex + 1} of ${node.duplicateCount}`
      : "";
    const label = `${node.address} · ${node.title}${duplicate}; ${node.path}`;
    group.setAttribute("aria-label", label);
    const circle = this.svg("circle");
    circle.setAttribute("cx", String(item.x));
    circle.setAttribute("cy", String(item.y));
    circle.setAttribute("r", String(radius));
    const text = this.svg("text");
    text.setAttribute("x", String(item.x));
    const lines = wrapNodeLabel(node.address);
    const firstBaseline = item.y + 3 -
      ((lines.length - 1) * NODE_LABEL_LINE_HEIGHT) / 2;
    for (const [index, line] of lines.entries()) {
      const span = this.svg("tspan");
      span.setAttribute("x", String(item.x));
      span.setAttribute(
        "y",
        String(firstBaseline + index * NODE_LABEL_LINE_HEIGHT),
      );
      span.textContent = line;
      text.append(span);
    }
    group.append(circle, text);
    this.appendTitle(group, label);
    this.activateOnClickOrKeyboard(group, () => {
      void this.options.activate([node]);
    });
    group.addEventListener("mouseover", (event) => {
      if (this.options.previewLinksOnHover) {
        this.options.preview(
          event,
          group,
          node,
          this.options.model.activePath,
        );
      }
    });
    parent.append(group);

    const hiddenDepartures = node.departures.filter((departure) =>
      !this.visibleDepartureIds.has(departure.id)
    );
    if (
      node.path !== this.options.model.activePath &&
      hiddenDepartures.length > 0
    ) {
      this.renderStub(parent, item, radius, hiddenDepartures);
    }
  }

  private renderStub(
    parent: SVGElement,
    item: LocalBranchLayoutNode,
    radius: number,
    departures: readonly LocalBranchDeparture[],
  ): void {
    const group = this.svg("g");
    group.classList.add("slipbox-local-branch-stub");
    if (departures.some((departure) =>
      this.options.expandedDepartureId === departure.id
    )) {
      group.classList.add("is-expanded");
    }
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("data-focus-id", `stub:${item.node.path}`);
    const inferredCount = departures.filter((departure) =>
      departure.kind === "inferred"
    ).length;
    const explicitCount = departures.length - inferredCount;
    const types = [
      ...(inferredCount === 0
        ? []
        : [`${inferredCount} address-inferred`]),
      ...(explicitCount === 0
        ? []
        : [`${explicitCount} supplementary`]),
    ].join(", ");
    const label = `${departures.length} hidden branch${
      departures.length === 1 ? "" : "es"
    } from ${item.node.address}: ${types}`;
    group.setAttribute("aria-label", label);
    const line = this.svg("line");
    const verticalDirection = 1;
    const radiusOffset = radius * DIAGONAL_COMPONENT;
    const stubOffset = BRANCH_STUB_LENGTH * DIAGONAL_COMPONENT;
    const startX = item.x + radiusOffset;
    const startY = item.y + verticalDirection * radiusOffset;
    const endX = startX + stubOffset;
    const endY = startY + verticalDirection * stubOffset;
    line.setAttribute("x1", String(startX));
    line.setAttribute("y1", String(startY));
    line.setAttribute("x2", String(endX));
    line.setAttribute("y2", String(endY));
    line.classList.add("slipbox-local-branch-stub-line");
    line.setAttribute("pointer-events", "none");
    const hit = this.svg("line");
    hit.classList.add("slipbox-local-branch-stub-hit");
    const hitStartOffset = (radius + BRANCH_STUB_HIT_CLEARANCE) *
      DIAGONAL_COMPONENT;
    const hitEndOffset = (
      radius + BRANCH_STUB_LENGTH + BRANCH_STUB_HIT_EXTENSION
    ) * DIAGONAL_COMPONENT;
    hit.setAttribute("x1", String(item.x + hitStartOffset));
    hit.setAttribute(
      "y1",
      String(item.y + verticalDirection * hitStartOffset),
    );
    hit.setAttribute("x2", String(item.x + hitEndOffset));
    hit.setAttribute(
      "y2",
      String(item.y + verticalDirection * hitEndOffset),
    );
    hit.setAttribute("stroke-linecap", "butt");
    group.append(line, hit);
    this.appendTitle(group, label);
    this.activateOnClickOrKeyboard(group, () => {
      void this.options.toggleDeparture(departures);
    });
    parent.append(group);
  }

  private renderGap(
    parent: SVGElement,
    id: string,
    count: number,
    x: number,
    y: number,
  ): void {
    const group = this.svg("g");
    group.classList.add("slipbox-local-branch-gap");
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("data-focus-id", `gap:${id}`);
    group.setAttribute("aria-label", `Show ${count} omitted cards`);
    const hit = this.svg("rect");
    hit.setAttribute("x", String(x - 27));
    hit.setAttribute("y", String(y - 15));
    hit.setAttribute("width", "54");
    hit.setAttribute("height", "30");
    hit.setAttribute("rx", "8");
    const countText = this.svg("text");
    countText.classList.add("slipbox-local-branch-gap-count");
    countText.setAttribute("x", String(x));
    countText.setAttribute("y", String(y - 5));
    countText.textContent = String(count);
    const ellipsis = this.svg("text");
    ellipsis.classList.add("slipbox-local-branch-gap-ellipsis");
    ellipsis.setAttribute("x", String(x));
    ellipsis.setAttribute("y", String(y + 12));
    ellipsis.textContent = "…";
    group.append(hit, countText, ellipsis);
    this.activateOnClickOrKeyboard(group, () => {
      this.options.expandGap(id);
    });
    parent.append(group);
  }

  private activateOnClickOrKeyboard(
    target: SVGElement,
    action: () => void,
  ): void {
    target.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.options.runAfterEditing("local-branch-graph", action);
    });
    target.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.options.runAfterEditing("local-branch-graph", action);
    });
  }

  private findNode(
    layout: LocalBranchLayout,
    path: string,
    role: LocalBranchLayoutStrand["strand"]["role"],
    strandId?: string,
  ): LocalBranchLayoutNode | null {
    for (const row of layout.strands) {
      if (
        row.strand.role !== role ||
        (strandId !== undefined && row.strand.id !== strandId)
      ) {
        continue;
      }
      const item = row.items.find(
        (candidate): candidate is LocalBranchLayoutNode =>
          candidate.kind === "node" && candidate.node.path === path,
      );
      if (item !== undefined) {
        return item;
      }
    }
    return null;
  }

  private appendTitle(parent: SVGElement, label: string): void {
    if (!this.options.showTooltips) {
      return;
    }
    const title = this.svg("title");
    title.textContent = label;
    parent.append(title);
  }

  private svg<K extends keyof SVGElementTagNameMap>(
    name: K,
  ): SVGElementTagNameMap[K] {
    return localBranchDomWindow(this.activeDocument).createSvg(name);
  }
}

function truncateEnd(value: string, length: number): string {
  const characters = Array.from(value);
  return characters.length <= length
    ? value
    : `${characters.slice(0, Math.max(1, length - 1)).join("")}…`;
}

function truncateBeginning(value: string, length: number): string {
  const characters = Array.from(value);
  return characters.length <= length
    ? value
    : `…${characters.slice(-Math.max(1, length - 1)).join("")}`;
}

function wrapNodeLabel(value: string): readonly string[] {
  const visible = truncateBeginning(
    value,
    NODE_LABEL_MAX_LINE_CHARACTERS * NODE_LABEL_MAX_LINES,
  );
  const characters = Array.from(visible);
  if (characters.length <= NODE_LABEL_MAX_LINE_CHARACTERS) {
    return [visible];
  }

  const minimumBreak = characters.length - NODE_LABEL_MAX_LINE_CHARACTERS;
  const maximumBreak = NODE_LABEL_MAX_LINE_CHARACTERS;
  const midpoint = characters.length / 2;
  const naturalBreak = characters
    .map((character, index) => ({ character, index: index + 1 }))
    .filter(({ character, index }) =>
      (character === "," || character === "/") &&
      index >= minimumBreak && index <= maximumBreak
    )
    .sort((left, right) =>
      Math.abs(left.index - midpoint) - Math.abs(right.index - midpoint)
    )[0]?.index;
  const breakAt = naturalBreak ?? Math.ceil(midpoint);

  return [
    characters.slice(0, breakAt).join(""),
    characters.slice(breakAt).join(""),
  ];
}
