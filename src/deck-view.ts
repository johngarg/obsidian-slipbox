import {
  Component,
  ItemView,
  MarkdownRenderer,
  Notice,
  Scope,
  TFile,
  WorkspaceLeaf,
  getLinkpath,
  setIcon,
  setTooltip,
  type KeymapEventHandler,
  type Modifier,
} from "obsidian";

import type SlipboxPlugin from "./main.js";
import {
  activeIndexForViewport,
  adjacentBookmarkIndex,
  bookmarkEdgeTargets,
  cardMotionStyle,
  cardStackOrder,
  centredViewportPosition,
  clampViewportPosition,
  deckIndexByDelta,
  stationarySelectionOffset,
} from "./deck-motion.js";
import type { FiledCard } from "./card-index.js";
import { CardFooterManager } from "./card-footer.js";
import { cardHeaderTitle } from "./card-title.js";
import {
  renderedLinkAction,
  resolveFiledCardLink,
} from "./card-links.js";
import { canRunDeckAction } from "./deck-actions.js";
import {
  renderCardHeaderButtons,
  type CardHeaderButtonController,
} from "./card-header-buttons.js";
import {
  DECK_ACTION_DEFINITIONS,
  type DeckAction,
} from "./settings.js";
import {
  TrayRenderer,
  type TrayFilingState,
} from "./tray-view.js";
import {
  collapseAllPiles,
  cardPosition,
  moveCardWithinPile,
  placeFiledCardInPileOrdinal,
  trayHasFiledCards,
} from "./tray-state.js";
import {
  pathIsAtOrBelow,
  renamePathReference,
} from "./path-reference.js";
import { normalizeAddressInput } from "./address-order.js";
import {
  filingPreviewFocusPath,
  initialFilingAddress,
  type FilingPreview,
} from "./filing-preview.js";
import {
  shouldSuspendDeckShortcut,
} from "./filing-editor.js";
import {
  buildDeckMapSectionMarkers,
  deckMapCoordinate,
  deckMapIndexAtOffset,
  sampleDeckMapIndices,
  visibleDeckMapSectionMarkers,
  type DeckMapSectionMarker,
} from "./deck-map.js";
import {
  IDLE_DECK_COMMAND,
  advancePendingDeckCommand,
  findAddressInitialIndex,
  installPendingDeckCommandKeyCapture,
  startAddressCommand,
  startPileCommand,
  type AddressInitialMode,
  type PendingDeckCommand,
} from "./deck-commands.js";
import {
  DEFAULT_DECK_MAP_VISIBILITY,
  applyDeckMapVisibility,
  toggleDeckMapVisibility,
  type DeckMapVisibility,
} from "./deck-chrome.js";
import {
  InlineEditFinalizationCoordinator,
  InlineEditSessionController,
  runAfterInlineEditing,
  type InlineEditFailure,
  type InlineEditOrigin,
} from "./inline-edit-session.js";
import {
  consumeDeckEscape,
  dispatchInlineAwareDeckAction,
  isInlineEditBodyTarget,
  resolveDeckEscapeAction,
  shouldNavigateDeckFromWheel,
} from "./inline-edit-interactions.js";
import { beginThresholdPointerDrag } from "./pointer-drag.js";
import {
  createViewedCardState,
  moveViewedCardState,
  renameViewedCardState,
  scrollViewedCardState,
  type ViewedCardState,
} from "./viewed-card.js";
import {
  cardFocusDeleted,
  deckCardFocus,
  deskCardFocus,
  moveDeckFocusWithAnchor,
  renameCardFocus,
  viewedCardFocus,
  type CardFocus,
} from "./card-focus.js";

export const DECK_VIEW_TYPE = "slipbox-deck";

const RENDER_EDGE_BUFFER = 2;
const LAYOUT_MEASUREMENT_RETRIES = 2;
const SPACE_RECENTER_DURATION_MS = 180;
const VIEWPORT_CENTER_DURATION_MS = 180;
const DECK_MAP_SECTION_LABEL_SPACING = 14;
const DECK_MAP_MARKER_BUDGET = 512;
const COMMAND_FEEDBACK_DURATION_MS = 1_800;
const VIEWED_CARD_DRAG_THRESHOLD_PX = 5;
const PENDING_COMMAND_ACTIONS = new Set<DeckAction>([
  "find-address-forward",
  "find-address-backward",
  "find-address-first",
  "pull-into-pile",
]);
let inlineEditStatusSequence = 0;

interface MountedInlineEdit {
  readonly controller: InlineEditSessionController;
  file: TFile;
  readonly origin: InlineEditOrigin;
  readonly textarea: HTMLTextAreaElement;
  readonly statusEl: HTMLElement;
  readonly bodyEl: HTMLElement;
  readonly cardEl: HTMLElement;
  readonly renderedScrollTop: number;
}

