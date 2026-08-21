import {
  Component,
  MarkdownRenderer,
  Menu,
  TFile,
  getLinkpath,
  setIcon,
  setTooltip,
  type App,
} from "obsidian";

import type SlipboxPlugin from "./main.js";
import {
  renderedLinkAction,
  resolveFiledCardLink,
} from "./card-links.js";
import { cardHeaderTitle } from "./card-title.js";
import {
  attachUnfiledAddressFiling,
  renderInlineFilingEditor,
  updateInlineFilingEditor,
  type InlineFilingEditorElements,
  type InlineFilingEditorState,
} from "./filing-editor.js";
import {
  cardPosition,
  insertionIndexForPoint,
  mergePiles,
  moveCardBetweenPiles,
  setPilePosition,
  splitCardIntoNewPile,
  trayHasFiledCards,
  trayStackJitter,
  type TrayCard,
  type TrayPile,
  type TrayPilePosition,
  type TrayState,
} from "./tray-state.js";
import { beginThresholdPointerDrag } from "./pointer-drag.js";

const DRAG_THRESHOLD_PX = 5;
const DEFAULT_PILE_VERTICAL_STEP_PX = 42;
const DEFAULT_PILE_DECK_CLEARANCE_PX = 24;
const PILE_BASE_Y_RATIO = 0.31;
const PILE_BASE_Y_OFFSET_PX = 126;
const PILE_CARD_HALF_HEIGHT_PX = 58;
const TRAY_SINGLE_CLICK_DELAY_MS = 320;

export interface TrayViewActions {
  jumpToFiledCard(path: string): Promise<void>;
  moveCardBy(cardRef: string, delta: -1 | 1): Promise<void>;
  beginFiling(file: TFile): Promise<void>;
  updateFilingInput(value: string): void;
  confirmFiling(): void;
  cancelFiling(): void;
  previewFilingPlacement(): void;
  filingInputFocusChanged(focused: boolean): void;
  beginInlineEditing(file: TFile): Promise<void>;
  runAfterEditing(
    reason: string,
    action: () => void | Promise<void>,
  ): Promise<boolean>;
}

export interface TrayFilingState extends InlineFilingEditorState {
  readonly sourcePath: string;
}

export class TrayRenderer {
  private components = new Map<string, Component>();
  private previews = new Map<string, HTMLElement>();
  private rootEl: HTMLElement | null = null;
  private filingEditor: InlineFilingEditorElements | null = null;
  private suppressClickUntil = 0;
  private pendingCardClickTimer: number | null = null;

  constructor(
    private readonly app: App,
    private readonly plugin: SlipboxPlugin,
    private readonly actions: TrayViewActions,
  ) {}

  clear(): void {
    if (this.pendingCardClickTimer !== null) {
      window.clearTimeout(this.pendingCardClickTimer);
      this.pendingCardClickTimer = null;
    }
    if (this.filingEditor !== null) {
      this.actions.filingInputFocusChanged(false);
    }
    for (const component of this.components.values()) {
      component.unload();
    }
    this.components.clear();
    this.previews.clear();
    this.rootEl = null;
    this.filingEditor = null;
  }

  get isFilingInputFocused(): boolean {
    const input = this.filingEditor?.input;
    return input !== undefined && input.ownerDocument.activeElement === input;
  }

  get filingInput(): HTMLInputElement | null {
    return this.filingEditor?.input ?? null;
  }

  focusFilingInput(): void {
    window.requestAnimationFrame(() => this.focusFilingInputNow());
  }

  focusFilingInputNow(): void {
    const input = this.filingEditor?.input;
    if (input === undefined) {
      return;
    }
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }

  updateFilingState(state: TrayFilingState): void {
    if (this.filingEditor !== null) {
      updateInlineFilingEditor(this.filingEditor, state);
    }
  }

  async rerenderPath(file: TFile): Promise<void> {
    const preview = this.previews.get(file.path);
    if (preview === undefined) {
      return;
    }
    this.components.get(file.path)?.unload();
    const component = new Component();
    component.load();
    this.components.set(file.path, component);
    preview.empty();
    preview.addClass("markdown-rendered");
    try {
      await MarkdownRenderer.render(
        this.app,
        await this.plugin.index.readBody(file),
        preview,
        file.path,
        component,
      );
    } catch {
      preview.setText("Preview unavailable");
    }
  }

