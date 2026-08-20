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
  default: () => SlipboxPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian8 = require("obsidian");

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
    throw new ZettelIdError(`Invalid Slipbox address: ${JSON.stringify(id)}`);
  }
  const sectionText = match[1];
  const pathText = match[2];
  if (sectionText === void 0 || pathText === void 0) {
    throw new ZettelIdError(`Invalid Slipbox address: ${JSON.stringify(id)}`);
  }
  const section = parsePositiveInteger(sectionText, "Section");
  const tokenTexts = pathText.match(PATH_TOKEN_PATTERN);
  if (tokenTexts === null || tokenTexts.length === 0) {
    throw new ZettelIdError(`Invalid Slipbox path: ${JSON.stringify(pathText)}`);
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
    throw new ZettelIdError("A Slipbox path must contain at least one token");
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
    throw new ZettelIdError("A Slipbox path must not be empty");
  }
  path[path.length - 1] = lastToken.type === "number" ? numericToken(incrementNumericValue(lastToken.value)) : alphaToken(incrementAlphaToken(lastToken.value));
  return withPath(id.section, path);
}
function firstAvailableChild(attachment, existingIds) {
  const lastToken = attachment.path[attachment.path.length - 1];
  if (lastToken === void 0) {
    throw new ZettelIdError("A Slipbox path must not be empty");
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
var import_obsidian3 = require("obsidian");

// src/deck-motion.ts
var DEFAULT_ACTIVE_HYSTERESIS = 0.06;
function cardStackOrder(cardIndex, activeIndex) {
  return cardIndex === activeIndex ? 220 : 100 - Math.abs(cardIndex - activeIndex);
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

// src/card-footer.ts
var import_obsidian = require("obsidian");

// src/backlinks.ts
function indexFiledBacklinks(filed, resolvedLinks) {
  const filedByPath = new Map(filed.map((card) => [card.path, card]));
  const sourcesByTarget = /* @__PURE__ */ new Map();
  for (const [sourcePath, destinations] of Object.entries(resolvedLinks)) {
    const source = filedByPath.get(sourcePath);
    if (source === void 0) {
      continue;
    }
    for (const [targetPath, count] of Object.entries(destinations)) {
      if (count <= 0 || sourcePath === targetPath || !filedByPath.has(targetPath)) {
        continue;
      }
      const sources = sourcesByTarget.get(targetPath) ?? [];
      sources.push(source);
      sourcesByTarget.set(targetPath, sources);
    }
  }
  for (const sources of sourcesByTarget.values()) {
    sources.sort((left, right) => compareZettelIds(left.id, right.id));
  }
  return sourcesByTarget;
}
function fitBacklinkPrefix(availableWidth, itemWidths, separatorWidth, overflowWidth) {
  const widths = itemWidths.map((width) => Math.max(0, width));
  const available = Math.max(0, availableWidth);
  const separator = Math.max(0, separatorWidth);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + separator * Math.max(0, widths.length - 1);
  if (totalWidth <= available) {
    return { visibleCount: widths.length, hiddenCount: 0 };
  }
  let prefixWidth = totalWidth;
  for (let visibleCount = widths.length - 1; visibleCount >= 0; visibleCount -= 1) {
    const removedIndex = visibleCount;
    const removedWidth = widths[removedIndex] ?? 0;
    prefixWidth -= removedWidth;
    if (visibleCount > 0) {
      prefixWidth -= separator;
    }
    const hiddenCount = widths.length - visibleCount;
    const widthWithOverflow = prefixWidth + (visibleCount > 0 ? separator : 0) + Math.max(0, overflowWidth(hiddenCount));
    if (widthWithOverflow <= available) {
      return { visibleCount, hiddenCount };
    }
  }
  return { visibleCount: 0, hiddenCount: widths.length };
}

// src/card-footer.ts
var CardFooterManager = class {
  constructor(environment) {
    this.environment = environment;
    this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
  }
  entries = /* @__PURE__ */ new Set();
  resizeObserver;
  layoutFrame = null;
  layoutTimer = null;
  overflowMenu = null;
  overflowEntry = null;
  render(parent, options) {
    const footer = parent.createDiv({ cls: "slipbox-card-footer" });
    const entry = {
      ...options,
      footer,
      content: null,
      measureItems: [],
      measureSeparator: null,
      measureOverflow: null,
      interactive: options.interactive,
      fitKey: null
    };
    if (options.backlinks.length > 0) {
      footer.createSpan({
        cls: "slipbox-card-footer-icon",
        text: "\u21A9",
        attr: { "aria-hidden": "true" }
      });
      const content = footer.createDiv({ cls: "slipbox-card-footer-content" });
      const measure = footer.createDiv({
        cls: "slipbox-card-footer-measure",
        attr: { "aria-hidden": "true" }
      });
      const measureItems = options.backlinks.map(
        (backlink) => measure.createSpan({
          cls: "slipbox-card-backlink",
          text: backlink.id
        })
      );
      const measureSeparator = measure.createSpan({
        cls: "slipbox-card-backlink-separator",
        text: "\xB7"
      });
      const measureOverflow = measure.createEl("button", {
        cls: "slipbox-card-backlink-overflow",
        text: "+1",
        attr: { type: "button", tabindex: "-1" }
      });
      Object.assign(entry, {
        content,
        measureItems,
        measureSeparator,
        measureOverflow
      });
    }
    this.entries.add(entry);
    this.applyInteractiveState(entry);
    this.resizeObserver.observe(footer);
    this.scheduleLayout();
    return footer;
  }
  setInteractive(card, interactive) {
    const footer = card.querySelector(".slipbox-card-footer");
    if (footer === null) {
      return;
    }
    const entry = [...this.entries].find((candidate) => candidate.footer === footer);
    if (entry === void 0 || entry.interactive === interactive) {
      return;
    }
    entry.interactive = interactive;
    this.applyInteractiveState(entry);
    if (!interactive && this.overflowEntry === entry) {
      this.closeOverflowMenu();
    }
  }
  scheduleLayout() {
    if (this.layoutFrame !== null || this.layoutTimer !== null) {
      return;
    }
    this.layoutFrame = window.requestAnimationFrame(() => {
      this.flushLayout();
    });
    this.layoutTimer = window.setTimeout(() => this.flushLayout(), 120);
  }
  clear() {
    this.closeOverflowMenu();
    this.resizeObserver.disconnect();
    this.entries.clear();
    if (this.layoutFrame !== null) {
      window.cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = null;
    }
    if (this.layoutTimer !== null) {
      window.clearTimeout(this.layoutTimer);
      this.layoutTimer = null;
    }
  }
  flushLayout() {
    if (this.layoutFrame !== null) {
      window.cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = null;
    }
    if (this.layoutTimer !== null) {
      window.clearTimeout(this.layoutTimer);
      this.layoutTimer = null;
    }
    for (const entry of this.entries) {
      this.layout(entry);
    }
  }
  layout(entry) {
    const {
      content,
      measureItems,
      measureSeparator,
      measureOverflow
    } = entry;
    if (content === null || measureSeparator === null || measureOverflow === null || content.clientWidth <= 0) {
      return;
    }
    const fit = fitBacklinkPrefix(
      content.clientWidth,
      measureItems.map((item) => item.getBoundingClientRect().width),
      measureSeparator.getBoundingClientRect().width,
      (hiddenCount) => {
        measureOverflow.setText(`+${hiddenCount}`);
        return measureOverflow.getBoundingClientRect().width;
      }
    );
    const fitKey = `${fit.visibleCount}:${fit.hiddenCount}`;
    if (entry.fitKey === fitKey) {
      return;
    }
    entry.fitKey = fitKey;
    content.empty();
    for (let index = 0; index < fit.visibleCount; index += 1) {
      const backlink = entry.backlinks[index];
      if (backlink === void 0) {
        continue;
      }
      if (index > 0) {
        this.createSeparator(content);
      }
      this.createBacklinkAnchor(content, entry, backlink, true);
    }
    if (fit.hiddenCount > 0) {
      if (fit.visibleCount > 0) {
        this.createSeparator(content);
      }
      const overflow = content.createEl("button", {
        cls: "slipbox-card-backlink-overflow",
        text: `+${fit.hiddenCount}`,
        attr: {
          type: "button",
          "aria-label": `Show ${fit.hiddenCount} more backlink${fit.hiddenCount === 1 ? "" : "s"}`
        }
      });
      overflow.addEventListener("pointerdown", (event) => event.stopPropagation());
      overflow.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (entry.interactive) {
          this.showOverflowMenu(entry, overflow, fit.visibleCount);
        }
      });
    }
    this.applyInteractiveState(entry);
  }
  createSeparator(parent) {
    parent.createSpan({
      cls: "slipbox-card-backlink-separator",
      text: "\xB7",
      attr: { "aria-hidden": "true" }
    });
  }
  createBacklinkAnchor(parent, entry, backlink, tabbable) {
    const linktext = this.environment.app.metadataCache.fileToLinktext(
      backlink.file,
      entry.sourcePath
    );
    const anchor = document.createElement("a");
    anchor.className = "internal-link slipbox-card-backlink";
    anchor.textContent = backlink.id;
    anchor.href = linktext;
    anchor.dataset.href = linktext;
    anchor.draggable = false;
    anchor.setAttribute("aria-label", `Backlink from Zettel ${backlink.id}`);
    anchor.tabIndex = tabbable && entry.interactive ? 0 : -1;
    parent.append(anchor);
    anchor.addEventListener("mouseover", (event) => {
      if (!entry.interactive) {
        return;
      }
      this.environment.app.workspace.trigger("hover-link", {
        event,
        source: this.environment.hoverSource,
        hoverParent: this.environment.leaf,
        targetEl: anchor,
        linktext,
        sourcePath: entry.sourcePath
      });
    });
    anchor.addEventListener("pointerdown", (event) => event.stopPropagation());
    anchor.addEventListener("click", (event) => {
      this.activate(entry, backlink, linktext, event);
    });
    anchor.addEventListener("auxclick", (event) => {
      if (event.button === 1) {
        this.activate(entry, backlink, linktext, event);
      }
    });
    anchor.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (entry.interactive) {
        this.showBacklinkContextMenu(event, backlink);
      }
    });
    return anchor;
  }
  activate(entry, backlink, linktext, event) {
    event.preventDefault();
    event.stopPropagation();
    if (!entry.interactive) {
      return;
    }
    const newLeaf = import_obsidian.Keymap.isModEvent(event);
    if (newLeaf) {
      void this.environment.app.workspace.openLinkText(
        linktext,
        entry.sourcePath,
        newLeaf
      );
      return;
    }
    this.closeOverflowMenu();
    void entry.activate(backlink);
  }
  showOverflowMenu(entry, button, visibleCount) {
    this.closeOverflowMenu();
    const menu = new import_obsidian.Menu().setUseNativeMenu(false);
    for (const backlink of entry.backlinks.slice(visibleCount)) {
      menu.addItem((item) => {
        const title = document.createDocumentFragment();
        const anchor = this.createBacklinkAnchor(title, entry, backlink, false);
        anchor.addEventListener("contextmenu", () => menu.hide());
        item.setTitle(title).onClick((event) => {
          const linktext = this.environment.app.metadataCache.fileToLinktext(
            backlink.file,
            entry.sourcePath
          );
          this.activate(entry, backlink, linktext, event);
        });
      });
    }
    this.overflowMenu = menu;
    this.overflowEntry = entry;
    menu.onHide(() => {
      if (this.overflowMenu === menu) {
        this.overflowMenu = null;
        this.overflowEntry = null;
      }
    });
    const rect = button.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom, overlap: true });
  }
  showBacklinkContextMenu(event, backlink) {
    this.closeOverflowMenu();
    const onDesk = this.environment.isOnDesk(backlink.file);
    const menu = import_obsidian.Menu.forEvent(event);
    menu.addItem((item) => {
      item.setTitle(onDesk ? "On Desk" : "Put on Desk").setIcon("panels-top-left").setDisabled(onDesk).onClick(() => void this.environment.putOnDesk(backlink.file));
    });
    this.environment.app.workspace.trigger(
      "file-menu",
      menu,
      backlink.file,
      this.environment.hoverSource,
      this.environment.leaf
    );
    menu.showAtMouseEvent(event);
  }
  applyInteractiveState(entry) {
    entry.footer.toggleClass("is-interactive", entry.interactive);
    entry.footer.querySelectorAll(".slipbox-card-backlink").forEach((anchor) => {
      anchor.tabIndex = entry.interactive ? 0 : -1;
      anchor.setAttr("aria-disabled", String(!entry.interactive));
    });
    entry.footer.querySelectorAll(".slipbox-card-backlink-overflow").forEach((button) => {
      if (!button.closest(".slipbox-card-footer-measure")) {
        button.disabled = !entry.interactive;
        button.tabIndex = entry.interactive ? 0 : -1;
      }
    });
  }
  closeOverflowMenu() {
    const menu = this.overflowMenu;
    this.overflowMenu = null;
    this.overflowEntry = null;
    menu?.hide();
  }
};

// src/deck-actions.ts
function canRunDeckAction(action, context) {
  switch (action) {
    case "previous-card":
      return context.hasPreviousCard;
    case "next-card":
      return context.hasNextCard;
    case "centre-card":
    case "open-note":
    case "add-card":
    case "toggle-tray":
    case "toggle-desk":
    case "toggle-bookmark":
      return context.hasActiveCard;
    case "first-card":
    case "last-card":
      return context.hasActiveCard;
    case "back":
      return context.canGoBack;
    case "forward":
      return context.canGoForward;
    case "problems":
      return context.hasProblems;
    case "file-here":
      return context.filing && context.hasActiveCard;
    case "cancel-filing":
      return context.filing;
    case "entry-points":
    case "bookmarks":
    case "open-desk":
    case "new-section":
      return true;
  }
}

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

