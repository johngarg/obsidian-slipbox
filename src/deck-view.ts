import {
  Component,
  ItemView,
  MarkdownRenderer,
  Notice,
  Scope,
  TFile,
  WorkspaceLeaf,
  setIcon,
  setTooltip,
  type KeymapEventHandler,
  type Modifier,
} from "obsidian";

import type SlipboxPlugin from "./main.js";
import {
  activeIndexForViewport,
  bookmarkEdgeTargets,
  cardMotionStyle,
  cardStackOrder,
  centredViewportPosition,
  clampViewportPosition,
  deckIndexByDelta,
  stationarySelectionOffset,
} from "./deck-motion.js";
import { NavigationHistory } from "./navigation-history.js";
import type { FiledCard } from "./card-index.js";
import { CardFooterManager } from "./card-footer.js";
import { cardHeaderTitle } from "./card-title.js";
import { canRunDeckAction, trayToggleLabel } from "./deck-actions.js";
import { MAX_SPREAD, MIN_SPREAD } from "./plugin-state.js";
import {
  DECK_ACTION_DEFINITIONS,
  type DeckAction,
} from "./settings.js";
import {
  TrayRenderer,
  type TrayFilingState,
} from "./tray-view.js";
import {
  cardPosition,
  moveCardWithinPile,
  placeFiledCardInPileOrdinal,
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
  handleFilingEscape,
  shouldSuspendDeckShortcut,
} from "./filing-editor.js";
import {
  buildDeckMapModel,
  buildDeckMapSectionMarkers,
  deckMapCoordinate,
  deckMapIndexAtOffset,
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
  DEFAULT_DECK_CHROME_VISIBILITY,
  applyDeckChromeVisibility,
  toggleDeckMapVisibility,
  toggleToolbarVisibility,
  type DeckChromeVisibility,
} from "./deck-chrome.js";
import {
  InlineEditFinalizationCoordinator,
  InlineEditSessionController,
  runAfterInlineEditing,
  type InlineEditFailure,
  type InlineEditOrigin,
} from "./inline-edit-session.js";
import {
  consumeInlineEditEscape,
  dispatchInlineAwareDeckAction,
  isDeckInlineEditEnter,
  isInlineEditBodyTarget,
} from "./inline-edit-interactions.js";

export const DECK_VIEW_TYPE = "slipbox-deck";

const RENDER_EDGE_BUFFER = 2;
const LAYOUT_MEASUREMENT_RETRIES = 2;
const SPACE_RECENTER_DURATION_MS = 180;
const VIEWPORT_CENTER_DURATION_MS = 180;
const DECK_MAP_SECTION_LABEL_SPACING = 14;
const COMMAND_FEEDBACK_DURATION_MS = 1_800;
const PENDING_COMMAND_ACTIONS = new Set<DeckAction>([
  "find-address-forward",
  "find-address-backward",
  "find-address-first",
  "pull-into-pile",
]);
let inlineEditStatusSequence = 0;

interface DeckPresentationSnapshot {
  readonly activePath: string | null;
  readonly viewportOffset: number;
  readonly spaceOffsetX: number;
  readonly spaceOffsetY: number;
  readonly focusedElement: HTMLElement | null;
}

interface MountedInlineEdit {
  readonly controller: InlineEditSessionController;
  file: TFile;
  readonly origin: InlineEditOrigin;
  readonly textarea: HTMLTextAreaElement;
  readonly statusEl: HTMLElement;
  readonly bodyEl: HTMLElement;
  readonly cardEl: HTMLElement;
  readonly overlayEl: HTMLElement | null;
  readonly renderedScrollTop: number;
  readonly presentationSnapshot: DeckPresentationSnapshot | null;
}