  async render(
    stage: HTMLElement,
    space: HTMLElement,
    filing: TrayFilingState | null,
    isCurrent: () => boolean,
  ): Promise<void> {
    const state = this.plugin.tray;
    const cardCount = state.piles.reduce(
      (total, pile) => total + pile.cards.length,
      0,
    );
    this.attachBackgroundMenu(stage, space);
    if (cardCount === 0) {
      return;
    }

    stage.addClass("has-tray");
    const tray = space.createDiv({
      cls: "slipbox-tray",
      attr: {
        "aria-label": `Working piles, ${cardCount} card${cardCount === 1 ? "" : "s"}`,
      },
    });
    this.rootEl = tray;

    const piles = tray.createDiv({ cls: "slipbox-tray-piles" });
    const jobs: Promise<void>[] = [];
    state.piles.forEach((pile, pileIndex) => {
      jobs.push(...this.renderPile(
        piles,
        pile,
        pileIndex,
        pile.position ?? defaultPilePosition(pileIndex),
        state.expandedPileIds.includes(pile.id),
        filing,
        isCurrent,
      ));
    });
    await Promise.all(jobs);
  }

  private attachBackgroundMenu(stage: HTMLElement, space: HTMLElement): void {
    stage.addEventListener("contextmenu", (event) => {
      if (event.target !== stage) {
        return;
      }
      event.preventDefault();
      const menu = Menu.forEvent(event);
      const position = this.positionAtPoint(
        event.clientX,
        event.clientY,
        space,
        stage,
      );
      menu.addItem((item) => {
        item
          .setTitle("New card")
          .setIcon("file-plus-2")
          .setDisabled(position === null)
          .onClick(() => {
            if (position !== null) {
              void this.actions.runAfterEditing(
                "tray-new-card",
                () => this.plugin.createNewCardAtTrayPosition(position),
              );
            }
          });
      });
      menu.addSeparator();
      menu.addItem((item) => {
        item
          .setTitle("Return all filed cards")
          .setIcon("eraser")
          .setDisabled(!trayHasFiledCards(this.plugin.tray))
          .onClick(() => this.actions.runAfterEditing(
            "tray-return-all",
            () => this.plugin.clearTray(),
          ));
      });
      menu.showAtMouseEvent(event);
    });
  }

