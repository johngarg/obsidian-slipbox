"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ZettelkastenPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/deck-view.ts
var import_obsidian = require("obsidian");

// src/deck-motion.ts
function transitionStripOffset(indexDelta, cardStep, releasedDragOffset = 0) {
  return indexDelta * cardStep + releasedDragOffset;
}
function cardMotionStyle(cardOffset, cardStep, stripOffset) {
  const safeStep = Math.max(cardStep, 1);
  const distance = Math.abs(cardOffset + stripOffset / safeStep);
  return {
    translateX: cardOffset * cardStep + stripOffset,
    scale: Math.max(0.86, 1 - distance * 0.035),
    opacity: Math.max(0.42, 1 - distance * 0.13)
  };
}

// src/deck-view.ts
var DECK_VIEW_TYPE = "zettelkasten-deck";
var SNAP_DURATION_MS = 300;
var FILING_ANIMATION_DURATION_MS = 280;
var WHEEL_SETTLE_MS = 110;
var DeckView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  activeId = null;
  thumbId = null;
  filingFile = null;
  stageEl = null;
  renderedCards = [];
  renderComponents = [];
  cardScrollPositions = /* @__PURE__ */ new Map();
  dragOffset = 0;
  pointerStartX = null;
  wheelTimer = null;
  renderVersion = 0;
  getViewType() {
    return DECK_VIEW_TYPE;
  }
  getDisplayText() {
    return "Zettelkasten Deck";
  }
  getIcon() {
    return "archive";
  }
  async onOpen() {
    this.contentEl.addClass("zk-deck-view");
    this.contentEl.tabIndex = 0;
    this.registerDomEvent(this.contentEl, "keydown", (event) => {
      this.onKeyDown(event);
    });
    await this.refresh();
  }
  async onClose() {
    this.rememberScrollPositions();
    this.unloadRenderComponents();
    this.clearWheelTimer();
    this.thumbId = null;
    this.filingFile = null;
    this.stageEl = null;
  }
  get activeCard() {
    if (this.activeId === null) {
      return null;
    }
    return this.plugin.index.filedById(this.activeId) ?? null;
  }
  get isFiling() {
    return this.filingFile !== null;
  }
  async refresh() {
    this.chooseAvailableActiveCard();
    await this.renderDeck();
  }
  async startFiling(file) {
    this.filingFile = file;
    await this.renderDeck();
  }
  async cancelFiling() {
    this.filingFile = null;
    await this.renderDeck();
    new import_obsidian.Notice("Filing cancelled. The card remains on the Desk.");
  }
  holdPlace() {
    if (this.activeId === null) {
      new import_obsidian.Notice("There is no active filed card to hold.");
      return;
    }
    this.thumbId = this.activeId;
    void this.renderDeck();
  }
  async goToId(id, releasedDragOffset = 0) {
    const filed = this.plugin.index.snapshot.filed;
    const previousIndex = filed.findIndex((card) => card.id === this.activeId);
    const targetIndex = filed.findIndex((card) => card.id === id);
    if (targetIndex < 0) {
      new import_obsidian.Notice(`Card ${id} is missing, invalid, or duplicated.`);
      return;
    }
    if (targetIndex === previousIndex) {
      return;
    }
    const indexDelta = targetIndex - previousIndex;
    const visualIndexDelta = releasedDragOffset === 0 ? Math.sign(indexDelta) : indexDelta;
    this.activeId = id;
    this.dragOffset = 0;
    await this.plugin.rememberActiveCard(id);
    await this.renderDeck({
      indexDelta: visualIndexDelta,
      releasedDragOffset
    });
  }
  async addCurrentAsEntryPoint() {
    if (this.activeId === null) {
      new import_obsidian.Notice("There is no active filed card.");
      return;
    }
    await this.plugin.addEntryPoint(this.activeId);
  }
  chooseAvailableActiveCard() {
    const filed = this.plugin.index.snapshot.filed;
    const available = new Set(filed.map((card) => card.id));
    if (this.activeId !== null && available.has(this.activeId)) {
      return;
    }
    if (this.plugin.state.lastActiveId !== null && available.has(this.plugin.state.lastActiveId)) {
      this.activeId = this.plugin.state.lastActiveId;
      return;
    }
    const firstEntryPoint = this.plugin.state.entryPoints.find(
      (entry) => available.has(entry.id)
    );
    this.activeId = firstEntryPoint?.id ?? filed[0]?.id ?? null;
  }
  async renderDeck(transition) {
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
    stage.setAttr("aria-label", "Zettelkasten card deck");
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
          transition
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
    if (transition === void 0) {
      this.positionCards(0, false);
      return;
    }
    const initialStripOffset = transitionStripOffset(
      transition.indexDelta,
      this.cardStep(),
      transition.releasedDragOffset
    );
    this.positionCards(initialStripOffset, false);
    stage.getBoundingClientRect();
    window.requestAnimationFrame(() => {
      if (version === this.renderVersion) {
        this.positionCards(0, true);
      }
    });
  }
  renderToolbar(shell) {
    const toolbar = shell.createDiv({ cls: "zk-deck-toolbar" });
    const identity = toolbar.createDiv({ cls: "zk-deck-identity" });
    const icon = identity.createSpan({ cls: "zk-deck-icon" });
    (0, import_obsidian.setIcon)(icon, "archive");
    identity.createSpan({ text: "Deck" });
    const navigation = toolbar.createDiv({ cls: "zk-toolbar-group" });
    const previous = iconButton(navigation, "arrow-left", "Previous card");
    previous.addEventListener("click", () => void this.moveBy(-1));
    const next = iconButton(navigation, "arrow-right", "Next card");
    next.addEventListener("click", () => void this.moveBy(1));
    const controls = toolbar.createDiv({ cls: "zk-toolbar-group zk-toolbar-main" });
    const entries = controls.createEl("button", {
      text: "Entry points",
      attr: { type: "button" }
    });
    entries.addEventListener("click", () => this.plugin.showEntryPoints(this));
    const desk = controls.createEl("button", {
      attr: { type: "button" },
      cls: "zk-desk-button"
    });
    desk.createSpan({ text: "Desk" });
    const unfiledCount = this.plugin.index.snapshot.unfiled.length;
    if (unfiledCount > 0) {
      desk.createSpan({ cls: "zk-count", text: String(unfiledCount) });
    }
    desk.addEventListener("click", () => this.plugin.showDesk());
    const hold = controls.createEl("button", {
      text: this.thumbId === this.activeId && this.activeId !== null ? "Place held" : "Hold place",
      attr: { type: "button" }
    });
    hold.addEventListener("click", () => this.holdPlace());
    if (this.plugin.index.snapshot.issues.length > 0) {
      const problems = controls.createEl("button", {
        cls: "zk-problem-button",
        attr: { type: "button" }
      });
      const warning = problems.createSpan();
      (0, import_obsidian.setIcon)(warning, "triangle-alert");
      problems.createSpan({
        text: `${this.plugin.index.snapshot.issues.length} problem${this.plugin.index.snapshot.issues.length === 1 ? "" : "s"}`
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
        "aria-label": "Card spread"
      }
    });
    slider.addEventListener("input", () => {
      this.plugin.setSpread(Number(slider.value));
      this.positionCards(this.dragOffset, false);
    });
    slider.addEventListener("change", () => void this.renderDeck());
  }
  renderEmptyDeck(stage) {
    const empty = stage.createDiv({ cls: "zk-deck-empty" });
    empty.createEl("h2", { text: "The filing box is empty" });
    empty.createEl("p", {
      text: this.filingFile === null ? "Create a new section to place the first filed card." : "There is no filed card to use as an attachment point. Cancel filing, then create the first section."
    });
    const create = empty.createEl("button", {
      text: "New section",
      cls: "mod-cta",
      attr: { type: "button" }
    });
    create.addEventListener("click", () => void this.plugin.createNewSection());
  }
  async renderCardWindow(stage, filed, activeIndex, version, transition) {
    const radius = Math.min(
      8,
      Math.max(3, Math.ceil(1 / this.plugin.state.spread) + 2)
    );
    const start = Math.max(0, activeIndex - radius);
    const end = Math.min(filed.length - 1, activeIndex + radius);
    const jobs = [];
    for (let index = start; index <= end; index += 1) {
      const card = filed[index];
      if (card === void 0) {
        continue;
      }
      const offset = index - activeIndex;
      const cardEl = stage.createDiv({ cls: "zk-card" });
      cardEl.dataset.offset = String(offset);
      cardEl.dataset.path = card.path;
      cardEl.toggleClass("is-active", offset === 0);
      cardEl.setAttr("aria-label", `${card.id}, ${card.file.basename}`);
      cardEl.style.zIndex = String(100 - Math.abs(offset));
      this.renderedCards.push(cardEl);
      const addressRow = cardEl.createDiv({ cls: "zk-card-address-row" });
      addressRow.createSpan({ cls: "zk-card-address", text: card.id });
      if (this.thumbId === card.id) {
        const marker = addressRow.createSpan({
          cls: "zk-thumb-marker",
          text: "held"
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
    const initialStripOffset = transition === void 0 ? 0 : transitionStripOffset(
      transition.indexDelta,
      this.cardStep(),
      transition.releasedDragOffset
    );
    this.positionCards(initialStripOffset, false);
    await Promise.all(jobs);
  }
  async renderMarkdownCard(card, target, version) {
    const component = new import_obsidian.Component();
    component.load();
    this.renderComponents.push(component);
    try {
      const body = await this.plugin.index.readBody(card.file);
      if (version !== this.renderVersion) {
        return;
      }
      await import_obsidian.MarkdownRenderer.render(
        this.app,
        body,
        target,
        card.file.path,
        component
      );
      target.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
    } catch (error) {
      target.createEl("p", {
        cls: "zk-render-error",
        text: `Could not render this card: ${errorMessage(error)}`
      });
    }
  }
  async renderFilingCard(shell, file, version) {
    const inHand = shell.createDiv({ cls: "zk-in-hand" });
    inHand.createDiv({ cls: "zk-in-hand-label", text: "Unfiled card in hand" });
    inHand.createDiv({ cls: "zk-in-hand-name", text: file.basename });
    const preview = inHand.createDiv({ cls: "zk-in-hand-preview markdown-rendered" });
    const component = new import_obsidian.Component();
    component.load();
    this.renderComponents.push(component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (version === this.renderVersion) {
        await import_obsidian.MarkdownRenderer.render(this.app, body, preview, file.path, component);
      }
    } catch (error) {
      preview.setText(`Could not render this card: ${errorMessage(error)}`);
    }
  }
  renderFilingActions(shell) {
    const actions = shell.createDiv({ cls: "zk-filing-actions" });
    const attachment = this.activeCard;
    actions.createSpan({
      cls: "zk-filing-prompt",
      text: attachment === null ? "Choose an attachment point" : `Attach from ${attachment.id}`
    });
    const cancel = actions.createEl("button", {
      text: "Cancel",
      attr: { type: "button" }
    });
    cancel.addEventListener("click", () => void this.cancelFiling());
    const fileHere = actions.createEl("button", {
      text: "File here",
      cls: "mod-cta",
      attr: { type: "button" }
    });
    fileHere.disabled = attachment === null;
    fileHere.addEventListener("click", () => void this.fileHere());
  }
  async fileHere() {
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
  async animateFiling(newId) {
    const inHand = this.contentEl.querySelector(".zk-in-hand");
    if (inHand === null) {
      return;
    }
    const label = inHand.querySelector(".zk-in-hand-label");
    label?.setText(`Filed as ${newId}`);
    inHand.addClass("is-entering-deck");
    await new Promise(
      (resolve) => window.setTimeout(resolve, FILING_ANIMATION_DURATION_MS + 40)
    );
  }
  renderThumbTab(stage) {
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
    const centreDistance = Math.abs(thumbIndex - activeIndex) * cardWidth * this.plugin.state.spread;
    const isVisible = thumbCard !== void 0 && centreDistance < stage.clientWidth / 2 + cardWidth / 2;
    if (isVisible || thumbIndex === activeIndex) {
      return;
    }
    const direction = thumbIndex < activeIndex ? "left" : "right";
    const tab = stage.createEl("button", {
      cls: `zk-thumb-tab is-${direction}`,
      text: `${direction === "left" ? "\u25C0" : "\u25B6"} ${this.thumbId}`,
      attr: { type: "button", "aria-label": `Return to held card ${this.thumbId}` }
    });
    tab.addEventListener("click", () => {
      if (this.thumbId !== null) {
        void this.goToId(this.thumbId);
      }
    });
  }
  attachBrowsingEvents(stage) {
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
          WHEEL_SETTLE_MS
        );
      },
      { passive: false }
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
    const finishPointer = (event) => {
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
  async finishMotion() {
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
    if (target !== void 0) {
      await this.goToId(target.id, releasedDragOffset);
    }
  }
  async moveBy(delta) {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0) {
      return;
    }
    const target = filed[Math.max(0, Math.min(filed.length - 1, activeIndex + delta))];
    if (target !== void 0 && target.id !== this.activeId) {
      await this.goToId(target.id);
    }
  }
  onKeyDown(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable) {
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      void this.moveBy(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      void this.moveBy(1);
    }
  }
  positionCards(stripOffset, animate) {
    const stage = this.stageEl;
    if (stage === null) {
      return;
    }
    stage.toggleClass("is-snapping", animate);
    const step = this.cardStep();
    for (const card of this.renderedCards) {
      const offset = Number(card.dataset.offset ?? "0");
      const motion = cardMotionStyle(offset, step, stripOffset);
      card.style.transform = `translate(-50%, -50%) translateX(${motion.translateX}px) scale(${motion.scale})`;
      card.style.opacity = String(motion.opacity);
    }
    if (animate) {
      window.setTimeout(() => stage.removeClass("is-snapping"), SNAP_DURATION_MS);
    }
  }
  cardStep() {
    const firstCard = this.renderedCards[0];
    if (firstCard === void 0) {
      return 1;
    }
    return firstCard.offsetWidth * this.plugin.state.spread;
  }
  rememberScrollPositions() {
    for (const card of this.renderedCards) {
      const path = card.dataset.path;
      const scroll = card.querySelector(".zk-card-scroll");
      if (path !== void 0 && scroll !== null) {
        this.cardScrollPositions.set(path, scroll.scrollTop);
      }
    }
  }
  unloadRenderComponents() {
    for (const component of this.renderComponents) {
      component.unload();
    }
    this.renderComponents = [];
  }
  clearWheelTimer() {
    if (this.wheelTimer !== null) {
      window.clearTimeout(this.wheelTimer);
      this.wheelTimer = null;
    }
  }
};
function iconButton(parent, icon, label) {
  const button = parent.createEl("button", {
    cls: "clickable-icon zk-icon-button",
    attr: { type: "button", "aria-label": label }
  });
  (0, import_obsidian.setIcon)(button, icon);
  return button;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/zettel-id.ts
var ZettelIdError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ZettelIdError";
  }
};
var ZETTEL_ID_PATTERN = /^([1-9]\d*)\/([1-9]\d*(?:[a-z]+[1-9]\d*)*[a-z]*)$/;
var PATH_TOKEN_PATTERN = /[1-9]\d*|[a-z]+/g;
var ALPHA_TOKEN_PATTERN = /^[a-z]+$/;
function parsePositiveInteger(value, context) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ZettelIdError(
      `${context} must be a positive integer no greater than Number.MAX_SAFE_INTEGER`
    );
  }
  return parsed;
}
function assertPositiveInteger(value, context) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ZettelIdError(
      `${context} must be a positive integer no greater than Number.MAX_SAFE_INTEGER`
    );
  }
}
function assertAlphaToken(value) {
  if (!ALPHA_TOKEN_PATTERN.test(value)) {
    throw new ZettelIdError(
      `Alphabetic token must contain only lowercase ASCII letters: ${JSON.stringify(value)}`
    );
  }
}
function numericToken(value) {
  assertPositiveInteger(value, "Numeric token");
  return Object.freeze({ type: "number", value });
}
function alphaToken(value) {
  assertAlphaToken(value);
  return Object.freeze({ type: "alpha", value });
}
function parseZettelId(id) {
  const match = ZETTEL_ID_PATTERN.exec(id);
  if (match === null) {
    throw new ZettelIdError(`Invalid Zettelkasten address: ${JSON.stringify(id)}`);
  }
  const sectionText = match[1];
  const pathText = match[2];
  if (sectionText === void 0 || pathText === void 0) {
    throw new ZettelIdError(`Invalid Zettelkasten address: ${JSON.stringify(id)}`);
  }
  const section = parsePositiveInteger(sectionText, "Section");
  const tokenTexts = pathText.match(PATH_TOKEN_PATTERN);
  if (tokenTexts === null || tokenTexts.length === 0) {
    throw new ZettelIdError(`Invalid Zettelkasten path: ${JSON.stringify(pathText)}`);
  }
  const path = tokenTexts.map((tokenText, index) => {
    if (index % 2 === 0) {
      return numericToken(parsePositiveInteger(tokenText, "Numeric token"));
    }
    return alphaToken(tokenText);
  });
  return Object.freeze({
    section,
    path: Object.freeze(path)
  });
}
function isValidZettelId(id) {
  try {
    parseZettelId(id);
    return true;
  } catch (error) {
    if (error instanceof ZettelIdError) {
      return false;
    }
    throw error;
  }
}
function formatZettelId(id) {
  assertPositiveInteger(id.section, "Section");
  if (id.path.length === 0) {
    throw new ZettelIdError("A Zettelkasten path must contain at least one token");
  }
  const formattedPath = id.path.map((token, index) => {
    const expectedType = index % 2 === 0 ? "number" : "alpha";
    if (token.type !== expectedType) {
      throw new ZettelIdError(
        `Path token ${index} must be ${expectedType}, received ${token.type}`
      );
    }
    if (token.type === "number") {
      assertPositiveInteger(token.value, `Numeric token ${index}`);
      return String(token.value);
    }
    assertAlphaToken(token.value);
    return token.value;
  });
  return `${id.section}/${formattedPath.join("")}`;
}
function compareNumbers(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function compareAlphaTokens(a, b) {
  if (a.length !== b.length) {
    return compareNumbers(a.length, b.length);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
function compareZettelIds(a, b) {
  const parsedA = parseZettelId(a);
  const parsedB = parseZettelId(b);
  const sectionComparison = compareNumbers(parsedA.section, parsedB.section);
  if (sectionComparison !== 0) {
    return sectionComparison;
  }
  const sharedLength = Math.min(parsedA.path.length, parsedB.path.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const tokenA = parsedA.path[index];
    const tokenB = parsedB.path[index];
    if (tokenA === void 0 || tokenB === void 0) {
      throw new ZettelIdError("Unexpected missing path token");
    }
    let comparison;
    if (tokenA.type === "number" && tokenB.type === "number") {
      comparison = compareNumbers(tokenA.value, tokenB.value);
    } else if (tokenA.type === "alpha" && tokenB.type === "alpha") {
      comparison = compareAlphaTokens(tokenA.value, tokenB.value);
    } else {
      throw new ZettelIdError("Canonical paths have incompatible token types");
    }
    if (comparison !== 0) {
      return comparison;
    }
  }
  return compareNumbers(parsedA.path.length, parsedB.path.length);
}
function incrementAlphaToken(value) {
  assertAlphaToken(value);
  const characters = [...value];
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index];
    if (character === void 0) {
      throw new ZettelIdError("Unexpected missing alphabetic character");
    }
    if (character !== "z") {
      characters[index] = String.fromCharCode(character.charCodeAt(0) + 1);
      return characters.join("");
    }
    characters[index] = "a";
  }
  return `a${characters.join("")}`;
}
function incrementNumericValue(value) {
  assertPositiveInteger(value, "Numeric token");
  if (value === Number.MAX_SAFE_INTEGER) {
    throw new ZettelIdError("Numeric token cannot be incremented safely");
  }
  return value + 1;
}
function withPath(section, path) {
  return formatZettelId({ section, path });
}
function nextSibling(id) {
  const path = [...id.path];
  const lastToken = path[path.length - 1];
  if (lastToken === void 0) {
    throw new ZettelIdError("A Zettelkasten path must not be empty");
  }
  path[path.length - 1] = lastToken.type === "number" ? numericToken(incrementNumericValue(lastToken.value)) : alphaToken(incrementAlphaToken(lastToken.value));
  return withPath(id.section, path);
}
function firstAvailableChild(attachment, existingIds) {
  const lastToken = attachment.path[attachment.path.length - 1];
  if (lastToken === void 0) {
    throw new ZettelIdError("A Zettelkasten path must not be empty");
  }
  if (lastToken.type === "number") {
    let candidateValue2 = "a";
    while (true) {
      const candidate = withPath(attachment.section, [
        ...attachment.path,
        alphaToken(candidateValue2)
      ]);
      if (!existingIds.has(candidate)) {
        return candidate;
      }
      candidateValue2 = incrementAlphaToken(candidateValue2);
    }
  }
  let candidateValue = 1;
  while (true) {
    const candidate = withPath(attachment.section, [
      ...attachment.path,
      numericToken(candidateValue)
    ]);
    if (!existingIds.has(candidate)) {
      return candidate;
    }
    candidateValue = incrementNumericValue(candidateValue);
  }
}
function normalizeExistingIds(existingIds) {
  const normalized = /* @__PURE__ */ new Set();
  for (const id of existingIds) {
    normalized.add(formatZettelId(parseZettelId(id)));
  }
  return normalized;
}
function generateFiledId(attachmentId, existingIds) {
  const attachment = parseZettelId(attachmentId);
  const normalizedExistingIds = normalizeExistingIds(existingIds);
  if (!normalizedExistingIds.has(attachmentId)) {
    throw new ZettelIdError(
      `Attachment address is absent from existing IDs: ${attachmentId}`
    );
  }
  const sibling = nextSibling(attachment);
  if (!normalizedExistingIds.has(sibling)) {
    return sibling;
  }
  return firstAvailableChild(attachment, normalizedExistingIds);
}
function generateNextSectionId(existingIds) {
  const normalizedExistingIds = normalizeExistingIds(existingIds);
  let highestSection = 0;
  for (const id of normalizedExistingIds) {
    highestSection = Math.max(highestSection, parseZettelId(id).section);
  }
  if (highestSection === Number.MAX_SAFE_INTEGER) {
    throw new ZettelIdError("Section cannot be incremented safely");
  }
  return `${highestSection + 1}/1`;
}

// src/modals.ts
var import_obsidian2 = require("obsidian");
var TextPromptModal = class extends import_obsidian2.Modal {
  constructor(app, heading, placeholder, initialValue, resolveValue) {
    super(app);
    this.heading = heading;
    this.placeholder = placeholder;
    this.initialValue = initialValue;
    this.resolveValue = resolveValue;
  }
  settled = false;
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: this.heading });
    const form = contentEl.createEl("form", { cls: "zk-prompt-form" });
    const input = form.createEl("input", {
      type: "text",
      placeholder: this.placeholder,
      value: this.initialValue
    });
    input.required = true;
    const actions = form.createDiv({ cls: "zk-modal-actions" });
    const cancel = actions.createEl("button", { text: "Cancel", type: "button" });
    const submit = actions.createEl("button", {
      text: "Save",
      type: "submit",
      cls: "mod-cta"
    });
    cancel.addEventListener("click", () => this.finish(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (value === "") {
        new import_obsidian2.Notice("A name is required.");
        return;
      }
      this.finish(value);
    });
    window.setTimeout(() => {
      input.focus();
      input.select();
    });
    submit.focus({ preventScroll: true });
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveValue(null);
    }
  }
  finish(value) {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveValue(value);
    this.close();
  }
};
function promptForText(app, heading, placeholder, initialValue = "") {
  return new Promise((resolve) => {
    new TextPromptModal(
      app,
      heading,
      placeholder,
      initialValue,
      resolve
    ).open();
  });
}
var EntryPointsModal = class extends import_obsidian2.Modal {
  constructor(app, entryPoints, actions) {
    super(app);
    this.entryPoints = entryPoints;
    this.actions = actions;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: "Entry points" });
    const list = contentEl.createDiv({ cls: "zk-modal-list" });
    if (this.entryPoints.length === 0) {
      list.createEl("p", {
        cls: "zk-empty-copy",
        text: "No entry points yet."
      });
    }
    this.entryPoints.forEach((entry, index) => {
      const row = list.createDiv({ cls: "zk-list-row" });
      const available = this.actions.isAvailable(entry.id);
      const visit = row.createEl("button", {
        cls: "zk-entry-visit",
        attr: { type: "button" }
      });
      visit.createSpan({ cls: "zk-entry-name", text: entry.name });
      visit.createSpan({ cls: "zk-entry-id", text: entry.id });
      if (!available) {
        visit.disabled = true;
        visit.setAttr("aria-label", "The filed card is missing or invalid");
      }
      visit.addEventListener("click", () => {
        this.actions.visit(entry.id);
        this.close();
      });
      const rename = iconButton2(row, "pencil", `Rename ${entry.name}`);
      rename.addEventListener("click", () => {
        void this.actions.rename(index).then(() => this.close());
      });
      const remove = iconButton2(row, "trash-2", `Delete ${entry.name}`);
      remove.addEventListener("click", () => {
        void this.actions.remove(index).then(() => this.close());
      });
    });
    const footer = contentEl.createDiv({ cls: "zk-modal-actions" });
    const add = footer.createEl("button", {
      text: "+ Add current card as entry point",
      cls: "mod-cta",
      attr: { type: "button" }
    });
    add.disabled = this.actions.currentId === null;
    add.addEventListener("click", () => {
      void this.actions.addCurrent().then(() => this.close());
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var DeskModal = class extends import_obsidian2.Modal {
  constructor(app, unfiled, actions) {
    super(app);
    this.unfiled = unfiled;
    this.actions = actions;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: "Desk \xB7 unfiled cards" });
    const list = contentEl.createDiv({ cls: "zk-modal-list" });
    if (this.unfiled.length === 0) {
      list.createEl("p", {
        cls: "zk-empty-copy",
        text: "The Desk has no unfiled cards."
      });
    }
    for (const file of this.unfiled) {
      const row = list.createDiv({ cls: "zk-list-row" });
      const open = row.createEl("button", {
        cls: "zk-file-visit",
        attr: { type: "button" }
      });
      open.createSpan({ cls: "zk-entry-name", text: file.basename });
      open.createSpan({ cls: "zk-file-path", text: file.path });
      open.addEventListener("click", () => {
        this.actions.open(file);
        this.close();
      });
      const fileButton = row.createEl("button", {
        text: "File\u2026",
        cls: "mod-cta",
        attr: { type: "button" }
      });
      fileButton.addEventListener("click", () => {
        this.actions.file(file);
        this.close();
      });
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var IssuesModal = class extends import_obsidian2.Modal {
  constructor(app, index, actions) {
    super(app);
    this.index = index;
    this.actions = actions;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: "Zettel address problems" });
    contentEl.createEl("p", {
      text: "Deck never rewrites invalid or duplicate addresses. Correct the YAML in the affected notes."
    });
    const list = contentEl.createDiv({ cls: "zk-modal-list" });
    for (const issue of this.index.issues) {
      const group = list.createDiv({ cls: "zk-issue-group" });
      group.createDiv({ cls: "zk-issue-message", text: issue.message });
      for (const path of issue.paths) {
        const button = group.createEl("button", {
          cls: "zk-issue-file",
          text: path,
          attr: { type: "button" }
        });
        button.addEventListener("click", () => {
          this.actions.open(path);
          this.close();
        });
      }
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
function iconButton2(parent, icon, label) {
  const button = parent.createEl("button", {
    cls: "clickable-icon zk-icon-button",
    attr: { type: "button", "aria-label": label }
  });
  (0, import_obsidian2.setIcon)(button, icon);
  return button;
}

// src/plugin-state.ts
var DEFAULT_SPREAD = 0.58;
var DEFAULT_STATE = {
  entryPoints: [],
  lastActiveId: null,
  spread: DEFAULT_SPREAD
};
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function normalizePluginState(value) {
  if (!isRecord(value)) {
    return DEFAULT_STATE;
  }
  const entryPoints = Array.isArray(value.entryPoints) ? value.entryPoints.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.name !== "string" || entry.name.trim() === "" || typeof entry.id !== "string" || !isValidZettelId(entry.id)) {
      return [];
    }
    return [{ name: entry.name.trim(), id: entry.id }];
  }) : [];
  const lastActiveId = typeof value.lastActiveId === "string" && isValidZettelId(value.lastActiveId) ? value.lastActiveId : null;
  const rawSpread = typeof value.spread === "number" && Number.isFinite(value.spread) ? value.spread : DEFAULT_SPREAD;
  return {
    entryPoints,
    lastActiveId,
    spread: Math.min(1.12, Math.max(0.28, rawSpread))
  };
}

// src/zettel-index.ts
var import_obsidian3 = require("obsidian");

// src/zettel-metadata.ts
function displayValue(value) {
  const serialized = JSON.stringify(value);
  return serialized === void 0 ? String(value) : serialized;
}
function indexZettelMetadata(records) {
  const unfiledPaths = [];
  const issues = [];
  const candidates = /* @__PURE__ */ new Map();
  for (const record of records) {
    if (!record.hasZettelId) {
      continue;
    }
    if (record.zettelId === "" || record.zettelId === null || record.zettelId === void 0) {
      unfiledPaths.push(record.path);
      continue;
    }
    if (typeof record.zettelId !== "string" || !isValidZettelId(record.zettelId)) {
      issues.push({
        kind: "invalid",
        paths: [record.path],
        message: `Unsupported zettel-id ${displayValue(record.zettelId)}`
      });
      continue;
    }
    const paths = candidates.get(record.zettelId) ?? [];
    paths.push(record.path);
    candidates.set(record.zettelId, paths);
  }
  const filed = [];
  const allValidIds = [...candidates.keys()].sort(compareZettelIds);
  for (const id of allValidIds) {
    const paths = candidates.get(id);
    if (paths === void 0 || paths.length === 0) {
      continue;
    }
    paths.sort((a, b) => a.localeCompare(b));
    if (paths.length === 1) {
      const path = paths[0];
      if (path !== void 0) {
        filed.push({ path, id });
      }
      continue;
    }
    const first = paths[0];
    const second = paths[1];
    if (first !== void 0 && second !== void 0) {
      issues.push({
        kind: "duplicate",
        id,
        paths: [first, second, ...paths.slice(2)],
        message: `Duplicate zettel-id ${id}`
      });
    }
  }
  filed.sort((a, b) => compareZettelIds(a.id, b.id));
  unfiledPaths.sort((a, b) => a.localeCompare(b));
  issues.sort((a, b) => {
    const pathComparison = a.paths[0].localeCompare(b.paths[0]);
    return pathComparison !== 0 ? pathComparison : a.kind.localeCompare(b.kind);
  });
  return {
    filed,
    unfiledPaths,
    issues,
    allValidIds
  };
}

// src/zettel-index.ts
var EMPTY_INDEX = {
  filed: [],
  unfiled: [],
  unfiledPaths: [],
  issues: [],
  allValidIds: []
};
var ZettelIndex = class {
  constructor(app) {
    this.app = app;
  }
  current = EMPTY_INDEX;
  get snapshot() {
    return this.current;
  }
  refresh() {
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const records = markdownFiles.map((file) => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const hasZettelId = frontmatter !== void 0 && Object.prototype.hasOwnProperty.call(frontmatter, "zettel-id");
      return {
        path: file.path,
        hasZettelId,
        zettelId: hasZettelId ? frontmatter["zettel-id"] : void 0
      };
    });
    const indexed = indexZettelMetadata(records);
    const filesByPath = new Map(markdownFiles.map((file) => [file.path, file]));
    const filed = [];
    for (const record of indexed.filed) {
      const file = filesByPath.get(record.path);
      if (file !== void 0) {
        filed.push({ ...record, file });
      }
    }
    const unfiled = indexed.unfiledPaths.map((path) => filesByPath.get(path)).filter((file) => file !== void 0);
    this.current = { ...indexed, filed, unfiled };
    return this.current;
  }
  filedById(id) {
    return this.current.filed.find((zettel) => zettel.id === id);
  }
  filedByFile(file) {
    return this.current.filed.find((zettel) => zettel.path === file.path);
  }
  fileAtPath(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian3.TFile ? file : void 0;
  }
  /** Read only the note body, excluding the YAML frontmatter block. */
  async readBody(file) {
    const source = await this.app.vault.cachedRead(file);
    const position = this.app.metadataCache.getFileCache(file)?.frontmatterPosition;
    return position === void 0 ? source : source.slice(position.end.offset);
  }
};

