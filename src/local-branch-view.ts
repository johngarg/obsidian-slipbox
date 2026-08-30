import { renderLocalBranchSvg } from "./local-branch-svg.js";
import { localBranchDomWindow } from "./local-branch-dom.js";
import type {
  LocalBranchDeparture,
  LocalBranchModel,
  LocalBranchMovement,
  LocalBranchNavigationGroup,
  LocalBranchTarget,
} from "./local-branch-types.js";

export interface LocalBranchViewEnvironment {
  readonly activeDocument: Document;
  readonly showView: () => boolean;
  readonly showTooltips: () => boolean;
  readonly previewLinksOnHover: () => boolean;
  readonly modelForPath: (
    path: string,
    expandedDepartureId: string | null,
  ) => LocalBranchModel | null;
  readonly chooseDeparture: (
    departures: readonly LocalBranchDeparture[],
  ) => Promise<LocalBranchDeparture | null>;
  readonly activate: (targets: readonly LocalBranchTarget[]) => void | Promise<void>;
  readonly preview: (
    event: MouseEvent,
    target: HTMLElement | SVGElement,
    destination: LocalBranchTarget,
    sourcePath: string,
  ) => void;
  readonly runAfterEditing: (
    reason: string,
    action: () => void | Promise<void>,
  ) => void;
}

const DEFAULT_WIDTH = 720;
const MAX_WIDTH = 900;
const STAGE_INSET = 48;

export function localBranchTrayWidth(
  ownerWidth: number,
  stageWidth: number,
): number {
  const cardWidth = ownerWidth > 0 ? ownerWidth : DEFAULT_WIDTH;
  return stageWidth > 0
    ? Math.max(cardWidth, Math.min(MAX_WIDTH, stageWidth - STAGE_INSET))
    : cardWidth;
}

const MOVEMENTS: readonly {
  readonly movement: LocalBranchMovement;
  readonly label: string;
  readonly icon: readonly string[];
}[] = [
  {
    movement: "backward",
    label: "Move backward on current strand",
    icon: ["M17 6H8", "M11 3 8 6l3 3", "M8 6v12"],
  },
  {
    movement: "forward",
    label: "Move forward on current strand",
    icon: ["M7 6h9", "m13 3 3 3-3 3", "M16 6v12"],
  },
  {
    movement: "beginning",
    label: "Move to beginning of current strand",
    icon: ["M6 4v16", "M18 12H7", "m11 7-5 5 5 5"],
  },
  {
    movement: "inferred",
    label: "Enter address-inferred inserted strand",
    icon: ["M5 5v5c0 2 2 3 4 3h10", "m15 9 4 4-4 4"],
  },
  {
    movement: "explicit",
    label: "Enter explicit supplementary strand",
    icon: ["M5 6h6c2 0 3 2 3 4v8", "m10 15 4 3 4-3", "M18 6v6"],
  },
  {
    movement: "higher",
    label: "Move to higher strand",
    icon: ["M5 18h5c2 0 3-2 3-4V5", "m9 8 4-3 4 3"],
  },
];

/** Owns one stable, transferable Branch View for a Deck view. */
export class LocalBranchViewController {
  private readonly root: HTMLElement;
  private owner: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private path: string | null = null;
  private model: LocalBranchModel | null = null;
  private collapsed = false;
  private expandedGapIds = new Set<string>();
  private expandedDepartureId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastWidth = 0;

  constructor(private readonly environment: LocalBranchViewEnvironment) {
    this.root = localBranchDomWindow(environment.activeDocument)
      .createEl("section");
    this.root.className = "slipbox-local-branch-view";
    this.root.setAttribute("aria-label", "Local branch view");
  }

