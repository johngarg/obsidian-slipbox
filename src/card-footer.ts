import {
  Keymap,
  Menu,
  type App,
  type TFile,
  type WorkspaceLeaf,
} from "obsidian";

import { fitMeasuredBacklinkPrefix } from "./backlinks.js";
import { setCardTooltip } from "./card-tooltip.js";
import { trayToggleLabel } from "./deck-actions.js";
import type { FiledCard } from "./card-index.js";
import {
  applyOwnedLinkAccessibility,
  renderedLinkPolicy,
} from "./rendered-link-interactions.js";
import type { SlipboxAction } from "./settings.js";

export interface CardFooterEnvironment {
  readonly app: App;
  readonly leaf: WorkspaceLeaf;
  readonly hoverSource: string;
  readonly previewLinksOnHover: () => boolean;
  readonly followLinksFromCards: () => boolean;
  readonly showTooltips: () => boolean;
  readonly isInTray: (file: TFile) => boolean;
  readonly runAction: (action: SlipboxAction, target: FiledCard) => boolean;
  readonly runAfterEditing: (
    reason: string,
    action: () => void | Promise<void>,
  ) => void;
}

export interface CardFooterRenderOptions {
  readonly sourcePath: string;
  readonly backlinks: readonly FiledCard[];
  readonly interactive: boolean;
  readonly activate: (backlink: FiledCard) => void | Promise<void>;
}

interface RenderedFooter {
  readonly sourcePath: string;
  backlinks: readonly FiledCard[];
  readonly activate: (backlink: FiledCard) => void | Promise<void>;
  readonly footer: HTMLElement;
  content: HTMLElement | null;
  measureItems: readonly HTMLElement[];
  measureSeparator: HTMLElement | null;
  measureOverflow: HTMLElement | null;
  interactive: boolean;
  fitKey: string | null;
}

const BACKLINK_MEASUREMENT_LIMIT = 64;

type ResizeObserverWindow = Window & {
  readonly ResizeObserver: typeof ResizeObserver;
};

/** Shared, view-agnostic renderer for the fixed card backlink footer. */
export class CardFooterManager {
  private readonly entries = new Set<RenderedFooter>();
  private readonly entriesByFooter = new Map<HTMLElement, RenderedFooter>();
  private resizeObserver: ResizeObserver | null = null;
  private ownerWindow: ResizeObserverWindow | null = null;
  private layoutFrame: number | null = null;
  private layoutTimer: number | null = null;
  private overflowMenu: Menu | null = null;
  private overflowEntry: RenderedFooter | null = null;

  constructor(private readonly environment: CardFooterEnvironment) {}

  render(parent: HTMLElement, options: CardFooterRenderOptions): HTMLElement {
    const footer = parent.createDiv({ cls: "slipbox-card-footer" });
    const entry: RenderedFooter = {
      sourcePath: options.sourcePath,
      backlinks: options.backlinks,
      activate: options.activate,
      footer,
      content: null,
      measureItems: [],
      measureSeparator: null,
      measureOverflow: null,
      interactive: options.interactive,
      fitKey: null,
    };

    this.populate(entry, options.backlinks);

    this.entries.add(entry);
    this.entriesByFooter.set(footer, entry);
    this.applyInteractiveState(entry);
    const ownerWindow = footer.ownerDocument.defaultView;
    if (ownerWindow !== null) {
      this.ensureOwnerWindow(ownerWindow);
    }
    this.resizeObserver?.observe(footer);
    this.scheduleLayout();
    return footer;
  }

  /** Refresh link-derived footer data without replacing any mounted card. */
  refreshBacklinks(
    backlinksForPath: (sourcePath: string) => readonly FiledCard[],
  ): void {
    for (const entry of this.entries) {
      const backlinks = backlinksForPath(entry.sourcePath);
      if (
        entry.backlinks.length === backlinks.length &&
        entry.backlinks.every((backlink, index) => {
          const next = backlinks[index];
          return next !== undefined &&
            backlink.path === next.path &&
            backlink.address === next.address;
        })
      ) {
        continue;
      }
      if (this.overflowEntry === entry) {
        this.closeOverflowMenu();
      }
      this.populate(entry, backlinks);
    }
    this.scheduleLayout();
  }

