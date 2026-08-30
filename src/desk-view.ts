import {
  Component,
  MarkdownRenderer,
  Menu,
  TFile,
  getLinkpath,
  setIcon,
  type App,
} from "obsidian";

import { addCardContextMenuItems } from "./card-context-menu.js";
import type { BookmarkService } from "./bookmark-service.js";
import { applyCardColor } from "./card-color.js";
import type { CardIndex } from "./card-index.js";
import type { CardService } from "./card-service.js";
import type { DeskCanvasService } from "./desk-canvas-service.js";
import type { DeskService } from "./desk-service.js";
import {
  renderCardHeaderButtons,
  type CardHeaderButtonController,
} from "./card-header-buttons.js";
import {
  renderedLinkAction,
  resolveFiledCardLink,
} from "./card-links.js";
import { UNFILED_ADDRESS_LABEL } from "./card-address.js";
import {
  CardSignatureManager,
  type CardSignatureBranch,
} from "./card-signature.js";
import { showCardSignatureOverflowMenu } from "./card-signature-overflow.js";
import { cardHeaderTitle } from "./card-title.js";
import { setCardTooltip } from "./card-tooltip.js";
import { isDeskCardFocusTarget } from "./desk-focus.js";
import {
  attachUnfiledAddressFiling,
  filingEditorMatchesSource,
  renderInlineFilingEditor,
  updateInlineFilingEditor,
  type InlineFilingEditorElements,
} from "./filing-editor.js";
import type { FilingSessionSnapshot } from "./filing-session.js";
import {
  cardPosition,
  cyclePileTopCard,
  deskCardPrimaryClickIntent,
  insertionIndexForPoint,
  mergePiles,
  moveCardBetweenPiles,
  movePileToOrdinalBoundary,
  setPilePosition,
  splitCardIntoNewPile,
  deskStackJitter,
  type DeskCard,
  type DeskPile,
  type DeskPilePosition,
  type DeskState,
} from "./desk-state.js";
import {
  beginPointerActionAfterGate,
  beginThresholdPointerDrag,
} from "./pointer-drag.js";
import {
  cardDropTargetPile,
  pileHeaderPositionAtWorkspacePoint,
  pilePositionAtWorkspacePoint,
} from "./desk-drop.js";
import type { SlipboxAction, SlipboxSettings } from "./settings.js";
import {
  applyRenderedLinkAccessibility,
  attachRenderedLinkInteractions,
} from "./rendered-link-interactions.js";
import { applyRenderedBranchLinkOutlines } from "./rendered-branch-links.js";
import { defaultPilePosition } from "./workspace-layout.js";

const DRAG_THRESHOLD_PX = 5;
const DESK_SINGLE_CLICK_DELAY_MS = 320;

export interface DeskViewHost {
  readonly settings: SlipboxSettings;
  readonly index: CardIndex;
  readonly cards: CardService;
  readonly deskService: DeskService;
  readonly deskCanvas: DeskCanvasService;
  readonly bookmarks: BookmarkService;
}

export interface DeskViewActions {
  jumpToFiledCard(path: string): Promise<void>;
  updateFilingInput(value: string): void;
  confirmFiling(): void;
  cancelFiling(): void;
  previewFilingPlacement(): void;
  filingInputFocusChanged(focused: boolean): void;
  focusViewedCard(): void;
  focusDeskCard(path: string, pileId: string): void;
  isDeskCardFocused(path: string, pileId: string): boolean;
  canRunAction(action: SlipboxAction): boolean;
  runAction(action: SlipboxAction): boolean;
  runCardAction(
    action: SlipboxAction,
    path: string,
    pileId: string,
  ): boolean;
  runAfterEditing(
    reason: string,
    action: () => void | Promise<void>,
  ): Promise<boolean>;
  previewLink(
    event: MouseEvent,
    link: HTMLElement,
    linktext: string,
    sourcePath: string,
  ): void;
}

export class DeskRenderer {
  private components = new Map<string, Component>();
  private previews = new Map<string, HTMLElement>();
  private rootEl: HTMLElement | null = null;
  private pilesAnchorEl: HTMLElement | null = null;
  private workspaceEl: HTMLElement | null = null;
  private readonly cardHeaderButtonControllers = new Set<CardHeaderButtonController>();
  private filingEditor: InlineFilingEditorElements | null = null;
  private suppressClickUntil = 0;
  private pendingCardClickTimer: number | null = null;
  private pendingCardClickWindow: Window | null = null;
  private readonly cardSignatures: CardSignatureManager;

