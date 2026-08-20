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
  activeIndexForViewport,
  cardMotionStyle,
  clampViewportPosition,
  viewportPositionToRevealCard,
} from "./deck-motion.js";
import type { FiledZettel } from "./zettel-index.js";

export const DECK_VIEW_TYPE = "zettelkasten-deck";

const FILING_ANIMATION_DURATION_MS = 280;
const ACTIVE_SAVE_DELAY_MS = 120;
const RENDER_EDGE_BUFFER = 2;

export class DeckView extends ItemView {
  private activeId: string | null = null;
  private thumbId: string | null = null;
  private filingFile: TFile | null = null;
  private stageEl: HTMLElement | null = null;
  private renderedCards: HTMLElement[] = [];
  private renderComponents: Component[] = [];
  private cardScrollPositions = new Map<string, number>();
  private viewportOffset = 0;
  private pointerLastX: number | null = null;
  private holdButtonEl: HTMLButtonElement | null = null;
  private filingPromptEl: HTMLElement | null = null;
  private renderWindowStart = 0;
  private renderWindowEnd = -1;
  private renderRefreshPending = false;
  private activeSaveTimer: number | null = null;
  private renderVersion = 0;

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
    this.scope.register([], "h", (event) =>
      this.handleDeckKey(event, () => this.holdPlace()),
    );
    this.scope.register(["Shift"], "h", (event) =>
      this.handleDeckKey(event, () => this.returnToHold()),
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
    this.flushActiveCardSave();
    this.thumbId = null;
    this.filingFile = null;
    this.stageEl = null;
    this.holdButtonEl = null;
    this.filingPromptEl = null;
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

  async refresh(): Promise<void> {
    const previousActiveId = this.activeId;
    this.chooseAvailableActiveCard();
    if (this.activeId !== previousActiveId) {
      this.viewportOffset = 0;
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

  holdPlace(): void {
    if (this.activeId === null) {
      new Notice("There is no active filed card to hold.");
      return;
    }
    this.thumbId = this.thumbId === this.activeId ? null : this.activeId;
    void this.renderDeck();
  }

  async goToId(id: string): Promise<void> {
    const filed = this.plugin.index.snapshot.filed;
    const targetIndex = filed.findIndex((card) => card.id === id);
    if (targetIndex < 0) {
      new Notice(`Card ${id} is missing, invalid, or duplicated.`);
      return;
    }
    this.activeId = id;
    this.viewportOffset = 0;
    await this.plugin.rememberActiveCard(id);
    await this.renderDeck();
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

    if (
      this.plugin.state.lastActiveId !== null &&
      available.has(this.plugin.state.lastActiveId)
    ) {
      this.activeId = this.plugin.state.lastActiveId;
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
    this.holdButtonEl = null;
    this.filingPromptEl = null;

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
    this.renderThumbTab(stage);
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

    const controls = toolbar.createDiv({ cls: "zk-toolbar-group zk-toolbar-main" });
    const entries = controls.createEl("button", {
      text: "Entry points",
      attr: { type: "button" },
    });
    entries.addEventListener("click", () => this.plugin.showEntryPoints(this));

    const desk = controls.createEl("button", {
      attr: { type: "button" },
      cls: "zk-desk-button",
    });
    desk.createSpan({ text: "Desk" });
    const unfiledCount = this.plugin.index.snapshot.unfiled.length;
    if (unfiledCount > 0) {
      desk.createSpan({ cls: "zk-count", text: String(unfiledCount) });
    }
    desk.addEventListener("click", () => this.plugin.showDesk());

    const hold = controls.createEl("button", {
      text: this.thumbId === this.activeId && this.activeId !== null
        ? "Release hold"
        : "Hold place",
      attr: { type: "button" },
    });
    this.holdButtonEl = hold;
    hold.addEventListener("click", () => this.holdPlace());

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
        this.renderThumbTab(this.stageEl);
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
      const cardLabel = `${card.id} · ${card.file.basename}`;
      cardEl.setAttr("aria-label", cardLabel);
      setTooltip(cardEl, cardLabel, {
        placement: "bottom",
        delay: 350,
      });
      cardEl.style.zIndex = String(
        index === activeIndex
          ? 200
          : 100 - Math.floor(Math.abs(index - viewportPosition)),
      );
      this.renderedCards.push(cardEl);

      const addressRow = cardEl.createDiv({ cls: "zk-card-address-row" });
      addressRow.createSpan({ cls: "zk-card-address", text: card.id });
      if (this.thumbId === card.id) {
        const marker = addressRow.createSpan({
          cls: "zk-thumb-marker",
          text: "held",
        });
        marker.setAttr("aria-label", "Held place");
      }

      const scroll = cardEl.createDiv({ cls: "zk-card-scroll markdown-rendered" });
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
      target.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
    } catch (error) {
      target.createEl("p", {
        cls: "zk-render-error",
        text: `Could not render this card: ${errorMessage(error)}`,
      });
    }
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

  private renderThumbTab(stage: HTMLElement): void {
    stage.querySelector<HTMLElement>(".zk-thumb-tab")?.remove();
    if (this.thumbId === null || this.activeId === null) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const thumbIndex = filed.findIndex((card) => card.id === this.thumbId);
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (thumbIndex < 0 || activeIndex < 0) {
      this.thumbId = null;
      return;
    }

    const thumbCard = this.renderedCards.find(
      (card) => Number(card.dataset.index) === thumbIndex,
    );
    const cardWidth = thumbCard?.offsetWidth ?? this.renderedCards[0]?.offsetWidth ?? 0;
    const viewportPosition = this.viewportPosition(activeIndex);
    const thumbX = (thumbIndex - viewportPosition) * this.cardStep();
    const isVisible =
      thumbCard !== undefined &&
      Math.abs(thumbX) < stage.clientWidth / 2 + cardWidth / 2;
    if (isVisible) {
      return;
    }

    const direction = thumbX < 0 ? "left" : "right";
    const tab = stage.createEl("button", {
      cls: `zk-thumb-tab is-${direction}`,
      text: `${direction === "left" ? "◀" : "▶"} ${this.thumbId}`,
      attr: { type: "button", "aria-label": `Return to held card ${this.thumbId}` },
    });
    tab.addEventListener("click", () => {
      if (this.thumbId !== null) {
        void this.goToId(this.thumbId);
      }
    });
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
    this.positionCards();
    this.updateActiveUi();
    this.scheduleActiveCardSave();
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

  private returnToHold(): void {
    if (this.thumbId === null) {
      new Notice("There is no held place.");
      return;
    }
    void this.goToId(this.thumbId);
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
    this.positionCards();
    this.updateActiveUi();
    this.scheduleActiveCardSave();
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

    const activeChanged = activeCard.id !== this.activeId;
    this.activeId = activeCard.id;
    this.viewportOffset = viewportPosition - activeIndex;
    this.positionCards();
    this.updateActiveUi();
    if (activeChanged) {
      this.scheduleActiveCardSave();
    }
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
      card.style.zIndex = String(
        index === activeIndex
          ? 200
          : 100 - Math.floor(Math.abs(index - viewportPosition)),
      );
    }

    this.holdButtonEl?.setText(
      this.thumbId === this.activeId ? "Release hold" : "Hold place",
    );
    this.filingPromptEl?.setText(`Attach from ${this.activeId}`);
    if (this.stageEl !== null) {
      this.renderThumbTab(this.stageEl);
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

  private scheduleActiveCardSave(): void {
    if (this.activeSaveTimer !== null) {
      window.clearTimeout(this.activeSaveTimer);
    }
    this.activeSaveTimer = window.setTimeout(() => {
      this.activeSaveTimer = null;
      if (this.activeId !== null) {
        void this.plugin.rememberActiveCard(this.activeId);
      }
    }, ACTIVE_SAVE_DELAY_MS);
  }

  private flushActiveCardSave(): void {
    if (this.activeSaveTimer === null) {
      return;
    }
    window.clearTimeout(this.activeSaveTimer);
    this.activeSaveTimer = null;
    if (this.activeId !== null) {
      void this.plugin.rememberActiveCard(this.activeId);
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
