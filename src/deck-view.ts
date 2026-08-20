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
} from "./deck-motion.js";
import { NavigationHistory } from "./navigation-history.js";
import type { FiledCard } from "./card-index.js";
import { CardFooterManager } from "./card-footer.js";
import { canRunDeckAction, trayToggleLabel } from "./deck-actions.js";
import { MAX_SPREAD, MIN_SPREAD } from "./plugin-state.js";
import {
  DECK_ACTION_DEFINITIONS,
  type DeckAction,
} from "./settings.js";
import { TrayRenderer } from "./tray-view.js";
import { cardPosition, moveCardWithinPile } from "./tray-state.js";
import {
  pathIsAtOrBelow,
  renamePathReference,
} from "./path-reference.js";
import { normalizeAddressInput } from "./address-order.js";
import {
  defaultFilingFocusIndex,
  deckDisplayItems,
  initialFilingAddress,
  type FilingPreview,
} from "./filing-preview.js";
import {
  removeFilingGhost,
  renderOrUpdateFilingGhost,
} from "./filing-ghost.js";

export const DECK_VIEW_TYPE = "slipbox-deck";

const FILING_ANIMATION_DURATION_MS = 280;
const RENDER_EDGE_BUFFER = 2;
const LAYOUT_MEASUREMENT_RETRIES = 2;
const SPACE_RECENTER_DURATION_MS = 180;
const VIEWPORT_CENTER_DURATION_MS = 180;