  setInteractive(card: HTMLElement, interactive: boolean): void {
    const footer = card.querySelector<HTMLElement>(".slipbox-card-footer");
    if (footer === null) {
      return;
    }
    const entry = this.entriesByFooter.get(footer);
    if (entry === undefined || entry.interactive === interactive) {
      return;
    }
    entry.interactive = interactive;
    this.applyInteractiveState(entry);
    if (!interactive && this.overflowEntry === entry) {
      this.closeOverflowMenu();
    }
  }

  scheduleLayout(): void {
    const ownerWindow = this.ownerWindow;
    if (
      ownerWindow === null ||
      this.layoutFrame !== null ||
      this.layoutTimer !== null
    ) {
      return;
    }
    this.layoutFrame = ownerWindow.requestAnimationFrame(() => {
      this.flushLayout();
    });
    this.layoutTimer = ownerWindow.setTimeout(() => this.flushLayout(), 120);
  }

  clear(): void {
    this.closeOverflowMenu();
    this.resizeObserver?.disconnect();
    this.entries.clear();
    this.entriesByFooter.clear();
    if (this.ownerWindow !== null && this.layoutFrame !== null) {
      this.ownerWindow.cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = null;
    }
    if (this.ownerWindow !== null && this.layoutTimer !== null) {
      this.ownerWindow.clearTimeout(this.layoutTimer);
      this.layoutTimer = null;
    }
    this.resizeObserver = null;
    this.ownerWindow = null;
  }

  private populate(
    entry: RenderedFooter,
    backlinks: readonly FiledCard[],
  ): void {
    entry.footer.empty();
    entry.backlinks = backlinks;
    entry.content = null;
    entry.measureItems = [];
    entry.measureSeparator = null;
    entry.measureOverflow = null;
    entry.fitKey = null;
    if (backlinks.length === 0) {
      this.applyInteractiveState(entry);
      return;
    }

    entry.footer.createSpan({
      cls: "slipbox-card-footer-icon",
      text: "↩",
      attr: { "aria-hidden": "true" },
    });
    entry.content = entry.footer.createDiv({
      cls: "slipbox-card-footer-content",
    });
    const measure = entry.footer.createDiv({
      cls: "slipbox-card-footer-measure",
      attr: { "aria-hidden": "true" },
    });
    entry.measureItems = backlinks
      .slice(0, BACKLINK_MEASUREMENT_LIMIT)
      .map((backlink) =>
        measure.createSpan({
          cls: "slipbox-card-backlink",
          text: backlink.address,
        })
      );
    entry.measureSeparator = measure.createSpan({
      cls: "slipbox-card-backlink-separator",
      text: "·",
    });
    entry.measureOverflow = measure.createEl("button", {
      cls: "slipbox-card-backlink-overflow",
      text: "+1",
      attr: { type: "button", tabindex: "-1" },
    });
    this.applyInteractiveState(entry);
  }

  private flushLayout(): void {
    const ownerWindow = this.ownerWindow;
    if (ownerWindow !== null && this.layoutFrame !== null) {
      ownerWindow.cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = null;
    }
    if (ownerWindow !== null && this.layoutTimer !== null) {
      ownerWindow.clearTimeout(this.layoutTimer);
      this.layoutTimer = null;
    }
    for (const entry of this.entries) {
      this.layout(entry);
    }
  }

  private ensureOwnerWindow(ownerWindow: ResizeObserverWindow): void {
    if (this.ownerWindow === ownerWindow) {
      return;
    }
    this.resizeObserver?.disconnect();
    if (this.ownerWindow !== null && this.layoutFrame !== null) {
      this.ownerWindow.cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = null;
    }
    if (this.ownerWindow !== null && this.layoutTimer !== null) {
      this.ownerWindow.clearTimeout(this.layoutTimer);
      this.layoutTimer = null;
    }
    this.ownerWindow = ownerWindow;
    const resizeObserver = new ownerWindow.ResizeObserver(() =>
      this.scheduleLayout());
    this.resizeObserver = resizeObserver;
    for (const entry of this.entries) {
      resizeObserver.observe(entry.footer);
    }
  }

