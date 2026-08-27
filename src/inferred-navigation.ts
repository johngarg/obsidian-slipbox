import type {
  InferredNavigationRelations,
  InferredNavigationTarget,
} from "./card-index.js";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const DEFAULT_OPEN_DELAY_MS = 180;
const DEFAULT_CLOSE_DELAY_MS = 220;
const MENU_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 8;

type InferredNavigationSide = "left" | "right";
type InferredNavigationRelation =
  | "parent"
  | "previous-sibling"
  | "next-sibling"
  | "child";

interface InferredNavigationRow {
  readonly relation: InferredNavigationRelation;
  readonly target: InferredNavigationTarget;
}

export interface InferredNavigationEnvironment {
  readonly showNavigation: () => boolean;
  readonly previewLinksOnHover: () => boolean;
  readonly relationsForPath: (path: string) => InferredNavigationRelations;
  readonly preview: (
    event: MouseEvent,
    target: HTMLElement,
    destination: InferredNavigationTarget,
    sourcePath: string,
  ) => void;
  readonly activate: (destination: InferredNavigationTarget) => void | Promise<void>;
  readonly runAfterEditing: (
    reason: string,
    action: () => void | Promise<void>,
  ) => void;
  readonly openDelayMs?: number;
  readonly closeDelayMs?: number;
}

export interface InferredNavigationRenderOptions {
  readonly path: string;
  readonly interactive: boolean;
  readonly mount?: HTMLElement;
}

interface RenderedInferredNavigation {
  readonly owner: HTMLElement;
  readonly root: HTMLDivElement;
  readonly path: string;
  interactive: boolean;
  relations: InferredNavigationRelations;
}

interface OpenInferredNavigationMenu {
  readonly entry: RenderedInferredNavigation;
  readonly side: InferredNavigationSide;
  readonly trigger: HTMLButtonElement;
  readonly menu: HTMLDivElement;
  readonly rows: readonly HTMLButtonElement[];
  pinned: boolean;
  readonly handleOutsidePointer: (event: PointerEvent) => void;
  readonly handleViewportChange: () => void;
}

const activeManagerByDocument = new WeakMap<Document, InferredNavigationManager>();

/** Attach inferred parent/sibling/child controls without replacing card DOM. */
export class InferredNavigationManager {
  private readonly entries = new Set<RenderedInferredNavigation>();
  private readonly entriesByOwner = new Map<HTMLElement, RenderedInferredNavigation>();
  private openState: OpenInferredNavigationMenu | null = null;
  private openTimer: number | null = null;
  private closeTimer: number | null = null;

  constructor(private readonly environment: InferredNavigationEnvironment) {}

  render(
    owner: HTMLElement,
    options: InferredNavigationRenderOptions,
  ): HTMLDivElement {
    const root = createHtmlElement(owner.ownerDocument, "div");
    root.className = "slipbox-inferred-navigation";
    root.setAttribute("aria-label", "Inferred branch navigation");
    (options.mount ?? owner).append(root);
    const entry: RenderedInferredNavigation = {
      owner,
      root,
      path: options.path,
      interactive: options.interactive,
      relations: this.environment.relationsForPath(options.path),
    };
    this.entries.add(entry);
    this.entriesByOwner.set(owner, entry);
    this.renderEntry(entry);
    return root;
  }

  /** Refresh relation snapshots and controls in place after an index or setting change. */
  refresh(): void {
    for (const entry of this.entries) {
      entry.relations = this.environment.relationsForPath(entry.path);
      this.renderEntry(entry);
    }
  }

  setInteractive(owner: HTMLElement, interactive: boolean): void {
    const entry = this.entriesByOwner.get(owner);
    if (entry === undefined || entry.interactive === interactive) {
      return;
    }
    entry.interactive = interactive;
    this.renderEntry(entry);
  }

  clear(): void {
    this.clearTimers();
    this.closeMenu();
    for (const entry of this.entries) {
      entry.root.remove();
    }
    this.entries.clear();
    this.entriesByOwner.clear();
  }

  private renderEntry(entry: RenderedInferredNavigation): void {
    this.cancelOpenTimer();
    if (this.openState?.entry === entry) {
      this.closeMenu();
    }
    entry.root.replaceChildren();
    entry.root.hidden = !this.environment.showNavigation() || !entry.interactive;
    if (entry.root.hidden) {
      return;
    }
    const leftRows = menuRows(entry.relations, "left");
    const rightRows = menuRows(entry.relations, "right");
    this.createArrow(entry, "left", leftRows.length > 0);
    this.createArrow(entry, "right", rightRows.length > 0);
  }