export class DeckView extends ItemView {
  private activePath: string | null = null;
  private filingFile: TFile | null = null;
  private filingSourcePath: string | null = null;
  private filingInputValue = "";
  private filingPreview: FilingPreview | null = null;
  private filingFocusDisplayIndex: number | null = null;
  private filingViewportPosition: number | null = null;
  private filingMessage = "Enter an address.";
  private filingOriginViewportOffset = 0;
  private filingInputEl: HTMLInputElement | null = null;
  private filingStatusEl: HTMLElement | null = null;
  private filingDuplicateEl: HTMLElement | null = null;
  private filingCancelEl: HTMLButtonElement | null = null;
  private filingConfirmEl: HTMLButtonElement | null = null;
  private filingGhostEl: HTMLElement | null = null;
  private filingConfirmationInProgress = false;
  private stageEl: HTMLElement | null = null;
  private spaceEl: HTMLElement | null = null;
  private renderedCards: HTMLElement[] = [];
  private renderComponents: Component[] = [];
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
  private resizeObserver: ResizeObserver | null = null;
  private positioningFrame: number | null = null;
  private positioningRetriesRemaining = 0;
  private readonly cardFooters: CardFooterManager;
  private readonly trayRenderer: TrayRenderer;
  private keymapHandlers: KeymapEventHandler[] = [];

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
    });
    this.trayRenderer = new TrayRenderer(this.app, this.plugin, {
      jumpToFiledCard: (path) => this.jumpToPath(path),
      moveCardBy: (cardRef, delta) => this.moveTrayCardBy(cardRef, delta),
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
    this.registerDomEvent(this.contentEl, "keydown", (event) => {
      if (
        this.filingFile !== null &&
        event.key === "Tab" &&
        event.shiftKey &&
        event.target === this.contentEl
      ) {
        event.preventDefault();
        this.focusFilingInputNow();
      }
    });
    this.observeDeckSize();
    await this.refresh();
  }

  async onClose(): Promise<void> {
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
    this.filingFile = null;
    this.filingSourcePath = null;
    this.filingPreview = null;
    this.filingFocusDisplayIndex = null;
    this.filingViewportPosition = null;
    this.filingGhostEl = null;
    this.filingConfirmationInProgress = false;
    this.stageEl = null;
    this.spaceEl = null;
    this.spaceOffsetX = 0;
    this.spaceOffsetY = 0;
    this.renderedCards = [];
    this.filingInputEl = null;
    this.filingStatusEl = null;
    this.filingDuplicateEl = null;
    this.filingCancelEl = null;
    this.filingConfirmEl = null;
    this.backButtonEl = null;
    this.forwardButtonEl = null;
    this.bookmarksButtonEl = null;
    this.history.reset();
  }

  onResize(): void {
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
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
    return this.filingFile === null && this.history.canBack();
  }

  get canGoForward(): boolean {
    return this.filingFile === null && this.history.canForward();
  }

  handlePathRename(oldPath: string, newPath: string): void {
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
    if (
      this.activePath !== null &&
      pathIsAtOrBelow(this.activePath, deletedPath)
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

  canRunAction(action: DeckAction, target?: FiledCard): boolean {
    if (this.filingFile !== null) {
      if (this.filingConfirmationInProgress) {
        return false;
      }
      if (action === "confirm-filing") {
        return this.filingPreview !== null;
      }
      if (action === "cancel-filing") {
        return true;
      }
      const focusIndex = this.currentFilingFocusIndex();
      const displayCount = this.filingDisplayCount();
      switch (action) {
        case "previous-card":
          return focusIndex > 0;
        case "next-card":
          return focusIndex >= 0 && focusIndex < displayCount - 1;
        case "centre-card":
        case "first-card":
        case "last-card":
          return focusIndex >= 0;
        default:
          return false;
      }
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
    switch (action) {
      case "previous-card":
        this.moveBy(-1);
        break;
      case "next-card":
        this.moveBy(1);
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
      case "entry-points":
        this.plugin.showEntryPoints(this);
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
    return true;
  }

  async refresh(): Promise<void> {
    const restoreFilingInputFocus =
      this.filingInputEl !== null &&
      this.filingInputEl.ownerDocument.activeElement === this.filingInputEl;
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
    const initialAddress = initialFilingAddress(this.activeCard);
    this.filingGhostEl = removeFilingGhost(this.filingGhostEl);
    this.filingFile = file;
    this.filingSourcePath = file.path;
    this.filingInputValue = initialAddress;
    this.filingPreview = null;
    this.filingFocusDisplayIndex = null;
    this.filingViewportPosition = null;
    this.filingMessage = "Enter an address.";
    this.filingConfirmationInProgress = false;
    this.filingOriginViewportOffset = this.viewportOffset;
    this.recalculateFilingPreview();
    await this.renderDeck();
    this.focusFilingInput();
  }

  async cancelFiling(): Promise<void> {
    if (this.filingConfirmationInProgress) {
      return;
    }
    this.filingGhostEl = removeFilingGhost(this.filingGhostEl);
    this.filingFile = null;
    this.filingSourcePath = null;
    this.filingPreview = null;
    this.filingFocusDisplayIndex = null;
    this.filingViewportPosition = null;
    this.filingInputValue = "";
    this.filingConfirmationInProgress = false;
    this.viewportOffset = this.filingOriginViewportOffset;
    await this.renderDeck();
    new Notice("Filing cancelled. The card remains in its pile.");
  }

  async handleDeckOrderingChanged(): Promise<void> {
    this.recalculateFilingPreview();
    this.viewportOffset = 0;
    await this.renderDeck();
    this.focusFilingInput();
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

  /** Intentional address-level navigation used by entry points. */
  async jumpToAddress(address: string): Promise<void> {
    const card = this.plugin.index.firstFiledAtAddress(address);
    if (card === undefined) {
      new Notice(`Card address ${address} is missing or invalid.`);
      return;
    }
    await this.jumpToPath(card.path);
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

  private async navigateToPath(path: string): Promise<boolean> {
    const targetIndex = this.plugin.index.filedIndexForPath(path);
    if (targetIndex < 0) {
      new Notice(`Card ${path} is missing or invalid.`);
      return false;
    }
    this.cancelViewportCentering();
    this.activePath = path;
    this.viewportOffset = 0;
    await this.renderDeck();
    return true;
  }

  async addCurrentAsEntryPoint(): Promise<void> {
    const active = this.activeCard;
    if (active === null) {
      new Notice("There is no active filed card.");
      return;
    }
    await this.plugin.addEntryPoint(active.address);
  }

  private chooseAvailableActiveCard(): void {
    const filed = this.plugin.index.snapshot.filed;
    const availablePaths = new Set(filed.map((card) => card.path));

    if (this.activePath !== null && availablePaths.has(this.activePath)) {
      return;
    }

    const firstEntryPoint = this.plugin.state.entryPoints
      .map((entry) => this.plugin.index.firstFiledAtAddress(entry.address))
      .find((card) => card !== undefined);
    this.activePath = firstEntryPoint?.path ?? filed[0]?.path ?? null;
  }

  private async renderDeck(focusFilingInput = true): Promise<void> {
    const version = ++this.renderVersion;
    this.rememberScrollPositions();
    this.unloadRenderComponents();
    this.cardFooters.clear();
    this.trayRenderer.clear();
    this.contentEl.empty();
    this.renderedCards = [];
    this.filingInputEl = null;
    this.filingStatusEl = null;
    this.filingDuplicateEl = null;
    this.filingCancelEl = null;
    this.filingConfirmEl = null;
    this.backButtonEl = null;
    this.forwardButtonEl = null;
    this.bookmarksButtonEl = null;
    this.contentEl.dataset.mainCardSize = this.plugin.settings.mainCardSize;
    this.contentEl.dataset.trayCardSize = this.plugin.settings.trayCardSize;

    const shell = this.contentEl.createDiv({ cls: "slipbox-deck-shell" });
    if (this.filingFile !== null) {
      shell.addClass("is-filing");
    }
    this.renderToolbar(shell);

    const stage = shell.createDiv({ cls: "slipbox-deck-stage" });
    this.stageEl = stage;
    this.attachBrowsingEvents(stage);
    const space = stage.createDiv({ cls: "slipbox-space" });
    this.spaceEl = space;
    this.applySpaceOffset();
    const trayJob = this.trayRenderer.render(
      stage,
      space,
      this.filingFile !== null,
      () => version === this.renderVersion,
    );

    const filed = this.plugin.index.snapshot.filed;
    if (filed.length === 0 && this.filingPreview === null) {
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

    if (this.filingFile !== null) {
      await this.renderFilingCard(shell, this.filingFile, version);
    }
    this.renderBookmarkEdgeTabs(stage);
    this.positionCards();
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
    if (focusFilingInput) {
      this.focusFilingInput();
    }
  }

  private renderToolbar(shell: HTMLElement): void {
    const toolbar = shell.createDiv({ cls: "slipbox-deck-toolbar" });
    const identity = toolbar.createDiv({ cls: "slipbox-deck-identity" });
    const icon = identity.createSpan({ cls: "slipbox-deck-icon" });
    setIcon(icon, "archive");
    identity.createSpan({ text: "Slipbox" });

    const history = toolbar.createDiv({ cls: "slipbox-toolbar-group slipbox-history-controls" });
    const back = history.createEl("button", {
      text: "← back",
      attr: { type: "button" },
    });
    back.addEventListener("click", () => this.runAction("back"));
    this.backButtonEl = back;
    const forward = history.createEl("button", {
      text: "Forward →",
      attr: { type: "button" },
    });
    forward.addEventListener("click", () => this.runAction("forward"));
    this.forwardButtonEl = forward;
    this.updateHistoryControls();

    const controls = toolbar.createDiv({ cls: "slipbox-toolbar-group slipbox-toolbar-main" });
    const entries = controls.createEl("button", {
      text: "Entry points",
      attr: { type: "button" },
    });
    entries.addEventListener("click", () => this.runAction("entry-points"));
    entries.disabled = this.filingFile !== null;

    const bookmarks = controls.createEl("button", {
      attr: { type: "button" },
      cls: "slipbox-bookmarks-button",
    });
    bookmarks.createSpan({ text: "Bookmarks" });
    if (this.plugin.state.bookmarks.length > 0) {
      bookmarks.createSpan({ cls: "slipbox-count", text: String(this.plugin.state.bookmarks.length) });
    }
    bookmarks.addEventListener("click", () => this.runAction("bookmarks"));
    bookmarks.disabled = this.filingFile !== null;
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
      problems.disabled = this.filingFile !== null;
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
      this.plugin.setSpread(Number(slider.value));
      this.positionCards();
      if (this.stageEl !== null) {
        this.renderBookmarkEdgeTabs(this.stageEl);
      }
    });
    slider.addEventListener("change", () => void this.renderDeck());
    slider.disabled = this.filingFile !== null;
  }

  private renderEmptyDeck(stage: HTMLElement): void {
    const empty = stage.createDiv({ cls: "slipbox-deck-empty" });
    empty.createEl("h2", { text: "The filing box is empty" });
    empty.createEl("p", {
      text: this.filingFile === null
        ? "Create a new card, then file it with a manual address."
        : "Enter an address to preview the first filed card.",
    });
  }

  private async renderCardWindow(
    stage: HTMLElement,
    filed: readonly FiledCard[],
    activeIndex: number,
    version: number,
  ): Promise<void> {
    const displayItems = deckDisplayItems(filed, this.filingPreview);
    const viewportPosition = this.displayViewportPosition(activeIndex);
    const viewportIndex = Math.round(viewportPosition);
    const radius = Math.min(
      8,
      Math.max(3, Math.ceil(1 / this.plugin.state.spread) + 2),
    );
    const start = Math.max(0, viewportIndex - radius);
    const end = Math.min(displayItems.length - 1, viewportIndex + radius);
    this.renderWindowStart = start;
    this.renderWindowEnd = end;
    const jobs: Promise<void>[] = [];

    const focusDisplayIndex = this.visualFocusDisplayIndex(activeIndex);
    const interactive = this.filingFile === null;

    for (let displayIndex = start; displayIndex <= end; displayIndex += 1) {
      const item = displayItems[displayIndex];
      if (item === undefined) {
        continue;
      }
      if (item.kind === "preview") {
        this.filingGhostEl = renderOrUpdateFilingGhost(
          stage,
          item.preview,
          this.filingGhostEl,
        );
        this.filingGhostEl.dataset.index = String(item.displayIndex);
        this.filingGhostEl.toggleClass(
          "is-filing-focus",
          item.displayIndex === focusDisplayIndex,
        );
        this.filingGhostEl.style.zIndex = String(
          cardStackOrder(item.displayIndex, focusDisplayIndex),
        );
        this.renderedCards.push(this.filingGhostEl);
        continue;
      }
      const { card, filedIndex } = item;

      const cardEl = stage.createDiv({ cls: "slipbox-card" });
      cardEl.dataset.index = String(item.displayIndex);
      cardEl.dataset.filedIndex = String(filedIndex);
      cardEl.dataset.path = card.path;
      cardEl.toggleClass("is-active", interactive && filedIndex === activeIndex);
      cardEl.toggleClass(
        "is-filing-focus",
        !interactive && item.displayIndex === focusDisplayIndex,
      );
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
        cardStackOrder(item.displayIndex, focusDisplayIndex),
      );
      this.renderedCards.push(cardEl);

      const frame = cardEl.createDiv({ cls: "slipbox-card-frame" });
      const addressRow = frame.createDiv({ cls: "slipbox-card-address-row" });
      const identity = addressRow.createDiv({ cls: "slipbox-card-header-identity" });
      identity.createSpan({ cls: "slipbox-card-address", text: card.address });
      if (this.plugin.settings.showTitleInDeck) {
        identity.createSpan({ cls: "slipbox-card-header-title", text: title });
      }
      const cardActions = addressRow.createDiv({ cls: "slipbox-card-actions" });
      if (interactive && this.plugin.settings.deckHeaderButtons["open-note"]) {
        this.renderCardAction(
          cardActions,
          "file-pen-line",
          "slipbox-card-open",
          "Open",
          () => this.runAction("open-note", card),
        );
      }
      if (interactive && this.plugin.settings.deckHeaderButtons.tray) {
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
      if (interactive && this.plugin.settings.deckHeaderButtons.bookmark) {
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
      this.cardFooters.render(frame, {
        sourcePath: card.path,
        backlinks: this.plugin.index.backlinksForPath(card.path),
        interactive: interactive && filedIndex === activeIndex,
        activate: (backlink) => this.jumpToPath(backlink.path),
      });
      jobs.push(this.renderMarkdownCard(card, scroll, version, interactive));

      if (!interactive) {
        continue;
      }
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
        this.selectCardWithoutMoving(card.path);
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
    interactive: boolean,
  ): Promise<void> {
    const component = new Component();
    component.load();
    this.renderComponents.push(component);
    try {
      const body = await this.plugin.index.readBody(card.file);
      if (version !== this.renderVersion) {
        return;
      }
      await MarkdownRenderer.render(
        this.app,
        body,
        target,
        card.file.path,
        component,
      );
      if (interactive) {
        this.attachInternalLinkInteractions(target, card.file.path);
      } else {
        this.makeRenderedPreviewPassive(target);
      }
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
        const destination = this.app.metadataCache.getFirstLinkpathDest(
          linkPath,
          sourcePath,
        );
        if (destination === null) {
          return;
        }
        const filed = this.plugin.index.filedByFile(destination);
        if (filed === undefined) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.jumpToPath(filed.path);
      },
      { capture: true },
    );
  }

  private async renderFilingCard(
    shell: HTMLElement,
    file: TFile,
    version: number,
  ): Promise<void> {
    const inHand = shell.createDiv({ cls: "slipbox-in-hand" });
    inHand.createDiv({ cls: "slipbox-in-hand-label", text: "Unfiled card in hand" });
    const header = inHand.createDiv({ cls: "slipbox-in-hand-header" });
    this.renderFilingAddressField(header);
    header.createDiv({
      cls: "slipbox-in-hand-name",
      text: this.plugin.cardTitle(file),
    });
    this.filingDuplicateEl = inHand.createDiv({
      cls: "slipbox-filing-duplicate",
      attr: { "aria-live": "polite" },
    });
    const preview = inHand.createDiv({ cls: "slipbox-in-hand-preview markdown-rendered" });
    this.renderFilingFooter(inHand);
    this.updateFilingControls();
    const component = new Component();
    component.load();
    this.renderComponents.push(component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (version === this.renderVersion) {
        await MarkdownRenderer.render(this.app, body, preview, file.path, component);
        this.makeRenderedPreviewPassive(preview);
      }
    } catch (error) {
      preview.setText(`Could not render this card: ${errorMessage(error)}`);
    }
  }

  private renderFilingAddressField(header: HTMLElement): void {
    const field = header.createEl("label", { cls: "slipbox-filing-field" });
    field.createSpan({ text: "Address" });
    const input = field.createEl("input", {
      type: "text",
      value: this.filingInputValue,
      attr: {
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": "Card address",
      },
    });
    this.filingInputEl = input;
    input.addEventListener("input", () => {
      void this.updateFilingInput(input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void this.cancelFiling();
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (this.filingPreview !== null) {
          void this.confirmFiling();
        } else {
          this.recalculateFilingPreview();
          this.updateFilingControls();
        }
      } else if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        this.contentEl.focus({ preventScroll: true });
      }
    });
    this.filingStatusEl = header.createDiv({
      cls: "slipbox-filing-status",
      attr: { "aria-live": "polite" },
    });
  }

  private renderFilingFooter(inHand: HTMLElement): void {
    const footer = inHand.createDiv({ cls: "slipbox-filing-footer" });
    footer.createDiv({
      cls: "slipbox-filing-focus-hint",
      text: "Tab: browse Deck · Shift+Tab: return to address",
    });
    const buttons = footer.createDiv({ cls: "slipbox-filing-buttons" });
    const cancel = buttons.createEl("button", {
      text: "Cancel",
      attr: { type: "button" },
    });
    this.filingCancelEl = cancel;
    cancel.addEventListener("click", () => this.runAction("cancel-filing"));
    const confirm = buttons.createEl("button", {
      text: "File card",
      cls: "mod-cta",
      attr: { type: "button" },
    });
    this.filingConfirmEl = confirm;
    confirm.addEventListener("click", () => this.runAction("confirm-filing"));
  }

  private makeRenderedPreviewPassive(target: HTMLElement): void {
    target.querySelectorAll<HTMLElement>(
      "a, button, input, textarea, select, [tabindex]",
    ).forEach((descendant) => {
      descendant.tabIndex = -1;
      descendant.setAttr("aria-disabled", "true");
    });
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
    const previousSignature = this.filingPreview?.placementSignature;
    const preview = this.plugin.filingPreviewFor(file, validation.address);
    this.filingPreview = preview;
    if (
      previousSignature !== preview.placementSignature ||
      this.filingFocusDisplayIndex === null ||
      this.filingViewportPosition === null
    ) {
      const focusIndex = defaultFilingFocusIndex(preview);
      this.filingFocusDisplayIndex = focusIndex;
      this.filingViewportPosition = focusIndex;
    } else {
      const displayCount = this.filingDisplayCount();
      this.filingFocusDisplayIndex = Math.round(clampViewportPosition(
        this.filingFocusDisplayIndex,
        displayCount,
      ));
      this.filingViewportPosition = clampViewportPosition(
        this.filingViewportPosition,
        displayCount,
      );
    }
    if (preview.insertionIndex === 0) {
      this.filingMessage = "Will be filed at the beginning of the Deck.";
    } else if (
      preview.insertionIndex === this.plugin.index.snapshot.filed.length
    ) {
      this.filingMessage = "Will be filed at the end of the Deck.";
    } else {
      this.filingMessage = "Previewing the exact Deck position.";
    }
  }

  private clearFilingPlacement(): void {
    this.filingPreview = null;
    this.filingFocusDisplayIndex = null;
    this.filingViewportPosition = null;
  }

  private async updateFilingInput(value: string): Promise<void> {
    if (this.filingConfirmationInProgress) {
      return;
    }
    this.filingInputValue = value;
    this.recalculateFilingPreview();
    if (this.canUpdateFilingPreviewInPlace()) {
      this.updateFilingPreviewInPlace();
      return;
    }
    await this.renderDeck();
  }

  private canUpdateFilingPreviewInPlace(): boolean {
    if (this.plugin.index.snapshot.filed.length === 0) {
      return false;
    }
    const preview = this.filingPreview;
    if (preview === null) {
      return true;
    }
    const visiblePaths = new Set(
      this.renderedCards.flatMap((card) =>
        card.dataset.path === undefined ? [] : [card.dataset.path]),
    );
    return [preview.previousPath, preview.nextPath].every(
      (path) => path === null || visiblePaths.has(path),
    );
  }

  private updateFilingPreviewInPlace(): void {
    const preview = this.filingPreview;
    for (const card of this.renderedCards) {
      const filedIndex = Number(card.dataset.filedIndex ?? "-1");
      if (filedIndex < 0) {
        continue;
      }
      const displayIndex = preview !== null && filedIndex >= preview.insertionIndex
        ? filedIndex + 1
        : filedIndex;
      card.dataset.index = String(displayIndex);
    }
    if (preview === null) {
      const previousGhost = this.filingGhostEl;
      this.filingGhostEl = removeFilingGhost(this.filingGhostEl);
      this.renderedCards = this.renderedCards.filter(
        (card) => card !== previousGhost,
      );
    } else if (this.spaceEl !== null) {
      this.filingGhostEl = renderOrUpdateFilingGhost(
        this.spaceEl,
        preview,
        this.filingGhostEl,
      );
      if (!this.renderedCards.includes(this.filingGhostEl)) {
        this.renderedCards.push(this.filingGhostEl);
      }
    }
    this.updateFilingControls();
    this.positionCards();
    this.scheduleCardPositioning();
  }

  private updateFilingControls(): void {
    this.filingStatusEl?.setText(this.filingMessage);
    this.filingStatusEl?.toggleClass(
      "is-invalid",
      this.filingPreview === null && this.filingMessage !== "Enter an address.",
    );
    if (this.filingInputEl !== null) {
      this.filingInputEl.disabled = this.filingConfirmationInProgress;
    }
    if (this.filingCancelEl !== null) {
      this.filingCancelEl.disabled = this.filingConfirmationInProgress;
    }
    if (this.filingConfirmEl !== null) {
      this.filingConfirmEl.disabled =
        this.filingPreview === null || this.filingConfirmationInProgress;
    }
    const duplicate = this.filingDuplicateEl;
    if (duplicate === null) {
      return;
    }
    duplicate.empty();
    const preview = this.filingPreview;
    if (preview === null) {
      return;
    }
    const matches = this.plugin.index.filedAtAddress(preview.address);
    if (matches.length === 0) {
      return;
    }
    const details = duplicate.createEl("details");
    details.createEl("summary", {
      text: `Address ${preview.address} is already used by ${matches.length} card${
        matches.length === 1 ? "" : "s"
      } · placed in path order`,
    });
    details.createDiv({
      cls: "slipbox-filing-duplicate-copy",
      text: `This card will be placed alongside ${
        matches.length === 1 ? "it" : "them"
      }.`,
    });
    const paths = details.createEl("ul");
    for (const match of matches) {
      paths.createEl("li", { text: match.path });
    }
  }

  private focusFilingInput(): void {
    if (this.filingInputEl === null) {
      return;
    }
    window.requestAnimationFrame(() => {
      this.focusFilingInputNow();
    });
  }

  private focusFilingInputNow(): void {
    const input = this.filingInputEl;
    if (input === null) {
      return;
    }
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }

  private async confirmFiling(): Promise<void> {
    const file = this.filingFile;
    const preview = this.filingPreview;
    if (
      file === null ||
      preview === null ||
      this.filingConfirmationInProgress
    ) {
      return;
    }
    this.filingConfirmationInProgress = true;
    this.updateFilingControls();
    try {
      const result = await this.plugin.fileCard(file, preview);
      if (result.status === "preview-changed") {
        this.recalculateFilingPreview();
        await this.renderDeck();
        new Notice("The Deck changed. Review the updated position and confirm again.");
        return;
      }
      if (result.status === "failed") {
        this.recalculateFilingPreview();
        await this.renderDeck();
        return;
      }
      await this.animateFiling(result.address);
      this.filingGhostEl = removeFilingGhost(this.filingGhostEl);
      this.filingFile = null;
      this.filingSourcePath = null;
      this.filingPreview = null;
      this.filingFocusDisplayIndex = null;
      this.filingViewportPosition = null;
      this.filingInputValue = "";
      this.activePath = file.path;
      this.viewportOffset = 0;
      this.history.replaceCurrent(file.path);
      await this.plugin.refreshDeckViews();
    } finally {
      this.filingConfirmationInProgress = false;
      this.updateFilingControls();
    }
  }

  private async animateFiling(address: string): Promise<void> {
    const inHand = this.contentEl.querySelector<HTMLElement>(".slipbox-in-hand");
    if (inHand === null) {
      return;
    }
    const label = inHand.querySelector<HTMLElement>(".slipbox-in-hand-label");
    label?.setText(`Filed as ${address}`);
    inHand.addClass("is-entering-deck");
    await new Promise<void>((resolve) =>
      window.setTimeout(resolve, FILING_ANIMATION_DURATION_MS + 40),
    );
  }

  private renderBookmarkEdgeTabs(
    stage: HTMLElement,
    bookmarkedPaths = this.bookmarkedPaths(),
  ): void {
    stage.querySelectorAll<HTMLElement>(".slipbox-bookmark-edge-tab")
      .forEach((tab) => tab.remove());
    if (
      this.filingFile !== null ||
      this.activePath === null ||
      bookmarkedPaths.size === 0
    ) {
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
      tab.addEventListener("click", () => void this.jumpToPath(card.path));
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
        this.moveViewportByPixels(event.deltaX * scale);
      },
      { passive: false },
    );

    stage.addEventListener("pointerdown", (event) => {
      if (event.target !== stage || event.button !== 0) {
        return;
      }
      this.cancelViewportCentering();
      this.cancelSpaceRecentering();
      this.pointerLastX = event.clientX;
      this.pointerLastY = event.clientY;
      stage.setPointerCapture(event.pointerId);
      stage.addClass("is-dragging");
      this.contentEl.focus({ preventScroll: true });
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
    if (this.filingFile !== null) {
      this.moveFilingViewportByPixels(deltaPixels);
      return;
    }
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

  private moveFilingViewportByPixels(deltaPixels: number): void {
    if (this.filingPreview === null) {
      return;
    }
    const step = this.cardStep();
    if (step <= 0) {
      return;
    }
    const displayCount = this.filingDisplayCount();
    const previousFocusIndex = this.currentFilingFocusIndex();
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const viewportPosition = clampViewportPosition(
      this.displayViewportPosition(activeIndex) + deltaPixels / step,
      displayCount,
    );
    this.filingViewportPosition = viewportPosition;
    this.filingFocusDisplayIndex = activeIndexForViewport(
      viewportPosition,
      previousFocusIndex,
      displayCount,
    );
    this.positionCards();
    if (this.pointerLastX === null) {
      this.queueRenderWindowRefresh();
    }
  }

  private moveBy(delta: number): void {
    if (this.filingFile !== null) {
      this.moveFilingFocusBy(delta);
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }
    const targetIndex = Math.max(
      0,
      Math.min(filed.length - 1, activeIndex + delta),
    );
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

  private moveFilingFocusBy(delta: number): void {
    const focusIndex = this.currentFilingFocusIndex();
    if (focusIndex < 0) {
      return;
    }
    this.setFilingFocusIndex(focusIndex + delta);
  }

  private setFilingFocusIndex(index: number): void {
    if (this.filingPreview === null) {
      return;
    }
    const focusIndex = Math.round(clampViewportPosition(
      index,
      this.filingDisplayCount(),
    ));
    this.filingFocusDisplayIndex = focusIndex;
    this.filingViewportPosition = focusIndex;
    this.positionCards();
    this.queueRenderWindowRefresh();
  }

  private centerActiveCard(): void {
    if (this.filingFile !== null) {
      const focusIndex = this.currentFilingFocusIndex();
      if (focusIndex < 0) {
        return;
      }
      this.recenterSpace();
      this.setFilingFocusIndex(focusIndex);
      return;
    }
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
    if (this.filingFile !== null) {
      const displayCount = this.filingDisplayCount();
      if (this.filingPreview === null || displayCount === 0) {
        return;
      }
      this.setFilingFocusIndex(boundary === "start" ? 0 : displayCount - 1);
      return;
    }
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
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return false;
    }

    if (!this.canRunAction(action)) {
      return false;
    }

    event.preventDefault();
    if (!event.repeat || repeatable) {
      this.runAction(action);
    }
    return true;
  }

  private selectCardWithoutMoving(path: string): void {
    this.cancelViewportCentering();
    const previousActiveIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const targetIndex = this.plugin.index.filedIndexForPath(path);
    if (targetIndex < 0) {
      return;
    }

    const viewportPosition = previousActiveIndex < 0
      ? targetIndex
      : this.viewportPosition(previousActiveIndex);
    this.activePath = path;
    this.viewportOffset = viewportPosition - targetIndex;
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
      (activeIndex < 0 && this.filingPreview === null)
    ) {
      return true;
    }

    const step = this.cardStep();
    if (step <= 0) {
      return false;
    }
    const focusDisplayIndex = this.visualFocusDisplayIndex(activeIndex);
    const viewportPosition = this.displayViewportPosition(activeIndex);
    const filingMode = this.filingFile !== null;
    const previewing = this.filingPreview !== null;

    for (const card of this.renderedCards) {
      const index = Number(card.dataset.index ?? "-1");
      const isActive = !filingMode && card.dataset.path === this.activePath;
      const isFilingFocus = previewing && index === focusDisplayIndex;
      card.toggleClass("is-active", isActive);
      card.toggleClass("is-filing-focus", isFilingFocus);
      card.style.zIndex = String(cardStackOrder(index, focusDisplayIndex));
      const motion = cardMotionStyle(
        index,
        viewportPosition,
        step,
        isActive || isFilingFocus,
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
    if (this.filingFile !== null) {
      this.updateHistoryControls();
      return;
    }
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
  }

  private viewportPosition(activeIndex: number): number {
    return activeIndex + this.viewportOffset;
  }

  private filingDisplayCount(): number {
    return this.plugin.index.snapshot.filed.length +
      (this.filingPreview === null ? 0 : 1);
  }

  private currentFilingFocusIndex(): number {
    const preview = this.filingPreview;
    if (preview === null) {
      return -1;
    }
    const displayCount = this.filingDisplayCount();
    const focusIndex = this.filingFocusDisplayIndex ??
      defaultFilingFocusIndex(preview);
    return Math.round(clampViewportPosition(focusIndex, displayCount));
  }

  private activeDisplayIndex(activeIndex: number): number {
    if (activeIndex < 0) {
      return -1;
    }
    return activeIndex + (
      this.filingPreview !== null &&
      activeIndex >= this.filingPreview.insertionIndex
        ? 1
        : 0
    );
  }

  private visualFocusDisplayIndex(activeIndex: number): number {
    return this.filingPreview === null
      ? this.activeDisplayIndex(activeIndex)
      : this.currentFilingFocusIndex();
  }

  private displayViewportPosition(activeIndex: number): number {
    if (this.filingPreview === null) {
      return this.viewportPosition(activeIndex);
    }
    return clampViewportPosition(
      this.filingViewportPosition ?? this.currentFilingFocusIndex(),
      this.filingDisplayCount(),
    );
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
    if (
      this.renderRefreshPending ||
      this.pointerLastX !== null
    ) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0 && this.filingPreview === null) {
      return;
    }
    const displayCount = filed.length + (this.filingPreview === null ? 0 : 1);
    const viewportIndex = Math.round(this.displayViewportPosition(activeIndex));
    const needsEarlierCards =
      this.renderWindowStart > 0 &&
      viewportIndex <= this.renderWindowStart + RENDER_EDGE_BUFFER;
    const needsLaterCards =
      this.renderWindowEnd < displayCount - 1 &&
      viewportIndex >= this.renderWindowEnd - RENDER_EDGE_BUFFER;
    if (!needsEarlierCards && !needsLaterCards) {
      return;
    }

    const restoreFilingInputFocus =
      this.filingInputEl !== null &&
      this.filingInputEl.ownerDocument.activeElement === this.filingInputEl;
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
      this.backButtonEl.disabled =
        this.filingFile !== null || !this.history.canBack();
    }
    if (this.forwardButtonEl !== null) {
      this.forwardButtonEl.disabled =
        this.filingFile !== null || !this.history.canForward();
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
    for (const component of this.renderComponents) {
      component.unload();
    }
    this.renderComponents = [];
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