// src/settings.ts
var SLIPBOX_DATA_SCHEMA_VERSION = 1;
var binding = (key, modifiers = []) => ({ key, modifiers });
var DECK_ACTION_DEFINITIONS = [
  {
    id: "previous-card",
    label: "Previous card",
    repeatable: true,
    defaultBindings: [binding("ArrowLeft"), binding("k")]
  },
  {
    id: "next-card",
    label: "Next card",
    repeatable: true,
    defaultBindings: [binding("ArrowRight"), binding("j")]
  },
  {
    id: "centre-card",
    label: "Centre active card",
    repeatable: false,
    defaultBindings: [binding("c")]
  },
  {
    id: "first-card",
    label: "First card",
    repeatable: false,
    defaultBindings: [binding("g")]
  },
  {
    id: "last-card",
    label: "Last card",
    repeatable: false,
    defaultBindings: [binding("g", ["Shift"])]
  },
  {
    id: "open-note",
    label: "Open Markdown note",
    repeatable: false,
    defaultBindings: [binding("o")]
  },
  {
    id: "add-card",
    label: "Add card from here",
    repeatable: false,
    defaultBindings: [binding("a")]
  },
  {
    id: "toggle-tray",
    label: "Pull into or return from Tray",
    repeatable: false,
    defaultBindings: [binding("p")]
  },
  {
    id: "toggle-desk",
    label: "Toggle Desk membership",
    repeatable: false,
    defaultBindings: [binding("d")]
  },
  {
    id: "toggle-bookmark",
    label: "Toggle bookmark",
    repeatable: false,
    defaultBindings: [binding("b")]
  },
  { id: "back", label: "Back", repeatable: false, defaultBindings: [] },
  { id: "forward", label: "Forward", repeatable: false, defaultBindings: [] },
  {
    id: "entry-points",
    label: "Manage entry points",
    repeatable: false,
    defaultBindings: []
  },
  {
    id: "bookmarks",
    label: "Manage bookmarks",
    repeatable: false,
    defaultBindings: []
  },
  { id: "open-desk", label: "Open Desk", repeatable: false, defaultBindings: [] },
  {
    id: "problems",
    label: "Show card problems",
    repeatable: false,
    defaultBindings: []
  },
  {
    id: "new-section",
    label: "New section",
    repeatable: false,
    defaultBindings: []
  },
  {
    id: "file-here",
    label: "File here",
    repeatable: false,
    defaultBindings: []
  },
  {
    id: "cancel-filing",
    label: "Cancel filing",
    repeatable: false,
    defaultBindings: []
  }
];
var DECK_ACTION_IDS = DECK_ACTION_DEFINITIONS.map(
  (definition) => definition.id
);
var DEFAULT_DECK_HEADER_BUTTONS = {
  "add-card": true,
  "open-note": true,
  tray: true,
  desk: true,
  bookmark: true
};
var DEFAULT_DESK_HEADER_BUTTONS = {
  "file-card": true,
  "open-note": true,
  remove: true
};
var DEFAULT_DECK_KEYBINDINGS = Object.fromEntries(
  DECK_ACTION_DEFINITIONS.map((definition) => [
    definition.id,
    definition.defaultBindings
  ])
);
var DEFAULT_SETTINGS = {
  addressProperty: "zettel-id",
  titleSource: "filename",
  titleProperty: "title",
  newCardFolder: "",
  newNoteTimestampFormat: "YYYYMMDDTHHmmss",
  useTemplatesForNewNotes: false,
  newNoteTemplatePath: "",
  showTitleInDeck: false,
  showTitleInDesk: true,
  deckHeaderButtons: DEFAULT_DECK_HEADER_BUTTONS,
  deskHeaderButtons: DEFAULT_DESK_HEADER_BUTTONS,
  deckKeybindings: DEFAULT_DECK_KEYBINDINGS
};
var MODIFIER_ORDER = ["Mod", "Ctrl", "Meta", "Alt", "Shift"];
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}
function normalizePropertyName(value, fallback) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}
function normalizeFolderPath(value) {
  if (typeof value !== "string") {
    return "";
  }
  const segments = value.trim().replace(/\\/g, "/").split("/").filter((segment) => segment !== "");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return "";
  }
  return segments.join("/");
}
function normalizeKeyBinding(value) {
  if (!isRecord3(value) || typeof value.key !== "string" || value.key === "") {
    return null;
  }
  const key = value.key.length === 1 ? value.key.toLowerCase() : value.key;
  const supplied = Array.isArray(value.modifiers) ? value.modifiers : [];
  const modifiers = MODIFIER_ORDER.filter((modifier) => supplied.includes(modifier));
  return { key, modifiers };
}
function keyBindingSignature(bindingValue) {
  return `${bindingValue.modifiers.join("+")}::${bindingValue.key}`;
}
function formatKeyBinding(bindingValue) {
  const key = bindingValue.key === " " ? "Space" : bindingValue.key;
  return [...bindingValue.modifiers, key].join("+");
}
function normalizeDeckKeybindings(value) {
  const source = isRecord3(value) ? value : {};
  const claimed = /* @__PURE__ */ new Set();
  const result = {};
  for (const definition of DECK_ACTION_DEFINITIONS) {
    const candidate = source[definition.id];
    const rawBindings = Array.isArray(candidate) ? candidate : definition.defaultBindings;
    const normalized = [];
    for (const rawBinding of rawBindings) {
      const normalizedBinding = normalizeKeyBinding(rawBinding);
      if (normalizedBinding === null) {
        continue;
      }
      const signature = keyBindingSignature(normalizedBinding);
      if (claimed.has(signature)) {
        continue;
      }
      claimed.add(signature);
      normalized.push(normalizedBinding);
    }
    result[definition.id] = normalized;
  }
  return result;
}
function normalizeBooleanRecord(value, defaults) {
  const source = isRecord3(value) ? value : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      typeof source[key] === "boolean" ? source[key] : fallback
    ])
  );
}
function normalizeSettings(value) {
  const source = isRecord3(value) ? value : {};
  return {
    addressProperty: normalizePropertyName(
      source.addressProperty,
      DEFAULT_SETTINGS.addressProperty
    ),
    titleSource: source.titleSource === "frontmatter" ? "frontmatter" : "filename",
    titleProperty: normalizePropertyName(
      source.titleProperty,
      DEFAULT_SETTINGS.titleProperty
    ),
    newCardFolder: normalizeFolderPath(source.newCardFolder),
    newNoteTimestampFormat: normalizePropertyName(
      source.newNoteTimestampFormat,
      DEFAULT_SETTINGS.newNoteTimestampFormat
    ),
    useTemplatesForNewNotes: typeof source.useTemplatesForNewNotes === "boolean" ? source.useTemplatesForNewNotes : DEFAULT_SETTINGS.useTemplatesForNewNotes,
    newNoteTemplatePath: typeof source.newNoteTemplatePath === "string" ? source.newNoteTemplatePath.trim() : DEFAULT_SETTINGS.newNoteTemplatePath,
    showTitleInDeck: typeof source.showTitleInDeck === "boolean" ? source.showTitleInDeck : DEFAULT_SETTINGS.showTitleInDeck,
    showTitleInDesk: typeof source.showTitleInDesk === "boolean" ? source.showTitleInDesk : DEFAULT_SETTINGS.showTitleInDesk,
    deckHeaderButtons: normalizeBooleanRecord(
      source.deckHeaderButtons,
      DEFAULT_DECK_HEADER_BUTTONS
    ),
    deskHeaderButtons: normalizeBooleanRecord(
      source.deskHeaderButtons,
      DEFAULT_DESK_HEADER_BUTTONS
    ),
    deckKeybindings: normalizeDeckKeybindings(source.deckKeybindings)
  };
}
function keyBindingConflict(keybindings, action, bindingValue) {
  const signature = keyBindingSignature(bindingValue);
  for (const definition of DECK_ACTION_DEFINITIONS) {
    if (definition.id !== action && keybindings[definition.id].some(
      (candidate) => keyBindingSignature(candidate) === signature
    )) {
      return definition.id;
    }
  }
  return null;
}

// src/plugin-state.ts
var DEFAULT_SPREAD = 0.58;
var MIN_SPREAD = 0.18;
var MAX_SPREAD = 1.12;
var DEFAULT_STATE = {
  entryPoints: [],
  bookmarks: [],
  deskCards: [],
  spread: DEFAULT_SPREAD
};
var DEFAULT_DATA = {
  schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
  settings: DEFAULT_SETTINGS,
  state: DEFAULT_STATE
};
function isRecord4(value) {
  return typeof value === "object" && value !== null;
}
function normalizePluginState(value) {
  if (!isRecord4(value)) {
    return DEFAULT_STATE;
  }
  const entryPoints = Array.isArray(value.entryPoints) ? value.entryPoints.flatMap((entry) => {
    if (!isRecord4(entry) || typeof entry.name !== "string" || entry.name.trim() === "" || typeof entry.id !== "string" || !isValidZettelId(entry.id)) {
      return [];
    }
    return [{ name: entry.name.trim(), id: entry.id }];
  }) : [];
  const rawSpread = typeof value.spread === "number" && Number.isFinite(value.spread) ? value.spread : DEFAULT_SPREAD;
  return {
    entryPoints,
    bookmarks: normalizeBookmarks(value.bookmarks),
    deskCards: normalizeDeskCards(value.deskCards),
    spread: Math.min(MAX_SPREAD, Math.max(MIN_SPREAD, rawSpread))
  };
}
function normalizePluginData(value) {
  if (!isRecord4(value)) {
    return DEFAULT_DATA;
  }
  const versioned = isRecord4(value.state) || isRecord4(value.settings);
  return {
    schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
    settings: normalizeSettings(versioned ? value.settings : void 0),
    state: normalizePluginState(versioned ? value.state : value)
  };
}

// src/tray-view.ts
var import_obsidian2 = require("obsidian");

// src/tray-state.ts
var EMPTY_TRAY = {
  piles: [],
  expandedPileId: null,
  unfiledPileId: null
};
function createPile(state, pileId, cards, pileIndex = state.piles.length) {
  if (pileId === "" || state.piles.some((pile) => pile.id === pileId)) {
    return state;
  }
  const occupied = new Set(allTrayCardRefs(state));
  const unique = [];
  for (const card of cards) {
    if (card.cardRef !== "" && !occupied.has(card.cardRef)) {
      occupied.add(card.cardRef);
      unique.push(card);
    }
  }
  if (unique.length === 0) {
    return state;
  }
  const piles = [...state.piles];
  piles.splice(clampIndex(pileIndex, piles.length + 1), 0, {
    id: pileId,
    cards: unique
  });
  return cleanTray({ ...state, piles });
}
function addUniqueCardToPile(state, pileId, card, cardIndex = Number.POSITIVE_INFINITY) {
  if (card.cardRef === "" || trayContains(state, card.cardRef)) {
    return state;
  }
  const pileIndex = state.piles.findIndex((pile) => pile.id === pileId);
  if (pileIndex < 0) {
    return state;
  }
  const piles = [...state.piles];
  const cards = [...piles[pileIndex].cards];
  cards.splice(clampIndex(cardIndex, cards.length + 1), 0, card);
  piles[pileIndex] = { ...piles[pileIndex], cards };
  return cleanTray({ ...state, piles });
}
function removeCard(state, cardRef) {
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.filter((card) => card.cardRef !== cardRef)
    }))
  });
}
function moveCardWithinPile(state, pileId, fromIndex, toIndex) {
  const pileIndex = state.piles.findIndex((pile2) => pile2.id === pileId);
  const pile = state.piles[pileIndex];
  if (pile === void 0 || fromIndex < 0 || fromIndex >= pile.cards.length || pile.cards.length < 2) {
    return state;
  }
  const cards = [...pile.cards];
  const [card] = cards.splice(fromIndex, 1);
  if (card === void 0) {
    return state;
  }
  cards.splice(clampIndex(toIndex, cards.length + 1), 0, card);
  const piles = [...state.piles];
  piles[pileIndex] = { ...pile, cards };
  return cleanTray({ ...state, piles });
}
function moveCardBetweenPiles(state, cardRef, targetPileId, targetIndex = Number.POSITIVE_INFINITY) {
  const source = cardPosition(state, cardRef);
  const targetPile = state.piles.find((pile) => pile.id === targetPileId);
  if (source === null || targetPile === void 0) {
    return state;
  }
  if (source.pileId === targetPileId) {
    return moveCardWithinPile(
      state,
      source.pileId,
      source.cardIndex,
      targetIndex
    );
  }
  const card = state.piles[source.pileIndex].cards[source.cardIndex];
  if (card === void 0) {
    return state;
  }
  let next = removeCard(state, cardRef);
  next = addUniqueCardToPile(next, targetPileId, card, targetIndex);
  return next;
}
function splitCardIntoNewPile(state, cardRef, newPileId, pileIndex) {
  const source = cardPosition(state, cardRef);
  if (source === null || newPileId === "" || state.piles.some((pile) => pile.id === newPileId)) {
    return state;
  }
  const card = state.piles[source.pileIndex].cards[source.cardIndex];
  if (card === void 0) {
    return state;
  }
  const sourcePileId = source.pileId;
  const insertAt = pileIndex ?? source.pileIndex + 1;
  const withoutCard = removeCard(state, cardRef);
  const adjustedIndex = state.piles[source.pileIndex].cards.length === 1 && insertAt > source.pileIndex ? insertAt - 1 : insertAt;
  const next = createPile(withoutCard, newPileId, [card], adjustedIndex);
  return sourcePileId === state.unfiledPileId && !next.piles.some((pile) => pile.id === sourcePileId) ? { ...next, unfiledPileId: null } : next;
}
function mergePiles(state, sourcePileId, targetPileId) {
  if (sourcePileId === targetPileId) {
    return state;
  }
  const sourceIndex = state.piles.findIndex((pile) => pile.id === sourcePileId);
  const targetIndex = state.piles.findIndex((pile) => pile.id === targetPileId);
  const source = state.piles[sourceIndex];
  const target = state.piles[targetIndex];
  if (source === void 0 || target === void 0) {
    return state;
  }
  const piles = state.piles.flatMap((pile) => {
    if (pile.id === sourcePileId) {
      return [];
    }
    if (pile.id === targetPileId) {
      return [{ ...pile, cards: [...pile.cards, ...source.cards] }];
    }
    return [pile];
  });
  return cleanTray({
    ...state,
    piles,
    expandedPileId: state.expandedPileId === sourcePileId ? targetPileId : state.expandedPileId,
    unfiledPileId: state.unfiledPileId === sourcePileId ? null : state.unfiledPileId
  });
}
function reorderPiles(state, fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= state.piles.length || state.piles.length < 2) {
    return state;
  }
  const piles = [...state.piles];
  const [pile] = piles.splice(fromIndex, 1);
  if (pile === void 0) {
    return state;
  }
  piles.splice(clampIndex(toIndex, piles.length + 1), 0, pile);
  return cleanTray({ ...state, piles });
}
function clearFiledCardsFromPile(state, pileId) {
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => pile.id === pileId ? { ...pile, cards: pile.cards.filter((card) => card.kind === "unfiled") } : pile)
  });
}
function clearFiledCardsFromTray(state) {
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.filter((card) => card.kind === "unfiled")
    }))
  });
}
function renameTrayPath(state, oldPath, newPath) {
  const prefix = `${oldPath.replace(/\/$/, "")}/`;
  const seen = /* @__PURE__ */ new Set();
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.flatMap((card) => {
        const cardRef = card.cardRef === oldPath ? newPath : card.cardRef.startsWith(prefix) ? `${newPath.replace(/\/$/, "")}/${card.cardRef.slice(prefix.length)}` : card.cardRef;
        if (cardRef === "" || seen.has(cardRef)) {
          return [];
        }
        seen.add(cardRef);
        return [{ ...card, cardRef }];
      })
    }))
  });
}
function removeTrayPath(state, path) {
  const prefix = `${path.replace(/\/$/, "")}/`;
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.filter(
        (card) => card.cardRef !== path && !card.cardRef.startsWith(prefix)
      )
    }))
  });
}
function pruneTrayCards(state, eligibleCards) {
  const eligible = new Map(
    eligibleCards.filter((card) => card.cardRef !== "").map((card) => [card.cardRef, card.kind])
  );
  const seen = /* @__PURE__ */ new Set();
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.flatMap((card) => {
        const kind = eligible.get(card.cardRef);
        if (kind === void 0 || seen.has(card.cardRef) || card.kind === "unfiled" && kind === "filed") {
          return [];
        }
        seen.add(card.cardRef);
        return [{ cardRef: card.cardRef, kind }];
      })
    }))
  });
}
function reconcileTray(state, candidates, newUnfiledPileId) {
  const eligible = uniqueCandidates(candidates);
  let next = pruneTrayCards(state, eligible);
  const present = new Set(allTrayCardRefs(next));
  const missing = eligible.filter((card) => card.kind === "unfiled" && !present.has(card.cardRef)).sort(compareInitialCards).map(({ cardRef, kind }) => ({ cardRef, kind }));
  if (missing.length === 0) {
    return next;
  }
  const home = next.unfiledPileId === null ? void 0 : next.piles.find((pile) => pile.id === next.unfiledPileId);
  if (home !== void 0) {
    const piles = next.piles.map((pile) => pile.id === home.id ? { ...pile, cards: [...missing, ...pile.cards] } : pile);
    return cleanTray({ ...next, piles });
  }
  next = createPile(next, newUnfiledPileId, missing);
  return next.piles.some((pile) => pile.id === newUnfiledPileId) ? { ...next, unfiledPileId: newUnfiledPileId } : next;
}
function toggleFiledCard(state, card, newPileId) {
  if (card.kind !== "filed") {
    return state;
  }
  if (trayContains(state, card.cardRef)) {
    return removeCard(state, card.cardRef);
  }
  const expanded = state.expandedPileId === null ? void 0 : state.piles.find((pile) => pile.id === state.expandedPileId);
  return expanded === void 0 ? createPile(state, newPileId, [card]) : addUniqueCardToPile(state, expanded.id, card);
}
function setExpandedPile(state, pileId) {
  return {
    ...state,
    expandedPileId: pileId !== null && state.piles.some((pile) => pile.id === pileId) ? pileId : null
  };
}
function trayContains(state, cardRef) {
  return state.piles.some((pile) => pile.cards.some((card) => card.cardRef === cardRef));
}
function cardPosition(state, cardRef) {
  for (let pileIndex = 0; pileIndex < state.piles.length; pileIndex += 1) {
    const pile = state.piles[pileIndex];
    if (pile === void 0) {
      continue;
    }
    const cardIndex = pile.cards.findIndex((card) => card.cardRef === cardRef);
    if (cardIndex >= 0) {
      return { pileId: pile.id, pileIndex, cardIndex, pileSize: pile.cards.length };
    }
  }
  return null;
}
function insertionIndexForPoint(point, itemCentres) {
  return itemCentres.findIndex((centre) => point < centre) < 0 ? itemCentres.length : itemCentres.findIndex((centre) => point < centre);
}
function cleanTray(state) {
  const piles = state.piles.filter((pile) => pile.cards.length > 0);
  const ids = new Set(piles.map((pile) => pile.id));
  return {
    piles,
    expandedPileId: state.expandedPileId !== null && ids.has(state.expandedPileId) ? state.expandedPileId : null,
    unfiledPileId: state.unfiledPileId !== null && ids.has(state.unfiledPileId) ? state.unfiledPileId : null
  };
}
function allTrayCardRefs(state) {
  return state.piles.flatMap((pile) => pile.cards.map((card) => card.cardRef));
}
function clampIndex(index, length) {
  if (!Number.isFinite(index)) {
    return index < 0 ? 0 : Math.max(0, length - 1);
  }
  return Math.max(0, Math.min(Math.max(0, length - 1), Math.trunc(index)));
}
function uniqueCandidates(candidates) {
  const seen = /* @__PURE__ */ new Set();
  return candidates.filter((card) => {
    if (card.cardRef === "" || seen.has(card.cardRef)) {
      return false;
    }
    seen.add(card.cardRef);
    return true;
  });
}
function compareInitialCards(left, right) {
  return right.modifiedTime - left.modifiedTime || left.cardRef.localeCompare(right.cardRef);
}