  attach(owner: HTMLElement, path: string, stage: HTMLElement): void {
    const activeChanged = path !== this.path;
    const ownerChanged = owner !== this.owner;
    const stageChanged = stage !== this.stage;
    if (activeChanged) {
      this.expandedGapIds.clear();
      this.expandedDepartureId = null;
    }
    if (ownerChanged || stageChanged) {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
    }
    this.owner = owner;
    this.stage = stage;
    this.path = path;
    if (this.root.parentElement !== owner) {
      owner.append(this.root);
    }
    this.observe(owner, stage);
    this.refresh();
  }

  detach(): void {
    this.owner = null;
    this.stage = null;
    this.path = null;
    this.model = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.root.remove();
  }

  disconnect(): void {
    this.detach();
    this.expandedGapIds.clear();
    this.expandedDepartureId = null;
    this.root.replaceChildren();
  }

  refresh(): void {
    this.expandedGapIds.clear();
    const owner = this.owner;
    const path = this.path;
    if (owner === null || path === null || !this.environment.showView()) {
      this.hide();
      return;
    }
    let model = this.environment.modelForPath(
      path,
      this.expandedDepartureId,
    );
    if (model === null) {
      this.hide();
      return;
    }
    if (
      this.expandedDepartureId !== null &&
      model.expandedDepartureId !== this.expandedDepartureId
    ) {
      this.expandedDepartureId = null;
    }
    this.model = model;
    this.root.hidden = false;
    this.render(model);
  }

