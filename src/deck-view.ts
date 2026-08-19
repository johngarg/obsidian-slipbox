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
  cardMotionStyle,
  transitionStripOffset,
} from "./deck-motion.js";
import type { FiledZettel } from "./zettel-index.js";

export const DECK_VIEW_TYPE = "zettelkasten-deck";

const SNAP_DURATION_MS = 300;
const FILING_ANIMATION_DURATION_MS = 280;
const WHEEL_SETTLE_MS = 110;

interface DeckTransition {
  readonly indexDelta: number;
  readonly releasedDragOffset: number;
}

export class DeckView extends ItemView {
  private activeId: string | null = null;
  private thumbId: string | null = null;
  private filingFile: TFile | null = null;
  private stageEl: HTMLElement | null = null;
  private renderedCards: HTMLElement[] = [];
  private renderComponents: Component[] = [];
  private cardScrollPositions = new Map<string, number>();
  private dragOffset = 0;
  private pointerStartX: number | null = null;
  private wheelTimer: number | null = null;
  private renderVersion = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ZettelkastenPlugin,
  ) {
    super(leaf);
    this.scope = new Scope(this.app.scope);
    this.scope.register([], "ArrowLeft", (event) =>
      this.handleArrowNavigation(event, -1),
    );
    this.scope.register([], "ArrowRight", (event) =>
      this.handleArrowNavigation(event, 1),
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
    this.clearWheelTimer();
    this.thumbId = null;
    this.filingFile = null;
    this.stageEl = null;
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
    this.chooseAvailableActiveCard();
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

  async goToId(id: string, releasedDragOffset = 0): Promise<void> {
    const filed = this.plugin.index.snapshot.filed;
    const previousIndex = filed.findIndex((card) => card.id === this.activeId);
    const targetIndex = filed.findIndex((card) => card.id === id);
    if (targetIndex < 0) {
      new Notice(`Card ${id} is missing, invalid, or duplicated.`);
      return;
    }
    if (targetIndex === previousIndex) {
      return;
    }

    const indexDelta = targetIndex - previousIndex;
    const visualIndexDelta =
      releasedDragOffset === 0 ? Math.sign(indexDelta) : indexDelta;
    this.activeId = id;
    this.dragOffset = 0;
    await this.plugin.rememberActiveCard(id);
    await this.renderDeck({
      indexDelta: visualIndexDelta,
      releasedDragOffset,
    });
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

  private async renderDeck(transition?: DeckTransition): Promise<void> {
    const version = ++this.renderVersion;
    this.rememberScrollPositions();
    this.unloadRenderComponents();
    this.contentEl.empty();
    this.renderedCards = [];

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
        await this.renderCardWindow(
          stage,
          filed,
          activeIndex,
          version,
          transition,
        );
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
    if (transition === undefined) {
      this.positionCards(0, false);
      return;
    }

    const initialStripOffset = transitionStripOffset(
      transition.indexDelta,
      this.cardStep(),
      transition.releasedDragOffset,
    );
    this.positionCards(initialStripOffset, false);
    stage.getBoundingClientRect();
    window.requestAnimationFrame(() => {
      if (version === this.renderVersion) {
        this.positionCards(0, true);
      }
    });
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
      this.positionCards(this.dragOffset, false);
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
    transition?: DeckTransition,
  ): Promise<void> {
    const radius = Math.min(
      8,
      Math.max(3, Math.ceil(1 / this.plugin.state.spread) + 2),
    );
    const start = Math.max(0, activeIndex - radius);
    const end = Math.min(filed.length - 1, activeIndex + radius);
    const jobs: Promise<void>[] = [];

    for (let index = start; index <= end; index += 1) {
      const card = filed[index];
      if (card === undefined) {
        continue;
      }

      const offset = index - activeIndex;
      const cardEl = stage.createDiv({ cls: "zk-card" });
      cardEl.dataset.offset = String(offset);
      cardEl.dataset.path = card.path;
      cardEl.toggleClass("is-active", offset === 0);
      const cardLabel = `${card.id} · ${card.file.basename}`;
      cardEl.setAttr("aria-label", cardLabel);
      setTooltip(cardEl, cardLabel, {
        placement: "bottom",
        delay: 350,
      });
      cardEl.style.zIndex = String(100 - Math.abs(offset));
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
        if (offset !== 0) {
          event.preventDefault();
          event.stopPropagation();
          void this.goToId(card.id);
          return;
        }
        if (target.closest("a, button, input, textarea, select") !== null) {
          return;
        }
        this.plugin.openMarkdownFile(card.file);
      });
    }

    const initialStripOffset = transition === undefined
      ? 0
      : transitionStripOffset(
          transition.indexDelta,
          this.cardStep(),
          transition.releasedDragOffset,
        );
    this.positionCards(initialStripOffset, false);

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
    actions.createSpan({
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
    this.dragOffset = 0;
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
    if (this.thumbId === null || this.activeId === null) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const thumbIndex = filed.findIndex((card) => card.id === this.thumbId);
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (thumbIndex < 0) {
      this.thumbId = null;
      return;
    }

    const thumbCard = this.renderedCards.find((card) => {
      const path = card.dataset.path;
      return path === filed[thumbIndex]?.path;
    });
    const cardWidth = thumbCard?.offsetWidth ?? 0;
    const centreDistance =
      Math.abs(thumbIndex - activeIndex) * cardWidth * this.plugin.state.spread;
    const isVisible =
      thumbCard !== undefined &&
      centreDistance < stage.clientWidth / 2 + cardWidth / 2;
    if (isVisible || thumbIndex === activeIndex) {
      return;
    }

    const direction = thumbIndex < activeIndex ? "left" : "right";
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
        this.dragOffset -= event.deltaX * scale;
        this.positionCards(this.dragOffset, false);
        this.clearWheelTimer();
        this.wheelTimer = window.setTimeout(
          () => void this.finishMotion(),
          WHEEL_SETTLE_MS,
        );
      },
      { passive: false },
    );

    stage.addEventListener("pointerdown", (event) => {
      if (event.target !== stage || event.button !== 0) {
        return;
      }
      this.pointerStartX = event.clientX;
      this.dragOffset = 0;
      stage.setPointerCapture(event.pointerId);
      stage.addClass("is-dragging");
      this.contentEl.focus({ preventScroll: true });
    });
    stage.addEventListener("pointermove", (event) => {
      if (this.pointerStartX === null) {
        return;
      }
      this.dragOffset = event.clientX - this.pointerStartX;
      this.positionCards(this.dragOffset, false);
    });
    const finishPointer = (event: PointerEvent): void => {
      if (this.pointerStartX === null) {
        return;
      }
      this.pointerStartX = null;
      stage.removeClass("is-dragging");
      if (stage.hasPointerCapture(event.pointerId)) {
        stage.releasePointerCapture(event.pointerId);
      }
      void this.finishMotion();
    };
    stage.addEventListener("pointerup", finishPointer);
    stage.addEventListener("pointercancel", finishPointer);
  }

  private async finishMotion(): Promise<void> {
    this.clearWheelTimer();
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0) {
      this.dragOffset = 0;
      return;
    }

    const step = this.cardStep();
    const delta = step === 0 ? 0 : Math.round(-this.dragOffset / step);
    const targetIndex = Math.max(0, Math.min(filed.length - 1, activeIndex + delta));
    const releasedDragOffset = this.dragOffset;
    this.dragOffset = 0;

    if (targetIndex === activeIndex) {
      this.positionCards(0, true);
      return;
    }
    const target = filed[targetIndex];
    if (target !== undefined) {
      await this.goToId(target.id, releasedDragOffset);
    }
  }

  private async moveBy(delta: number): Promise<void> {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0) {
      return;
    }
    const target = filed[Math.max(0, Math.min(filed.length - 1, activeIndex + delta))];
    if (target !== undefined && target.id !== this.activeId) {
      await this.goToId(target.id);
    }
  }

  private handleArrowNavigation(
    event: KeyboardEvent,
    delta: -1 | 1,
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
    void this.moveBy(delta);
    return true;
  }

  private positionCards(stripOffset: number, animate: boolean): void {
    const stage = this.stageEl;
    if (stage === null) {
      return;
    }
    stage.toggleClass("is-snapping", animate);
    const step = this.cardStep();

    for (const card of this.renderedCards) {
      const offset = Number(card.dataset.offset ?? "0");
      const motion = cardMotionStyle(offset, step, stripOffset);
      card.style.transform =
        `translate(-50%, -50%) translateX(${motion.translateX}px) scale(${motion.scale})`;
      card.style.opacity = String(motion.opacity);
    }

    if (animate) {
      window.setTimeout(() => stage.removeClass("is-snapping"), SNAP_DURATION_MS);
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

  private clearWheelTimer(): void {
    if (this.wheelTimer !== null) {
      window.clearTimeout(this.wheelTimer);
      this.wheelTimer = null;
    }
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