  constructor(
    private readonly app: App,
    private readonly plugin: DeskViewHost,
    private readonly actions: DeskViewActions,
  ) {
    this.cardSignatures = new CardSignatureManager({
      showBranchLabels: () => this.plugin.settings.showBranchLabels,
      showTooltips: () => this.plugin.settings.showTooltips,
      previewLinksOnHover: () => this.plugin.settings.previewLinksOnHover,
      followLinksFromCards: () => this.plugin.settings.followLinksFromCards,
      branchesForPath: (path) => this.cardSignatureBranches(path),
      preview: (event, target, branch, targetPath) => {
        this.actions.previewLink(event, target, branch.linktext, targetPath);
      },
      activate: (branch) => this.actions.jumpToFiledCard(branch.sourcePath),
      showOverflowMenu: showCardSignatureOverflowMenu,
      runAfterEditing: (reason, action) => {
        void this.actions.runAfterEditing(reason, action);
      },
    });
  }

  clear(): void {
    for (const controller of this.cardHeaderButtonControllers) {
      controller.disconnect();
    }
    this.cardHeaderButtonControllers.clear();
    this.cardSignatures.clear();
    this.cancelPendingCardClick();
    if (this.filingEditor !== null) {
      this.actions.filingInputFocusChanged(false);
    }
    for (const component of this.components.values()) {
      component.unload();
    }
    this.components.clear();
    this.previews.clear();
    this.rootEl = null;
    this.pilesAnchorEl = null;
    this.workspaceEl = null;
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
    const input = this.filingEditor?.input;
    input?.win.requestAnimationFrame(() => this.focusFilingInputNow());
  }

  focusFilingInputNow(): void {
    const input = this.filingEditor?.input;
    if (input === undefined) {
      return;
    }
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }

  updateFilingState(state: FilingSessionSnapshot): void {
    if (this.filingEditor !== null) {
      updateInlineFilingEditor(this.filingEditor, state);
      this.applyFilingGuidance(this.filingEditor.input, state.guidance);
    }
  }

