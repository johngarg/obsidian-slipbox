import { renderLocalBranchSvg } from "./local-branch-svg.js";
import { localBranchDomWindow } from "./local-branch-dom.js";
import { setCardTooltip } from "./card-tooltip.js";
import {
  preventPointerActivatedButtonFocus,
  releasePointerActivatedButtonFocus,
} from "./pointer-button-focus.js";
import type {
  LocalBranchDeparture,
  LocalBranchModel,
  LocalBranchMovement,
  LocalBranchTarget,
} from "./local-branch-types.js";

export interface LocalBranchViewEnvironment {
  readonly activeDocument: Document;
  readonly canShowView: () => boolean;
  readonly showViewByDefault: () => boolean;
  readonly showTooltips: () => boolean;
  readonly previewLinksOnHover: () => boolean;
  readonly setIcon: (control: HTMLElement, icon: string) => void;
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
let accessibleLabelSequence = 0;

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
  readonly icon: string;
}[] = [
  {
    movement: "backward",
    label: "Move backward on current strand",
    icon: "arrow-left",
  },
  {
    movement: "forward",
    label: "Move forward on current strand",
    icon: "arrow-right",
  },
  {
    movement: "beginning",
    label: "Move to beginning of current strand",
    icon: "chevrons-left",
  },
  {
    movement: "inferred",
    label: "Enter inserted strand",
    icon: "git-fork",
  },
  {
    movement: "explicit",
    label: "Enter supplementary strand",
    icon: "corner-down-right",
  },
  {
    movement: "higher",
    label: "Move to higher strand",
    icon: "corner-up-left",
  },
];

/** Owns one stable, transferable Branch View for a Deck view. */
export class LocalBranchViewController {
  private readonly root: HTMLElement;
  private readonly rootLabel: HTMLElement;
  private owner: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private path: string | null = null;
  private model: LocalBranchModel | null = null;
  private visibilityOverride: boolean | null = null;
  private expandedGapIds = new Set<string>();
  private expandedDepartureId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastWidth = 0;

