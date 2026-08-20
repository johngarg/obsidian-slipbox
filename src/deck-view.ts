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

import type ZettelkastenPlugin from "./main.js";
import {
  activeCardActionAvailability,
  activeIndexForViewport,
  bookmarkEdgeTargets,
  cardMotionStyle,
  cardStackOrder,
  clampViewportPosition,
  viewportPositionToRevealCard,
} from "./deck-motion.js";
import { NavigationHistory } from "./navigation-history.js";
import type { FiledZettel } from "./zettel-index.js";

export const DECK_VIEW_TYPE = "zettelkasten-deck";

const FILING_ANIMATION_DURATION_MS = 280;
const RENDER_EDGE_BUFFER = 2;

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
  private addBookmarkButtonEl: HTMLButtonElement | null = null;
  private putOnDeskButtonEl: HTMLButtonElement | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ZettelkastenPlugin,
  ) {
    super(leaf);
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
    return "Zettelkasten Deck";
  }

  getIcon(): string {
    return "archive";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("zk-deck-view");
    this.contentEl.tabIndex = 0;
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.rememberScrollPositions();
    this.unloadRenderComponents();
    this.filingFile = null;
    this.stageEl = null;
    this.renderedCards = [];
    this.filingPromptEl = null;
    this.backButtonEl = null;
    this.forwardButtonEl = null;
    this.addBookmarkButtonEl = null;
    this.putOnDeskButtonEl = null;
    this.history.reset();
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
    await this.plugin.addBookmark(this.activeId);
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
    this.contentEl.empty();
    this.renderedCards = [];
    this.filingPromptEl = null;
    this.backButtonEl = null;
    this.forwardButtonEl = null;
    this.addBookmarkButtonEl = null;
    this.putOnDeskButtonEl = null;

    const shell = this.contentEl.createDiv({ cls: "zk-deck-shell" });
    if (this.filingFile !== null) {
      shell.addClass("is-filing");
    }
    this.renderToolbar(shell);

    const stage = shell.createDiv({ cls: "zk-deck-stage" });
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
  }

  private renderToolbar(shell: HTMLElement): void {
    const toolbar = shell.createDiv({ cls: "zk-deck-toolbar" });
    const identity = toolbar.createDiv({ cls: "zk-deck-identity" });
    const icon = identity.createSpan({ cls: "zk-deck-icon" });
    setIcon(icon, "archive");
    identity.createSpan({ text: "Deck" });

    const navigation = toolbar.createDiv({ cls: "zk-toolbar-group" });
    const previous = iconButton(navigation, "arrow-left", "Previous card");
    previous.addEventListener("click", () => void this.moveBy(-1));
    const next = iconButton(navigation, "arrow-right", "Next card");
    next.addEventListener("click", () => void this.moveBy(1));

    const history = toolbar.createDiv({ cls: "zk-toolbar-group zk-history-controls" });
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

    const controls = toolbar.createDiv({ cls: "zk-toolbar-group zk-toolbar-main" });
    const entries = controls.createEl("button", {
      text: "Entry points",
      attr: { type: "button" },
    });
    entries.addEventListener("click", () => this.plugin.showEntryPoints(this));

    const bookmarks = controls.createEl("button", {
      attr: { type: "button" },
      cls: "zk-bookmarks-button",
    });
    bookmarks.createSpan({ text: "Bookmarks" });
    if (this.plugin.state.bookmarks.length > 0) {
      bookmarks.createSpan({ cls: "zk-count", text: String(this.plugin.state.bookmarks.length) });
    }
    bookmarks.addEventListener("click", () => this.plugin.showBookmarks(this));

    const addBookmark = iconButton(
      controls,
      "bookmark-plus",
      "Add bookmark to current card",
    );
    this.addBookmarkButtonEl = addBookmark;
    addBookmark.addEventListener("click", () => void this.addBookmarkToCurrent());

    const desk = controls.createEl("button", {
      attr: { type: "button" },
      cls: "zk-desk-button",
    });
    desk.createSpan({ text: "Desk" });
    const deskCount = this.plugin.state.deskCards.length;
    if (deskCount > 0) {
      desk.createSpan({ cls: "zk-count", text: String(deskCount) });
    }
    desk.addEventListener("click", () => this.plugin.showDesk());

    const putOnDesk = iconButton(controls, "panels-top-left", "Put current card on Desk");
    this.putOnDeskButtonEl = putOnDesk;
    putOnDesk.addEventListener("click", () => {
      const file = this.activeCard?.file;
      if (file !== undefined) {
        void this.plugin.putFileOnDesk(file);
      }
    });
    this.updateActiveActionControls();

    if (this.plugin.index.snapshot.issues.length > 0) {
      const problems = controls.createEl("button", {
        cls: "zk-problem-button",
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

    const spreadControl = toolbar.createEl("label", { cls: "zk-spread-control" });
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
    const empty = stage.createDiv({ cls: "zk-deck-empty" });
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

      const cardEl = stage.createDiv({ cls: "zk-card" });
      cardEl.dataset.index = String(index);
      cardEl.dataset.path = card.path;
      cardEl.toggleClass("is-active", index === activeIndex);
      const isBookmarked = this.plugin.bookmarkAt(card.id) !== undefined;
      const cardLabel = `${card.id} · ${card.file.basename}`;
      cardEl.setAttr("aria-label", cardLabel);
      setTooltip(cardEl, cardLabel, {
        placement: "bottom",
        delay: 350,
      });
      cardEl.style.zIndex = String(cardStackOrder(index, viewportPosition, activeIndex));
      this.renderedCards.push(cardEl);

      const frame = cardEl.createDiv({ cls: "zk-card-frame" });
      const addressRow = frame.createDiv({ cls: "zk-card-address-row" });
      addressRow.createSpan({ cls: "zk-card-address", text: card.id });
      const bookmarkAction = isBookmarked
        ? `Remove bookmark from ${card.id}`
        : `Add bookmark to ${card.id}`;
      const bookmarkToggle = addressRow.createEl("button", {
        cls: "clickable-icon zk-card-bookmark-toggle",
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
        void this.plugin.toggleBookmark(card.id);
      });

      const scroll = frame.createDiv({ cls: "zk-card-scroll markdown-rendered" });
      scroll.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
      jobs.push(this.renderMarkdownCard(card, scroll, version));

      cardEl.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        if (card.id !== this.activeId) {
          event.preventDefault();
          event.stopPropagation();
          this.selectCardWithoutMoving(card.id);
          return;
        }
        if (target.closest("a, button, input, textarea, select") !== null) {
          return;
        }
        this.plugin.openMarkdownFile(card.file);
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
      this.interceptFiledLinks(target, card.file.path);
      target.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
    } catch (error) {
      target.createEl("p", {
        cls: "zk-render-error",
        text: `Could not render this card: ${errorMessage(error)}`,
      });
    }
  }

  private interceptFiledLinks(target: HTMLElement, sourcePath: string): void {
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
    const inHand = shell.createDiv({ cls: "zk-in-hand" });
    inHand.createDiv({ cls: "zk-in-hand-label", text: "Unfiled card in hand" });
    inHand.createDiv({ cls: "zk-in-hand-name", text: file.basename });
    const preview = inHand.createDiv({ cls: "zk-in-hand-preview markdown-rendered" });
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
    const actions = shell.createDiv({ cls: "zk-filing-actions" });
    const attachment = this.activeCard;
    this.filingPromptEl = actions.createSpan({
      cls: "zk-filing-prompt",
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
    const inHand = this.contentEl.querySelector<HTMLElement>(".zk-in-hand");
    if (inHand === null) {
      return;
    }
    const label = inHand.querySelector<HTMLElement>(".zk-in-hand-label");
    label?.setText(`Filed as ${newId}`);
    inHand.addClass("is-entering-deck");
    await new Promise<void>((resolve) =>
      window.setTimeout(resolve, FILING_ANIMATION_DURATION_MS + 40),
    );
  }

  private renderBookmarkEdgeTabs(stage: HTMLElement): void {
    stage.querySelectorAll<HTMLElement>(".zk-bookmark-edge-tab")
      .forEach((tab) => tab.remove());
    if (this.activeId === null || this.plugin.state.bookmarks.length === 0) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    const cardWidth = this.renderedCards[0]?.offsetWidth ?? 0;
    if (activeIndex < 0 || cardWidth <= 0) {
      return;
    }
    const bookmarkIndices = this.plugin.state.bookmarks.flatMap((bookmark) => {
      const index = filed.findIndex((card) => card.id === bookmark.zettelId);
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
        cls: `zk-bookmark-edge-tab is-${direction}`,
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

  private positionCards(): void {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0) {
      return;
    }

    const step = this.cardStep();
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
  }

  private updateActiveUi(): void {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0) {
      return;
    }

    const viewportPosition = this.viewportPosition(activeIndex);
    for (const card of this.renderedCards) {
      const index = Number(card.dataset.index ?? "-1");
      card.toggleClass("is-active", index === activeIndex);
      card.style.zIndex = String(cardStackOrder(index, viewportPosition, activeIndex));
    }

    this.filingPromptEl?.setText(`Attach from ${this.activeId}`);
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl);
    }
    this.updateActiveActionControls();
    this.updateHistoryControls();
  }

  private updateActiveActionControls(): void {
    const activeCard = this.activeCard;
    const availability = activeCardActionAvailability(
      activeCard?.id ?? null,
      activeCard?.path ?? null,
      this.plugin.state.bookmarks.map((bookmark) => bookmark.zettelId),
      this.plugin.state.deskCards.map((card) => card.cardRef),
    );
    if (this.addBookmarkButtonEl !== null) {
      this.addBookmarkButtonEl.disabled = !availability.canAddBookmark;
    }
    if (this.putOnDeskButtonEl !== null) {
      this.putOnDeskButtonEl.disabled = !availability.canPutOnDesk;
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
      const scroll = card.querySelector<HTMLElement>(".zk-card-scroll");
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
    cls: "clickable-icon zk-icon-button",
    attr: { type: "button", "aria-label": label },
  });
  setIcon(button, icon);
  return button;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