  private createArrow(
    entry: RenderedInferredNavigation,
    side: InferredNavigationSide,
    enabled: boolean,
  ): void {
    const label = side === "left"
      ? "Show inferred parent and preceding siblings"
      : "Show following siblings and inferred children";
    const button = createHtmlElement(entry.root.ownerDocument, "button");
    button.type = "button";
    button.className = `slipbox-inferred-navigation-arrow is-${side}`;
    button.textContent = side === "left" ? "←" : "→";
    button.disabled = !enabled;
    button.setAttribute("aria-label", label);
    button.title = label;
    entry.root.append(button);

    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("pointerenter", () => {
      this.cancelCloseTimer();
      if (!enabled || this.isOpen(entry, side)) {
        return;
      }
      this.cancelOpenTimer();
      this.openTimer = button.ownerDocument.defaultView?.setTimeout(() => {
        this.openTimer = null;
        this.openMenu(entry, side, button, false, false);
      }, this.environment.openDelayMs ?? DEFAULT_OPEN_DELAY_MS) ?? null;
    });
    button.addEventListener("pointerleave", () => {
      this.cancelOpenTimer();
      if (this.isOpen(entry, side) && this.openState?.pinned === false) {
        this.scheduleClose();
      }
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!enabled) {
        return;
      }
      if (this.isOpen(entry, side)) {
        if (this.openState?.pinned === true) {
          this.closeMenu();
        } else if (this.openState !== null) {
          this.openState.pinned = true;
          this.cancelCloseTimer();
        }
        return;
      }
      this.openMenu(entry, side, button, true, false);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen(entry, side)) {
        event.preventDefault();
        event.stopPropagation();
        this.closeMenu(true);
        return;
      }
      if (
        !enabled ||
        (event.key !== "Enter" && event.key !== " " && event.key !== "ArrowDown")
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.openMenu(entry, side, button, true, true);
    });
  }

  private openMenu(
    entry: RenderedInferredNavigation,
    side: InferredNavigationSide,
    trigger: HTMLButtonElement,
    pinned: boolean,
    focusFirst: boolean,
  ): void {
    this.clearTimers();
    const rows = menuRows(entry.relations, side);
    if (rows.length === 0 || !entry.interactive || !this.environment.showNavigation()) {
      return;
    }
    const document = trigger.ownerDocument;
    const activeManager = activeManagerByDocument.get(document);
    if (activeManager !== undefined && activeManager !== this) {
      activeManager.closeMenu();
    }
    this.closeMenu();

    const menu = createHtmlElement(document, "div");
    menu.className = `menu slipbox-inferred-navigation-menu is-${side}`;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", trigger.getAttribute("aria-label") ?? "");
    const buttons: HTMLButtonElement[] = [];
    const firstGroupLength = side === "left"
      ? (entry.relations.parent === undefined ? 0 : 1)
      : Math.min(1, entry.relations.nextSiblings.length);
    const secondGroupLength = side === "left"
      ? Math.min(1, entry.relations.previousSiblings.length)
      : entry.relations.children.length;
    rows.forEach((row, index) => {
      if (index === firstGroupLength && firstGroupLength > 0 && secondGroupLength > 0) {
        const separator = createHtmlElement(document, "div");
        separator.className = "menu-separator slipbox-inferred-navigation-gap";
        separator.setAttribute("role", "separator");
        menu.append(separator);
      }
      const button = this.createMenuRow(entry, row);
      menu.append(button);
      buttons.push(button);
    });
    document.body.append(menu);

    const handleOutsidePointer = (event: PointerEvent): void => {
      const target = event.target;
      const node = target as Node | null;
      if (
        node !== null &&
        (menu.contains(node) || trigger.contains(node))
      ) {
        return;
      }
      this.closeMenu();
    };
    const handleViewportChange = (): void => {
      if (this.openState?.menu === menu) {
        positionMenu(menu, trigger, side);
      }
    };
    this.openState = {
      entry,
      side,
      trigger,
      menu,
      rows: buttons,
      pinned,
      handleOutsidePointer,
      handleViewportChange,
    };
    activeManagerByDocument.set(document, this);
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    document.defaultView?.addEventListener("resize", handleViewportChange);
    document.addEventListener("scroll", handleViewportChange, true);
    menu.addEventListener("pointerenter", () => this.cancelCloseTimer());
    menu.addEventListener("pointerleave", () => {
      if (this.openState?.menu === menu && !this.openState.pinned) {
        this.scheduleClose();
      }
    });
    menu.addEventListener("keydown", (event) => {
      this.handleMenuKeydown(event, buttons);
    });
    positionMenu(menu, trigger, side);
    if (focusFirst) {
      buttons[0]?.focus();
    }
  }

  private createMenuRow(
    entry: RenderedInferredNavigation,
    row: InferredNavigationRow,
  ): HTMLButtonElement {
    const button = createHtmlElement(entry.root.ownerDocument, "button");
    button.type = "button";
    button.className = "menu-item slipbox-inferred-navigation-item";
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-label", accessibleRowLabel(row));
    const address = createHtmlElement(button.ownerDocument, "span");
    address.className = "slipbox-inferred-navigation-address";
    address.textContent = row.target.address;
    button.append(address);
    if (row.target.childCount > 0) {
      const count = createHtmlElement(button.ownerDocument, "span");
      count.className = "slipbox-inferred-navigation-child-count";
      count.textContent = `› ${row.target.childCount}`;
      count.setAttribute("aria-hidden", "true");
      button.append(count);
    }
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("mouseover", (event) => {
      if (!this.environment.previewLinksOnHover()) {
        return;
      }
      this.environment.preview(event, button, row.target, entry.path);
    });
    const activate = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu(true);
      this.environment.runAfterEditing("inferred-navigation", () =>
        this.environment.activate(row.target)
      );
    };
    button.addEventListener("click", activate);
    button.addEventListener("auxclick", (event) => {
      if (event.button === 1) {
        activate(event);
      }
    });
    return button;
  }

  private handleMenuKeydown(
    event: KeyboardEvent,
    rows: readonly HTMLButtonElement[],
  ): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu(true);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const currentIndex = rows.findIndex((row) => row === event.target);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? rows.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + rows.length) % rows.length
          : (currentIndex - 1 + rows.length) % rows.length;
    rows[nextIndex]?.focus();
  }

  private isOpen(
    entry: RenderedInferredNavigation,
    side: InferredNavigationSide,
  ): boolean {
    return this.openState?.entry === entry && this.openState.side === side;
  }

  private scheduleClose(): void {
    this.cancelCloseTimer();
    const ownerWindow = this.openState?.menu.ownerDocument.defaultView;
    this.closeTimer = ownerWindow?.setTimeout(() => {
      this.closeTimer = null;
      if (this.openState?.pinned === false) {
        this.closeMenu();
      }
    }, this.environment.closeDelayMs ?? DEFAULT_CLOSE_DELAY_MS) ?? null;
  }

  private closeMenu(returnFocus = false): void {
    const state = this.openState;
    if (state === null) {
      return;
    }
    this.cancelCloseTimer();
    this.openState = null;
    const document = state.menu.ownerDocument;
    document.removeEventListener("pointerdown", state.handleOutsidePointer, true);
    document.defaultView?.removeEventListener("resize", state.handleViewportChange);
    document.removeEventListener("scroll", state.handleViewportChange, true);
    state.menu.remove();
    if (activeManagerByDocument.get(document) === this) {
      activeManagerByDocument.delete(document);
    }
    if (returnFocus && state.trigger.isConnected) {
      state.trigger.focus();
    }
  }

  private clearTimers(): void {
    this.cancelOpenTimer();
    this.cancelCloseTimer();
  }

  private cancelOpenTimer(): void {
    if (this.openTimer === null) {
      return;
    }
    const ownerWindow = this.entries.values().next().value?.root.ownerDocument.defaultView;
    ownerWindow?.clearTimeout(this.openTimer);
    this.openTimer = null;
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer === null) {
      return;
    }
    const ownerWindow = this.openState?.menu.ownerDocument.defaultView;
    ownerWindow?.clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }
}