  private applyFilingGuidance(input: HTMLInputElement, guidance: string): void {
    input.setAttribute("aria-description", guidance);
    setCardTooltip(input, guidance, this.plugin.settings.showTooltips, {
      placement: "bottom",
      delay: 350,
      accessibleLabel: "Card address",
    });
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
      this.applyBranchLinkOutlines(preview, file);
      applyRenderedLinkAccessibility(
        preview,
        this.plugin.settings.followLinksFromCards,
        this.plugin.settings.showTooltips,
      );
    } catch {
      preview.setText("Preview unavailable");
    }
  }

  refreshBranchMetadata(): void {
    this.cardSignatures.refreshBranches();
  }

  refreshBranchLinkOutlines(): void {
    for (const [path, preview] of this.previews) {
      const file = this.plugin.index.fileAtPath(path);
      if (file instanceof TFile) {
        this.applyBranchLinkOutlines(preview, file);
      } else {
        applyRenderedBranchLinkOutlines(preview, {
          enabled: false,
          links: [],
        });
      }
    }
  }

  scheduleBranchLayout(): void {
    this.cardSignatures.scheduleLayout();
  }

  private cardSignatureBranches(path: string): readonly CardSignatureBranch[] {
    return this.plugin.index.incomingBranchesForPath(path).flatMap((branch) => {
      const source = this.plugin.index.filedByPath(branch.sourcePath);
      if (source === undefined) {
        return [];
      }
      return [{
        label: branch.label,
        sourcePath: source.path,
        sourceAddress: source.address,
        sourceTitle: this.plugin.cards.title(source.file),
        linktext: this.app.metadataCache.fileToLinktext(source.file, path),
      }];
    });
  }

  async render(
    stage: HTMLElement,
    space: HTMLElement,
    filing: FilingSessionSnapshot | null,
    viewedPath: string | null,
    isCurrent: () => boolean,
  ): Promise<void> {
    const state = this.plugin.deskService.snapshot;
    const cardCount = state.piles.reduce(
      (total, pile) => total + pile.cards.length,
      0,
    );
    this.attachBackgroundMenu(stage);
    this.workspaceEl = stage;
    const deskEl = space.createDiv({ cls: "slipbox-desk" });
    setCardTooltip(
      deskEl,
      `Working piles, ${cardCount} card${cardCount === 1 ? "" : "s"}`,
      this.plugin.settings.showTooltips,
      { placement: "bottom", delay: 350 },
    );
    this.rootEl = deskEl;

    const piles = deskEl.createDiv({
      cls: "slipbox-desk-piles",
    });
    this.pilesAnchorEl = piles;
    if (cardCount === 0) {
      return;
    }

    const jobs: Promise<void>[] = [];
    state.piles.forEach((pile, pileIndex) => {
      jobs.push(...this.renderPile(
        piles,
        pile,
        pileIndex,
        pile.position ?? null,
        state.expandedPileIds.includes(pile.id),
        filing,
        viewedPath,
        isCurrent,
      ));
    });
    await Promise.all(jobs);
  }

  private attachBackgroundMenu(stage: HTMLElement): void {
    stage.addEventListener("contextmenu", (event) => {
      if (event.target !== stage) {
        return;
      }
      event.preventDefault();
      const menu = Menu.forEvent(event);
      const position = this.positionAtPoint(
        event.clientX,
        event.clientY,
        this.pilesAnchorEl,
        stage,
      );
      menu.addItem((item) => {
        item
          .setTitle("New card here")
          .setIcon("file-plus-2")
          .setDisabled(position === null)
          .onClick(() => {
            if (position !== null) {
              void this.actions.runAfterEditing(
                "desk-new-card",
                () => this.plugin.cards.createAtDeskPosition(position),
              );
            }
          });
      });
      menu.addItem((item) => {
        item
          .setTitle("New card with options here")
          .setIcon("file-pen-line")
          .setDisabled(position === null)
          .onClick(() => {
            if (position !== null) {
              void this.actions.runAfterEditing(
                "desk-new-card",
                () => this.plugin.cards.createAtDeskPosition(
                  position,
                  "options",
                ),
              );
            }
          });
      });
      menu.addSeparator();
      menu.addItem((item) => {
        item
          .setTitle("Collapse all piles")
          .setIcon("minimize-2")
          .setDisabled(!this.actions.canRunAction("collapse-all-piles"))
          .onClick(() => this.actions.runAction("collapse-all-piles"));
      });
      menu.addItem((item) => {
        item
          .setTitle("Return all filed cards")
          .setIcon("eraser")
          .setDisabled(!this.actions.canRunAction("return-all-filed-cards"))
          .onClick(() => this.actions.runAction("return-all-filed-cards"));
      });
      menu.showAtMouseEvent(event);
    });
  }

  private renderPile(
    parent: HTMLElement,
    pile: DeskPile,
    pileIndex: number,
    position: DeskPilePosition | null,
    expanded: boolean,
    filing: FilingSessionSnapshot | null,
    viewedPath: string | null,
    isCurrent: () => boolean,
  ): Promise<void>[] {
    const pileEl = parent.createDiv({
      cls: `slipbox-desk-pile ${expanded ? "is-expanded" : "is-collapsed"}`,
      attr: {
        "data-pile-id": pile.id,
      },
    });
    setCardTooltip(
      pileEl,
      `Pile ${pileIndex + 1}, ${pile.cards.length} card${
        pile.cards.length === 1 ? "" : "s"
      }`,
      this.plugin.settings.showTooltips,
      { placement: "bottom", delay: 350 },
    );
    pileEl.tabIndex = expanded ? -1 : 0;
    const renderedPosition = position ?? defaultPilePosition(pileIndex);
    pileEl.style.setProperty(
      "--slipbox-pile-x",
      "xPercent" in renderedPosition
        ? `${renderedPosition.xPercent}%`
        : `${renderedPosition.x}px`,
    );
    pileEl.style.setProperty("--slipbox-pile-y", `${renderedPosition.y}px`);

    pileEl.setAttr("role", expanded ? "group" : "button");
    pileEl.setAttr("aria-expanded", String(expanded));
    pileEl.addEventListener("focusin", (event) => {
      const target = event.targetNode;
      if (target?.instanceOf(Element) === true && isDeskCardFocusTarget(target)) {
        return;
      }
      const top = pile.cards[0];
      if (top !== undefined) {
        this.actions.focusDeskCard(top.cardRef, pile.id);
      }
    });
    if (!expanded) {
      this.renderStackLayers(pileEl, pile);
      if (pile.cards.length > 1) {
        this.renderPileCycleButton(pileEl, pile, pileIndex, -1);
        this.renderPileCycleButton(pileEl, pile, pileIndex, 1);
      }
    }
    const count = pileEl.createSpan({
      cls: "slipbox-desk-pile-count",
      text: String(pile.cards.length),
    });
    setCardTooltip(
      count,
      `${pile.cards.length} card${pile.cards.length === 1 ? "" : "s"}`,
      this.plugin.settings.showTooltips,
      { placement: "top", delay: 250 },
    );
    let dragSurface: HTMLElement = pileEl;
    if (expanded) {
      const handle = pileEl.createEl("button", {
        cls: "slipbox-desk-pile-handle",
        attr: {
          type: "button",
        },
      });
      setIcon(handle, "grip-vertical");
      setCardTooltip(
        handle,
        `Move or collapse pile ${pileIndex + 1}. Drag to move; click to collapse.`,
        this.plugin.settings.showTooltips,
        { placement: "left", delay: 250 },
      );
      handle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.win.performance.now() < this.suppressClickUntil) {
          return;
        }
        void this.actions.runAfterEditing(
          "desk-collapse-pile",
          () => this.plugin.deskService.setPileExpanded(pile.id, false),
        );
      });
      handle.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showPileMenu(event, pile);
      });
      dragSurface = handle;
    }
    const sequence = pileEl.createDiv({
      cls: "slipbox-desk-sequence",
    });
    const visibleCards = expanded ? pile.cards : pile.cards.slice(0, 1);
    const jobs = visibleCards.map((card, cardIndex) => this.renderCard(
      sequence,
      pile,
      card,
      expanded ? cardIndex : 0,
      pileIndex,
      expanded,
      filing,
      viewedPath,
      isCurrent,
    ));

    pileEl.addEventListener("click", (event) => {
      if (event.win.performance.now() < this.suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        event.targetNode?.instanceOf(Element) === true &&
        event.targetNode.closest("button, a, input, textarea, select") !== null
      ) {
        return;
      }
      if (
        expanded &&
        event.targetNode?.instanceOf(Element) === true &&
        event.targetNode.closest(".slipbox-desk-card") !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void this.actions.runAfterEditing(
        "desk-toggle-pile",
        () => this.plugin.deskService.setPileExpanded(pile.id, !expanded),
      );
    });
    pileEl.addEventListener("contextmenu", (event) => {
      if (
        event.targetNode?.instanceOf(Element) === true &&
        event.targetNode.closest("button, a, input, textarea, select") !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const top = pile.cards[0];
      if (top !== undefined) {
        this.actions.focusDeskCard(top.cardRef, pile.id);
      }
      this.showPileMenu(event, pile);
    });
    this.attachPileDragging(pileEl, dragSurface, pile);
    return jobs;
  }

  private renderPileCycleButton(
    parent: HTMLElement,
    pile: DeskPile,
    pileIndex: number,
    direction: -1 | 1,
  ): void {
    const previous = direction === -1;
    const label = `${previous ? "Previous" : "Next"} card in pile ${pileIndex + 1}`;
    const button = parent.createEl("button", {
      cls: `clickable-icon slipbox-desk-pile-cycle ${
        previous ? "is-previous" : "is-next"
      }`,
      attr: { type: "button" },
    });
    setIcon(button, previous ? "chevron-left" : "chevron-right");
    setCardTooltip(button, label, this.plugin.settings.showTooltips, {
      placement: previous ? "left" : "right",
      delay: 250,
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.actions.runAfterEditing(
        `desk-cycle-pile-${previous ? "previous" : "next"}`,
        async () => {
          await this.plugin.deskService.replace(cyclePileTopCard(
            this.plugin.deskService.snapshot,
            pile.id,
            direction,
          ));
          this.focusPileCycleButton(pile.id, direction);
        },
      );
    });
  }

  private focusPileCycleButton(pileId: string, direction: -1 | 1): void {
    if (this.rootEl === null) {
      return;
    }
    const pile = Array.from(this.rootEl.querySelectorAll<HTMLElement>(
      ".slipbox-desk-pile",
    )).find((candidate) => candidate.dataset.pileId === pileId);
    pile?.querySelector<HTMLButtonElement>(
      `.slipbox-desk-pile-cycle.${direction === -1 ? "is-previous" : "is-next"}`,
    )?.focus({ preventScroll: true });
  }

  private async renderCard(
    parent: HTMLElement,
    pile: DeskPile,
    card: DeskCard,
    cardIndex: number,
    pileIndex: number,
    expanded: boolean,
    filing: FilingSessionSnapshot | null,
    viewedPath: string | null,
    isCurrent: () => boolean,
  ): Promise<void> {
    const file = this.plugin.index.fileAtPath(card.cardRef);
    if (!(file instanceof TFile)) {
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    const address = filed?.address ?? null;
    const addressLabel = address ?? UNFILED_ADDRESS_LABEL;
    const displayTitle = this.plugin.cards.displayTitle(file);
    const title = displayTitle ?? file.basename;
    const isViewed = viewedPath === card.cardRef;
    const isFocused = !isViewed &&
      this.actions.isDeskCardFocused(card.cardRef, pile.id);
    const shell = parent.createDiv({
      cls: "slipbox-desk-card-shell",
    });
    const miniature = shell.createDiv({
      cls: "slipbox-desk-card",
      attr: {
        "data-card-ref": card.cardRef,
        role: isViewed || filed !== undefined ? "button" : "group",
      },
    });
    setCardTooltip(
      miniature,
      isViewed
        ? `${addressLabel}, ${title}; viewed card placeholder. Activate to focus the viewed card.`
        : `${addressLabel}, ${title}; card ${cardIndex + 1} of ${
            pile.cards.length
          } in pile ${pileIndex + 1}`,
      false,
    );
    miniature.dataset.pileId = pile.id;
    applyCardColor(miniature, this.plugin.cards.color(file));
    const jitter = deskStackJitter(card.cardRef, cardIndex);
    miniature.style.setProperty(
      "--slipbox-desk-card-tilt",
      `${jitter.rotationDegrees}deg`,
    );
    miniature.tabIndex = expanded ? 0 : -1;
    miniature.toggleClass("is-filed", filed !== undefined);
    miniature.toggleClass("is-unfiled", filed === undefined);
    miniature.toggleClass("is-viewed-ghost", isViewed);
    miniature.toggleClass("is-card-focused", isFocused);
    miniature.addEventListener("focusin", () => {
      if (isViewed) {
        this.actions.focusViewedCard();
      } else {
        this.actions.focusDeskCard(card.cardRef, pile.id);
      }
    });
    const isFilingSource = filing !== null && filingEditorMatchesSource(
      filing.sourcePath,
      filing.sourceSurface,
      card.cardRef,
      "desk",
    );
    miniature.toggleClass("is-filing-source", isFilingSource);
    miniature.toggleClass(
      "is-bookmarked",
      filed !== undefined && this.plugin.bookmarks.at(filed.path) !== undefined,
    );

    const identity = miniature.createDiv({
      cls: "slipbox-desk-card-identity",
    });
    const addressEl = this.cardSignatures.render(identity, {
      path: file.path,
      address,
      addressClass: "slipbox-desk-card-address",
      interactive: expanded && !isViewed,
    });
    if (isFilingSource && filing !== null) {
      this.filingEditor = renderInlineFilingEditor(
        addressEl,
        miniature,
        filing,
        {
          showTooltips: this.plugin.settings.showTooltips,
          onInput: (value) => this.actions.updateFilingInput(value),
          onConfirm: () => this.actions.confirmFiling(),
          onCancel: () => this.actions.cancelFiling(),
          onPreview: () => this.actions.previewFilingPlacement(),
          onFocusChange: (focused) =>
            this.actions.filingInputFocusChanged(focused),
        },
      );
      this.applyFilingGuidance(this.filingEditor.input, filing.guidance);
    } else if (filed === undefined && !isViewed) {
      setCardTooltip(
        addressEl,
        "Unfiled card address; double-click to enter an address",
        this.plugin.settings.showTooltips,
        { placement: "bottom", delay: 350 },
      );
      attachUnfiledAddressFiling(addressEl, () => {
        this.actions.focusDeskCard(card.cardRef, pile.id);
        this.actions.runAction("file-card");
      });
    }
    const headerTitle = cardHeaderTitle(
      displayTitle,
      this.plugin.settings.showTitleInDeck,
    );
    if (headerTitle !== null) {
      identity.createSpan({
        cls: "slipbox-desk-card-title",
        text: headerTitle,
      });
    }
    if (!isFilingSource && !isViewed) {
      const controls = identity.createDiv({
        cls: "slipbox-desk-card-actions",
      });
      this.cardHeaderButtonControllers.add(renderCardHeaderButtons({
        container: controls,
        context: {
          surface: "desk",
          viewedReturnSurface: null,
          filed: filed !== undefined,
          onDesk: true,
          bookmarked: filed !== undefined &&
            this.plugin.bookmarks.at(filed.path) !== undefined,
          canMoveLeft: cardIndex > 0,
          canMoveRight: cardIndex < pile.cards.length - 1,
        },
        settings: this.plugin.settings.cardHeaderButtons,
        buttonClass: "slipbox-desk-card-action",
        showTooltips: this.plugin.settings.showTooltips,
        tooltipPlacement: "bottom",
        run: (action) =>
          this.actions.runCardAction(action, card.cardRef, pile.id),
      }));
    }

    if (isViewed) {
      miniature.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.cancelPendingCardClick();
        this.actions.focusViewedCard();
      });
      miniature.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        if (event.key === "Enter") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.actions.focusViewedCard();
      });
      miniature.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (expanded) {
          this.showCardMenu(event, pile, card);
        } else {
          this.showPileMenu(event, pile, card);
        }
      });
      return;
    }

    const preview = miniature.createDiv({
      cls: "slipbox-desk-card-preview markdown-rendered",
    });
    this.previews.set(file.path, preview);
    preview.addEventListener("dblclick", (event) => {
      if (
        event.targetNode?.instanceOf(Element) === true &&
        event.targetNode.closest(
          "a, button, input, textarea, select, [contenteditable='true']",
        ) !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.cancelPendingCardClick();
      this.actions.focusDeskCard(card.cardRef, pile.id);
      this.actions.runAction("edit-card");
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
        this.applyBranchLinkOutlines(preview, file);
        applyRenderedLinkAccessibility(
          preview,
          this.plugin.settings.followLinksFromCards,
          this.plugin.settings.showTooltips,
        );
      }
    } catch {
      preview.setText("Preview unavailable");
    }

    miniature.addEventListener("click", (event) => {
      this.actions.focusDeskCard(card.cardRef, pile.id);
      if (event.win.performance.now() < this.suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        event.targetNode?.instanceOf(Element) === true &&
        event.targetNode.closest("button, a, input, textarea, select") !== null
      ) {
        return;
      }
      if (
        event.targetNode?.instanceOf(Element) === true &&
        event.targetNode.closest(".slipbox-desk-card-preview") !== null
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (deskCardPrimaryClickIntent(expanded) === "expand-pile") {
          this.scheduleCardClick(() => {
            void this.actions.runAfterEditing(
              "desk-expand-pile",
              () => this.plugin.deskService.setPileExpanded(pile.id, true),
            );
          });
        }
        return;
      }
      if (deskCardPrimaryClickIntent(expanded) === "expand-pile") {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.runAfterEditing(
          "desk-expand-pile",
          () => this.plugin.deskService.setPileExpanded(pile.id, true),
        );
      }
    });
    miniature.addEventListener("contextmenu", (event) => {
      if (
        event.targetNode?.instanceOf(Element) === true &&
        event.targetNode.closest("button, a, input, textarea, select") !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.actions.focusDeskCard(card.cardRef, pile.id);
      if (expanded) {
        this.showCardMenu(event, pile, card);
      } else {
        this.showPileMenu(event, pile, card);
      }
    });
    this.attachCardDragging(miniature, pile, card, expanded);
  }

  private renderStackLayers(parent: HTMLElement, pile: DeskPile): void {
    const hiddenCards = pile.cards.slice(1, 8);
    hiddenCards.forEach((card, index) => {
      const depth = index + 1;
      const jitter = deskStackJitter(card.cardRef, depth);
      const layer = parent.createDiv({
        cls: "slipbox-desk-stack-layer",
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
    attachRenderedLinkInteractions(preview, {
      previewEnabled: this.plugin.settings.previewLinksOnHover,
      followEnabled: this.plugin.settings.followLinksFromCards,
      showTooltips: this.plugin.settings.showTooltips,
      preview: (event, link, linktext) => {
        this.actions.previewLink(event, link, linktext, sourcePath);
      },
      follow: (event, link, linktext) => {
        const internal = link.matches(".internal-link");
        const newLeaf = event.metaKey || event.ctrlKey || event.button === 1;
        void this.actions.runAfterEditing("desk-rendered-link", async () => {
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
            link.win.open(link.href, "_blank", "noopener");
          }
        });
      },
    });
  }

  private applyBranchLinkOutlines(target: HTMLElement, file: TFile): void {
    applyRenderedBranchLinkOutlines(target, {
      enabled: this.plugin.settings.explicitBranchLinks,
      outline: this.plugin.settings.outlineBranchLinks,
      hideMarker: this.plugin.settings.hideBranchLinkMarkers,
      links: this.app.metadataCache.getFileCache(file)?.links ?? [],
      targetAddressForLink: (link) =>
        this.filedAddressForRenderedLink(link, file.path),
    });
  }

  private filedAddressForRenderedLink(
    link: string,
    sourcePath: string,
  ): string | undefined {
    const target = resolveFiledCardLink(getLinkpath(link), sourcePath, {
      resolveFile: (path, source) =>
        this.app.metadataCache.getFirstLinkpathDest(path, source),
      filedPathForFile: (file) =>
        this.plugin.index.filedByFile(file)?.path,
      firstFiledPathAtAddress: (address) =>
        this.plugin.index.firstFiledAtAddress(address)?.path,
    });
    return target === undefined
      ? undefined
      : this.plugin.index.filedByPath(target.path)?.address;
  }

  private showPileMenu(
    event: MouseEvent,
    pile: DeskPile,
    visibleCard?: DeskCard,
  ): void {
    const menu = Menu.forEvent(event);
    if (
      visibleCard !== undefined &&
      this.addCardFileMenuItems(menu, visibleCard, pile.id)
    ) {
      menu.addSeparator();
    }
    this.addPileOrderingMenuItems(menu, pile);
    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle("Lay out pile on active Canvas")
        .setIcon("layout-dashboard")
        .setDisabled(!this.plugin.deskCanvas.hasActiveCanvas())
        .onClick(() => this.actions.runAfterEditing(
          "desk-layout-active-canvas",
          () => this.plugin.deskCanvas.layoutPileOnActiveCanvas(pile.id),
        ));
    });
    menu.addItem((item) => {
      item
        .setTitle("Lay out pile on Canvas…")
        .setIcon("layout-template")
        .onClick(() => this.actions.runAfterEditing(
          "desk-layout-canvas",
          () => this.plugin.deskCanvas.layoutPileOnCanvas(pile.id),
        ));
    });
    menu.addItem((item) => {
      item
        .setTitle("Create Canvas from pile…")
        .setIcon("file-plus-2")
        .onClick(() => this.actions.runAfterEditing(
          "desk-create-canvas",
          () => this.plugin.deskCanvas.createCanvasFromPile(pile.id),
        ));
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle("Return filed cards in this pile")
        .setIcon("eraser")
        .setDisabled(!pile.cards.some((card) => card.kind === "filed"))
        .onClick(() => this.actions.runAfterEditing(
          "desk-return-pile",
          () => this.plugin.deskService.clearPile(pile.id),
        ));
    });
    menu.showAtMouseEvent(event);
  }

  private showCardMenu(event: MouseEvent, pile: DeskPile, card: DeskCard): void {
    const state = this.plugin.deskService.snapshot;
    const position = cardPosition(state, card.cardRef);
    if (position === null) {
      return;
    }
    const pileEl = (event.currentTarget as HTMLElement | null)
      ?.closest<HTMLElement>(".slipbox-desk-pile") ?? null;
    const pileOrigin = pile.position ?? this.renderedPilePosition(pileEl) ?? {
      x: 0,
      y: 0,
    };
    const menu = Menu.forEvent(event);
    if (this.addCardFileMenuItems(menu, card, pile.id)) {
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
          const newPileId = this.plugin.deskService.createPileId();
          const split = splitCardIntoNewPile(state, card.cardRef, newPileId);
          this.moveAndFocus(
            setPilePosition(split, newPileId, {
              x: pileOrigin.x + 38,
              y: pileOrigin.y + 38,
            }),
            card.cardRef,
          );
        });
    });
    menu.addSeparator();
    this.addPileOrderingMenuItems(menu, pile);
    menu.showAtMouseEvent(event);
  }

  private addPileOrderingMenuItems(menu: Menu, pile: DeskPile): void {
    const state = this.plugin.deskService.snapshot;
    const pileIndex = state.piles.findIndex((candidate) =>
      candidate.id === pile.id
    );
    const lastPileIndex = state.piles.length - 1;
    menu.addItem((item) => {
      item
        .setTitle("Bring pile to front")
        .setIcon("bring-to-front")
        .setDisabled(pileIndex < 0 || pileIndex === lastPileIndex)
        .onClick(() => this.actions.runAfterEditing(
          "desk-bring-pile-to-front",
          () => this.plugin.deskService.replace(movePileToOrdinalBoundary(
            this.plugin.deskService.snapshot,
            pile.id,
            "front",
          )),
        ));
    });
    menu.addItem((item) => {
      item
        .setTitle("Send pile to back")
        .setIcon("send-to-back")
        .setDisabled(pileIndex <= 0)
        .onClick(() => this.actions.runAfterEditing(
          "desk-send-pile-to-back",
          () => this.plugin.deskService.replace(movePileToOrdinalBoundary(
            this.plugin.deskService.snapshot,
            pile.id,
            "back",
          )),
        ));
    });
  }

  private addCardFileMenuItems(
    menu: Menu,
    card: DeskCard,
    pileId: string,
  ): boolean {
    const file = this.plugin.index.fileAtPath(card.cardRef);
    if (file === undefined) {
      return false;
    }
    const filed = this.plugin.index.filedByFile(file);
    const position = cardPosition(this.plugin.deskService.snapshot, card.cardRef);
    const run = (action: SlipboxAction): void => {
      this.actions.focusDeskCard(card.cardRef, pileId);
      this.actions.runAction(action);
    };
    addCardContextMenuItems({
      menu,
      title: this.plugin.cards.title(file),
      surface: "desk",
      viewedReturnSurface: null,
      filed: filed !== undefined,
      onDesk: true,
      bookmarked: filed !== undefined &&
        this.plugin.bookmarks.at(filed.path) !== undefined,
      canMoveLeft: position !== null && position.cardIndex > 0,
      canMoveRight: position !== null &&
        position.cardIndex < position.pileSize - 1,
      run,
    });
    return true;
  }

  private attachCardDragging(
    element: HTMLElement,
    pile: DeskPile,
    card: DeskCard,
    expanded: boolean,
  ): void {
    if (!expanded) {
      return;
    }
    element.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (
          event.targetNode?.instanceOf(Element) === true &&
          event.targetNode.closest("button, a, input, textarea, select") !== null
        )
      ) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      beginPointerActionAfterGate(
        event,
        (action) => this.actions.runAfterEditing("desk-card-drag", action),
        () => {
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
              this.suppressClickUntil = upEvent.win.performance.now() + 400;
              const next = this.cardDropState(
                card.cardRef,
                pile.id,
                upEvent.clientX,
                upEvent.clientY,
                element,
              );
              const nextPosition = cardPosition(next, card.cardRef);
              if (nextPosition !== null) {
                this.actions.focusDeskCard(card.cardRef, nextPosition.pileId);
              }
              this.clearDropCues();
              void this.plugin.deskService.replace(next);
            },
            onCancel: () => this.clearDropCues(),
          });
        },
      );
    });
  }

  private attachPileDragging(
    element: HTMLElement,
    dragSurface: HTMLElement,
    pile: DeskPile,
  ): void {
    dragSurface.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (
          dragSurface === element &&
          event.targetNode?.instanceOf(Element) === true &&
          event.targetNode.closest("button, a, input, textarea, select") !== null
        )
      ) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      beginPointerActionAfterGate(
        event,
        (action) => this.actions.runAfterEditing("desk-pile-drag", action),
        () => {
          const origin = this.renderedPilePosition(element) ?? pile.position ?? {
            x: 0,
            y: 0,
          };
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
              this.suppressClickUntil = upEvent.win.performance.now() + 400;
              const next = this.pileDropState(
                pile.id,
                upEvent.clientX,
                upEvent.clientY,
                element,
                {
                  x: origin.x + upEvent.clientX - startX,
                  y: origin.y + upEvent.clientY - startY,
                },
              );
              this.clearDropCues();
              void this.plugin.deskService.replace(next);
            },
            onCancel: () => {
              element.setCssProps({ translate: "" });
              this.clearDropCues();
            },
          });
        },
      );
    });
  }

  private cardDropState(
    cardRef: string,
    sourcePileId: string,
    x: number,
    y: number,
    dragged: HTMLElement,
  ) {
    const state = this.plugin.deskService.snapshot;
    const targetPileEl = cardDropTargetPile(
      this.elementsBelowPoint(x, y, dragged),
      sourcePileId,
    );
    const targetPileId = targetPileEl?.dataset.pileId;
    if (targetPileEl !== null && targetPileId !== undefined) {
      const cards = Array.from(targetPileEl.querySelectorAll<HTMLElement>(
        ".slipbox-desk-card:not(.is-dragging)",
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
      const newPileId = this.plugin.deskService.createPileId();
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
    newPosition: DeskPilePosition,
  ) {
    const state = this.plugin.deskService.snapshot;
    const target = this.elementsBelowPoint(x, y, dragged)
      .find((element) =>
        element.matches(".slipbox-desk-pile") &&
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
    const targetPile = cardDropTargetPile(elements, sourcePileId);
    if (targetPile === null) {
      return;
    }
    targetPile.addClass(
      targetPile.dataset.pileId === sourcePileId
        ? "is-reorder-target"
        : "is-card-drop-target",
    );
    const targetCard = elements.find(
      (element) => element.matches(".slipbox-desk-card"),
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
      element.matches(".slipbox-desk-pile") &&
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
      return dragged.doc.elementsFromPoint(x, y);
    } finally {
      dragged.removeClass("slipbox-ignore-pointer-events");
    }
  }

  private positionAtPoint(
    x: number,
    y: number,
    coordinateElement: HTMLElement | null = this.pilesAnchorEl,
    hitBoundsElement: HTMLElement | null = null,
  ): DeskPilePosition | null {
    const rect = coordinateElement?.getBoundingClientRect();
    const hitBounds = (hitBoundsElement ?? this.workspaceEl)
      ?.getBoundingClientRect();
    if (rect === undefined || hitBounds === undefined) {
      return null;
    }
    return pilePositionAtWorkspacePoint(x, y, rect, hitBounds);
  }

  positionDeckCardAtPoint(
    x: number,
    y: number,
  ): DeskPilePosition | null {
    const rect = this.pilesAnchorEl?.getBoundingClientRect();
    const hitBounds = this.workspaceEl?.getBoundingClientRect();
    if (rect === undefined || hitBounds === undefined) {
      return null;
    }
    return pileHeaderPositionAtWorkspacePoint(x, y, rect, hitBounds);
  }

  private renderedPilePosition(
    pile: HTMLElement | null,
  ): DeskPilePosition | null {
    const anchor = this.pilesAnchorEl;
    if (pile === null || anchor === null) {
      return null;
    }
    const pileRect = pile.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    return {
      x:
        pileRect.left + pileRect.width / 2 -
        (anchorRect.left + anchorRect.width / 2),
      y:
        pileRect.top + pileRect.height / 2 -
        (anchorRect.top + anchorRect.height / 2),
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

  private moveAndFocus(nextState: DeskState, cardRef: string): void {
    void this.actions.runAfterEditing("desk-menu-move-card", async () => {
      await this.plugin.deskService.replace(nextState);
      const ownerWindow = this.rootEl?.win;
      ownerWindow?.requestAnimationFrame(() => {
        const escaped = CSS.escape(cardRef);
        this.rootEl
          ?.querySelector<HTMLElement>(`.slipbox-desk-card[data-card-ref="${escaped}"]`)
          ?.focus({ preventScroll: true });
      });
    });
  }

  private scheduleCardClick(action: () => void): void {
    this.cancelPendingCardClick();
    const ownerWindow = this.rootEl?.win;
    if (ownerWindow === undefined) {
      return;
    }
    this.pendingCardClickWindow = ownerWindow;
    this.pendingCardClickTimer = ownerWindow.setTimeout(() => {
      this.pendingCardClickTimer = null;
      this.pendingCardClickWindow = null;
      action();
    }, DESK_SINGLE_CLICK_DELAY_MS);
  }

  private cancelPendingCardClick(): void {
    if (
      this.pendingCardClickTimer !== null &&
      this.pendingCardClickWindow !== null
    ) {
      this.pendingCardClickWindow.clearTimeout(this.pendingCardClickTimer);
      this.pendingCardClickTimer = null;
      this.pendingCardClickWindow = null;
    }
  }
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