export class DeckView extends ItemView {
  private activePath: string | null = null;
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
  private readonly history = new NavigationHistory<string>();
  private backButtonEl: HTMLButtonElement | null = null;
  private forwardButtonEl: HTMLButtonElement | null = null;
  private bookmarksButtonEl: HTMLButtonElement | null = null;
  private toolbarEl: HTMLElement | null = null;
  private deckMapEl: HTMLElement | null = null;
  private deckMapRailEl: HTMLElement | null = null;
  private deckMapSectionLayerEl: HTMLElement | null = null;
  private deckMapMarkerEls = new Map<string, HTMLElement>();
  private deckMapSections: readonly DeckMapSectionMarker[] = [];
  private deckMapActivePath: string | null = null;
  private deckMapBookmarkCount = 0;
  private resizeObserver: ResizeObserver | null = null;
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
  private chromeVisibility: DeckChromeVisibility = DEFAULT_DECK_CHROME_VISIBILITY;
  private inlineEdit: MountedInlineEdit | null = null;
  private readonly inlineEditFinalization = new InlineEditFinalizationCoordinator();
  private inlineEditStarting = false;
  private renderRefreshDeferred = false;

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
      toggleTray: (file) => this.plugin.toggleFileInTray(file),
      runAfterEditing: (reason, action) => {
        void this.runAfterInlineEditing(reason, action);
      },
    });
    this.trayRenderer = new TrayRenderer(this.app, this.plugin, {
      jumpToFiledCard: (path) => this.jumpToPath(path),
      moveCardBy: (cardRef, delta) => this.moveTrayCardBy(cardRef, delta),
      beginFiling: (file) => this.startFiling(file),
      updateFilingInput: (value) => this.updateFilingInput(value),
      confirmFiling: () => void this.confirmFiling(),
      cancelFiling: () => void this.cancelFiling(),
      previewFilingPlacement: () => void this.previewFilingPlacement(),
      filingInputFocusChanged: (focused) =>
        this.setDeckKeybindingsSuspended(focused),
      beginInlineEditing: (file) => this.beginTrayInlineEditing(file),
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
      if (this.handleInlineEditEscape(event)) {
        return;
      }
      const editing = this.inlineEdit;
      const activeCard = this.activeCard;
      if (isDeckInlineEditEnter(event, this.contentEl, {
        hasActiveCard: activeCard !== null,
        editing: editing !== null,
        starting: this.inlineEditStarting,
        filing: this.filingFile !== null,
        pendingCommand: this.pendingCommand.kind !== "idle",
      })) {
        event.preventDefault();
        event.stopPropagation();
        if (activeCard !== null) {
          void this.beginDeckInlineEditing(activeCard.file, "deck");
        }
        return;
      }
      if (handleFilingEscape(
        event,
        this.filingFile !== null && !this.filingConfirmationInProgress,
        () => void this.cancelFiling(),
      )) {
        return;
      }
      if (
        this.filingFile !== null &&
        event.key === "Tab" &&
        event.shiftKey &&
        event.target !== this.trayRenderer.filingInput
      ) {
        event.preventDefault();
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
    this.spaceOffsetX = 0;
    this.spaceOffsetY = 0;
    this.renderedCards = [];
    this.backButtonEl = null;
    this.forwardButtonEl = null;
    this.bookmarksButtonEl = null;
    this.toolbarEl = null;
    this.deckMapEl = null;
    this.deckMapRailEl = null;
    this.deckMapSectionLayerEl = null;
    this.deckMapMarkerEls.clear();
    this.deckMapSections = [];
    this.deckMapActivePath = null;
    this.deckMapBookmarkCount = 0;
    this.pendingCommandEl = null;
    this.pendingCommandStartEvent = null;
    this.history.reset();
  }

  onResize(): void {
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
    this.updateDeckMapSectionLabels();
  }

  get activeCard(): FiledCard | null {
    if (this.activePath === null) {
      return null;
    }
    return this.plugin.index.filedByPath(this.activePath) ?? null;
  }

  get isFiling(): boolean {
    return this.filingFile !== null;
  }

  get canGoBack(): boolean {
    return this.history.canBack();
  }

  get canGoForward(): boolean {
    return this.history.canForward();
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
    this.history.transform((path) =>
      renamePathReference(path, oldPath, newPath)
    );
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
    this.history.transform((path) =>
      pathIsAtOrBelow(path, deletedPath) ? undefined : path
    );
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
    if (this.inlineEdit !== null) {
      const escapeHandler = scope.register([], "Escape", (event) => {
        return this.handleInlineEditEscape(event) ? false : undefined;
      });
      this.keymapHandlers.push(escapeHandler);
    }
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

  private handleInlineEditEscape(event: KeyboardEvent): boolean {
    const editing = this.inlineEdit;
    if (
      editing === null ||
      !consumeInlineEditEscape(event, editing.textarea)
    ) {
      return false;
    }
    void this.finishInlineEditing("escape").then((saved) => {
      if (saved) {
        this.contentEl.focus({ preventScroll: true });
      }
    });
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
    const active = target ?? this.activeCard;
    const activeIndex = active === null
      ? -1
      : this.plugin.index.filedIndexForPath(active.path);
    return canRunDeckAction(action, {
      hasActiveCard: activeIndex >= 0,
      hasPreviousCard: activeIndex > 0,
      hasNextCard: activeIndex >= 0 && activeIndex < filed.length - 1,
      canGoBack: this.history.canBack(),
      canGoForward: this.history.canForward(),
      hasProblems: this.plugin.index.snapshot.issues.length > 0,
      filing: this.filingFile !== null,
    });
  }

  runAction(action: DeckAction, target?: FiledCard): boolean {
    if (!this.canRunAction(action, target)) {
      return false;
    }
    const card = target ?? this.activeCard;
    return dispatchInlineAwareDeckAction(
      {
        editing: this.inlineEdit !== null,
        starting: this.inlineEditStarting,
      },
      (semanticAction) => this.runAfterInlineEditing(
        `deck-action:${action}`,
        semanticAction,
      ),
      () => this.performAction(action, card),
    );
  }

  private performAction(action: DeckAction, card: FiledCard | null): void {
    switch (action) {
      case "previous-card":
        this.moveBy(-1);
        break;
      case "next-card":
        this.moveBy(1);
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
        if (card !== null) {
          void this.plugin.openMarkdownFile(card.file);
        }
        break;
      case "copy-link":
        if (card !== null) {
          void this.plugin.copyCardLink(card);
        }
        break;
      case "toggle-tray":
        if (card !== null) {
          void this.plugin.toggleFileInTray(card.file);
        }
        break;
      case "toggle-bookmark":
        if (card !== null) {
          void this.toggleCardBookmark(card.path);
        }
        break;
      case "back":
        void this.goBack();
        break;
      case "forward":
        void this.goForward();
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
      case "toggle-toolbar":
        this.chromeVisibility = toggleToolbarVisibility(
          this.chromeVisibility,
          this.plugin.settings.showDeckToolbar,
        );
        this.applyChromeVisibility();
        break;
      case "toggle-deck-map":
        this.chromeVisibility = toggleDeckMapVisibility(
          this.chromeVisibility,
          this.plugin.settings.showDeckMap,
        );
        this.applyChromeVisibility();
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
    if (this.activePath !== previousActivePath) {
      this.viewportOffset = 0;
    }
    if (this.activePath === null) {
      this.history.reset();
    } else if (this.history.current() === undefined) {
      this.history.reset(this.activePath);
    } else if (this.activePath !== previousActivePath) {
      this.history.replaceCurrent(this.activePath);
    }
    this.clampViewportOffset();
    await this.renderDeck(this.filingFile === null || restoreFilingInputFocus);
  }

  async startFiling(file: TFile): Promise<void> {
    const trayPosition = cardPosition(this.plugin.tray, file.path);
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

  async goToPath(path: string): Promise<void> {
    const moved = await this.navigateToPath(path);
    if (moved) {
      this.history.replaceCurrent(path);
      this.updateHistoryControls();
    }
  }

  async jumpToPath(path: string): Promise<void> {
    if (this.activePath !== null) {
      this.history.replaceCurrent(this.activePath);
    }
    if (this.plugin.index.filedByPath(path) === undefined) {
      new Notice(`Card ${path} is missing or invalid.`);
      return;
    }
    this.history.jump(path);
    await this.navigateToPath(path);
    this.updateHistoryControls();
  }

  async goBack(): Promise<void> {
    const path = this.history.back();
    if (path === undefined) {
      return;
    }
    if (!(await this.navigateToPath(path))) {
      new Notice(`The Back destination ${path} is no longer available.`);
    }
    this.updateHistoryControls();
  }

  async goForward(): Promise<void> {
    const path = this.history.forward();
    if (path === undefined) {
      return;
    }
    if (!(await this.navigateToPath(path))) {
      new Notice(`The Forward destination ${path} is no longer available.`);
    }
    this.updateHistoryControls();
  }

  async addBookmarkToCurrent(): Promise<void> {
    if (this.activePath === null) {
      new Notice("There is no active filed card.");
      return;
    }
    const bookmarkedPaths = this.bookmarkedPaths();
    bookmarkedPaths.add(this.activePath);
    this.updateBookmarkUi(bookmarkedPaths);
    await this.plugin.addBookmark(this.activePath);
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

    if (editing.overlayEl !== null) {
      editing.overlayEl.remove();
      this.restoreDeckPresentation(editing.presentationSnapshot);
    }

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
      this.contentEl.focus({ preventScroll: true });
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

  private async beginTrayInlineEditing(file: TFile): Promise<void> {
    const filed = this.plugin.index.filedByFile(file);
    if (filed !== undefined) {
      if (!(await this.runAfterInlineEditing(
        "tray-promote-for-editing",
        () => this.jumpToPath(filed.path),
      ))) {
        return;
      }
      await this.beginDeckInlineEditing(file, "tray");
      return;
    }
    await this.beginInlineEditing(file, "tray", null);
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
    let bodyEl = requestedBodySurface;
    let cardEl = bodyEl?.closest<HTMLElement>(".slipbox-card") ?? null;
    let overlayEl: HTMLElement | null = null;
    let presentationSnapshot: DeckPresentationSnapshot | null = null;

    if (bodyEl === null || cardEl === null) {
      presentationSnapshot = this.deckPresentationSnapshot();
      this.cancelViewportCentering();
      this.cancelSpaceRecentering();
      const overlay = this.renderUnfiledInlineOverlay(file);
      overlayEl = overlay.overlay;
      cardEl = overlay.card;
      bodyEl = overlay.body;
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
      overlayEl,
      renderedScrollTop,
      presentationSnapshot,
    };
  }

  private renderUnfiledInlineOverlay(file: TFile): {
    readonly overlay: HTMLElement;
    readonly card: HTMLElement;
    readonly body: HTMLElement;
  } {
    const stage = this.stageEl;
    if (stage === null) {
      throw new Error("The Deck stage is unavailable");
    }
    const overlay = stage.createDiv({ cls: "slipbox-inline-edit-overlay" });
    const card = overlay.createDiv({
      cls: "slipbox-card slipbox-inline-edit-overlay-card is-active",
      attr: {
        "aria-label": `Unfiled · ${this.plugin.cardTitle(file)}`,
      },
    });
    card.dataset.path = file.path;
    const frame = card.createDiv({ cls: "slipbox-card-frame" });
    const addressRow = frame.createDiv({ cls: "slipbox-card-address-row" });
    const identity = addressRow.createDiv({ cls: "slipbox-card-header-identity" });
    identity.createSpan({ cls: "slipbox-card-address", text: "unfiled" });
    const title = cardHeaderTitle(
      this.plugin.cardTitle(file),
      this.plugin.settings.showTitleInDeck,
    );
    if (title !== null) {
      identity.createSpan({ cls: "slipbox-card-header-title", text: title });
    }
    const actions = addressRow.createDiv({ cls: "slipbox-card-actions" });
    this.renderCardAction(
      actions,
      "archive-restore",
      "slipbox-card-file",
      "File",
      () => {
        void this.runAfterInlineEditing(
          "overlay-file-card",
          () => this.startFiling(file),
        );
        return true;
      },
    );
    this.renderCardAction(
      actions,
      "file-pen-line",
      "slipbox-card-open",
      "Open",
      () => {
        void this.runAfterInlineEditing(
          "overlay-open-note",
          () => this.plugin.openMarkdownFile(file),
        );
        return true;
      },
    );
    const body = frame.createDiv({ cls: "slipbox-card-scroll" });
    return { overlay, card, body };
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
    const filed = this.plugin.index.filedByFile(file);
    if (filed === undefined) {
      return;
    }
    this.cardScrollPositions.set(file.path, scrollTop);
    await this.renderMarkdownCard(filed, target, this.renderVersion);
    target.scrollTop = scrollTop;
  }

  private deckPresentationSnapshot(): DeckPresentationSnapshot {
    const focused = this.contentEl.ownerDocument.activeElement;
    return {
      activePath: this.activePath,
      viewportOffset: this.viewportOffset,
      spaceOffsetX: this.spaceOffsetX,
      spaceOffsetY: this.spaceOffsetY,
      focusedElement: focused instanceof HTMLElement ? focused : null,
    };
  }

  private restoreDeckPresentation(snapshot: DeckPresentationSnapshot | null): void {
    if (snapshot === null) {
      return;
    }
    this.activePath = snapshot.activePath;
    this.viewportOffset = snapshot.viewportOffset;
    this.spaceOffsetX = snapshot.spaceOffsetX;
    this.spaceOffsetY = snapshot.spaceOffsetY;
    this.applySpaceOffset();
    this.positionCards();
    if (snapshot.focusedElement?.isConnected) {
      snapshot.focusedElement.focus({ preventScroll: true });
    }
  }

  private async restoreDetachedInlineEdit(): Promise<void> {
    const draft = this.plugin.takeDetachedInlineEdit();
    if (draft === null) {
      return;
    }
    const file = this.plugin.index.fileAtPath(draft.path) ?? draft.file;
    const filed = this.plugin.index.filedByFile(file);
    let bodySurface: HTMLElement | null = null;
    if (filed !== undefined) {
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
    this.activePath = path;
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

  private async renderDeck(focusFilingInput = true): Promise<void> {
    if (this.inlineEdit !== null || this.inlineEditStarting) {
      this.renderRefreshDeferred = true;
      return;
    }
    const version = ++this.renderVersion;
    this.rememberScrollPositions();
    this.unloadRenderComponents();
    this.cardFooters.clear();
    this.trayRenderer.clear();
    this.contentEl.empty();
    this.renderedCards = [];
    this.backButtonEl = null;
    this.forwardButtonEl = null;
    this.bookmarksButtonEl = null;
    this.toolbarEl = null;
    this.deckMapEl = null;
    this.deckMapRailEl = null;
    this.deckMapSectionLayerEl = null;
    this.deckMapMarkerEls.clear();
    this.deckMapSections = [];
    this.deckMapActivePath = null;
    this.deckMapBookmarkCount = 0;
    this.pendingCommandEl = null;
    this.contentEl.dataset.mainCardSize = this.plugin.settings.mainCardSize;
    this.contentEl.dataset.trayCardSize = this.plugin.settings.trayCardSize;

    const shell = this.contentEl.createDiv({ cls: "slipbox-deck-shell" });
    this.renderToolbar(shell);
    this.renderDeckMap(shell);
    this.renderPendingCommandStatus(shell);
    this.applyChromeVisibility();

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

    this.renderBookmarkEdgeTabs(stage);
    this.positionCards();
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
    if (focusFilingInput) {
      this.trayRenderer.focusFilingInput();
    }
  }

  private renderToolbar(shell: HTMLElement): void {
    const toolbar = shell.createDiv({ cls: "slipbox-deck-toolbar" });
    this.toolbarEl = toolbar;
    const identity = toolbar.createDiv({ cls: "slipbox-deck-identity" });
    const icon = identity.createSpan({ cls: "slipbox-deck-icon" });
    setIcon(icon, "archive");
    identity.createSpan({ text: "Slipbox" });

    const history = toolbar.createDiv({ cls: "slipbox-toolbar-group slipbox-history-controls" });
    const back = history.createEl("button", {
      cls: "slipbox-icon-button",
      attr: { type: "button", "aria-label": "Back" },
    });
    setIcon(back, "arrow-left");
    back.addEventListener("click", () => this.runAction("back"));
    this.backButtonEl = back;
    const forward = history.createEl("button", {
      cls: "slipbox-icon-button",
      attr: { type: "button", "aria-label": "Forward" },
    });
    setIcon(forward, "arrow-right");
    forward.addEventListener("click", () => this.runAction("forward"));
    this.forwardButtonEl = forward;
    this.updateHistoryControls();

    const controls = toolbar.createDiv({ cls: "slipbox-toolbar-group slipbox-toolbar-main" });
    const bookmarks = controls.createEl("button", {
      attr: { type: "button" },
      cls: "slipbox-bookmarks-button",
    });
    bookmarks.createSpan({ text: "Bookmarks" });
    if (this.plugin.state.bookmarks.length > 0) {
      bookmarks.createSpan({ cls: "slipbox-count", text: String(this.plugin.state.bookmarks.length) });
    }
    bookmarks.addEventListener("click", () => this.runAction("bookmarks"));
    this.bookmarksButtonEl = bookmarks;

    if (this.plugin.index.snapshot.issues.length > 0) {
      const problems = controls.createEl("button", {
        cls: "slipbox-problem-button",
        attr: { type: "button" },
      });
      const warning = problems.createSpan();
      setIcon(warning, "triangle-alert");
      problems.createSpan({
        text: `${this.plugin.index.snapshot.issues.length} problem${
          this.plugin.index.snapshot.issues.length === 1 ? "" : "s"
        }`,
      });
      problems.addEventListener("click", () => this.runAction("problems"));
    }

    const spreadControl = toolbar.createEl("label", { cls: "slipbox-spread-control" });
    spreadControl.createSpan({ text: "Spread" });
    const slider = spreadControl.createEl("input", {
      type: "range",
      attr: {
        min: String(MIN_SPREAD),
        max: String(MAX_SPREAD),
        step: "0.01",
        value: String(this.plugin.state.spread),
        "aria-label": "Card spread",
      },
    });
    slider.addEventListener("input", () => {
      const spread = Number(slider.value);
      void this.runAfterInlineEditing("spread-input", () => {
        this.plugin.setSpread(spread);
        this.positionCards();
        if (this.stageEl !== null) {
          this.renderBookmarkEdgeTabs(this.stageEl);
        }
      });
    });
    slider.addEventListener("change", () => {
      void this.runAfterInlineEditing(
        "spread-change",
        () => this.renderDeck(),
      );
    });
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

    for (const [index, card] of filed.entries()) {
      const marker = markerLayer.createSpan({
        cls: "slipbox-deck-map-marker",
      });
      marker.style.setProperty(
        "--slipbox-deck-map-position",
        String(deckMapCoordinate(index, filed.length) ?? 0),
      );
      this.deckMapMarkerEls.set(card.path, marker);
    }
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

  private applyChromeVisibility(): void {
    applyDeckChromeVisibility(
      this.toolbarEl,
      this.deckMapEl,
      this.chromeVisibility,
      this.plugin.settings.showDeckToolbar,
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

    const card = this.activeCard;
    if (card === null) {
      this.clearPendingCommand();
      this.showCommandFeedback("There is no active filed card.");
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
      this.showCommandFeedback(`The active card is already in pile ${ordinal}.`);
      return;
    }
    this.showCommandFeedback(
      source === null
        ? `Pulled the active card into pile ${ordinal}.`
        : `Moved the active card to pile ${ordinal}.`,
    );
    void this.plugin.updateTray(next);
  }

  private updateDeckMapBookmarks(bookmarkedPaths: Set<string>): void {
    if (this.deckMapEl === null) {
      return;
    }

    const model = buildDeckMapModel(
      this.plugin.index.snapshot.filed.map((card) => card.path),
      this.activePath,
      bookmarkedPaths,
    );
    const resolvedBookmarks = new Set(
      model.bookmarks.map((marker) => marker.path),
    );
    for (const [path, marker] of this.deckMapMarkerEls) {
      marker.toggleClass("is-bookmarked", resolvedBookmarks.has(path));
    }
    this.deckMapBookmarkCount = model.bookmarks.length;
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
    const bookmarkLabel =
      `${this.deckMapBookmarkCount} bookmark${this.deckMapBookmarkCount === 1 ? "" : "s"}`;
    if (this.deckMapActivePath !== null) {
      this.deckMapMarkerEls.get(this.deckMapActivePath)?.removeClass("is-active");
    }
    if (position === null) {
      this.deckMapActivePath = null;
      map.removeAttribute("aria-valuenow");
      map.setAttr(
        "aria-valuetext",
        `${cardCount} filed cards; ${bookmarkLabel}`,
      );
      return;
    }

    this.deckMapActivePath = this.activePath;
    if (this.activePath !== null) {
      this.deckMapMarkerEls.get(this.activePath)?.addClass("is-active");
    }
    const summary = `Card ${activeIndex + 1} of ${cardCount}; ${bookmarkLabel}`;
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
      Math.max(3, Math.ceil(1 / this.plugin.state.spread) + 2),
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
      cardEl.toggleClass("is-active", filedIndex === activeIndex);
      const isBookmarked = this.plugin.bookmarkAtPath(card.path) !== undefined;
      cardEl.toggleClass("is-bookmarked", isBookmarked);
      const isInTray = this.plugin.isFileInTray(card.file);
      const title = this.plugin.cardTitle(card.file);
      const cardLabel = `${card.address} · ${title}`;
      cardEl.setAttr("aria-label", cardLabel);
      setTooltip(cardEl, cardLabel, {
        placement: "bottom",
        delay: 350,
      });
      cardEl.style.zIndex = String(
        cardStackOrder(filedIndex, focusDisplayIndex),
      );
      this.renderedCards.push(cardEl);

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
      if (this.plugin.settings.deckHeaderButtons["open-note"]) {
        this.renderCardAction(
          cardActions,
          "file-pen-line",
          "slipbox-card-open",
          "Open",
          () => this.runAction("open-note", card),
        );
      }
      if (this.plugin.settings.deckHeaderButtons["copy-link"]) {
        this.renderCardAction(
          cardActions,
          "copy",
          "slipbox-card-copy-link",
          "Copy card link",
          () => this.runAction("copy-link", card),
        );
      }
      if (this.plugin.settings.deckHeaderButtons.tray) {
        const trayAction = trayToggleLabel(isInTray);
        const trayToggle = this.renderCardAction(
          cardActions,
          isInTray ? "undo-2" : "inbox",
          "slipbox-card-tray-toggle",
          trayAction,
          () => this.runAction("toggle-tray", card),
        );
        trayToggle.setAttr("aria-pressed", String(isInTray));
        trayToggle.toggleClass("is-in-tray", isInTray);
      }
      if (this.plugin.settings.deckHeaderButtons.bookmark) {
        const bookmarkAction = isBookmarked
          ? "Remove bookmark"
          : "Add bookmark";
        const bookmarkToggle = this.renderCardAction(
          cardActions,
          "bookmark",
          "slipbox-card-bookmark-toggle",
          bookmarkAction,
          () => this.runAction("toggle-bookmark", card),
        );
        bookmarkToggle.setAttr("aria-pressed", String(isBookmarked));
        bookmarkToggle.toggleClass("is-bookmarked", isBookmarked);
      }

      const scroll = frame.createDiv({ cls: "slipbox-card-scroll markdown-rendered" });
      scroll.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
      scroll.addEventListener("dblclick", (event) => {
        if (!isInlineEditBodyTarget(event.target, scroll)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void this.runAfterInlineEditing("body-double-click", async () => {
          if (card.path !== this.activePath) {
            this.selectCardWithoutMoving(card.path);
          }
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
        this.plugin.showCardContextMenu(
          event,
          card.file,
          card.address,
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
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void this.runAfterInlineEditing(
          "select-card",
          () => this.selectCardWithoutMoving(card.path),
        );
      });
    }

    this.positionCards();

    await Promise.all(jobs);
  }

  private renderCardAction(
    parent: HTMLElement,
    icon: Parameters<typeof setIcon>[1],
    className: string,
    label: string,
    action: () => boolean,
  ): HTMLButtonElement {
    const button = parent.createEl("button", {
      cls: `clickable-icon slipbox-card-toggle ${className}`,
      attr: { type: "button", "aria-label": label },
    });
    setIcon(button, icon);
    setTooltip(button, label, { placement: "bottom", delay: 250 });
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    return button;
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
        const link = event.target.closest<HTMLAnchorElement>("a.internal-link");
        const linkPath = link?.dataset.href ?? link?.getAttribute("href") ?? undefined;
        if (link === null || linkPath === undefined || linkPath === "") {
          return;
        }
        const internal = link.matches(".internal-link");
        const newLeaf = event.metaKey || event.ctrlKey;
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.runAfterInlineEditing("rendered-link", async () => {
          if (!internal) {
            window.open(link.href, "_blank", "noopener");
            return;
          }
          const destination = this.app.metadataCache.getFirstLinkpathDest(
            linkPath,
            sourcePath,
          );
          const filed = destination === null
            ? undefined
            : this.plugin.index.filedByFile(destination);
          if (filed !== undefined && !newLeaf) {
            await this.jumpToPath(filed.path);
            return;
          }
          await this.app.workspace.openLinkText(linkPath, sourcePath, newLeaf);
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
    await this.jumpToPath(targetPath);
    this.contentEl.focus({ preventScroll: true });
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
      this.activePath = file.path;
      this.viewportOffset = 0;
      this.history.replaceCurrent(file.path);
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
        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
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
    this.activePath = target.path;
    this.viewportOffset = viewportPosition - targetIndex;
    this.history.replaceCurrent(target.path);
    this.centerViewportOnActive(targetIndex, true);
  }

  private centerActiveCard(): void {
    if (this.activePath === null) {
      new Notice("There is no active filed card to centre.");
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

    return handleFilingEscape(
      event,
      this.filingFile !== null && !this.filingConfirmationInProgress,
      () => void this.cancelFiling(),
    );
  }

  private selectCardWithoutMoving(path: string): void {
    this.cancelViewportCentering();
    const previousActiveIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const targetIndex = this.plugin.index.filedIndexForPath(path);
    if (targetIndex < 0) {
      return;
    }

    this.activePath = path;
    this.viewportOffset = stationarySelectionOffset(
      previousActiveIndex,
      targetIndex,
      this.viewportOffset,
    );
    this.history.replaceCurrent(path);
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

    this.activePath = activeCard.path;
    this.viewportOffset = viewportPosition - activeIndex;
    this.history.replaceCurrent(activeCard.path);
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
      card.toggleClass("is-active", isActive);
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
      card.toggleClass("is-active", filedIndex === activeIndex);
      card.style.zIndex = String(cardStackOrder(filedIndex, activeIndex));
      this.cardFooters.setInteractive(card, filedIndex === activeIndex);
    }
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl);
    }
    this.updateDeckMapActiveUi();
    this.updateHistoryControls();
  }

  private bookmarkedPaths(): Set<string> {
    return new Set(
      this.plugin.state.bookmarks.flatMap((bookmark) =>
        "path" in bookmark ? [bookmark.path] : []
      ),
    );
  }

  private updateBookmarkUi(bookmarkedPaths = this.bookmarkedPaths()): void {
    const bookmarkCount = bookmarkedPaths.size;
    if (this.bookmarksButtonEl !== null) {
      const countEl = this.bookmarksButtonEl.querySelector<HTMLElement>(".slipbox-count");
      if (bookmarkCount === 0) {
        countEl?.remove();
      } else if (countEl === null) {
        this.bookmarksButtonEl.createSpan({
          cls: "slipbox-count",
          text: String(bookmarkCount),
        });
      } else {
        countEl.setText(String(bookmarkCount));
      }
    }

    for (const cardEl of this.renderedCards) {
      const path = cardEl.dataset.path;
      if (path === undefined) {
        continue;
      }
      const isBookmarked = bookmarkedPaths.has(path);
      cardEl.toggleClass("is-bookmarked", isBookmarked);
      const toggle = cardEl.querySelector<HTMLButtonElement>(
        ".slipbox-card-bookmark-toggle",
      );
      if (toggle === null) {
        continue;
      }
      const action = isBookmarked ? "Remove bookmark" : "Add bookmark";
      toggle.toggleClass("is-bookmarked", isBookmarked);
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

  private updateHistoryControls(): void {
    if (this.backButtonEl !== null) {
      this.backButtonEl.disabled = !this.history.canBack();
    }
    if (this.forwardButtonEl !== null) {
      this.forwardButtonEl.disabled = !this.history.canForward();
    }
  }

  private cardStep(): number {
    const firstCard = this.renderedCards[0];
    if (firstCard === undefined) {
      return 1;
    }
    return firstCard.offsetWidth * this.plugin.state.spread;
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