export class DeckView extends ItemView {
  /**
   * Slipbox is a static surface, not a navigable one.
   *
   * Leaving this at the default lets Obsidian navigate the Slipbox leaf away,
   * which is what an Escape arriving from a modal does, and what makes
   * `getLeaf(false)` treat the Slipbox leaf as reusable when opening a note.
   * The Deck's own Escape containment cannot prevent the first case, because
   * neither the view scope nor the content-element listener receives a
   * keystroke while a modal holds focus.
   */
  navigation = false;
  private activePath: string | null = null;
  private cardFocus: CardFocus | null = null;
  private filingFile: TFile | null = null;
  private filingSourcePath: string | null = null;
  private filingInputValue = "";
  private filingPreview: FilingPreview | null = null;
  private filingMessage = "Enter an address.";
  private filingConfirmationInProgress = false;
  private stageEl: HTMLElement | null = null;
  private spaceEl: HTMLElement | null = null;
  private renderedCards: HTMLElement[] = [];
  private renderComponents = new Map<string, Component>();
  private cardScrollPositions = new Map<string, number>();
  private viewportOffset = 0;
  private pointerLastX: number | null = null;
  private pointerLastY: number | null = null;
  private spaceOffsetX = 0;
  private spaceOffsetY = 0;
  private spaceRecenteringTimer: number | null = null;
  private viewportCenteringFrame: number | null = null;
  private renderWindowStart = 0;
  private renderWindowEnd = -1;
  private renderRefreshPending = false;
  private renderVersion = 0;
  private deckMapEl: HTMLElement | null = null;
  private deckMapRailEl: HTMLElement | null = null;
  private deckMapSectionLayerEl: HTMLElement | null = null;
  private deckMapBookmarkLayerEl: HTMLElement | null = null;
  private deckMapActiveMarkerEl: HTMLElement | null = null;
  private deckMapBookmarkMarkerEls = new Map<string, HTMLElement>();
  private deckMapSections: readonly DeckMapSectionMarker[] = [];
  private deckMapBookmarkCount = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly cardHeaderButtonControllers = new Set<CardHeaderButtonController>();
  private positioningFrame: number | null = null;
  private positioningRetriesRemaining = 0;
  private readonly cardFooters: CardFooterManager;
  private readonly trayRenderer: TrayRenderer;
  private keymapHandlers: KeymapEventHandler[] = [];
  private deckKeybindingsSuspended = false;
  private pendingCommand: PendingDeckCommand = IDLE_DECK_COMMAND;
  private pendingCommandStartEvent: KeyboardEvent | null = null;
  private pendingCommandEl: HTMLElement | null = null;
  private pendingCommandFeedback = "";
  private pendingCommandFeedbackTimer: number | null = null;
  private deckMapVisibility: DeckMapVisibility = DEFAULT_DECK_MAP_VISIBILITY;
  private inlineEdit: MountedInlineEdit | null = null;
  private readonly inlineEditFinalization = new InlineEditFinalizationCoordinator();
  private inlineEditStarting = false;
  private renderRefreshDeferred = false;
  private viewedCard: ViewedCardState | null = null;
  private viewedCardEl: HTMLElement | null = null;
  private viewedCardBodyEl: HTMLElement | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SlipboxPlugin,
  ) {
    super(leaf);
    this.cardFooters = new CardFooterManager({
      app: this.app,
      leaf: this.leaf,
      hoverSource: DECK_VIEW_TYPE,
      isInTray: (file) => this.plugin.isFileInTray(file),
      runAction: (action, target) => this.runAction(action, target),
      runAfterEditing: (reason, action) => {
        void this.runAfterInlineEditing(reason, action);
      },
    });
    this.trayRenderer = new TrayRenderer(this.app, this.plugin, {
      jumpToFiledCard: (path) => this.jumpToPath(path),
      updateFilingInput: (value) => this.updateFilingInput(value),
      confirmFiling: () => void this.confirmFiling(),
      cancelFiling: () => void this.cancelFiling(),
      previewFilingPlacement: () => void this.previewFilingPlacement(),
      filingInputFocusChanged: (focused) => {
        this.setDeckKeybindingsSuspended(focused);
        if (focused) {
          this.restoreFilingSourceFocus();
        }
      },
      focusViewedCard: () => this.focusViewedCard(),
      focusDeskCard: (path, pileId) => this.focusDeskCard(path, pileId),
      isDeskCardFocused: (path, pileId) =>
        this.cardFocus?.surface === "desk" &&
        this.cardFocus.path === path &&
        this.cardFocus.pileId === pileId,
      canRunAction: (action) => this.canRunAction(action),
      runAction: (action) => this.runAction(action),
      runAfterEditing: (reason, action) =>
        this.runAfterInlineEditing(reason, action),
    });
    this.registerEvent(
      this.app.workspace.on("css-change", () => this.cardFooters.scheduleLayout()),
    );
    this.scope = new Scope(this.app.scope);
    this.updateKeybindings();
  }

  getViewType(): string {
    return DECK_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Slipbox";
  }

  getIcon(): string {
    return "archive";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("slipbox-deck-view");
    this.contentEl.tabIndex = 0;
    this.register(installPendingDeckCommandKeyCapture(
      this.contentEl.ownerDocument,
      {
        isPending: () => this.pendingCommand.kind !== "idle",
        isActive: () => this.app.workspace.getActiveViewOfType(DeckView) === this,
        shouldIgnore: (event) => {
          if (event !== this.pendingCommandStartEvent) {
            return false;
          }
          this.pendingCommandStartEvent = null;
          return true;
        },
        handle: (event) => {
          this.handleDeckCommandContinuation(event);
        },
      },
    ));
    this.registerDomEvent(this.contentEl, "keydown", (event) => {
      if (this.handleDeckEscape(event)) {
        return;
      }
      if (
        this.filingFile !== null &&
        event.key === "Tab" &&
        event.shiftKey &&
        event.target !== this.trayRenderer.filingInput
      ) {
        event.preventDefault();
        this.restoreFilingSourceFocus();
        this.trayRenderer.focusFilingInputNow();
      }
    }, { capture: true });
    this.registerDomEvent(
      this.contentEl.ownerDocument,
      "pointerdown",
      (event) => this.handleInlineEditPointerDown(event),
      { capture: true },
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (this.inlineEdit !== null && leaf !== this.leaf) {
          void this.finishInlineEditing("active-leaf-change");
        }
      }),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        if (this.inlineEdit !== null) {
          void this.finishInlineEditing("file-open");
        }
      }),
    );
    this.registerEvent(
      this.app.workspace.on("window-open", () => {
        if (this.inlineEdit !== null) {
          void this.finishInlineEditing("popout-window-open");
        }
      }),
    );
    this.registerEvent(
      this.app.workspace.on("window-close", () => {
        if (this.inlineEdit !== null) {
          void this.finishInlineEditing("popout-window-close");
        }
      }),
    );
    const ownerWindow = this.contentEl.ownerDocument.defaultView;
    if (ownerWindow !== null) {
      this.registerDomEvent(ownerWindow, "blur", () => {
        if (this.inlineEdit !== null) {
          void this.finishInlineEditing("window-blur");
        }
      });
    }
    this.registerDomEvent(this.contentEl.ownerDocument, "visibilitychange", () => {
      if (
        this.inlineEdit !== null &&
        this.contentEl.ownerDocument.visibilityState === "hidden"
      ) {
        void this.finishInlineEditing("view-hidden");
      }
    });
    this.observeDeckSize();
    await this.refresh();
    await this.restoreDetachedInlineEdit();
  }

  async onClose(): Promise<void> {
    const saved = await this.finishInlineEditing("view-close");
    if (!saved && this.inlineEdit !== null) {
      const editing = this.inlineEdit;
      editing.controller.cancelDebounce();
      this.plugin.retainDetachedInlineEdit(
        editing.controller.snapshot,
        editing.file,
        {
          selectionStart: editing.textarea.selectionStart,
          selectionEnd: editing.textarea.selectionEnd,
          textareaScrollTop: editing.textarea.scrollTop,
          renderedScrollTop: editing.renderedScrollTop,
        },
      );
      this.plugin.releaseInlineEdit(editing.controller.snapshot.path, this);
      this.inlineEdit = null;
      this.setDeckKeybindingsSuspended(false);
    }
    this.cancelViewportCentering();
    this.cancelSpaceRecentering();
    this.cardFooters.clear();
    this.trayRenderer.clear();
    this.clearCardHeaderButtonControllers();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.positioningFrame !== null) {
      window.cancelAnimationFrame(this.positioningFrame);
      this.positioningFrame = null;
    }
    this.positioningRetriesRemaining = 0;
    this.rememberScrollPositions();
    this.unloadRenderComponents();
    this.clearPendingCommand();
    this.filingFile = null;
    this.filingSourcePath = null;
    this.filingPreview = null;
    this.filingConfirmationInProgress = false;
    this.stageEl = null;
    this.spaceEl = null;
    this.viewedCard = null;
    this.viewedCardEl = null;
    this.viewedCardBodyEl = null;
    this.cardFocus = null;
    this.spaceOffsetX = 0;
    this.spaceOffsetY = 0;
    this.renderedCards = [];
    this.deckMapEl = null;
    this.deckMapRailEl = null;
    this.deckMapSectionLayerEl = null;
    this.deckMapBookmarkLayerEl = null;
    this.deckMapActiveMarkerEl = null;
    this.deckMapBookmarkMarkerEls.clear();
    this.deckMapSections = [];
    this.deckMapBookmarkCount = 0;
    this.pendingCommandEl = null;
    this.pendingCommandStartEvent = null;
  }

  onResize(): void {
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
    this.updateDeckMapSectionLabels();
    this.constrainViewedCard();
  }

  get activeCard(): FiledCard | null {
    if (this.activePath === null) {
      return null;
    }
    return this.plugin.index.filedByPath(this.activePath) ?? null;
  }

  get focusedCardFile(): TFile | null {
    return this.cardFocus === null
      ? null
      : this.plugin.index.fileAtPath(this.cardFocus.path) ?? null;
  }

  get focusedFiledCard(): FiledCard | null {
    const file = this.focusedCardFile;
    return file === null ? null : this.plugin.index.filedByFile(file) ?? null;
  }

  get cardFocusState(): CardFocus | null {
    return this.cardFocus;
  }

  get focusedDeckCardPath(): string | null {
    return this.cardFocus?.surface === "deck" ? this.cardFocus.path : null;
  }

  private setCardFocus(focus: CardFocus | null): void {
    this.cardFocus = focus;
    this.applyCardFocusClasses();
  }

  private focusDeskCard(path: string, pileId: string): void {
    this.setCardFocus(deskCardFocus(path, pileId));
  }

  /**
   * Focus a card that is currently placed on the Desk.
   *
   * Call this only after the Desk has been rendered, so that the focus classes
   * land on a mounted card. Returns false when the path is not on the Desk.
   */
  focusDeskCardAtPath(path: string): boolean {
    const position = cardPosition(this.plugin.tray, path);
    if (position === null) {
      return false;
    }
    this.focusDeskCard(path, position.pileId);
    return true;
  }

  private focusDeckCard(path: string): void {
    if (this.plugin.index.filedByPath(path) === undefined) {
      return;
    }
    if (path !== this.activePath) {
      this.selectCardWithoutMoving(path);
    }
    this.setCardFocus(deckCardFocus(path));
  }

  private setDeckAnchor(path: string): void {
    this.activePath = path;
    this.cardFocus = moveDeckFocusWithAnchor(this.cardFocus, path);
  }

  private applyCardFocusClasses(): void {
    for (const card of this.renderedCards) {
      const path = card.dataset.path;
      card.toggleClass("is-deck-anchor", path === this.activePath);
      card.toggleClass(
        "is-card-focused",
        path !== undefined &&
        this.cardFocus?.surface === "deck" &&
        this.cardFocus.path === path,
      );
    }
    this.stageEl?.querySelectorAll<HTMLElement>(".slipbox-tray-card")
      .forEach((card) => {
        const path = card.dataset.cardRef;
        const pileId = card.dataset.pileId;
        card.toggleClass(
          "is-card-focused",
          !card.hasClass("is-viewed-ghost") &&
          path !== undefined &&
          pileId !== undefined &&
          this.cardFocus?.surface === "desk" &&
          this.cardFocus.path === path &&
          this.cardFocus.pileId === pileId,
        );
      });
    if (this.viewedCardEl !== null) {
      this.viewedCardEl.toggleClass(
        "is-card-focused",
        this.viewedCard !== null &&
        this.cardFocus?.surface === "viewed" &&
        this.cardFocus.path === this.viewedCard.path,
      );
    }
  }

  private reconcileCardFocus(): void {
    const focus = this.cardFocus;
    if (focus?.surface === "deck" && this.activePath !== null) {
      this.cardFocus = deckCardFocus(this.activePath);
      return;
    }
    if (
      focus?.surface === "viewed" &&
      this.viewedCard?.path === focus.path &&
      this.plugin.index.fileAtPath(focus.path) !== undefined
    ) {
      return;
    }
    if (focus?.surface === "desk") {
      const pile = this.plugin.tray.piles.find((candidate) =>
        candidate.id === focus.pileId
      );
      const index = pile?.cards.findIndex((card) => card.cardRef === focus.path) ?? -1;
      if (pile !== undefined && index >= 0) {
        if (this.plugin.tray.expandedPileIds.includes(pile.id) || index === 0) {
          return;
        }
        const top = pile.cards[0];
        if (top !== undefined) {
          this.cardFocus = deskCardFocus(top.cardRef, pile.id);
          return;
        }
      }
    }
    if (this.activePath !== null) {
      this.cardFocus = deckCardFocus(this.activePath);
      return;
    }
    const firstPile = this.plugin.tray.piles[0];
    const firstCard = firstPile?.cards[0];
    this.cardFocus = firstPile !== undefined && firstCard !== undefined
      ? deskCardFocus(firstCard.cardRef, firstPile.id)
      : null;
  }

  get isFiling(): boolean {
    return this.filingFile !== null;
  }

  handlePathRename(oldPath: string, newPath: string): void {
    const editing = this.inlineEdit;
    const editingPath = editing?.controller.snapshot.path ?? null;
    const renamedEditingPath = editingPath === null
      ? null
      : renamePathReference(editingPath, oldPath, newPath);
    if (
      editing !== null &&
      editingPath !== null &&
      renamedEditingPath !== null &&
      renamedEditingPath !== editingPath
    ) {
      if (!this.plugin.renameInlineEdit(editingPath, renamedEditingPath, this)) {
        editing.controller.markConflict(
          "The renamed path is already being edited in another Slipbox view.",
        );
        this.applyInlineEditFailure(editing.controller.snapshot.failure);
      } else {
        editing.controller.renamePath(renamedEditingPath);
        const renamed = this.plugin.index.fileAtPath(renamedEditingPath);
        if (renamed !== undefined) {
          editing.file = renamed;
        }
        editing.cardEl.dataset.path = renamedEditingPath;
        const component = this.renderComponents.get(editingPath);
        if (component !== undefined) {
          this.renderComponents.delete(editingPath);
          this.renderComponents.set(renamedEditingPath, component);
        }
      }
    }
    if (this.activePath !== null) {
      this.activePath = renamePathReference(this.activePath, oldPath, newPath);
    }
    this.cardFocus = renameCardFocus(this.cardFocus, oldPath, newPath);
    this.cardScrollPositions = new Map(
      [...this.cardScrollPositions].map(([path, scroll]) => [
        renamePathReference(path, oldPath, newPath),
        scroll,
      ]),
    );
    if (this.filingSourcePath !== null) {
      this.filingSourcePath = renamePathReference(
        this.filingSourcePath,
        oldPath,
        newPath,
      );
      this.recalculateFilingPreview();
    }
    const viewed = this.viewedCard;
    if (viewed !== null) {
      const renamedPath = renamePathReference(viewed.path, oldPath, newPath);
      if (renamedPath !== viewed.path) {
        this.viewedCard = renameViewedCardState(viewed, renamedPath);
        if (this.viewedCardEl !== null) {
          this.viewedCardEl.dataset.path = renamedPath;
        }
        const component = this.renderComponents.get(viewed.path);
        if (component !== undefined) {
          this.renderComponents.delete(viewed.path);
          this.renderComponents.set(renamedPath, component);
        }
      }
    }
  }

  handlePathDeletion(deletedPath: string): void {
    const editingPath = this.inlineEdit?.controller.snapshot.path ?? null;
    if (editingPath !== null && pathIsAtOrBelow(editingPath, deletedPath)) {
      this.inlineEdit?.controller.markConflict(
        "The card was deleted while it was being edited. Your draft was kept.",
        true,
      );
      this.applyInlineEditFailure(this.inlineEdit?.controller.snapshot.failure ?? null);
    }
    if (
      this.activePath !== null &&
      pathIsAtOrBelow(this.activePath, deletedPath) &&
      this.activePath !== editingPath
    ) {
      this.activePath = null;
    }
    if (cardFocusDeleted(this.cardFocus, deletedPath)) {
      this.cardFocus = null;
    }
    for (const path of this.cardScrollPositions.keys()) {
      if (pathIsAtOrBelow(path, deletedPath)) {
        this.cardScrollPositions.delete(path);
      }
    }
    if (
      this.filingSourcePath !== null &&
      pathIsAtOrBelow(this.filingSourcePath, deletedPath)
    ) {
      this.clearFilingPlacement();
      this.filingMessage = "The source card no longer exists.";
    }
    if (
      this.viewedCard !== null &&
      pathIsAtOrBelow(this.viewedCard.path, deletedPath) &&
      this.viewedCard.path !== editingPath
    ) {
      this.viewedCard = null;
      this.viewedCardEl = null;
      this.viewedCardBodyEl = null;
    }
  }

  updateKeybindings(): void {
    const scope = this.scope;
    if (scope === null) {
      return;
    }
    for (const handler of this.keymapHandlers) {
      scope.unregister(handler);
    }
    this.keymapHandlers = [];
    const escapeHandler = scope.register([], "Escape", (event) => {
      return this.handleDeckEscape(event) ? false : undefined;
    });
    this.keymapHandlers.push(escapeHandler);
    if (!this.deckKeybindingsSuspended) {
      for (const definition of DECK_ACTION_DEFINITIONS) {
        for (const binding of this.plugin.settings.deckKeybindings[definition.id]) {
          const handler = scope.register(
            [...binding.modifiers] as Modifier[],
            binding.key,
            (event) => this.handleDeckActionKey(
              event,
              definition.id,
              definition.repeatable,
            ),
          );
          this.keymapHandlers.push(handler);
        }
      }
    }
  }

  private setDeckKeybindingsSuspended(suspended: boolean): void {
    if (this.deckKeybindingsSuspended === suspended) {
      return;
    }
    if (suspended) {
      this.clearPendingCommand();
    }
    this.deckKeybindingsSuspended = suspended;
    this.updateKeybindings();
  }

  private handleDeckEscape(event: KeyboardEvent): boolean {
    if (this.app.workspace.getActiveViewOfType(DeckView) !== this) {
      return false;
    }
    const action = resolveDeckEscapeAction(event, {
      editing: this.inlineEdit !== null,
      pendingCommand: this.pendingCommand.kind !== "idle",
      filing: this.filingFile !== null && !this.filingConfirmationInProgress,
    });
    if (action === null) {
      return false;
    }
    consumeDeckEscape(event);

    if (action === "finish-editing") {
      void this.finishInlineEditing("escape");
    } else if (action === "cancel-pending-command") {
      this.handleDeckCommandContinuation(event);
    } else if (action === "cancel-filing") {
      void this.cancelFiling();
    }
    return true;
  }

  canRunAction(action: DeckAction, target?: FiledCard): boolean {
    if (action === "confirm-filing") {
      return this.filingFile !== null &&
        this.filingPreview !== null &&
        !this.filingConfirmationInProgress;
    }
    if (action === "cancel-filing") {
      return this.filingFile !== null && !this.filingConfirmationInProgress;
    }
    const filed = this.plugin.index.snapshot.filed;
    const active = this.activeCard;
    const activeIndex = active === null
      ? -1
      : this.plugin.index.filedIndexForPath(active.path);
    const needsBookmarkTarget =
      action === "previous-bookmark" || action === "next-bookmark";
    const bookmarkIndices = needsBookmarkTarget && activeIndex >= 0
      ? this.bookmarkIndices()
      : [];
    const focusedFile = target?.file ?? this.focusedCardFile;
    const focusedFiled = target ?? this.focusedFiledCard;
    const focusedPosition = this.cardFocus?.surface === "desk"
      ? cardPosition(this.plugin.tray, this.cardFocus.path)
      : null;
    return canRunDeckAction(action, {
      hasActiveCard: activeIndex >= 0,
      hasPreviousCard: activeIndex > 0,
      hasNextCard: activeIndex >= 0 && activeIndex < filed.length - 1,
      hasPreviousBookmark:
        action === "previous-bookmark" &&
        adjacentBookmarkIndex(bookmarkIndices, activeIndex, -1) !== null,
      hasNextBookmark:
        action === "next-bookmark" &&
        adjacentBookmarkIndex(bookmarkIndices, activeIndex, 1) !== null,
      hasProblems: this.plugin.index.snapshot.issues.length > 0,
      filing: this.filingFile !== null,
      hasFocusedCard: focusedFile !== null,
      focusedCardFiled: focusedFiled !== null,
      focusedCardUnfiled:
        focusedFile !== null &&
        focusedFiled === null &&
        this.cardFocus?.surface !== "deck",
      focusedSurface: target === undefined
        ? this.cardFocus?.surface ?? null
        : "deck",
      canMoveDeskCardLeft:
        focusedPosition !== null && focusedPosition.cardIndex > 0,
      canMoveDeskCardRight:
        focusedPosition !== null &&
        focusedPosition.cardIndex < focusedPosition.pileSize - 1,
      hasExpandedPiles: this.plugin.tray.expandedPileIds.length > 0,
      hasFiledDeskCards: trayHasFiledCards(this.plugin.tray),
    });
  }

  runAction(action: DeckAction, target?: FiledCard): boolean {
    if (target !== undefined) {
      this.focusDeckCard(target.path);
    }
    if (!this.canRunAction(action, target)) {
      return false;
    }
    const file = target?.file ?? this.focusedCardFile;
    const card = target ?? this.focusedFiledCard;
    return dispatchInlineAwareDeckAction(
      {
        editing: this.inlineEdit !== null,
        starting: this.inlineEditStarting,
      },
      (semanticAction) => this.runAfterInlineEditing(
        `deck-action:${action}`,
        semanticAction,
      ),
      () => this.performAction(action, file, card),
    );
  }

  private performAction(
    action: DeckAction,
    file: TFile | null,
    card: FiledCard | null,
  ): void {
    switch (action) {
      case "previous-card":
        this.moveBy(-1);
        break;
      case "next-card":
        this.moveBy(1);
        break;
      case "previous-bookmark":
        this.jumpToAdjacentBookmark(-1);
        break;
      case "next-bookmark":
        this.jumpToAdjacentBookmark(1);
        break;
      case "forward-ten-cards":
        this.moveBy(10);
        break;
      case "backward-ten-cards":
        this.moveBy(-10);
        break;
      case "centre-card":
        this.centerActiveCard();
        break;
      case "first-card":
        this.goToDeckBoundary("start");
        break;
      case "last-card":
        this.goToDeckBoundary("end");
        break;
      case "open-note":
        if (file !== null) {
          void this.plugin.openMarkdownFile(file);
        }
        break;
      case "copy-link":
        if (card !== null) {
          void this.plugin.copyCardLink(card);
        }
        break;
      case "toggle-tray":
        if (card !== null) {
          if (
            this.cardFocus?.surface === "desk" &&
            this.plugin.isFileInTray(card.file)
          ) {
            this.setDeckAnchor(card.path);
            this.cardFocus = deckCardFocus(card.path);
            this.viewportOffset = 0;
          }
          void this.plugin.toggleFileInTray(card.file);
        }
        break;
      case "toggle-bookmark":
        if (card !== null) {
          void this.toggleCardBookmark(card.path);
        }
        break;
      case "find-address-forward":
        this.beginAddressCommand("forward");
        break;
      case "find-address-backward":
        this.beginAddressCommand("backward");
        break;
      case "find-address-first":
        this.beginAddressCommand("absolute");
        break;
      case "pull-into-pile":
        this.beginPileCommand();
        break;
      case "toggle-deck-map":
        this.deckMapVisibility = toggleDeckMapVisibility(
          this.deckMapVisibility,
          this.plugin.settings.showDeckMap,
        );
        this.applyDeckMapVisibility();
        break;
      case "bookmarks":
        this.plugin.showBookmarks(this);
        break;
      case "problems":
        this.plugin.showIssues();
        break;
      case "confirm-filing":
        void this.confirmFiling();
        break;
      case "cancel-filing":
        void this.cancelFiling();
        break;
      case "edit-card":
        if (file !== null) {
          if (this.cardFocus?.surface === "deck") {
            void this.beginDeckInlineEditing(file, "deck");
          } else if (this.cardFocus?.surface === "viewed") {
            void this.beginInlineEditing(file, "tray", this.viewedCardBodyEl);
          } else {
            void this.viewTrayCard(file, true);
          }
        }
        break;
      case "show-card-in-deck":
        if (card !== null) {
          void this.showFocusedCardInDeck(card.path);
        }
        break;
      case "toggle-viewed-card":
        if (this.cardFocus?.surface === "viewed") {
          void this.returnViewedCardToDesk();
        } else if (file !== null) {
          void this.viewTrayCard(file, false);
        }
        break;
      case "file-card":
        if (file !== null) {
          if (this.cardFocus?.surface === "viewed") {
            void this.beginFilingViewedCard(file);
          } else {
            void this.startFiling(file);
          }
        }
        break;
      case "move-desk-card-left":
        if (this.cardFocus?.surface === "desk") {
          void this.moveTrayCardBy(this.cardFocus.path, -1);
        }
        break;
      case "move-desk-card-right":
        if (this.cardFocus?.surface === "desk") {
          void this.moveTrayCardBy(this.cardFocus.path, 1);
        }
        break;
      case "delete-card":
        if (file !== null) {
          void this.deleteFocusedCard(file);
        }
        break;
      case "collapse-all-piles":
        void this.plugin.updateTray(collapseAllPiles(this.plugin.tray));
        break;
      case "return-all-filed-cards":
        if (
          card !== null &&
          this.cardFocus?.surface === "desk" &&
          this.plugin.isFileInTray(card.file)
        ) {
          this.setDeckAnchor(card.path);
          this.cardFocus = deckCardFocus(card.path);
          this.viewportOffset = 0;
        }
        void this.plugin.clearTray();
        break;
    }
  }

  async refresh(): Promise<void> {
    if (this.inlineEdit !== null || this.inlineEditStarting) {
      this.renderRefreshDeferred = true;
      return;
    }
    const restoreFilingInputFocus = this.trayRenderer.isFilingInputFocused;
    this.cancelViewportCentering();
    this.recalculateFilingPreview();
    const previousActivePath = this.activePath;
    this.reconcileScrollPositions();
    this.chooseAvailableActiveCard();
    this.reconcileCardFocus();
    if (this.activePath !== previousActivePath) {
      this.viewportOffset = 0;
    }
    this.clampViewportOffset();
    await this.renderDeck(this.filingFile === null || restoreFilingInputFocus);
  }

  async startFiling(file: TFile): Promise<void> {
    const trayPosition = cardPosition(this.plugin.tray, file.path);
    if (trayPosition !== null) {
      this.cardFocus = deskCardFocus(file.path, trayPosition.pileId);
    }
    if (
      trayPosition !== null &&
      trayPosition.cardIndex > 0 &&
      !this.plugin.tray.expandedPileIds.includes(trayPosition.pileId)
    ) {
      await this.plugin.setTrayPileExpanded(trayPosition.pileId, true);
    }
    const initialAddress = initialFilingAddress(this.activeCard);
    this.filingFile = file;
    this.filingSourcePath = file.path;
    this.filingInputValue = initialAddress;
    this.filingPreview = null;
    this.filingMessage = "Enter an address.";
    this.filingConfirmationInProgress = false;
    this.recalculateFilingPreview();
    await this.renderDeck();
    this.trayRenderer.focusFilingInput();
  }

  async cancelFiling(): Promise<void> {
    if (this.filingConfirmationInProgress) {
      return;
    }
    this.filingFile = null;
    this.filingSourcePath = null;
    this.filingPreview = null;
    this.filingInputValue = "";
    this.filingConfirmationInProgress = false;
    await this.renderDeck(false);
    new Notice("Filing cancelled. The card remains in its pile.");
  }

  async handleDeckOrderingChanged(): Promise<void> {
    const restoreFilingInputFocus = this.trayRenderer.isFilingInputFocused;
    this.recalculateFilingPreview();
    this.viewportOffset = 0;
    await this.renderDeck(restoreFilingInputFocus);
  }

  handleCardSpreadChanged(): void {
    this.positionCards();
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl);
    }
    this.scheduleCardPositioning();
  }

  async goToPath(path: string): Promise<void> {
    await this.navigateToPath(path);
  }

  async jumpToPath(path: string): Promise<void> {
    if (this.plugin.index.filedByPath(path) === undefined) {
      new Notice(`Card ${path} is missing or invalid.`);
      return;
    }
    await this.navigateToPath(path);
  }

  private jumpToAdjacentBookmark(direction: -1 | 1): void {
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const targetIndex = adjacentBookmarkIndex(
      this.bookmarkIndices(),
      activeIndex,
      direction,
    );
    const target = targetIndex === null
      ? undefined
      : this.plugin.index.snapshot.filed[targetIndex];
    if (target !== undefined) {
      void this.jumpToPath(target.path);
    }
  }

  async addBookmarkToCurrent(): Promise<void> {
    const path = this.focusedDeckCardPath;
    if (path === null) {
      new Notice("Focus a Deck card before adding a bookmark.");
      return;
    }
    const bookmarkedPaths = this.bookmarkedPaths();
    bookmarkedPaths.add(path);
    this.updateBookmarkUi(bookmarkedPaths);
    await this.plugin.addBookmark(path);
  }

  async removeBookmark(path: string): Promise<void> {
    const bookmarkedPaths = this.bookmarkedPaths();
    bookmarkedPaths.delete(path);
    this.updateBookmarkUi(bookmarkedPaths);
    await this.plugin.removeBookmark(path);
  }

  handleBookmarksChanged(): void {
    this.updateBookmarkUi();
  }

  finishInlineEditing(reason: string): Promise<boolean> {
    return this.inlineEditFinalization.finish(
      reason,
      (reasons) => this.finishInlineEditingOnce(reasons),
    );
  }

  private async finishInlineEditingOnce(
    reasons: ReadonlySet<string>,
  ): Promise<boolean> {
    const editing = this.inlineEdit;
    if (editing === null) {
      return true;
    }
    const saved = await editing.controller.finish();
    if (!saved) {
      this.applyInlineEditFailure(editing.controller.snapshot.failure);
      if (this.app.workspace.getActiveViewOfType(DeckView) === this) {
        editing.textarea.focus({ preventScroll: true });
      }
      return false;
    }

    const path = editing.controller.snapshot.path;
    const shouldSkipRender = ["view-close", "plugin-unload", "quit"]
      .some((reason) => reasons.has(reason));
    this.inlineEdit = null;
    this.plugin.releaseInlineEdit(path, this);
    this.setDeckKeybindingsSuspended(false);
    editing.cardEl.removeClass("is-inline-editing");
    editing.bodyEl.removeClasses([
      "is-inline-editing",
      "has-inline-edit-error",
    ]);

    if (!shouldSkipRender) {
      if (this.renderRefreshDeferred) {
        this.renderRefreshDeferred = false;
        await this.refresh();
      } else {
        await this.rerenderEditedPath(editing.file, editing.bodyEl, editing.renderedScrollTop);
        await this.trayRenderer.rerenderPath(editing.file);
      }
    }
    if (reasons.has("escape")) {
      if (this.viewedCard?.path === path && this.viewedCardEl !== null) {
        this.viewedCardEl.focus({ preventScroll: true });
      } else {
        this.contentEl.focus({ preventScroll: true });
      }
    }
    return true;
  }

  async runAfterInlineEditing(
    reason: string,
    action: () => void | Promise<void>,
  ): Promise<boolean> {
    return runAfterInlineEditing(
      () => this.finishInlineEditing(reason),
      action,
    );
  }

  private async viewTrayCard(
    file: TFile,
    editImmediately: boolean,
  ): Promise<void> {
    if (this.filingFile !== null) {
      new Notice("Finish filing before viewing another card.");
      return;
    }
    if (this.viewedCard?.path !== file.path) {
      const viewed = await this.runAfterInlineEditing(
        "view-tray-card",
        async () => {
          this.rememberViewedCardScroll();
          this.viewedCard = createViewedCardState(file.path);
          await this.renderDeck(false);
        },
      );
      if (!viewed) {
        return;
      }
    }
    this.focusViewedCard();
    if (editImmediately && this.viewedCardBodyEl !== null) {
      await this.beginInlineEditing(file, "tray", this.viewedCardBodyEl);
    }
  }

  private async returnViewedCardToDesk(): Promise<void> {
    const viewed = this.viewedCard;
    if (viewed === null) {
      return;
    }
    await this.runAfterInlineEditing("return-viewed-card-to-desk", async () => {
      this.viewedCard = null;
      this.viewedCardEl = null;
      this.viewedCardBodyEl = null;
      const position = cardPosition(this.plugin.tray, viewed.path);
      this.cardFocus = position === null
        ? null
        : deskCardFocus(viewed.path, position.pileId);
      this.reconcileCardFocus();
      await this.renderDeck(false);
      const deskCard = this.stageEl?.querySelector<HTMLElement>(
        `.slipbox-tray-card[data-card-ref="${CSS.escape(viewed.path)}"]`,
      );
      (deskCard ?? this.contentEl).focus({ preventScroll: true });
    });
  }

  private async beginDeckInlineEditing(
    file: TFile,
    origin: InlineEditOrigin,
    bodySurface?: HTMLElement,
  ): Promise<void> {
    const surface = bodySurface ?? this.cardBodyForPath(file.path);
    if (surface === null) {
      new Notice("The card is outside the current render window.");
      return;
    }
    await this.beginInlineEditing(file, origin, surface);
  }

  private async beginInlineEditing(
    file: TFile,
    origin: InlineEditOrigin,
    bodySurface: HTMLElement | null,
    restored?: {
      readonly baseBody: string;
      readonly draft: string;
      readonly conflictMessage: string | null;
      readonly conflictRetryable: boolean;
      readonly selectionStart: number;
      readonly selectionEnd: number;
      readonly textareaScrollTop: number;
      readonly renderedScrollTop: number;
    },
  ): Promise<void> {
    if (this.filingFile !== null) {
      new Notice("Finish filing before editing a card body.");
      return;
    }
    if (this.inlineEditStarting) {
      return;
    }
    if (this.inlineEdit !== null) {
      if (this.inlineEdit.controller.snapshot.path === file.path) {
        this.inlineEdit.textarea.focus({ preventScroll: true });
        return;
      }
      if (!(await this.finishInlineEditing("start-another-editor"))) {
        return;
      }
    }
    if (!this.plugin.acquireInlineEdit(file.path, this)) {
      return;
    }

    this.inlineEditStarting = true;
    try {
      const prepared = restored === undefined
        ? await this.plugin.prepareInlineEdit(file)
        : { file, body: restored.baseBody };
      const mounted = this.mountInlineEditing(
        prepared.file,
        origin,
        prepared.body,
        bodySurface,
        restored?.renderedScrollTop,
      );
      this.inlineEdit = mounted;
      if (restored !== undefined && restored.draft !== restored.baseBody) {
        mounted.textarea.value = restored.draft;
        mounted.controller.updateDraft(restored.draft);
      }
      if (restored !== undefined) {
        mounted.textarea.scrollTop = restored.textareaScrollTop;
      }
      if (restored?.conflictMessage !== null && restored?.conflictMessage !== undefined) {
        mounted.controller.markConflict(
          restored.conflictMessage,
          restored.conflictRetryable,
        );
        this.applyInlineEditFailure(mounted.controller.snapshot.failure);
      }
      this.setDeckKeybindingsSuspended(true);
      window.requestAnimationFrame(() => {
        if (this.inlineEdit === mounted) {
          mounted.textarea.focus({ preventScroll: true });
          mounted.textarea.setSelectionRange(
            restored?.selectionStart ?? mounted.textarea.value.length,
            restored?.selectionEnd ?? mounted.textarea.value.length,
          );
          if (restored !== undefined) {
            mounted.textarea.scrollTop = restored.textareaScrollTop;
          }
        }
      });
    } catch (error) {
      this.plugin.releaseInlineEdit(file.path, this);
      new Notice(`Could not start inline editing: ${errorMessage(error)}`);
    } finally {
      this.inlineEditStarting = false;
    }
  }

  private mountInlineEditing(
    file: TFile,
    origin: InlineEditOrigin,
    baseBody: string,
    requestedBodySurface: HTMLElement | null,
    restoredRenderedScrollTop?: number,
  ): MountedInlineEdit {
    const bodyEl = requestedBodySurface;
    const cardEl = bodyEl?.closest<HTMLElement>(".slipbox-card") ?? null;
    if (bodyEl === null || cardEl === null) {
      throw new Error("The card surface is unavailable");
    }

    const renderedScrollTop = restoredRenderedScrollTop ?? bodyEl.scrollTop;
    this.renderComponents.get(file.path)?.unload();
    this.renderComponents.delete(file.path);
    bodyEl.empty();
    bodyEl.removeClass("markdown-rendered");
    bodyEl.addClass("is-inline-editing");
    cardEl.addClass("is-inline-editing");
    const textarea = bodyEl.createEl("textarea", {
      cls: "slipbox-inline-editor",
      attr: {
        "aria-label": `Edit raw Markdown for ${this.plugin.cardTitle(file)}`,
        spellcheck: "true",
      },
    });
    textarea.value = baseBody;
    const statusId = `slipbox-inline-edit-status-${++inlineEditStatusSequence}`;
    textarea.setAttr("aria-errormessage", statusId);
    const statusEl = bodyEl.createDiv({
      cls: "slipbox-inline-edit-status",
      attr: {
        id: statusId,
        role: "status",
        "aria-live": "assertive",
      },
    });
    statusEl.hidden = true;

    const controller = new InlineEditSessionController(
      file.path,
      origin,
      baseBody,
      {
        commit: async (request) => {
          const result = await this.plugin.commitInlineEdit(request);
          if (result.status === "saved" && !request.final) {
            const latestFile = this.plugin.index.fileAtPath(request.path) ?? file;
            await this.trayRenderer.rerenderPath(latestFile);
          }
          return result;
        },
        flushOpenViews: (path) => this.plugin.flushOpenTextViews(path),
        schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
        cancelScheduled: (handle) => window.clearTimeout(handle as number),
        reportFailure: (failure) => this.reportInlineEditFailure(failure),
      },
    );
    textarea.addEventListener("input", () => {
      controller.updateDraft(textarea.value);
      if (controller.snapshot.phase !== "conflict") {
        bodyEl.removeClass("has-inline-edit-error");
        textarea.removeAttribute("aria-invalid");
        statusEl.hidden = true;
        statusEl.setText("");
      }
    });
    textarea.addEventListener("pointerdown", (event) => event.stopPropagation());
    textarea.addEventListener("click", (event) => event.stopPropagation());

    return {
      controller,
      file,
      origin,
      textarea,
      statusEl,
      bodyEl,
      cardEl,
      renderedScrollTop,
    };
  }

  private handleInlineEditPointerDown(event: PointerEvent): void {
    const editing = this.inlineEdit;
    if (editing === null || !(event.target instanceof Element)) {
      return;
    }
    if (editing.textarea.contains(event.target)) {
      return;
    }
    if (
      editing.cardEl.contains(event.target) &&
      event.target.closest("a, button, input, select, [contenteditable='true']") === null
    ) {
      return;
    }
    void this.finishInlineEditing("outside-pointer");
  }

  private reportInlineEditFailure(failure: InlineEditFailure): void {
    this.applyInlineEditFailure(failure);
    const detail = failure.error === undefined
      ? failure.message
      : `${failure.message} ${errorMessage(failure.error)}`;
    new Notice(`${detail} Your draft remains in the card and can be copied.`);
  }

  private applyInlineEditFailure(failure: InlineEditFailure | null): void {
    const editing = this.inlineEdit;
    if (editing === null || failure === null) {
      return;
    }
    editing.bodyEl.addClass("has-inline-edit-error");
    editing.textarea.setAttr("aria-invalid", "true");
    editing.statusEl.setText(failure.message);
    editing.statusEl.hidden = false;
  }

  private cardBodyForPath(path: string): HTMLElement | null {
    const escaped = CSS.escape(path);
    return this.spaceEl?.querySelector<HTMLElement>(
      `.slipbox-card[data-path="${escaped}"] .slipbox-card-scroll`,
    ) ?? null;
  }

  private async rerenderEditedPath(
    file: TFile,
    target: HTMLElement,
    scrollTop: number,
  ): Promise<void> {
    if (!target.isConnected) {
      return;
    }
    target.empty();
    target.removeClasses(["is-inline-editing", "has-inline-edit-error"]);
    target.addClass("markdown-rendered");
    if (
      this.viewedCard?.path === file.path &&
      target.closest(".slipbox-viewed-card") !== null
    ) {
      this.viewedCard = scrollViewedCardState(this.viewedCard, scrollTop);
      await this.renderViewedMarkdownCard(file, target, this.renderVersion);
      target.scrollTop = scrollTop;
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    if (filed === undefined) {
      return;
    }
    this.cardScrollPositions.set(file.path, scrollTop);
    await this.renderMarkdownCard(filed, target, this.renderVersion);
    target.scrollTop = scrollTop;
  }

  private async restoreDetachedInlineEdit(): Promise<void> {
    const draft = this.plugin.takeDetachedInlineEdit();
    if (draft === null) {
      return;
    }
    const file = this.plugin.index.fileAtPath(draft.path) ?? draft.file;
    const filed = this.plugin.index.filedByFile(file);
    let bodySurface: HTMLElement | null = null;
    if (draft.origin === "tray") {
      this.viewedCard = createViewedCardState(draft.path);
      const position = cardPosition(this.plugin.tray, draft.path);
      this.cardFocus = viewedCardFocus(draft.path, position?.pileId);
      await this.renderDeck(false);
      bodySurface = this.viewedCardBodyEl;
    } else if (filed !== undefined) {
      await this.jumpToPath(filed.path);
      bodySurface = this.cardBodyForPath(file.path);
    }
    await this.beginInlineEditing(file, draft.origin, bodySurface, {
      baseBody: draft.baseBody,
      draft: draft.draft,
      conflictMessage: draft.conflictMessage,
      conflictRetryable: draft.conflictRetryable,
      selectionStart: draft.selectionStart,
      selectionEnd: draft.selectionEnd,
      textareaScrollTop: draft.textareaScrollTop,
      renderedScrollTop: draft.renderedScrollTop,
    });
    if (this.inlineEdit?.controller.snapshot.path !== draft.path) {
      this.plugin.returnDetachedInlineEdit(draft);
    }
  }

  private async navigateToPath(path: string): Promise<boolean> {
    const targetIndex = this.plugin.index.filedIndexForPath(path);
    if (targetIndex < 0) {
      new Notice(`Card ${path} is missing or invalid.`);
      return false;
    }
    this.cancelViewportCentering();
    this.setDeckAnchor(path);
    this.viewportOffset = 0;
    const restoreFilingInputFocus = this.trayRenderer.isFilingInputFocused;
    await this.renderDeck(this.filingFile === null || restoreFilingInputFocus);
    if (this.filingFile !== null && !restoreFilingInputFocus) {
      this.contentEl.focus({ preventScroll: true });
    }
    return true;
  }

  private chooseAvailableActiveCard(): void {
    const filed = this.plugin.index.snapshot.filed;
    const availablePaths = new Set(filed.map((card) => card.path));

    if (this.activePath !== null && availablePaths.has(this.activePath)) {
      return;
    }

    this.activePath = filed[0]?.path ?? null;
  }

  private async showFocusedCardInDeck(path: string): Promise<void> {
    this.cardFocus = deckCardFocus(path);
    await this.jumpToPath(path);
    this.contentEl.focus({ preventScroll: true });
    this.applyCardFocusClasses();
  }

  private async deleteFocusedCard(file: TFile): Promise<void> {
    const focus = this.cardFocus;
    const filed = this.plugin.index.snapshot.filed;
    const deckIndex = this.plugin.index.filedIndexForPath(file.path);
    const nextDeckPath = deckIndex < 0
      ? this.activePath
      : filed[deckIndex + 1]?.path ?? filed[deckIndex - 1]?.path ?? null;
    const position = cardPosition(this.plugin.tray, file.path);
    const pile = position === null
      ? undefined
      : this.plugin.tray.piles[position.pileIndex];
    const nextDeskPath = position === null || pile === undefined
      ? null
      : pile.cards[position.cardIndex + 1]?.cardRef ??
        pile.cards[position.cardIndex - 1]?.cardRef ??
        null;

    if (!(await this.plugin.deleteCard(file))) {
      return;
    }
    if (focus?.path !== file.path) {
      return;
    }
    if (
      focus.surface !== "deck" &&
      nextDeskPath !== null &&
      position !== null
    ) {
      this.cardFocus = deskCardFocus(nextDeskPath, position.pileId);
    } else if (nextDeckPath !== null) {
      this.setDeckAnchor(nextDeckPath);
      this.cardFocus = deckCardFocus(nextDeckPath);
      this.viewportOffset = 0;
    } else {
      this.cardFocus = null;
    }
    this.applyCardFocusClasses();
  }

  private async renderDeck(focusFilingInput = true): Promise<void> {
    if (this.inlineEdit !== null || this.inlineEditStarting) {
      this.renderRefreshDeferred = true;
      return;
    }
    const version = ++this.renderVersion;
    this.rememberScrollPositions();
    this.rememberViewedCardScroll();
    if (
      this.viewedCard !== null &&
      this.plugin.index.fileAtPath(this.viewedCard.path) === undefined
    ) {
      this.viewedCard = null;
    }
    this.unloadRenderComponents();
    this.cardFooters.clear();
    this.trayRenderer.clear();
    this.clearCardHeaderButtonControllers();
    this.contentEl.empty();
    this.renderedCards = [];
    this.deckMapEl = null;
    this.deckMapRailEl = null;
    this.deckMapSectionLayerEl = null;
    this.deckMapBookmarkLayerEl = null;
    this.deckMapActiveMarkerEl = null;
    this.deckMapBookmarkMarkerEls.clear();
    this.deckMapSections = [];
    this.deckMapBookmarkCount = 0;
    this.pendingCommandEl = null;
    this.viewedCardEl = null;
    this.viewedCardBodyEl = null;
    this.contentEl.dataset.mainCardSize = this.plugin.settings.mainCardSize;
    this.contentEl.dataset.trayCardSize = this.plugin.settings.trayCardSize;

    const shell = this.contentEl.createDiv({ cls: "slipbox-deck-shell" });
    this.renderDeckMap(shell);
    this.renderPendingCommandStatus(shell);
    this.applyDeckMapVisibility();

    const stage = shell.createDiv({ cls: "slipbox-deck-stage" });
    this.stageEl = stage;
    this.attachBrowsingEvents(stage);
    const space = stage.createDiv({ cls: "slipbox-space" });
    this.spaceEl = space;
    this.applySpaceOffset();
    const trayJob = this.trayRenderer.render(
      stage,
      space,
      this.currentTrayFilingState(),
      this.viewedCard?.path ?? null,
      () => version === this.renderVersion,
    );

    const filed = this.plugin.index.snapshot.filed;
    if (filed.length === 0) {
      this.renderEmptyDeck(space);
    } else {
      const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
      await this.renderCardWindow(space, filed, activeIndex, version);
    }

    if (version !== this.renderVersion) {
      return;
    }

    await trayJob;
    if (version !== this.renderVersion) {
      return;
    }

    await this.renderViewedCard(stage, version);
    if (version !== this.renderVersion) {
      return;
    }

    this.renderBookmarkEdgeTabs(stage);
    this.positionCards();
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
    if (focusFilingInput) {
      this.trayRenderer.focusFilingInput();
    }
  }

  private renderDeckMap(shell: HTMLElement): void {
    const filed = this.plugin.index.snapshot.filed;
    if (filed.length === 0) {
      return;
    }

    const map = shell.createDiv({
      cls: "slipbox-deck-map",
      attr: {
        role: "slider",
        tabindex: "0",
        "aria-label": "Deck map",
        "aria-valuemin": "1",
        "aria-valuemax": String(filed.length),
      },
    });
    const rail = map.createDiv({
      cls: "slipbox-deck-map-rail",
      attr: { "aria-hidden": "true" },
    });
    const markerLayer = rail.createDiv({
      cls: "slipbox-deck-map-markers",
    });
    this.deckMapSectionLayerEl = rail.createDiv({
      cls: "slipbox-deck-map-sections",
    });
    this.deckMapEl = map;
    this.deckMapRailEl = rail;

    for (const index of sampleDeckMapIndices(
      filed.length,
      DECK_MAP_MARKER_BUDGET,
    )) {
      const marker = markerLayer.createSpan({
        cls: "slipbox-deck-map-marker",
      });
      const card = filed[index];
      marker.toggleClass(
        "is-in-tray",
        card !== undefined && this.plugin.isFileInTray(card.file),
      );
      marker.style.setProperty(
        "--slipbox-deck-map-position",
        String(deckMapCoordinate(index, filed.length) ?? 0),
      );
    }
    this.deckMapBookmarkLayerEl = rail.createDiv({
      cls: "slipbox-deck-map-markers",
    });
    const activeLayer = rail.createDiv({
      cls: "slipbox-deck-map-markers",
    });
    this.deckMapActiveMarkerEl = activeLayer.createSpan({
      cls: "slipbox-deck-map-marker is-active is-hidden",
    });
    this.deckMapSections = buildDeckMapSectionMarkers(filed);
    this.updateDeckMapBookmarks(this.bookmarkedPaths());
    this.updateDeckMapSectionLabels();

    map.addEventListener("click", (event) => {
      const bounds = rail.getBoundingClientRect();
      const cards = this.plugin.index.snapshot.filed;
      const targetIndex = deckMapIndexAtOffset(
        event.clientX - bounds.left,
        bounds.width,
        cards.length,
      );
      const target = targetIndex === null ? undefined : cards[targetIndex];
      if (target !== undefined && target.path !== this.activePath) {
        void this.runAfterInlineEditing(
          "deck-map-jump",
          () => this.jumpToPath(target.path),
        );
      }
    });
    map.addEventListener("keydown", (event) => {
      const action = event.key === "ArrowLeft"
        ? "previous-card"
        : event.key === "ArrowRight"
          ? "next-card"
          : event.key === "Home"
            ? "first-card"
            : event.key === "End"
              ? "last-card"
              : null;
      if (action === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.runAction(action);
    });
  }

  private applyDeckMapVisibility(): void {
    applyDeckMapVisibility(
      this.deckMapEl,
      this.deckMapVisibility,
      this.plugin.settings.showDeckMap,
      this.plugin.index.snapshot.filed.length,
    );
  }

  private renderPendingCommandStatus(shell: HTMLElement): void {
    this.pendingCommandEl = shell.createDiv({
      cls: "slipbox-pending-command-status",
      attr: {
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
      },
    });
    this.updatePendingCommandStatus();
  }

  private updatePendingCommandStatus(): void {
    const status = this.pendingCommandEl;
    if (status === null) {
      return;
    }
    let instruction = "";
    if (this.pendingCommand.kind === "address") {
      instruction = this.pendingCommand.mode === "forward"
        ? "Find next: type an address initial · Esc to cancel"
        : this.pendingCommand.mode === "backward"
          ? "Find previous: type an address initial · Esc to cancel"
          : "Find from start: type an address initial · Esc to cancel";
    } else if (this.pendingCommand.kind === "pile") {
      const digits = this.pendingCommand.digits === ""
        ? "…"
        : this.pendingCommand.digits;
      instruction = `Pile number: ${digits} · Enter to confirm · Esc to cancel`;
    }
    const text = this.pendingCommandFeedback || instruction;
    status.hidden = text === "";
    status.setText(text);
  }

  private clearPendingCommand(): void {
    if (this.pendingCommandFeedbackTimer !== null) {
      window.clearTimeout(this.pendingCommandFeedbackTimer);
      this.pendingCommandFeedbackTimer = null;
    }
    this.pendingCommand = IDLE_DECK_COMMAND;
    this.pendingCommandFeedback = "";
    this.updatePendingCommandStatus();
  }

  private showCommandFeedback(message: string): void {
    if (this.pendingCommandFeedbackTimer !== null) {
      window.clearTimeout(this.pendingCommandFeedbackTimer);
    }
    this.pendingCommandFeedback = message;
    this.updatePendingCommandStatus();
    this.pendingCommandFeedbackTimer = window.setTimeout(() => {
      this.pendingCommandFeedbackTimer = null;
      this.pendingCommandFeedback = "";
      this.updatePendingCommandStatus();
    }, COMMAND_FEEDBACK_DURATION_MS);
  }

  private beginAddressCommand(mode: AddressInitialMode): void {
    this.pendingCommandStartEvent = null;
    this.clearPendingCommand();
    this.pendingCommand = startAddressCommand(mode);
    this.updatePendingCommandStatus();
  }

  private beginPileCommand(): void {
    this.pendingCommandStartEvent = null;
    this.clearPendingCommand();
    this.pendingCommand = startPileCommand();
    this.updatePendingCommandStatus();
  }

  private completeAddressCommand(mode: AddressInitialMode, initial: string): void {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const targetIndex = findAddressInitialIndex(
      filed,
      activeIndex,
      initial,
      mode,
    );
    const target = targetIndex === null ? undefined : filed[targetIndex];
    if (target === undefined) {
      const position = mode === "forward"
        ? "later"
        : mode === "backward"
          ? "earlier"
          : "filed";
      this.showCommandFeedback(`No ${position} card begins with “${initial}”.`);
      return;
    }
    void this.jumpToPath(target.path);
  }

  private completePileCommand(digits: string): void {
    const ordinal = Number(digits);
    const pileCount = this.plugin.tray.piles.length;
    if (
      digits === "" ||
      !Number.isSafeInteger(ordinal) ||
      ordinal <= 0 ||
      ordinal > pileCount
    ) {
      this.pendingCommandFeedback = digits === ""
        ? "Enter a pile number before confirming."
        : pileCount === 0
          ? "There are no piles."
          : `Pile ${digits} does not exist.`;
      this.updatePendingCommandStatus();
      return;
    }

    const card = this.focusedFiledCard;
    if (card === null) {
      this.clearPendingCommand();
      this.showCommandFeedback("There is no focused filed card.");
      return;
    }
    const source = cardPosition(this.plugin.tray, card.path);
    const next = placeFiledCardInPileOrdinal(
      this.plugin.tray,
      card.path,
      ordinal,
    );
    this.clearPendingCommand();
    if (next === this.plugin.tray) {
      this.showCommandFeedback(`The focused card is already in pile ${ordinal}.`);
      return;
    }
    this.showCommandFeedback(
      source === null
        ? `Put the focused card into pile ${ordinal}.`
        : `Moved the focused card to pile ${ordinal}.`,
    );
    const targetPile = this.plugin.tray.piles[ordinal - 1];
    if (targetPile !== undefined) {
      this.cardFocus = deskCardFocus(card.path, targetPile.id);
    }
    void this.plugin.updateTray(next);
  }

  private updateDeckMapBookmarks(bookmarkedPaths: Set<string>): void {
    const layer = this.deckMapBookmarkLayerEl;
    if (this.deckMapEl === null || layer === null) {
      return;
    }

    for (const marker of this.deckMapBookmarkMarkerEls.values()) {
      marker.remove();
    }
    this.deckMapBookmarkMarkerEls.clear();
    const cardCount = this.plugin.index.snapshot.filed.length;
    for (const path of bookmarkedPaths) {
      const index = this.plugin.index.filedIndexForPath(path);
      const position = deckMapCoordinate(index, cardCount);
      if (position === null) {
        continue;
      }
      const marker = layer.createSpan({
        cls: "slipbox-deck-map-marker is-bookmarked",
      });
      const card = this.plugin.index.filedByPath(path);
      marker.toggleClass(
        "is-in-tray",
        card !== undefined && this.plugin.isFileInTray(card.file),
      );
      marker.style.setProperty(
        "--slipbox-deck-map-position",
        String(position),
      );
      this.deckMapBookmarkMarkerEls.set(path, marker);
    }
    this.deckMapBookmarkCount = this.deckMapBookmarkMarkerEls.size;
    this.updateDeckMapActiveUi();
  }

  private updateDeckMapSectionLabels(): void {
    const rail = this.deckMapRailEl;
    const layer = this.deckMapSectionLayerEl;
    if (rail === null || layer === null) {
      return;
    }
    const sections = visibleDeckMapSectionMarkers(
      this.deckMapSections,
      rail.getBoundingClientRect().width,
      DECK_MAP_SECTION_LABEL_SPACING,
    );
    layer.empty();
    for (const section of sections) {
      const label = layer.createSpan({
        cls: "slipbox-deck-map-section",
        text: section.label,
      });
      label.style.setProperty(
        "--slipbox-deck-map-position",
        String(section.position),
      );
    }
  }

  private updateDeckMapActiveUi(): void {
    const map = this.deckMapEl;
    if (map === null) {
      return;
    }

    const cardCount = this.plugin.index.snapshot.filed.length;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const position = deckMapCoordinate(activeIndex, cardCount);
    const activeMarker = this.deckMapActiveMarkerEl;
    const bookmarkLabel =
      `${this.deckMapBookmarkCount} bookmark${this.deckMapBookmarkCount === 1 ? "" : "s"}`;
    if (position === null) {
      if (activeMarker !== null) {
        activeMarker.addClass("is-hidden");
      }
      map.removeAttribute("aria-valuenow");
      map.setAttr(
        "aria-valuetext",
        `${cardCount} filed cards; ${bookmarkLabel}`,
      );
      return;
    }

    if (activeMarker !== null) {
      activeMarker.removeClass("is-hidden");
      activeMarker.style.setProperty(
        "--slipbox-deck-map-position",
        String(position),
      );
    }
    const summary =
      `Deck anchor ${activeIndex + 1} of ${cardCount}; ${bookmarkLabel}`;
    map.setAttr("aria-valuenow", String(activeIndex + 1));
    map.setAttr("aria-valuetext", summary);
  }

  private renderEmptyDeck(stage: HTMLElement): void {
    const empty = stage.createDiv({ cls: "slipbox-deck-empty" });
    empty.createEl("h2", { text: "The filing box is empty" });
    empty.createEl("p", {
      text: "Create a new card, then file it with a manual address.",
    });
  }

  private async renderCardWindow(
    stage: HTMLElement,
    filed: readonly FiledCard[],
    activeIndex: number,
    version: number,
  ): Promise<void> {
    const viewportPosition = this.viewportPosition(activeIndex);
    const viewportIndex = Math.round(viewportPosition);
    const radius = Math.min(
      8,
      Math.max(3, Math.ceil(1 / this.plugin.settings.cardSpread) + 2),
    );
    const start = Math.max(0, viewportIndex - radius);
    const end = Math.min(filed.length - 1, viewportIndex + radius);
    this.renderWindowStart = start;
    this.renderWindowEnd = end;
    const jobs: Promise<void>[] = [];

    const focusDisplayIndex = activeIndex;

    for (let filedIndex = start; filedIndex <= end; filedIndex += 1) {
      const card = filed[filedIndex];
      if (card === undefined) {
        continue;
      }

      const cardEl = stage.createDiv({ cls: "slipbox-card" });
      cardEl.dataset.index = String(filedIndex);
      cardEl.dataset.filedIndex = String(filedIndex);
      cardEl.dataset.path = card.path;
      cardEl.toggleClass("is-deck-anchor", filedIndex === activeIndex);
      cardEl.toggleClass(
        "is-card-focused",
        this.cardFocus?.surface === "deck" && this.cardFocus.path === card.path,
      );
      cardEl.addEventListener("focusin", () => this.focusDeckCard(card.path));
      const isViewed = this.viewedCard?.path === card.path;
      cardEl.toggleClass("is-viewed-ghost", isViewed);
      const isBookmarked = this.plugin.bookmarkAtPath(card.path) !== undefined;
      cardEl.toggleClass("is-bookmarked", isBookmarked);
      const isInTray = this.plugin.isFileInTray(card.file);
      cardEl.toggleClass("is-in-tray", isInTray);
      const title = this.plugin.cardTitle(card.file);
      const cardLabel = `${card.address} · ${title}${
        isInTray ? "; pulled out into a working pile" : ""
      }`;
      cardEl.setAttr("aria-label", cardLabel);
      setTooltip(cardEl, cardLabel, {
        placement: "bottom",
        delay: 350,
      });
      cardEl.style.zIndex = String(
        cardStackOrder(filedIndex, focusDisplayIndex),
      );
      this.renderedCards.push(cardEl);

      if (isViewed) {
        cardEl.setAttr(
          "aria-label",
          `${card.address} · ${title}; viewed card placeholder. Activate to focus the viewed card.`,
        );
        const ghost = cardEl.createEl("button", {
          cls: "clickable-icon slipbox-card-ghost-control",
          attr: {
            type: "button",
            "aria-label": `Focus viewed card ${title}`,
          },
        });
        setIcon(ghost, "search");
        setTooltip(ghost, "Focus viewed card", {
          placement: "bottom",
          delay: 250,
        });
        ghost.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.focusViewedCard();
        });
        cardEl.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.focusViewedCard();
        });
        cardEl.addEventListener("contextmenu", (event) => {
          this.focusViewedCard();
          this.plugin.showCardContextMenu(
            event,
            card.file,
            card.address,
            "viewed",
            DECK_VIEW_TYPE,
            this.leaf,
          );
        });
        continue;
      }

      const frame = cardEl.createDiv({ cls: "slipbox-card-frame" });
      const addressRow = frame.createDiv({ cls: "slipbox-card-address-row" });
      const identity = addressRow.createDiv({ cls: "slipbox-card-header-identity" });
      identity.createSpan({ cls: "slipbox-card-address", text: card.address });
      const headerTitle = cardHeaderTitle(
        title,
        this.plugin.settings.showTitleInDeck,
      );
      if (headerTitle !== null) {
        identity.createSpan({
          cls: "slipbox-card-header-title",
          text: headerTitle,
        });
      }
      const cardActions = addressRow.createDiv({ cls: "slipbox-card-actions" });
      this.cardHeaderButtonControllers.add(renderCardHeaderButtons({
        container: cardActions,
        context: {
          surface: "deck",
          filed: true,
          onDesk: isInTray,
          bookmarked: isBookmarked,
          canMoveLeft: false,
          canMoveRight: false,
        },
        settings: this.plugin.settings.cardHeaderButtons,
        buttonClass: "slipbox-card-toggle",
        tooltipPlacement: "bottom",
        run: (action) => {
          this.runAction(action, card);
        },
      }));

      const scroll = frame.createDiv({ cls: "slipbox-card-scroll markdown-rendered" });
      scroll.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
      scroll.addEventListener("dblclick", (event) => {
        if (!isInlineEditBodyTarget(event.target, scroll)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void this.runAfterInlineEditing("body-double-click", async () => {
          this.focusDeckCard(card.path);
          await this.beginDeckInlineEditing(card.file, "deck", scroll);
        });
      });
      this.cardFooters.render(frame, {
        sourcePath: card.path,
        backlinks: this.plugin.index.backlinksForPath(card.path),
        interactive: filedIndex === activeIndex,
        activate: (backlink) => this.jumpToPath(backlink.path),
      });
      jobs.push(this.renderMarkdownCard(card, scroll, version));
      cardEl.addEventListener("contextmenu", (event) => {
        const target = event.target;
        if (
          !(target instanceof Element) ||
          target.closest("a, button, input, textarea, select") !== null
        ) {
          return;
        }
        this.focusDeckCard(card.path);
        this.plugin.showCardContextMenu(
          event,
          card.file,
          card.address,
          "deck",
          DECK_VIEW_TYPE,
          this.leaf,
        );
      });

      cardEl.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        if (card.path === this.activePath) {
          this.setCardFocus(deckCardFocus(card.path));
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void this.runAfterInlineEditing(
          "select-card",
          () => this.focusDeckCard(card.path),
        );
      });
    }

    this.positionCards();

    await Promise.all(jobs);
  }

  private async renderViewedCard(
    stage: HTMLElement,
    version: number,
  ): Promise<void> {
    const state = this.viewedCard;
    if (state === null) {
      return;
    }
    const file = this.plugin.index.fileAtPath(state.path);
    if (file === undefined) {
      this.viewedCard = null;
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    const address = filed?.address ?? "unfiled";
    const title = this.plugin.cardTitle(file);
    const layer = stage.createDiv({ cls: "slipbox-viewed-card-layer" });
    const card = layer.createDiv({
      cls: "slipbox-card slipbox-viewed-card",
      attr: {
        role: "group",
        tabindex: "0",
        "aria-label": `Viewed card ${address} · ${title}`,
      },
    });
    card.toggleClass(
      "is-card-focused",
      this.cardFocus?.surface === "viewed" && this.cardFocus.path === file.path,
    );
    card.addEventListener("focusin", () => {
      const position = cardPosition(this.plugin.tray, file.path);
      this.setCardFocus(viewedCardFocus(file.path, position?.pileId));
    });
    card.dataset.path = file.path;
    card.toggleClass("is-bookmarked", filed !== undefined &&
      this.plugin.bookmarkAtPath(filed.path) !== undefined);
    this.viewedCardEl = card;
    this.applyViewedCardPosition();

    const frame = card.createDiv({ cls: "slipbox-card-frame" });
    const addressRow = frame.createDiv({
      cls: "slipbox-card-address-row slipbox-viewed-card-drag-handle",
    });
    setTooltip(addressRow, "Drag to move viewed card", {
      placement: "top",
      delay: 500,
    });
    const identity = addressRow.createDiv({ cls: "slipbox-card-header-identity" });
    identity.createSpan({ cls: "slipbox-card-address", text: address });
    const headerTitle = cardHeaderTitle(
      title,
      this.plugin.settings.showTitleInDeck,
    );
    if (headerTitle !== null) {
      identity.createSpan({ cls: "slipbox-card-header-title", text: headerTitle });
    }
    const actions = addressRow.createDiv({ cls: "slipbox-card-actions" });
    const viewedPosition = cardPosition(this.plugin.tray, file.path);
    this.cardHeaderButtonControllers.add(renderCardHeaderButtons({
      container: actions,
      context: {
        surface: "viewed",
        filed: filed !== undefined,
        onDesk: viewedPosition !== null,
        bookmarked: filed !== undefined &&
          this.plugin.bookmarkAtPath(filed.path) !== undefined,
        canMoveLeft: false,
        canMoveRight: false,
      },
      settings: this.plugin.settings.cardHeaderButtons,
      buttonClass: "slipbox-card-toggle",
      tooltipPlacement: "bottom",
      run: (action) => {
        this.focusViewedCard();
        this.runAction(action);
      },
    }));

    const body = frame.createDiv({ cls: "slipbox-card-scroll markdown-rendered" });
    body.scrollTop = state.scrollTop;
    body.addEventListener("scroll", () => {
      if (this.viewedCard?.path === file.path) {
        this.viewedCard = scrollViewedCardState(this.viewedCard, body.scrollTop);
      }
    }, { passive: true });
    body.addEventListener("dblclick", (event) => {
      if (!isInlineEditBodyTarget(event.target, body)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.focusViewedCard();
      void this.beginInlineEditing(file, "tray", body);
    });
    this.viewedCardBodyEl = body;
    if (filed !== undefined) {
      this.cardFooters.render(frame, {
        sourcePath: filed.path,
        backlinks: this.plugin.index.backlinksForPath(filed.path),
        interactive: true,
        activate: (backlink) => this.jumpToPath(backlink.path),
      });
    }
    card.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest("a, button, input, textarea, select") !== null
      ) {
        return;
      }
      this.focusViewedCard();
      this.plugin.showCardContextMenu(
        event,
        file,
        filed?.address ?? null,
        "viewed",
        DECK_VIEW_TYPE,
        this.leaf,
      );
    });
    this.attachViewedCardDragging(addressRow, card);
    await this.renderViewedMarkdownCard(file, body, version);
    if (version !== this.renderVersion || this.viewedCardEl !== card) {
      return;
    }
    window.requestAnimationFrame(() => {
      if (this.viewedCardEl === card) {
        this.constrainViewedCard();
      }
    });
  }

  private async renderViewedMarkdownCard(
    file: TFile,
    target: HTMLElement,
    version: number,
  ): Promise<void> {
    this.renderComponents.get(file.path)?.unload();
    const component = new Component();
    component.load();
    this.renderComponents.set(file.path, component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (
        version !== this.renderVersion ||
        this.viewedCard?.path !== file.path ||
        this.renderComponents.get(file.path) !== component
      ) {
        return;
      }
      await MarkdownRenderer.render(
        this.app,
        body,
        target,
        file.path,
        component,
      );
      this.attachInternalLinkInteractions(target, file.path);
      target.scrollTop = this.viewedCard.scrollTop;
    } catch (error) {
      target.createEl("p", {
        cls: "slipbox-render-error",
        text: `Could not render this card: ${errorMessage(error)}`,
      });
    }
  }

  private attachViewedCardDragging(
    handle: HTMLElement,
    card: HTMLElement,
  ): void {
    handle.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (
          event.target instanceof Element &&
          event.target.closest("button, a, input, textarea, select") !== null
        )
      ) {
        return;
      }
      const startState = this.viewedCard;
      if (startState === null) {
        return;
      }
      card.focus({ preventScroll: true });
      beginThresholdPointerDrag({
        captureTarget: handle,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        threshold: VIEWED_CARD_DRAG_THRESHOLD_PX,
        onDragStart: () => card.addClass("is-dragging"),
        onDragMove: (_moveEvent, dx, dy) => {
          if (this.viewedCard?.path !== startState.path) {
            return;
          }
          this.viewedCard = moveViewedCardState(
            this.viewedCard,
            startState.x + dx,
            startState.y + dy,
            this.viewedCardBounds(card),
          );
          this.applyViewedCardPosition();
        },
        onDrop: () => card.removeClass("is-dragging"),
        onCancel: () => {
          card.removeClass("is-dragging");
          if (this.viewedCard?.path === startState.path) {
            this.viewedCard = startState;
            this.applyViewedCardPosition();
          }
        },
      });
    });
  }

  private viewedCardBounds(card: HTMLElement) {
    const stage = this.stageEl;
    return {
      stageWidth: stage?.clientWidth ?? 0,
      stageHeight: stage?.clientHeight ?? 0,
      cardWidth: card.offsetWidth,
      cardHeight: card.offsetHeight,
    };
  }

  private applyViewedCardPosition(): void {
    const state = this.viewedCard;
    const card = this.viewedCardEl;
    if (state === null || card === null) {
      return;
    }
    card.style.setProperty("--slipbox-viewed-card-x", `${state.x}px`);
    card.style.setProperty("--slipbox-viewed-card-y", `${state.y}px`);
  }

  private constrainViewedCard(): void {
    const state = this.viewedCard;
    const card = this.viewedCardEl;
    if (state === null || card === null) {
      return;
    }
    this.viewedCard = moveViewedCardState(
      state,
      state.x,
      state.y,
      this.viewedCardBounds(card),
    );
    this.applyViewedCardPosition();
  }

  private focusViewedCard(): void {
    const viewed = this.viewedCard;
    if (viewed === null) {
      return;
    }
    const position = cardPosition(this.plugin.tray, viewed.path);
    this.setCardFocus(viewedCardFocus(viewed.path, position?.pileId));
    this.viewedCardEl?.focus({ preventScroll: true });
  }

  private async beginFilingViewedCard(file: TFile): Promise<void> {
    await this.runAfterInlineEditing("viewed-file-card", async () => {
      const position = cardPosition(this.plugin.tray, file.path);
      this.viewedCard = null;
      this.viewedCardEl = null;
      this.viewedCardBodyEl = null;
      if (position !== null) {
        this.cardFocus = deskCardFocus(file.path, position.pileId);
      }
      await this.startFiling(file);
    });
  }

  private clearCardHeaderButtonControllers(): void {
    for (const controller of this.cardHeaderButtonControllers) {
      controller.disconnect();
    }
    this.cardHeaderButtonControllers.clear();
  }

  private async renderMarkdownCard(
    card: FiledCard,
    target: HTMLElement,
    version: number,
  ): Promise<void> {
    this.renderComponents.get(card.path)?.unload();
    const component = new Component();
    component.load();
    this.renderComponents.set(card.path, component);
    try {
      const body = await this.plugin.index.readBody(card.file);
      if (
        version !== this.renderVersion ||
        this.renderComponents.get(card.path) !== component
      ) {
        return;
      }
      await MarkdownRenderer.render(
        this.app,
        body,
        target,
        card.file.path,
        component,
      );
      this.attachInternalLinkInteractions(target, card.file.path);
      target.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
    } catch (error) {
      target.createEl("p", {
        cls: "slipbox-render-error",
        text: `Could not render this card: ${errorMessage(error)}`,
      });
    }
  }

  private async toggleCardBookmark(path: string): Promise<void> {
    const bookmarkedPaths = this.bookmarkedPaths();
    if (bookmarkedPaths.has(path)) {
      bookmarkedPaths.delete(path);
    } else {
      bookmarkedPaths.add(path);
    }
    this.updateBookmarkUi(bookmarkedPaths);
    await this.plugin.toggleBookmark(path);
  }

  private attachInternalLinkInteractions(
    target: HTMLElement,
    sourcePath: string,
  ): void {
    target.addEventListener("mouseover", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const link = event.target.closest<HTMLAnchorElement>("a.internal-link");
      const linktext = link?.dataset.href ?? link?.getAttribute("href") ?? undefined;
      if (link === null || linktext === undefined || linktext === "") {
        return;
      }
      this.app.workspace.trigger("hover-link", {
        event,
        source: DECK_VIEW_TYPE,
        hoverParent: this.leaf,
        targetEl: link,
        linktext,
        sourcePath,
      });
    });

    target.addEventListener(
      "click",
      (event) => {
        if (!(event.target instanceof Element)) {
          return;
        }
        const link = event.target.closest<HTMLAnchorElement>("a");
        const linkPath = link?.dataset.href ?? link?.getAttribute("href") ?? undefined;
        if (link === null || linkPath === undefined || linkPath === "") {
          return;
        }
        const internal = link.matches(".internal-link");
        const newLeaf = event.metaKey || event.ctrlKey;
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.runAfterInlineEditing("rendered-link", async () => {
          const filed = internal
            ? resolveFiledCardLink(getLinkpath(linkPath), sourcePath, {
                resolveFile: (path, source) =>
                  this.app.metadataCache.getFirstLinkpathDest(path, source),
                filedPathForFile: (file) =>
                  this.plugin.index.filedByFile(file)?.path,
                firstFiledPathAtAddress: (address) =>
                  this.plugin.index.firstFiledAtAddress(address)?.path,
              })
            : undefined;
          const action = renderedLinkAction(internal, newLeaf, linkPath, filed);
          if (action.kind === "card") {
            await this.jumpToPath(action.path);
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
      },
      { capture: true },
    );
  }

  private recalculateFilingPreview(): void {
    const file = this.filingFile;
    const sourcePath = this.filingSourcePath;
    if (file === null || sourcePath === null) {
      this.clearFilingPlacement();
      return;
    }
    if (
      file.path !== sourcePath ||
      this.plugin.index.fileAtPath(sourcePath) !== file
    ) {
      this.clearFilingPlacement();
      this.filingMessage = "The source card no longer exists.";
      return;
    }
    if (!this.plugin.isUnfiledCard(file)) {
      this.clearFilingPlacement();
      this.filingMessage = "The source card is no longer unfiled.";
      return;
    }
    const validation = normalizeAddressInput(this.filingInputValue);
    if (!validation.valid) {
      this.clearFilingPlacement();
      this.filingMessage = validation.message;
      return;
    }
    this.filingPreview = this.plugin.filingPreviewFor(file, validation.address);
    this.filingMessage = "";
  }

  private clearFilingPlacement(): void {
    this.filingPreview = null;
  }

  private updateFilingInput(value: string): void {
    if (this.filingConfirmationInProgress) {
      return;
    }
    this.filingInputValue = value;
    this.recalculateFilingPreview();
    const filing = this.currentTrayFilingState();
    if (filing !== null) {
      this.trayRenderer.updateFilingState(filing);
    }
  }

  private currentTrayFilingState(): TrayFilingState | null {
    const sourcePath = this.filingSourcePath;
    if (sourcePath === null) {
      return null;
    }
    const preview = this.filingPreview;
    return {
      sourcePath,
      value: this.filingInputValue,
      address: preview?.address ?? null,
      message: this.filingMessage,
      invalid:
        preview === null && this.filingMessage !== "Enter an address.",
      confirmationInProgress: this.filingConfirmationInProgress,
      duplicatePaths: preview === null
        ? []
        : this.plugin.index.filedAtAddress(preview.address).map((card) => card.path),
    };
  }

  private async previewFilingPlacement(): Promise<void> {
    this.contentEl.focus({ preventScroll: true });
    const preview = this.filingPreview;
    if (preview === null) {
      return;
    }
    const targetPath = filingPreviewFocusPath(preview);
    if (targetPath === null) {
      return;
    }
    this.cardFocus = deckCardFocus(targetPath);
    await this.jumpToPath(targetPath);
    this.contentEl.focus({ preventScroll: true });
  }

  private restoreFilingSourceFocus(): void {
    const path = this.filingSourcePath;
    if (path === null) {
      return;
    }
    const position = cardPosition(this.plugin.tray, path);
    if (position !== null) {
      this.setCardFocus(deskCardFocus(path, position.pileId));
    }
  }

  private async confirmFiling(): Promise<void> {
    const file = this.filingFile;
    const preview = this.filingPreview;
    if (
      file === null ||
      preview === null ||
      this.filingConfirmationInProgress
    ) {
      this.recalculateFilingPreview();
      const filing = this.currentTrayFilingState();
      if (filing !== null) {
        this.trayRenderer.updateFilingState(filing);
      }
      return;
    }
    const restoreFilingInputFocus = this.trayRenderer.isFilingInputFocused;
    this.filingConfirmationInProgress = true;
    const pending = this.currentTrayFilingState();
    if (pending !== null) {
      this.trayRenderer.updateFilingState(pending);
    }
    try {
      const result = await this.plugin.fileCard(file, preview);
      if (result.status === "preview-changed") {
        this.recalculateFilingPreview();
        await this.renderDeck(restoreFilingInputFocus);
        new Notice("The Deck changed. Review the updated position and confirm again.");
        return;
      }
      if (result.status === "failed") {
        this.recalculateFilingPreview();
        await this.renderDeck(restoreFilingInputFocus);
        return;
      }
      this.filingFile = null;
      this.filingSourcePath = null;
      this.filingPreview = null;
      this.filingInputValue = "";
      this.setDeckAnchor(file.path);
      this.cardFocus = deckCardFocus(file.path);
      this.viewportOffset = 0;
      await this.plugin.refreshDeckViews();
    } finally {
      this.filingConfirmationInProgress = false;
      const filing = this.currentTrayFilingState();
      if (filing !== null) {
        this.trayRenderer.updateFilingState(filing);
      }
    }
  }

  private renderBookmarkEdgeTabs(
    stage: HTMLElement,
    bookmarkedPaths = this.bookmarkedPaths(),
  ): void {
    stage.querySelectorAll<HTMLElement>(".slipbox-bookmark-edge-tab")
      .forEach((tab) => tab.remove());
    if (this.activePath === null || bookmarkedPaths.size === 0) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const cardWidth = this.renderedCards[0]?.offsetWidth ?? 0;
    if (activeIndex < 0 || cardWidth <= 0) {
      return;
    }
    const bookmarkIndices = [...bookmarkedPaths].flatMap((path) => {
      const index = this.plugin.index.filedIndexForPath(path);
      return index < 0 ? [] : [index];
    });
    const targets = bookmarkEdgeTargets(
      bookmarkIndices,
      this.viewportPosition(activeIndex) - this.spaceOffsetX / this.cardStep(),
      this.cardStep(),
      stage.clientWidth,
      cardWidth,
    );

    for (const direction of ["left", "right"] as const) {
      const index = targets[direction];
      const card = index === null ? undefined : filed[index];
      if (card === undefined) {
        continue;
      }
      const tab = stage.createEl("button", {
        cls: `slipbox-bookmark-edge-tab is-${direction}`,
        text: `${direction === "left" ? "◀" : "▶"} ${card.address}`,
        attr: {
          type: "button",
          "aria-label": `Jump to bookmark ${card.address}`,
        },
      });
      tab.addEventListener("click", () => {
        void this.runAfterInlineEditing(
          "bookmark-edge-jump",
          () => this.jumpToPath(card.path),
        );
      });
    }
  }

  private attachBrowsingEvents(stage: HTMLElement): void {
    stage.addEventListener(
      "wheel",
      (event) => {
        if (!shouldNavigateDeckFromWheel(event, this.inlineEdit?.textarea ?? null)) {
          return;
        }
        event.preventDefault();
        const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18 : 1;
        const delta = event.deltaX * scale;
        void this.runAfterInlineEditing(
          "horizontal-wheel",
          () => this.moveViewportByPixels(delta),
        );
      },
      { passive: false },
    );

    stage.addEventListener("pointerdown", (event) => {
      if (event.target !== stage || event.button !== 0) {
        return;
      }
      const begin = (): void => {
        if ((event.buttons & 1) === 0) {
          return;
        }
        this.cancelViewportCentering();
        this.cancelSpaceRecentering();
        this.pointerLastX = event.clientX;
        this.pointerLastY = event.clientY;
        stage.setPointerCapture(event.pointerId);
        stage.addClass("is-dragging");
        this.contentEl.focus({ preventScroll: true });
      };
      if (this.inlineEdit === null) {
        begin();
      } else {
        event.preventDefault();
        void this.runAfterInlineEditing("background-drag", begin);
      }
    });
    stage.addEventListener("pointermove", (event) => {
      if (this.pointerLastX === null || this.pointerLastY === null) {
        return;
      }
      const movementX = event.clientX - this.pointerLastX;
      const movementY = event.clientY - this.pointerLastY;
      this.pointerLastX = event.clientX;
      this.pointerLastY = event.clientY;
      this.spaceOffsetX += movementX;
      this.spaceOffsetY += movementY;
      this.applySpaceOffset();
    });
    const finishPointer = (event: PointerEvent): void => {
      if (this.pointerLastX === null) {
        return;
      }
      this.pointerLastX = null;
      this.pointerLastY = null;
      stage.removeClass("is-dragging");
      if (stage.hasPointerCapture(event.pointerId)) {
        stage.releasePointerCapture(event.pointerId);
      }
      this.renderBookmarkEdgeTabs(stage);
      this.queueRenderWindowRefresh();
    };
    stage.addEventListener("pointerup", finishPointer);
    stage.addEventListener("pointercancel", finishPointer);
  }

  private applySpaceOffset(): void {
    if (this.spaceEl === null) {
      return;
    }
    this.spaceEl.style.transform =
      `translate(${this.spaceOffsetX}px, ${this.spaceOffsetY}px)`;
  }

  private recenterSpace(): void {
    const space = this.spaceEl;
    const shouldAnimate =
      space !== null && (this.spaceOffsetX !== 0 || this.spaceOffsetY !== 0);
    this.cancelSpaceRecentering();
    if (shouldAnimate) {
      space.addClass("is-recentering");
    }
    this.spaceOffsetX = 0;
    this.spaceOffsetY = 0;
    this.applySpaceOffset();
    if (!shouldAnimate) {
      return;
    }
    this.spaceRecenteringTimer = window.setTimeout(() => {
      space.removeClass("is-recentering");
      this.spaceRecenteringTimer = null;
    }, SPACE_RECENTER_DURATION_MS);
  }

  private cancelSpaceRecentering(): void {
    if (this.spaceRecenteringTimer !== null) {
      window.clearTimeout(this.spaceRecenteringTimer);
      this.spaceRecenteringTimer = null;
    }
    this.spaceEl?.removeClass("is-recentering");
  }

  private moveViewportByPixels(deltaPixels: number): void {
    this.cancelViewportCentering();
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }

    const step = this.cardStep();
    if (step <= 0) {
      return;
    }
    const nextPosition = this.viewportPosition(activeIndex) + deltaPixels / step;
    this.applyViewportPosition(nextPosition);
  }

  private moveBy(delta: number): void {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }
    const targetIndex = deckIndexByDelta(activeIndex, delta, filed.length);
    const target = filed[targetIndex];
    if (target === undefined || target.path === this.activePath) {
      return;
    }

    const viewportPosition = this.viewportPosition(activeIndex);
    this.setDeckAnchor(target.path);
    this.viewportOffset = viewportPosition - targetIndex;
    this.centerViewportOnActive(targetIndex, true);
  }

  private centerActiveCard(): void {
    if (this.activePath === null) {
      new Notice("There is no Deck anchor to centre.");
      return;
    }
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }
    this.recenterSpace();
    this.centerViewportOnActive(activeIndex, false);
  }

  private centerViewportOnActive(
    activeIndex: number,
    smoothly: boolean,
  ): void {
    const cardCount = this.plugin.index.snapshot.filed.length;
    const targetPosition = centredViewportPosition(activeIndex, cardCount);
    const startPosition = this.viewportPosition(activeIndex);
    this.cancelViewportCentering();

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (
      !smoothly ||
      reducedMotion ||
      Math.abs(targetPosition - startPosition) < 0.001
    ) {
      this.viewportOffset = targetPosition - activeIndex;
      this.positionCards();
      this.updateActiveUi();
      this.queueRenderWindowRefresh();
      return;
    }

    const activePath = this.activePath;
    const startedAt = window.performance.now();
    this.positionCards();
    this.updateActiveUi();
    this.queueRenderWindowRefresh();

    const advance = (timestamp: number): void => {
      if (
        this.activePath !== activePath ||
        this.plugin.index.filedIndexForPath(activePath) !== activeIndex
      ) {
        this.viewportCenteringFrame = null;
        return;
      }

      const progress = Math.min(
        1,
        Math.max(0, (timestamp - startedAt) / VIEWPORT_CENTER_DURATION_MS),
      );
      const easedProgress = 1 - (1 - progress) ** 3;
      const viewportPosition =
        startPosition + (targetPosition - startPosition) * easedProgress;
      this.viewportOffset = viewportPosition - activeIndex;
      this.positionCards();
      this.queueRenderWindowRefresh();

      if (progress < 1) {
        this.viewportCenteringFrame = window.requestAnimationFrame(advance);
        return;
      }

      this.viewportCenteringFrame = null;
      this.viewportOffset = targetPosition - activeIndex;
      this.positionCards();
      if (this.stageEl !== null) {
        this.renderBookmarkEdgeTabs(this.stageEl);
      }
    };

    this.viewportCenteringFrame = window.requestAnimationFrame(advance);
  }

  private cancelViewportCentering(): void {
    if (this.viewportCenteringFrame !== null) {
      window.cancelAnimationFrame(this.viewportCenteringFrame);
      this.viewportCenteringFrame = null;
    }
  }

  private async moveTrayCardBy(
    cardRef: string,
    delta: -1 | 1,
  ): Promise<void> {
    const position = cardPosition(this.plugin.tray, cardRef);
    if (position === null) {
      return;
    }
    const target = Math.max(
      0,
      Math.min(position.pileSize - 1, position.cardIndex + delta),
    );
    if (target === position.cardIndex) {
      return;
    }
    await this.plugin.updateTray(moveCardWithinPile(
      this.plugin.tray,
      position.pileId,
      position.cardIndex,
      target,
    ));
  }

  private goToDeckBoundary(boundary: "start" | "end"): void {
    const filed = this.plugin.index.snapshot.filed;
    const target = boundary === "start" ? filed[0] : filed[filed.length - 1];
    if (target === undefined) {
      new Notice("There are no filed cards.");
      return;
    }
    void this.goToPath(target.path);
  }

  private handleDeckActionKey(
    event: KeyboardEvent,
    action: DeckAction,
    repeatable = false,
  ): boolean {
    if (this.pendingCommand.kind !== "idle") {
      return this.handleDeckCommandContinuation(event);
    }
    if (shouldSuspendDeckShortcut(
      event.target,
      this.trayRenderer.isFilingInputFocused,
    )) {
      return false;
    }

    if (!this.canRunAction(action)) {
      return false;
    }

    event.preventDefault();
    if (!event.repeat || repeatable) {
      this.runAction(action);
      if (!event.repeat && PENDING_COMMAND_ACTIONS.has(action)) {
        this.pendingCommandStartEvent = event;
      }
    }
    return true;
  }

  private handleDeckCommandContinuation(event: KeyboardEvent): boolean {
    if (event === this.pendingCommandStartEvent) {
      this.pendingCommandStartEvent = null;
      return false;
    }
    this.pendingCommandStartEvent = null;
    if (this.pendingCommand.kind !== "idle") {
      if (shouldSuspendDeckShortcut(
        event.target,
        this.trayRenderer.isFilingInputFocused,
      )) {
        this.clearPendingCommand();
        return false;
      }
      const step = advancePendingDeckCommand(this.pendingCommand, event.key);
      if (!step.consumed) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.pendingCommand = step.state;
      this.pendingCommandFeedback = "";
      this.updatePendingCommandStatus();
      if ("cancelled" in step) {
        this.showCommandFeedback("Command cancelled.");
      } else if ("completion" in step) {
        if (step.completion.kind === "address") {
          this.completeAddressCommand(
            step.completion.mode,
            step.completion.initial,
          );
        } else {
          this.completePileCommand(step.completion.digits);
        }
      }
      return true;
    }

    return false;
  }

  private selectCardWithoutMoving(path: string): void {
    this.cancelViewportCentering();
    const previousActiveIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const targetIndex = this.plugin.index.filedIndexForPath(path);
    if (targetIndex < 0) {
      return;
    }

    this.setDeckAnchor(path);
    this.viewportOffset = stationarySelectionOffset(
      previousActiveIndex,
      targetIndex,
      this.viewportOffset,
    );
    this.positionCards();
    this.updateActiveUi();
  }

  private applyViewportPosition(nextPosition: number): void {
    const filed = this.plugin.index.snapshot.filed;
    const previousActiveIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (previousActiveIndex < 0) {
      return;
    }

    const viewportPosition = clampViewportPosition(nextPosition, filed.length);
    const activeIndex = activeIndexForViewport(
      viewportPosition,
      previousActiveIndex,
      filed.length,
    );
    const activeCard = filed[activeIndex];
    if (activeCard === undefined) {
      return;
    }

    this.setDeckAnchor(activeCard.path);
    this.viewportOffset = viewportPosition - activeIndex;
    this.positionCards();
    this.updateActiveUi();
    if (this.pointerLastX === null) {
      this.queueRenderWindowRefresh();
    }
  }

  private positionCards(): boolean {
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (
      this.renderedCards.length === 0 ||
      activeIndex < 0
    ) {
      return true;
    }

    const step = this.cardStep();
    if (step <= 0) {
      return false;
    }
    const focusDisplayIndex = activeIndex;
    const viewportPosition = this.viewportPosition(activeIndex);

    for (const card of this.renderedCards) {
      const index = Number(card.dataset.index ?? "-1");
      const isActive = card.dataset.path === this.activePath;
      card.toggleClass("is-deck-anchor", isActive);
      card.toggleClass(
        "is-card-focused",
        this.cardFocus?.surface === "deck" &&
        card.dataset.path === this.cardFocus.path,
      );
      card.style.zIndex = String(cardStackOrder(index, focusDisplayIndex));
      const motion = cardMotionStyle(
        index,
        viewportPosition,
        step,
        isActive,
        focusDisplayIndex,
      );
      card.style.transform =
        `translate(-50%, -50%) translateX(${motion.translateX}px) scale(${motion.scale})`;
      card.style.opacity = String(motion.opacity);
    }
    return true;
  }

  private observeDeckSize(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleCardPositioning();
      this.updateDeckMapSectionLabels();
    });
    this.resizeObserver.observe(this.contentEl);
  }

  private scheduleCardPositioning(
    retries = LAYOUT_MEASUREMENT_RETRIES,
  ): void {
    this.positioningRetriesRemaining = Math.max(
      this.positioningRetriesRemaining,
      retries,
    );
    if (this.positioningFrame !== null) {
      return;
    }
    this.positioningFrame = window.requestAnimationFrame(() => {
      this.flushScheduledCardPositioning();
    });
  }

  private flushScheduledCardPositioning(): void {
    this.positioningFrame = null;
    const positioned = this.positionCards();
    if (positioned) {
      this.positioningRetriesRemaining = 0;
      this.cardFooters.scheduleLayout();
      if (this.stageEl !== null) {
        this.renderBookmarkEdgeTabs(this.stageEl);
      }
      return;
    }

    if (
      this.contentEl.offsetWidth > 0 &&
      this.positioningRetriesRemaining > 0
    ) {
      this.positioningRetriesRemaining -= 1;
      this.positioningFrame = window.requestAnimationFrame(() => {
        this.flushScheduledCardPositioning();
      });
      return;
    }
    this.positioningRetriesRemaining = 0;
  }

  private updateActiveUi(): void {
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }

    for (const card of this.renderedCards) {
      const filedIndex = Number(card.dataset.filedIndex ?? "-1");
      card.toggleClass("is-deck-anchor", filedIndex === activeIndex);
      card.toggleClass(
        "is-card-focused",
        this.cardFocus?.surface === "deck" &&
        card.dataset.path === this.cardFocus.path,
      );
      card.style.zIndex = String(cardStackOrder(filedIndex, activeIndex));
      this.cardFooters.setInteractive(card, filedIndex === activeIndex);
    }
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl);
    }
    this.updateDeckMapActiveUi();
    this.applyCardFocusClasses();
  }

  private bookmarkedPaths(): Set<string> {
    return new Set(
      this.plugin.state.bookmarks.flatMap((bookmark) =>
        "path" in bookmark ? [bookmark.path] : []
      ),
    );
  }

  private bookmarkIndices(): number[] {
    return [...this.bookmarkedPaths()].flatMap((path) => {
      const index = this.plugin.index.filedIndexForPath(path);
      return index < 0 ? [] : [index];
    });
  }

  private updateBookmarkUi(bookmarkedPaths = this.bookmarkedPaths()): void {
    for (const cardEl of this.renderedCards) {
      const path = cardEl.dataset.path;
      if (path === undefined) {
        continue;
      }
      const isBookmarked = bookmarkedPaths.has(path);
      cardEl.toggleClass("is-bookmarked", isBookmarked);
      const toggle = cardEl.querySelector<HTMLButtonElement>(
        '.slipbox-card-header-action[data-slipbox-action="toggle-bookmark"]',
      );
      if (toggle === null) {
        continue;
      }
      const action = isBookmarked ? "Remove bookmark" : "Add bookmark";
      toggle.toggleClass("is-pressed", isBookmarked);
      toggle.setAttr("aria-label", action);
      toggle.setAttr("aria-pressed", String(isBookmarked));
      setTooltip(toggle, action, {
        placement: "bottom",
        delay: 250,
      });
    }

    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl, bookmarkedPaths);
    }
    this.updateDeckMapBookmarks(bookmarkedPaths);
  }

  private viewportPosition(activeIndex: number): number {
    return activeIndex + this.viewportOffset;
  }

  private clampViewportOffset(): void {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      this.viewportOffset = 0;
      return;
    }
    const position = clampViewportPosition(
      this.viewportPosition(activeIndex),
      filed.length,
    );
    this.viewportOffset = position - activeIndex;
  }

  private queueRenderWindowRefresh(): void {
    if (this.inlineEdit !== null || this.inlineEditStarting) {
      this.renderRefreshDeferred = true;
      return;
    }
    if (
      this.renderRefreshPending ||
      this.pointerLastX !== null
    ) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }
    const displayCount = filed.length;
    const viewportIndex = Math.round(this.viewportPosition(activeIndex));
    const needsEarlierCards =
      this.renderWindowStart > 0 &&
      viewportIndex <= this.renderWindowStart + RENDER_EDGE_BUFFER;
    const needsLaterCards =
      this.renderWindowEnd < displayCount - 1 &&
      viewportIndex >= this.renderWindowEnd - RENDER_EDGE_BUFFER;
    if (!needsEarlierCards && !needsLaterCards) {
      return;
    }

    const restoreFilingInputFocus = this.trayRenderer.isFilingInputFocused;
    this.renderRefreshPending = true;
    window.requestAnimationFrame(() => {
      this.renderRefreshPending = false;
      if (this.stageEl !== null) {
        void this.renderDeck(
          this.filingFile === null || restoreFilingInputFocus,
        );
      }
    });
  }

  private cardStep(): number {
    const firstCard = this.renderedCards[0];
    if (firstCard === undefined) {
      return 1;
    }
    return firstCard.offsetWidth * this.plugin.settings.cardSpread;
  }

  private rememberScrollPositions(): void {
    for (const card of this.renderedCards) {
      const path = card.dataset.path;
      const scroll = card.querySelector<HTMLElement>(".slipbox-card-scroll");
      if (path !== undefined && scroll !== null) {
        this.cardScrollPositions.set(path, scroll.scrollTop);
      }
    }
  }

  private rememberViewedCardScroll(): void {
    if (this.viewedCard !== null && this.viewedCardBodyEl !== null) {
      this.viewedCard = scrollViewedCardState(
        this.viewedCard,
        this.viewedCardBodyEl.scrollTop,
      );
    }
  }

  private unloadRenderComponents(): void {
    for (const component of this.renderComponents.values()) {
      component.unload();
    }
    this.renderComponents.clear();
  }

  private reconcileScrollPositions(): void {
    const availablePaths = new Set(
      this.plugin.index.snapshot.filed.map((card) => card.path),
    );
    for (const path of this.cardScrollPositions.keys()) {
      if (!availablePaths.has(path)) {
        this.cardScrollPositions.delete(path);
      }
    }
  }

}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