  constructor(private readonly environment: LocalBranchViewEnvironment) {
    this.root = localBranchDomWindow(environment.activeDocument)
      .createEl("section");
    this.root.className = "slipbox-local-branch-view";
    this.rootLabel = appendHiddenLabel(this.root, "Local branch view");
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

  toggleVisibility(): void {
    if (!this.environment.canShowView()) {
      return;
    }
    this.visibilityOverride = !this.isViewVisible();
    this.expandedGapIds.clear();
    this.refresh();
  }

  refresh(): void {
    this.expandedGapIds.clear();
    const owner = this.owner;
    const path = this.path;
    if (owner === null || path === null || !this.environment.canShowView()) {
      this.hide();
      return;
    }
    this.root.hidden = false;
    if (!this.isViewVisible()) {
      this.model = null;
      this.render(null);
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
    this.render(model);
  }

  private hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren(this.rootLabel);
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
      this.render(this.model);
    });
    this.resizeObserver.observe(owner);
    this.resizeObserver.observe(stage);
  }

  private render(
    model: LocalBranchModel | null,
    preservedScrollLeft: number | null = null,
  ): void {
    const focusedId = this.focusedControlId();
    const width = this.availableWidth();
    this.root.style.width = `${width}px`;
    this.root.replaceChildren(this.rootLabel);
    const header = element(this.root, "div", "slipbox-local-branch-header");
    header.style.right = `${Math.max(0, (width - this.ownerWidth()) / 2)}px`;
    if (model !== null && this.isViewVisible()) {
      this.renderToolbar(header, model);
    }
    this.renderVisibilityControl(header);
    if (model !== null && this.isViewVisible()) {
      this.renderGraph(model);
    }
    this.restoreFocus(focusedId);
    if (preservedScrollLeft !== null) {
      const scroller = this.root.querySelector<HTMLElement>(
        ".slipbox-local-branch-scroller",
      );
      if (scroller !== null) {
        scroller.scrollLeft = preservedScrollLeft;
      }
    }
  }

  private renderVisibilityControl(header: HTMLElement): void {
    const visible = this.isViewVisible();
    const toggle = element(
      header,
      "button",
      "clickable-icon slipbox-local-branch-toggle",
    );
    toggle.type = "button";
    toggle.dataset.focusId = "toggle-visibility";
    toggle.setAttribute("aria-expanded", String(visible));
    toggle.setAttribute("aria-pressed", String(visible));
    toggle.classList.toggle("is-pressed", visible);
    this.labelControl(
      toggle,
      visible ? "Hide local Branch View" : "Show local Branch View",
    );
    this.environment.setIcon(toggle, "git-branch");
    this.configureButton(toggle, () => this.toggleVisibility());
  }

  private renderToolbar(parent: HTMLElement, model: LocalBranchModel): void {
    const toolbar = element(parent, "div", "slipbox-local-branch-toolbar");
    toolbar.setAttribute("role", "toolbar");
    appendHiddenLabel(toolbar, "Branch navigation");
    for (const definition of MOVEMENTS) {
      const slot = element(toolbar, "div", "slipbox-local-branch-control-slot");
      slot.dataset.movement = definition.movement;
      slot.append(this.navigationButton(definition, model));
    }
  }

  private navigationButton(
    definition: typeof MOVEMENTS[number],
    model: LocalBranchModel,
  ): HTMLButtonElement {
    const targets = uniqueTargets(
      model.navigation[definition.movement]
        .flatMap((group) => group.targets),
    );
    const button = localBranchDomWindow(this.root.ownerDocument)
      .createEl("button");
    button.className = "clickable-icon slipbox-local-branch-control";
    button.type = "button";
    button.disabled = targets.length === 0;
    button.dataset.focusId = `movement:${definition.movement}`;
    this.labelControl(button, definition.label);
    this.environment.setIcon(button, definition.icon);
    if (targets.length > 0) {
      this.configureButton(button, () =>
        this.activateMovement(definition.movement, targets));
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
        const scrollLeft = this.root.querySelector<HTMLElement>(
          ".slipbox-local-branch-scroller",
        )?.scrollLeft ?? 0;
        this.expandedGapIds = new Set([id]);
        this.render(model, scrollLeft);
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

  private activateMovement(
    movement: LocalBranchMovement,
    targets: readonly LocalBranchTarget[],
  ): void {
    this.environment.runAfterEditing(`local-branch:${movement}`, () =>
      this.environment.activate(targets)
    );
  }

  private configureButton(button: HTMLButtonElement, action: () => void): void {
    button.addEventListener("pointerdown", (event) =>
      preventPointerActivatedButtonFocus(event));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
      releasePointerActivatedButtonFocus(button, event);
    });
  }

  private isViewVisible(): boolean {
    return this.environment.canShowView() &&
      (this.visibilityOverride ?? this.environment.showViewByDefault());
  }

  private ownerWidth(): number {
    const owner = this.owner;
    if (owner === null) {
      return DEFAULT_WIDTH;
    }
    return owner.offsetWidth || owner.clientWidth || DEFAULT_WIDTH;
  }

  private availableWidth(): number {
    const ownerWidth = this.ownerWidth();
    const stage = this.stage;
    const stageWidth = stage === null
      ? 0
      : stage.clientWidth || stage.offsetWidth;
    return localBranchTrayWidth(ownerWidth, stageWidth);
  }

  private labelControl(control: HTMLElement, label: string): void {
    setCardTooltip(control, label, this.environment.showTooltips(), {
      placement: "bottom",
    });
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

function uniqueTargets(
  targets: readonly LocalBranchTarget[],
): readonly LocalBranchTarget[] {
  return [...new Map(targets.map((target) => [target.path, target])).values()];
}

function appendHiddenLabel(parent: HTMLElement, label: string): HTMLElement {
  const hidden = element(parent, "span", "slipbox-visually-hidden");
  hidden.id = `slipbox-local-branch-label-${++accessibleLabelSequence}`;
  hidden.textContent = label;
  parent.setAttribute("aria-labelledby", hidden.id);
  return hidden;
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
