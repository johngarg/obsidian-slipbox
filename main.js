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
var import_obsidian5 = require("obsidian");

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

// src/bookmarks.ts
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function normalizeBookmarks(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenZettelIds = /* @__PURE__ */ new Set();
  const bookmarks = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.zettelId !== "string" || !isValidZettelId(candidate.zettelId)) {
      continue;
    }
    if (seenZettelIds.has(candidate.zettelId)) {
      continue;
    }
    seenZettelIds.add(candidate.zettelId);
    bookmarks.push({ zettelId: candidate.zettelId });
  }
  return bookmarks;
}
function createBookmark(bookmarks, zettelId) {
  if (bookmarks.some((bookmark) => bookmark.zettelId === zettelId)) {
    throw new Error(`${zettelId} already has a bookmark`);
  }
  if (!isValidZettelId(zettelId)) {
    throw new Error(`${zettelId} is not a valid Zettel address`);
  }
  return [...bookmarks, { zettelId }];
}
function deleteBookmark(bookmarks, zettelId) {
  return bookmarks.filter((bookmark) => bookmark.zettelId !== zettelId);
}

// src/deck-view.ts
var import_obsidian = require("obsidian");

// src/deck-motion.ts
var DEFAULT_ACTIVE_HYSTERESIS = 0.06;
function cardStackOrder(cardIndex, viewportPosition, activeIndex) {
  return cardIndex === activeIndex ? 220 : 100 - Math.floor(Math.abs(cardIndex - viewportPosition));
}
function activeCardActionAvailability(activeId, activePath, bookmarkedIds, deskCardRefs) {
  return {
    canAddBookmark: activeId !== null && !bookmarkedIds.includes(activeId),
    canPutOnDesk: activePath !== null && !deskCardRefs.includes(activePath)
  };
}
function bookmarkEdgeTargets(bookmarkIndices, viewportPosition, cardStep, stageWidth, cardWidth) {
  if (cardStep <= 0 || stageWidth <= 0 || cardWidth <= 0) {
    return { left: null, right: null };
  }
  const visibleLimit = stageWidth / 2 + cardWidth / 2;
  let left = null;
  let leftX = Number.NEGATIVE_INFINITY;
  let right = null;
  let rightX = Number.POSITIVE_INFINITY;
  for (const index of bookmarkIndices) {
    const x = (index - viewportPosition) * cardStep;
    if (x <= -visibleLimit && x > leftX) {
      left = index;
      leftX = x;
    } else if (x >= visibleLimit && x < rightX) {
      right = index;
      rightX = x;
    }
  }
  return { left, right };
}
function clampViewportPosition(viewportPosition, cardCount) {
  if (cardCount <= 0 || !Number.isFinite(viewportPosition)) {
    return 0;
  }
  return Math.max(0, Math.min(cardCount - 1, viewportPosition));
}
function activeIndexForViewport(viewportPosition, previousActiveIndex, cardCount, hysteresis = DEFAULT_ACTIVE_HYSTERESIS) {
  if (cardCount <= 0) {
    return -1;
  }
  const position = clampViewportPosition(viewportPosition, cardCount);
  let activeIndex = Math.max(
    0,
    Math.min(cardCount - 1, Math.trunc(previousActiveIndex))
  );
  const margin = Math.max(0, Math.min(0.49, hysteresis));
  while (activeIndex < cardCount - 1 && position > activeIndex + 0.5 + margin) {
    activeIndex += 1;
  }
  while (activeIndex > 0 && position < activeIndex - 0.5 - margin) {
    activeIndex -= 1;
  }
  return activeIndex;
}
function cardMotionStyle(cardIndex, viewportPosition, cardStep, isActive = false) {
  const safeStep = Math.max(cardStep, 1);
  const distance = Math.abs(cardIndex - viewportPosition);
  const distanceScale = Math.max(0.86, 1 - distance * 0.035);
  return {
    translateX: (cardIndex - viewportPosition) * safeStep,
    scale: isActive ? Math.max(0.98, distanceScale) : distanceScale,
    opacity: isActive ? 1 : Math.max(0.42, 1 - distance * 0.13)
  };
}
function viewportPositionToRevealCard(targetIndex, viewportPosition, cardCount, cardStep, stageWidth, cardWidth, margin = 18) {
  if (cardCount <= 0 || cardStep <= 0 || stageWidth <= 0 || cardWidth <= 0) {
    return clampViewportPosition(viewportPosition, cardCount);
  }
  const centreLimit = Math.max(0, (stageWidth - cardWidth) / 2 - margin);
  const targetX = (targetIndex - viewportPosition) * cardStep;
  let nextPosition = viewportPosition;
  if (targetX > centreLimit) {
    nextPosition = targetIndex - centreLimit / cardStep;
  } else if (targetX < -centreLimit) {
    nextPosition = targetIndex + centreLimit / cardStep;
  }
  return clampViewportPosition(nextPosition, cardCount);
}

// src/navigation-history.ts
var NavigationHistory = class {
  constructor(initial, equals = Object.is) {
    this.equals = equals;
    if (initial !== void 0) {
      this.entries = [initial];
      this.index = 0;
    }
  }
  entries = [];
  index = -1;
  current() {
    return this.entries[this.index];
  }
  canBack() {
    return this.index > 0;
  }
  canForward() {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }
  /** Set a new browsing session without retaining earlier locations. */
  reset(location) {
    this.entries = location === void 0 ? [] : [location];
    this.index = location === void 0 ? -1 : 0;
  }
  /**
   * Track ordinary physical movement without adding a Back destination.
   * The resulting card becomes the source if the next action is a jump.
   */
  replaceCurrent(location) {
    if (this.index < 0) {
      this.entries = [location];
      this.index = 0;
      return;
    }
    this.entries[this.index] = location;
  }
  /** Record an explicit jump with browser-style forward-branch replacement. */
  jump(location) {
    const current = this.current();
    if (current !== void 0 && this.equals(current, location)) {
      return;
    }
    const retained = this.entries.slice(0, this.index + 1);
    retained.push(location);
    this.entries = retained;
    this.index = retained.length - 1;
  }
  back() {
    if (!this.canBack()) {
      return void 0;
    }
    this.index -= 1;
    return this.current();
  }
  forward() {
    if (!this.canForward()) {
      return void 0;
    }
    this.index += 1;
    return this.current();
  }
  snapshot() {
    return { entries: [...this.entries], index: this.index };
  }
};