  private hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.model = null;
  }

  private observe(owner: HTMLElement, stage: HTMLElement): void {
    if (this.resizeObserver !== null) {
      return;
    }
    const ownerWindow = owner.ownerDocument.defaultView;
    if (ownerWindow === null || ownerWindow.ResizeObserver === undefined) {
      return;
    }
    this.resizeObserver = new ownerWindow.ResizeObserver(() => {
      const width = this.availableWidth();
      if (Math.abs(width - this.lastWidth) < 1) {
        return;
      }
      this.lastWidth = width;
      this.expandedGapIds.clear();
      if (this.model !== null) {
        this.render(this.model);
      }
    });
    this.resizeObserver.observe(owner);
    this.resizeObserver.observe(stage);
  }

  private render(model: LocalBranchModel): void {
    const focusedId = this.focusedControlId();
    this.root.style.width = `${this.availableWidth()}px`;
    this.root.replaceChildren();
    const header = element(this.root, "div", "slipbox-local-branch-header");
    this.renderToolbar(header, model);
    this.renderCollapseControl(header, model);
    if (!this.collapsed) {
      this.renderGraph(model);
    }
    this.restoreFocus(focusedId);
  }

  private renderCollapseControl(
    header: HTMLElement,
    model: LocalBranchModel,
  ): void {
    const collapse = element(
      header,
      "button",
      "clickable-icon slipbox-local-branch-collapse",
    );
    collapse.type = "button";
    collapse.dataset.focusId = "collapse";
    collapse.setAttribute("aria-expanded", String(!this.collapsed));
    this.labelControl(
      collapse,
      this.collapsed ? "Expand local branch view" : "Collapse local branch view",
    );
    collapse.append(iconSvg(this.root.ownerDocument, this.collapsed
      ? ["m7 10 5 5 5-5"]
      : ["m7 14 5-5 5 5"]));
    collapse.addEventListener("click", () => {
      this.collapsed = !this.collapsed;
      this.expandedGapIds.clear();
      this.render(model);
    });
  }

  private renderToolbar(parent: HTMLElement, model: LocalBranchModel): void {
    const toolbar = element(parent, "div", "slipbox-local-branch-toolbar");
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Branch navigation");
    for (const definition of MOVEMENTS) {
      const slot = element(toolbar, "div", "slipbox-local-branch-control-slot");
      slot.dataset.movement = definition.movement;
      const groups = model.navigation[definition.movement];
      if (groups.length === 0) {
        slot.append(this.navigationButton(definition));
      } else {
        for (const group of groups) {
          slot.append(this.navigationButton(definition, group));
        }
      }
    }
  }

  private navigationButton(
    definition: typeof MOVEMENTS[number],
    group?: LocalBranchNavigationGroup,
  ): HTMLButtonElement {
    const button = localBranchDomWindow(this.root.ownerDocument)
      .createEl("button");
    button.className = "clickable-icon slipbox-local-branch-control";
    button.type = "button";
    button.disabled = group === undefined || group.targets.length === 0;
    button.dataset.focusId = group?.id ?? `${definition.movement}:disabled`;
    this.labelControl(button, group?.label ?? definition.label);
    button.append(iconSvg(this.root.ownerDocument, definition.icon));
    if (group !== undefined) {
      button.addEventListener("click", () => this.activateGroup(group));
    }
    return button;
  }

  private renderGraph(model: LocalBranchModel): void {
    renderLocalBranchSvg({
      parent: this.root,
      model,
      width: this.availableWidth(),
      expandedGapIds: this.expandedGapIds,
      expandedDepartureId: this.expandedDepartureId,
      showTooltips: this.environment.showTooltips(),
      previewLinksOnHover: this.environment.previewLinksOnHover(),
      activate: (targets) => this.environment.activate(targets),
      preview: (event, target, destination, sourcePath) => {
        this.environment.preview(event, target, destination, sourcePath);
      },
      runAfterEditing: (reason, action) => {
        this.environment.runAfterEditing(reason, action);
      },
      expandGap: (id) => {
        this.expandedGapIds = new Set([id]);
        this.render(model);
      },
      toggleDeparture: (departures) => this.toggleDeparture(departures),
    });
  }

  private async toggleDeparture(
    departures: readonly LocalBranchDeparture[],
  ): Promise<void> {
    const expanded = departures.find((departure) =>
      this.expandedDepartureId === departure.id
    );
    if (expanded !== undefined) {
      this.expandedDepartureId = null;
      this.refresh();
      return;
    }
    const departure = departures.length === 1
      ? departures[0] ?? null
      : await this.environment.chooseDeparture(departures);
    if (departure === null) {
      return;
    }
    this.expandedGapIds.clear();
    this.expandedDepartureId = departure.id;
    this.refresh();
  }

  private activateGroup(group: LocalBranchNavigationGroup): void {
    this.environment.runAfterEditing(`local-branch:${group.movement}`, () =>
      this.environment.activate(group.targets)
    );
  }

  private availableWidth(): number {
    const owner = this.owner;
    if (owner === null) {
      return DEFAULT_WIDTH;
    }
    const ownerWidth = owner.offsetWidth || owner.clientWidth;
    const stage = this.stage;
    const stageWidth = stage === null
      ? 0
      : stage.clientWidth || stage.offsetWidth;
    return localBranchTrayWidth(ownerWidth, stageWidth);
  }

  private labelControl(control: HTMLElement, label: string): void {
    control.setAttribute("aria-label", label);
    if (this.environment.showTooltips()) {
      control.setAttribute("title", label);
      control.setAttribute("data-tooltip-position", "bottom");
    }
  }

  private focusedControlId(): string | null {
    const active = this.root.ownerDocument.activeElement;
    return active !== null && this.root.contains(active)
      ? active.getAttribute("data-focus-id")
      : null;
  }

  private restoreFocus(id: string | null): void {
    if (id === null) {
      return;
    }
    const controls = this.root.querySelectorAll<HTMLElement>("[data-focus-id]");
    for (let index = 0; index < controls.length; index += 1) {
      const control = controls.item(index);
      if (control.dataset.focusId === id) {
        control.focus();
        return;
      }
    }
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  name: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const result = localBranchDomWindow(parent.ownerDocument).createEl(name);
  result.className = className;
  parent.append(result);
  return result;
}

function iconSvg(document: Document, paths: readonly string[]): SVGSVGElement {
  const svg = localBranchDomWindow(document).createSvg("svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const definition of paths) {
    const path = localBranchDomWindow(document).createSvg("path");
    path.setAttribute("d", definition);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  }
  return svg;
}