  private layout(entry: RenderedFooter): void {
    const {
      content,
      measureItems,
      measureSeparator,
      measureOverflow,
    } = entry;
    if (
      content === null ||
      measureSeparator === null ||
      measureOverflow === null ||
      content.clientWidth <= 0
    ) {
      return;
    }

    const fit = fitMeasuredBacklinkPrefix(
      content.clientWidth,
      measureItems.map((item) => item.getBoundingClientRect().width),
      entry.backlinks.length,
      measureSeparator.getBoundingClientRect().width,
      (hiddenCount) => {
        measureOverflow.setText(`+${hiddenCount}`);
        return measureOverflow.getBoundingClientRect().width;
      },
    );
    const fitKey = `${fit.visibleCount}:${fit.hiddenCount}`;
    if (entry.fitKey === fitKey) {
      return;
    }
    entry.fitKey = fitKey;
    content.empty();

    for (let index = 0; index < fit.visibleCount; index += 1) {
      const backlink = entry.backlinks[index];
      if (backlink === undefined) {
        continue;
      }
      if (index > 0) {
        this.createSeparator(content);
      }
      this.createBacklinkAnchor(content, entry, backlink, true);
    }

    if (fit.hiddenCount > 0) {
      if (fit.visibleCount > 0) {
        this.createSeparator(content);
      }
      const overflow = content.createEl("button", {
        cls: "slipbox-card-backlink-overflow",
        text: `+${fit.hiddenCount}`,
        attr: {
          type: "button",
        },
      });
      setCardTooltip(
        overflow,
        `Show ${fit.hiddenCount} more backlink${
          fit.hiddenCount === 1 ? "" : "s"
        }`,
        this.environment.showTooltips(),
        { placement: "top", delay: 250 },
      );
      overflow.addEventListener("pointerdown", (event) => event.stopPropagation());
      overflow.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (entry.interactive) {
          this.environment.runAfterEditing("backlink-overflow", () => {
            this.showOverflowMenu(entry, overflow, fit.visibleCount);
          });
        }
      });
    }
    this.applyInteractiveState(entry);
  }

  private createSeparator(parent: HTMLElement): void {
    parent.createSpan({
      cls: "slipbox-card-backlink-separator",
      text: "·",
      attr: { "aria-hidden": "true" },
    });
  }

  private createBacklinkAnchor(
    parent: HTMLElement | DocumentFragment,
    entry: RenderedFooter,
    backlink: FiledCard,
    tabbable: boolean,
  ): HTMLAnchorElement {
    const linktext = this.environment.app.metadataCache.fileToLinktext(
      backlink.file,
      entry.sourcePath,
    );
    const anchor = parent.createEl("a", {
      cls: "internal-link slipbox-card-backlink",
      text: backlink.address,
      attr: {
        href: linktext,
      },
    });
    setCardTooltip(
      anchor,
      `Backlink from card ${backlink.address}`,
      this.environment.showTooltips(),
      { placement: "top", delay: 250 },
    );
    anchor.dataset.href = linktext;
    anchor.draggable = false;
    const policy = this.linkPolicy(entry);
    applyOwnedLinkAccessibility(
      anchor,
      policy.follow,
      tabbable,
    );

    anchor.addEventListener("mouseover", (event) => {
      if (!this.linkPolicy(entry).preview) {
        return;
      }
      this.environment.app.workspace.trigger("hover-link", {
        event,
        source: this.environment.hoverSource,
        hoverParent: this.environment.leaf,
        targetEl: anchor,
        linktext,
        sourcePath: entry.sourcePath,
      });
    });
    anchor.addEventListener("pointerdown", (event) => event.stopPropagation());
    anchor.addEventListener("click", (event) => {
      this.activate(entry, backlink, linktext, event);
    });
    anchor.addEventListener("auxclick", (event) => {
      if (event.button === 1 || !this.linkPolicy(entry).follow) {
        this.activate(entry, backlink, linktext, event);
      }
    });
    anchor.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (entry.interactive) {
        this.showBacklinkContextMenu(event, backlink);
      }
    });
    return anchor;
  }

  private activate(
    entry: RenderedFooter,
    backlink: FiledCard,
    linktext: string,
    event: MouseEvent | KeyboardEvent,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.linkPolicy(entry).follow) {
      return;
    }
    const newLeaf = Keymap.isModEvent(event) ||
      (event.instanceOf(MouseEvent) && event.button === 1);
    this.environment.runAfterEditing("backlink", async () => {
      if (newLeaf) {
        await this.environment.app.workspace.openLinkText(
          linktext,
          entry.sourcePath,
          newLeaf,
        );
        return;
      }
      this.closeOverflowMenu();
      await entry.activate(backlink);
    });
  }

  private showOverflowMenu(
    entry: RenderedFooter,
    button: HTMLButtonElement,
    visibleCount: number,
  ): void {
    this.closeOverflowMenu();
    const menu = new Menu().setUseNativeMenu(false);
    for (const backlink of entry.backlinks.slice(visibleCount)) {
      menu.addItem((item) => {
        const title = createFragment();
        const anchor = this.createBacklinkAnchor(title, entry, backlink, false);
        anchor.addEventListener("contextmenu", () => menu.hide());
        item.setTitle(title).onClick((event) => {
          const linktext = this.environment.app.metadataCache.fileToLinktext(
            backlink.file,
            entry.sourcePath,
          );
          this.activate(entry, backlink, linktext, event);
        });
      });
    }
    this.overflowMenu = menu;
    this.overflowEntry = entry;
    menu.onHide(() => {
      if (this.overflowMenu === menu) {
        this.overflowMenu = null;
        this.overflowEntry = null;
      }
    });
    const rect = button.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom, overlap: true });
  }

  private showBacklinkContextMenu(
    event: MouseEvent,
    backlink: FiledCard,
  ): void {
    this.closeOverflowMenu();
    const inTray = this.environment.isInTray(backlink.file);
    const menu = Menu.forEvent(event);
    menu.addItem((item) => {
      item
        .setTitle(trayToggleLabel(inTray))
        .setIcon(inTray ? "undo-2" : "bring-to-front")
        .onClick(() => this.environment.runAfterEditing(
          "backlink-tray-toggle",
          () => {
            this.environment.runAction("toggle-tray", backlink);
          },
        ));
    });
    this.environment.app.workspace.trigger(
      "file-menu",
      menu,
      backlink.file,
      this.environment.hoverSource,
      this.environment.leaf,
    );
    menu.showAtMouseEvent(event);
  }

  private applyInteractiveState(entry: RenderedFooter): void {
    const policy = this.linkPolicy(entry);
    entry.footer.toggleClass("is-interactive", entry.interactive);
    entry.footer
      .querySelectorAll<HTMLAnchorElement>(".slipbox-card-backlink")
      .forEach((anchor) => {
        applyOwnedLinkAccessibility(anchor, policy.follow);
      });
    entry.footer
      .querySelectorAll<HTMLButtonElement>(".slipbox-card-backlink-overflow")
      .forEach((button) => {
        if (!button.closest(".slipbox-card-footer-measure")) {
          button.disabled = !entry.interactive;
          button.tabIndex = entry.interactive ? 0 : -1;
        }
      });
  }

  private linkPolicy(entry: RenderedFooter) {
    return renderedLinkPolicy(
      this.environment.previewLinksOnHover(),
      this.environment.followLinksFromCards(),
      entry.interactive,
    );
  }

  private closeOverflowMenu(): void {
    const menu = this.overflowMenu;
    this.overflowMenu = null;
    this.overflowEntry = null;
    menu?.hide();
  }
}
