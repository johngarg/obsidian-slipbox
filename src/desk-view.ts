import {
  Component,
  ItemView,
  MarkdownRenderer,
  Notice,
  TFile,
  WorkspaceLeaf,
  setIcon,
  setTooltip,
} from "obsidian";

import type SlipboxPlugin from "./main.js";
import {
  DESK_CARD_HEIGHT,
  DESK_CARD_WIDTH,
  DESK_HEIGHT,
  DESK_WIDTH,
  clampDeskPosition,
  type DeskCardState,
} from "./desk-state.js";
import { CardFooterManager } from "./card-footer.js";

export const DESK_VIEW_TYPE = "slipbox-desk";

export class DeskView extends ItemView {
  private renderComponents: Component[] = [];
  private renderVersion = 0;
  private readonly cardFooters: CardFooterManager;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SlipboxPlugin,
  ) {
    super(leaf);
    this.cardFooters = new CardFooterManager({
      app: this.app,
      leaf: this.leaf,
      hoverSource: DESK_VIEW_TYPE,
      isOnDesk: (file) => this.plugin.state.deskCards.some(
        (card) => card.cardRef === file.path,
      ),
      putOnDesk: (file) => this.plugin.putFileOnDesk(file, false),
    });
    this.registerEvent(
      this.app.workspace.on("css-change", () => this.cardFooters.scheduleLayout()),
    );
  }

  getViewType(): string {
    return DESK_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Slipbox Desk";
  }

  getIcon(): string {
    return "panels-top-left";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("slipbox-desk-view");
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.cardFooters.clear();
    this.unloadRenderComponents();
  }

  onResize(): void {
    this.cardFooters.scheduleLayout();
  }

  async refresh(): Promise<void> {
    await this.renderDesk();
  }

  private async renderDesk(): Promise<void> {
    const version = ++this.renderVersion;
    this.unloadRenderComponents();
    this.cardFooters.clear();
    this.contentEl.empty();

    const shell = this.contentEl.createDiv({ cls: "slipbox-desk-shell" });
    this.renderToolbar(shell);
    const body = shell.createDiv({ cls: "slipbox-desk-body" });
    this.renderUnfiledTray(body);

    const viewport = body.createDiv({ cls: "slipbox-desk-viewport" });
    const surface = viewport.createDiv({ cls: "slipbox-desk-surface" });
    surface.style.width = `${DESK_WIDTH}px`;
    surface.style.height = `${DESK_HEIGHT}px`;
    const jobs: Promise<void>[] = [];
    for (const state of [...this.plugin.state.deskCards].sort((a, b) => a.z - b.z)) {
      jobs.push(this.renderCard(surface, state, version));
    }
    await Promise.all(jobs);
  }

  private renderToolbar(shell: HTMLElement): void {
    const toolbar = shell.createDiv({ cls: "slipbox-deck-toolbar slipbox-desk-toolbar" });
    const identity = toolbar.createDiv({ cls: "slipbox-deck-identity" });
    const icon = identity.createSpan({ cls: "slipbox-deck-icon" });
    setIcon(icon, "panels-top-left");
    identity.createSpan({ text: "Desk" });
    toolbar.createSpan({
      cls: "slipbox-desk-description",
      text: `${this.plugin.state.deskCards.length} card${this.plugin.state.deskCards.length === 1 ? "" : "s"} on the table`,
    });
    const openDeck = toolbar.createEl("button", {
      text: "Open Deck",
      attr: { type: "button" },
    });
    openDeck.addEventListener("click", () => void this.plugin.openDeck());
  }

  private renderUnfiledTray(body: HTMLElement): void {
    const tray = body.createEl("aside", { cls: "slipbox-unfiled-tray" });
    tray.createEl("h3", { text: "Unfiled cards" });
    tray.createEl("p", {
      text: "Place a card on the table or file it directly.",
    });
    const placed = new Set(this.plugin.state.deskCards.map((card) => card.cardRef));
    const available = this.plugin.index.snapshot.unfiled.filter(
      (file) => !placed.has(file.path),
    );
    const list = tray.createDiv({ cls: "slipbox-unfiled-list" });
    if (available.length === 0) {
      list.createEl("p", {
        cls: "slipbox-empty-copy",
        text: this.plugin.index.snapshot.unfiled.length === 0
          ? "No unfiled cards."
          : "All unfiled cards are on the table.",
      });
    }
    for (const file of available) {
      const item = list.createDiv({ cls: "slipbox-unfiled-item" });
      const name = item.createEl("button", {
        text: file.basename,
        cls: "slipbox-unfiled-open",
        attr: { type: "button" },
      });
      setTooltip(name, file.path);
      name.addEventListener("click", () => this.plugin.openMarkdownFile(file));
      const place = iconButton(item, "plus", `Place ${file.basename} on Desk`);
      place.addEventListener("click", () => void this.plugin.putFileOnDesk(file));
      const fileButton = iconButton(item, "archive-restore", `File ${file.basename}`);
      fileButton.addEventListener("click", () => void this.plugin.beginFiling(file));
    }
  }

  private async renderCard(
    surface: HTMLElement,
    state: DeskCardState,
    version: number,
  ): Promise<void> {
    const file = this.plugin.index.fileAtPath(state.cardRef);
    const card = surface.createDiv({ cls: "slipbox-desk-card" });
    card.dataset.path = state.cardRef;
    card.style.left = `${state.x}px`;
    card.style.top = `${state.y}px`;
    card.style.zIndex = String(state.z);
    card.style.width = `${DESK_CARD_WIDTH}px`;
    card.style.height = `${DESK_CARD_HEIGHT}px`;

    if (file === undefined) {
      card.addClass("is-missing");
      this.renderMissingCard(card, state);
      return;
    }

    const filed = this.plugin.index.filedByFile(file);
    const isUnfiled = this.plugin.index.snapshot.unfiled.some(
      (candidate) => candidate.path === file.path,
    );
    card.toggleClass("is-unfiled", isUnfiled);
    card.toggleClass("is-invalid", filed === undefined && !isUnfiled);

    const header = card.createDiv({ cls: "slipbox-desk-card-header" });
    const identity = header.createDiv({ cls: "slipbox-desk-card-identity" });
    identity.createSpan({
      cls: "slipbox-desk-card-address",
      text: filed?.id ?? (isUnfiled ? "unfiled" : "invalid Zettel"),
    });
    identity.createSpan({ cls: "slipbox-desk-card-title", text: file.basename });

    const actions = header.createDiv({ cls: "slipbox-desk-card-actions" });
    if (isUnfiled) {
      const fileButton = iconButton(actions, "archive-restore", `File ${file.basename}`);
      fileButton.addEventListener("pointerdown", (event) => event.stopPropagation());
      fileButton.addEventListener("click", () => void this.plugin.beginFiling(file));
    }
    const open = iconButton(actions, "file-pen-line", `Open ${file.basename}`);
    open.addEventListener("pointerdown", (event) => event.stopPropagation());
    open.addEventListener("click", () => this.plugin.openMarkdownFile(file));
    const remove = iconButton(actions, "x", `Remove ${file.basename} from Desk`);
    remove.addEventListener("pointerdown", (event) => event.stopPropagation());
    remove.addEventListener("click", () => void this.plugin.removeFromDesk(file.path));

    this.attachDragging(card, header, state);
    card.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (event.target as HTMLElement).closest(".slipbox-desk-card-header, button, a") !== null
      ) {
        return;
      }
      card.style.zIndex = String(this.plugin.nextDeskZ());
      void this.plugin.raiseDeskCard(state.cardRef);
    });
    card.addEventListener("dblclick", (event) => {
      if ((event.target as HTMLElement).closest("button, a") === null) {
        this.plugin.openMarkdownFile(file);
      }
    });

    const scroll = card.createDiv({ cls: "slipbox-desk-card-scroll markdown-rendered" });
    this.cardFooters.render(card, {
      sourcePath: file.path,
      backlinks: filed === undefined
        ? []
        : this.plugin.index.backlinksForPath(file.path),
      interactive: filed !== undefined,
      activate: (backlink) => this.plugin.openMarkdownFile(backlink.file),
    });
    const component = new Component();
    component.load();
    this.renderComponents.push(component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (version === this.renderVersion) {
        await MarkdownRenderer.render(this.app, body, scroll, file.path, component);
      }
    } catch (error) {
      scroll.createEl("p", {
        cls: "slipbox-render-error",
        text: `Could not render this card: ${errorMessage(error)}`,
      });
    }
  }

  private renderMissingCard(card: HTMLElement, state: DeskCardState): void {
    const header = card.createDiv({ cls: "slipbox-desk-card-header" });
    header.createSpan({ cls: "slipbox-desk-card-address", text: "missing card" });
    const remove = iconButton(header, "x", "Remove missing card from Desk");
    remove.addEventListener("click", () => void this.plugin.removeFromDesk(state.cardRef));
    card.createDiv({
      cls: "slipbox-desk-missing-copy",
      text: `${state.cardRef} no longer resolves to a note.`,
    });
  }

  private attachDragging(
    card: HTMLElement,
    handle: HTMLElement,
    state: DeskCardState,
  ): void {
    let currentX = state.x;
    let currentY = state.y;
    let drag: {
      readonly pointerId: number;
      readonly startClientX: number;
      readonly startClientY: number;
      readonly startX: number;
      readonly startY: number;
      x: number;
      y: number;
    } | null = null;

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button") !== null) {
        return;
      }
      const frontZ = this.plugin.nextDeskZ();
      card.style.zIndex = String(frontZ);
      drag = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: currentX,
        startY: currentY,
        x: currentX,
        y: currentY,
      };
      handle.setPointerCapture(event.pointerId);
      card.addClass("is-dragging");
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (drag === null || event.pointerId !== drag.pointerId) {
        return;
      }
      const position = clampDeskPosition(
        drag.startX + event.clientX - drag.startClientX,
        drag.startY + event.clientY - drag.startClientY,
      );
      drag.x = position.x;
      drag.y = position.y;
      card.style.left = `${position.x}px`;
      card.style.top = `${position.y}px`;
    });
    const finish = (event: PointerEvent): void => {
      if (drag === null || event.pointerId !== drag.pointerId) {
        return;
      }
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      const final = drag;
      drag = null;
      currentX = final.x;
      currentY = final.y;
      card.removeClass("is-dragging");
      void this.plugin.updateDeskCardLayout(state.cardRef, final.x, final.y, true);
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  private unloadRenderComponents(): void {
    for (const component of this.renderComponents) {
      component.unload();
    }
    this.renderComponents = [];
  }
}

function iconButton(
  parent: HTMLElement,
  icon: Parameters<typeof setIcon>[1],
  label: string,
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "clickable-icon slipbox-icon-button",
    attr: { type: "button", "aria-label": label },
  });
  setIcon(button, icon);
  return button;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