function menuRows(
  relations: InferredNavigationRelations,
  side: InferredNavigationSide,
): readonly InferredNavigationRow[] {
  if (side === "left") {
    return [
      ...(relations.parent === undefined
        ? []
        : [{ relation: "parent" as const, target: relations.parent }]),
      ...relations.previousSiblings.slice(0, 1).map((target) => ({
        relation: "previous-sibling" as const,
        target,
      })),
    ];
  }
  return [
    ...relations.nextSiblings.slice(0, 1).map((target) => ({
      relation: "next-sibling" as const,
      target,
    })),
    ...relations.children.map((target) => ({
      relation: "child" as const,
      target,
    })),
  ];
}

function accessibleRowLabel(row: InferredNavigationRow): string {
  const relation = row.relation === "parent"
    ? "Inferred parent"
    : row.relation === "previous-sibling"
      ? "Previous inferred sibling"
      : row.relation === "next-sibling"
        ? "Next inferred sibling"
        : "Inferred child";
  const children = row.target.childCount === 0
    ? ""
    : row.target.childCount === 1
      ? ", one child"
      : `, ${row.target.childCount} children`;
  return `${relation} ${row.target.address}${children}`;
}

function positionMenu(
  menu: HTMLElement,
  trigger: HTMLElement,
  side: InferredNavigationSide,
): void {
  const ownerWindow = menu.ownerDocument.defaultView;
  if (ownerWindow === null) {
    return;
  }
  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const width = menuRect.width || 240;
  const height = menuRect.height || Math.min(320, menu.scrollHeight || 240);
  const viewportWidth = ownerWindow.innerWidth;
  const viewportHeight = ownerWindow.innerHeight;
  const preferredLeft = side === "left"
    ? triggerRect.left
    : triggerRect.right - width;
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN_PX, preferredLeft),
    Math.max(VIEWPORT_MARGIN_PX, viewportWidth - width - VIEWPORT_MARGIN_PX),
  );
  const below = triggerRect.bottom + MENU_GAP_PX;
  const above = triggerRect.top - height - MENU_GAP_PX;
  const top = below + height <= viewportHeight - VIEWPORT_MARGIN_PX
    ? below
    : Math.max(VIEWPORT_MARGIN_PX, above);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function createHtmlElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tagName: K,
): HTMLElementTagNameMap[K] {
  return document.createElementNS(
    HTML_NAMESPACE,
    tagName,
  ) as HTMLElementTagNameMap[K];
}
