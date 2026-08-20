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
} from "obsidian";

import type SlipboxPlugin from "./main.js";
import {
  activeIndexForViewport,
  bookmarkEdgeTargets,
  cardMotionStyle,
  cardStackOrder,
  clampViewportPosition,
  viewportPositionToRevealCard,
} from "./deck-motion.js";
import { NavigationHistory } from "./navigation-history.js";
import type { FiledZettel } from "./zettel-index.js";
import { CardFooterManager } from "./card-footer.js";

export const DECK_VIEW_TYPE = "slipbox-deck";

const FILING_ANIMATION_DURATION_MS = 280;
const RENDER_EDGE_BUFFER = 2;
const LAYOUT_MEASUREMENT_RETRIES = 2;

export class DeckView extends ItemView {
  private activeId: string | null = null;
  private filingFile: TFile | null = null;
  private stageEl: HTMLElement | null = null;
  private renderedCards: HTMLElement[] = [];
  private renderComponents: Component[] = [];
  private cardScrollPositions = new Map<string, number>();
  private viewportOffset = 0;
  private pointerLastX: number | null = null;
  private filingPromptEl: HTMLElement | null = null;
  private renderWindowStart = 0;
  private renderWindowEnd = -1;
  private renderRefreshPending = false;
  private renderVersion = 0;
  private readonly history = new NavigationHistory<string>();
  private backButtonEl: HTMLButtonElement | null = null;
  private forwardButtonEl: HTMLButtonElement | null = null;
  private bookmarksButtonEl: HTMLButtonElement | null = null;
  private deskButtonEl: HTMLButtonElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private positioningFrame: number | null = null;
  private positioningRetriesRemaining = 0;
  private readonly cardFooters: CardFooterManager;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SlipboxPlugin,
  ) {
    super(leaf);
    this.cardFooters = new CardFooterManager({
      app: this.app,
      leaf: this.leaf,
      hoverSource: DECK_VIEW_TYPE,
      isOnDesk: (file) => this.plugin.state.deskCards.some(
        (card) => card.cardRef === file.path,
      ),
      putOnDesk: (file) => this.plugin.putFileOnDesk(file, false),
    });
    this.registerEvent(
      this.app.workspace.on("css-change", () => this.cardFooters.scheduleLayout()),
    );
    this.scope = new Scope(this.app.scope);
    this.scope.register([], "ArrowLeft", (event) =>
      this.handleDeckKey(event, () => this.moveBy(-1), true),
    );
    this.scope.register([], "ArrowRight", (event) =>
      this.handleDeckKey(event, () => this.moveBy(1), true),
    );
    this.scope.register([], "j", (event) =>
      this.handleDeckKey(event, () => this.moveBy(1), true),
    );
    this.scope.register([], "k", (event) =>
      this.handleDeckKey(event, () => this.moveBy(-1), true),
    );
    this.scope.register([], "c", (event) =>
      this.handleDeckKey(event, () => this.centerActiveCard()),
    );
    this.scope.register([], "g", (event) =>
      this.handleDeckKey(event, () => this.goToDeckBoundary("start")),
    );
    this.scope.register(["Shift"], "g", (event) =>
      this.handleDeckKey(event, () => this.goToDeckBoundary("end")),
    );
  }

  getViewType(): string {
    return DECK_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Slipbox Deck";
  }

  getIcon(): string {
    return "archive";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("slipbox-deck-view");
    this.contentEl.tabIndex = 0;
    this.observeDeckSize();
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.cardFooters.clear();
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
    this.stageEl = null;
    this.renderedCards = [];
    this.filingPromptEl = null;
    this.backButtonEl = null;
    this.forwardButtonEl = null;
    this.bookmarksButtonEl = null;
    this.deskButtonEl = null;
    this.history.reset();
  }

  onResize(): void {
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
  }

  get activeCard(): FiledZettel | null {
    if (this.activeId === null) {
      return null;
    }
    return this.plugin.index.filedById(this.activeId) ?? null;
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

  async refresh(): Promise<void> {
    const previousActiveId = this.activeId;
    this.chooseAvailableActiveCard();
    if (this.activeId !== previousActiveId) {
      this.viewportOffset = 0;
    }
    if (this.activeId === null) {
      this.history.reset();
    } else if (this.history.current() === undefined) {
      this.history.reset(this.activeId);
    } else if (this.activeId !== previousActiveId) {
      this.history.replaceCurrent(this.activeId);
    }
    this.clampViewportOffset();
    await this.renderDeck();
  }

  async startFiling(file: TFile): Promise<void> {
    this.filingFile = file;
    await this.renderDeck();
  }

  async cancelFiling(): Promise<void> {
    this.filingFile = null;
    await this.renderDeck();
    new Notice("Filing cancelled. The card remains on the Desk.");
  }

  async goToId(id: string): Promise<void> {
    const moved = await this.navigateToId(id);
    if (moved) {
      this.history.replaceCurrent(id);
      this.updateHistoryControls();
    }
  }

  async jumpToId(id: string): Promise<void> {
    if (this.activeId !== null) {
      this.history.replaceCurrent(this.activeId);
    }
    if (this.plugin.index.filedById(id) === undefined) {
      new Notice(`Card ${id} is missing, invalid, or duplicated.`);
      return;
    }
    this.history.jump(id);
    await this.navigateToId(id);
    this.updateHistoryControls();
  }

  async goBack(): Promise<void> {
    const id = this.history.back();
    if (id === undefined) {
      return;
    }
    if (!(await this.navigateToId(id))) {
      new Notice(`The Back destination ${id} is no longer available.`);
    }
    this.updateHistoryControls();
  }

  async goForward(): Promise<void> {
    const id = this.history.forward();
    if (id === undefined) {
      return;
    }
    if (!(await this.navigateToId(id))) {
      new Notice(`The Forward destination ${id} is no longer available.`);
    }
    this.updateHistoryControls();
  }

  async addBookmarkToCurrent(): Promise<void> {
    if (this.activeId === null) {
      new Notice("There is no active filed card.");
      return;
    }
    const bookmarkedIds = this.bookmarkedIds();
    bookmarkedIds.add(this.activeId);
    this.updateBookmarkUi(bookmarkedIds);
    await this.plugin.addBookmark(this.activeId);
  }

  async removeBookmark(zettelId: string): Promise<void> {
    const bookmarkedIds = this.bookmarkedIds();
    bookmarkedIds.delete(zettelId);
    this.updateBookmarkUi(bookmarkedIds);
    await this.plugin.removeBookmark(zettelId);
  }

  private async navigateToId(id: string): Promise<boolean> {
    const filed = this.plugin.index.snapshot.filed;
    const targetIndex = filed.findIndex((card) => card.id === id);
    if (targetIndex < 0) {
      new Notice(`Card ${id} is missing, invalid, or duplicated.`);
      return false;
    }
    this.activeId = id;
    this.viewportOffset = 0;
    await this.renderDeck();
    return true;
  }

  async addCurrentAsEntryPoint(): Promise<void> {
    if (this.activeId === null) {
      new Notice("There is no active filed card.");
      return;
    }
    await this.plugin.addEntryPoint(this.activeId);
  }

  private chooseAvailableActiveCard(): void {
    const filed = this.plugin.index.snapshot.filed;
    const available = new Set(filed.map((card) => card.id));

    if (this.activeId !== null && available.has(this.activeId)) {
      return;
    }

    const firstEntryPoint = this.plugin.state.entryPoints.find((entry) =>
      available.has(entry.id),
    );
    this.activeId = firstEntryPoint?.id ?? filed[0]?.id ?? null;
  }

  private async renderDeck(): Promise<void> {
    const version = ++this.renderVersion;
    this.rememberScrollPositions();
    this.unloadRenderComponents();
    this.cardFooters.clear();
    this.contentEl.empty();
    this.renderedCards = [];
    this.filingPromptEl = null;
    this.backButtonEl = null;
    this.forwardButtonEl = null;
    this.bookmarksButtonEl = null;
    this.deskButtonEl = null;

    const shell = this.contentEl.createDiv({ cls: "slipbox-deck-shell" });
    if (this.filingFile !== null) {
      shell.addClass("is-filing");
    }
    this.renderToolbar(shell);

    const stage = shell.createDiv({ cls: "slipbox-deck-stage" });
    this.stageEl = stage;
    this.attachBrowsingEvents(stage);

    const filed = this.plugin.index.snapshot.filed;
    if (filed.length === 0 || this.activeId === null) {
      this.renderEmptyDeck(stage);
    } else {
      const activeIndex = filed.findIndex((card) => card.id === this.activeId);
      if (activeIndex >= 0) {
        await this.renderCardWindow(stage, filed, activeIndex, version);
      }
    }

    if (version !== this.renderVersion) {
      return;
    }

    if (this.filingFile !== null) {
      await this.renderFilingCard(shell, this.filingFile, version);
      this.renderFilingActions(shell);
    }
    this.renderBookmarkEdgeTabs(stage);
    this.positionCards();
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
  }

  private renderToolbar(shell: HTMLElement): void {
    const toolbar = shell.createDiv({ cls: "slipbox-deck-toolbar" });
    const identity = toolbar.createDiv({ cls: "slipbox-deck-identity" });
    const icon = identity.createSpan({ cls: "slipbox-deck-icon" });
    setIcon(icon, "archive");
    identity.createSpan({ text: "Deck" });

    const history = toolbar.createDiv({ cls: "slipbox-toolbar-group slipbox-history-controls" });
    const back = history.createEl("button", {
      text: "← Back",
      attr: { type: "button" },
    });
    back.addEventListener("click", () => void this.goBack());
    this.backButtonEl = back;
    const forward = history.createEl("button", {
      text: "Forward →",
      attr: { type: "button" },
    });
    forward.addEventListener("click", () => void this.goForward());
    this.forwardButtonEl = forward;
    this.updateHistoryControls();

    const controls = toolbar.createDiv({ cls: "slipbox-toolbar-group slipbox-toolbar-main" });
    const entries = controls.createEl("button", {
      text: "Entry points",
      attr: { type: "button" },
    });
    entries.addEventListener("click", () => this.plugin.showEntryPoints(this));

    const bookmarks = controls.createEl("button", {
      attr: { type: "button" },
      cls: "slipbox-bookmarks-button",
    });
    bookmarks.createSpan({ text: "Bookmarks" });
    if (this.plugin.state.bookmarks.length > 0) {
      bookmarks.createSpan({ cls: "slipbox-count", text: String(this.plugin.state.bookmarks.length) });
    }
    bookmarks.addEventListener("click", () => this.plugin.showBookmarks(this));
    this.bookmarksButtonEl = bookmarks;

    const desk = controls.createEl("button", {
      attr: { type: "button" },
      cls: "slipbox-desk-button",
    });
    desk.createSpan({ text: "Desk" });
    const deskCount = this.plugin.state.deskCards.length;
    if (deskCount > 0) {
      desk.createSpan({ cls: "slipbox-count", text: String(deskCount) });
    }
    desk.addEventListener("click", () => this.plugin.showDesk());
    this.deskButtonEl = desk;

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
      problems.addEventListener("click", () => this.plugin.showIssues());
    }

    const spreadControl = toolbar.createEl("label", { cls: "slipbox-spread-control" });
    spreadControl.createSpan({ text: "Spread" });
    const slider = spreadControl.createEl("input", {
      type: "range",
      attr: {
        min: "0.28",
        max: "1.12",
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
  }

  private renderEmptyDeck(stage: HTMLElement): void {
    const empty = stage.createDiv({ cls: "slipbox-deck-empty" });
    empty.createEl("h2", { text: "The filing box is empty" });
    empty.createEl("p", {
      text: this.filingFile === null
        ? "Create a new section to place the first filed card."
        : "There is no filed card to use as an attachment point. Cancel filing, then create the first section.",
    });
    const create = empty.createEl("button", {
      text: "New section",
      cls: "mod-cta",
      attr: { type: "button" },
    });
    create.addEventListener("click", () => void this.plugin.createNewSection());
  }

  private async renderCardWindow(
    stage: HTMLElement,
    filed: readonly FiledZettel[],
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

    for (let index = start; index <= end; index += 1) {
      const card = filed[index];
      if (card === undefined) {
        continue;
      }

      const cardEl = stage.createDiv({ cls: "slipbox-card" });
      cardEl.dataset.index = String(index);
      cardEl.dataset.path = card.path;
      cardEl.dataset.zettelId = card.id;
      cardEl.toggleClass("is-active", index === activeIndex);
      const isBookmarked = this.plugin.bookmarkAt(card.id) !== undefined;
      const isOnDesk = this.plugin.state.deskCards.some(
        (deskCard) => deskCard.cardRef === card.path,
      );
      const cardLabel = `${card.id} · ${card.file.basename}`;
      cardEl.setAttr("aria-label", cardLabel);
      setTooltip(cardEl, cardLabel, {
        placement: "bottom",
        delay: 350,
      });
      cardEl.style.zIndex = String(cardStackOrder(index, activeIndex));
      this.renderedCards.push(cardEl);

      const frame = cardEl.createDiv({ cls: "slipbox-card-frame" });
      const addressRow = frame.createDiv({ cls: "slipbox-card-address-row" });
      addressRow.createSpan({ cls: "slipbox-card-address", text: card.id });
      const cardActions = addressRow.createDiv({ cls: "slipbox-card-actions" });
      const addCardAction = `Add a card from ${card.id}`;
      const addCard = cardActions.createEl("button", {
        cls: "clickable-icon slipbox-card-toggle slipbox-card-add",
        attr: {
          type: "button",
          "aria-label": addCardAction,
        },
      });
      setIcon(addCard, "plus");
      setTooltip(addCard, addCardAction, {
        placement: "bottom",
        delay: 250,
      });
      addCard.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      addCard.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        addCard.disabled = true;
        void this.plugin.createCardFrom(card.id).finally(() => {
          if (addCard.isConnected) {
            addCard.disabled = false;
          }
        });
      });

      const openCardAction = `Open ${card.id} in Markdown`;
      const openCard = cardActions.createEl("button", {
        cls: "clickable-icon slipbox-card-toggle slipbox-card-open",
        attr: {
          type: "button",
          "aria-label": openCardAction,
        },
      });
      setIcon(openCard, "file-pen-line");
      setTooltip(openCard, openCardAction, {
        placement: "bottom",
        delay: 250,
      });
      openCard.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      openCard.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.plugin.openMarkdownFile(card.file);
      });

      const deskAction = isOnDesk
        ? `Remove ${card.id} from Desk`
        : `Add ${card.id} to Desk`;
      const deskToggle = cardActions.createEl("button", {
        cls: "clickable-icon slipbox-card-toggle slipbox-card-desk-toggle",
        attr: {
          type: "button",
          "aria-label": deskAction,
          "aria-pressed": String(isOnDesk),
        },
      });
      deskToggle.toggleClass("is-on-desk", isOnDesk);
      setIcon(deskToggle, "panels-top-left");
      setTooltip(deskToggle, deskAction, {
        placement: "bottom",
        delay: 250,
      });
      deskToggle.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      deskToggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.toggleCardDesk(card.file);
      });

      const bookmarkAction = isBookmarked
        ? `Remove bookmark from ${card.id}`
        : `Add bookmark to ${card.id}`;
      const bookmarkToggle = cardActions.createEl("button", {
        cls: "clickable-icon slipbox-card-toggle slipbox-card-bookmark-toggle",
        attr: {
          type: "button",
          "aria-label": bookmarkAction,
          "aria-pressed": String(isBookmarked),
        },
      });
      bookmarkToggle.toggleClass("is-bookmarked", isBookmarked);
      setIcon(bookmarkToggle, "bookmark");
      setTooltip(bookmarkToggle, bookmarkAction, {
        placement: "bottom",
        delay: 250,
      });
      bookmarkToggle.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      bookmarkToggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.toggleCardBookmark(card.id);
      });

      const scroll = frame.createDiv({ cls: "slipbox-card-scroll markdown-rendered" });
      scroll.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
      this.cardFooters.render(frame, {
        sourcePath: card.path,
        backlinks: this.plugin.index.backlinksForPath(card.path),
        interactive: index === activeIndex,
        activate: (backlink) => this.jumpToId(backlink.id),
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
          card.id,
          DECK_VIEW_TYPE,
          this.leaf,
        );
      });

      cardEl.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        if (card.id === this.activeId) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.selectCardWithoutMoving(card.id);
      });
    }

    this.positionCards();

    await Promise.all(jobs);
  }

  private async renderMarkdownCard(
    card: FiledZettel,
    target: HTMLElement,
    version: number,
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
      this.attachInternalLinkInteractions(target, card.file.path);
      target.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
    } catch (error) {
      target.createEl("p", {
        cls: "slipbox-render-error",
        text: `Could not render this card: ${errorMessage(error)}`,
      });
    }
  }

  private async toggleCardBookmark(zettelId: string): Promise<void> {
    const bookmarkedIds = this.bookmarkedIds();
    if (bookmarkedIds.has(zettelId)) {
      bookmarkedIds.delete(zettelId);
    } else {
      bookmarkedIds.add(zettelId);
    }
    this.updateBookmarkUi(bookmarkedIds);
    await this.plugin.toggleBookmark(zettelId);
  }

  private async toggleCardDesk(file: TFile): Promise<void> {
    const deskCardRefs = this.deskCardRefs();
    if (deskCardRefs.has(file.path)) {
      deskCardRefs.delete(file.path);
    } else {
      deskCardRefs.add(file.path);
    }
    this.updateDeskUi(deskCardRefs);
    await this.plugin.toggleFileOnDesk(file);
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
        void this.jumpToId(filed.id);
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
    inHand.createDiv({ cls: "slipbox-in-hand-name", text: file.basename });
    const preview = inHand.createDiv({ cls: "slipbox-in-hand-preview markdown-rendered" });
    const component = new Component();
    component.load();
    this.renderComponents.push(component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (version === this.renderVersion) {
        await MarkdownRenderer.render(this.app, body, preview, file.path, component);
      }
    } catch (error) {
      preview.setText(`Could not render this card: ${errorMessage(error)}`);
    }
  }

  private renderFilingActions(shell: HTMLElement): void {
    const actions = shell.createDiv({ cls: "slipbox-filing-actions" });
    const attachment = this.activeCard;
    this.filingPromptEl = actions.createSpan({
      cls: "slipbox-filing-prompt",
      text: attachment === null
        ? "Choose an attachment point"
        : `Attach from ${attachment.id}`,
    });
    const cancel = actions.createEl("button", {
      text: "Cancel",
      attr: { type: "button" },
    });
    cancel.addEventListener("click", () => void this.cancelFiling());
    const fileHere = actions.createEl("button", {
      text: "File here",
      cls: "mod-cta",
      attr: { type: "button" },
    });
    fileHere.disabled = attachment === null;
    fileHere.addEventListener("click", () => void this.fileHere());
  }

  private async fileHere(): Promise<void> {
    const file = this.filingFile;
    const attachment = this.activeCard;
    if (file === null || attachment === null) {
      return;
    }

    const newId = await this.plugin.fileCard(file, attachment.id);
    if (newId === null) {
      return;
    }
    await this.animateFiling(newId);
    this.filingFile = null;
    this.activeId = newId;
    this.viewportOffset = 0;
    this.history.replaceCurrent(newId);
    await this.renderDeck();
  }

  private async animateFiling(newId: string): Promise<void> {
    const inHand = this.contentEl.querySelector<HTMLElement>(".slipbox-in-hand");
    if (inHand === null) {
      return;
    }
    const label = inHand.querySelector<HTMLElement>(".slipbox-in-hand-label");
    label?.setText(`Filed as ${newId}`);
    inHand.addClass("is-entering-deck");
    await new Promise<void>((resolve) =>
      window.setTimeout(resolve, FILING_ANIMATION_DURATION_MS + 40),
    );
  }

  private renderBookmarkEdgeTabs(
    stage: HTMLElement,
    bookmarkedIds = this.bookmarkedIds(),
  ): void {
    stage.querySelectorAll<HTMLElement>(".slipbox-bookmark-edge-tab")
      .forEach((tab) => tab.remove());
    if (this.activeId === null || bookmarkedIds.size === 0) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    const cardWidth = this.renderedCards[0]?.offsetWidth ?? 0;
    if (activeIndex < 0 || cardWidth <= 0) {
      return;
    }
    const bookmarkIndices = [...bookmarkedIds].flatMap((zettelId) => {
      const index = filed.findIndex((card) => card.id === zettelId);
      return index < 0 ? [] : [index];
    });
    const targets = bookmarkEdgeTargets(
      bookmarkIndices,
      this.viewportPosition(activeIndex),
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
        text: `${direction === "left" ? "◀" : "▶"} ${card.id}`,
        attr: {
          type: "button",
          "aria-label": `Jump to bookmark ${card.id}`,
        },
      });
      tab.addEventListener("click", () => void this.jumpToId(card.id));
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
      this.pointerLastX = event.clientX;
      stage.setPointerCapture(event.pointerId);
      stage.addClass("is-dragging");
      this.contentEl.focus({ preventScroll: true });
    });
    stage.addEventListener("pointermove", (event) => {
      if (this.pointerLastX === null) {
        return;
      }
      const movement = event.clientX - this.pointerLastX;
      this.pointerLastX = event.clientX;
      this.moveViewportByPixels(-movement);
    });
    const finishPointer = (event: PointerEvent): void => {
      if (this.pointerLastX === null) {
        return;
      }
      this.pointerLastX = null;
      stage.removeClass("is-dragging");
      if (stage.hasPointerCapture(event.pointerId)) {
        stage.releasePointerCapture(event.pointerId);
      }
      this.queueRenderWindowRefresh();
    };
    stage.addEventListener("pointerup", finishPointer);
    stage.addEventListener("pointercancel", finishPointer);
  }

  private moveViewportByPixels(deltaPixels: number): void {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
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
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0) {
      return;
    }
    const targetIndex = Math.max(
      0,
      Math.min(filed.length - 1, activeIndex + delta),
    );
    const target = filed[targetIndex];
    const stage = this.stageEl;
    const firstCard = this.renderedCards[0];
    if (target === undefined || target.id === this.activeId || stage === null) {
      return;
    }

    const viewportPosition = viewportPositionToRevealCard(
      targetIndex,
      this.viewportPosition(activeIndex),
      filed.length,
      this.cardStep(),
      stage.clientWidth,
      firstCard?.offsetWidth ?? 0,
    );
    this.activeId = target.id;
    this.viewportOffset = viewportPosition - targetIndex;
    this.history.replaceCurrent(target.id);
    this.positionCards();
    this.updateActiveUi();
    this.queueRenderWindowRefresh();
  }

  private centerActiveCard(): void {
    if (this.activeId === null) {
      new Notice("There is no active filed card to centre.");
      return;
    }
    this.viewportOffset = 0;
    this.positionCards();
    this.updateActiveUi();
    this.queueRenderWindowRefresh();
  }

  private goToDeckBoundary(boundary: "start" | "end"): void {
    const filed = this.plugin.index.snapshot.filed;
    const target = boundary === "start" ? filed[0] : filed[filed.length - 1];
    if (target === undefined) {
      new Notice("There are no filed cards.");
      return;
    }
    void this.goToId(target.id);
  }

  private handleDeckKey(
    event: KeyboardEvent,
    action: () => void,
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

    event.preventDefault();
    if (!event.repeat || repeatable) {
      action();
    }
    return true;
  }

  private selectCardWithoutMoving(id: string): void {
    const filed = this.plugin.index.snapshot.filed;
    const previousActiveIndex = filed.findIndex((card) => card.id === this.activeId);
    const targetIndex = filed.findIndex((card) => card.id === id);
    if (targetIndex < 0) {
      return;
    }

    const viewportPosition = previousActiveIndex < 0
      ? targetIndex
      : this.viewportPosition(previousActiveIndex);
    this.activeId = id;
    this.viewportOffset = viewportPosition - targetIndex;
    this.history.replaceCurrent(id);
    this.positionCards();
    this.updateActiveUi();
  }

  private applyViewportPosition(nextPosition: number): void {
    const filed = this.plugin.index.snapshot.filed;
    const previousActiveIndex = filed.findIndex((card) => card.id === this.activeId);
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

    this.activeId = activeCard.id;
    this.viewportOffset = viewportPosition - activeIndex;
    this.history.replaceCurrent(activeCard.id);
    this.positionCards();
    this.updateActiveUi();
    if (this.pointerLastX === null) {
      this.queueRenderWindowRefresh();
    }
  }

  private positionCards(): boolean {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0 || this.renderedCards.length === 0) {
      return true;
    }

    const step = this.cardStep();
    if (step <= 0) {
      return false;
    }
    const viewportPosition = this.viewportPosition(activeIndex);

    for (const card of this.renderedCards) {
      const index = Number(card.dataset.index ?? "-1");
      const motion = cardMotionStyle(
        index,
        viewportPosition,
        step,
        index === activeIndex,
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
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0) {
      return;
    }

    for (const card of this.renderedCards) {
      const index = Number(card.dataset.index ?? "-1");
      card.toggleClass("is-active", index === activeIndex);
      card.style.zIndex = String(cardStackOrder(index, activeIndex));
      this.cardFooters.setInteractive(card, index === activeIndex);
    }

    this.filingPromptEl?.setText(`Attach from ${this.activeId}`);
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl);
    }
    this.updateHistoryControls();
  }

  private bookmarkedIds(): Set<string> {
    return new Set(
      this.plugin.state.bookmarks.map((bookmark) => bookmark.zettelId),
    );
  }

  private deskCardRefs(): Set<string> {
    return new Set(this.plugin.state.deskCards.map((card) => card.cardRef));
  }

  private updateBookmarkUi(bookmarkedIds = this.bookmarkedIds()): void {
    const bookmarkCount = bookmarkedIds.size;
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
      const zettelId = cardEl.dataset.zettelId;
      const toggle = cardEl.querySelector<HTMLButtonElement>(
        ".slipbox-card-bookmark-toggle",
      );
      if (zettelId === undefined || toggle === null) {
        continue;
      }
      const isBookmarked = bookmarkedIds.has(zettelId);
      const action = isBookmarked
        ? `Remove bookmark from ${zettelId}`
        : `Add bookmark to ${zettelId}`;
      toggle.toggleClass("is-bookmarked", isBookmarked);
      toggle.setAttr("aria-label", action);
      toggle.setAttr("aria-pressed", String(isBookmarked));
      setTooltip(toggle, action, {
        placement: "bottom",
        delay: 250,
      });
    }

    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl, bookmarkedIds);
    }
  }

  private updateDeskUi(deskCardRefs = this.deskCardRefs()): void {
    const deskCount = deskCardRefs.size;
    if (this.deskButtonEl !== null) {
      const countEl = this.deskButtonEl.querySelector<HTMLElement>(".slipbox-count");
      if (deskCount === 0) {
        countEl?.remove();
      } else if (countEl === null) {
        this.deskButtonEl.createSpan({
          cls: "slipbox-count",
          text: String(deskCount),
        });
      } else {
        countEl.setText(String(deskCount));
      }
    }

    for (const cardEl of this.renderedCards) {
      const cardPath = cardEl.dataset.path;
      const zettelId = cardEl.dataset.zettelId;
      const toggle = cardEl.querySelector<HTMLButtonElement>(
        ".slipbox-card-desk-toggle",
      );
      if (cardPath === undefined || zettelId === undefined || toggle === null) {
        continue;
      }
      const isOnDesk = deskCardRefs.has(cardPath);
      const action = isOnDesk
        ? `Remove ${zettelId} from Desk`
        : `Add ${zettelId} to Desk`;
      toggle.toggleClass("is-on-desk", isOnDesk);
      toggle.setAttr("aria-label", action);
      toggle.setAttr("aria-pressed", String(isOnDesk));
      setTooltip(toggle, action, {
        placement: "bottom",
        delay: 250,
      });
    }
  }

  private viewportPosition(activeIndex: number): number {
    return activeIndex + this.viewportOffset;
  }

  private clampViewportOffset(): void {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
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
    if (this.renderRefreshPending || this.pointerLastX !== null) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0) {
      return;
    }
    const viewportIndex = Math.round(this.viewportPosition(activeIndex));
    const needsEarlierCards =
      this.renderWindowStart > 0 &&
      viewportIndex <= this.renderWindowStart + RENDER_EDGE_BUFFER;
    const needsLaterCards =
      this.renderWindowEnd < filed.length - 1 &&
      viewportIndex >= this.renderWindowEnd - RENDER_EDGE_BUFFER;
    if (!needsEarlierCards && !needsLaterCards) {
      return;
    }

    this.renderRefreshPending = true;
    window.requestAnimationFrame(() => {
      this.renderRefreshPending = false;
      if (this.stageEl !== null) {
        void this.renderDeck();
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