// src/tray-view.ts
var DRAG_THRESHOLD_PX = 5;
var AUTO_SCROLL_EDGE_PX = 44;
var AUTO_SCROLL_STEP_PX = 18;
var TrayRenderer = class {
  constructor(app, plugin, leaf, actions) {
    this.app = app;
    this.plugin = plugin;
    this.leaf = leaf;
    this.actions = actions;
  }
  components = [];
  rootEl = null;
  suppressClickUntil = 0;
  clear() {
    for (const component of this.components) {
      component.unload();
    }
    this.components = [];
    this.rootEl = null;
  }
  async render(shell, filing, version, isCurrent) {
    const state = this.plugin.tray;
    const cardCount = state.piles.reduce(
      (total, pile) => total + pile.cards.length,
      0
    );
    if (cardCount === 0) {
      return;
    }
    const tray = shell.createDiv({ cls: "slipbox-tray" });
    this.rootEl = tray;
    tray.toggleClass("is-compact", filing);
    const header = tray.createDiv({ cls: "slipbox-tray-header" });
    const title = header.createDiv({ cls: "slipbox-tray-title" });
    const icon = title.createSpan({ cls: "slipbox-tray-icon" });
    (0, import_obsidian2.setIcon)(icon, "inbox");
    title.createSpan({ text: "Tray" });
    title.createSpan({
      cls: "slipbox-tray-total",
      text: `${cardCount} card${cardCount === 1 ? "" : "s"}`
    });
    if (filing) {
      header.createSpan({
        cls: "slipbox-tray-filing-note",
        text: "Piles preserved while filing"
      });
      return;
    }
    const clear = header.createEl("button", {
      text: "Clear Tray",
      attr: { type: "button" }
    });
    clear.disabled = !state.piles.some((pile) => pile.cards.some((card) => card.kind === "filed"));
    clear.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.plugin.clearTray();
    });
    const piles = tray.createDiv({ cls: "slipbox-tray-piles" });
    const jobs = [];
    state.piles.forEach((pile, pileIndex) => {
      jobs.push(...this.renderPile(
        piles,
        pile,
        pileIndex,
        state.expandedPileId === pile.id,
        version,
        isCurrent
      ));
    });
    await Promise.all(jobs);
  }
  renderPile(parent, pile, pileIndex, expanded, version, isCurrent) {
    const pileEl = parent.createDiv({
      cls: `slipbox-tray-pile ${expanded ? "is-expanded" : "is-collapsed"}`,
      attr: {
        "data-pile-id": pile.id,
        "aria-label": `Pile ${pileIndex + 1}, ${pile.cards.length} card${pile.cards.length === 1 ? "" : "s"}`
      }
    });
    pileEl.tabIndex = 0;
    const pileHeader = pileEl.createDiv({ cls: "slipbox-tray-pile-header" });
    pileHeader.createSpan({
      cls: "slipbox-tray-pile-count",
      text: String(pile.cards.length),
      attr: {
        "aria-label": `${pile.cards.length} card${pile.cards.length === 1 ? "" : "s"}`
      }
    });
    const disclosure = pileHeader.createEl("button", {
      cls: "clickable-icon slipbox-tray-disclosure",
      attr: {
        type: "button",
        "aria-label": expanded ? "Collapse pile" : "Expand pile",
        "aria-expanded": String(expanded)
      }
    });
    (0, import_obsidian2.setIcon)(disclosure, expanded ? "chevron-up" : "chevron-down");
    disclosure.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.plugin.expandTrayPile(expanded ? null : pile.id);
    });
    const sequence = pileEl.createDiv({ cls: "slipbox-tray-sequence" });
    const visibleCards = expanded ? pile.cards : pile.cards.slice(0, 1);
    const jobs = visibleCards.map((card, cardIndex) => this.renderCard(
      sequence,
      pile,
      card,
      expanded ? cardIndex : 0,
      pileIndex,
      expanded,
      version,
      isCurrent
    ));
    pileEl.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("button, a, .slipbox-tray-card") !== null) {
        return;
      }
      void this.plugin.expandTrayPile(expanded ? null : pile.id);
    });
    pileEl.addEventListener("keydown", (event) => {
      if (event.target !== pileEl || event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      void this.plugin.expandTrayPile(expanded ? null : pile.id);
    });
    pileEl.addEventListener("contextmenu", (event) => {
      if (event.target instanceof Element && event.target.closest("button, a") !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.showPileMenu(event, pile);
    });
    this.attachPileDragging(pileEl, pile, expanded);
    return jobs;
  }
  async renderCard(parent, pile, card, cardIndex, pileIndex, expanded, version, isCurrent) {
    const file = this.plugin.index.fileAtPath(card.cardRef);
    if (!(file instanceof import_obsidian2.TFile)) {
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    const address = filed?.id ?? "unfiled";
    const title = this.plugin.cardTitle(file);
    const miniature = parent.createDiv({
      cls: "slipbox-tray-card",
      attr: {
        "data-card-ref": card.cardRef,
        role: filed === void 0 ? "group" : "button",
        "aria-label": `${address}, ${title}; card ${cardIndex + 1} of ${pile.cards.length} in pile ${pileIndex + 1}`
      }
    });
    miniature.tabIndex = expanded ? 0 : -1;
    miniature.toggleClass("is-filed", filed !== void 0);
    miniature.toggleClass("is-unfiled", filed === void 0);
    const identity = miniature.createDiv({ cls: "slipbox-tray-card-identity" });
    identity.createSpan({ cls: "slipbox-tray-card-address", text: address });
    identity.createSpan({ cls: "slipbox-tray-card-title", text: title });
    const controls = miniature.createDiv({ cls: "slipbox-tray-card-actions" });
    if (filed === void 0) {
      const fileButton = trayIconButton(controls, "archive-restore", `File ${title}`);
      fileButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.plugin.beginFiling(file);
      });
    } else {
      const returnButton = trayIconButton(
        controls,
        "undo-2",
        `Return ${filed.id} \xB7 ${title} to Deck`
      );
      returnButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.plugin.toggleFileInTray(file);
      });
    }
    const open = trayIconButton(controls, "file-pen-line", `Open ${title} in Markdown`);
    open.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.plugin.openMarkdownFile(file);
    });
    const preview = miniature.createDiv({
      cls: "slipbox-tray-card-preview markdown-rendered"
    });
    const component = new import_obsidian2.Component();
    component.load();
    this.components.push(component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (isCurrent() && version >= 0) {
        await import_obsidian2.MarkdownRenderer.render(
          this.app,
          body,
          preview,
          file.path,
          component
        );
      }
    } catch {
      preview.setText("Preview unavailable");
    }
    miniature.addEventListener("click", (event) => {
      if (performance.now() < this.suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!expanded || filed === void 0 || event.target instanceof Element && event.target.closest("button, a") !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void this.actions.jumpToFiledCard(filed.id);
    });
    miniature.addEventListener("keydown", (event) => {
      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.moveCardBy(
          card.cardRef,
          event.key === "ArrowLeft" ? -1 : 1
        );
        return;
      }
      if (event.key === "Enter" && filed !== void 0) {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.jumpToFiledCard(filed.id);
      }
    });
    miniature.addEventListener("contextmenu", (event) => {
      if (event.target instanceof Element && event.target.closest("button, a") !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.showCardMenu(event, pile, card);
    });
    this.attachCardDragging(miniature, pile, card, expanded);
  }
  showPileMenu(event, pile) {
    const menu = import_obsidian2.Menu.forEvent(event);
    menu.addItem((item) => {
      item.setTitle("Clear pile").setIcon("eraser").setDisabled(!pile.cards.some((card) => card.kind === "filed")).onClick(() => void this.plugin.clearTrayPile(pile.id));
    });
    menu.showAtMouseEvent(event);
  }
  showCardMenu(event, pile, card) {
    const state = this.plugin.tray;
    const position = cardPosition(state, card.cardRef);
    if (position === null) {
      return;
    }
    const menu = import_obsidian2.Menu.forEvent(event);
    menu.addItem((item) => {
      item.setTitle("Move to previous pile").setIcon("arrow-left").setDisabled(position.pileIndex <= 0).onClick(() => {
        const target = state.piles[position.pileIndex - 1];
        if (target !== void 0) {
          void this.moveAndFocus(moveCardBetweenPiles(
            state,
            card.cardRef,
            target.id
          ), card.cardRef);
        }
      });
    });
    menu.addItem((item) => {
      item.setTitle("Move to next pile").setIcon("arrow-right").setDisabled(position.pileIndex >= state.piles.length - 1).onClick(() => {
        const target = state.piles[position.pileIndex + 1];
        if (target !== void 0) {
          void this.moveAndFocus(moveCardBetweenPiles(
            state,
            card.cardRef,
            target.id
          ), card.cardRef);
        }
      });
    });
    menu.addItem((item) => {
      item.setTitle("Split into new pile").setIcon("split").setDisabled(pile.cards.length <= 1).onClick(() => void this.moveAndFocus(splitCardIntoNewPile(
        state,
        card.cardRef,
        this.plugin.createTrayPileId()
      ), card.cardRef));
    });
    menu.showAtMouseEvent(event);
  }
  attachCardDragging(element, pile, card, expanded) {
    if (!expanded) {
      return;
    }
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target instanceof Element && event.target.closest("button, a") !== null) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;
      const pointerId = event.pointerId;
      element.setPointerCapture(pointerId);
      const move = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
          return;
        }
        dragging = true;
        moveEvent.preventDefault();
        element.addClass("is-dragging");
        element.style.translate = `${dx}px ${dy}px`;
        this.rootEl?.addClass("is-dragging-card");
        this.updateCardDropCues(moveEvent, pile.id, element);
        this.autoScroll(moveEvent.clientX);
      };
      const finish = (upEvent) => {
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", finish);
        element.removeEventListener("pointercancel", cancel);
        if (element.hasPointerCapture(pointerId)) {
          element.releasePointerCapture(pointerId);
        }
        if (!dragging) {
          return;
        }
        upEvent.preventDefault();
        upEvent.stopPropagation();
        this.suppressClickUntil = performance.now() + 400;
        const next = this.cardDropState(
          card.cardRef,
          pile.id,
          upEvent.clientX,
          upEvent.clientY,
          element
        );
        this.clearDropCues();
        void this.moveAndFocus(next, card.cardRef);
      };
      const cancel = () => {
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", finish);
        element.removeEventListener("pointercancel", cancel);
        this.clearDropCues();
      };
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", finish);
      element.addEventListener("pointercancel", cancel);
    });
  }
  attachPileDragging(element, pile, expanded) {
    if (expanded) {
      return;
    }
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target instanceof Element && event.target.closest("button, a, .slipbox-tray-card") !== null) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;
      const pointerId = event.pointerId;
      element.setPointerCapture(pointerId);
      const move = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
          return;
        }
        dragging = true;
        moveEvent.preventDefault();
        element.addClass("is-dragging");
        element.style.translate = `${dx}px ${dy}px`;
        this.updatePileDropCues(moveEvent, pile.id, element);
        this.autoScroll(moveEvent.clientX);
      };
      const finish = (upEvent) => {
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", finish);
        element.removeEventListener("pointercancel", cancel);
        if (element.hasPointerCapture(pointerId)) {
          element.releasePointerCapture(pointerId);
        }
        if (!dragging) {
          return;
        }
        upEvent.preventDefault();
        upEvent.stopPropagation();
        this.suppressClickUntil = performance.now() + 400;
        const next = this.pileDropState(
          pile.id,
          upEvent.clientX,
          upEvent.clientY,
          element
        );
        this.clearDropCues();
        void this.plugin.updateTray(next);
      };
      const cancel = () => {
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", finish);
        element.removeEventListener("pointercancel", cancel);
        this.clearDropCues();
      };
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", finish);
      element.addEventListener("pointercancel", cancel);
    });
  }
  cardDropState(cardRef, sourcePileId, x, y, dragged) {
    const state = this.plugin.tray;
    const targetPileEl = this.elementsBelowPoint(x, y, dragged).find((element) => element.matches(".slipbox-tray-pile"));
    const targetPileId = targetPileEl?.dataset.pileId;
    if (targetPileEl !== void 0 && targetPileId !== void 0) {
      const cards = Array.from(targetPileEl.querySelectorAll(
        ".slipbox-tray-card:not(.is-dragging)"
      ));
      const insertionIndex = insertionIndexForPoint(
        x,
        cards.map((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left + rect.width / 2;
        })
      );
      return moveCardBetweenPiles(state, cardRef, targetPileId, insertionIndex);
    }
    const trayEl = this.elementsBelowPoint(x, y, dragged).find((element) => element.matches(".slipbox-tray-piles"));
    if (trayEl !== void 0) {
      const pileElements = Array.from(trayEl.querySelectorAll(
        ".slipbox-tray-pile:not(.is-dragging)"
      ));
      const pileIndex = insertionIndexForPoint(
        x,
        pileElements.map((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left + rect.width / 2;
        })
      );
      return splitCardIntoNewPile(
        state,
        cardRef,
        this.plugin.createTrayPileId(),
        pileIndex
      );
    }
    const source = state.piles.find((candidate) => candidate.id === sourcePileId);
    return source === void 0 ? state : state;
  }
  pileDropState(sourcePileId, x, y, dragged) {
    const state = this.plugin.tray;
    const target = this.elementsBelowPoint(x, y, dragged).find(
      (element) => element.matches(".slipbox-tray-pile") && element.dataset.pileId !== sourcePileId
    );
    const targetId = target?.dataset.pileId;
    if (target !== void 0 && targetId !== void 0) {
      const rect = target.getBoundingClientRect();
      const relativeX = (x - rect.left) / Math.max(1, rect.width);
      if (relativeX > 0.2 && relativeX < 0.8) {
        return mergePiles(state, sourcePileId, targetId);
      }
    }
    const sourceIndex = state.piles.findIndex((pile) => pile.id === sourcePileId);
    const container = this.rootEl?.querySelector(".slipbox-tray-piles");
    if (sourceIndex < 0 || container === null || container === void 0) {
      return state;
    }
    const pileElements = Array.from(container.querySelectorAll(
      ".slipbox-tray-pile:not(.is-dragging)"
    ));
    const insertionIndex = insertionIndexForPoint(
      x,
      pileElements.map((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left + rect.width / 2;
      })
    );
    return reorderPiles(state, sourceIndex, insertionIndex);
  }
  updateCardDropCues(event, sourcePileId, dragged) {
    this.clearDropCues(dragged);
    const targetPile = this.elementsBelowPoint(
      event.clientX,
      event.clientY,
      dragged
    ).find((element) => element.matches(".slipbox-tray-pile"));
    if (targetPile === void 0) {
      return;
    }
    targetPile.addClass(
      targetPile.dataset.pileId === sourcePileId ? "is-reorder-target" : "is-card-drop-target"
    );
    const targetCard = this.elementsBelowPoint(
      event.clientX,
      event.clientY,
      dragged
    ).find((element) => element.matches(".slipbox-tray-card"));
    targetCard?.addClass("is-insertion-target");
  }
  updatePileDropCues(event, sourcePileId, dragged) {
    this.clearDropCues(dragged);
    const target = this.elementsBelowPoint(
      event.clientX,
      event.clientY,
      dragged
    ).find(
      (element) => element.matches(".slipbox-tray-pile") && element.dataset.pileId !== sourcePileId
    );
    if (target === void 0) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / Math.max(1, rect.width);
    target.addClass(relativeX > 0.2 && relativeX < 0.8 ? "is-merge-target" : "is-reorder-target");
  }
  elementsBelowPoint(x, y, dragged) {
    const previous = dragged.style.pointerEvents;
    dragged.style.pointerEvents = "none";
    const elements = document.elementsFromPoint(x, y);
    dragged.style.pointerEvents = previous;
    return elements;
  }
  autoScroll(clientX) {
    const container = this.rootEl?.querySelector(".slipbox-tray-piles");
    if (container === null || container === void 0) {
      return;
    }
    const rect = container.getBoundingClientRect();
    if (clientX < rect.left + AUTO_SCROLL_EDGE_PX) {
      container.scrollLeft -= AUTO_SCROLL_STEP_PX;
    } else if (clientX > rect.right - AUTO_SCROLL_EDGE_PX) {
      container.scrollLeft += AUTO_SCROLL_STEP_PX;
    }
  }
  clearDropCues(except) {
    this.rootEl?.querySelectorAll(
      ".is-dragging, .is-merge-target, .is-reorder-target, .is-card-drop-target, .is-insertion-target"
    ).forEach((element) => {
      if (element === except) {
        return;
      }
      element.removeClasses([
        "is-dragging",
        "is-merge-target",
        "is-reorder-target",
        "is-card-drop-target",
        "is-insertion-target"
      ]);
      element.style.translate = "";
    });
    this.rootEl?.removeClass("is-dragging-card");
  }
  async moveAndFocus(nextState, cardRef) {
    await this.plugin.updateTray(nextState);
    window.requestAnimationFrame(() => {
      const escaped = CSS.escape(cardRef);
      this.rootEl?.querySelector(`.slipbox-tray-card[data-card-ref="${escaped}"]`)?.focus({ preventScroll: true });
    });
  }
};
function trayIconButton(parent, icon, label) {
  const button = parent.createEl("button", {
    cls: "clickable-icon slipbox-tray-card-action",
    attr: { type: "button", "aria-label": label }
  });
  (0, import_obsidian2.setIcon)(button, icon);
  (0, import_obsidian2.setTooltip)(button, label, { placement: "bottom", delay: 250 });
  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  return button;
}