// src/deck-view.ts
var DECK_VIEW_TYPE = "zettelkasten-deck";
var FILING_ANIMATION_DURATION_MS = 280;
var RENDER_EDGE_BUFFER = 2;
var DeckView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.scope = new import_obsidian.Scope(this.app.scope);
    this.scope.register(
      [],
      "ArrowLeft",
      (event) => this.handleDeckKey(event, () => this.moveBy(-1), true)
    );
    this.scope.register(
      [],
      "ArrowRight",
      (event) => this.handleDeckKey(event, () => this.moveBy(1), true)
    );
    this.scope.register(
      [],
      "j",
      (event) => this.handleDeckKey(event, () => this.moveBy(1), true)
    );
    this.scope.register(
      [],
      "k",
      (event) => this.handleDeckKey(event, () => this.moveBy(-1), true)
    );
    this.scope.register(
      [],
      "c",
      (event) => this.handleDeckKey(event, () => this.centerActiveCard())
    );
    this.scope.register(
      [],
      "g",
      (event) => this.handleDeckKey(event, () => this.goToDeckBoundary("start"))
    );
    this.scope.register(
      ["Shift"],
      "g",
      (event) => this.handleDeckKey(event, () => this.goToDeckBoundary("end"))
    );
  }
  activeId = null;
  filingFile = null;
  stageEl = null;
  renderedCards = [];
  renderComponents = [];
  cardScrollPositions = /* @__PURE__ */ new Map();
  viewportOffset = 0;
  pointerLastX = null;
  filingPromptEl = null;
  renderWindowStart = 0;
  renderWindowEnd = -1;
  renderRefreshPending = false;
  renderVersion = 0;
  history = new NavigationHistory();
  backButtonEl = null;
  forwardButtonEl = null;
  addBookmarkButtonEl = null;
  putOnDeskButtonEl = null;
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
    await this.refresh();
  }
  async onClose() {
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
  get activeCard() {
    if (this.activeId === null) {
      return null;
    }
    return this.plugin.index.filedById(this.activeId) ?? null;
  }
  get isFiling() {
    return this.filingFile !== null;
  }
  get canGoBack() {
    return this.history.canBack();
  }
  get canGoForward() {
    return this.history.canForward();
  }
  async refresh() {
    const previousActiveId = this.activeId;
    this.chooseAvailableActiveCard();
    if (this.activeId !== previousActiveId) {
      this.viewportOffset = 0;
    }
    if (this.activeId === null) {
      this.history.reset();
    } else if (this.history.current() === void 0) {
      this.history.reset(this.activeId);
    } else if (this.activeId !== previousActiveId) {
      this.history.replaceCurrent(this.activeId);
    }
    this.clampViewportOffset();
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
  async goToId(id) {
    const moved = await this.navigateToId(id);
    if (moved) {
      this.history.replaceCurrent(id);
      this.updateHistoryControls();
    }
  }
  async jumpToId(id) {
    if (this.activeId !== null) {
      this.history.replaceCurrent(this.activeId);
    }
    if (this.plugin.index.filedById(id) === void 0) {
      new import_obsidian.Notice(`Card ${id} is missing, invalid, or duplicated.`);
      return;
    }
    this.history.jump(id);
    await this.navigateToId(id);
    this.updateHistoryControls();
  }
  async goBack() {
    const id = this.history.back();
    if (id === void 0) {
      return;
    }
    if (!await this.navigateToId(id)) {
      new import_obsidian.Notice(`The Back destination ${id} is no longer available.`);
    }
    this.updateHistoryControls();
  }
  async goForward() {
    const id = this.history.forward();
    if (id === void 0) {
      return;
    }
    if (!await this.navigateToId(id)) {
      new import_obsidian.Notice(`The Forward destination ${id} is no longer available.`);
    }
    this.updateHistoryControls();
  }
  async addBookmarkToCurrent() {
    if (this.activeId === null) {
      new import_obsidian.Notice("There is no active filed card.");
      return;
    }
    await this.plugin.addBookmark(this.activeId);
  }
  async navigateToId(id) {
    const filed = this.plugin.index.snapshot.filed;
    const targetIndex = filed.findIndex((card) => card.id === id);
    if (targetIndex < 0) {
      new import_obsidian.Notice(`Card ${id} is missing, invalid, or duplicated.`);
      return false;
    }
    this.activeId = id;
    this.viewportOffset = 0;
    await this.renderDeck();
    return true;
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
    const firstEntryPoint = this.plugin.state.entryPoints.find(
      (entry) => available.has(entry.id)
    );
    this.activeId = firstEntryPoint?.id ?? filed[0]?.id ?? null;
  }
  async renderDeck() {
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
    const history = toolbar.createDiv({ cls: "zk-toolbar-group zk-history-controls" });
    const back = history.createEl("button", {
      text: "\u2190 Back",
      attr: { type: "button" }
    });
    back.addEventListener("click", () => void this.goBack());
    this.backButtonEl = back;
    const forward = history.createEl("button", {
      text: "Forward \u2192",
      attr: { type: "button" }
    });
    forward.addEventListener("click", () => void this.goForward());
    this.forwardButtonEl = forward;
    this.updateHistoryControls();
    const controls = toolbar.createDiv({ cls: "zk-toolbar-group zk-toolbar-main" });
    const entries = controls.createEl("button", {
      text: "Entry points",
      attr: { type: "button" }
    });
    entries.addEventListener("click", () => this.plugin.showEntryPoints(this));
    const bookmarks = controls.createEl("button", {
      attr: { type: "button" },
      cls: "zk-bookmarks-button"
    });
    bookmarks.createSpan({ text: "Bookmarks" });
    if (this.plugin.state.bookmarks.length > 0) {
      bookmarks.createSpan({ cls: "zk-count", text: String(this.plugin.state.bookmarks.length) });
    }
    bookmarks.addEventListener("click", () => this.plugin.showBookmarks(this));
    const addBookmark = iconButton(
      controls,
      "bookmark-plus",
      "Add bookmark to current card"
    );
    this.addBookmarkButtonEl = addBookmark;
    addBookmark.addEventListener("click", () => void this.addBookmarkToCurrent());
    const desk = controls.createEl("button", {
      attr: { type: "button" },
      cls: "zk-desk-button"
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
      if (file !== void 0) {
        void this.plugin.putFileOnDesk(file);
      }
    });
    this.updateActiveActionControls();
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
      this.positionCards();
      if (this.stageEl !== null) {
        this.renderBookmarkEdgeTabs(this.stageEl);
      }
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
  async renderCardWindow(stage, filed, activeIndex, version) {
    const viewportPosition = this.viewportPosition(activeIndex);
    const viewportIndex = Math.round(viewportPosition);
    const radius = Math.min(
      8,
      Math.max(3, Math.ceil(1 / this.plugin.state.spread) + 2)
    );
    const start = Math.max(0, viewportIndex - radius);
    const end = Math.min(filed.length - 1, viewportIndex + radius);
    this.renderWindowStart = start;
    this.renderWindowEnd = end;
    const jobs = [];
    for (let index = start; index <= end; index += 1) {
      const card = filed[index];
      if (card === void 0) {
        continue;
      }
      const cardEl = stage.createDiv({ cls: "zk-card" });
      cardEl.dataset.index = String(index);
      cardEl.dataset.path = card.path;
      cardEl.toggleClass("is-active", index === activeIndex);
      const isBookmarked = this.plugin.bookmarkAt(card.id) !== void 0;
      const cardLabel = `${card.id} \xB7 ${card.file.basename}`;
      cardEl.setAttr("aria-label", cardLabel);
      (0, import_obsidian.setTooltip)(cardEl, cardLabel, {
        placement: "bottom",
        delay: 350
      });
      cardEl.style.zIndex = String(cardStackOrder(index, viewportPosition, activeIndex));
      this.renderedCards.push(cardEl);
      const frame = cardEl.createDiv({ cls: "zk-card-frame" });
      const addressRow = frame.createDiv({ cls: "zk-card-address-row" });
      addressRow.createSpan({ cls: "zk-card-address", text: card.id });
      const bookmarkAction = isBookmarked ? `Remove bookmark from ${card.id}` : `Add bookmark to ${card.id}`;
      const bookmarkToggle = addressRow.createEl("button", {
        cls: "clickable-icon zk-card-bookmark-toggle",
        attr: {
          type: "button",
          "aria-label": bookmarkAction,
          "aria-pressed": String(isBookmarked)
        }
      });
      bookmarkToggle.toggleClass("is-bookmarked", isBookmarked);
      (0, import_obsidian.setIcon)(bookmarkToggle, "bookmark");
      (0, import_obsidian.setTooltip)(bookmarkToggle, bookmarkAction, {
        placement: "bottom",
        delay: 250
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
      this.interceptFiledLinks(target, card.file.path);
      target.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
    } catch (error) {
      target.createEl("p", {
        cls: "zk-render-error",
        text: `Could not render this card: ${errorMessage(error)}`
      });
    }
  }
  interceptFiledLinks(target, sourcePath) {
    target.addEventListener(
      "click",
      (event) => {
        if (!(event.target instanceof Element)) {
          return;
        }
        const link = event.target.closest("a.internal-link");
        const linkPath = link?.dataset.href ?? link?.getAttribute("href") ?? void 0;
        if (link === null || linkPath === void 0 || linkPath === "") {
          return;
        }
        const destination = this.app.metadataCache.getFirstLinkpathDest(
          linkPath,
          sourcePath
        );
        if (destination === null) {
          return;
        }
        const filed = this.plugin.index.filedByFile(destination);
        if (filed === void 0) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.jumpToId(filed.id);
      },
      { capture: true }
    );
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
    this.filingPromptEl = actions.createSpan({
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
    this.viewportOffset = 0;
    this.history.replaceCurrent(newId);
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
  renderBookmarkEdgeTabs(stage) {
    stage.querySelectorAll(".zk-bookmark-edge-tab").forEach((tab) => tab.remove());
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
      cardWidth
    );
    for (const direction of ["left", "right"]) {
      const index = targets[direction];
      const card = index === null ? void 0 : filed[index];
      if (card === void 0) {
        continue;
      }
      const tab = stage.createEl("button", {
        cls: `zk-bookmark-edge-tab is-${direction}`,
        text: `${direction === "left" ? "\u25C0" : "\u25B6"} ${card.id}`,
        attr: {
          type: "button",
          "aria-label": `Jump to bookmark ${card.id}`
        }
      });
      tab.addEventListener("click", () => void this.jumpToId(card.id));
    }
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
        this.moveViewportByPixels(event.deltaX * scale);
      },
      { passive: false }
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
    const finishPointer = (event) => {
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
  moveViewportByPixels(deltaPixels) {
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
  moveBy(delta) {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0) {
      return;
    }
    const targetIndex = Math.max(
      0,
      Math.min(filed.length - 1, activeIndex + delta)
    );
    const target = filed[targetIndex];
    const stage = this.stageEl;
    const firstCard = this.renderedCards[0];
    if (target === void 0 || target.id === this.activeId || stage === null) {
      return;
    }
    const viewportPosition = viewportPositionToRevealCard(
      targetIndex,
      this.viewportPosition(activeIndex),
      filed.length,
      this.cardStep(),
      stage.clientWidth,
      firstCard?.offsetWidth ?? 0
    );
    this.activeId = target.id;
    this.viewportOffset = viewportPosition - targetIndex;
    this.history.replaceCurrent(target.id);
    this.positionCards();
    this.updateActiveUi();
    this.queueRenderWindowRefresh();
  }
  centerActiveCard() {
    if (this.activeId === null) {
      new import_obsidian.Notice("There is no active filed card to centre.");
      return;
    }
    this.viewportOffset = 0;
    this.positionCards();
    this.updateActiveUi();
    this.queueRenderWindowRefresh();
  }
  goToDeckBoundary(boundary) {
    const filed = this.plugin.index.snapshot.filed;
    const target = boundary === "start" ? filed[0] : filed[filed.length - 1];
    if (target === void 0) {
      new import_obsidian.Notice("There are no filed cards.");
      return;
    }
    void this.goToId(target.id);
  }
  handleDeckKey(event, action, repeatable = false) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable) {
      return false;
    }
    event.preventDefault();
    if (!event.repeat || repeatable) {
      action();
    }
    return true;
  }
  selectCardWithoutMoving(id) {
    const filed = this.plugin.index.snapshot.filed;
    const previousActiveIndex = filed.findIndex((card) => card.id === this.activeId);
    const targetIndex = filed.findIndex((card) => card.id === id);
    if (targetIndex < 0) {
      return;
    }
    const viewportPosition = previousActiveIndex < 0 ? targetIndex : this.viewportPosition(previousActiveIndex);
    this.activeId = id;
    this.viewportOffset = viewportPosition - targetIndex;
    this.history.replaceCurrent(id);
    this.positionCards();
    this.updateActiveUi();
  }
  applyViewportPosition(nextPosition) {
    const filed = this.plugin.index.snapshot.filed;
    const previousActiveIndex = filed.findIndex((card) => card.id === this.activeId);
    if (previousActiveIndex < 0) {
      return;
    }
    const viewportPosition = clampViewportPosition(nextPosition, filed.length);
    const activeIndex = activeIndexForViewport(
      viewportPosition,
      previousActiveIndex,
      filed.length
    );
    const activeCard = filed[activeIndex];
    if (activeCard === void 0) {
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
  positionCards() {
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
        index === activeIndex
      );
      card.style.transform = `translate(-50%, -50%) translateX(${motion.translateX}px) scale(${motion.scale})`;
      card.style.opacity = String(motion.opacity);
    }
  }
  updateActiveUi() {
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
  updateActiveActionControls() {
    const activeCard = this.activeCard;
    const availability = activeCardActionAvailability(
      activeCard?.id ?? null,
      activeCard?.path ?? null,
      this.plugin.state.bookmarks.map((bookmark) => bookmark.zettelId),
      this.plugin.state.deskCards.map((card) => card.cardRef)
    );
    if (this.addBookmarkButtonEl !== null) {
      this.addBookmarkButtonEl.disabled = !availability.canAddBookmark;
    }
    if (this.putOnDeskButtonEl !== null) {
      this.putOnDeskButtonEl.disabled = !availability.canPutOnDesk;
    }
  }
  viewportPosition(activeIndex) {
    return activeIndex + this.viewportOffset;
  }
  clampViewportOffset() {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0) {
      this.viewportOffset = 0;
      return;
    }
    const position = clampViewportPosition(
      this.viewportPosition(activeIndex),
      filed.length
    );
    this.viewportOffset = position - activeIndex;
  }
  queueRenderWindowRefresh() {
    if (this.renderRefreshPending || this.pointerLastX !== null) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = filed.findIndex((card) => card.id === this.activeId);
    if (activeIndex < 0) {
      return;
    }
    const viewportIndex = Math.round(this.viewportPosition(activeIndex));
    const needsEarlierCards = this.renderWindowStart > 0 && viewportIndex <= this.renderWindowStart + RENDER_EDGE_BUFFER;
    const needsLaterCards = this.renderWindowEnd < filed.length - 1 && viewportIndex >= this.renderWindowEnd - RENDER_EDGE_BUFFER;
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
  updateHistoryControls() {
    if (this.backButtonEl !== null) {
      this.backButtonEl.disabled = !this.history.canBack();
    }
    if (this.forwardButtonEl !== null) {
      this.forwardButtonEl.disabled = !this.history.canForward();
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

// src/desk-view.ts
var import_obsidian2 = require("obsidian");

// src/desk-state.ts
var DESK_WIDTH = 2400;
var DESK_HEIGHT = 1600;
var DESK_CARD_WIDTH = 520;
var DESK_CARD_HEIGHT = 346;
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function clampDeskPosition(x, y) {
  return {
    x: Math.round(Math.max(0, Math.min(DESK_WIDTH - DESK_CARD_WIDTH, x))),
    y: Math.round(Math.max(0, Math.min(DESK_HEIGHT - DESK_CARD_HEIGHT, y)))
  };
}
function normalizeDeskCards(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = /* @__PURE__ */ new Set();
  const cards = [];
  for (const candidate of value) {
    if (!isRecord2(candidate) || typeof candidate.cardRef !== "string" || candidate.cardRef.trim() === "" || !finiteNumber(candidate.x) || !finiteNumber(candidate.y) || !finiteNumber(candidate.z)) {
      continue;
    }
    const cardRef = candidate.cardRef.trim();
    if (seen.has(cardRef)) {
      continue;
    }
    seen.add(cardRef);
    const position = clampDeskPosition(candidate.x, candidate.y);
    cards.push({
      cardRef,
      ...position,
      z: Math.max(0, Math.round(candidate.z))
    });
  }
  return cards;
}
function nextZ(cards) {
  return cards.reduce((maximum, card) => Math.max(maximum, card.z), 0) + 1;
}
function addDeskCard(cards, cardRef, position) {
  if (cards.some((card) => card.cardRef === cardRef)) {
    return cards;
  }
  return [
    ...cards,
    { cardRef, ...clampDeskPosition(position.x, position.y), z: nextZ(cards) }
  ];
}
function moveDeskCard(cards, cardRef, position) {
  const nextPosition = clampDeskPosition(position.x, position.y);
  return cards.map(
    (card) => card.cardRef === cardRef ? { ...card, ...nextPosition } : card
  );
}
function bringDeskCardToFront(cards, cardRef) {
  const frontZ = nextZ(cards);
  return cards.map(
    (card) => card.cardRef === cardRef ? { ...card, z: frontZ } : card
  );
}
function removeDeskCard(cards, cardRef) {
  return cards.filter((card) => card.cardRef !== cardRef);
}
function removeDeskPath(cards, deletedPath) {
  const prefix = `${deletedPath.replace(/\/$/, "")}/`;
  return cards.filter(
    (card) => card.cardRef !== deletedPath && !card.cardRef.startsWith(prefix)
  );
}
function renameDeskCard(cards, oldRef, newRef) {
  const oldPrefix = `${oldRef.replace(/\/$/, "")}/`;
  const newPrefix = `${newRef.replace(/\/$/, "")}/`;
  const renamed = cards.map((card) => {
    if (card.cardRef === oldRef) {
      return { ...card, cardRef: newRef };
    }
    if (card.cardRef.startsWith(oldPrefix)) {
      return { ...card, cardRef: `${newPrefix}${card.cardRef.slice(oldPrefix.length)}` };
    }
    return card;
  });
  return normalizeDeskCards(renamed);
}

// src/desk-view.ts
var DESK_VIEW_TYPE = "zettelkasten-desk";
var DeskView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  renderComponents = [];
  renderVersion = 0;
  getViewType() {
    return DESK_VIEW_TYPE;
  }
  getDisplayText() {
    return "Zettelkasten Desk";
  }
  getIcon() {
    return "panels-top-left";
  }
  async onOpen() {
    this.contentEl.addClass("zk-desk-view");
    await this.refresh();
  }
  async onClose() {
    this.unloadRenderComponents();
  }
  async refresh() {
    await this.renderDesk();
  }
  async renderDesk() {
    const version = ++this.renderVersion;
    this.unloadRenderComponents();
    this.contentEl.empty();
    const shell = this.contentEl.createDiv({ cls: "zk-desk-shell" });
    this.renderToolbar(shell);
    const body = shell.createDiv({ cls: "zk-desk-body" });
    this.renderUnfiledTray(body);
    const viewport = body.createDiv({ cls: "zk-desk-viewport" });
    const surface = viewport.createDiv({ cls: "zk-desk-surface" });
    surface.style.width = `${DESK_WIDTH}px`;
    surface.style.height = `${DESK_HEIGHT}px`;
    const jobs = [];
    for (const state of [...this.plugin.state.deskCards].sort((a, b) => a.z - b.z)) {
      jobs.push(this.renderCard(surface, state, version));
    }
    await Promise.all(jobs);
  }
  renderToolbar(shell) {
    const toolbar = shell.createDiv({ cls: "zk-deck-toolbar zk-desk-toolbar" });
    const identity = toolbar.createDiv({ cls: "zk-deck-identity" });
    const icon = identity.createSpan({ cls: "zk-deck-icon" });
    (0, import_obsidian2.setIcon)(icon, "panels-top-left");
    identity.createSpan({ text: "Desk" });
    toolbar.createSpan({
      cls: "zk-desk-description",
      text: `${this.plugin.state.deskCards.length} card${this.plugin.state.deskCards.length === 1 ? "" : "s"} on the table`
    });
    const openDeck = toolbar.createEl("button", {
      text: "Open Deck",
      attr: { type: "button" }
    });
    openDeck.addEventListener("click", () => void this.plugin.openDeck());
  }
  renderUnfiledTray(body) {
    const tray = body.createEl("aside", { cls: "zk-unfiled-tray" });
    tray.createEl("h3", { text: "Unfiled cards" });
    tray.createEl("p", {
      text: "Place a card on the table or file it directly."
    });
    const placed = new Set(this.plugin.state.deskCards.map((card) => card.cardRef));
    const available = this.plugin.index.snapshot.unfiled.filter(
      (file) => !placed.has(file.path)
    );
    const list = tray.createDiv({ cls: "zk-unfiled-list" });
    if (available.length === 0) {
      list.createEl("p", {
        cls: "zk-empty-copy",
        text: this.plugin.index.snapshot.unfiled.length === 0 ? "No unfiled cards." : "All unfiled cards are on the table."
      });
    }
    for (const file of available) {
      const item = list.createDiv({ cls: "zk-unfiled-item" });
      const name = item.createEl("button", {
        text: file.basename,
        cls: "zk-unfiled-open",
        attr: { type: "button" }
      });
      (0, import_obsidian2.setTooltip)(name, file.path);
      name.addEventListener("click", () => this.plugin.openMarkdownFile(file));
      const place = iconButton2(item, "plus", `Place ${file.basename} on Desk`);
      place.addEventListener("click", () => void this.plugin.putFileOnDesk(file));
      const fileButton = iconButton2(item, "archive-restore", `File ${file.basename}`);
      fileButton.addEventListener("click", () => void this.plugin.beginFiling(file));
    }
  }
  async renderCard(surface, state, version) {
    const file = this.plugin.index.fileAtPath(state.cardRef);
    const card = surface.createDiv({ cls: "zk-desk-card" });
    card.dataset.path = state.cardRef;
    card.style.left = `${state.x}px`;
    card.style.top = `${state.y}px`;
    card.style.zIndex = String(state.z);
    card.style.width = `${DESK_CARD_WIDTH}px`;
    card.style.height = `${DESK_CARD_HEIGHT}px`;
    if (file === void 0) {
      card.addClass("is-missing");
      this.renderMissingCard(card, state);
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    const isUnfiled = this.plugin.index.snapshot.unfiled.some(
      (candidate) => candidate.path === file.path
    );
    card.toggleClass("is-unfiled", isUnfiled);
    card.toggleClass("is-invalid", filed === void 0 && !isUnfiled);
    const header = card.createDiv({ cls: "zk-desk-card-header" });
    const identity = header.createDiv({ cls: "zk-desk-card-identity" });
    identity.createSpan({
      cls: "zk-desk-card-address",
      text: filed?.id ?? (isUnfiled ? "unfiled" : "invalid Zettel")
    });
    identity.createSpan({ cls: "zk-desk-card-title", text: file.basename });
    const actions = header.createDiv({ cls: "zk-desk-card-actions" });
    if (isUnfiled) {
      const fileButton = iconButton2(actions, "archive-restore", `File ${file.basename}`);
      fileButton.addEventListener("pointerdown", (event) => event.stopPropagation());
      fileButton.addEventListener("click", () => void this.plugin.beginFiling(file));
    }
    const open = iconButton2(actions, "file-pen-line", `Open ${file.basename}`);
    open.addEventListener("pointerdown", (event) => event.stopPropagation());
    open.addEventListener("click", () => this.plugin.openMarkdownFile(file));
    const remove = iconButton2(actions, "x", `Remove ${file.basename} from Desk`);
    remove.addEventListener("pointerdown", (event) => event.stopPropagation());
    remove.addEventListener("click", () => void this.plugin.removeFromDesk(file.path));
    this.attachDragging(card, header, state);
    card.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".zk-desk-card-header, button, a") !== null) {
        return;
      }
      card.style.zIndex = String(this.plugin.nextDeskZ());
      void this.plugin.raiseDeskCard(state.cardRef);
    });
    card.addEventListener("dblclick", (event) => {
      if (event.target.closest("button, a") === null) {
        this.plugin.openMarkdownFile(file);
      }
    });
    const scroll = card.createDiv({ cls: "zk-desk-card-scroll markdown-rendered" });
    const component = new import_obsidian2.Component();
    component.load();
    this.renderComponents.push(component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (version === this.renderVersion) {
        await import_obsidian2.MarkdownRenderer.render(this.app, body, scroll, file.path, component);
      }
    } catch (error) {
      scroll.createEl("p", {
        cls: "zk-render-error",
        text: `Could not render this card: ${errorMessage2(error)}`
      });
    }
  }
  renderMissingCard(card, state) {
    const header = card.createDiv({ cls: "zk-desk-card-header" });
    header.createSpan({ cls: "zk-desk-card-address", text: "missing card" });
    const remove = iconButton2(header, "x", "Remove missing card from Desk");
    remove.addEventListener("click", () => void this.plugin.removeFromDesk(state.cardRef));
    card.createDiv({
      cls: "zk-desk-missing-copy",
      text: `${state.cardRef} no longer resolves to a note.`
    });
  }
  attachDragging(card, handle, state) {
    let currentX = state.x;
    let currentY = state.y;
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button") !== null) {
        return;
      }
      const frontZ = this.plugin.nextDeskZ();
      card.style.zIndex = String(frontZ);
      drag = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: currentX,
        startY: currentY,
        x: currentX,
        y: currentY
      };
      handle.setPointerCapture(event.pointerId);
      card.addClass("is-dragging");
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (drag === null || event.pointerId !== drag.pointerId) {
        return;
      }
      const position = clampDeskPosition(
        drag.startX + event.clientX - drag.startClientX,
        drag.startY + event.clientY - drag.startClientY
      );
      drag.x = position.x;
      drag.y = position.y;
      card.style.left = `${position.x}px`;
      card.style.top = `${position.y}px`;
    });
    const finish = (event) => {
      if (drag === null || event.pointerId !== drag.pointerId) {
        return;
      }
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      const final = drag;
      drag = null;
      currentX = final.x;
      currentY = final.y;
      card.removeClass("is-dragging");
      void this.plugin.updateDeskCardLayout(state.cardRef, final.x, final.y, true);
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }
  unloadRenderComponents() {
    for (const component of this.renderComponents) {
      component.unload();
    }
    this.renderComponents = [];
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
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/modals.ts
var import_obsidian3 = require("obsidian");
var TextPromptModal = class extends import_obsidian3.Modal {
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
        new import_obsidian3.Notice("A name is required.");
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
var BookmarksModal = class extends import_obsidian3.Modal {
  constructor(app, bookmarks, actions) {
    super(app);
    this.bookmarks = bookmarks;
    this.actions = actions;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: "Bookmarks" });
    contentEl.createEl("p", {
      cls: "zk-empty-copy",
      text: "One persistent physical bookmark may be attached to each filed card."
    });
    const list = contentEl.createDiv({ cls: "zk-modal-list" });
    if (this.bookmarks.length === 0) {
      list.createEl("p", { cls: "zk-empty-copy", text: "No bookmarks yet." });
    }
    for (const bookmark of this.bookmarks) {
      const available = this.actions.isAvailable(bookmark.zettelId);
      const row = list.createDiv({ cls: "zk-list-row zk-bookmark-row" });
      const visit = row.createEl("button", {
        cls: "zk-entry-visit",
        attr: { type: "button" }
      });
      visit.createSpan({
        cls: "zk-entry-name",
        text: available ? bookmark.zettelId : `${bookmark.zettelId} \xB7 missing`
      });
      visit.disabled = !available;
      visit.addEventListener("click", () => {
        this.actions.visit(bookmark.zettelId);
        this.close();
      });
      const remove = iconButton3(row, "trash-2", `Delete bookmark at ${bookmark.zettelId}`);
      remove.addEventListener("click", () => {
        void this.actions.remove(bookmark.zettelId).then(() => this.close());
      });
    }
    const footer = contentEl.createDiv({ cls: "zk-modal-actions" });
    const add = footer.createEl("button", {
      text: "+ Bookmark current card",
      cls: "mod-cta",
      attr: { type: "button" }
    });
    add.disabled = this.actions.currentId === null || this.bookmarks.some(
      (bookmark) => bookmark.zettelId === this.actions.currentId
    );
    add.addEventListener("click", () => {
      void this.actions.addCurrent().then(() => this.close());
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var EntryPointsModal = class extends import_obsidian3.Modal {
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
      const rename = iconButton3(row, "pencil", `Rename ${entry.name}`);
      rename.addEventListener("click", () => {
        void this.actions.rename(index).then(() => this.close());
      });
      const remove = iconButton3(row, "trash-2", `Delete ${entry.name}`);
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
var IssuesModal = class extends import_obsidian3.Modal {
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
function iconButton3(parent, icon, label) {
  const button = parent.createEl("button", {
    cls: "clickable-icon zk-icon-button",
    attr: { type: "button", "aria-label": label }
  });
  (0, import_obsidian3.setIcon)(button, icon);
  return button;
}

// src/plugin-state.ts
var DEFAULT_SPREAD = 0.58;
var DEFAULT_STATE = {
  entryPoints: [],
  bookmarks: [],
  deskCards: [],
  spread: DEFAULT_SPREAD
};
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}
function normalizePluginState(value) {
  if (!isRecord3(value)) {
    return DEFAULT_STATE;
  }
  const entryPoints = Array.isArray(value.entryPoints) ? value.entryPoints.flatMap((entry) => {
    if (!isRecord3(entry) || typeof entry.name !== "string" || entry.name.trim() === "" || typeof entry.id !== "string" || !isValidZettelId(entry.id)) {
      return [];
    }
    return [{ name: entry.name.trim(), id: entry.id }];
  }) : [];
  const rawSpread = typeof value.spread === "number" && Number.isFinite(value.spread) ? value.spread : DEFAULT_SPREAD;
  return {
    entryPoints,
    bookmarks: normalizeBookmarks(value.bookmarks),
    deskCards: normalizeDeskCards(value.deskCards),
    spread: Math.min(1.12, Math.max(0.28, rawSpread))
  };
}

// src/zettel-index.ts
var import_obsidian4 = require("obsidian");

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
    return file instanceof import_obsidian4.TFile ? file : void 0;
  }
  /** Read only the note body, excluding the YAML frontmatter block. */
  async readBody(file) {
    const source = await this.app.vault.cachedRead(file);
    const position = this.app.metadataCache.getFileCache(file)?.frontmatterPosition;
    return position === void 0 ? source : source.slice(position.end.offset);
  }
};

// src/main.ts
var ZettelkastenPlugin = class extends import_obsidian5.Plugin {
  state = DEFAULT_STATE;
  index;
  indexRefreshTimer = null;
  spreadSaveTimer = null;
  filingWriteInProgress = false;
  async onload() {
    this.state = normalizePluginState(await this.loadData());
    this.index = new ZettelIndex(this.app);
    this.index.refresh();
    await this.persistState();
    this.registerView(
      DECK_VIEW_TYPE,
      (leaf) => new DeckView(leaf, this)
    );
    this.registerView(
      DESK_VIEW_TYPE,
      (leaf) => new DeskView(leaf, this)
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
    this.registerEvent(this.app.vault.on("create", () => this.queueIndexRefresh()));
    this.registerEvent(
      this.app.vault.on("delete", (file) => this.handleDeletedFile(file))
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => this.handleRenamedFile(file, oldPath))
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
    this.app.workspace.detachLeavesOfType(DESK_VIEW_TYPE);
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
  async openDesk() {
    await this.refreshIndex();
    let leaf;
    const existing = this.app.workspace.getLeavesOfType(DESK_VIEW_TYPE)[0];
    if (existing === void 0) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: DESK_VIEW_TYPE, active: true });
    } else {
      leaf = existing;
    }
    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof DeskView)) {
      throw new Error("Obsidian did not create the Zettelkasten Desk view");
    }
    return leaf.view;
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
    void this.openDesk();
  }
  showIssues() {
    this.index.refresh();
    new IssuesModal(this.app, this.index.snapshot, {
      open: (path) => {
        const file = this.index.fileAtPath(path);
        if (file === void 0) {
          new import_obsidian5.Notice(`Could not find ${path}.`);
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
      visit: (id) => void view.jumpToId(id),
      addCurrent: () => view.addCurrentAsEntryPoint(),
      rename: (index) => this.renameEntryPoint(index),
      remove: (index) => this.removeEntryPoint(index)
    }).open();
  }
  showBookmarks(view) {
    new BookmarksModal(this.app, this.state.bookmarks, {
      currentId: view.activeCard?.id ?? null,
      isAvailable: (id) => this.index.filedById(id) !== void 0,
      visit: (id) => void view.jumpToId(id),
      addCurrent: () => view.addBookmarkToCurrent(),
      remove: (zettelId) => this.removeBookmark(zettelId)
    }).open();
  }
  bookmarkAt(zettelId) {
    return this.state.bookmarks.find((bookmark) => bookmark.zettelId === zettelId);
  }
  async addBookmark(zettelId) {
    if (this.index.filedById(zettelId) === void 0) {
      new import_obsidian5.Notice("Only an available filed card can be bookmarked.");
      return;
    }
    if (this.bookmarkAt(zettelId) !== void 0) {
      new import_obsidian5.Notice(`${zettelId} already has a bookmark.`);
      return;
    }
    try {
      this.state = {
        ...this.state,
        bookmarks: createBookmark(this.state.bookmarks, zettelId)
      };
      await this.persistStateAndRefreshViews();
      new import_obsidian5.Notice(`Bookmarked ${zettelId}.`);
    } catch (error) {
      new import_obsidian5.Notice(`Could not add bookmark: ${errorMessage3(error)}`);
    }
  }
  async toggleBookmark(zettelId) {
    if (this.bookmarkAt(zettelId) === void 0) {
      await this.addBookmark(zettelId);
    } else {
      await this.removeBookmark(zettelId);
    }
  }
  async putFileOnDesk(file) {
    this.index.refresh();
    const metadataState = this.cardMetadataState(file);
    if (metadataState !== "filed" && metadataState !== "unfiled") {
      new import_obsidian5.Notice("Only a filed or unfiled Zettel can be placed on Desk.");
      return;
    }
    if (this.state.deskCards.some((card) => card.cardRef === file.path)) {
      new import_obsidian5.Notice(`${file.basename} is already on Desk.`);
      await this.openDesk();
      return;
    }
    const position = this.nextDeskPosition();
    this.state = {
      ...this.state,
      deskCards: addDeskCard(this.state.deskCards, file.path, position)
    };
    await this.persistStateAndRefreshViews();
    await this.openDesk();
  }
  async removeFromDesk(cardRef) {
    if (!this.state.deskCards.some((card) => card.cardRef === cardRef)) {
      return;
    }
    const next = removeDeskCard(this.state.deskCards, cardRef);
    this.state = { ...this.state, deskCards: next };
    await this.persistStateAndRefreshViews();
  }
  nextDeskZ() {
    return this.state.deskCards.reduce((maximum, card) => Math.max(maximum, card.z), 0) + 1;
  }
  async updateDeskCardLayout(cardRef, x, y, bringToFront) {
    let cards = moveDeskCard(this.state.deskCards, cardRef, { x, y });
    if (bringToFront) {
      cards = bringDeskCardToFront(cards, cardRef);
    }
    this.state = { ...this.state, deskCards: cards };
    await this.persistState();
  }
  async raiseDeskCard(cardRef) {
    this.state = {
      ...this.state,
      deskCards: bringDeskCardToFront(this.state.deskCards, cardRef)
    };
    await this.persistState();
  }
  async beginFiling(file) {
    this.index.refresh();
    if (this.cardMetadataState(file) !== "unfiled") {
      new import_obsidian5.Notice("Only an unfiled card can enter Filing Mode.");
      return;
    }
    await this.openDeck(file);
  }
  async addEntryPoint(id) {
    if (this.index.filedById(id) === void 0) {
      new import_obsidian5.Notice(`Card ${id} is not available in Deck.`);
      return;
    }
    if (this.state.entryPoints.some((entry) => entry.id === id)) {
      new import_obsidian5.Notice(`${id} is already an entry point.`);
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
    new import_obsidian5.Notice(`Added entry point \u201C${name}\u201D.`);
  }
  async createNewSection() {
    try {
      this.index.refresh();
      const id = generateNextSectionId(this.index.snapshot.allValidIds);
      const file = await this.createCardFile(id);
      this.openMarkdownFile(file);
      this.queueIndexRefresh();
    } catch (error) {
      new import_obsidian5.Notice(`Could not create a section: ${errorMessage3(error)}`);
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
      await this.refreshViews();
      new import_obsidian5.Notice(`Filed ${file.basename} as ${newId}.`);
      return newId;
    } catch (error) {
      new import_obsidian5.Notice(`Could not file the card: ${errorMessage3(error)}`);
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
      id: "open-desk",
      name: "Open Desk",
      callback: () => void this.openDesk()
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
    this.addCommand({
      id: "put-current-card-on-desk",
      name: "Put current card on Desk",
      checkCallback: (checking) => {
        const file = this.currentCardFile();
        const available = file !== null && !this.state.deskCards.some(
          (card) => card.cardRef === file.path
        );
        if (checking) {
          return available;
        }
        if (available && file !== null) {
          void this.putFileOnDesk(file);
        }
        return available;
      }
    });
    this.addCommand({
      id: "add-bookmark-current-card",
      name: "Add bookmark to current card",
      checkCallback: (checking) => {
        const id = this.currentFiledId();
        const available = id !== null && this.bookmarkAt(id) === void 0;
        if (checking) {
          return available;
        }
        if (available && id !== null) {
          void this.addBookmark(id);
        }
        return available;
      }
    });
    this.addCommand({
      id: "history-back",
      name: "Back",
      checkCallback: (checking) => {
        const view = this.currentDeckView();
        const available = view?.canGoBack ?? false;
        if (checking) {
          return available;
        }
        if (available && view !== null) {
          void view.goBack();
        }
        return available;
      }
    });
    this.addCommand({
      id: "history-forward",
      name: "Forward",
      checkCallback: (checking) => {
        const view = this.currentDeckView();
        const available = view?.canGoForward ?? false;
        if (checking) {
          return available;
        }
        if (available && view !== null) {
          void view.goForward();
        }
        return available;
      }
    });
  }
  async createNewCard() {
    try {
      const placeOnDesk = this.app.workspace.getActiveViewOfType(DeskView) !== null;
      const file = await this.createCardFile(null);
      if (placeOnDesk) {
        this.state = {
          ...this.state,
          deskCards: addDeskCard(
            this.state.deskCards,
            file.path,
            this.nextDeskPosition()
          )
        };
        await this.persistState();
      }
      this.openMarkdownFile(file);
      this.queueIndexRefresh();
    } catch (error) {
      new import_obsidian5.Notice(`Could not create a card: ${errorMessage3(error)}`);
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
      new import_obsidian5.Notice(`${file.basename} is now an unfiled card.`);
    } catch (error) {
      new import_obsidian5.Notice(`Could not make this note a card: ${errorMessage3(error)}`);
    }
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
      path = (0, import_obsidian5.normalizePath)(`${prefix}${basename}${suffix}.md`);
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
  currentFiledId() {
    const deckId = this.app.workspace.getActiveViewOfType(DeckView)?.activeCard?.id;
    if (deckId !== void 0) {
      return deckId;
    }
    const activeFile = this.app.workspace.getActiveFile();
    return activeFile === null ? null : this.index.filedByFile(activeFile)?.id ?? null;
  }
  currentCardFile() {
    const deckFile = this.app.workspace.getActiveViewOfType(DeckView)?.activeCard?.file;
    if (deckFile !== void 0) {
      return deckFile;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile === null) {
      return null;
    }
    const state = this.cardMetadataState(activeFile);
    return state === "filed" || state === "unfiled" ? activeFile : null;
  }
  async removeBookmark(zettelId) {
    if (this.bookmarkAt(zettelId) === void 0) {
      return;
    }
    this.state = {
      ...this.state,
      bookmarks: deleteBookmark(this.state.bookmarks, zettelId)
    };
    await this.persistStateAndRefreshViews();
    new import_obsidian5.Notice(`Deleted bookmark at ${zettelId}.`);
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
    new import_obsidian5.Notice(`Deleted entry point \u201C${removed.name}\u201D.`);
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
    await this.refreshViews();
  }
  async refreshViews() {
    const refreshes = this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE).flatMap(
      (leaf) => leaf.view instanceof DeckView ? [leaf.view.refresh()] : []
    );
    refreshes.push(
      ...this.app.workspace.getLeavesOfType(DESK_VIEW_TYPE).flatMap(
        (leaf) => leaf.view instanceof DeskView ? [leaf.view.refresh()] : []
      )
    );
    await Promise.all(refreshes);
  }
  async persistStateAndRefreshViews() {
    await this.persistState();
    await this.refreshViews();
  }
  async persistState() {
    try {
      await this.saveData(this.state);
    } catch (error) {
      new import_obsidian5.Notice(`Could not save Zettelkasten state: ${errorMessage3(error)}`);
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
  nextDeskPosition() {
    const index = this.state.deskCards.length;
    return {
      x: 90 + index % 4 * 110,
      y: 90 + Math.floor(index / 4) % 4 * 90
    };
  }
  handleDeletedFile(file) {
    const prefix = `${file.path.replace(/\/$/, "")}/`;
    if (this.state.deskCards.some(
      (card) => card.cardRef === file.path || card.cardRef.startsWith(prefix)
    )) {
      this.state = {
        ...this.state,
        deskCards: removeDeskPath(this.state.deskCards, file.path)
      };
      void this.persistState();
    }
    this.queueIndexRefresh();
  }
  handleRenamedFile(file, oldPath) {
    const prefix = `${oldPath.replace(/\/$/, "")}/`;
    if (this.state.deskCards.some(
      (card) => card.cardRef === oldPath || card.cardRef.startsWith(prefix)
    )) {
      this.state = {
        ...this.state,
        deskCards: renameDeskCard(this.state.deskCards, oldPath, file.path)
      };
      void this.persistState();
    }
    this.queueIndexRefresh();
  }
};
function errorMessage3(error) {
  return error instanceof Error ? error.message : String(error);
}