// src/main.ts
var ZettelkastenPlugin = class extends import_obsidian4.Plugin {
  state = DEFAULT_STATE;
  index;
  indexRefreshTimer = null;
  spreadSaveTimer = null;
  filingWriteInProgress = false;
  async onload() {
    this.state = normalizePluginState(await this.loadData());
    this.index = new ZettelIndex(this.app);
    this.index.refresh();
    this.registerView(
      DECK_VIEW_TYPE,
      (leaf) => new DeckView(leaf, this)
    );
    this.addRibbonIcon("archive", "Open Zettelkasten Deck", () => {
      void this.openDeck();
    });
    this.registerCommands();
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.queueIndexRefresh())
    );
    this.registerEvent(
      this.app.metadataCache.on("deleted", () => this.queueIndexRefresh())
    );
    this.registerEvent(
      this.app.vault.on("create", () => this.queueIndexRefresh())
    );
    this.registerEvent(
      this.app.vault.on("delete", () => this.queueIndexRefresh())
    );
    this.registerEvent(
      this.app.vault.on("rename", () => this.queueIndexRefresh())
    );
    this.app.workspace.onLayoutReady(() => void this.refreshIndex());
  }
  onunload() {
    if (this.indexRefreshTimer !== null) {
      window.clearTimeout(this.indexRefreshTimer);
    }
    if (this.spreadSaveTimer !== null) {
      window.clearTimeout(this.spreadSaveTimer);
    }
    this.app.workspace.detachLeavesOfType(DECK_VIEW_TYPE);
  }
  async openDeck(filingFile) {
    await this.refreshIndex();
    let leaf;
    const existing = this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)[0];
    if (existing === void 0) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: DECK_VIEW_TYPE, active: true });
    } else {
      leaf = existing;
    }
    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof DeckView)) {
      throw new Error("Obsidian did not create the Zettelkasten Deck view");
    }
    if (filingFile !== void 0) {
      await leaf.view.startFiling(filingFile);
    }
    return leaf.view;
  }
  async rememberActiveCard(id) {
    if (this.state.lastActiveId === id) {
      return;
    }
    this.state = { ...this.state, lastActiveId: id };
    await this.persistState();
  }
  setSpread(value) {
    const spread = Math.min(1.12, Math.max(0.28, value));
    this.state = { ...this.state, spread };
    if (this.spreadSaveTimer !== null) {
      window.clearTimeout(this.spreadSaveTimer);
    }
    this.spreadSaveTimer = window.setTimeout(() => {
      this.spreadSaveTimer = null;
      void this.persistState();
    }, 160);
  }
  openMarkdownFile(file) {
    void this.app.workspace.getLeaf("tab").openFile(file);
  }
  showDesk() {
    this.index.refresh();
    new DeskModal(this.app, this.index.snapshot.unfiled, {
      open: (file) => this.openMarkdownFile(file),
      file: (file) => void this.beginFiling(file)
    }).open();
  }
  showIssues() {
    this.index.refresh();
    new IssuesModal(this.app, this.index.snapshot, {
      open: (path) => {
        const file = this.index.fileAtPath(path);
        if (file === void 0) {
          new import_obsidian4.Notice(`Could not find ${path}.`);
        } else {
          this.openMarkdownFile(file);
        }
      }
    }).open();
  }
  showEntryPoints(view) {
    const entries = this.state.entryPoints;
    new EntryPointsModal(this.app, entries, {
      currentId: view.activeCard?.id ?? null,
      isAvailable: (id) => this.index.filedById(id) !== void 0,
      visit: (id) => void view.goToId(id),
      addCurrent: () => view.addCurrentAsEntryPoint(),
      rename: (index) => this.renameEntryPoint(index),
      remove: (index) => this.removeEntryPoint(index)
    }).open();
  }
  async addEntryPoint(id) {
    if (this.index.filedById(id) === void 0) {
      new import_obsidian4.Notice(`Card ${id} is not available in Deck.`);
      return;
    }
    if (this.state.entryPoints.some((entry) => entry.id === id)) {
      new import_obsidian4.Notice(`${id} is already an entry point.`);
      return;
    }
    const name = await promptForText(
      this.app,
      "Name this entry point",
      "e.g. Communication"
    );
    if (name === null) {
      return;
    }
    this.state = {
      ...this.state,
      entryPoints: [...this.state.entryPoints, { name, id }]
    };
    await this.persistState();
    new import_obsidian4.Notice(`Added entry point \u201C${name}\u201D.`);
  }
  async createNewSection() {
    try {
      this.index.refresh();
      const id = generateNextSectionId(this.index.snapshot.allValidIds);
      const file = await this.createCardFile(id);
      this.openMarkdownFile(file);
      this.queueIndexRefresh();
    } catch (error) {
      new import_obsidian4.Notice(`Could not create a section: ${errorMessage2(error)}`);
    }
  }
  async fileCard(file, attachmentId) {
    this.filingWriteInProgress = true;
    try {
      this.index.refresh();
      if (this.index.filedById(attachmentId) === void 0) {
        throw new Error(
          `Attachment ${attachmentId} is missing, invalid, or duplicated`
        );
      }
      const newId = generateFiledId(
        attachmentId,
        this.index.snapshot.allValidIds
      );
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const hasId = Object.prototype.hasOwnProperty.call(
          frontmatter,
          "zettel-id"
        );
        const current = frontmatter["zettel-id"];
        if (!hasId || !(current === "" || current === null || current === void 0)) {
          throw new Error(
            "The card is no longer unfiled; its zettel-id was not changed"
          );
        }
        frontmatter["zettel-id"] = newId;
      });
      await this.waitForCachedId(file, newId);
      this.index.refresh();
      await this.rememberActiveCard(newId);
      new import_obsidian4.Notice(`Filed ${file.basename} as ${newId}.`);
      return newId;
    } catch (error) {
      new import_obsidian4.Notice(`Could not file the card: ${errorMessage2(error)}`);
      return null;
    } finally {
      this.filingWriteInProgress = false;
    }
  }
  registerCommands() {
    this.addCommand({
      id: "open-deck",
      name: "Open Deck",
      callback: () => void this.openDeck()
    });
    this.addCommand({
      id: "new-card",
      name: "New card",
      callback: () => void this.createNewCard()
    });
    this.addCommand({
      id: "make-current-note-card",
      name: "Make current note a card",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available = file !== null && file.extension === "md" && this.cardMetadataState(file) === "ordinary";
        if (checking) {
          return available;
        }
        if (available && file !== null) {
          void this.makeNoteCard(file);
        }
        return available;
      }
    });
    this.addCommand({
      id: "file-current-unfiled-card",
      name: "File current unfiled card",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available = file !== null && this.cardMetadataState(file) === "unfiled";
        if (checking) {
          return available;
        }
        if (available && file !== null) {
          void this.beginFiling(file);
        }
        return available;
      }
    });
    this.addCommand({
      id: "new-section",
      name: "New section",
      callback: () => void this.createNewSection()
    });
    this.addCommand({
      id: "hold-place",
      name: "Hold place",
      checkCallback: (checking) => {
        const view = this.currentDeckView();
        const available = view?.activeCard !== null && view !== null;
        if (checking) {
          return available;
        }
        if (available && view !== null) {
          view.holdPlace();
        }
        return available;
      }
    });
    this.addCommand({
      id: "add-current-card-entry-point",
      name: "Add current card as entry point",
      checkCallback: (checking) => {
        const deckView = this.app.workspace.getActiveViewOfType(DeckView);
        const deckId = deckView?.activeCard?.id;
        const activeFile = this.app.workspace.getActiveFile();
        const fileId = activeFile === null ? void 0 : this.index.filedByFile(activeFile)?.id;
        const id = deckId ?? fileId;
        const available = id !== void 0;
        if (checking) {
          return available;
        }
        if (id !== void 0) {
          void this.addEntryPoint(id);
        }
        return available;
      }
    });
  }
  async createNewCard() {
    try {
      const file = await this.createCardFile(null);
      this.openMarkdownFile(file);
      this.queueIndexRefresh();
    } catch (error) {
      new import_obsidian4.Notice(`Could not create a card: ${errorMessage2(error)}`);
    }
  }
  async makeNoteCard(file) {
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        if (Object.prototype.hasOwnProperty.call(frontmatter, "zettel-id")) {
          throw new Error("This note already has a zettel-id property");
        }
        frontmatter["zettel-id"] = "";
      });
      this.queueIndexRefresh();
      new import_obsidian4.Notice(`${file.basename} is now an unfiled card.`);
    } catch (error) {
      new import_obsidian4.Notice(`Could not make this note a card: ${errorMessage2(error)}`);
    }
  }
  async beginFiling(file) {
    this.index.refresh();
    if (this.cardMetadataState(file) !== "unfiled") {
      new import_obsidian4.Notice("Only an unfiled card can enter Filing Mode.");
      return;
    }
    await this.openDeck(file);
  }
  async createCardFile(id) {
    const activePath = this.app.workspace.getActiveFile()?.path ?? "";
    const basename = this.timestampBasename();
    const parent = this.app.fileManager.getNewFileParent(
      activePath,
      `${basename}.md`
    );
    const prefix = parent.isRoot() ? "" : `${parent.path}/`;
    let sequence = 0;
    let path;
    do {
      const suffix = sequence === 0 ? "" : ` ${sequence + 1}`;
      path = (0, import_obsidian4.normalizePath)(`${prefix}${basename}${suffix}.md`);
      sequence += 1;
    } while (this.app.vault.getAbstractFileByPath(path) !== null);
    const yamlValue = id === null ? '""' : `"${id}"`;
    return this.app.vault.create(
      path,
      `---
zettel-id: ${yamlValue}
---

`
    );
  }
  timestampBasename() {
    const now = /* @__PURE__ */ new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
    const time = [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0")
    ].join("");
    return `Zettel ${date} ${time}`;
  }
  cardMetadataState(file) {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (frontmatter === void 0 || !Object.prototype.hasOwnProperty.call(frontmatter, "zettel-id")) {
      return "ordinary";
    }
    const value = frontmatter["zettel-id"];
    if (value === "" || value === null || value === void 0) {
      return "unfiled";
    }
    if (typeof value !== "string") {
      return "invalid";
    }
    return this.index.snapshot.allValidIds.includes(value) ? "filed" : "invalid";
  }
  currentDeckView() {
    const active = this.app.workspace.getActiveViewOfType(DeckView);
    if (active !== null) {
      return active;
    }
    const leaf = this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)[0];
    return leaf?.view instanceof DeckView ? leaf.view : null;
  }
  async renameEntryPoint(index) {
    const entry = this.state.entryPoints[index];
    if (entry === void 0) {
      return;
    }
    const name = await promptForText(
      this.app,
      "Rename entry point",
      "Entry point name",
      entry.name
    );
    if (name === null) {
      return;
    }
    const entries = [...this.state.entryPoints];
    entries[index] = { ...entry, name };
    this.state = { ...this.state, entryPoints: entries };
    await this.persistState();
  }
  async removeEntryPoint(index) {
    const entries = [...this.state.entryPoints];
    const removed = entries.splice(index, 1)[0];
    if (removed === void 0) {
      return;
    }
    this.state = { ...this.state, entryPoints: entries };
    await this.persistState();
    new import_obsidian4.Notice(`Deleted entry point \u201C${removed.name}\u201D.`);
  }
  queueIndexRefresh() {
    if (this.filingWriteInProgress) {
      return;
    }
    if (this.indexRefreshTimer !== null) {
      window.clearTimeout(this.indexRefreshTimer);
    }
    this.indexRefreshTimer = window.setTimeout(() => {
      this.indexRefreshTimer = null;
      void this.refreshIndex();
    }, 80);
  }
  async refreshIndex() {
    this.index.refresh();
    const refreshes = this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE).flatMap(
      (leaf) => leaf.view instanceof DeckView ? [leaf.view.refresh()] : []
    );
    await Promise.all(refreshes);
  }
  async persistState() {
    try {
      await this.saveData(this.state);
    } catch (error) {
      new import_obsidian4.Notice(`Could not save Zettelkasten state: ${errorMessage2(error)}`);
    }
  }
  async waitForCachedId(file, expectedId) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const value = this.app.metadataCache.getFileCache(file)?.frontmatter?.["zettel-id"];
      if (value === expectedId) {
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
  }
};
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