  private renderPile(
    parent: HTMLElement,
    pile: TrayPile,
    pileIndex: number,
    position: TrayPilePosition,
    expanded: boolean,
    filing: TrayFilingState | null,
    isCurrent: () => boolean,
  ): Promise<void>[] {
    const pileEl = parent.createDiv({
      cls: `slipbox-tray-pile ${expanded ? "is-expanded" : "is-collapsed"}`,
      attr: {
        "data-pile-id": pile.id,
        "aria-label": `Pile ${pileIndex + 1}, ${pile.cards.length} card${
          pile.cards.length === 1 ? "" : "s"
        }`,
      },
    });
    pileEl.tabIndex = expanded ? -1 : 0;
    pileEl.style.setProperty("--slipbox-pile-x", `${position.x}px`);
    pileEl.style.setProperty("--slipbox-pile-y", `${position.y}px`);

    pileEl.setAttr("role", expanded ? "group" : "button");
    pileEl.setAttr("aria-expanded", String(expanded));
    if (!expanded) {
      this.renderStackLayers(pileEl, pile);
    }
    pileEl.createSpan({
      cls: "slipbox-tray-pile-count",
      text: String(pile.cards.length),
      attr: {
        "aria-label": `${pile.cards.length} card${pile.cards.length === 1 ? "" : "s"}`,
      },
    });
    let dragSurface: HTMLElement = pileEl;
    if (expanded) {
      const handle = pileEl.createEl("button", {
        cls: "slipbox-tray-pile-handle",
        attr: {
          type: "button",
          "aria-label": `Move or collapse pile ${pileIndex + 1}`,
        },
      });
      setIcon(handle, "grip-vertical");
      setTooltip(handle, "Drag to move · Click to collapse", {
        placement: "left",
        delay: 250,
      });
      handle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (performance.now() < this.suppressClickUntil) {
          return;
        }
        void this.actions.runAfterEditing(
          "tray-collapse-pile",
          () => this.plugin.setTrayPileExpanded(pile.id, false),
        );
      });
      dragSurface = handle;
    }
    const sequence = pileEl.createDiv({ cls: "slipbox-tray-sequence" });
    const visibleCards = expanded ? pile.cards : pile.cards.slice(0, 1);
    const jobs = visibleCards.map((card, cardIndex) => this.renderCard(
      sequence,
      pile,
      card,
      expanded ? cardIndex : 0,
      pileIndex,
      expanded,
      filing,
      isCurrent,
    ));

    pileEl.addEventListener("click", (event) => {
      if (performance.now() < this.suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, input, textarea, select") !== null
      ) {
        return;
      }
      if (
        expanded &&
        event.target instanceof Element &&
        event.target.closest(".slipbox-tray-card") !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void this.actions.runAfterEditing(
        "tray-toggle-pile",
        () => this.plugin.setTrayPileExpanded(pile.id, !expanded),
      );
    });
    pileEl.addEventListener("keydown", (event) => {
      if (
        event.target !== pileEl ||
        (event.key !== "Enter" && event.key !== " ")
      ) {
        return;
      }
      event.preventDefault();
      void this.actions.runAfterEditing(
        "tray-toggle-pile-key",
        () => this.plugin.setTrayPileExpanded(pile.id, !expanded),
      );
    });
    pileEl.addEventListener("contextmenu", (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, input, textarea, select") !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.showPileMenu(event, pile);
    });
    this.attachPileDragging(pileEl, dragSurface, pile, position);
    return jobs;
  }

  private async renderCard(
    parent: HTMLElement,
    pile: TrayPile,
    card: TrayCard,
    cardIndex: number,
    pileIndex: number,
    expanded: boolean,
    filing: TrayFilingState | null,
    isCurrent: () => boolean,
  ): Promise<void> {
    const file = this.plugin.index.fileAtPath(card.cardRef);
    if (!(file instanceof TFile)) {
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    const address = filed?.address ?? "unfiled";
    const title = this.plugin.cardTitle(file);
    const miniature = parent.createDiv({
      cls: "slipbox-tray-card",
      attr: {
        "data-card-ref": card.cardRef,
        role: filed === undefined ? "group" : "button",
        "aria-label": `${address}, ${title}; card ${cardIndex + 1} of ${
          pile.cards.length
        } in pile ${pileIndex + 1}`,
      },
    });
    const jitter = trayStackJitter(card.cardRef, cardIndex);
    miniature.style.setProperty(
      "--slipbox-tray-card-tilt",
      `${jitter.rotationDegrees}deg`,
    );
    miniature.tabIndex = expanded ? 0 : -1;
    miniature.toggleClass("is-filed", filed !== undefined);
    miniature.toggleClass("is-unfiled", filed === undefined);
    const isFilingSource = filing?.sourcePath === card.cardRef;
    miniature.toggleClass("is-filing-source", isFilingSource);
    miniature.toggleClass(
      "is-bookmarked",
      filed !== undefined && this.plugin.bookmarkAtPath(filed.path) !== undefined,
    );

    const identity = miniature.createDiv({ cls: "slipbox-tray-card-identity" });
    const addressEl = identity.createSpan({
      cls: "slipbox-tray-card-address",
      text: address,
    });
    if (isFilingSource && filing !== null) {
      this.filingEditor = renderInlineFilingEditor(
        addressEl,
        miniature,
        filing,
        {
          onInput: (value) => this.actions.updateFilingInput(value),
          onConfirm: () => this.actions.confirmFiling(),
          onCancel: () => this.actions.cancelFiling(),
          onPreview: () => this.actions.previewFilingPlacement(),
          onFocusChange: (focused) =>
            this.actions.filingInputFocusChanged(focused),
        },
      );
    } else if (filed === undefined) {
      addressEl.setAttr("aria-label", "Unfiled card address; double-click to file");
      setTooltip(addressEl, "Double-click to file", {
        placement: "bottom",
        delay: 350,
      });
      attachUnfiledAddressFiling(addressEl, () => {
        void this.actions.runAfterEditing(
          "tray-address-filing",
          () => this.actions.beginFiling(file),
        );
      });
    }
    const headerTitle = cardHeaderTitle(
      title,
      this.plugin.settings.showTitleInDeck,
    );
    if (headerTitle !== null) {
      identity.createSpan({
        cls: "slipbox-tray-card-title",
        text: headerTitle,
      });
    }
    const controls = miniature.createDiv({ cls: "slipbox-tray-card-actions" });
    if (!isFilingSource) {
      if (filed === undefined) {
        const fileButton = trayIconButton(controls, "archive-restore", "File");
        fileButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.actions.runAfterEditing(
            "tray-file-card",
            () => this.actions.beginFiling(file),
          );
        });
      } else {
        const returnButton = trayIconButton(
          controls,
          "undo-2",
          "Return",
        );
        returnButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.actions.runAfterEditing(
            "tray-return-card",
            () => this.plugin.toggleFileInTray(file),
          );
        });
      }
      const open = trayIconButton(controls, "file-pen-line", "Open");
      open.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.runAfterEditing(
          "tray-open-note",
          () => this.plugin.openMarkdownFile(file),
        );
      });
    }

    const preview = miniature.createDiv({
      cls: "slipbox-tray-card-preview markdown-rendered",
    });
    this.previews.set(file.path, preview);
    preview.addEventListener("dblclick", (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("a, button, input, textarea, select, [contenteditable='true']") !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.cancelPendingCardClick();
      void this.actions.beginInlineEditing(file);
    });
    this.attachPreviewLinkInteractions(preview, file.path);
    const component = new Component();
    component.load();
    this.components.set(file.path, component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (isCurrent()) {
        await MarkdownRenderer.render(
          this.app,
          body,
          preview,
          file.path,
          component,
        );
      }
    } catch {
      preview.setText("Preview unavailable");
    }

    miniature.addEventListener("click", (event) => {
      if (performance.now() < this.suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, input, textarea, select") !== null
      ) {
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest(".slipbox-tray-card-preview") !== null
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.scheduleCardClick(() => {
          if (!expanded) {
            void this.actions.runAfterEditing(
              "tray-expand-pile",
              () => this.plugin.setTrayPileExpanded(pile.id, true),
            );
          } else if (filed !== undefined) {
            void this.actions.runAfterEditing(
              "tray-jump-filed-card",
              () => this.actions.jumpToFiledCard(filed.path),
            );
          }
        });
        return;
      }
      if (!expanded) {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.runAfterEditing(
          "tray-expand-pile",
          () => this.plugin.setTrayPileExpanded(pile.id, true),
        );
        return;
      }
      if (filed === undefined) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void this.actions.runAfterEditing(
        "tray-jump-filed-card",
        () => this.actions.jumpToFiledCard(filed.path),
      );
    });
    miniature.addEventListener("keydown", (event) => {
      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.runAfterEditing(
          "tray-move-card-key",
          () => this.actions.moveCardBy(
            card.cardRef,
            event.key === "ArrowLeft" ? -1 : 1,
          ),
        );
        return;
      }
      if (event.key === "Enter" && filed !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.runAfterEditing(
          "tray-jump-filed-card-key",
          () => this.actions.jumpToFiledCard(filed.path),
        );
      }
    });
    miniature.addEventListener("contextmenu", (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, input, textarea, select") !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (expanded) {
        this.showCardMenu(event, pile, card);
      } else {
        this.showPileMenu(event, pile, card);
      }
    });
    this.attachCardDragging(miniature, pile, card, expanded);
  }

  private renderStackLayers(parent: HTMLElement, pile: TrayPile): void {
    const hiddenCards = pile.cards.slice(1, 8);
    hiddenCards.forEach((card, index) => {
      const depth = index + 1;
      const jitter = trayStackJitter(card.cardRef, depth);
      const layer = parent.createDiv({
        cls: "slipbox-tray-stack-layer",
        attr: { "aria-hidden": "true" },
      });
      layer.style.setProperty("--slipbox-stack-depth", String(depth));
      layer.style.setProperty("--slipbox-stack-x", `${jitter.offsetX}px`);
      layer.style.setProperty("--slipbox-stack-y", `${jitter.offsetY}px`);
      layer.style.setProperty(
        "--slipbox-stack-tilt",
        `${jitter.rotationDegrees}deg`,
      );
    });
  }

  private attachPreviewLinkInteractions(
    preview: HTMLElement,
    sourcePath: string,
  ): void {
    preview.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const link = event.target.closest<HTMLAnchorElement>("a");
      if (link === null) {
        return;
      }
      const internal = link.matches(".internal-link");
      const linktext = link.dataset.href ?? link.getAttribute("href") ?? "";
      if (linktext === "") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const newLeaf = event.metaKey || event.ctrlKey;
      void this.actions.runAfterEditing("tray-rendered-link", async () => {
        const filed = internal
          ? resolveFiledCardLink(getLinkpath(linktext), sourcePath, {
              resolveFile: (path, source) =>
                this.app.metadataCache.getFirstLinkpathDest(path, source),
              filedPathForFile: (file) =>
                this.plugin.index.filedByFile(file)?.path,
              firstFiledPathAtAddress: (address) =>
                this.plugin.index.firstFiledAtAddress(address)?.path,
            })
          : undefined;
        const action = renderedLinkAction(internal, newLeaf, linktext, filed);
        if (action.kind === "card") {
          await this.actions.jumpToFiledCard(action.path);
        } else if (action.kind === "note") {
          await this.app.workspace.openLinkText(
            action.linktext,
            sourcePath,
            newLeaf,
          );
        } else {
          window.open(link.href, "_blank", "noopener");
        }
      });
    }, { capture: true });
  }

  private showPileMenu(
    event: MouseEvent,
    pile: TrayPile,
    visibleCard?: TrayCard,
  ): void {
    const menu = Menu.forEvent(event);
    if (
      visibleCard !== undefined &&
      this.addCardFileMenuItems(menu, visibleCard)
    ) {
      menu.addSeparator();
    }
    menu.addItem((item) => {
      item
        .setTitle("Lay out pile on active Canvas")
        .setIcon("layout-dashboard")
        .setDisabled(!this.plugin.hasActiveCanvas())
        .onClick(() => this.actions.runAfterEditing(
          "tray-layout-active-canvas",
          () => this.plugin.layOutTrayPileOnActiveCanvas(pile.id),
        ));
    });
    menu.addItem((item) => {
      item
        .setTitle("Lay out pile on Canvas…")
        .setIcon("layout-template")
        .onClick(() => this.actions.runAfterEditing(
          "tray-layout-canvas",
          () => this.plugin.layOutTrayPileOnCanvas(pile.id),
        ));
    });
    menu.addItem((item) => {
      item
        .setTitle("Create Canvas from pile…")
        .setIcon("file-plus-2")
        .onClick(() => this.actions.runAfterEditing(
          "tray-create-canvas",
          () => this.plugin.createCanvasFromTrayPile(pile.id),
        ));
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle("Return filed cards in this pile")
        .setIcon("eraser")
        .setDisabled(!pile.cards.some((card) => card.kind === "filed"))
        .onClick(() => this.actions.runAfterEditing(
          "tray-return-pile",
          () => this.plugin.clearTrayPile(pile.id),
        ));
    });
    menu.showAtMouseEvent(event);
  }

  private showCardMenu(event: MouseEvent, pile: TrayPile, card: TrayCard): void {
    const state = this.plugin.tray;
    const position = cardPosition(state, card.cardRef);
    if (position === null) {
      return;
    }
    const menu = Menu.forEvent(event);
    if (this.addCardFileMenuItems(menu, card)) {
      menu.addSeparator();
    }
    menu.addItem((item) => {
      item
        .setTitle("Move to previous pile")
        .setIcon("arrow-left")
        .setDisabled(position.pileIndex <= 0)
        .onClick(() => {
          const target = state.piles[position.pileIndex - 1];
          if (target !== undefined) {
            this.moveAndFocus(
              moveCardBetweenPiles(state, card.cardRef, target.id),
              card.cardRef,
            );
          }
        });
    });
    menu.addItem((item) => {
      item
        .setTitle("Move to next pile")
        .setIcon("arrow-right")
        .setDisabled(position.pileIndex >= state.piles.length - 1)
        .onClick(() => {
          const target = state.piles[position.pileIndex + 1];
          if (target !== undefined) {
            this.moveAndFocus(
              moveCardBetweenPiles(state, card.cardRef, target.id),
              card.cardRef,
            );
          }
        });
    });
    menu.addItem((item) => {
      item
        .setTitle("Split into new pile")
        .setIcon("split")
        .setDisabled(pile.cards.length <= 1)
        .onClick(() => {
          const newPileId = this.plugin.createTrayPileId();
          const origin = pile.position ?? defaultPilePosition(position.pileIndex);
          const split = splitCardIntoNewPile(state, card.cardRef, newPileId);
          this.moveAndFocus(
            setPilePosition(split, newPileId, {
              x: origin.x + 38,
              y: origin.y + 38,
            }),
            card.cardRef,
          );
        });
    });
    menu.showAtMouseEvent(event);
  }

  private addCardFileMenuItems(menu: Menu, card: TrayCard): boolean {
    const file = this.plugin.index.fileAtPath(card.cardRef);
    if (file === undefined) {
      return false;
    }
    menu.addItem((item) => {
      item
        .setTitle("Open")
        .setIcon("file-pen-line")
        .onClick(() => this.actions.runAfterEditing(
          "tray-menu-open-note",
          () => this.plugin.openMarkdownFile(file),
        ));
    });
    if (card.kind === "unfiled") {
      menu.addItem((item) => {
        item
          .setTitle("File")
          .setIcon("archive-restore")
          .onClick(() => this.actions.runAfterEditing(
            "tray-menu-file-card",
            () => this.actions.beginFiling(file),
          ));
      });
    }
    return true;
  }

  private attachCardDragging(
    element: HTMLElement,
    pile: TrayPile,
    card: TrayCard,
    expanded: boolean,
  ): void {
    if (!expanded) {
      return;
    }
    element.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (
          event.target instanceof Element &&
          event.target.closest("button, a, input, textarea, select") !== null
        )
      ) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      this.startPointerActionAfterEditing(event, "tray-card-drag", () => {
        beginThresholdPointerDrag({
          captureTarget: element,
          pointerId,
          startX,
          startY,
          threshold: DRAG_THRESHOLD_PX,
          onDragStart: () => {
            element.addClass("is-dragging");
            this.rootEl?.addClass("is-dragging-card");
          },
          onDragMove: (moveEvent, dx, dy) => {
            element.style.translate = `${dx}px ${dy}px`;
            this.updateCardDropCues(moveEvent, pile.id, element);
          },
          onDrop: (upEvent) => {
            this.suppressClickUntil = performance.now() + 400;
            const next = this.cardDropState(
              card.cardRef,
              upEvent.clientX,
              upEvent.clientY,
              element,
            );
            this.clearDropCues();
            void this.plugin.updateTray(next);
          },
          onCancel: () => this.clearDropCues(),
        });
      });
    });
  }

  private attachPileDragging(
    element: HTMLElement,
    dragSurface: HTMLElement,
    pile: TrayPile,
    position: TrayPilePosition,
  ): void {
    dragSurface.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (
          dragSurface === element &&
          event.target instanceof Element &&
          event.target.closest("button, a, input, textarea, select") !== null
        )
      ) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      this.startPointerActionAfterEditing(event, "tray-pile-drag", () => {
        beginThresholdPointerDrag({
          captureTarget: dragSurface,
          pointerId,
          startX,
          startY,
          threshold: DRAG_THRESHOLD_PX,
          onDragStart: () => element.addClass("is-dragging"),
          onDragMove: (moveEvent, dx, dy) => {
            element.style.translate = `${dx}px ${dy}px`;
            this.updatePileDropCues(moveEvent, pile.id, element);
          },
          onDrop: (upEvent) => {
            this.suppressClickUntil = performance.now() + 400;
            const next = this.pileDropState(
              pile.id,
              upEvent.clientX,
              upEvent.clientY,
              element,
              {
                x: position.x + upEvent.clientX - startX,
                y: position.y + upEvent.clientY - startY,
              },
            );
            this.clearDropCues();
            void this.plugin.updateTray(next);
          },
          onCancel: () => {
            element.setCssProps({ translate: "" });
            this.clearDropCues();
          },
        });
      });
    });
  }

  private cardDropState(
    cardRef: string,
    x: number,
    y: number,
    dragged: HTMLElement,
  ) {
    const state = this.plugin.tray;
    const targetPileEl = this.elementsBelowPoint(x, y, dragged)
      .find((element) => element.matches(".slipbox-tray-pile")) as HTMLElement | undefined;
    const targetPileId = targetPileEl?.dataset.pileId;
    if (targetPileEl !== undefined && targetPileId !== undefined) {
      const cards = Array.from(targetPileEl.querySelectorAll<HTMLElement>(
        ".slipbox-tray-card:not(.is-dragging)",
      ));
      const insertionIndex = insertionIndexForPoint(
        x,
        cards.map((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left + rect.width / 2;
        }),
      );
      return moveCardBetweenPiles(state, cardRef, targetPileId, insertionIndex);
    }
    const newPosition = this.positionAtPoint(x, y);
    if (newPosition !== null) {
      const newPileId = this.plugin.createTrayPileId();
      const split = splitCardIntoNewPile(state, cardRef, newPileId);
      return setPilePosition(split, newPileId, newPosition);
    }
    return state;
  }

  private pileDropState(
    sourcePileId: string,
    x: number,
    y: number,
    dragged: HTMLElement,
    newPosition: TrayPilePosition,
  ) {
    const state = this.plugin.tray;
    const target = this.elementsBelowPoint(x, y, dragged)
      .find((element) =>
        element.matches(".slipbox-tray-pile") &&
        (element as HTMLElement).dataset.pileId !== sourcePileId,
      ) as HTMLElement | undefined;
    const targetId = target?.dataset.pileId;
    if (target !== undefined && targetId !== undefined) {
      if (isPointInPileMergeRegion(target, x, y)) {
        return mergePiles(state, sourcePileId, targetId);
      }
    }
    return setPilePosition(state, sourcePileId, newPosition);
  }

  private updateCardDropCues(
    event: PointerEvent,
    sourcePileId: string,
    dragged: HTMLElement,
  ): void {
    this.clearDropCues(dragged);
    const elements = this.elementsBelowPoint(
      event.clientX,
      event.clientY,
      dragged,
    );
    const targetPile = elements.find(
      (element) => element.matches(".slipbox-tray-pile"),
    ) as HTMLElement | undefined;
    if (targetPile === undefined) {
      return;
    }
    targetPile.addClass(
      targetPile.dataset.pileId === sourcePileId
        ? "is-reorder-target"
        : "is-card-drop-target",
    );
    const targetCard = elements.find(
      (element) => element.matches(".slipbox-tray-card"),
    );
    targetCard?.addClass("is-insertion-target");
  }

  private updatePileDropCues(
    event: PointerEvent,
    sourcePileId: string,
    dragged: HTMLElement,
  ): void {
    this.clearDropCues(dragged);
    const target = this.elementsBelowPoint(
      event.clientX,
      event.clientY,
      dragged,
    ).find((element) =>
      element.matches(".slipbox-tray-pile") &&
      (element as HTMLElement).dataset.pileId !== sourcePileId,
    ) as HTMLElement | undefined;
    if (target === undefined) {
      return;
    }
    if (isPointInPileMergeRegion(target, event.clientX, event.clientY)) {
      target.addClass("is-merge-target");
    }
  }

  private elementsBelowPoint(
    x: number,
    y: number,
    dragged: HTMLElement,
  ): Element[] {
    dragged.addClass("slipbox-ignore-pointer-events");
    try {
      return document.elementsFromPoint(x, y);
    } finally {
      dragged.removeClass("slipbox-ignore-pointer-events");
    }
  }

  private positionAtPoint(
    x: number,
    y: number,
    coordinateElement: HTMLElement | null = this.rootEl,
    hitBoundsElement: HTMLElement | null = coordinateElement,
  ): TrayPilePosition | null {
    const rect = coordinateElement?.getBoundingClientRect();
    const hitBounds = hitBoundsElement?.getBoundingClientRect();
    if (
      rect === undefined ||
      hitBounds === undefined ||
      x < hitBounds.left || x > hitBounds.right ||
      y < hitBounds.top || y > hitBounds.bottom
    ) {
      return null;
    }
    return {
      x: x - (rect.left + rect.width / 2),
      y: y - (
        rect.top + rect.height * PILE_BASE_Y_RATIO - PILE_BASE_Y_OFFSET_PX
      ) - PILE_CARD_HALF_HEIGHT_PX,
    };
  }

  private clearDropCues(except?: HTMLElement): void {
    this.rootEl?.querySelectorAll<HTMLElement>(
      ".is-dragging, .is-merge-target, .is-reorder-target, " +
      ".is-card-drop-target, .is-insertion-target",
    ).forEach((element) => {
      if (element === except) {
        return;
      }
      element.removeClasses([
        "is-dragging",
        "is-merge-target",
        "is-reorder-target",
        "is-card-drop-target",
        "is-insertion-target",
      ]);
      element.setCssProps({ translate: "" });
    });
    this.rootEl?.removeClass("is-dragging-card");
  }

  private moveAndFocus(nextState: TrayState, cardRef: string): void {
    void this.actions.runAfterEditing("tray-menu-move-card", async () => {
      await this.plugin.updateTray(nextState);
      window.requestAnimationFrame(() => {
        const escaped = CSS.escape(cardRef);
        this.rootEl
          ?.querySelector<HTMLElement>(`.slipbox-tray-card[data-card-ref="${escaped}"]`)
          ?.focus({ preventScroll: true });
      });
    });
  }

  private scheduleCardClick(action: () => void): void {
    this.cancelPendingCardClick();
    this.pendingCardClickTimer = window.setTimeout(() => {
      this.pendingCardClickTimer = null;
      action();
    }, TRAY_SINGLE_CLICK_DELAY_MS);
  }

  private startPointerActionAfterEditing(
    event: PointerEvent,
    reason: string,
    action: () => void,
  ): void {
    const document = event.currentTarget instanceof Node
      ? event.currentTarget.ownerDocument
      : null;
    if (document === null) {
      return;
    }
    const pointerId = event.pointerId;
    let pointerActive = true;
    const cleanup = (): void => {
      document.removeEventListener("pointerup", released, true);
      document.removeEventListener("pointercancel", released, true);
    };
    const released = (releasedEvent: PointerEvent): void => {
      if (releasedEvent.pointerId === pointerId) {
        pointerActive = false;
        cleanup();
      }
    };
    document.addEventListener("pointerup", released, true);
    document.addEventListener("pointercancel", released, true);
    void this.actions.runAfterEditing(reason, () => {
      cleanup();
      if (pointerActive) {
        action();
      }
    }).finally(cleanup);
  }

  private cancelPendingCardClick(): void {
    if (this.pendingCardClickTimer !== null) {
      window.clearTimeout(this.pendingCardClickTimer);
      this.pendingCardClickTimer = null;
    }
  }
}

function defaultPilePosition(pileIndex: number): TrayPilePosition {
  return {
    x: 0,
    y:
      pileIndex * DEFAULT_PILE_VERTICAL_STEP_PX -
      DEFAULT_PILE_DECK_CLEARANCE_PX,
  };
}

function isPointInPileMergeRegion(
  pile: HTMLElement,
  x: number,
  y: number,
): boolean {
  const rect = pile.getBoundingClientRect();
  const relativeX = (x - rect.left) / Math.max(1, rect.width);
  const relativeY = (y - rect.top) / Math.max(1, rect.height);
  return (
    relativeX > 0.2 && relativeX < 0.8 &&
    relativeY > 0.2 && relativeY < 0.8
  );
}

function trayIconButton(
  parent: HTMLElement,
  icon: Parameters<typeof setIcon>[1],
  label: string,
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "clickable-icon slipbox-tray-card-action",
    attr: { type: "button", "aria-label": label },
  });
  setIcon(button, icon);
  setTooltip(button, label, { placement: "bottom", delay: 250 });
  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  return button;
}