// src/deck-view.ts
var DECK_VIEW_TYPE = "slipbox-deck";
var FILING_ANIMATION_DURATION_MS = 280;
var RENDER_EDGE_BUFFER = 2;
var LAYOUT_MEASUREMENT_RETRIES = 2;
var DeckView = class extends import_obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.cardFooters = new CardFooterManager({
      app: this.app,
      leaf: this.leaf,
      hoverSource: DECK_VIEW_TYPE,
      isOnDesk: (file) => this.plugin.state.deskCards.some(
        (card) => card.cardRef === file.path
      ),
      putOnDesk: (file) => this.plugin.putFileOnDesk(file, false)
    });
    this.trayRenderer = new TrayRenderer(this.app, this.plugin, this.leaf, {
      jumpToFiledCard: (id) => this.jumpToId(id),
      moveCardBy: (cardRef, delta) => this.moveTrayCardBy(cardRef, delta)
    });
    this.registerEvent(
      this.app.workspace.on("css-change", () => this.cardFooters.scheduleLayout())
    );
    this.scope = new import_obsidian3.Scope(this.app.scope);
    this.updateKeybindings();
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
  bookmarksButtonEl = null;
  deskButtonEl = null;
  resizeObserver = null;
  positioningFrame = null;
  positioningRetriesRemaining = 0;
  cardFooters;
  trayRenderer;
  keymapHandlers = [];
  getViewType() {
    return DECK_VIEW_TYPE;
  }
  getDisplayText() {
    return "Slipbox Deck";
  }
  getIcon() {
    return "archive";
  }
  async onOpen() {
    this.contentEl.addClass("slipbox-deck-view");
    this.contentEl.tabIndex = 0;
    this.observeDeckSize();
    await this.refresh();
  }
  async onClose() {
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
    this.stageEl = null;
    this.renderedCards = [];
    this.filingPromptEl = null;
    this.backButtonEl = null;
    this.forwardButtonEl = null;
    this.bookmarksButtonEl = null;
    this.deskButtonEl = null;
    this.history.reset();
  }
  onResize() {
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
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
  updateKeybindings() {
    const scope = this.scope;
    if (scope === null) {
      return;
    }
    for (const handler of this.keymapHandlers) {
      scope.unregister(handler);
    }
    this.keymapHandlers = [];
    for (const definition of DECK_ACTION_DEFINITIONS) {
      for (const binding2 of this.plugin.settings.deckKeybindings[definition.id]) {
        const handler = scope.register(
          [...binding2.modifiers],
          binding2.key,
          (event) => this.handleDeckActionKey(
            event,
            definition.id,
            definition.repeatable
          )
        );
        this.keymapHandlers.push(handler);
      }
    }
  }
  canRunAction(action, target) {
    const filed = this.plugin.index.snapshot.filed;
    const active = target ?? this.activeCard;
    const activeIndex = active === null ? -1 : filed.findIndex((card) => card.id === active.id);
    return canRunDeckAction(action, {
      hasActiveCard: activeIndex >= 0,
      hasPreviousCard: activeIndex > 0,
      hasNextCard: activeIndex >= 0 && activeIndex < filed.length - 1,
      canGoBack: this.history.canBack(),
      canGoForward: this.history.canForward(),
      hasProblems: this.plugin.index.snapshot.issues.length > 0,
      filing: this.filingFile !== null
    });
  }
  runAction(action, target) {
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
      case "add-card":
        if (card !== null) {
          void this.plugin.createCardFrom(card.id);
        }
        break;
      case "toggle-tray":
        if (card !== null) {
          void this.plugin.toggleFileInTray(card.file);
        }
        break;
      case "toggle-desk":
        if (card !== null) {
          void this.toggleCardDesk(card.file);
        }
        break;
      case "toggle-bookmark":
        if (card !== null) {
          void this.toggleCardBookmark(card.id);
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
      case "open-desk":
        void this.plugin.openDesk();
        break;
      case "problems":
        this.plugin.showIssues();
        break;
      case "new-section":
        void this.plugin.createNewSection();
        break;
      case "file-here":
        void this.fileHere();
        break;
      case "cancel-filing":
        void this.cancelFiling();
        break;
    }
    return true;
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
    new import_obsidian3.Notice("Filing cancelled. The card remains on the Desk.");
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
      new import_obsidian3.Notice(`Card ${id} is missing, invalid, or duplicated.`);
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
      new import_obsidian3.Notice(`The Back destination ${id} is no longer available.`);
    }
    this.updateHistoryControls();
  }
  async goForward() {
    const id = this.history.forward();
    if (id === void 0) {
      return;
    }
    if (!await this.navigateToId(id)) {
      new import_obsidian3.Notice(`The Forward destination ${id} is no longer available.`);
    }
    this.updateHistoryControls();
  }
  async addBookmarkToCurrent() {
    if (this.activeId === null) {
      new import_obsidian3.Notice("There is no active filed card.");
      return;
    }
    const bookmarkedIds = this.bookmarkedIds();
    bookmarkedIds.add(this.activeId);
    this.updateBookmarkUi(bookmarkedIds);
    await this.plugin.addBookmark(this.activeId);
  }
  async removeBookmark(zettelId) {
    const bookmarkedIds = this.bookmarkedIds();
    bookmarkedIds.delete(zettelId);
    this.updateBookmarkUi(bookmarkedIds);
    await this.plugin.removeBookmark(zettelId);
  }
  async navigateToId(id) {
    const filed = this.plugin.index.snapshot.filed;
    const targetIndex = filed.findIndex((card) => card.id === id);
    if (targetIndex < 0) {
      new import_obsidian3.Notice(`Card ${id} is missing, invalid, or duplicated.`);
      return false;
    }
    this.activeId = id;
    this.viewportOffset = 0;
    await this.renderDeck();
    return true;
  }
  async addCurrentAsEntryPoint() {
    if (this.activeId === null) {
      new import_obsidian3.Notice("There is no active filed card.");
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
    this.cardFooters.clear();
    this.trayRenderer.clear();
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
    const trayJob = this.trayRenderer.render(
      shell,
      this.filingFile !== null,
      version,
      () => version === this.renderVersion
    );
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
    await trayJob;
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
  renderToolbar(shell) {
    const toolbar = shell.createDiv({ cls: "slipbox-deck-toolbar" });
    const identity = toolbar.createDiv({ cls: "slipbox-deck-identity" });
    const icon = identity.createSpan({ cls: "slipbox-deck-icon" });
    (0, import_obsidian3.setIcon)(icon, "archive");
    identity.createSpan({ text: "Deck" });
    const history = toolbar.createDiv({ cls: "slipbox-toolbar-group slipbox-history-controls" });
    const back = history.createEl("button", {
      text: "\u2190 Back",
      attr: { type: "button" }
    });
    back.addEventListener("click", () => this.runAction("back"));
    this.backButtonEl = back;
    const forward = history.createEl("button", {
      text: "Forward \u2192",
      attr: { type: "button" }
    });
    forward.addEventListener("click", () => this.runAction("forward"));
    this.forwardButtonEl = forward;
    this.updateHistoryControls();
    const controls = toolbar.createDiv({ cls: "slipbox-toolbar-group slipbox-toolbar-main" });
    const entries = controls.createEl("button", {
      text: "Entry points",
      attr: { type: "button" }
    });
    entries.addEventListener("click", () => this.runAction("entry-points"));
    const bookmarks = controls.createEl("button", {
      attr: { type: "button" },
      cls: "slipbox-bookmarks-button"
    });
    bookmarks.createSpan({ text: "Bookmarks" });
    if (this.plugin.state.bookmarks.length > 0) {
      bookmarks.createSpan({ cls: "slipbox-count", text: String(this.plugin.state.bookmarks.length) });
    }
    bookmarks.addEventListener("click", () => this.runAction("bookmarks"));
    this.bookmarksButtonEl = bookmarks;
    const desk = controls.createEl("button", {
      attr: { type: "button" },
      cls: "slipbox-desk-button"
    });
    desk.createSpan({ text: "Desk" });
    const deskCount = this.plugin.state.deskCards.length;
    if (deskCount > 0) {
      desk.createSpan({ cls: "slipbox-count", text: String(deskCount) });
    }
    desk.addEventListener("click", () => this.runAction("open-desk"));
    this.deskButtonEl = desk;
    if (this.plugin.index.snapshot.issues.length > 0) {
      const problems = controls.createEl("button", {
        cls: "slipbox-problem-button",
        attr: { type: "button" }
      });
      const warning = problems.createSpan();
      (0, import_obsidian3.setIcon)(warning, "triangle-alert");
      problems.createSpan({
        text: `${this.plugin.index.snapshot.issues.length} problem${this.plugin.index.snapshot.issues.length === 1 ? "" : "s"}`
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
    const empty = stage.createDiv({ cls: "slipbox-deck-empty" });
    empty.createEl("h2", { text: "The filing box is empty" });
    empty.createEl("p", {
      text: this.filingFile === null ? "Create a new section to place the first filed card." : "There is no filed card to use as an attachment point. Cancel filing, then create the first section."
    });
    const create = empty.createEl("button", {
      text: "New section",
      cls: "mod-cta",
      attr: { type: "button" }
    });
    create.addEventListener("click", () => this.runAction("new-section"));
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
      const cardEl = stage.createDiv({ cls: "slipbox-card" });
      cardEl.dataset.index = String(index);
      cardEl.dataset.path = card.path;
      cardEl.dataset.zettelId = card.id;
      cardEl.toggleClass("is-active", index === activeIndex);
      const isBookmarked = this.plugin.bookmarkAt(card.id) !== void 0;
      const isInTray = this.plugin.isFileInTray(card.file);
      const isOnDesk = this.plugin.state.deskCards.some(
        (deskCard) => deskCard.cardRef === card.path
      );
      const title = this.plugin.cardTitle(card.file);
      const cardLabel = `${card.id} \xB7 ${title}`;
      cardEl.setAttr("aria-label", cardLabel);
      (0, import_obsidian3.setTooltip)(cardEl, cardLabel, {
        placement: "bottom",
        delay: 350
      });
      cardEl.style.zIndex = String(cardStackOrder(index, activeIndex));
      this.renderedCards.push(cardEl);
      const frame = cardEl.createDiv({ cls: "slipbox-card-frame" });
      const addressRow = frame.createDiv({ cls: "slipbox-card-address-row" });
      const identity = addressRow.createDiv({ cls: "slipbox-card-header-identity" });
      identity.createSpan({ cls: "slipbox-card-address", text: card.id });
      if (this.plugin.settings.showTitleInDeck) {
        identity.createSpan({ cls: "slipbox-card-header-title", text: title });
      }
      const cardActions = addressRow.createDiv({ cls: "slipbox-card-actions" });
      if (this.plugin.settings.deckHeaderButtons["add-card"]) {
        this.renderCardAction(
          cardActions,
          "plus",
          "slipbox-card-add",
          `Add a card from ${card.id} \xB7 ${title}`,
          () => this.runAction("add-card", card)
        );
      }
      if (this.plugin.settings.deckHeaderButtons["open-note"]) {
        this.renderCardAction(
          cardActions,
          "file-pen-line",
          "slipbox-card-open",
          `Open ${card.id} \xB7 ${title} in Markdown`,
          () => this.runAction("open-note", card)
        );
      }
      if (this.plugin.settings.deckHeaderButtons.tray) {
        const trayAction = isInTray ? `Return ${card.id} \xB7 ${title} to Deck` : `Pull ${card.id} \xB7 ${title} into Tray`;
        const trayToggle = this.renderCardAction(
          cardActions,
          isInTray ? "undo-2" : "inbox",
          "slipbox-card-tray-toggle",
          trayAction,
          () => this.runAction("toggle-tray", card)
        );
        trayToggle.setAttr("aria-pressed", String(isInTray));
        trayToggle.toggleClass("is-in-tray", isInTray);
      }
      if (this.plugin.settings.deckHeaderButtons.desk) {
        const deskAction = isOnDesk ? `Remove ${card.id} \xB7 ${title} from Desk` : `Add ${card.id} \xB7 ${title} to Desk`;
        const deskToggle = this.renderCardAction(
          cardActions,
          "panels-top-left",
          "slipbox-card-desk-toggle",
          deskAction,
          () => this.runAction("toggle-desk", card)
        );
        deskToggle.setAttr("aria-pressed", String(isOnDesk));
        deskToggle.toggleClass("is-on-desk", isOnDesk);
      }
      if (this.plugin.settings.deckHeaderButtons.bookmark) {
        const bookmarkAction = isBookmarked ? `Remove bookmark from ${card.id} \xB7 ${title}` : `Add bookmark to ${card.id} \xB7 ${title}`;
        const bookmarkToggle = this.renderCardAction(
          cardActions,
          "bookmark",
          "slipbox-card-bookmark-toggle",
          bookmarkAction,
          () => this.runAction("toggle-bookmark", card)
        );
        bookmarkToggle.setAttr("aria-pressed", String(isBookmarked));
        bookmarkToggle.toggleClass("is-bookmarked", isBookmarked);
      }
      const scroll = frame.createDiv({ cls: "slipbox-card-scroll markdown-rendered" });
      scroll.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
      this.cardFooters.render(frame, {
        sourcePath: card.path,
        backlinks: this.plugin.index.backlinksForPath(card.path),
        interactive: index === activeIndex,
        activate: (backlink) => this.jumpToId(backlink.id)
      });
      jobs.push(this.renderMarkdownCard(card, scroll, version));
      cardEl.addEventListener("contextmenu", (event) => {
        const target = event.target;
        if (!(target instanceof Element) || target.closest("a, button, input, textarea, select") !== null) {
          return;
        }
        this.plugin.showCardContextMenu(
          event,
          card.file,
          card.id,
          DECK_VIEW_TYPE,
          this.leaf
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
  renderCardAction(parent, icon, className, label, action) {
    const button = parent.createEl("button", {
      cls: `clickable-icon slipbox-card-toggle ${className}`,
      attr: { type: "button", "aria-label": label }
    });
    (0, import_obsidian3.setIcon)(button, icon);
    (0, import_obsidian3.setTooltip)(button, label, { placement: "bottom", delay: 250 });
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    return button;
  }
  async renderMarkdownCard(card, target, version) {
    const component = new import_obsidian3.Component();
    component.load();
    this.renderComponents.push(component);
    try {
      const body = await this.plugin.index.readBody(card.file);
      if (version !== this.renderVersion) {
        return;
      }
      await import_obsidian3.MarkdownRenderer.render(
        this.app,
        body,
        target,
        card.file.path,
        component
      );
      this.attachInternalLinkInteractions(target, card.file.path);
      target.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
    } catch (error) {
      target.createEl("p", {
        cls: "slipbox-render-error",
        text: `Could not render this card: ${errorMessage(error)}`
      });
    }
  }
  async toggleCardBookmark(zettelId) {
    const bookmarkedIds = this.bookmarkedIds();
    if (bookmarkedIds.has(zettelId)) {
      bookmarkedIds.delete(zettelId);
    } else {
      bookmarkedIds.add(zettelId);
    }
    this.updateBookmarkUi(bookmarkedIds);
    await this.plugin.toggleBookmark(zettelId);
  }
  async toggleCardDesk(file) {
    const deskCardRefs = this.deskCardRefs();
    if (deskCardRefs.has(file.path)) {
      deskCardRefs.delete(file.path);
    } else {
      deskCardRefs.add(file.path);
    }
    this.updateDeskUi(deskCardRefs);
    await this.plugin.toggleFileOnDesk(file);
  }
  attachInternalLinkInteractions(target, sourcePath) {
    target.addEventListener("mouseover", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const link = event.target.closest("a.internal-link");
      const linktext = link?.dataset.href ?? link?.getAttribute("href") ?? void 0;
      if (link === null || linktext === void 0 || linktext === "") {
        return;
      }
      this.app.workspace.trigger("hover-link", {
        event,
        source: DECK_VIEW_TYPE,
        hoverParent: this.leaf,
        targetEl: link,
        linktext,
        sourcePath
      });
    });
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
    const inHand = shell.createDiv({ cls: "slipbox-in-hand" });
    inHand.createDiv({ cls: "slipbox-in-hand-label", text: "Unfiled card in hand" });
    inHand.createDiv({
      cls: "slipbox-in-hand-name",
      text: this.plugin.cardTitle(file)
    });
    const preview = inHand.createDiv({ cls: "slipbox-in-hand-preview markdown-rendered" });
    const component = new import_obsidian3.Component();
    component.load();
    this.renderComponents.push(component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (version === this.renderVersion) {
        await import_obsidian3.MarkdownRenderer.render(this.app, body, preview, file.path, component);
      }
    } catch (error) {
      preview.setText(`Could not render this card: ${errorMessage(error)}`);
    }
  }
  renderFilingActions(shell) {
    const actions = shell.createDiv({ cls: "slipbox-filing-actions" });
    const attachment = this.activeCard;
    this.filingPromptEl = actions.createSpan({
      cls: "slipbox-filing-prompt",
      text: attachment === null ? "Choose an attachment point" : `Attach from ${attachment.id}`
    });
    const cancel = actions.createEl("button", {
      text: "Cancel",
      attr: { type: "button" }
    });
    cancel.addEventListener("click", () => this.runAction("cancel-filing"));
    const fileHere = actions.createEl("button", {
      text: "File here",
      cls: "mod-cta",
      attr: { type: "button" }
    });
    fileHere.disabled = attachment === null;
    fileHere.addEventListener("click", () => this.runAction("file-here"));
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
    const inHand = this.contentEl.querySelector(".slipbox-in-hand");
    if (inHand === null) {
      return;
    }
    const label = inHand.querySelector(".slipbox-in-hand-label");
    label?.setText(`Filed as ${newId}`);
    inHand.addClass("is-entering-deck");
    await new Promise(
      (resolve) => window.setTimeout(resolve, FILING_ANIMATION_DURATION_MS + 40)
    );
  }
  renderBookmarkEdgeTabs(stage, bookmarkedIds = this.bookmarkedIds()) {
    stage.querySelectorAll(".slipbox-bookmark-edge-tab").forEach((tab) => tab.remove());
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
      cardWidth
    );
    for (const direction of ["left", "right"]) {
      const index = targets[direction];
      const card = index === null ? void 0 : filed[index];
      if (card === void 0) {
        continue;
      }
      const tab = stage.createEl("button", {
        cls: `slipbox-bookmark-edge-tab is-${direction}`,
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
      new import_obsidian3.Notice("There is no active filed card to centre.");
      return;
    }
    this.viewportOffset = 0;
    this.positionCards();
    this.updateActiveUi();
    this.queueRenderWindowRefresh();
  }
  async moveTrayCardBy(cardRef, delta) {
    const position = cardPosition(this.plugin.tray, cardRef);
    if (position === null) {
      return;
    }
    const target = Math.max(
      0,
      Math.min(position.pileSize - 1, position.cardIndex + delta)
    );
    if (target === position.cardIndex) {
      return;
    }
    await this.plugin.updateTray(moveCardWithinPile(
      this.plugin.tray,
      position.pileId,
      position.cardIndex,
      target
    ));
  }
  goToDeckBoundary(boundary) {
    const filed = this.plugin.index.snapshot.filed;
    const target = boundary === "start" ? filed[0] : filed[filed.length - 1];
    if (target === void 0) {
      new import_obsidian3.Notice("There are no filed cards.");
      return;
    }
    void this.goToId(target.id);
  }
  handleDeckActionKey(event, action, repeatable = false) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable) {
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
        index === activeIndex
      );
      card.style.transform = `translate(-50%, -50%) translateX(${motion.translateX}px) scale(${motion.scale})`;
      card.style.opacity = String(motion.opacity);
    }
    return true;
  }
  observeDeckSize() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleCardPositioning();
    });
    this.resizeObserver.observe(this.contentEl);
  }
  scheduleCardPositioning(retries = LAYOUT_MEASUREMENT_RETRIES) {
    this.positioningRetriesRemaining = Math.max(
      this.positioningRetriesRemaining,
      retries
    );
    if (this.positioningFrame !== null) {
      return;
    }
    this.positioningFrame = window.requestAnimationFrame(() => {
      this.flushScheduledCardPositioning();
    });
  }
  flushScheduledCardPositioning() {
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
    if (this.contentEl.offsetWidth > 0 && this.positioningRetriesRemaining > 0) {
      this.positioningRetriesRemaining -= 1;
      this.positioningFrame = window.requestAnimationFrame(() => {
        this.flushScheduledCardPositioning();
      });
      return;
    }
    this.positioningRetriesRemaining = 0;
  }
  updateActiveUi() {
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
  bookmarkedIds() {
    return new Set(
      this.plugin.state.bookmarks.map((bookmark) => bookmark.zettelId)
    );
  }
  deskCardRefs() {
    return new Set(this.plugin.state.deskCards.map((card) => card.cardRef));
  }
  updateBookmarkUi(bookmarkedIds = this.bookmarkedIds()) {
    const bookmarkCount = bookmarkedIds.size;
    if (this.bookmarksButtonEl !== null) {
      const countEl = this.bookmarksButtonEl.querySelector(".slipbox-count");
      if (bookmarkCount === 0) {
        countEl?.remove();
      } else if (countEl === null) {
        this.bookmarksButtonEl.createSpan({
          cls: "slipbox-count",
          text: String(bookmarkCount)
        });
      } else {
        countEl.setText(String(bookmarkCount));
      }
    }
    for (const cardEl of this.renderedCards) {
      const zettelId = cardEl.dataset.zettelId;
      const toggle = cardEl.querySelector(
        ".slipbox-card-bookmark-toggle"
      );
      if (zettelId === void 0 || toggle === null) {
        continue;
      }
      const isBookmarked = bookmarkedIds.has(zettelId);
      const action = isBookmarked ? `Remove bookmark from ${zettelId}` : `Add bookmark to ${zettelId}`;
      toggle.toggleClass("is-bookmarked", isBookmarked);
      toggle.setAttr("aria-label", action);
      toggle.setAttr("aria-pressed", String(isBookmarked));
      (0, import_obsidian3.setTooltip)(toggle, action, {
        placement: "bottom",
        delay: 250
      });
    }
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl, bookmarkedIds);
    }
  }
  updateDeskUi(deskCardRefs = this.deskCardRefs()) {
    const deskCount = deskCardRefs.size;
    if (this.deskButtonEl !== null) {
      const countEl = this.deskButtonEl.querySelector(".slipbox-count");
      if (deskCount === 0) {
        countEl?.remove();
      } else if (countEl === null) {
        this.deskButtonEl.createSpan({
          cls: "slipbox-count",
          text: String(deskCount)
        });
      } else {
        countEl.setText(String(deskCount));
      }
    }
    for (const cardEl of this.renderedCards) {
      const cardPath = cardEl.dataset.path;
      const zettelId = cardEl.dataset.zettelId;
      const toggle = cardEl.querySelector(
        ".slipbox-card-desk-toggle"
      );
      if (cardPath === void 0 || zettelId === void 0 || toggle === null) {
        continue;
      }
      const isOnDesk = deskCardRefs.has(cardPath);
      const action = isOnDesk ? `Remove ${zettelId} from Desk` : `Add ${zettelId} to Desk`;
      toggle.toggleClass("is-on-desk", isOnDesk);
      toggle.setAttr("aria-label", action);
      toggle.setAttr("aria-pressed", String(isOnDesk));
      (0, import_obsidian3.setTooltip)(toggle, action, {
        placement: "bottom",
        delay: 250
      });
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
      const scroll = card.querySelector(".slipbox-card-scroll");
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
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/desk-view.ts
var import_obsidian4 = require("obsidian");
var DESK_VIEW_TYPE = "slipbox-desk";
var DeskView = class extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.cardFooters = new CardFooterManager({
      app: this.app,
      leaf: this.leaf,
      hoverSource: DESK_VIEW_TYPE,
      isOnDesk: (file) => this.plugin.state.deskCards.some(
        (card) => card.cardRef === file.path
      ),
      putOnDesk: (file) => this.plugin.putFileOnDesk(file, false)
    });
    this.registerEvent(
      this.app.workspace.on("css-change", () => this.cardFooters.scheduleLayout())
    );
  }
  renderComponents = [];
  renderVersion = 0;
  cardFooters;
  getViewType() {
    return DESK_VIEW_TYPE;
  }
  getDisplayText() {
    return "Slipbox Desk";
  }
  getIcon() {
    return "panels-top-left";
  }
  async onOpen() {
    this.contentEl.addClass("slipbox-desk-view");
    await this.refresh();
  }
  async onClose() {
    this.cardFooters.clear();
    this.unloadRenderComponents();
  }
  onResize() {
    this.cardFooters.scheduleLayout();
  }
  async refresh() {
    await this.renderDesk();
  }
  async renderDesk() {
    const version = ++this.renderVersion;
    this.unloadRenderComponents();
    this.cardFooters.clear();
    this.contentEl.empty();
    const shell = this.contentEl.createDiv({ cls: "slipbox-desk-shell" });
    this.renderToolbar(shell);
    const body = shell.createDiv({ cls: "slipbox-desk-body" });
    this.renderUnfiledTray(body);
    const viewport = body.createDiv({ cls: "slipbox-desk-viewport" });
    const surface = viewport.createDiv({ cls: "slipbox-desk-surface" });
    surface.style.width = `${DESK_WIDTH}px`;
    surface.style.height = `${DESK_HEIGHT}px`;
    const jobs = [];
    for (const state of [...this.plugin.state.deskCards].sort((a, b) => a.z - b.z)) {
      jobs.push(this.renderCard(surface, state, version));
    }
    await Promise.all(jobs);
  }
  renderToolbar(shell) {
    const toolbar = shell.createDiv({ cls: "slipbox-deck-toolbar slipbox-desk-toolbar" });
    const identity = toolbar.createDiv({ cls: "slipbox-deck-identity" });
    const icon = identity.createSpan({ cls: "slipbox-deck-icon" });
    (0, import_obsidian4.setIcon)(icon, "panels-top-left");
    identity.createSpan({ text: "Desk" });
    toolbar.createSpan({
      cls: "slipbox-desk-description",
      text: `${this.plugin.state.deskCards.length} card${this.plugin.state.deskCards.length === 1 ? "" : "s"} on the table`
    });
    const openDeck = toolbar.createEl("button", {
      text: "Open Deck",
      attr: { type: "button" }
    });
    openDeck.addEventListener("click", () => void this.plugin.openDeck());
  }
  renderUnfiledTray(body) {
    const tray = body.createEl("aside", { cls: "slipbox-unfiled-tray" });
    tray.createEl("h3", { text: "Unfiled cards" });
    tray.createEl("p", {
      text: "Place a card on the table or file it directly."
    });
    const placed = new Set(this.plugin.state.deskCards.map((card) => card.cardRef));
    const available = this.plugin.index.snapshot.unfiled.filter(
      (file) => !placed.has(file.path)
    );
    const list = tray.createDiv({ cls: "slipbox-unfiled-list" });
    if (available.length === 0) {
      list.createEl("p", {
        cls: "slipbox-empty-copy",
        text: this.plugin.index.snapshot.unfiled.length === 0 ? "No unfiled cards." : "All unfiled cards are on the table."
      });
    }
    for (const file of available) {
      const title = this.plugin.cardTitle(file);
      const item = list.createDiv({ cls: "slipbox-unfiled-item" });
      const name = item.createEl("button", {
        text: title,
        cls: "slipbox-unfiled-open",
        attr: { type: "button" }
      });
      (0, import_obsidian4.setTooltip)(name, file.path);
      name.addEventListener("click", () => this.plugin.openMarkdownFile(file));
      const place = iconButton(item, "plus", `Place ${title} on Desk`);
      place.addEventListener("click", () => void this.plugin.putFileOnDesk(file));
      const fileButton = iconButton(item, "archive-restore", `File ${title}`);
      fileButton.addEventListener("click", () => void this.plugin.beginFiling(file));
    }
  }
  async renderCard(surface, state, version) {
    const file = this.plugin.index.fileAtPath(state.cardRef);
    const card = surface.createDiv({ cls: "slipbox-desk-card" });
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
    const title = this.plugin.cardTitle(file);
    card.toggleClass("is-unfiled", isUnfiled);
    card.toggleClass("is-invalid", filed === void 0 && !isUnfiled);
    const header = card.createDiv({ cls: "slipbox-desk-card-header" });
    const identity = header.createDiv({ cls: "slipbox-desk-card-identity" });
    identity.createSpan({
      cls: "slipbox-desk-card-address",
      text: filed?.id ?? (isUnfiled ? "unfiled" : "invalid Zettel")
    });
    if (this.plugin.settings.showTitleInDesk) {
      identity.createSpan({ cls: "slipbox-desk-card-title", text: title });
    }
    card.setAttr(
      "aria-label",
      `${filed?.id ?? (isUnfiled ? "unfiled" : "invalid Zettel")} \xB7 ${title}`
    );
    const actions = header.createDiv({ cls: "slipbox-desk-card-actions" });
    if (isUnfiled && this.plugin.settings.deskHeaderButtons["file-card"]) {
      const fileButton = iconButton(actions, "archive-restore", `File ${title}`);
      fileButton.addEventListener("pointerdown", (event) => event.stopPropagation());
      fileButton.addEventListener("click", () => void this.plugin.beginFiling(file));
    }
    if (this.plugin.settings.deskHeaderButtons["open-note"]) {
      const open = iconButton(actions, "file-pen-line", `Open ${title}`);
      open.addEventListener("pointerdown", (event) => event.stopPropagation());
      open.addEventListener("click", () => this.plugin.openMarkdownFile(file));
    }
    if (this.plugin.settings.deskHeaderButtons.remove) {
      const remove = iconButton(actions, "x", `Remove ${title} from Desk`);
      remove.addEventListener("pointerdown", (event) => event.stopPropagation());
      remove.addEventListener("click", () => void this.plugin.removeFromDesk(file.path));
    }
    this.attachDragging(card, header, state);
    card.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".slipbox-desk-card-header, button, a") !== null) {
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
    card.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("a, button, input, textarea, select") !== null) {
        return;
      }
      this.plugin.showCardContextMenu(
        event,
        file,
        filed?.id ?? null,
        DESK_VIEW_TYPE,
        this.leaf
      );
    });
    const scroll = card.createDiv({ cls: "slipbox-desk-card-scroll markdown-rendered" });
    this.cardFooters.render(card, {
      sourcePath: file.path,
      backlinks: filed === void 0 ? [] : this.plugin.index.backlinksForPath(file.path),
      interactive: filed !== void 0,
      activate: (backlink) => this.plugin.openMarkdownFile(backlink.file)
    });
    const component = new import_obsidian4.Component();
    component.load();
    this.renderComponents.push(component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (version === this.renderVersion) {
        await import_obsidian4.MarkdownRenderer.render(this.app, body, scroll, file.path, component);
      }
    } catch (error) {
      scroll.createEl("p", {
        cls: "slipbox-render-error",
        text: `Could not render this card: ${errorMessage2(error)}`
      });
    }
  }
  renderMissingCard(card, state) {
    const header = card.createDiv({ cls: "slipbox-desk-card-header" });
    header.createSpan({ cls: "slipbox-desk-card-address", text: "missing card" });
    const remove = iconButton(header, "x", "Remove missing card from Desk");
    remove.addEventListener("click", () => void this.plugin.removeFromDesk(state.cardRef));
    card.createDiv({
      cls: "slipbox-desk-missing-copy",
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
function iconButton(parent, icon, label) {
  const button = parent.createEl("button", {
    cls: "clickable-icon slipbox-icon-button",
    attr: { type: "button", "aria-label": label }
  });
  (0, import_obsidian4.setIcon)(button, icon);
  return button;
}
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/modals.ts
var import_obsidian5 = require("obsidian");
var TextPromptModal = class extends import_obsidian5.Modal {
  constructor(app, heading, placeholder, initialValue, resolveValue, allowBlank = false, submitLabel = "Save") {
    super(app);
    this.heading = heading;
    this.placeholder = placeholder;
    this.initialValue = initialValue;
    this.resolveValue = resolveValue;
    this.allowBlank = allowBlank;
    this.submitLabel = submitLabel;
  }
  settled = false;
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("slipbox-modal");
    contentEl.createEl("h2", { text: this.heading });
    const form = contentEl.createEl("form", { cls: "slipbox-prompt-form" });
    const input = form.createEl("input", {
      type: "text",
      placeholder: this.placeholder,
      value: this.initialValue
    });
    input.required = !this.allowBlank;
    const actions = form.createDiv({ cls: "slipbox-modal-actions" });
    const cancel = actions.createEl("button", { text: "Cancel", type: "button" });
    const submit = actions.createEl("button", {
      text: this.submitLabel,
      type: "submit",
      cls: "mod-cta"
    });
    cancel.addEventListener("click", () => this.finish(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (value === "" && !this.allowBlank) {
        new import_obsidian5.Notice("A name is required.");
        return;
      }
      this.finish(value);
    });
    activateDefaultButtonOnEnter(contentEl, submit);
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
function promptForNewCardTitle(app, placeholder) {
  return new Promise((resolve) => {
    const modal = new TextPromptModal(
      app,
      "New card title",
      placeholder,
      "",
      resolve,
      true,
      "Create"
    );
    window.setTimeout(() => modal.open());
  });
}
var TemplatePromptModal = class extends import_obsidian5.FuzzySuggestModal {
  constructor(app, files, folder, resolveFile) {
    super(app);
    this.files = files;
    this.folder = folder;
    this.resolveFile = resolveFile;
    this.setPlaceholder("Choose a template (Esc to skip)");
  }
  settled = false;
  getItems() {
    return [...this.files];
  }
  getItemText(file) {
    const prefix = `${this.folder}/`;
    return file.path.startsWith(prefix) ? file.path.slice(prefix.length, -3) : file.basename;
  }
  onChooseItem(file) {
    this.settled = true;
    this.resolveFile(file);
  }
  onClose() {
    super.onClose();
    if (!this.settled) {
      this.settled = true;
      this.resolveFile(null);
    }
  }
};
function promptForTemplate(app, files, folder) {
  return new Promise((resolve) => {
    new TemplatePromptModal(app, files, folder, resolve).open();
  });
}
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
var BookmarksModal = class extends import_obsidian5.Modal {
  constructor(app, bookmarks, actions) {
    super(app);
    this.bookmarks = bookmarks;
    this.actions = actions;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("slipbox-modal");
    contentEl.createEl("h2", { text: "Bookmarks" });
    contentEl.createEl("p", {
      cls: "slipbox-empty-copy",
      text: "One persistent physical bookmark may be attached to each filed card."
    });
    const list = contentEl.createDiv({ cls: "slipbox-modal-list" });
    if (this.bookmarks.length === 0) {
      list.createEl("p", { cls: "slipbox-empty-copy", text: "No bookmarks yet." });
    }
    for (const bookmark of this.bookmarks) {
      const available = this.actions.isAvailable(bookmark.zettelId);
      const row = list.createDiv({ cls: "slipbox-list-row slipbox-bookmark-row" });
      const visit = row.createEl("button", {
        cls: "slipbox-entry-visit",
        attr: { type: "button" }
      });
      visit.createSpan({
        cls: "slipbox-entry-name",
        text: available ? this.actions.label(bookmark.zettelId) : `${bookmark.zettelId} \xB7 missing`
      });
      visit.disabled = !available;
      visit.addEventListener("click", () => {
        this.actions.visit(bookmark.zettelId);
        this.close();
      });
      const remove = iconButton2(row, "trash-2", `Delete bookmark at ${bookmark.zettelId}`);
      remove.addEventListener("click", () => {
        void this.actions.remove(bookmark.zettelId).then(() => this.close());
      });
    }
    const footer = contentEl.createDiv({ cls: "slipbox-modal-actions" });
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
    activateDefaultButtonOnEnter(contentEl, add);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var EntryPointsModal = class extends import_obsidian5.Modal {
  constructor(app, entryPoints, actions) {
    super(app);
    this.entryPoints = entryPoints;
    this.actions = actions;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("slipbox-modal");
    contentEl.createEl("h2", { text: "Entry points" });
    const list = contentEl.createDiv({ cls: "slipbox-modal-list" });
    if (this.entryPoints.length === 0) {
      list.createEl("p", {
        cls: "slipbox-empty-copy",
        text: "No entry points yet."
      });
    }
    this.entryPoints.forEach((entry, index) => {
      const row = list.createDiv({ cls: "slipbox-list-row" });
      const available = this.actions.isAvailable(entry.id);
      const visit = row.createEl("button", {
        cls: "slipbox-entry-visit",
        attr: { type: "button" }
      });
      visit.createSpan({ cls: "slipbox-entry-name", text: entry.name });
      visit.createSpan({ cls: "slipbox-entry-id", text: entry.id });
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
    const footer = contentEl.createDiv({ cls: "slipbox-modal-actions" });
    const add = footer.createEl("button", {
      text: "+ Add current card as entry point",
      cls: "mod-cta",
      attr: { type: "button" }
    });
    add.disabled = this.actions.currentId === null;
    add.addEventListener("click", () => {
      void this.actions.addCurrent().then(() => this.close());
    });
    activateDefaultButtonOnEnter(contentEl, add);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var IssuesModal = class extends import_obsidian5.Modal {
  constructor(app, index, actions) {
    super(app);
    this.index = index;
    this.actions = actions;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("slipbox-modal");
    contentEl.createEl("h2", { text: "Zettel address problems" });
    contentEl.createEl("p", {
      text: "Deck never rewrites invalid or duplicate addresses. Correct the YAML in the affected notes."
    });
    const list = contentEl.createDiv({ cls: "slipbox-modal-list" });
    for (const issue of this.index.issues) {
      const group = list.createDiv({ cls: "slipbox-issue-group" });
      group.createDiv({ cls: "slipbox-issue-message", text: issue.message });
      for (const path of issue.paths) {
        const button = group.createEl("button", {
          cls: "slipbox-issue-file",
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
    cls: "clickable-icon slipbox-icon-button",
    attr: { type: "button", "aria-label": label }
  });
  (0, import_obsidian5.setIcon)(button, icon);
  return button;
}
function activateDefaultButtonOnEnter(container, button) {
  container.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || button.disabled) {
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, textarea, select, [contenteditable='true']") !== null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    button.click();
  });
}

// src/new-note.ts
var UNSAFE_FILENAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f]/g;
function safeNoteBasename(value) {
  const trimmed = value.trim();
  const safeContent = trimmed.replace(UNSAFE_FILENAME_CHARACTERS, "").replace(/[. ]+$/g, "").trim();
  if (safeContent === "") {
    return null;
  }
  const basename = trimmed.replace(UNSAFE_FILENAME_CHARACTERS, "-").replace(/-+/g, "-").replace(/[. ]+$/g, "").trim();
  return basename === "" ? null : basename;
}
function newNoteBasename(title, timestamp) {
  return safeNoteBasename(title) ?? safeNoteBasename(timestamp) ?? "Untitled";
}
function newCardBasename(title, timestamp, titleSource) {
  return newNoteBasename(titleSource === "filename" ? title : "", timestamp);
}
function newCardFrontmatterTitle(title, titleSource) {
  return titleSource === "frontmatter" ? title.trim() : null;
}
function newCardTitlePlaceholder(timestamp, titleSource) {
  return titleSource === "frontmatter" ? "Leave blank for an empty title" : `Leave blank to use ${timestamp} as the filename`;
}

// src/card-title.ts
function resolveCardTitle(basename, frontmatter, settings) {
  if (settings.titleSource !== "frontmatter") {
    return basename;
  }
  const value = frontmatter?.[settings.titleProperty];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : basename;
}

// src/settings-tab.ts
var import_obsidian6 = require("obsidian");
var SlipboxSettingTab = class extends import_obsidian6.PluginSettingTab {
  constructor(app, slipbox) {
    super(app, slipbox);
    this.slipbox = slipbox;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian6.Setting(containerEl).setName("Cards and metadata").setHeading();
    this.renderAddressProperty(containerEl);
    new import_obsidian6.Setting(containerEl).setName("Title source").setDesc("Choose the filename or a top-level frontmatter property for note titles. New cards use the entered title in the selected location.").addDropdown((dropdown) => {
      dropdown.addOption("filename", "Filename").addOption("frontmatter", "Frontmatter property").setValue(this.slipbox.settings.titleSource).onChange((value) => {
        void this.save({
          ...this.slipbox.settings,
          titleSource: value === "frontmatter" ? "frontmatter" : "filename"
        }).then(() => this.display());
      });
    });
    const titleProperty = new import_obsidian6.Setting(containerEl).setName("Title property").setDesc("Exact top-level YAML key. Missing, blank, or non-text values fall back to the filename.").setDisabled(this.slipbox.settings.titleSource !== "frontmatter");
    titleProperty.addText((text) => {
      text.setValue(this.slipbox.settings.titleProperty).setDisabled(this.slipbox.settings.titleSource !== "frontmatter").onChange((value) => {
        const property = value.trim();
        this.setPropertyValidity(titleProperty, property !== "");
        if (property !== "") {
          void this.save({ ...this.slipbox.settings, titleProperty: property });
        }
      });
    });
    new import_obsidian6.Setting(containerEl).setName("Show title in Deck headers").setDesc("Centre the title between the address and card buttons.").addToggle((toggle) => {
      toggle.setValue(this.slipbox.settings.showTitleInDeck).onChange((value) => void this.save({
        ...this.slipbox.settings,
        showTitleInDeck: value
      }));
    });
    new import_obsidian6.Setting(containerEl).setName("Show title in Desk headers").setDesc("Centre the title between the address and card buttons.").addToggle((toggle) => {
      toggle.setValue(this.slipbox.settings.showTitleInDesk).onChange((value) => void this.save({
        ...this.slipbox.settings,
        showTitleInDesk: value
      }));
    });
    new import_obsidian6.Setting(containerEl).setName("New cards").setHeading();
    this.renderNewCardSettings(containerEl);
    new import_obsidian6.Setting(containerEl).setName("Card-header buttons").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Hidden buttons remain available through commands, Deck shortcuts, and card context menus."
    });
    this.renderDeckHeaderButtons(containerEl);
    this.renderDeskHeaderButtons(containerEl);
    new import_obsidian6.Setting(containerEl).setName("Deck shortcuts").setHeading();
    const shortcutIntro = containerEl.createDiv({ cls: "slipbox-shortcut-intro" });
    shortcutIntro.createEl("p", {
      cls: "setting-item-description",
      text: "These shortcuts work only while Deck is active and never fire in text or form controls."
    });
    const resetAll = shortcutIntro.createEl("button", {
      text: "Reset all shortcuts",
      attr: { type: "button" }
    });
    resetAll.addEventListener("click", () => {
      void this.save({
        ...this.slipbox.settings,
        deckKeybindings: DEFAULT_DECK_KEYBINDINGS
      }).then(() => this.display());
    });
    for (const definition of DECK_ACTION_DEFINITIONS) {
      this.renderShortcutSetting(containerEl, definition.id, definition.label);
    }
  }
  renderNewCardSettings(container) {
    const folderSetting = new import_obsidian6.Setting(container).setName("New card folder").setDesc("Optional vault-folder override for notes created through Slipbox. Leave empty to inherit the source note\u2019s folder, or the vault root when no source note is active.");
    folderSetting.addDropdown((dropdown) => {
      dropdown.addOption("", "Source note\u2019s folder");
      const folders = this.app.vault.getAllLoadedFiles().filter(
        (file) => file instanceof import_obsidian6.TFolder && !file.isRoot()
      ).sort((left, right) => left.path.localeCompare(right.path));
      for (const folder of folders) {
        dropdown.addOption(folder.path, folder.path);
      }
      const current = this.slipbox.settings.newCardFolder;
      if (current !== "" && !folders.some((folder) => folder.path === current)) {
        dropdown.addOption(current, `${current} (missing)`);
      }
      dropdown.setValue(current).onChange((value) => void this.save({
        ...this.slipbox.settings,
        newCardFolder: value
      }));
    });
    const timestamp = new import_obsidian6.Setting(container).setName("Timestamp filename format").setDesc("Moment format used when the title is blank, or whenever titles come from frontmatter. Filename-unsafe characters become hyphens. Example: ");
    const sample = timestamp.descEl.createEl("code");
    timestamp.addMomentFormat((component) => {
      component.setSampleEl(sample).setDefaultFormat(DEFAULT_SETTINGS.newNoteTimestampFormat).setValue(this.slipbox.settings.newNoteTimestampFormat).onChange((value) => {
        const format = value.trim();
        this.setTextValidity(
          timestamp,
          format !== "",
          "A non-empty timestamp format is required."
        );
        if (format !== "") {
          void this.save({
            ...this.slipbox.settings,
            newNoteTimestampFormat: format
          });
        }
      });
    });
    const info = this.slipbox.templatesInfo();
    let templateSetting = null;
    new import_obsidian6.Setting(container).setName("Apply a template to new cards").setDesc("Use Obsidian\u2019s Templates core plugin after Slipbox creates and opens the note.").addToggle((toggle) => {
      toggle.setValue(this.slipbox.settings.useTemplatesForNewNotes).onChange((value) => void this.save({
        ...this.slipbox.settings,
        useTemplatesForNewNotes: value
      }).then(() => {
        templateSetting?.setDisabled(
          !value || !info.enabled || info.files.length === 0
        );
      }));
    });
    let description = "Choose a fixed template, or ask each time a card is created.";
    if (!info.enabled) {
      description = "Enable Obsidian\u2019s Templates core plugin to choose a template.";
    } else if (info.folder === "") {
      description = "Choose a template folder in the Templates core plugin settings first.";
    } else if (info.files.length === 0) {
      description = `No Markdown templates were found in ${info.folder}.`;
    }
    const templateDisabled = !this.slipbox.settings.useTemplatesForNewNotes || !info.enabled || info.files.length === 0;
    const template = new import_obsidian6.Setting(container).setName("New card template").setDesc(description).setDisabled(templateDisabled);
    templateSetting = template;
    template.addDropdown((dropdown) => {
      dropdown.addOption("", "Ask each time");
      for (const file of info.files) {
        const prefix = `${info.folder}/`;
        const label = file.path.startsWith(prefix) ? file.path.slice(prefix.length, -3) : file.basename;
        dropdown.addOption(file.path, label);
      }
      const current = this.slipbox.settings.newNoteTemplatePath;
      if (current !== "" && !info.files.some((file) => file.path === current)) {
        dropdown.addOption(current, `${current} (missing)`);
      }
      dropdown.setValue(current).setDisabled(templateDisabled).onChange((value) => void this.save({
        ...this.slipbox.settings,
        newNoteTemplatePath: value
      }));
    });
  }
  renderAddressProperty(container) {
    const setting = new import_obsidian6.Setting(container).setName("Address property").setDesc(
      "Exact top-level YAML key used to identify and order cards. Changing it re-indexes immediately but does not rewrite existing notes."
    );
    setting.addText((text) => {
      text.setPlaceholder("zettel-id").setValue(this.slipbox.settings.addressProperty).onChange((value) => {
        const property = value.trim();
        this.setPropertyValidity(setting, property !== "");
        if (property !== "") {
          void this.save({ ...this.slipbox.settings, addressProperty: property });
        }
      });
    });
  }
  renderDeckHeaderButtons(container) {
    const labels = {
      "add-card": "Add card from here",
      "open-note": "Open Markdown note",
      tray: "Pull into or return from Tray",
      desk: "Toggle Desk membership",
      bookmark: "Toggle bookmark"
    };
    for (const [id, label] of Object.entries(labels)) {
      new import_obsidian6.Setting(container).setName(`Deck: ${label}`).addToggle((toggle) => {
        const key = id;
        toggle.setValue(this.slipbox.settings.deckHeaderButtons[key]).onChange((value) => void this.save({
          ...this.slipbox.settings,
          deckHeaderButtons: {
            ...this.slipbox.settings.deckHeaderButtons,
            [key]: value
          }
        }));
      });
    }
  }
  renderDeskHeaderButtons(container) {
    const labels = {
      "file-card": "File card",
      "open-note": "Open Markdown note",
      remove: "Remove from Desk"
    };
    for (const [id, label] of Object.entries(labels)) {
      new import_obsidian6.Setting(container).setName(`Desk: ${label}`).addToggle((toggle) => {
        const key = id;
        toggle.setValue(this.slipbox.settings.deskHeaderButtons[key]).onChange((value) => void this.save({
          ...this.slipbox.settings,
          deskHeaderButtons: {
            ...this.slipbox.settings.deskHeaderButtons,
            [key]: value
          }
        }));
      });
    }
  }
  renderShortcutSetting(container, action, label) {
    const setting = new import_obsidian6.Setting(container).setName(label);
    setting.settingEl.addClass("slipbox-shortcut-setting");
    const bindings = setting.controlEl.createDiv({ cls: "slipbox-shortcut-bindings" });
    for (const bindingValue of this.slipbox.settings.deckKeybindings[action]) {
      const chip = bindings.createEl("button", {
        cls: "slipbox-shortcut-chip",
        attr: {
          type: "button",
          "aria-label": `Remove ${formatKeyBinding(bindingValue)} from ${label}`
        }
      });
      chip.createSpan({ text: formatKeyBinding(bindingValue) });
      chip.createSpan({ cls: "slipbox-shortcut-remove", text: "\xD7" });
      chip.addEventListener("click", () => {
        const signature = keyBindingSignature(bindingValue);
        void this.save({
          ...this.slipbox.settings,
          deckKeybindings: {
            ...this.slipbox.settings.deckKeybindings,
            [action]: this.slipbox.settings.deckKeybindings[action].filter(
              (candidate) => keyBindingSignature(candidate) !== signature
            )
          }
        }).then(() => this.display());
      });
    }
    const add = bindings.createEl("button", {
      text: "+ Add shortcut",
      attr: { type: "button" }
    });
    const error = setting.settingEl.createDiv({ cls: "slipbox-setting-error" });
    add.addEventListener("click", () => {
      if (add.hasClass("is-capturing")) {
        return;
      }
      error.empty();
      add.setText("Press shortcut\u2026");
      add.addClass("is-capturing");
      add.focus();
      const capture = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") {
          finish();
          return;
        }
        if (["Alt", "Control", "Meta", "Shift"].includes(event.key)) {
          return;
        }
        const candidate = this.bindingFromEvent(event);
        const conflict = keyBindingConflict(
          this.slipbox.settings.deckKeybindings,
          action,
          candidate
        );
        if (conflict !== null) {
          const conflictLabel = DECK_ACTION_DEFINITIONS.find(
            (definition2) => definition2.id === conflict
          )?.label ?? conflict;
          error.setText(`${formatKeyBinding(candidate)} is already assigned to ${conflictLabel}.`);
          return;
        }
        if (this.slipbox.settings.deckKeybindings[action].some(
          (bindingValue) => keyBindingSignature(bindingValue) === keyBindingSignature(candidate)
        )) {
          error.setText(`${formatKeyBinding(candidate)} is already assigned here.`);
          return;
        }
        finish();
        void this.save({
          ...this.slipbox.settings,
          deckKeybindings: {
            ...this.slipbox.settings.deckKeybindings,
            [action]: [
              ...this.slipbox.settings.deckKeybindings[action],
              candidate
            ]
          }
        }).then(() => this.display());
      };
      const finish = () => {
        add.removeEventListener("keydown", capture);
        add.removeClass("is-capturing");
        add.setText("+ Add shortcut");
      };
      add.addEventListener("keydown", capture);
    });
    const definition = DECK_ACTION_DEFINITIONS.find(
      (candidate) => candidate.id === action
    );
    const reset = bindings.createEl("button", {
      text: "Reset",
      attr: { type: "button", "aria-label": `Reset ${label} shortcuts` }
    });
    reset.addEventListener("click", () => {
      const defaults = definition?.defaultBindings ?? [];
      for (const bindingValue of defaults) {
        const conflict = keyBindingConflict(
          this.slipbox.settings.deckKeybindings,
          action,
          bindingValue
        );
        if (conflict !== null) {
          const conflictLabel = DECK_ACTION_DEFINITIONS.find(
            (candidate) => candidate.id === conflict
          )?.label ?? conflict;
          error.setText(
            `${formatKeyBinding(bindingValue)} is already assigned to ${conflictLabel}.`
          );
          return;
        }
      }
      void this.save({
        ...this.slipbox.settings,
        deckKeybindings: {
          ...this.slipbox.settings.deckKeybindings,
          [action]: defaults
        }
      }).then(() => this.display());
    });
  }
  bindingFromEvent(event) {
    const modifiers = [];
    const primary = import_obsidian6.Platform.isMacOS ? event.metaKey : event.ctrlKey;
    if (primary) {
      modifiers.push("Mod");
    }
    if (event.ctrlKey && import_obsidian6.Platform.isMacOS) {
      modifiers.push("Ctrl");
    }
    if (event.metaKey && !import_obsidian6.Platform.isMacOS) {
      modifiers.push("Meta");
    }
    if (event.altKey) {
      modifiers.push("Alt");
    }
    if (event.shiftKey) {
      modifiers.push("Shift");
    }
    return normalizeKeyBinding({ modifiers, key: event.key }) ?? {
      modifiers,
      key: event.key
    };
  }
  setPropertyValidity(setting, valid) {
    this.setTextValidity(
      setting,
      valid,
      "A non-empty top-level property name is required."
    );
  }
  setTextValidity(setting, valid, message) {
    setting.settingEl.toggleClass("is-invalid", !valid);
    let error = setting.settingEl.querySelector(".slipbox-setting-error");
    if (!valid && error === null) {
      error = setting.settingEl.createDiv({ cls: "slipbox-setting-error" });
    }
    error?.setText(valid ? "" : message);
  }
  async save(settings) {
    try {
      await this.slipbox.updateSettings(settings);
    } catch (error) {
      new import_obsidian6.Notice(`Could not save Slipbox settings: ${errorMessage3(error)}`);
    }
  }
};
function errorMessage3(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/zettel-index.ts
var import_obsidian7 = require("obsidian");

// src/zettel-metadata.ts
function zettelMetadataRecord(path, frontmatter, addressProperty) {
  const hasZettelId = frontmatter !== void 0 && Object.prototype.hasOwnProperty.call(frontmatter, addressProperty);
  return {
    path,
    hasZettelId,
    zettelId: hasZettelId ? frontmatter[addressProperty] : void 0
  };
}
function displayValue(value) {
  const serialized = JSON.stringify(value);
  return serialized === void 0 ? String(value) : serialized;
}
function indexZettelMetadata(records, addressProperty = "zettel-id") {
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
        message: `Unsupported ${addressProperty} ${displayValue(record.zettelId)}`
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
        message: `Duplicate ${addressProperty} ${id}`
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
  allValidIds: [],
  backlinksByTargetPath: /* @__PURE__ */ new Map()
};
var NO_BACKLINKS = [];
var ZettelIndex = class {
  constructor(app, addressProperty = "zettel-id") {
    this.app = app;
    this.addressProperty = addressProperty;
  }
  current = EMPTY_INDEX;
  get snapshot() {
    return this.current;
  }
  setAddressProperty(addressProperty) {
    this.addressProperty = addressProperty;
  }
  refresh() {
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const records = markdownFiles.map((file) => zettelMetadataRecord(
      file.path,
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      this.addressProperty
    ));
    const indexed = indexZettelMetadata(records, this.addressProperty);
    const filesByPath = new Map(markdownFiles.map((file) => [file.path, file]));
    const filed = [];
    for (const record of indexed.filed) {
      const file = filesByPath.get(record.path);
      if (file !== void 0) {
        filed.push({ ...record, file });
      }
    }
    const unfiled = indexed.unfiledPaths.map((path) => filesByPath.get(path)).filter((file) => file !== void 0);
    const backlinksByTargetPath = indexFiledBacklinks(
      filed,
      this.app.metadataCache.resolvedLinks
    );
    this.current = { ...indexed, filed, unfiled, backlinksByTargetPath };
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
    return file instanceof import_obsidian7.TFile ? file : void 0;
  }
  backlinksForPath(path) {
    return this.current.backlinksByTargetPath.get(path) ?? NO_BACKLINKS;
  }
  /** Read only the note body, excluding the YAML frontmatter block. */
  async readBody(file) {
    const source = await this.app.vault.cachedRead(file);
    const position = this.app.metadataCache.getFileCache(file)?.frontmatterPosition;
    return position === void 0 ? source : source.slice(position.end.offset);
  }
};

// src/main.ts
var SlipboxPlugin = class extends import_obsidian8.Plugin {
  state = DEFAULT_STATE;
  settings = DEFAULT_SETTINGS;
  tray = EMPTY_TRAY;
  index;
  indexRefreshTimer = null;
  spreadSaveTimer = null;
  filingWriteInProgress = false;
  cardCreationInProgress = false;
  persistQueue = Promise.resolve();
  trayPileSequence = 0;
  async onload() {
    const data = normalizePluginData(await this.loadData());
    this.settings = data.settings;
    this.state = data.state;
    this.index = new ZettelIndex(this.app, this.settings.addressProperty);
    this.index.refresh();
    this.reconcileSessionTray();
    await this.persistState();
    this.addSettingTab(new SlipboxSettingTab(this.app, this));
    this.registerView(
      DECK_VIEW_TYPE,
      (leaf) => new DeckView(leaf, this)
    );
    this.registerView(
      DESK_VIEW_TYPE,
      (leaf) => new DeskView(leaf, this)
    );
    this.registerHoverLinkSource(DECK_VIEW_TYPE, {
      display: "Slipbox Deck",
      defaultMod: false
    });
    this.registerHoverLinkSource(DESK_VIEW_TYPE, {
      display: "Slipbox Desk",
      defaultMod: false
    });
    this.addRibbonIcon("archive", "Open Slipbox Deck", () => {
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
      this.app.metadataCache.on("resolve", () => this.queueIndexRefresh())
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
      throw new Error("Obsidian did not create the Slipbox Deck view");
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
      throw new Error("Obsidian did not create the Slipbox Desk view");
    }
    return leaf.view;
  }
  setSpread(value) {
    const spread = Math.min(MAX_SPREAD, Math.max(MIN_SPREAD, value));
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
    return this.app.workspace.getLeaf("tab").openFile(file);
  }
  cardTitle(file) {
    return resolveCardTitle(
      file.basename,
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      this.settings
    );
  }
  templatesInfo() {
    const plugin = this.templatesPlugin();
    const configuredFolder = plugin?.options?.folder;
    if (plugin === null || typeof configuredFolder !== "string") {
      return { enabled: plugin !== null, folder: "", files: [] };
    }
    const folder = (0, import_obsidian8.normalizePath)(configuredFolder);
    if (folder === "") {
      return { enabled: true, folder, files: [] };
    }
    const prefix = `${folder}/`;
    const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(prefix)).sort((left, right) => left.path.localeCompare(right.path));
    return { enabled: true, folder, files };
  }
  async updateSettings(value) {
    const previousAddressProperty = this.settings.addressProperty;
    this.settings = normalizeSettings(value);
    this.index.setAddressProperty(this.settings.addressProperty);
    await this.persistState();
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.updateKeybindings();
      }
    }
    if (this.settings.addressProperty !== previousAddressProperty) {
      await this.refreshIndex();
    } else {
      await this.refreshViews();
    }
  }
  showCardContextMenu(event, file, zettelId, source, leaf) {
    event.preventDefault();
    event.stopPropagation();
    const isBookmarked = zettelId !== null && this.bookmarkAt(zettelId) !== void 0;
    const isOnDesk = this.state.deskCards.some(
      (card) => card.cardRef === file.path
    );
    const isInTray = trayContains(this.tray, file.path);
    const title = this.cardTitle(file);
    const menu = import_obsidian8.Menu.forEvent(event);
    menu.addItem((item) => {
      item.setTitle(`Open ${title}`).setIcon("file-pen-line").setSection("slipbox-card").onClick(() => void this.openMarkdownFile(file));
    });
    menu.addItem((item) => {
      item.setTitle(isBookmarked ? "Remove bookmark" : "Add bookmark").setIcon(isBookmarked ? "bookmark-minus" : "bookmark-plus").setSection("slipbox-card").setDisabled(zettelId === null).onClick(() => {
        if (zettelId !== null) {
          void this.toggleBookmark(zettelId);
        }
      });
    });
    menu.addItem((item) => {
      item.setTitle(isInTray ? "Return to Deck" : "Pull into Tray").setIcon(isInTray ? "undo-2" : "inbox").setSection("slipbox-card").setDisabled(zettelId === null).onClick(() => {
        if (zettelId !== null) {
          void this.toggleFileInTray(file);
        }
      });
    });
    menu.addItem((item) => {
      item.setTitle(isOnDesk ? "Remove from Desk" : "Add to Desk").setIcon("panels-top-left").setSection("slipbox-card").onClick(() => void this.toggleFileOnDesk(file));
    });
    menu.addItem((item) => {
      item.setTitle(`Add card from ${title}`).setIcon("plus").setSection("slipbox-card").setDisabled(zettelId === null).onClick(() => {
        if (zettelId !== null) {
          void this.createCardFrom(zettelId);
        }
      });
    });
    menu.addItem((item) => {
      item.setTitle(`Delete ${title}`).setIcon("trash-2").setWarning(true).setSection("slipbox-card-danger").onClick(() => void this.deleteCard(file));
    });
    this.app.workspace.trigger("file-menu", menu, file, source, leaf);
    menu.showAtMouseEvent(event);
  }
  async deleteCard(file) {
    if (!await this.app.fileManager.promptForDeletion(file)) {
      return;
    }
    try {
      await this.app.fileManager.trashFile(file);
    } catch (error) {
      new import_obsidian8.Notice(`Could not delete ${this.cardTitle(file)}: ${errorMessage4(error)}`);
    }
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
          new import_obsidian8.Notice(`Could not find ${path}.`);
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
      label: (id) => {
        const card = this.index.filedById(id);
        return card === void 0 ? id : `${id} \xB7 ${this.cardTitle(card.file)}`;
      },
      visit: (id) => void view.jumpToId(id),
      addCurrent: () => view.addBookmarkToCurrent(),
      remove: (zettelId) => view.removeBookmark(zettelId)
    }).open();
  }
  bookmarkAt(zettelId) {
    return this.state.bookmarks.find((bookmark) => bookmark.zettelId === zettelId);
  }
  async addBookmark(zettelId) {
    if (this.index.filedById(zettelId) === void 0) {
      new import_obsidian8.Notice("Only an available filed card can be bookmarked.");
      return;
    }
    if (this.bookmarkAt(zettelId) !== void 0) {
      const card = this.index.filedById(zettelId);
      const label = card === void 0 ? zettelId : `${zettelId} \xB7 ${this.cardTitle(card.file)}`;
      new import_obsidian8.Notice(`${label} already has a bookmark.`);
      return;
    }
    try {
      this.state = {
        ...this.state,
        bookmarks: createBookmark(this.state.bookmarks, zettelId)
      };
      await this.persistStateAndRefreshViews();
      const card = this.index.filedById(zettelId);
      const label = card === void 0 ? zettelId : `${zettelId} \xB7 ${this.cardTitle(card.file)}`;
      new import_obsidian8.Notice(`Bookmarked ${label}.`);
    } catch (error) {
      new import_obsidian8.Notice(`Could not add bookmark: ${errorMessage4(error)}`);
    }
  }
  async toggleBookmark(zettelId) {
    if (this.bookmarkAt(zettelId) === void 0) {
      await this.addBookmark(zettelId);
    } else {
      await this.removeBookmark(zettelId);
    }
  }
  createTrayPileId() {
    this.trayPileSequence += 1;
    return `tray-pile-${this.trayPileSequence}`;
  }
  async updateTray(next) {
    this.tray = next;
    await this.refreshDeckViews();
  }
  async toggleFileInTray(file) {
    this.index.refresh();
    const filed = this.index.filedByFile(file);
    if (filed === void 0) {
      new import_obsidian8.Notice("Only a uniquely filed card can be pulled into the Tray.");
      return;
    }
    this.tray = toggleFiledCard(
      this.tray,
      { cardRef: file.path, kind: "filed" },
      this.createTrayPileId()
    );
    await this.refreshDeckViews();
  }
  isFileInTray(file) {
    return trayContains(this.tray, file.path);
  }
  async expandTrayPile(pileId) {
    this.tray = setExpandedPile(this.tray, pileId);
    await this.refreshDeckViews();
  }
  async clearTrayPile(pileId) {
    this.tray = clearFiledCardsFromPile(this.tray, pileId);
    await this.refreshDeckViews();
  }
  async clearTray() {
    this.tray = clearFiledCardsFromTray(this.tray);
    await this.refreshDeckViews();
  }
  async putFileOnDesk(file, revealDesk = true) {
    this.index.refresh();
    const metadataState = this.cardMetadataState(file);
    if (metadataState !== "filed" && metadataState !== "unfiled") {
      new import_obsidian8.Notice("Only a filed or unfiled Slipbox card can be placed on Desk.");
      return;
    }
    if (this.state.deskCards.some((card) => card.cardRef === file.path)) {
      new import_obsidian8.Notice(`${this.cardTitle(file)} is already on Desk.`);
      if (revealDesk) {
        await this.openDesk();
      }
      return;
    }
    const position = this.nextDeskPosition();
    this.state = {
      ...this.state,
      deskCards: addDeskCard(this.state.deskCards, file.path, position)
    };
    await this.persistStateAndRefreshViews();
    if (revealDesk) {
      await this.openDesk();
    }
  }
  async toggleFileOnDesk(file) {
    if (this.state.deskCards.some((card) => card.cardRef === file.path)) {
      await this.removeFromDesk(file.path);
      return;
    }
    await this.putFileOnDesk(file, false);
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
      new import_obsidian8.Notice("Only an unfiled card can enter Filing Mode.");
      return;
    }
    await this.openDeck(file);
  }
  async addEntryPoint(id) {
    if (this.index.filedById(id) === void 0) {
      new import_obsidian8.Notice(`Card ${id} is not available in Deck.`);
      return;
    }
    if (this.state.entryPoints.some((entry) => entry.id === id)) {
      new import_obsidian8.Notice(`${id} is already an entry point.`);
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
    new import_obsidian8.Notice(`Added entry point \u201C${name}\u201D.`);
  }
  async createNewSection() {
    try {
      this.index.refresh();
      const id = generateNextSectionId(this.index.snapshot.allValidIds);
      const file = await this.createCardFile(id);
      if (file === null) {
        return;
      }
      this.queueIndexRefresh();
    } catch (error) {
      new import_obsidian8.Notice(`Could not create a section: ${errorMessage4(error)}`);
    }
  }
  async createCardFrom(attachmentId) {
    if (this.cardCreationInProgress) {
      return;
    }
    this.cardCreationInProgress = true;
    try {
      this.index.refresh();
      const attachment = this.index.filedById(attachmentId);
      if (attachment === void 0) {
        throw new Error(
          `Attachment ${attachmentId} is missing, invalid, or duplicated`
        );
      }
      const id = generateFiledId(
        attachmentId,
        this.index.snapshot.allValidIds
      );
      const file = await this.createCardFile(id, attachment.path);
      if (file === null) {
        return;
      }
      this.queueIndexRefresh();
    } catch (error) {
      new import_obsidian8.Notice(
        `Could not add a card from ${attachmentId}: ${errorMessage4(error)}`
      );
    } finally {
      this.cardCreationInProgress = false;
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
        const property = this.settings.addressProperty;
        const hasId = Object.prototype.hasOwnProperty.call(
          frontmatter,
          property
        );
        const current = frontmatter[property];
        if (!hasId || !(current === "" || current === null || current === void 0)) {
          throw new Error(
            `The card is no longer unfiled; its ${property} was not changed`
          );
        }
        frontmatter[property] = newId;
      });
      await this.waitForCachedId(file, newId);
      this.index.refresh();
      this.reconcileSessionTray();
      await this.refreshViews();
      new import_obsidian8.Notice(`Filed ${this.cardTitle(file)} as ${newId}.`);
      return newId;
    } catch (error) {
      new import_obsidian8.Notice(`Could not file the card: ${errorMessage4(error)}`);
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
      callback: () => {
        const deck = this.app.workspace.getActiveViewOfType(DeckView);
        if (deck === null) {
          void this.openDesk();
        } else {
          deck.runAction("open-desk");
        }
      }
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
      callback: () => {
        const deck = this.app.workspace.getActiveViewOfType(DeckView);
        if (deck === null) {
          void this.createNewSection();
        } else {
          deck.runAction("new-section");
        }
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
    this.addCommand({
      id: "put-current-card-on-desk",
      name: "Toggle current card on Desk",
      checkCallback: (checking) => {
        const file = this.currentCardFile();
        const available = file !== null;
        if (checking) {
          return available;
        }
        if (available && file !== null) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck !== null) {
            deck.runAction("toggle-desk");
          } else {
            void this.toggleFileOnDesk(file);
          }
        }
        return available;
      }
    });
    this.addCommand({
      id: "toggle-tray",
      name: "Pull current card into or return it from Tray",
      checkCallback: (checking) => {
        const file = this.currentCardFile();
        const available = file !== null && this.index.filedByFile(file) !== void 0;
        if (checking) {
          return available;
        }
        if (available && file !== null) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck !== null) {
            deck.runAction("toggle-tray");
          } else {
            void this.toggleFileInTray(file);
          }
        }
        return available;
      }
    });
    this.addCommand({
      id: "add-bookmark-current-card",
      name: "Toggle bookmark on current card",
      checkCallback: (checking) => {
        const id = this.currentFiledId();
        const available = id !== null;
        if (checking) {
          return available;
        }
        if (available && id !== null) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck !== null) {
            deck.runAction("toggle-bookmark");
          } else {
            void this.toggleBookmark(id);
          }
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
          view.runAction("back");
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
          view.runAction("forward");
        }
        return available;
      }
    });
    this.addCommand({
      id: "open-current-card-markdown",
      name: "Open current card in Markdown",
      checkCallback: (checking) => {
        const file = this.currentCardFile();
        if (checking) {
          return file !== null;
        }
        if (file !== null) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck !== null) {
            deck.runAction("open-note");
          } else {
            void this.openMarkdownFile(file);
          }
        }
        return file !== null;
      }
    });
    this.addCommand({
      id: "add-card-from-current",
      name: "Add card from current card",
      checkCallback: (checking) => {
        const id = this.currentFiledId();
        if (checking) {
          return id !== null;
        }
        if (id !== null) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck !== null) {
            deck.runAction("add-card");
          } else {
            void this.createCardFrom(id);
          }
        }
        return id !== null;
      }
    });
    this.registerDeckCommand("previous-card", "Previous card", "previous-card");
    this.registerDeckCommand("next-card", "Next card", "next-card");
    this.registerDeckCommand("centre-active-card", "Centre active card", "centre-card");
    this.registerDeckCommand("first-card", "First card", "first-card");
    this.registerDeckCommand("last-card", "Last card", "last-card");
    this.addCommand({
      id: "manage-entry-points",
      name: "Manage entry points",
      callback: () => void this.openDeck().then((view) => {
        view.runAction("entry-points");
      })
    });
    this.addCommand({
      id: "manage-bookmarks",
      name: "Manage bookmarks",
      callback: () => void this.openDeck().then((view) => {
        view.runAction("bookmarks");
      })
    });
    this.addCommand({
      id: "show-card-problems",
      name: "Show card problems",
      checkCallback: (checking) => {
        this.index.refresh();
        const available = this.index.snapshot.issues.length > 0;
        if (checking) {
          return available;
        }
        if (available) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck === null) {
            this.showIssues();
          } else {
            deck.runAction("problems");
          }
        }
        return available;
      }
    });
    this.registerDeckCommand("file-here", "File here", "file-here");
    this.registerDeckCommand("cancel-filing", "Cancel filing", "cancel-filing");
  }
  registerDeckCommand(id, name, action) {
    this.addCommand({
      id,
      name,
      checkCallback: (checking) => {
        const view = this.currentDeckView();
        const available = view?.canRunAction(action) ?? false;
        if (checking) {
          return available;
        }
        if (available && view !== null) {
          view.runAction(action);
        }
        return available;
      }
    });
  }
  async createNewCard() {
    try {
      const placeOnDesk = this.app.workspace.getActiveViewOfType(DeskView) !== null;
      const file = await this.createCardFile(null);
      if (file === null) {
        return;
      }
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
      this.queueIndexRefresh();
    } catch (error) {
      new import_obsidian8.Notice(`Could not create a card: ${errorMessage4(error)}`);
    }
  }
  async makeNoteCard(file) {
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const property = this.settings.addressProperty;
        if (Object.prototype.hasOwnProperty.call(frontmatter, property)) {
          throw new Error(`This note already has a ${property} property`);
        }
        frontmatter[property] = "";
      });
      this.queueIndexRefresh();
      new import_obsidian8.Notice(`${this.cardTitle(file)} is now an unfiled card.`);
    } catch (error) {
      new import_obsidian8.Notice(`Could not make this note a card: ${errorMessage4(error)}`);
    }
  }
  async createCardFile(id, sourcePath) {
    const timestamp = newNoteBasename(
      "",
      (0, import_obsidian8.moment)().format(this.settings.newNoteTimestampFormat)
    );
    const title = await promptForNewCardTitle(
      this.app,
      newCardTitlePlaceholder(timestamp, this.settings.titleSource)
    );
    if (title === null) {
      return null;
    }
    const basename = newCardBasename(
      title,
      timestamp,
      this.settings.titleSource
    );
    const parent = this.newCardParent(
      sourcePath ?? this.activeCreationSourcePath()
    );
    const template = await this.resolveNewNoteTemplate();
    const prefix = parent.isRoot() ? "" : `${parent.path}/`;
    let sequence = 0;
    let path;
    do {
      const suffix = sequence === 0 ? "" : ` ${sequence + 1}`;
      path = (0, import_obsidian8.normalizePath)(`${prefix}${basename}${suffix}.md`);
      sequence += 1;
    } while (this.app.vault.getAbstractFileByPath(path) !== null);
    const properties = {
      [this.settings.addressProperty]: id ?? ""
    };
    const frontmatterTitle = newCardFrontmatterTitle(
      title,
      this.settings.titleSource
    );
    if (frontmatterTitle !== null && this.settings.titleProperty !== this.settings.addressProperty) {
      properties[this.settings.titleProperty] = frontmatterTitle;
    }
    const frontmatter = (0, import_obsidian8.stringifyYaml)(properties);
    const file = await this.app.vault.create(
      path,
      `---
${frontmatter}---

`
    );
    await this.openMarkdownFile(file);
    if (template !== null) {
      const view = this.app.workspace.getActiveViewOfType(import_obsidian8.MarkdownView);
      if (view?.file?.path !== file.path) {
        new import_obsidian8.Notice("Could not apply the new-card template: the note editor is not active.");
      } else {
        const lastLine = view.editor.lastLine();
        view.editor.setCursor({
          line: lastLine,
          ch: view.editor.getLine(lastLine).length
        });
        try {
          await template.plugin.insertTemplate(template.file);
        } catch (error) {
          new import_obsidian8.Notice(`Could not apply the new-card template: ${errorMessage4(error)}`);
        }
      }
    }
    return file;
  }
  activeCreationSourcePath() {
    return this.app.workspace.getActiveViewOfType(DeckView)?.activeCard?.file.path ?? this.app.workspace.getActiveFile()?.path;
  }
  newCardParent(sourcePath) {
    const path = this.settings.newCardFolder;
    if (path === "") {
      const source = sourcePath === void 0 ? null : this.app.vault.getAbstractFileByPath(sourcePath);
      return source instanceof import_obsidian8.TFile && source.parent !== null ? source.parent : this.app.vault.getRoot();
    }
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!(folder instanceof import_obsidian8.TFolder)) {
      throw new Error(
        `The configured new-card folder \u201C${path}\u201D does not exist`
      );
    }
    return folder;
  }
  templatesPlugin() {
    const app = this.app;
    const candidate = app.internalPlugins?.getEnabledPluginById("templates");
    if (typeof candidate !== "object" || candidate === null || !("insertTemplate" in candidate) || typeof candidate.insertTemplate !== "function") {
      return null;
    }
    return candidate;
  }
  async resolveNewNoteTemplate() {
    if (!this.settings.useTemplatesForNewNotes) {
      return null;
    }
    const plugin = this.templatesPlugin();
    const info = this.templatesInfo();
    if (plugin === null) {
      new import_obsidian8.Notice("Enable Obsidian\u2019s Templates core plugin to apply templates to new cards.");
      return null;
    }
    if (info.folder === "" || info.files.length === 0) {
      new import_obsidian8.Notice("Configure a Templates folder containing at least one template to use it for new cards.");
      return null;
    }
    let file = null;
    if (this.settings.newNoteTemplatePath !== "") {
      file = info.files.find(
        (candidate) => candidate.path === this.settings.newNoteTemplatePath
      ) ?? null;
      if (file === null) {
        new import_obsidian8.Notice("The configured new-card template is missing. Choose another template.");
      }
    }
    if (file === null) {
      file = await promptForTemplate(this.app, info.files, info.folder);
    }
    return file === null ? null : { plugin, file };
  }
  cardMetadataState(file) {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (frontmatter === void 0 || !Object.prototype.hasOwnProperty.call(
      frontmatter,
      this.settings.addressProperty
    )) {
      return "ordinary";
    }
    const value = frontmatter[this.settings.addressProperty];
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
    const card = this.index.filedById(zettelId);
    const label = card === void 0 ? zettelId : `${zettelId} \xB7 ${this.cardTitle(card.file)}`;
    this.state = {
      ...this.state,
      bookmarks: deleteBookmark(this.state.bookmarks, zettelId)
    };
    await this.persistStateAndRefreshViews();
    new import_obsidian8.Notice(`Deleted bookmark at ${label}.`);
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
    new import_obsidian8.Notice(`Deleted entry point \u201C${removed.name}\u201D.`);
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
    this.reconcileSessionTray();
    await this.refreshViews();
  }
  async refreshDeckViews() {
    await Promise.all(
      this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE).flatMap(
        (leaf) => leaf.view instanceof DeckView ? [leaf.view.refresh()] : []
      )
    );
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
    const write = this.persistQueue.then(() => this.saveData({
      schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
      settings: this.settings,
      state: this.state
    }));
    this.persistQueue = write.catch(() => void 0);
    try {
      await write;
    } catch (error) {
      new import_obsidian8.Notice(`Could not save Slipbox state: ${errorMessage4(error)}`);
    }
  }
  async waitForCachedId(file, expectedId) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const value = this.app.metadataCache.getFileCache(file)?.frontmatter?.[this.settings.addressProperty];
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
    this.tray = removeTrayPath(this.tray, file.path);
    void this.refreshDeckViews();
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
    this.tray = renameTrayPath(this.tray, oldPath, file.path);
    void this.refreshDeckViews();
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
  reconcileSessionTray() {
    const candidates = [
      ...this.index.snapshot.unfiled.map((file) => ({
        cardRef: file.path,
        kind: "unfiled",
        modifiedTime: file.stat.mtime
      })),
      ...this.index.snapshot.filed.map((card) => ({
        cardRef: card.path,
        kind: "filed",
        modifiedTime: card.file.stat.mtime
      }))
    ];
    this.tray = reconcileTray(this.tray, candidates, this.createTrayPileId());
  }
};
function errorMessage4(error) {
  return error instanceof Error ? error.message : String(error);
}
