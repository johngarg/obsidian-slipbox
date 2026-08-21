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

// src/address-order.ts
var NATURAL_RUN_PATTERN = /[0-9]+|[^0-9]+/gu;
function containsControlOrLineSeparator(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit >= 127 && codeUnit <= 159 || codeUnit === 8232 || codeUnit === 8233) {
      return true;
    }
  }
  return false;
}
function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function numericMagnitude(run) {
  const significant = run.replace(/^0+/u, "");
  return significant === "" ? "0" : significant;
}
function compareNumericRuns(left, right) {
  const leftMagnitude = numericMagnitude(left);
  const rightMagnitude = numericMagnitude(right);
  if (leftMagnitude.length !== rightMagnitude.length) {
    return leftMagnitude.length < rightMagnitude.length ? -1 : 1;
  }
  const magnitudeComparison = compareCodeUnits(leftMagnitude, rightMagnitude);
  if (magnitudeComparison !== 0) {
    return magnitudeComparison;
  }
  return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
}
function compareAddressesLexicographic(left, right) {
  return compareCodeUnits(left, right);
}
function compareAddressesNatural(left, right) {
  const leftRuns = left.match(NATURAL_RUN_PATTERN) ?? [];
  const rightRuns = right.match(NATURAL_RUN_PATTERN) ?? [];
  const sharedLength = Math.min(leftRuns.length, rightRuns.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftRun = leftRuns[index];
    const rightRun = rightRuns[index];
    if (leftRun === void 0 || rightRun === void 0) {
      continue;
    }
    const comparison = /^[0-9]/u.test(leftRun) && /^[0-9]/u.test(rightRun) ? compareNumericRuns(leftRun, rightRun) : compareCodeUnits(leftRun, rightRun);
    if (comparison !== 0) {
      return comparison;
    }
  }
  if (leftRuns.length !== rightRuns.length) {
    return leftRuns.length < rightRuns.length ? -1 : 1;
  }
  return compareCodeUnits(left, right);
}
function addressComparatorFor(ordering) {
  return ordering === "lexicographic" ? compareAddressesLexicographic : compareAddressesNatural;
}
function compareVaultPaths(left, right) {
  return compareCodeUnits(left, right);
}
function cardComparatorFor(ordering) {
  const compareAddress = addressComparatorFor(ordering);
  return (left, right) => {
    const addressComparison = compareAddress(left.address, right.address);
    return addressComparison !== 0 ? addressComparison : compareVaultPaths(left.path, right.path);
  };
}
function candidateInsertionIndex(filed, candidate, ordering) {
  const compare = cardComparatorFor(ordering);
  let low = 0;
  let high = filed.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const card = filed[middle];
    if (card !== void 0 && compare(card, candidate) < 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}
function validateAddress(address) {
  if (address === "") {
    return { valid: false, message: "Enter an address." };
  }
  if (address.trim() !== address) {
    return {
      valid: false,
      message: "Address has leading or trailing whitespace."
    };
  }
  if (containsControlOrLineSeparator(address)) {
    return {
      valid: false,
      message: "Address must be one line without control characters."
    };
  }
  return { valid: true, address };
}
function normalizeAddressInput(input) {
  return validateAddress(input.trim());
}

// src/path-reference.ts
function pathIsAtOrBelow(path, target) {
  const prefix = `${target.replace(/\/$/, "")}/`;
  return path === target || path.startsWith(prefix);
}
function renamePathReference(path, oldPath, newPath) {
  if (path === oldPath) {
    return newPath;
  }
  const oldPrefix = `${oldPath.replace(/\/$/, "")}/`;
  if (!path.startsWith(oldPrefix)) {
    return path;
  }
  const newPrefix = `${newPath.replace(/\/$/, "")}/`;
  return `${newPrefix}${path.slice(oldPrefix.length)}`;
}

// src/bookmarks.ts
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isPathBookmark(bookmark) {
  return "path" in bookmark;
}
function normalizeBookmarks(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenPaths = /* @__PURE__ */ new Set();
  const seenLegacyIds = /* @__PURE__ */ new Set();
  const bookmarks = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      continue;
    }
    if (typeof candidate.path === "string" && candidate.path !== "") {
      if (!seenPaths.has(candidate.path)) {
        seenPaths.add(candidate.path);
        bookmarks.push({ path: candidate.path });
      }
      continue;
    }
    if (typeof candidate.zettelId === "string" && validateAddress(candidate.zettelId).valid && !seenLegacyIds.has(candidate.zettelId)) {
      seenLegacyIds.add(candidate.zettelId);
      bookmarks.push({ zettelId: candidate.zettelId });
    }
  }
  return bookmarks;
}
function migrateAddressBookmarks(bookmarks, firstPathAtAddress) {
  const seenPaths = /* @__PURE__ */ new Set();
  const migrated = [];
  for (const bookmark of bookmarks) {
    const path = isPathBookmark(bookmark) ? bookmark.path : firstPathAtAddress(bookmark.zettelId);
    if (path === void 0 || path === "" || seenPaths.has(path)) {
      continue;
    }
    seenPaths.add(path);
    migrated.push({ path });
  }
  return migrated;
}
function createBookmark(bookmarks, path) {
  if (path === "") {
    throw new Error("A bookmark path is required");
  }
  if (bookmarks.some(
    (bookmark) => isPathBookmark(bookmark) && bookmark.path === path
  )) {
    throw new Error(`${path} already has a bookmark`);
  }
  return [...bookmarks, { path }];
}
function deleteBookmark(bookmarks, path) {
  return bookmarks.filter(
    (bookmark) => !isPathBookmark(bookmark) || bookmark.path !== path
  );
}
function renameBookmarkPaths(bookmarks, oldPath, newPath) {
  return normalizeBookmarks(bookmarks.map((bookmark) => {
    if (!isPathBookmark(bookmark)) {
      return bookmark;
    }
    return { path: renamePathReference(bookmark.path, oldPath, newPath) };
  }));
}
function removeBookmarkPaths(bookmarks, deletedPath) {
  return bookmarks.filter(
    (bookmark) => !isPathBookmark(bookmark) || !pathIsAtOrBelow(bookmark.path, deletedPath)
  );
}

// src/deck-view.ts
var import_obsidian3 = require("obsidian");

// src/deck-motion.ts
var DEFAULT_ACTIVE_HYSTERESIS = 0.06;
function cardStackOrder(cardIndex, activeIndex) {
  return cardIndex === activeIndex ? 220 : 100 - Math.abs(cardIndex - activeIndex);
}
function stationarySelectionOffset(previousActiveIndex, targetIndex, currentViewportOffset) {
  const viewportPosition = previousActiveIndex < 0 ? targetIndex : previousActiveIndex + currentViewportOffset;
  return viewportPosition - targetIndex;
}
function bookmarkEdgeTargets(bookmarkIndices, viewportPosition, cardStep, stageWidth, cardWidth) {
  if (cardStep <= 0 || stageWidth <= 0 || cardWidth <= 0) {
    return { left: null, right: null };
  }
  const visibleLimit = Math.max(0, (stageWidth - cardWidth) / 2);
  let left = null;
  let leftX = Number.NEGATIVE_INFINITY;
  let right = null;
  let rightX = Number.POSITIVE_INFINITY;
  for (const index of bookmarkIndices) {
    const x = (index - viewportPosition) * cardStep;
    if (x < -visibleLimit && x > leftX) {
      left = index;
      leftX = x;
    } else if (x > visibleLimit && x < rightX) {
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
function cardMotionStyle(cardIndex, viewportPosition, cardStep, isActive = false, focusPosition = viewportPosition) {
  const safeStep = Math.max(cardStep, 1);
  const focusDistance = Math.abs(cardIndex - focusPosition);
  const distanceScale = Math.max(0.86, 1 - focusDistance * 0.035);
  return {
    translateX: (cardIndex - viewportPosition) * safeStep,
    scale: isActive ? Math.max(0.98, distanceScale) : distanceScale,
    opacity: isActive ? 1 : Math.max(0.42, 1 - focusDistance * 0.13)
  };
}
function centredViewportPosition(targetIndex, cardCount) {
  return clampViewportPosition(targetIndex, cardCount);
}
function deckIndexByDelta(activeIndex, delta, cardCount) {
  if (cardCount <= 0 || activeIndex < 0 || activeIndex >= cardCount) {
    return -1;
  }
  return Math.max(
    0,
    Math.min(cardCount - 1, activeIndex + Math.trunc(delta))
  );
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
  /** Rewrite or remove stored locations after file and folder path changes. */
  transform(transformLocation) {
    const transformed = [];
    let transformedIndex = -1;
    this.entries.forEach((entry, index) => {
      const next = transformLocation(entry);
      if (next === void 0) {
        return;
      }
      const previous = transformed[transformed.length - 1];
      if (previous === void 0 || !this.equals(previous, next)) {
        transformed.push(next);
      }
      if (index <= this.index) {
        transformedIndex = transformed.length - 1;
      }
    });
    this.entries = transformed;
    this.index = transformedIndex;
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
  const filedRank = new Map(filed.map((card, index) => [card.path, index]));
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
    sources.sort((left, right) => (filedRank.get(left.path) ?? -1) - (filedRank.get(right.path) ?? -1));
  }
  return sourcesByTarget;
}
function fitMeasuredBacklinkPrefix(availableWidth, itemWidths, totalCount, separatorWidth, overflowWidth) {
  const widths = itemWidths.map((width) => Math.max(0, width));
  const available = Math.max(0, availableWidth);
  const separator = Math.max(0, separatorWidth);
  const count = Number.isInteger(totalCount) ? Math.max(widths.length, totalCount) : widths.length;
  let bestVisibleCount = 0;
  let prefixWidth = 0;
  for (let visibleCount = 0; visibleCount <= widths.length; visibleCount += 1) {
    const hiddenCount = count - visibleCount;
    const widthWithOverflow = prefixWidth + (hiddenCount > 0 && visibleCount > 0 ? separator : 0) + (hiddenCount > 0 ? Math.max(0, overflowWidth(hiddenCount)) : 0);
    if (widthWithOverflow <= available) {
      bestVisibleCount = visibleCount;
    }
    const nextWidth = widths[visibleCount];
    if (nextWidth !== void 0) {
      prefixWidth += (visibleCount > 0 ? separator : 0) + nextWidth;
    }
  }
  return {
    visibleCount: bestVisibleCount,
    hiddenCount: count - bestVisibleCount
  };
}

// src/deck-actions.ts
function trayToggleLabel(inTray) {
  return inTray ? "Return" : "Pull out";
}
function canRunDeckAction(action, context) {
  switch (action) {
    case "previous-card":
      return context.hasPreviousCard;
    case "next-card":
      return context.hasNextCard;
    case "forward-ten-cards":
    case "backward-ten-cards":
      return context.hasActiveCard;
    case "centre-card":
    case "open-note":
    case "copy-link":
    case "toggle-tray":
    case "toggle-bookmark":
    case "find-address-forward":
    case "find-address-backward":
    case "find-address-first":
    case "pull-into-pile":
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
    case "confirm-filing":
      return context.filing;
    case "cancel-filing":
      return context.filing;
    case "bookmarks":
    case "toggle-toolbar":
    case "toggle-deck-map":
      return true;
  }
}

// src/card-footer.ts
var BACKLINK_MEASUREMENT_LIMIT = 64;
var CardFooterManager = class {
  constructor(environment) {
    this.environment = environment;
    this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
  }
  entries = /* @__PURE__ */ new Set();
  entriesByFooter = /* @__PURE__ */ new Map();
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
      const measureItems = options.backlinks.slice(0, BACKLINK_MEASUREMENT_LIMIT).map(
        (backlink) => measure.createSpan({
          cls: "slipbox-card-backlink",
          text: backlink.address
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
    this.entriesByFooter.set(footer, entry);
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
    const entry = this.entriesByFooter.get(footer);
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
    this.entriesByFooter.clear();
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
    const fit = fitMeasuredBacklinkPrefix(
      content.clientWidth,
      measureItems.map((item) => item.getBoundingClientRect().width),
      entry.backlinks.length,
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
          this.environment.runAfterEditing("backlink-overflow", () => {
            this.showOverflowMenu(entry, overflow, fit.visibleCount);
          });
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
    const anchor = parent.createEl("a", {
      cls: "internal-link slipbox-card-backlink",
      text: backlink.address,
      attr: {
        href: linktext,
        "aria-label": `Backlink from card ${backlink.address}`
      }
    });
    anchor.dataset.href = linktext;
    anchor.draggable = false;
    anchor.tabIndex = tabbable && entry.interactive ? 0 : -1;
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
    this.environment.runAfterEditing("backlink", async () => {
      if (newLeaf) {
        await this.environment.app.workspace.openLinkText(
          linktext,
          entry.sourcePath,
          newLeaf
        );
        return;
      }
      this.closeOverflowMenu();
      await entry.activate(backlink);
    });
  }
  showOverflowMenu(entry, button, visibleCount) {
    this.closeOverflowMenu();
    const menu = new import_obsidian.Menu().setUseNativeMenu(false);
    for (const backlink of entry.backlinks.slice(visibleCount)) {
      menu.addItem((item) => {
        const title = createFragment();
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
    const inTray = this.environment.isInTray(backlink.file);
    const menu = import_obsidian.Menu.forEvent(event);
    menu.addItem((item) => {
      item.setTitle(trayToggleLabel(inTray)).setIcon(inTray ? "undo-2" : "inbox").onClick(() => this.environment.runAfterEditing(
        "backlink-tray-toggle",
        () => this.environment.toggleTray(backlink.file)
      ));
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

// src/card-title.ts
function cardHeaderTitle(resolvedTitle, showTitle) {
  return showTitle ? resolvedTitle : null;
}
function resolveCardTitle(basename, frontmatter, settings) {
  if (settings.titleSource !== "frontmatter") {
    return basename;
  }
  const value = frontmatter?.[settings.titleProperty];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : basename;
}

// src/card-links.ts
function resolveFiledCardLink(linkPath, sourcePath, lookup) {
  const file = lookup.resolveFile(linkPath, sourcePath);
  if (file !== null) {
    const path2 = lookup.filedPathForFile(file);
    return path2 === void 0 ? void 0 : { path: path2, resolvedBy: "file" };
  }
  const path = lookup.firstFiledPathAtAddress(linkPath);
  return path === void 0 ? void 0 : { path, resolvedBy: "address" };
}
function renderedLinkAction(internal, newLeaf, linktext, filed) {
  if (!internal) {
    return { kind: "external" };
  }
  if (!newLeaf && filed !== void 0) {
    return { kind: "card", path: filed.path };
  }
  return {
    kind: "note",
    linktext: filed?.resolvedBy === "address" ? filed.path : linktext
  };
}
function generateFiledCardLink(app, file, sourcePath, address) {
  return app.fileManager.generateMarkdownLink(
    file,
    sourcePath,
    void 0,
    address
  );
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
var SLIPBOX_DATA_SCHEMA_VERSION = 5;
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
    defaultBindings: [binding("0")]
  },
  {
    id: "last-card",
    label: "Last card",
    repeatable: false,
    defaultBindings: [binding("$", ["Shift"])]
  },
  {
    id: "forward-ten-cards",
    label: "Move forward ten cards",
    repeatable: true,
    defaultBindings: [binding("d", ["Ctrl"])]
  },
  {
    id: "backward-ten-cards",
    label: "Move backward ten cards",
    repeatable: true,
    defaultBindings: [binding("u", ["Ctrl"])]
  },
  {
    id: "open-note",
    label: "Open Markdown note",
    repeatable: false,
    defaultBindings: [binding("o")]
  },
  {
    id: "toggle-tray",
    label: "Pull out or return card",
    repeatable: false,
    defaultBindings: [binding("p")]
  },
  {
    id: "toggle-bookmark",
    label: "Toggle bookmark",
    repeatable: false,
    defaultBindings: [binding("b")]
  },
  {
    id: "back",
    label: "Back",
    repeatable: false,
    defaultBindings: [binding("h", ["Shift"])]
  },
  {
    id: "forward",
    label: "Forward",
    repeatable: false,
    defaultBindings: [binding("l", ["Shift"])]
  },
  {
    id: "find-address-forward",
    label: "Find next address initial",
    description: "Type the address's first character after this prefix.",
    repeatable: false,
    defaultBindings: [binding("f")]
  },
  {
    id: "find-address-backward",
    label: "Find previous address initial",
    description: "Type the address's first character after this prefix.",
    repeatable: false,
    defaultBindings: [binding("f", ["Shift"])]
  },
  {
    id: "find-address-first",
    label: "Go to first address initial",
    description: "Type the address's first character after this prefix.",
    repeatable: false,
    defaultBindings: [binding("g")]
  },
  {
    id: "pull-into-pile",
    label: "Pull into numbered pile",
    description: "Type a one-based pile number, then press Enter.",
    repeatable: false,
    defaultBindings: [binding("p", ["Shift"])]
  },
  {
    id: "toggle-toolbar",
    label: "Toggle toolbar visibility",
    repeatable: false,
    defaultBindings: [binding("t")]
  },
  {
    id: "toggle-deck-map",
    label: "Toggle Deck-map visibility",
    repeatable: false,
    defaultBindings: [binding("m")]
  },
  {
    id: "bookmarks",
    label: "Manage bookmarks",
    repeatable: false,
    defaultBindings: []
  },
  {
    id: "problems",
    label: "Show card problems",
    repeatable: false,
    defaultBindings: []
  },
  {
    id: "confirm-filing",
    label: "File card",
    repeatable: false,
    defaultBindings: []
  },
  {
    id: "cancel-filing",
    label: "Cancel filing",
    repeatable: false,
    defaultBindings: []
  },
  {
    id: "copy-link",
    label: "Copy card link",
    repeatable: false,
    defaultBindings: [binding("y")]
  }
];
var DEFAULT_DECK_HEADER_BUTTONS = {
  "open-note": true,
  "copy-link": true,
  tray: true,
  bookmark: true
};
var DEFAULT_DECK_KEYBINDINGS = Object.fromEntries(
  DECK_ACTION_DEFINITIONS.map((definition) => [
    definition.id,
    definition.defaultBindings
  ])
);
var PREVIOUS_DEFAULT_DECK_KEYBINDINGS = {
  "previous-card": [binding("ArrowLeft"), binding("k")],
  "next-card": [binding("ArrowRight"), binding("j")],
  "centre-card": [binding("c")],
  "first-card": [binding("g")],
  "last-card": [binding("g", ["Shift"])],
  "open-note": [binding("o")],
  "toggle-tray": [binding("p")],
  "toggle-bookmark": [binding("b")],
  back: [],
  forward: [],
  bookmarks: [],
  problems: [],
  "confirm-filing": [],
  "cancel-filing": [],
  "copy-link": [binding("y")]
};
var DEFAULT_SETTINGS = {
  addressProperty: "zettel-id",
  deckOrdering: "natural",
  titleSource: "filename",
  titleProperty: "title",
  mainCardSize: "medium",
  trayCardSize: "medium",
  newCardFolder: "",
  newNoteTimestampFormat: "YYYYMMDDTHHmmss",
  useTemplatesForNewNotes: false,
  newNoteTemplatePath: "",
  showTitleInDeck: false,
  showDeckToolbar: true,
  showDeckMap: true,
  deckHeaderButtons: DEFAULT_DECK_HEADER_BUTTONS,
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
function normalizeCardSize(value) {
  return value === "small" || value === "large" ? value : "medium";
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
  if (bindingValue.modifiers.length === 1 && bindingValue.modifiers[0] === "Shift" && key === "$") {
    return key;
  }
  return [...bindingValue.modifiers, key].join("+");
}
function keyBindingFromKeyboardEvent(event, isMacOS) {
  const modifiers = [];
  const primary = isMacOS ? event.metaKey : event.ctrlKey;
  if (primary) {
    modifiers.push("Mod");
  }
  if (event.ctrlKey && isMacOS) {
    modifiers.push("Ctrl");
  }
  if (event.metaKey && !isMacOS) {
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
function bindingsEqual(left, right) {
  return left.length === right.length && left.every((candidate, index) => {
    const expected = right[index];
    return expected !== void 0 && keyBindingSignature(candidate) === keyBindingSignature(expected);
  });
}
function isCompletePreviousDefaultMap(source) {
  const previousActions = new Set(Object.keys(PREVIOUS_DEFAULT_DECK_KEYBINDINGS));
  if (DECK_ACTION_DEFINITIONS.some((definition) => !previousActions.has(definition.id) && Object.prototype.hasOwnProperty.call(source, definition.id))) {
    return false;
  }
  return Object.entries(PREVIOUS_DEFAULT_DECK_KEYBINDINGS).every(([action, expected]) => {
    const candidate = source[action];
    if (!Array.isArray(candidate)) {
      return false;
    }
    const normalized = candidate.flatMap((value) => {
      const result = normalizeKeyBinding(value);
      return result === null ? [] : [result];
    });
    return bindingsEqual(normalized, expected);
  });
}
function normalizeDeckKeybindings(value) {
  const source = isRecord3(value) ? value : {};
  if (isCompletePreviousDefaultMap(source)) {
    return DEFAULT_DECK_KEYBINDINGS;
  }
  const claimed = /* @__PURE__ */ new Set();
  const result = {};
  for (const definition of DECK_ACTION_DEFINITIONS) {
    const candidate = source[definition.id];
    if (!Array.isArray(candidate)) {
      continue;
    }
    const normalized = [];
    for (const rawBinding of candidate) {
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
  for (const definition of DECK_ACTION_DEFINITIONS) {
    if (result[definition.id] !== void 0) {
      continue;
    }
    const normalized = [];
    for (const defaultBinding of definition.defaultBindings) {
      const signature = keyBindingSignature(defaultBinding);
      if (!claimed.has(signature)) {
        claimed.add(signature);
        normalized.push(defaultBinding);
      }
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
    deckOrdering: source.deckOrdering === "lexicographic" ? "lexicographic" : "natural",
    titleSource: source.titleSource === "frontmatter" ? "frontmatter" : "filename",
    titleProperty: normalizePropertyName(
      source.titleProperty,
      DEFAULT_SETTINGS.titleProperty
    ),
    mainCardSize: normalizeCardSize(source.mainCardSize),
    trayCardSize: normalizeCardSize(source.trayCardSize),
    newCardFolder: normalizeFolderPath(source.newCardFolder),
    newNoteTimestampFormat: normalizePropertyName(
      source.newNoteTimestampFormat,
      DEFAULT_SETTINGS.newNoteTimestampFormat
    ),
    useTemplatesForNewNotes: typeof source.useTemplatesForNewNotes === "boolean" ? source.useTemplatesForNewNotes : DEFAULT_SETTINGS.useTemplatesForNewNotes,
    newNoteTemplatePath: typeof source.newNoteTemplatePath === "string" ? source.newNoteTemplatePath.trim() : DEFAULT_SETTINGS.newNoteTemplatePath,
    showTitleInDeck: typeof source.showTitleInDeck === "boolean" ? source.showTitleInDeck : DEFAULT_SETTINGS.showTitleInDeck,
    showDeckToolbar: typeof source.showDeckToolbar === "boolean" ? source.showDeckToolbar : DEFAULT_SETTINGS.showDeckToolbar,
    showDeckMap: typeof source.showDeckMap === "boolean" ? source.showDeckMap : DEFAULT_SETTINGS.showDeckMap,
    deckHeaderButtons: normalizeBooleanRecord(
      source.deckHeaderButtons,
      DEFAULT_DECK_HEADER_BUTTONS
    ),
    deckKeybindings: normalizeDeckKeybindings(source.deckKeybindings)
  };
}
function settingsForPersistence(rawValue, settings) {
  const raw = isRecord3(rawValue) ? rawValue : {};
  const rawButtons = isRecord3(raw.deckHeaderButtons) ? raw.deckHeaderButtons : {};
  const rawKeybindingsSource = isRecord3(raw.deckKeybindings) ? raw.deckKeybindings : {};
  const rawKeybindings = Object.fromEntries(
    Object.entries(rawKeybindingsSource).filter(([key]) => key !== "entry-points")
  );
  return {
    ...raw,
    ...settings,
    deckHeaderButtons: {
      ...rawButtons,
      ...settings.deckHeaderButtons
    },
    deckKeybindings: {
      ...rawKeybindings,
      ...settings.deckKeybindings
    }
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
  bookmarks: [],
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
function hasRemovedEntryPointData(value) {
  if (!isRecord4(value)) {
    return false;
  }
  const state = isRecord4(value.state) ? value.state : value;
  const settings = isRecord4(value.settings) ? value.settings : {};
  const keybindings = isRecord4(settings.deckKeybindings) ? settings.deckKeybindings : {};
  return Object.prototype.hasOwnProperty.call(state, "entryPoints") || Object.prototype.hasOwnProperty.call(keybindings, "entry-points");
}
function normalizePluginState(value) {
  if (!isRecord4(value)) {
    return DEFAULT_STATE;
  }
  const rawSpread = typeof value.spread === "number" && Number.isFinite(value.spread) ? value.spread : DEFAULT_SPREAD;
  const legacyDeskCards = normalizeDeskCards(
    Object.prototype.hasOwnProperty.call(value, "legacyDeskCards") ? value.legacyDeskCards : value.deskCards
  );
  return {
    bookmarks: normalizeBookmarks(value.bookmarks),
    ...legacyDeskCards.length > 0 ? { legacyDeskCards } : {},
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

// src/filing-editor.ts
var HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
function createHtmlElement(document2, tag) {
  return document2.createElementNS(HTML_NAMESPACE, tag);
}
function attachUnfiledAddressFiling(address, beginFiling) {
  address.addEventListener("pointerdown", (event) => event.stopPropagation());
  address.addEventListener("click", (event) => event.stopPropagation());
  address.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    beginFiling();
  });
}
function handleFilingEscape(event, filingCanBeCancelled, cancelFiling) {
  if (!filingCanBeCancelled || event.key !== "Escape") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  cancelFiling();
  return true;
}
function shouldSuspendDeckShortcut(eventTarget, filingInputFocused) {
  if (filingInputFocused) {
    return true;
  }
  if (eventTarget === null || typeof eventTarget !== "object") {
    return false;
  }
  const target = eventTarget;
  const tagName = target.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable === true;
}
function renderInlineFilingEditor(addressSlot, card, state, actions) {
  addressSlot.replaceChildren();
  addressSlot.classList.add("is-editing");
  const input = createHtmlElement(addressSlot.ownerDocument, "input");
  input.className = "slipbox-tray-filing-input";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Enter an address";
  input.setAttribute("aria-label", "Card address");
  addressSlot.append(input);
  const feedback = createHtmlElement(card.ownerDocument, "div");
  feedback.className = "slipbox-tray-filing-feedback";
  feedback.setAttribute("aria-live", "polite");
  card.append(feedback);
  input.addEventListener("pointerdown", (event) => event.stopPropagation());
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("focus", () => actions.onFocusChange(true));
  input.addEventListener("blur", () => actions.onFocusChange(false));
  input.addEventListener("input", () => actions.onInput(input.value));
  input.addEventListener("keydown", (event) => {
    if (handleFilingEscape(event, true, actions.onCancel)) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      actions.onConfirm();
      return;
    }
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      actions.onPreview();
    }
  });
  const elements = { input, feedback };
  updateInlineFilingEditor(elements, state);
  return elements;
}
function updateInlineFilingEditor(elements, state) {
  const { input, feedback } = elements;
  if (input.value !== state.value) {
    input.value = state.value;
  }
  input.disabled = state.confirmationInProgress;
  input.setAttribute("aria-invalid", String(state.invalid));
  input.classList.toggle("is-invalid", state.invalid);
  feedback.replaceChildren();
  feedback.classList.toggle("is-invalid", state.invalid);
  if (state.message !== "") {
    const message = createHtmlElement(feedback.ownerDocument, "span");
    message.className = "slipbox-tray-filing-message";
    message.textContent = state.message;
    feedback.append(message);
  }
  if (state.address === null || state.duplicatePaths.length === 0) {
    return;
  }
  const details = createHtmlElement(feedback.ownerDocument, "details");
  details.className = "slipbox-tray-filing-duplicates";
  const summary = createHtmlElement(feedback.ownerDocument, "summary");
  summary.textContent = `${state.address} is used by ${state.duplicatePaths.length} card${state.duplicatePaths.length === 1 ? "" : "s"} \xB7 path ordered`;
  details.append(summary);
  const paths = createHtmlElement(feedback.ownerDocument, "ul");
  for (const path of state.duplicatePaths) {
    const item = createHtmlElement(feedback.ownerDocument, "li");
    item.textContent = path;
    paths.append(item);
  }
  details.append(paths);
  feedback.append(details);
}

// src/hash.ts
function fnv1a(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// src/tray-state.ts
var EMPTY_TRAY = {
  piles: [],
  expandedPileIds: [],
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
  piles.splice(clampInsertionIndex(pileIndex, piles.length), 0, {
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
  cards.splice(clampInsertionIndex(cardIndex, cards.length), 0, card);
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
  cards.splice(clampInsertionIndex(toIndex, cards.length), 0, card);
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
function placeFiledCardInPileOrdinal(state, cardRef, ordinal) {
  if (!Number.isInteger(ordinal) || ordinal <= 0 || cardRef === "") {
    return state;
  }
  const target = state.piles[ordinal - 1];
  if (target === void 0) {
    return state;
  }
  const source = cardPosition(state, cardRef);
  if (source?.pileId === target.id) {
    return state;
  }
  if (source === null) {
    return addUniqueCardToPile(state, target.id, {
      cardRef,
      kind: "filed"
    });
  }
  const card = state.piles[source.pileIndex]?.cards[source.cardIndex];
  if (card?.kind !== "filed") {
    return state;
  }
  return moveCardBetweenPiles(state, cardRef, target.id);
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
    expandedPileIds: state.expandedPileIds.map((pileId) => pileId === sourcePileId ? targetPileId : pileId),
    unfiledPileId: state.unfiledPileId === sourcePileId ? null : state.unfiledPileId
  });
}
function setPilePosition(state, pileId, position) {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return state;
  }
  const pileIndex = state.piles.findIndex((pile2) => pile2.id === pileId);
  const pile = state.piles[pileIndex];
  if (pile === void 0) {
    return state;
  }
  const piles = [...state.piles];
  piles[pileIndex] = {
    ...pile,
    position: { x: position.x, y: position.y }
  };
  return { ...state, piles };
}
function placeUnfiledCardAtPosition(state, cardRef, newPileId, position) {
  const withoutCard = removeCard(state, cardRef);
  const withPile = createPile(withoutCard, newPileId, [{
    cardRef,
    kind: "unfiled"
  }]);
  return setPilePosition(withPile, newPileId, position);
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
  const activePileId = state.expandedPileIds[state.expandedPileIds.length - 1];
  const expanded = activePileId === void 0 ? void 0 : state.piles.find((pile) => pile.id === activePileId);
  return expanded === void 0 ? createPile(state, newPileId, [card]) : addUniqueCardToPile(state, expanded.id, card);
}
function setPileExpanded(state, pileId, expanded) {
  if (!state.piles.some((pile) => pile.id === pileId)) {
    return state;
  }
  const withoutPile = state.expandedPileIds.filter((id) => id !== pileId);
  if (!expanded && withoutPile.length === state.expandedPileIds.length) {
    return state;
  }
  return {
    ...state,
    expandedPileIds: expanded ? [...withoutPile, pileId] : withoutPile
  };
}
function trayContains(state, cardRef) {
  return state.piles.some((pile) => pile.cards.some((card) => card.cardRef === cardRef));
}
function trayHasFiledCards(state) {
  return state.piles.some((pile) => pile.cards.some((card) => card.kind === "filed"));
}
function trayStackJitter(cardRef, depth) {
  let hash = fnv1a(cardRef);
  hash ^= Math.imul(Math.max(0, Math.trunc(depth)) + 1, -1640531527);
  const unsigned = hash >>> 0;
  return {
    rotationDegrees: (unsigned % 401 - 200) / 100,
    offsetX: (unsigned >>> 9) % 9 - 4,
    offsetY: Math.max(0, Math.max(0, Math.trunc(depth)) * 2 + (unsigned >>> 17) % 3 - 1)
  };
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
  const index = itemCentres.findIndex((centre) => point < centre);
  return index < 0 ? itemCentres.length : index;
}
function cleanTray(state) {
  const piles = state.piles.filter((pile) => pile.cards.length > 0);
  const ids = new Set(piles.map((pile) => pile.id));
  return {
    piles,
    expandedPileIds: state.expandedPileIds.filter(
      (pileId, index, expandedPileIds) => ids.has(pileId) && expandedPileIds.indexOf(pileId) === index
    ),
    unfiledPileId: state.unfiledPileId !== null && ids.has(state.unfiledPileId) ? state.unfiledPileId : null
  };
}
function allTrayCardRefs(state) {
  return state.piles.flatMap((pile) => pile.cards.map((card) => card.cardRef));
}
function clampInsertionIndex(index, length) {
  if (!Number.isFinite(index)) {
    return index < 0 ? 0 : Math.max(0, length);
  }
  return Math.max(0, Math.min(Math.max(0, length), Math.trunc(index)));
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
var DEFAULT_PILE_VERTICAL_STEP_PX = 42;
var DEFAULT_PILE_DECK_CLEARANCE_PX = 24;
var PILE_BASE_Y_RATIO = 0.31;
var PILE_BASE_Y_OFFSET_PX = 126;
var PILE_CARD_HALF_HEIGHT_PX = 58;
var TRAY_SINGLE_CLICK_DELAY_MS = 320;
var TrayRenderer = class {
  constructor(app, plugin, actions) {
    this.app = app;
    this.plugin = plugin;
    this.actions = actions;
  }
  components = /* @__PURE__ */ new Map();
  previews = /* @__PURE__ */ new Map();
  rootEl = null;
  filingEditor = null;
  suppressClickUntil = 0;
  pendingCardClickTimer = null;
  clear() {
    if (this.pendingCardClickTimer !== null) {
      window.clearTimeout(this.pendingCardClickTimer);
      this.pendingCardClickTimer = null;
    }
    if (this.filingEditor !== null) {
      this.actions.filingInputFocusChanged(false);
    }
    for (const component of this.components.values()) {
      component.unload();
    }
    this.components.clear();
    this.previews.clear();
    this.rootEl = null;
    this.filingEditor = null;
  }
  get isFilingInputFocused() {
    const input = this.filingEditor?.input;
    return input !== void 0 && input.ownerDocument.activeElement === input;
  }
  get filingInput() {
    return this.filingEditor?.input ?? null;
  }
  focusFilingInput() {
    window.requestAnimationFrame(() => this.focusFilingInputNow());
  }
  focusFilingInputNow() {
    const input = this.filingEditor?.input;
    if (input === void 0) {
      return;
    }
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }
  updateFilingState(state) {
    if (this.filingEditor !== null) {
      updateInlineFilingEditor(this.filingEditor, state);
    }
  }
  async rerenderPath(file) {
    const preview = this.previews.get(file.path);
    if (preview === void 0) {
      return;
    }
    this.components.get(file.path)?.unload();
    const component = new import_obsidian2.Component();
    component.load();
    this.components.set(file.path, component);
    preview.empty();
    preview.addClass("markdown-rendered");
    try {
      await import_obsidian2.MarkdownRenderer.render(
        this.app,
        await this.plugin.index.readBody(file),
        preview,
        file.path,
        component
      );
    } catch {
      preview.setText("Preview unavailable");
    }
  }
  async render(stage, space, filing, isCurrent) {
    const state = this.plugin.tray;
    const cardCount = state.piles.reduce(
      (total, pile) => total + pile.cards.length,
      0
    );
    this.attachBackgroundMenu(stage, space);
    if (cardCount === 0) {
      return;
    }
    stage.addClass("has-tray");
    const tray = space.createDiv({
      cls: "slipbox-tray",
      attr: {
        "aria-label": `Working piles, ${cardCount} card${cardCount === 1 ? "" : "s"}`
      }
    });
    this.rootEl = tray;
    const piles = tray.createDiv({ cls: "slipbox-tray-piles" });
    const jobs = [];
    state.piles.forEach((pile, pileIndex) => {
      jobs.push(...this.renderPile(
        piles,
        pile,
        pileIndex,
        pile.position ?? defaultPilePosition(pileIndex),
        state.expandedPileIds.includes(pile.id),
        filing,
        isCurrent
      ));
    });
    await Promise.all(jobs);
  }
  attachBackgroundMenu(stage, space) {
    stage.addEventListener("contextmenu", (event) => {
      if (event.target !== stage) {
        return;
      }
      event.preventDefault();
      const menu = import_obsidian2.Menu.forEvent(event);
      const position = this.positionAtPoint(
        event.clientX,
        event.clientY,
        space,
        stage
      );
      menu.addItem((item) => {
        item.setTitle("New card").setIcon("file-plus-2").setDisabled(position === null).onClick(() => {
          if (position !== null) {
            void this.actions.runAfterEditing(
              "tray-new-card",
              () => this.plugin.createNewCardAtTrayPosition(position)
            );
          }
        });
      });
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle("Return all filed cards").setIcon("eraser").setDisabled(!trayHasFiledCards(this.plugin.tray)).onClick(() => this.actions.runAfterEditing(
          "tray-return-all",
          () => this.plugin.clearTray()
        ));
      });
      menu.showAtMouseEvent(event);
    });
  }
  renderPile(parent, pile, pileIndex, position, expanded, filing, isCurrent) {
    const pileEl = parent.createDiv({
      cls: `slipbox-tray-pile ${expanded ? "is-expanded" : "is-collapsed"}`,
      attr: {
        "data-pile-id": pile.id,
        "aria-label": `Pile ${pileIndex + 1}, ${pile.cards.length} card${pile.cards.length === 1 ? "" : "s"}`
      }
    });
    pileEl.tabIndex = expanded ? -1 : 0;
    pileEl.style.setProperty("--slipbox-pile-x", `${position.x}px`);
    pileEl.style.setProperty("--slipbox-pile-y", `${position.y}px`);
    pileEl.setAttr("role", expanded ? "group" : "button");
    pileEl.setAttr("aria-expanded", String(expanded));
    if (!expanded) {
      this.renderStackLayers(pileEl, pile);
    }
    pileEl.createSpan({
      cls: "slipbox-tray-pile-count",
      text: String(pile.cards.length),
      attr: {
        "aria-label": `${pile.cards.length} card${pile.cards.length === 1 ? "" : "s"}`
      }
    });
    let dragSurface = pileEl;
    if (expanded) {
      const handle = pileEl.createEl("button", {
        cls: "slipbox-tray-pile-handle",
        attr: {
          type: "button",
          "aria-label": `Move or collapse pile ${pileIndex + 1}`
        }
      });
      (0, import_obsidian2.setIcon)(handle, "grip-vertical");
      (0, import_obsidian2.setTooltip)(handle, "Drag to move \xB7 Click to collapse", {
        placement: "left",
        delay: 250
      });
      handle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (performance.now() < this.suppressClickUntil) {
          return;
        }
        void this.actions.runAfterEditing(
          "tray-collapse-pile",
          () => this.plugin.setTrayPileExpanded(pile.id, false)
        );
      });
      dragSurface = handle;
    }
    const sequence = pileEl.createDiv({ cls: "slipbox-tray-sequence" });
    const visibleCards = expanded ? pile.cards : pile.cards.slice(0, 1);
    const jobs = visibleCards.map((card, cardIndex) => this.renderCard(
      sequence,
      pile,
      card,
      expanded ? cardIndex : 0,
      pileIndex,
      expanded,
      filing,
      isCurrent
    ));
    pileEl.addEventListener("click", (event) => {
      if (performance.now() < this.suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select") !== null) {
        return;
      }
      if (expanded && event.target instanceof Element && event.target.closest(".slipbox-tray-card") !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void this.actions.runAfterEditing(
        "tray-toggle-pile",
        () => this.plugin.setTrayPileExpanded(pile.id, !expanded)
      );
    });
    pileEl.addEventListener("keydown", (event) => {
      if (event.target !== pileEl || event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      void this.actions.runAfterEditing(
        "tray-toggle-pile-key",
        () => this.plugin.setTrayPileExpanded(pile.id, !expanded)
      );
    });
    pileEl.addEventListener("contextmenu", (event) => {
      if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select") !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.showPileMenu(event, pile);
    });
    this.attachPileDragging(pileEl, dragSurface, pile, position);
    return jobs;
  }
  async renderCard(parent, pile, card, cardIndex, pileIndex, expanded, filing, isCurrent) {
    const file = this.plugin.index.fileAtPath(card.cardRef);
    if (!(file instanceof import_obsidian2.TFile)) {
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    const address = filed?.address ?? "unfiled";
    const title = this.plugin.cardTitle(file);
    const miniature = parent.createDiv({
      cls: "slipbox-tray-card",
      attr: {
        "data-card-ref": card.cardRef,
        role: filed === void 0 ? "group" : "button",
        "aria-label": `${address}, ${title}; card ${cardIndex + 1} of ${pile.cards.length} in pile ${pileIndex + 1}`
      }
    });
    const jitter = trayStackJitter(card.cardRef, cardIndex);
    miniature.style.setProperty(
      "--slipbox-tray-card-tilt",
      `${jitter.rotationDegrees}deg`
    );
    miniature.tabIndex = expanded ? 0 : -1;
    miniature.toggleClass("is-filed", filed !== void 0);
    miniature.toggleClass("is-unfiled", filed === void 0);
    const isFilingSource = filing?.sourcePath === card.cardRef;
    miniature.toggleClass("is-filing-source", isFilingSource);
    miniature.toggleClass(
      "is-bookmarked",
      filed !== void 0 && this.plugin.bookmarkAtPath(filed.path) !== void 0
    );
    const identity = miniature.createDiv({ cls: "slipbox-tray-card-identity" });
    const addressEl = identity.createSpan({
      cls: "slipbox-tray-card-address",
      text: address
    });
    if (isFilingSource && filing !== null) {
      this.filingEditor = renderInlineFilingEditor(
        addressEl,
        miniature,
        filing,
        {
          onInput: (value) => this.actions.updateFilingInput(value),
          onConfirm: () => this.actions.confirmFiling(),
          onCancel: () => this.actions.cancelFiling(),
          onPreview: () => this.actions.previewFilingPlacement(),
          onFocusChange: (focused) => this.actions.filingInputFocusChanged(focused)
        }
      );
    } else if (filed === void 0) {
      addressEl.setAttr("aria-label", "Unfiled card address; double-click to file");
      (0, import_obsidian2.setTooltip)(addressEl, "Double-click to file", {
        placement: "bottom",
        delay: 350
      });
      attachUnfiledAddressFiling(addressEl, () => {
        void this.actions.runAfterEditing(
          "tray-address-filing",
          () => this.actions.beginFiling(file)
        );
      });
    }
    const headerTitle = cardHeaderTitle(
      title,
      this.plugin.settings.showTitleInDeck
    );
    if (headerTitle !== null) {
      identity.createSpan({
        cls: "slipbox-tray-card-title",
        text: headerTitle
      });
    }
    const controls = miniature.createDiv({ cls: "slipbox-tray-card-actions" });
    if (!isFilingSource) {
      if (filed === void 0) {
        const fileButton = trayIconButton(controls, "archive-restore", "File");
        fileButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.actions.runAfterEditing(
            "tray-file-card",
            () => this.actions.beginFiling(file)
          );
        });
      } else {
        const returnButton = trayIconButton(
          controls,
          "undo-2",
          "Return"
        );
        returnButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.actions.runAfterEditing(
            "tray-return-card",
            () => this.plugin.toggleFileInTray(file)
          );
        });
      }
      const open = trayIconButton(controls, "file-pen-line", "Open");
      open.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.runAfterEditing(
          "tray-open-note",
          () => this.plugin.openMarkdownFile(file)
        );
      });
    }
    const preview = miniature.createDiv({
      cls: "slipbox-tray-card-preview markdown-rendered"
    });
    this.previews.set(file.path, preview);
    preview.addEventListener("dblclick", (event) => {
      if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select, [contenteditable='true']") !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.cancelPendingCardClick();
      void this.actions.beginInlineEditing(file);
    });
    this.attachPreviewLinkInteractions(preview, file.path);
    const component = new import_obsidian2.Component();
    component.load();
    this.components.set(file.path, component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (isCurrent()) {
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
      if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select") !== null) {
        return;
      }
      if (event.target instanceof Element && event.target.closest(".slipbox-tray-card-preview") !== null) {
        event.preventDefault();
        event.stopPropagation();
        this.scheduleCardClick(() => {
          if (!expanded) {
            void this.actions.runAfterEditing(
              "tray-expand-pile",
              () => this.plugin.setTrayPileExpanded(pile.id, true)
            );
          } else if (filed !== void 0) {
            void this.actions.runAfterEditing(
              "tray-jump-filed-card",
              () => this.actions.jumpToFiledCard(filed.path)
            );
          }
        });
        return;
      }
      if (!expanded) {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.runAfterEditing(
          "tray-expand-pile",
          () => this.plugin.setTrayPileExpanded(pile.id, true)
        );
        return;
      }
      if (filed === void 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void this.actions.runAfterEditing(
        "tray-jump-filed-card",
        () => this.actions.jumpToFiledCard(filed.path)
      );
    });
    miniature.addEventListener("keydown", (event) => {
      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.runAfterEditing(
          "tray-move-card-key",
          () => this.actions.moveCardBy(
            card.cardRef,
            event.key === "ArrowLeft" ? -1 : 1
          )
        );
        return;
      }
      if (event.key === "Enter" && filed !== void 0) {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.runAfterEditing(
          "tray-jump-filed-card-key",
          () => this.actions.jumpToFiledCard(filed.path)
        );
      }
    });
    miniature.addEventListener("contextmenu", (event) => {
      if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select") !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (expanded) {
        this.showCardMenu(event, pile, card);
      } else {
        this.showPileMenu(event, pile, card);
      }
    });
    this.attachCardDragging(miniature, pile, card, expanded);
  }
  renderStackLayers(parent, pile) {
    const hiddenCards = pile.cards.slice(1, 8);
    hiddenCards.forEach((card, index) => {
      const depth = index + 1;
      const jitter = trayStackJitter(card.cardRef, depth);
      const layer = parent.createDiv({
        cls: "slipbox-tray-stack-layer",
        attr: { "aria-hidden": "true" }
      });
      layer.style.setProperty("--slipbox-stack-depth", String(depth));
      layer.style.setProperty("--slipbox-stack-x", `${jitter.offsetX}px`);
      layer.style.setProperty("--slipbox-stack-y", `${jitter.offsetY}px`);
      layer.style.setProperty(
        "--slipbox-stack-tilt",
        `${jitter.rotationDegrees}deg`
      );
    });
  }
  attachPreviewLinkInteractions(preview, sourcePath) {
    preview.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const link = event.target.closest("a");
      if (link === null) {
        return;
      }
      const internal = link.matches(".internal-link");
      const linktext = link.dataset.href ?? link.getAttribute("href") ?? "";
      if (linktext === "") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const newLeaf = event.metaKey || event.ctrlKey;
      void this.actions.runAfterEditing("tray-rendered-link", async () => {
        const filed = internal ? resolveFiledCardLink((0, import_obsidian2.getLinkpath)(linktext), sourcePath, {
          resolveFile: (path, source) => this.app.metadataCache.getFirstLinkpathDest(path, source),
          filedPathForFile: (file) => this.plugin.index.filedByFile(file)?.path,
          firstFiledPathAtAddress: (address) => this.plugin.index.firstFiledAtAddress(address)?.path
        }) : void 0;
        const action = renderedLinkAction(internal, newLeaf, linktext, filed);
        if (action.kind === "card") {
          await this.actions.jumpToFiledCard(action.path);
        } else if (action.kind === "note") {
          await this.app.workspace.openLinkText(
            action.linktext,
            sourcePath,
            newLeaf
          );
        } else {
          window.open(link.href, "_blank", "noopener");
        }
      });
    }, { capture: true });
  }
  showPileMenu(event, pile, visibleCard) {
    const menu = import_obsidian2.Menu.forEvent(event);
    if (visibleCard !== void 0 && this.addCardFileMenuItems(menu, visibleCard)) {
      menu.addSeparator();
    }
    menu.addItem((item) => {
      item.setTitle("Lay out pile on active Canvas").setIcon("layout-dashboard").setDisabled(!this.plugin.hasActiveCanvas()).onClick(() => this.actions.runAfterEditing(
        "tray-layout-active-canvas",
        () => this.plugin.layOutTrayPileOnActiveCanvas(pile.id)
      ));
    });
    menu.addItem((item) => {
      item.setTitle("Lay out pile on Canvas\u2026").setIcon("layout-template").onClick(() => this.actions.runAfterEditing(
        "tray-layout-canvas",
        () => this.plugin.layOutTrayPileOnCanvas(pile.id)
      ));
    });
    menu.addItem((item) => {
      item.setTitle("Create Canvas from pile\u2026").setIcon("file-plus-2").onClick(() => this.actions.runAfterEditing(
        "tray-create-canvas",
        () => this.plugin.createCanvasFromTrayPile(pile.id)
      ));
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("Return filed cards in this pile").setIcon("eraser").setDisabled(!pile.cards.some((card) => card.kind === "filed")).onClick(() => this.actions.runAfterEditing(
        "tray-return-pile",
        () => this.plugin.clearTrayPile(pile.id)
      ));
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
    if (this.addCardFileMenuItems(menu, card)) {
      menu.addSeparator();
    }
    menu.addItem((item) => {
      item.setTitle("Move to previous pile").setIcon("arrow-left").setDisabled(position.pileIndex <= 0).onClick(() => {
        const target = state.piles[position.pileIndex - 1];
        if (target !== void 0) {
          this.moveAndFocus(
            moveCardBetweenPiles(state, card.cardRef, target.id),
            card.cardRef
          );
        }
      });
    });
    menu.addItem((item) => {
      item.setTitle("Move to next pile").setIcon("arrow-right").setDisabled(position.pileIndex >= state.piles.length - 1).onClick(() => {
        const target = state.piles[position.pileIndex + 1];
        if (target !== void 0) {
          this.moveAndFocus(
            moveCardBetweenPiles(state, card.cardRef, target.id),
            card.cardRef
          );
        }
      });
    });
    menu.addItem((item) => {
      item.setTitle("Split into new pile").setIcon("split").setDisabled(pile.cards.length <= 1).onClick(() => {
        const newPileId = this.plugin.createTrayPileId();
        const origin = pile.position ?? defaultPilePosition(position.pileIndex);
        const split = splitCardIntoNewPile(state, card.cardRef, newPileId);
        this.moveAndFocus(
          setPilePosition(split, newPileId, {
            x: origin.x + 38,
            y: origin.y + 38
          }),
          card.cardRef
        );
      });
    });
    menu.showAtMouseEvent(event);
  }
  addCardFileMenuItems(menu, card) {
    const file = this.plugin.index.fileAtPath(card.cardRef);
    if (file === void 0) {
      return false;
    }
    menu.addItem((item) => {
      item.setTitle("Open").setIcon("file-pen-line").onClick(() => this.actions.runAfterEditing(
        "tray-menu-open-note",
        () => this.plugin.openMarkdownFile(file)
      ));
    });
    if (card.kind === "unfiled") {
      menu.addItem((item) => {
        item.setTitle("File").setIcon("archive-restore").onClick(() => this.actions.runAfterEditing(
          "tray-menu-file-card",
          () => this.actions.beginFiling(file)
        ));
      });
    }
    return true;
  }
  attachCardDragging(element, pile, card, expanded) {
    if (!expanded) {
      return;
    }
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target instanceof Element && event.target.closest("button, a, input, textarea, select") !== null) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      this.startPointerActionAfterEditing(event, "tray-card-drag", () => {
        let dragging = false;
        try {
          element.setPointerCapture(pointerId);
        } catch {
          return;
        }
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
    });
  }
  attachPileDragging(element, dragSurface, pile, position) {
    dragSurface.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || dragSurface === element && event.target instanceof Element && event.target.closest("button, a, input, textarea, select") !== null) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      this.startPointerActionAfterEditing(event, "tray-pile-drag", () => {
        let dragging = false;
        try {
          dragSurface.setPointerCapture(pointerId);
        } catch {
          return;
        }
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
        };
        const finish = (upEvent) => {
          dragSurface.removeEventListener("pointermove", move);
          dragSurface.removeEventListener("pointerup", finish);
          dragSurface.removeEventListener("pointercancel", cancel);
          if (dragSurface.hasPointerCapture(pointerId)) {
            dragSurface.releasePointerCapture(pointerId);
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
            element,
            {
              x: position.x + upEvent.clientX - startX,
              y: position.y + upEvent.clientY - startY
            }
          );
          this.clearDropCues();
          void this.plugin.updateTray(next);
        };
        const cancel = () => {
          dragSurface.removeEventListener("pointermove", move);
          dragSurface.removeEventListener("pointerup", finish);
          dragSurface.removeEventListener("pointercancel", cancel);
          element.setCssProps({ translate: "" });
          this.clearDropCues();
        };
        dragSurface.addEventListener("pointermove", move);
        dragSurface.addEventListener("pointerup", finish);
        dragSurface.addEventListener("pointercancel", cancel);
      });
    });
  }
  cardDropState(cardRef, x, y, dragged) {
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
    const newPosition = this.positionAtPoint(x, y);
    if (newPosition !== null) {
      const newPileId = this.plugin.createTrayPileId();
      const split = splitCardIntoNewPile(state, cardRef, newPileId);
      return setPilePosition(split, newPileId, newPosition);
    }
    return state;
  }
  pileDropState(sourcePileId, x, y, dragged, newPosition) {
    const state = this.plugin.tray;
    const target = this.elementsBelowPoint(x, y, dragged).find(
      (element) => element.matches(".slipbox-tray-pile") && element.dataset.pileId !== sourcePileId
    );
    const targetId = target?.dataset.pileId;
    if (target !== void 0 && targetId !== void 0) {
      if (isPointInPileMergeRegion(target, x, y)) {
        return mergePiles(state, sourcePileId, targetId);
      }
    }
    return setPilePosition(state, sourcePileId, newPosition);
  }
  updateCardDropCues(event, sourcePileId, dragged) {
    this.clearDropCues(dragged);
    const elements = this.elementsBelowPoint(
      event.clientX,
      event.clientY,
      dragged
    );
    const targetPile = elements.find(
      (element) => element.matches(".slipbox-tray-pile")
    );
    if (targetPile === void 0) {
      return;
    }
    targetPile.addClass(
      targetPile.dataset.pileId === sourcePileId ? "is-reorder-target" : "is-card-drop-target"
    );
    const targetCard = elements.find(
      (element) => element.matches(".slipbox-tray-card")
    );
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
    if (isPointInPileMergeRegion(target, event.clientX, event.clientY)) {
      target.addClass("is-merge-target");
    }
  }
  elementsBelowPoint(x, y, dragged) {
    dragged.addClass("slipbox-ignore-pointer-events");
    try {
      return document.elementsFromPoint(x, y);
    } finally {
      dragged.removeClass("slipbox-ignore-pointer-events");
    }
  }
  positionAtPoint(x, y, coordinateElement = this.rootEl, hitBoundsElement = coordinateElement) {
    const rect = coordinateElement?.getBoundingClientRect();
    const hitBounds = hitBoundsElement?.getBoundingClientRect();
    if (rect === void 0 || hitBounds === void 0 || x < hitBounds.left || x > hitBounds.right || y < hitBounds.top || y > hitBounds.bottom) {
      return null;
    }
    return {
      x: x - (rect.left + rect.width / 2),
      y: y - (rect.top + rect.height * PILE_BASE_Y_RATIO - PILE_BASE_Y_OFFSET_PX) - PILE_CARD_HALF_HEIGHT_PX
    };
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
      element.setCssProps({ translate: "" });
    });
    this.rootEl?.removeClass("is-dragging-card");
  }
  moveAndFocus(nextState, cardRef) {
    void this.actions.runAfterEditing("tray-menu-move-card", async () => {
      await this.plugin.updateTray(nextState);
      window.requestAnimationFrame(() => {
        const escaped = CSS.escape(cardRef);
        this.rootEl?.querySelector(`.slipbox-tray-card[data-card-ref="${escaped}"]`)?.focus({ preventScroll: true });
      });
    });
  }
  scheduleCardClick(action) {
    this.cancelPendingCardClick();
    this.pendingCardClickTimer = window.setTimeout(() => {
      this.pendingCardClickTimer = null;
      action();
    }, TRAY_SINGLE_CLICK_DELAY_MS);
  }
  startPointerActionAfterEditing(event, reason, action) {
    const document2 = event.currentTarget instanceof Node ? event.currentTarget.ownerDocument : null;
    if (document2 === null) {
      return;
    }
    const pointerId = event.pointerId;
    let pointerActive = true;
    const cleanup = () => {
      document2.removeEventListener("pointerup", released, true);
      document2.removeEventListener("pointercancel", released, true);
    };
    const released = (releasedEvent) => {
      if (releasedEvent.pointerId === pointerId) {
        pointerActive = false;
        cleanup();
      }
    };
    document2.addEventListener("pointerup", released, true);
    document2.addEventListener("pointercancel", released, true);
    void this.actions.runAfterEditing(reason, () => {
      cleanup();
      if (pointerActive) {
        action();
      }
    }).finally(cleanup);
  }
  cancelPendingCardClick() {
    if (this.pendingCardClickTimer !== null) {
      window.clearTimeout(this.pendingCardClickTimer);
      this.pendingCardClickTimer = null;
    }
  }
};
function defaultPilePosition(pileIndex) {
  return {
    x: 0,
    y: pileIndex * DEFAULT_PILE_VERTICAL_STEP_PX - DEFAULT_PILE_DECK_CLEARANCE_PX
  };
}
function isPointInPileMergeRegion(pile, x, y) {
  const rect = pile.getBoundingClientRect();
  const relativeX = (x - rect.left) / Math.max(1, rect.width);
  const relativeY = (y - rect.top) / Math.max(1, rect.height);
  return relativeX > 0.2 && relativeX < 0.8 && relativeY > 0.2 && relativeY < 0.8;
}
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

// src/filing-preview.ts
function initialFilingAddress(focusedCard) {
  return focusedCard?.address ?? "";
}
function filingPreviewFocusPath(preview) {
  return preview.previousPath ?? preview.nextPath;
}
function createFilingPreview(filed, candidate, title, ordering) {
  const insertionIndex = candidateInsertionIndex(filed, candidate, ordering);
  const previousPath = filed[insertionIndex - 1]?.path ?? null;
  const nextPath = filed[insertionIndex]?.path ?? null;
  const placementSignature = JSON.stringify([
    candidate.path,
    candidate.address,
    ordering,
    insertionIndex,
    previousPath,
    nextPath
  ]);
  return {
    sourcePath: candidate.path,
    address: candidate.address,
    title,
    insertionIndex,
    previousPath,
    nextPath,
    ordering,
    placementSignature
  };
}
function filingPlacementMatches(filed, candidate, ordering, preview) {
  if (preview.sourcePath !== candidate.path || preview.address !== candidate.address || preview.ordering !== ordering) {
    return false;
  }
  return createFilingPreview(
    filed,
    candidate,
    preview.title,
    ordering
  ).placementSignature === preview.placementSignature;
}

// src/deck-map.ts
function deckMapCoordinate(index, cardCount) {
  if (!Number.isInteger(index) || !Number.isInteger(cardCount) || cardCount <= 0 || index < 0 || index >= cardCount) {
    return null;
  }
  return cardCount === 1 ? 0.5 : index / (cardCount - 1);
}
function sampleDeckMapIndices(cardCount, markerBudget) {
  if (!Number.isInteger(cardCount) || !Number.isInteger(markerBudget) || cardCount <= 0 || markerBudget <= 0) {
    return [];
  }
  const sampleCount = Math.min(cardCount, markerBudget);
  if (sampleCount === cardCount) {
    return Array.from({ length: cardCount }, (_, index) => index);
  }
  if (sampleCount === 1) {
    return [Math.floor((cardCount - 1) / 2)];
  }
  return Array.from(
    { length: sampleCount },
    (_, index) => Math.round(index * (cardCount - 1) / (sampleCount - 1))
  );
}
function buildDeckMapSectionMarkers(orderedFiledCards) {
  const sections = [];
  let previousLabel = null;
  for (const [index, card] of orderedFiledCards.entries()) {
    const label = Array.from(card.address)[0] ?? "";
    if (label === "" || label === previousLabel) {
      continue;
    }
    sections.push({
      path: card.path,
      ordinal: index + 1,
      position: deckMapCoordinate(index, orderedFiledCards.length) ?? 0,
      label
    });
    previousLabel = label;
  }
  return sections;
}
function visibleDeckMapSectionMarkers(sections, railWidth, minimumSpacing) {
  const visible = [];
  let previousPosition = null;
  for (const section of sections) {
    const pixelPosition = section.position * Math.max(0, railWidth);
    if (previousPosition === null || pixelPosition - previousPosition >= Math.max(0, minimumSpacing)) {
      visible.push(section);
      previousPosition = pixelPosition;
    }
  }
  return visible;
}
function deckMapIndexAtOffset(offset, railWidth, cardCount) {
  if (!Number.isFinite(offset) || !Number.isFinite(railWidth) || railWidth <= 0 || !Number.isInteger(cardCount) || cardCount <= 0) {
    return null;
  }
  if (cardCount === 1) {
    return 0;
  }
  const normalized = Math.max(0, Math.min(1, offset / railWidth));
  return Math.round(normalized * (cardCount - 1));
}

// src/deck-commands.ts
var IDLE_DECK_COMMAND = { kind: "idle" };
var MODIFIER_KEYS = /* @__PURE__ */ new Set(["Alt", "AltGraph", "Control", "Meta", "Shift"]);
function installPendingDeckCommandKeyCapture(target, capture) {
  const listener = (event) => {
    if (capture.isPending() && capture.isActive() && capture.shouldIgnore?.(event) !== true) {
      capture.handle(event);
    }
  };
  target.addEventListener("keydown", listener, { capture: true });
  return () => target.removeEventListener("keydown", listener, { capture: true });
}
function firstUnicodeCharacter(value) {
  return Array.from(value)[0] ?? null;
}
function findAddressInitialIndex(cards, activeIndex, initial, mode) {
  const targetInitial = firstUnicodeCharacter(initial);
  if (targetInitial === null) {
    return null;
  }
  const start = mode === "absolute" ? 0 : mode === "forward" ? Math.max(0, activeIndex + 1) : Math.min(cards.length - 1, activeIndex - 1);
  const end = mode === "backward" ? 0 : cards.length - 1;
  const step = mode === "backward" ? -1 : 1;
  for (let index = start; mode === "backward" ? index >= end : index <= end; index += step) {
    const card = cards[index];
    if (card !== void 0 && firstUnicodeCharacter(card.address) === targetInitial) {
      return index;
    }
  }
  return null;
}
function startAddressCommand(mode) {
  return { kind: "address", mode };
}
function startPileCommand() {
  return { kind: "pile", digits: "" };
}
function advancePendingDeckCommand(state, key) {
  if (state.kind === "idle") {
    return { consumed: false, state };
  }
  if (MODIFIER_KEYS.has(key)) {
    return { consumed: false, state };
  }
  if (key === "Escape") {
    return { consumed: true, state: IDLE_DECK_COMMAND, cancelled: true };
  }
  if (state.kind === "address") {
    const initial = firstUnicodeCharacter(key);
    if (initial === null || Array.from(key).length !== 1) {
      return { consumed: true, state };
    }
    return {
      consumed: true,
      state: IDLE_DECK_COMMAND,
      completion: { kind: "address", mode: state.mode, initial }
    };
  }
  if (/^[0-9]$/.test(key)) {
    return {
      consumed: true,
      state: { kind: "pile", digits: `${state.digits}${key}` }
    };
  }
  if (key === "Backspace") {
    return {
      consumed: true,
      state: { kind: "pile", digits: state.digits.slice(0, -1) }
    };
  }
  if (key === "Enter") {
    return {
      consumed: true,
      state,
      completion: { kind: "pile", digits: state.digits }
    };
  }
  return { consumed: true, state };
}

// src/deck-chrome.ts
var DEFAULT_DECK_CHROME_VISIBILITY = {
  toolbarOverride: null,
  deckMapOverride: null
};
function toolbarIsVisible(state, showDeckToolbarSetting) {
  return state.toolbarOverride ?? showDeckToolbarSetting;
}
function deckMapIsVisible(state, showDeckMapSetting, cardCount) {
  return cardCount > 0 && (state.deckMapOverride ?? showDeckMapSetting);
}
function toggleToolbarVisibility(state, showDeckToolbarSetting) {
  return {
    ...state,
    toolbarOverride: !(state.toolbarOverride ?? showDeckToolbarSetting)
  };
}
function toggleDeckMapVisibility(state, showDeckMapSetting) {
  return {
    ...state,
    deckMapOverride: !(state.deckMapOverride ?? showDeckMapSetting)
  };
}
function applyDeckChromeVisibility(toolbar, deckMap, state, showDeckToolbarSetting, showDeckMapSetting, cardCount) {
  if (toolbar !== null) {
    toolbar.hidden = !toolbarIsVisible(state, showDeckToolbarSetting);
  }
  if (deckMap !== null) {
    deckMap.hidden = !deckMapIsVisible(state, showDeckMapSetting, cardCount);
  }
}

// src/inline-edit-session.ts
var InlineEditFinalizationCoordinator = class {
  active = null;
  finish(reason, finalize) {
    if (this.active !== null) {
      this.active.reasons.add(reason);
      return this.active.promise;
    }
    const reasons = /* @__PURE__ */ new Set([reason]);
    const promise = finalize(reasons);
    const active = { reasons, promise };
    this.active = active;
    void promise.then(
      () => this.clear(active),
      () => this.clear(active)
    );
    return promise;
  }
  clear(active) {
    if (this.active === active) {
      this.active = null;
    }
  }
};
var DEFAULT_DEBOUNCE_MS = 500;
var InlineEditPathLock = class {
  owners = /* @__PURE__ */ new Map();
  ownerAt(path) {
    return this.owners.get(path);
  }
  acquire(path, owner) {
    const existing = this.owners.get(path);
    if (existing !== void 0 && existing !== owner) {
      return false;
    }
    this.owners.set(path, owner);
    return true;
  }
  release(path, owner) {
    if (this.owners.get(path) === owner) {
      this.owners.delete(path);
    }
  }
  rename(oldPath, newPath, owner) {
    if (this.owners.get(oldPath) !== owner) {
      return false;
    }
    const collision = this.owners.get(newPath);
    if (collision !== void 0 && collision !== owner) {
      return false;
    }
    this.owners.delete(oldPath);
    this.owners.set(newPath, owner);
    return true;
  }
  ownerSet() {
    return new Set(this.owners.values());
  }
};
var InlineEditSessionController = class {
  constructor(path, origin, body, environment) {
    this.origin = origin;
    this.environment = environment;
    this.pathValue = path;
    this.baseBodyValue = body;
    this.draftValue = body;
  }
  baseBodyValue;
  draftValue;
  pathValue;
  versionValue = 0;
  committedVersionValue = 0;
  phaseValue = "editing";
  failureValue = null;
  conflictRetryableValue = false;
  debounceHandle = null;
  writeTail = Promise.resolve();
  finishPromise = null;
  get snapshot() {
    return {
      path: this.pathValue,
      origin: this.origin,
      baseBody: this.baseBodyValue,
      draft: this.draftValue,
      version: this.versionValue,
      committedVersion: this.committedVersionValue,
      phase: this.phaseValue,
      failure: this.failureValue,
      conflictRetryable: this.conflictRetryableValue
    };
  }
  updateDraft(draft) {
    if (this.phaseValue === "closed") {
      return;
    }
    if (draft === this.draftValue) {
      return;
    }
    this.draftValue = draft;
    this.versionValue += 1;
    if (this.phaseValue !== "conflict") {
      this.phaseValue = "editing";
      this.failureValue = null;
      if (this.finishPromise === null) {
        this.scheduleDebouncedCommit();
      }
    }
  }
  renamePath(path) {
    if (this.phaseValue !== "closed") {
      this.pathValue = path;
    }
  }
  markConflict(message, retryable = false) {
    if (this.phaseValue === "closed") {
      return;
    }
    this.clearDebounce();
    const failure = { kind: "conflict", message };
    this.phaseValue = "conflict";
    this.failureValue = failure;
    this.conflictRetryableValue = retryable;
    this.environment.reportFailure(failure);
  }
  finish() {
    if (this.phaseValue === "closed") {
      return Promise.resolve(true);
    }
    if (this.finishPromise !== null) {
      return this.finishPromise;
    }
    this.clearDebounce();
    const pending = this.finishLatestDraft();
    this.finishPromise = pending;
    void pending.finally(() => {
      if (this.finishPromise === pending && this.phaseValue !== "closed") {
        this.finishPromise = null;
      }
    });
    return pending;
  }
  cancelDebounce() {
    this.clearDebounce();
  }
  scheduleDebouncedCommit() {
    this.clearDebounce();
    this.debounceHandle = this.environment.schedule(() => {
      this.debounceHandle = null;
      void this.enqueueCommit(false);
    }, this.environment.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }
  clearDebounce() {
    if (this.debounceHandle === null) {
      return;
    }
    this.environment.cancelScheduled(this.debounceHandle);
    this.debounceHandle = null;
  }
  async finishLatestDraft() {
    await this.writeTail;
    if (this.phaseValue === "conflict" && !this.conflictRetryableValue) {
      return false;
    }
    try {
      await this.environment.flushOpenViews(this.pathValue);
    } catch (error) {
      return this.handleWriteFailure("Could not save the open Markdown view.", error);
    }
    while (this.phaseValue !== "closed") {
      const targetVersion = this.versionValue;
      const saved = await this.enqueueCommit(true);
      if (!saved) {
        return false;
      }
      if (this.versionValue === targetVersion) {
        this.phaseValue = "closed";
        this.failureValue = null;
        return true;
      }
    }
    return true;
  }
  enqueueCommit(final) {
    const version = this.versionValue;
    const draft = this.draftValue;
    const operation = this.writeTail.then(async () => {
      if (this.phaseValue === "closed" || this.phaseValue === "conflict" && (!final || !this.conflictRetryableValue)) {
        return this.phaseValue === "closed";
      }
      this.phaseValue = "saving";
      let result;
      try {
        result = await this.environment.commit({
          path: this.pathValue,
          baseBody: this.baseBodyValue,
          draft,
          version,
          final
        });
      } catch (error) {
        return this.handleWriteFailure("Could not save the inline draft.", error);
      }
      if (result.status === "conflict") {
        this.markConflict(result.message, true);
        return false;
      }
      this.baseBodyValue = draft;
      this.committedVersionValue = Math.max(this.committedVersionValue, version);
      this.failureValue = null;
      this.conflictRetryableValue = false;
      this.phaseValue = "editing";
      return true;
    });
    this.writeTail = operation.then(() => void 0, () => void 0);
    return operation;
  }
  handleWriteFailure(message, error) {
    const failure = { kind: "write", message, error };
    this.phaseValue = "editing";
    this.failureValue = failure;
    this.conflictRetryableValue = false;
    this.environment.reportFailure(failure);
    return false;
  }
};
async function runAfterInlineEditing(finish, action) {
  if (!await finish()) {
    return false;
  }
  await action();
  return true;
}

// src/inline-edit-interactions.ts
function dispatchInlineAwareDeckAction(state, runAfterEditing, action) {
  if (state.starting) {
    return false;
  }
  if (!state.editing) {
    action();
    return true;
  }
  void runAfterEditing(action);
  return true;
}
function consumeInlineEditEscape(event, textarea) {
  if (event.key !== "Escape" || event.target !== textarea) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  return true;
}
function isInlineEditBodyTarget(target, bodySurface) {
  const ElementConstructor = bodySurface.ownerDocument.defaultView?.Element;
  if (ElementConstructor === void 0 || !(target instanceof ElementConstructor) || !bodySurface.contains(target)) {
    return false;
  }
  return target.closest(
    "a, button, input, textarea, select, [contenteditable='true'], .slipbox-card-address-row, .slipbox-card-footer"
  ) === null;
}
function shouldNavigateDeckFromWheel(event, inlineEditor) {
  if (inlineEditor !== null && event.composedPath().includes(inlineEditor)) {
    return false;
  }
  return Math.abs(event.deltaX) > Math.abs(event.deltaY);
}
function isDeckInlineEditEnter(event, deck, state) {
  return event.target === deck && event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && state.hasActiveCard && !state.editing && !state.starting && !state.filing && !state.pendingCommand;
}

// src/deck-view.ts
var DECK_VIEW_TYPE = "slipbox-deck";
var RENDER_EDGE_BUFFER = 2;
var LAYOUT_MEASUREMENT_RETRIES = 2;
var SPACE_RECENTER_DURATION_MS = 180;
var VIEWPORT_CENTER_DURATION_MS = 180;
var DECK_MAP_SECTION_LABEL_SPACING = 14;
var DECK_MAP_MARKER_BUDGET = 512;
var COMMAND_FEEDBACK_DURATION_MS = 1800;
var PENDING_COMMAND_ACTIONS = /* @__PURE__ */ new Set([
  "find-address-forward",
  "find-address-backward",
  "find-address-first",
  "pull-into-pile"
]);
var inlineEditStatusSequence = 0;
var DeckView = class _DeckView extends import_obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.cardFooters = new CardFooterManager({
      app: this.app,
      leaf: this.leaf,
      hoverSource: DECK_VIEW_TYPE,
      isInTray: (file) => this.plugin.isFileInTray(file),
      toggleTray: (file) => this.plugin.toggleFileInTray(file),
      runAfterEditing: (reason, action) => {
        void this.runAfterInlineEditing(reason, action);
      }
    });
    this.trayRenderer = new TrayRenderer(this.app, this.plugin, {
      jumpToFiledCard: (path) => this.jumpToPath(path),
      moveCardBy: (cardRef, delta) => this.moveTrayCardBy(cardRef, delta),
      beginFiling: (file) => this.startFiling(file),
      updateFilingInput: (value) => this.updateFilingInput(value),
      confirmFiling: () => void this.confirmFiling(),
      cancelFiling: () => void this.cancelFiling(),
      previewFilingPlacement: () => void this.previewFilingPlacement(),
      filingInputFocusChanged: (focused) => this.setDeckKeybindingsSuspended(focused),
      beginInlineEditing: (file) => this.beginTrayInlineEditing(file),
      runAfterEditing: (reason, action) => this.runAfterInlineEditing(reason, action)
    });
    this.registerEvent(
      this.app.workspace.on("css-change", () => this.cardFooters.scheduleLayout())
    );
    this.scope = new import_obsidian3.Scope(this.app.scope);
    this.updateKeybindings();
  }
  activePath = null;
  filingFile = null;
  filingSourcePath = null;
  filingInputValue = "";
  filingPreview = null;
  filingMessage = "Enter an address.";
  filingConfirmationInProgress = false;
  stageEl = null;
  spaceEl = null;
  renderedCards = [];
  renderComponents = /* @__PURE__ */ new Map();
  cardScrollPositions = /* @__PURE__ */ new Map();
  viewportOffset = 0;
  pointerLastX = null;
  pointerLastY = null;
  spaceOffsetX = 0;
  spaceOffsetY = 0;
  spaceRecenteringTimer = null;
  viewportCenteringFrame = null;
  renderWindowStart = 0;
  renderWindowEnd = -1;
  renderRefreshPending = false;
  renderVersion = 0;
  history = new NavigationHistory();
  backButtonEl = null;
  forwardButtonEl = null;
  bookmarksButtonEl = null;
  toolbarEl = null;
  deckMapEl = null;
  deckMapRailEl = null;
  deckMapSectionLayerEl = null;
  deckMapBookmarkLayerEl = null;
  deckMapActiveMarkerEl = null;
  deckMapBookmarkMarkerEls = /* @__PURE__ */ new Map();
  deckMapSections = [];
  deckMapBookmarkCount = 0;
  resizeObserver = null;
  positioningFrame = null;
  positioningRetriesRemaining = 0;
  cardFooters;
  trayRenderer;
  keymapHandlers = [];
  deckKeybindingsSuspended = false;
  pendingCommand = IDLE_DECK_COMMAND;
  pendingCommandStartEvent = null;
  pendingCommandEl = null;
  pendingCommandFeedback = "";
  pendingCommandFeedbackTimer = null;
  chromeVisibility = DEFAULT_DECK_CHROME_VISIBILITY;
  inlineEdit = null;
  inlineEditFinalization = new InlineEditFinalizationCoordinator();
  inlineEditStarting = false;
  renderRefreshDeferred = false;
  getViewType() {
    return DECK_VIEW_TYPE;
  }
  getDisplayText() {
    return "Slipbox";
  }
  getIcon() {
    return "archive";
  }
  async onOpen() {
    this.contentEl.addClass("slipbox-deck-view");
    this.contentEl.tabIndex = 0;
    this.register(installPendingDeckCommandKeyCapture(
      this.contentEl.ownerDocument,
      {
        isPending: () => this.pendingCommand.kind !== "idle",
        isActive: () => this.app.workspace.getActiveViewOfType(_DeckView) === this,
        shouldIgnore: (event) => {
          if (event !== this.pendingCommandStartEvent) {
            return false;
          }
          this.pendingCommandStartEvent = null;
          return true;
        },
        handle: (event) => {
          this.handleDeckCommandContinuation(event);
        }
      }
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
        pendingCommand: this.pendingCommand.kind !== "idle"
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
        () => void this.cancelFiling()
      )) {
        return;
      }
      if (this.filingFile !== null && event.key === "Tab" && event.shiftKey && event.target !== this.trayRenderer.filingInput) {
        event.preventDefault();
        this.trayRenderer.focusFilingInputNow();
      }
    }, { capture: true });
    this.registerDomEvent(
      this.contentEl.ownerDocument,
      "pointerdown",
      (event) => this.handleInlineEditPointerDown(event),
      { capture: true }
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (this.inlineEdit !== null && leaf !== this.leaf) {
          void this.finishInlineEditing("active-leaf-change");
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        if (this.inlineEdit !== null) {
          void this.finishInlineEditing("file-open");
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("window-open", () => {
        if (this.inlineEdit !== null) {
          void this.finishInlineEditing("popout-window-open");
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("window-close", () => {
        if (this.inlineEdit !== null) {
          void this.finishInlineEditing("popout-window-close");
        }
      })
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
      if (this.inlineEdit !== null && this.contentEl.ownerDocument.visibilityState === "hidden") {
        void this.finishInlineEditing("view-hidden");
      }
    });
    this.observeDeckSize();
    await this.refresh();
    await this.restoreDetachedInlineEdit();
  }
  async onClose() {
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
          renderedScrollTop: editing.renderedScrollTop
        }
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
    this.deckMapBookmarkLayerEl = null;
    this.deckMapActiveMarkerEl = null;
    this.deckMapBookmarkMarkerEls.clear();
    this.deckMapSections = [];
    this.deckMapBookmarkCount = 0;
    this.pendingCommandEl = null;
    this.pendingCommandStartEvent = null;
    this.history.reset();
  }
  onResize() {
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
    this.updateDeckMapSectionLabels();
  }
  get activeCard() {
    if (this.activePath === null) {
      return null;
    }
    return this.plugin.index.filedByPath(this.activePath) ?? null;
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
  handlePathRename(oldPath, newPath) {
    const editing = this.inlineEdit;
    const editingPath = editing?.controller.snapshot.path ?? null;
    const renamedEditingPath = editingPath === null ? null : renamePathReference(editingPath, oldPath, newPath);
    if (editing !== null && editingPath !== null && renamedEditingPath !== null && renamedEditingPath !== editingPath) {
      if (!this.plugin.renameInlineEdit(editingPath, renamedEditingPath, this)) {
        editing.controller.markConflict(
          "The renamed path is already being edited in another Slipbox view."
        );
        this.applyInlineEditFailure(editing.controller.snapshot.failure);
      } else {
        editing.controller.renamePath(renamedEditingPath);
        const renamed = this.plugin.index.fileAtPath(renamedEditingPath);
        if (renamed !== void 0) {
          editing.file = renamed;
        }
        editing.cardEl.dataset.path = renamedEditingPath;
        const component = this.renderComponents.get(editingPath);
        if (component !== void 0) {
          this.renderComponents.delete(editingPath);
          this.renderComponents.set(renamedEditingPath, component);
        }
      }
    }
    if (this.activePath !== null) {
      this.activePath = renamePathReference(this.activePath, oldPath, newPath);
    }
    this.history.transform(
      (path) => renamePathReference(path, oldPath, newPath)
    );
    this.cardScrollPositions = new Map(
      [...this.cardScrollPositions].map(([path, scroll]) => [
        renamePathReference(path, oldPath, newPath),
        scroll
      ])
    );
    if (this.filingSourcePath !== null) {
      this.filingSourcePath = renamePathReference(
        this.filingSourcePath,
        oldPath,
        newPath
      );
      this.recalculateFilingPreview();
    }
  }
  handlePathDeletion(deletedPath) {
    const editingPath = this.inlineEdit?.controller.snapshot.path ?? null;
    if (editingPath !== null && pathIsAtOrBelow(editingPath, deletedPath)) {
      this.inlineEdit?.controller.markConflict(
        "The card was deleted while it was being edited. Your draft was kept.",
        true
      );
      this.applyInlineEditFailure(this.inlineEdit?.controller.snapshot.failure ?? null);
    }
    if (this.activePath !== null && pathIsAtOrBelow(this.activePath, deletedPath) && this.activePath !== editingPath) {
      this.activePath = null;
    }
    this.history.transform(
      (path) => pathIsAtOrBelow(path, deletedPath) ? void 0 : path
    );
    for (const path of this.cardScrollPositions.keys()) {
      if (pathIsAtOrBelow(path, deletedPath)) {
        this.cardScrollPositions.delete(path);
      }
    }
    if (this.filingSourcePath !== null && pathIsAtOrBelow(this.filingSourcePath, deletedPath)) {
      this.clearFilingPlacement();
      this.filingMessage = "The source card no longer exists.";
    }
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
    if (this.inlineEdit !== null) {
      const escapeHandler = scope.register([], "Escape", (event) => {
        return this.handleInlineEditEscape(event) ? false : void 0;
      });
      this.keymapHandlers.push(escapeHandler);
    }
    if (!this.deckKeybindingsSuspended) {
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
  }
  setDeckKeybindingsSuspended(suspended) {
    if (this.deckKeybindingsSuspended === suspended) {
      return;
    }
    if (suspended) {
      this.clearPendingCommand();
    }
    this.deckKeybindingsSuspended = suspended;
    this.updateKeybindings();
  }
  handleInlineEditEscape(event) {
    const editing = this.inlineEdit;
    if (editing === null || !consumeInlineEditEscape(event, editing.textarea)) {
      return false;
    }
    void this.finishInlineEditing("escape").then((saved) => {
      if (saved) {
        this.contentEl.focus({ preventScroll: true });
      }
    });
    return true;
  }
  canRunAction(action, target) {
    if (action === "confirm-filing") {
      return this.filingFile !== null && this.filingPreview !== null && !this.filingConfirmationInProgress;
    }
    if (action === "cancel-filing") {
      return this.filingFile !== null && !this.filingConfirmationInProgress;
    }
    const filed = this.plugin.index.snapshot.filed;
    const active = target ?? this.activeCard;
    const activeIndex = active === null ? -1 : this.plugin.index.filedIndexForPath(active.path);
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
    return dispatchInlineAwareDeckAction(
      {
        editing: this.inlineEdit !== null,
        starting: this.inlineEditStarting
      },
      (semanticAction) => this.runAfterInlineEditing(
        `deck-action:${action}`,
        semanticAction
      ),
      () => this.performAction(action, card)
    );
  }
  performAction(action, card) {
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
          this.plugin.settings.showDeckToolbar
        );
        this.applyChromeVisibility();
        break;
      case "toggle-deck-map":
        this.chromeVisibility = toggleDeckMapVisibility(
          this.chromeVisibility,
          this.plugin.settings.showDeckMap
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
  async refresh() {
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
    } else if (this.history.current() === void 0) {
      this.history.reset(this.activePath);
    } else if (this.activePath !== previousActivePath) {
      this.history.replaceCurrent(this.activePath);
    }
    this.clampViewportOffset();
    await this.renderDeck(this.filingFile === null || restoreFilingInputFocus);
  }
  async startFiling(file) {
    const trayPosition = cardPosition(this.plugin.tray, file.path);
    if (trayPosition !== null && trayPosition.cardIndex > 0 && !this.plugin.tray.expandedPileIds.includes(trayPosition.pileId)) {
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
  async cancelFiling() {
    if (this.filingConfirmationInProgress) {
      return;
    }
    this.filingFile = null;
    this.filingSourcePath = null;
    this.filingPreview = null;
    this.filingInputValue = "";
    this.filingConfirmationInProgress = false;
    await this.renderDeck(false);
    new import_obsidian3.Notice("Filing cancelled. The card remains in its pile.");
  }
  async handleDeckOrderingChanged() {
    const restoreFilingInputFocus = this.trayRenderer.isFilingInputFocused;
    this.recalculateFilingPreview();
    this.viewportOffset = 0;
    await this.renderDeck(restoreFilingInputFocus);
  }
  async goToPath(path) {
    const moved = await this.navigateToPath(path);
    if (moved) {
      this.history.replaceCurrent(path);
      this.updateHistoryControls();
    }
  }
  async jumpToPath(path) {
    if (this.activePath !== null) {
      this.history.replaceCurrent(this.activePath);
    }
    if (this.plugin.index.filedByPath(path) === void 0) {
      new import_obsidian3.Notice(`Card ${path} is missing or invalid.`);
      return;
    }
    this.history.jump(path);
    await this.navigateToPath(path);
    this.updateHistoryControls();
  }
  async goBack() {
    const path = this.history.back();
    if (path === void 0) {
      return;
    }
    if (!await this.navigateToPath(path)) {
      new import_obsidian3.Notice(`The Back destination ${path} is no longer available.`);
    }
    this.updateHistoryControls();
  }
  async goForward() {
    const path = this.history.forward();
    if (path === void 0) {
      return;
    }
    if (!await this.navigateToPath(path)) {
      new import_obsidian3.Notice(`The Forward destination ${path} is no longer available.`);
    }
    this.updateHistoryControls();
  }
  async addBookmarkToCurrent() {
    if (this.activePath === null) {
      new import_obsidian3.Notice("There is no active filed card.");
      return;
    }
    const bookmarkedPaths = this.bookmarkedPaths();
    bookmarkedPaths.add(this.activePath);
    this.updateBookmarkUi(bookmarkedPaths);
    await this.plugin.addBookmark(this.activePath);
  }
  async removeBookmark(path) {
    const bookmarkedPaths = this.bookmarkedPaths();
    bookmarkedPaths.delete(path);
    this.updateBookmarkUi(bookmarkedPaths);
    await this.plugin.removeBookmark(path);
  }
  handleBookmarksChanged() {
    this.updateBookmarkUi();
  }
  finishInlineEditing(reason) {
    return this.inlineEditFinalization.finish(
      reason,
      (reasons) => this.finishInlineEditingOnce(reasons)
    );
  }
  async finishInlineEditingOnce(reasons) {
    const editing = this.inlineEdit;
    if (editing === null) {
      return true;
    }
    const saved = await editing.controller.finish();
    if (!saved) {
      this.applyInlineEditFailure(editing.controller.snapshot.failure);
      if (this.app.workspace.getActiveViewOfType(_DeckView) === this) {
        editing.textarea.focus({ preventScroll: true });
      }
      return false;
    }
    const path = editing.controller.snapshot.path;
    const shouldSkipRender = ["view-close", "plugin-unload", "quit"].some((reason) => reasons.has(reason));
    this.inlineEdit = null;
    this.plugin.releaseInlineEdit(path, this);
    this.setDeckKeybindingsSuspended(false);
    editing.cardEl.removeClass("is-inline-editing");
    editing.bodyEl.removeClasses([
      "is-inline-editing",
      "has-inline-edit-error"
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
  async runAfterInlineEditing(reason, action) {
    return runAfterInlineEditing(
      () => this.finishInlineEditing(reason),
      action
    );
  }
  async beginTrayInlineEditing(file) {
    const filed = this.plugin.index.filedByFile(file);
    if (filed !== void 0) {
      if (!await this.runAfterInlineEditing(
        "tray-promote-for-editing",
        () => this.jumpToPath(filed.path)
      )) {
        return;
      }
      await this.beginDeckInlineEditing(file, "tray");
      return;
    }
    await this.beginInlineEditing(file, "tray", null);
  }
  async beginDeckInlineEditing(file, origin, bodySurface) {
    const surface = bodySurface ?? this.cardBodyForPath(file.path);
    if (surface === null) {
      new import_obsidian3.Notice("The card is outside the current render window.");
      return;
    }
    await this.beginInlineEditing(file, origin, surface);
  }
  async beginInlineEditing(file, origin, bodySurface, restored) {
    if (this.filingFile !== null) {
      new import_obsidian3.Notice("Finish filing before editing a card body.");
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
      if (!await this.finishInlineEditing("start-another-editor")) {
        return;
      }
    }
    if (!this.plugin.acquireInlineEdit(file.path, this)) {
      return;
    }
    this.inlineEditStarting = true;
    try {
      const prepared = restored === void 0 ? await this.plugin.prepareInlineEdit(file) : { file, body: restored.baseBody };
      const mounted = this.mountInlineEditing(
        prepared.file,
        origin,
        prepared.body,
        bodySurface,
        restored?.renderedScrollTop
      );
      this.inlineEdit = mounted;
      if (restored !== void 0 && restored.draft !== restored.baseBody) {
        mounted.textarea.value = restored.draft;
        mounted.controller.updateDraft(restored.draft);
      }
      if (restored !== void 0) {
        mounted.textarea.scrollTop = restored.textareaScrollTop;
      }
      if (restored?.conflictMessage !== null && restored?.conflictMessage !== void 0) {
        mounted.controller.markConflict(
          restored.conflictMessage,
          restored.conflictRetryable
        );
        this.applyInlineEditFailure(mounted.controller.snapshot.failure);
      }
      this.setDeckKeybindingsSuspended(true);
      window.requestAnimationFrame(() => {
        if (this.inlineEdit === mounted) {
          mounted.textarea.focus({ preventScroll: true });
          mounted.textarea.setSelectionRange(
            restored?.selectionStart ?? mounted.textarea.value.length,
            restored?.selectionEnd ?? mounted.textarea.value.length
          );
          if (restored !== void 0) {
            mounted.textarea.scrollTop = restored.textareaScrollTop;
          }
        }
      });
    } catch (error) {
      this.plugin.releaseInlineEdit(file.path, this);
      new import_obsidian3.Notice(`Could not start inline editing: ${errorMessage(error)}`);
    } finally {
      this.inlineEditStarting = false;
    }
  }
  mountInlineEditing(file, origin, baseBody, requestedBodySurface, restoredRenderedScrollTop) {
    let bodyEl = requestedBodySurface;
    let cardEl = bodyEl?.closest(".slipbox-card") ?? null;
    let overlayEl = null;
    let presentationSnapshot = null;
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
        spellcheck: "true"
      }
    });
    textarea.value = baseBody;
    const statusId = `slipbox-inline-edit-status-${++inlineEditStatusSequence}`;
    textarea.setAttr("aria-errormessage", statusId);
    const statusEl = bodyEl.createDiv({
      cls: "slipbox-inline-edit-status",
      attr: {
        id: statusId,
        role: "status",
        "aria-live": "assertive"
      }
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
        cancelScheduled: (handle) => window.clearTimeout(handle),
        reportFailure: (failure) => this.reportInlineEditFailure(failure)
      }
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
      presentationSnapshot
    };
  }
  renderUnfiledInlineOverlay(file) {
    const stage = this.stageEl;
    if (stage === null) {
      throw new Error("The Deck stage is unavailable");
    }
    const overlay = stage.createDiv({ cls: "slipbox-inline-edit-overlay" });
    const card = overlay.createDiv({
      cls: "slipbox-card slipbox-inline-edit-overlay-card is-active",
      attr: {
        "aria-label": `Unfiled \xB7 ${this.plugin.cardTitle(file)}`
      }
    });
    card.dataset.path = file.path;
    const frame = card.createDiv({ cls: "slipbox-card-frame" });
    const addressRow = frame.createDiv({ cls: "slipbox-card-address-row" });
    const identity = addressRow.createDiv({ cls: "slipbox-card-header-identity" });
    identity.createSpan({ cls: "slipbox-card-address", text: "unfiled" });
    const title = cardHeaderTitle(
      this.plugin.cardTitle(file),
      this.plugin.settings.showTitleInDeck
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
          () => this.startFiling(file)
        );
        return true;
      }
    );
    this.renderCardAction(
      actions,
      "file-pen-line",
      "slipbox-card-open",
      "Open",
      () => {
        void this.runAfterInlineEditing(
          "overlay-open-note",
          () => this.plugin.openMarkdownFile(file)
        );
        return true;
      }
    );
    const body = frame.createDiv({ cls: "slipbox-card-scroll" });
    return { overlay, card, body };
  }
  handleInlineEditPointerDown(event) {
    const editing = this.inlineEdit;
    if (editing === null || !(event.target instanceof Element)) {
      return;
    }
    if (editing.textarea.contains(event.target)) {
      return;
    }
    if (editing.cardEl.contains(event.target) && event.target.closest("a, button, input, select, [contenteditable='true']") === null) {
      return;
    }
    void this.finishInlineEditing("outside-pointer");
  }
  reportInlineEditFailure(failure) {
    this.applyInlineEditFailure(failure);
    const detail = failure.error === void 0 ? failure.message : `${failure.message} ${errorMessage(failure.error)}`;
    new import_obsidian3.Notice(`${detail} Your draft remains in the card and can be copied.`);
  }
  applyInlineEditFailure(failure) {
    const editing = this.inlineEdit;
    if (editing === null || failure === null) {
      return;
    }
    editing.bodyEl.addClass("has-inline-edit-error");
    editing.textarea.setAttr("aria-invalid", "true");
    editing.statusEl.setText(failure.message);
    editing.statusEl.hidden = false;
  }
  cardBodyForPath(path) {
    const escaped = CSS.escape(path);
    return this.spaceEl?.querySelector(
      `.slipbox-card[data-path="${escaped}"] .slipbox-card-scroll`
    ) ?? null;
  }
  async rerenderEditedPath(file, target, scrollTop) {
    if (!target.isConnected) {
      return;
    }
    target.empty();
    target.removeClasses(["is-inline-editing", "has-inline-edit-error"]);
    target.addClass("markdown-rendered");
    const filed = this.plugin.index.filedByFile(file);
    if (filed === void 0) {
      return;
    }
    this.cardScrollPositions.set(file.path, scrollTop);
    await this.renderMarkdownCard(filed, target, this.renderVersion);
    target.scrollTop = scrollTop;
  }
  deckPresentationSnapshot() {
    const focused = this.contentEl.ownerDocument.activeElement;
    return {
      activePath: this.activePath,
      viewportOffset: this.viewportOffset,
      spaceOffsetX: this.spaceOffsetX,
      spaceOffsetY: this.spaceOffsetY,
      focusedElement: focused instanceof HTMLElement ? focused : null
    };
  }
  restoreDeckPresentation(snapshot) {
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
  async restoreDetachedInlineEdit() {
    const draft = this.plugin.takeDetachedInlineEdit();
    if (draft === null) {
      return;
    }
    const file = this.plugin.index.fileAtPath(draft.path) ?? draft.file;
    const filed = this.plugin.index.filedByFile(file);
    let bodySurface = null;
    if (filed !== void 0) {
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
      renderedScrollTop: draft.renderedScrollTop
    });
    if (this.inlineEdit?.controller.snapshot.path !== draft.path) {
      this.plugin.returnDetachedInlineEdit(draft);
    }
  }
  async navigateToPath(path) {
    const targetIndex = this.plugin.index.filedIndexForPath(path);
    if (targetIndex < 0) {
      new import_obsidian3.Notice(`Card ${path} is missing or invalid.`);
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
  chooseAvailableActiveCard() {
    const filed = this.plugin.index.snapshot.filed;
    const availablePaths = new Set(filed.map((card) => card.path));
    if (this.activePath !== null && availablePaths.has(this.activePath)) {
      return;
    }
    this.activePath = filed[0]?.path ?? null;
  }
  async renderDeck(focusFilingInput = true) {
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
    this.deckMapBookmarkLayerEl = null;
    this.deckMapActiveMarkerEl = null;
    this.deckMapBookmarkMarkerEls.clear();
    this.deckMapSections = [];
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
      () => version === this.renderVersion
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
  renderToolbar(shell) {
    const toolbar = shell.createDiv({ cls: "slipbox-deck-toolbar" });
    this.toolbarEl = toolbar;
    const identity = toolbar.createDiv({ cls: "slipbox-deck-identity" });
    const icon = identity.createSpan({ cls: "slipbox-deck-icon" });
    (0, import_obsidian3.setIcon)(icon, "archive");
    identity.createSpan({ text: "Slipbox" });
    const history = toolbar.createDiv({ cls: "slipbox-toolbar-group slipbox-history-controls" });
    const back = history.createEl("button", {
      cls: "slipbox-icon-button",
      attr: { type: "button", "aria-label": "Back" }
    });
    (0, import_obsidian3.setIcon)(back, "arrow-left");
    back.addEventListener("click", () => this.runAction("back"));
    this.backButtonEl = back;
    const forward = history.createEl("button", {
      cls: "slipbox-icon-button",
      attr: { type: "button", "aria-label": "Forward" }
    });
    (0, import_obsidian3.setIcon)(forward, "arrow-right");
    forward.addEventListener("click", () => this.runAction("forward"));
    this.forwardButtonEl = forward;
    this.updateHistoryControls();
    const controls = toolbar.createDiv({ cls: "slipbox-toolbar-group slipbox-toolbar-main" });
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
        () => this.renderDeck()
      );
    });
  }
  renderDeckMap(shell) {
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
        "aria-valuemax": String(filed.length)
      }
    });
    const rail = map.createDiv({
      cls: "slipbox-deck-map-rail",
      attr: { "aria-hidden": "true" }
    });
    const markerLayer = rail.createDiv({
      cls: "slipbox-deck-map-markers"
    });
    this.deckMapSectionLayerEl = rail.createDiv({
      cls: "slipbox-deck-map-sections"
    });
    this.deckMapEl = map;
    this.deckMapRailEl = rail;
    for (const index of sampleDeckMapIndices(
      filed.length,
      DECK_MAP_MARKER_BUDGET
    )) {
      const marker = markerLayer.createSpan({
        cls: "slipbox-deck-map-marker"
      });
      marker.style.setProperty(
        "--slipbox-deck-map-position",
        String(deckMapCoordinate(index, filed.length) ?? 0)
      );
    }
    this.deckMapBookmarkLayerEl = rail.createDiv({
      cls: "slipbox-deck-map-markers"
    });
    const activeLayer = rail.createDiv({
      cls: "slipbox-deck-map-markers"
    });
    this.deckMapActiveMarkerEl = activeLayer.createSpan({
      cls: "slipbox-deck-map-marker is-active is-hidden"
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
        cards.length
      );
      const target = targetIndex === null ? void 0 : cards[targetIndex];
      if (target !== void 0 && target.path !== this.activePath) {
        void this.runAfterInlineEditing(
          "deck-map-jump",
          () => this.jumpToPath(target.path)
        );
      }
    });
    map.addEventListener("keydown", (event) => {
      const action = event.key === "ArrowLeft" ? "previous-card" : event.key === "ArrowRight" ? "next-card" : event.key === "Home" ? "first-card" : event.key === "End" ? "last-card" : null;
      if (action === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.runAction(action);
    });
  }
  applyChromeVisibility() {
    applyDeckChromeVisibility(
      this.toolbarEl,
      this.deckMapEl,
      this.chromeVisibility,
      this.plugin.settings.showDeckToolbar,
      this.plugin.settings.showDeckMap,
      this.plugin.index.snapshot.filed.length
    );
  }
  renderPendingCommandStatus(shell) {
    this.pendingCommandEl = shell.createDiv({
      cls: "slipbox-pending-command-status",
      attr: {
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true"
      }
    });
    this.updatePendingCommandStatus();
  }
  updatePendingCommandStatus() {
    const status = this.pendingCommandEl;
    if (status === null) {
      return;
    }
    let instruction = "";
    if (this.pendingCommand.kind === "address") {
      instruction = this.pendingCommand.mode === "forward" ? "Find next: type an address initial \xB7 Esc to cancel" : this.pendingCommand.mode === "backward" ? "Find previous: type an address initial \xB7 Esc to cancel" : "Find from start: type an address initial \xB7 Esc to cancel";
    } else if (this.pendingCommand.kind === "pile") {
      const digits = this.pendingCommand.digits === "" ? "\u2026" : this.pendingCommand.digits;
      instruction = `Pile number: ${digits} \xB7 Enter to confirm \xB7 Esc to cancel`;
    }
    const text = this.pendingCommandFeedback || instruction;
    status.hidden = text === "";
    status.setText(text);
  }
  clearPendingCommand() {
    if (this.pendingCommandFeedbackTimer !== null) {
      window.clearTimeout(this.pendingCommandFeedbackTimer);
      this.pendingCommandFeedbackTimer = null;
    }
    this.pendingCommand = IDLE_DECK_COMMAND;
    this.pendingCommandFeedback = "";
    this.updatePendingCommandStatus();
  }
  showCommandFeedback(message) {
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
  beginAddressCommand(mode) {
    this.pendingCommandStartEvent = null;
    this.clearPendingCommand();
    this.pendingCommand = startAddressCommand(mode);
    this.updatePendingCommandStatus();
  }
  beginPileCommand() {
    this.pendingCommandStartEvent = null;
    this.clearPendingCommand();
    this.pendingCommand = startPileCommand();
    this.updatePendingCommandStatus();
  }
  completeAddressCommand(mode, initial) {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const targetIndex = findAddressInitialIndex(
      filed,
      activeIndex,
      initial,
      mode
    );
    const target = targetIndex === null ? void 0 : filed[targetIndex];
    if (target === void 0) {
      const position = mode === "forward" ? "later" : mode === "backward" ? "earlier" : "filed";
      this.showCommandFeedback(`No ${position} card begins with \u201C${initial}\u201D.`);
      return;
    }
    void this.jumpToPath(target.path);
  }
  completePileCommand(digits) {
    const ordinal = Number(digits);
    const pileCount = this.plugin.tray.piles.length;
    if (digits === "" || !Number.isSafeInteger(ordinal) || ordinal <= 0 || ordinal > pileCount) {
      this.pendingCommandFeedback = digits === "" ? "Enter a pile number before confirming." : pileCount === 0 ? "There are no piles." : `Pile ${digits} does not exist.`;
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
      ordinal
    );
    this.clearPendingCommand();
    if (next === this.plugin.tray) {
      this.showCommandFeedback(`The active card is already in pile ${ordinal}.`);
      return;
    }
    this.showCommandFeedback(
      source === null ? `Pulled the active card into pile ${ordinal}.` : `Moved the active card to pile ${ordinal}.`
    );
    void this.plugin.updateTray(next);
  }
  updateDeckMapBookmarks(bookmarkedPaths) {
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
        cls: "slipbox-deck-map-marker is-bookmarked"
      });
      marker.style.setProperty(
        "--slipbox-deck-map-position",
        String(position)
      );
      this.deckMapBookmarkMarkerEls.set(path, marker);
    }
    this.deckMapBookmarkCount = this.deckMapBookmarkMarkerEls.size;
    this.updateDeckMapActiveUi();
  }
  updateDeckMapSectionLabels() {
    const rail = this.deckMapRailEl;
    const layer = this.deckMapSectionLayerEl;
    if (rail === null || layer === null) {
      return;
    }
    const sections = visibleDeckMapSectionMarkers(
      this.deckMapSections,
      rail.getBoundingClientRect().width,
      DECK_MAP_SECTION_LABEL_SPACING
    );
    layer.empty();
    for (const section of sections) {
      const label = layer.createSpan({
        cls: "slipbox-deck-map-section",
        text: section.label
      });
      label.style.setProperty(
        "--slipbox-deck-map-position",
        String(section.position)
      );
    }
  }
  updateDeckMapActiveUi() {
    const map = this.deckMapEl;
    if (map === null) {
      return;
    }
    const cardCount = this.plugin.index.snapshot.filed.length;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const position = deckMapCoordinate(activeIndex, cardCount);
    const activeMarker = this.deckMapActiveMarkerEl;
    const bookmarkLabel = `${this.deckMapBookmarkCount} bookmark${this.deckMapBookmarkCount === 1 ? "" : "s"}`;
    if (position === null) {
      if (activeMarker !== null) {
        activeMarker.addClass("is-hidden");
      }
      map.removeAttribute("aria-valuenow");
      map.setAttr(
        "aria-valuetext",
        `${cardCount} filed cards; ${bookmarkLabel}`
      );
      return;
    }
    if (activeMarker !== null) {
      activeMarker.removeClass("is-hidden");
      activeMarker.style.setProperty(
        "--slipbox-deck-map-position",
        String(position)
      );
    }
    const summary = `Card ${activeIndex + 1} of ${cardCount}; ${bookmarkLabel}`;
    map.setAttr("aria-valuenow", String(activeIndex + 1));
    map.setAttr("aria-valuetext", summary);
  }
  renderEmptyDeck(stage) {
    const empty = stage.createDiv({ cls: "slipbox-deck-empty" });
    empty.createEl("h2", { text: "The filing box is empty" });
    empty.createEl("p", {
      text: "Create a new card, then file it with a manual address."
    });
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
    const focusDisplayIndex = activeIndex;
    for (let filedIndex = start; filedIndex <= end; filedIndex += 1) {
      const card = filed[filedIndex];
      if (card === void 0) {
        continue;
      }
      const cardEl = stage.createDiv({ cls: "slipbox-card" });
      cardEl.dataset.index = String(filedIndex);
      cardEl.dataset.filedIndex = String(filedIndex);
      cardEl.dataset.path = card.path;
      cardEl.toggleClass("is-active", filedIndex === activeIndex);
      const isBookmarked = this.plugin.bookmarkAtPath(card.path) !== void 0;
      cardEl.toggleClass("is-bookmarked", isBookmarked);
      const isInTray = this.plugin.isFileInTray(card.file);
      const title = this.plugin.cardTitle(card.file);
      const cardLabel = `${card.address} \xB7 ${title}`;
      cardEl.setAttr("aria-label", cardLabel);
      (0, import_obsidian3.setTooltip)(cardEl, cardLabel, {
        placement: "bottom",
        delay: 350
      });
      cardEl.style.zIndex = String(
        cardStackOrder(filedIndex, focusDisplayIndex)
      );
      this.renderedCards.push(cardEl);
      const frame = cardEl.createDiv({ cls: "slipbox-card-frame" });
      const addressRow = frame.createDiv({ cls: "slipbox-card-address-row" });
      const identity = addressRow.createDiv({ cls: "slipbox-card-header-identity" });
      identity.createSpan({ cls: "slipbox-card-address", text: card.address });
      const headerTitle = cardHeaderTitle(
        title,
        this.plugin.settings.showTitleInDeck
      );
      if (headerTitle !== null) {
        identity.createSpan({
          cls: "slipbox-card-header-title",
          text: headerTitle
        });
      }
      const cardActions = addressRow.createDiv({ cls: "slipbox-card-actions" });
      if (this.plugin.settings.deckHeaderButtons["open-note"]) {
        this.renderCardAction(
          cardActions,
          "file-pen-line",
          "slipbox-card-open",
          "Open",
          () => this.runAction("open-note", card)
        );
      }
      if (this.plugin.settings.deckHeaderButtons["copy-link"]) {
        this.renderCardAction(
          cardActions,
          "copy",
          "slipbox-card-copy-link",
          "Copy card link",
          () => this.runAction("copy-link", card)
        );
      }
      if (this.plugin.settings.deckHeaderButtons.tray) {
        const trayAction = trayToggleLabel(isInTray);
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
      if (this.plugin.settings.deckHeaderButtons.bookmark) {
        const bookmarkAction = isBookmarked ? "Remove bookmark" : "Add bookmark";
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
        activate: (backlink) => this.jumpToPath(backlink.path)
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
          card.address,
          DECK_VIEW_TYPE,
          this.leaf
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
          () => this.selectCardWithoutMoving(card.path)
        );
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
    this.renderComponents.get(card.path)?.unload();
    const component = new import_obsidian3.Component();
    component.load();
    this.renderComponents.set(card.path, component);
    try {
      const body = await this.plugin.index.readBody(card.file);
      if (version !== this.renderVersion || this.renderComponents.get(card.path) !== component) {
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
  async toggleCardBookmark(path) {
    const bookmarkedPaths = this.bookmarkedPaths();
    if (bookmarkedPaths.has(path)) {
      bookmarkedPaths.delete(path);
    } else {
      bookmarkedPaths.add(path);
    }
    this.updateBookmarkUi(bookmarkedPaths);
    await this.plugin.toggleBookmark(path);
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
        const link = event.target.closest("a");
        const linkPath = link?.dataset.href ?? link?.getAttribute("href") ?? void 0;
        if (link === null || linkPath === void 0 || linkPath === "") {
          return;
        }
        const internal = link.matches(".internal-link");
        const newLeaf = event.metaKey || event.ctrlKey;
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.runAfterInlineEditing("rendered-link", async () => {
          const filed = internal ? resolveFiledCardLink((0, import_obsidian3.getLinkpath)(linkPath), sourcePath, {
            resolveFile: (path, source) => this.app.metadataCache.getFirstLinkpathDest(path, source),
            filedPathForFile: (file) => this.plugin.index.filedByFile(file)?.path,
            firstFiledPathAtAddress: (address) => this.plugin.index.firstFiledAtAddress(address)?.path
          }) : void 0;
          const action = renderedLinkAction(internal, newLeaf, linkPath, filed);
          if (action.kind === "card") {
            await this.jumpToPath(action.path);
          } else if (action.kind === "note") {
            await this.app.workspace.openLinkText(
              action.linktext,
              sourcePath,
              newLeaf
            );
          } else {
            window.open(link.href, "_blank", "noopener");
          }
        });
      },
      { capture: true }
    );
  }
  recalculateFilingPreview() {
    const file = this.filingFile;
    const sourcePath = this.filingSourcePath;
    if (file === null || sourcePath === null) {
      this.clearFilingPlacement();
      return;
    }
    if (file.path !== sourcePath || this.plugin.index.fileAtPath(sourcePath) !== file) {
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
  clearFilingPlacement() {
    this.filingPreview = null;
  }
  updateFilingInput(value) {
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
  currentTrayFilingState() {
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
      invalid: preview === null && this.filingMessage !== "Enter an address.",
      confirmationInProgress: this.filingConfirmationInProgress,
      duplicatePaths: preview === null ? [] : this.plugin.index.filedAtAddress(preview.address).map((card) => card.path)
    };
  }
  async previewFilingPlacement() {
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
  async confirmFiling() {
    const file = this.filingFile;
    const preview = this.filingPreview;
    if (file === null || preview === null || this.filingConfirmationInProgress) {
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
        new import_obsidian3.Notice("The Deck changed. Review the updated position and confirm again.");
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
  renderBookmarkEdgeTabs(stage, bookmarkedPaths = this.bookmarkedPaths()) {
    stage.querySelectorAll(".slipbox-bookmark-edge-tab").forEach((tab) => tab.remove());
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
        text: `${direction === "left" ? "\u25C0" : "\u25B6"} ${card.address}`,
        attr: {
          type: "button",
          "aria-label": `Jump to bookmark ${card.address}`
        }
      });
      tab.addEventListener("click", () => {
        void this.runAfterInlineEditing(
          "bookmark-edge-jump",
          () => this.jumpToPath(card.path)
        );
      });
    }
  }
  attachBrowsingEvents(stage) {
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
          () => this.moveViewportByPixels(delta)
        );
      },
      { passive: false }
    );
    stage.addEventListener("pointerdown", (event) => {
      if (event.target !== stage || event.button !== 0) {
        return;
      }
      const begin = () => {
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
    const finishPointer = (event) => {
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
  applySpaceOffset() {
    if (this.spaceEl === null) {
      return;
    }
    this.spaceEl.style.transform = `translate(${this.spaceOffsetX}px, ${this.spaceOffsetY}px)`;
  }
  recenterSpace() {
    const space = this.spaceEl;
    const shouldAnimate = space !== null && (this.spaceOffsetX !== 0 || this.spaceOffsetY !== 0);
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
  cancelSpaceRecentering() {
    if (this.spaceRecenteringTimer !== null) {
      window.clearTimeout(this.spaceRecenteringTimer);
      this.spaceRecenteringTimer = null;
    }
    this.spaceEl?.removeClass("is-recentering");
  }
  moveViewportByPixels(deltaPixels) {
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
  moveBy(delta) {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }
    const targetIndex = deckIndexByDelta(activeIndex, delta, filed.length);
    const target = filed[targetIndex];
    if (target === void 0 || target.path === this.activePath) {
      return;
    }
    const viewportPosition = this.viewportPosition(activeIndex);
    this.activePath = target.path;
    this.viewportOffset = viewportPosition - targetIndex;
    this.history.replaceCurrent(target.path);
    this.centerViewportOnActive(targetIndex, true);
  }
  centerActiveCard() {
    if (this.activePath === null) {
      new import_obsidian3.Notice("There is no active filed card to centre.");
      return;
    }
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }
    this.recenterSpace();
    this.centerViewportOnActive(activeIndex, false);
  }
  centerViewportOnActive(activeIndex, smoothly) {
    const cardCount = this.plugin.index.snapshot.filed.length;
    const targetPosition = centredViewportPosition(activeIndex, cardCount);
    const startPosition = this.viewportPosition(activeIndex);
    this.cancelViewportCentering();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (!smoothly || reducedMotion || Math.abs(targetPosition - startPosition) < 1e-3) {
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
    const advance = (timestamp) => {
      if (this.activePath !== activePath || this.plugin.index.filedIndexForPath(activePath) !== activeIndex) {
        this.viewportCenteringFrame = null;
        return;
      }
      const progress = Math.min(
        1,
        Math.max(0, (timestamp - startedAt) / VIEWPORT_CENTER_DURATION_MS)
      );
      const easedProgress = 1 - (1 - progress) ** 3;
      const viewportPosition = startPosition + (targetPosition - startPosition) * easedProgress;
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
  cancelViewportCentering() {
    if (this.viewportCenteringFrame !== null) {
      window.cancelAnimationFrame(this.viewportCenteringFrame);
      this.viewportCenteringFrame = null;
    }
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
    void this.goToPath(target.path);
  }
  handleDeckActionKey(event, action, repeatable = false) {
    if (this.pendingCommand.kind !== "idle") {
      return this.handleDeckCommandContinuation(event);
    }
    if (shouldSuspendDeckShortcut(
      event.target,
      this.trayRenderer.isFilingInputFocused
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
  handleDeckCommandContinuation(event) {
    if (event === this.pendingCommandStartEvent) {
      this.pendingCommandStartEvent = null;
      return false;
    }
    this.pendingCommandStartEvent = null;
    if (this.pendingCommand.kind !== "idle") {
      if (shouldSuspendDeckShortcut(
        event.target,
        this.trayRenderer.isFilingInputFocused
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
            step.completion.initial
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
      () => void this.cancelFiling()
    );
  }
  selectCardWithoutMoving(path) {
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
      this.viewportOffset
    );
    this.history.replaceCurrent(path);
    this.positionCards();
    this.updateActiveUi();
  }
  applyViewportPosition(nextPosition) {
    const filed = this.plugin.index.snapshot.filed;
    const previousActiveIndex = this.plugin.index.filedIndexForPath(this.activePath);
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
    this.activePath = activeCard.path;
    this.viewportOffset = viewportPosition - activeIndex;
    this.history.replaceCurrent(activeCard.path);
    this.positionCards();
    this.updateActiveUi();
    if (this.pointerLastX === null) {
      this.queueRenderWindowRefresh();
    }
  }
  positionCards() {
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (this.renderedCards.length === 0 || activeIndex < 0) {
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
        focusDisplayIndex
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
      this.updateDeckMapSectionLabels();
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
  bookmarkedPaths() {
    return new Set(
      this.plugin.state.bookmarks.flatMap(
        (bookmark) => "path" in bookmark ? [bookmark.path] : []
      )
    );
  }
  updateBookmarkUi(bookmarkedPaths = this.bookmarkedPaths()) {
    const bookmarkCount = bookmarkedPaths.size;
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
      const path = cardEl.dataset.path;
      if (path === void 0) {
        continue;
      }
      const isBookmarked = bookmarkedPaths.has(path);
      cardEl.toggleClass("is-bookmarked", isBookmarked);
      const toggle = cardEl.querySelector(
        ".slipbox-card-bookmark-toggle"
      );
      if (toggle === null) {
        continue;
      }
      const action = isBookmarked ? "Remove bookmark" : "Add bookmark";
      toggle.toggleClass("is-bookmarked", isBookmarked);
      toggle.setAttr("aria-label", action);
      toggle.setAttr("aria-pressed", String(isBookmarked));
      (0, import_obsidian3.setTooltip)(toggle, action, {
        placement: "bottom",
        delay: 250
      });
    }
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl, bookmarkedPaths);
    }
    this.updateDeckMapBookmarks(bookmarkedPaths);
  }
  viewportPosition(activeIndex) {
    return activeIndex + this.viewportOffset;
  }
  clampViewportOffset() {
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
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
    if (this.inlineEdit !== null || this.inlineEditStarting) {
      this.renderRefreshDeferred = true;
      return;
    }
    if (this.renderRefreshPending || this.pointerLastX !== null) {
      return;
    }
    const filed = this.plugin.index.snapshot.filed;
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    if (activeIndex < 0) {
      return;
    }
    const displayCount = filed.length;
    const viewportIndex = Math.round(this.viewportPosition(activeIndex));
    const needsEarlierCards = this.renderWindowStart > 0 && viewportIndex <= this.renderWindowStart + RENDER_EDGE_BUFFER;
    const needsLaterCards = this.renderWindowEnd < displayCount - 1 && viewportIndex >= this.renderWindowEnd - RENDER_EDGE_BUFFER;
    if (!needsEarlierCards && !needsLaterCards) {
      return;
    }
    const restoreFilingInputFocus = this.trayRenderer.isFilingInputFocused;
    this.renderRefreshPending = true;
    window.requestAnimationFrame(() => {
      this.renderRefreshPending = false;
      if (this.stageEl !== null) {
        void this.renderDeck(
          this.filingFile === null || restoreFilingInputFocus
        );
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
    for (const component of this.renderComponents.values()) {
      component.unload();
    }
    this.renderComponents.clear();
  }
  reconcileScrollPositions() {
    const availablePaths = new Set(
      this.plugin.index.snapshot.filed.map((card) => card.path)
    );
    for (const path of this.cardScrollPositions.keys()) {
      if (!availablePaths.has(path)) {
        this.cardScrollPositions.delete(path);
      }
    }
  }
};
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/modals.ts
var import_obsidian4 = require("obsidian");
var TextPromptModal = class extends import_obsidian4.Modal {
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
        new import_obsidian4.Notice("A name is required.");
        return;
      }
      this.finish(value);
    });
    activateDefaultButtonOnEnter(contentEl, submit);
    window.setTimeout(() => {
      input.focus();
      input.select();
    });
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
var TemplatePromptModal = class extends import_obsidian4.FuzzySuggestModal {
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
var CanvasPromptModal = class extends import_obsidian4.FuzzySuggestModal {
  constructor(app, files, resolveFile) {
    super(app);
    this.files = files;
    this.resolveFile = resolveFile;
    this.setPlaceholder("Choose a Canvas (Esc to cancel)");
  }
  settled = false;
  getItems() {
    return [...this.files];
  }
  getItemText(file) {
    return file.path.slice(0, -".canvas".length);
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
function promptForCanvas(app, files) {
  return new Promise((resolve) => {
    new CanvasPromptModal(app, files, resolve).open();
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
var ConfirmationModal = class extends import_obsidian4.Modal {
  constructor(app, heading, message, confirmLabel, resolveChoice) {
    super(app);
    this.heading = heading;
    this.message = message;
    this.confirmLabel = confirmLabel;
    this.resolveChoice = resolveChoice;
  }
  settled = false;
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("slipbox-modal");
    contentEl.createEl("h2", { text: this.heading });
    contentEl.createEl("p", { text: this.message });
    const actions = contentEl.createDiv({ cls: "slipbox-modal-actions" });
    const cancel = actions.createEl("button", { text: "Keep", type: "button" });
    const confirm = actions.createEl("button", {
      text: this.confirmLabel,
      type: "button",
      cls: "mod-warning"
    });
    cancel.addEventListener("click", () => this.finish(false));
    confirm.addEventListener("click", () => this.finish(true));
    activateDefaultButtonOnEnter(contentEl, confirm);
    confirm.focus({ preventScroll: true });
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveChoice(false);
    }
  }
  finish(confirmed) {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveChoice(confirmed);
    this.close();
  }
};
function confirmAction(app, heading, message, confirmLabel) {
  return new Promise((resolve) => {
    new ConfirmationModal(app, heading, message, confirmLabel, resolve).open();
  });
}
var BookmarksModal = class extends import_obsidian4.Modal {
  constructor(app, bookmarks, actions) {
    super(app);
    this.actions = actions;
    this.bookmarks = [...bookmarks];
  }
  bookmarks;
  listEl = null;
  addButton = null;
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("slipbox-modal");
    contentEl.createEl("h2", { text: "Bookmarks" });
    contentEl.createEl("p", {
      cls: "slipbox-empty-copy",
      text: "One persistent physical bookmark may be attached to each filed card."
    });
    this.listEl = contentEl.createDiv({ cls: "slipbox-modal-list" });
    this.renderList();
    this.addButton = renderCurrentCardAddAction(contentEl, {
      label: "+ add current card as bookmark",
      currentAddress: this.actions.currentPath,
      isCurrentListed: this.currentIsListed(),
      addCurrent: () => this.actions.addCurrent(),
      onAdded: () => this.close()
    });
  }
  onClose() {
    this.contentEl.empty();
    this.listEl = null;
    this.addButton = null;
  }
  renderList() {
    const list = this.listEl;
    if (list === null) {
      return;
    }
    list.empty();
    if (this.bookmarks.length === 0) {
      list.createEl("p", { cls: "slipbox-empty-copy", text: "No bookmarks yet." });
    }
    for (const bookmark of this.bookmarks) {
      const available = this.actions.isAvailable(bookmark.path);
      const row = list.createDiv({ cls: "slipbox-list-row slipbox-bookmark-row" });
      const visit = row.createEl("button", {
        cls: "slipbox-file-visit",
        attr: { type: "button" }
      });
      visit.createSpan({
        cls: "slipbox-list-label",
        text: available ? this.actions.label(bookmark.path) : `${bookmark.path} \xB7 missing`
      });
      visit.disabled = !available;
      visit.addEventListener("click", () => {
        this.actions.visit(bookmark.path);
        this.close();
      });
      const remove = iconButton(row, "trash-2", `Delete bookmark at ${bookmark.path}`);
      remove.addEventListener("click", () => {
        remove.disabled = true;
        void this.actions.remove(bookmark.path).then(() => {
          this.bookmarks = this.bookmarks.filter(
            (candidate) => candidate.path !== bookmark.path
          );
          this.renderList();
          updateCurrentCardAddAction(
            this.addButton,
            this.actions.currentPath,
            this.currentIsListed()
          );
        });
      });
    }
  }
  currentIsListed() {
    return this.bookmarks.some(
      (bookmark) => bookmark.path === this.actions.currentPath
    );
  }
};
function renderCurrentCardAddAction(contentEl, options) {
  const footer = contentEl.createDiv({ cls: "slipbox-modal-actions" });
  const add = footer.createEl("button", {
    text: options.label,
    cls: "mod-cta",
    attr: { type: "button" }
  });
  updateCurrentCardAddAction(
    add,
    options.currentAddress,
    options.isCurrentListed
  );
  add.addEventListener("click", () => {
    add.disabled = true;
    void options.addCurrent().then(() => options.onAdded());
  });
  activateDefaultButtonOnEnter(contentEl, add);
  return add;
}
function updateCurrentCardAddAction(button, currentAddress, isCurrentListed) {
  if (button !== null) {
    button.disabled = currentAddress === null || isCurrentListed;
  }
}
var IssuesModal = class extends import_obsidian4.Modal {
  constructor(app, index, actions) {
    super(app);
    this.index = index;
    this.actions = actions;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("slipbox-modal");
    contentEl.createEl("h2", { text: "Card address issues" });
    contentEl.createEl("p", {
      text: "Invalid addresses are excluded until corrected. Duplicate-address cards remain in the Deck beside one another, ordered by file path. Slipbox never repairs addresses automatically."
    });
    const list = contentEl.createDiv({ cls: "slipbox-modal-list" });
    for (const issue of this.index.issues) {
      const group = list.createDiv({ cls: "slipbox-issue-group" });
      group.createDiv({
        cls: `slipbox-issue-message is-${issue.severity}`,
        text: `${issue.severity === "warning" ? "Warning" : "Error"}: ${issue.message}`
      });
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
function iconButton(parent, icon, label) {
  const button = parent.createEl("button", {
    cls: "clickable-icon slipbox-icon-button",
    attr: { type: "button", "aria-label": label }
  });
  (0, import_obsidian4.setIcon)(button, icon);
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
var UNSAFE_FILENAME_CHARACTERS = new Set('\\/:*?"<>|');
function replaceUnsafeFilenameCharacters(value, replacement) {
  let result = "";
  for (const character of value) {
    result += character.charCodeAt(0) <= 31 || UNSAFE_FILENAME_CHARACTERS.has(character) ? replacement : character;
  }
  return result;
}
function safeNoteBasename(value) {
  const trimmed = value.trim();
  const safeContent = replaceUnsafeFilenameCharacters(trimmed, "").replace(/[. ]+$/, "").trim();
  if (safeContent === "") {
    return null;
  }
  const basename = replaceUnsafeFilenameCharacters(trimmed, "-").replace(/-+/g, "-").replace(/[. ]+$/, "").trim();
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

// src/settings-tab.ts
var import_obsidian5 = require("obsidian");
var SlipboxSettingTab = class extends import_obsidian5.PluginSettingTab {
  constructor(app, slipbox) {
    super(app, slipbox);
    this.slipbox = slipbox;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian5.Setting(containerEl).setName("Cards and metadata").setHeading();
    this.renderAddressProperty(containerEl);
    this.renderDeckOrdering(containerEl);
    new import_obsidian5.Setting(containerEl).setName("Title source").setDesc("Choose the filename or a top-level frontmatter property for note titles. New cards use the entered title in the selected location.").addDropdown((dropdown) => {
      dropdown.addOption("filename", "Filename").addOption("frontmatter", "Frontmatter property").setValue(this.slipbox.settings.titleSource).onChange((value) => {
        void this.save({
          ...this.slipbox.settings,
          titleSource: value === "frontmatter" ? "frontmatter" : "filename"
        }).then(() => this.redisplayPreservingScroll());
      });
    });
    const titleProperty = new import_obsidian5.Setting(containerEl).setName("Title property").setDesc("Exact top-level YAML key. Missing, blank, or non-text values fall back to the filename.").setDisabled(this.slipbox.settings.titleSource !== "frontmatter");
    titleProperty.addText((text) => {
      let property = this.slipbox.settings.titleProperty;
      const queueCommit = this.debounceTextCommit(text.inputEl, () => {
        if (property !== "" && property !== this.slipbox.settings.titleProperty) {
          void this.save({
            ...this.slipbox.settings,
            titleProperty: property
          });
        }
      });
      text.setValue(this.slipbox.settings.titleProperty).setDisabled(this.slipbox.settings.titleSource !== "frontmatter").onChange((value) => {
        property = value.trim();
        this.setPropertyValidity(titleProperty, property !== "");
        queueCommit();
      });
    });
    new import_obsidian5.Setting(containerEl).setName("Show title in Slipbox card headers").setDesc("Show resolved titles beside addresses in Deck and tray card headers.").addToggle((toggle) => {
      toggle.setValue(this.slipbox.settings.showTitleInDeck).onChange((value) => void this.save({
        ...this.slipbox.settings,
        showTitleInDeck: value
      }));
    });
    new import_obsidian5.Setting(containerEl).setName("Show Deck toolbar").setDesc("Show the navigation, bookmark, and spread controls above the Deck.").addToggle((toggle) => {
      toggle.setValue(this.slipbox.settings.showDeckToolbar).onChange((value) => void this.save({
        ...this.slipbox.settings,
        showDeckToolbar: value
      }));
    });
    new import_obsidian5.Setting(containerEl).setName("Show Deck map").setDesc("Show a clickable overview of every filed card and bookmark.").addToggle((toggle) => {
      toggle.setValue(this.slipbox.settings.showDeckMap).onChange((value) => void this.save({
        ...this.slipbox.settings,
        showDeckMap: value
      }));
    });
    new import_obsidian5.Setting(containerEl).setName("Card sizes").setHeading();
    this.renderCardSizeSettings(containerEl);
    new import_obsidian5.Setting(containerEl).setName("New cards").setHeading();
    this.renderNewCardSettings(containerEl);
    new import_obsidian5.Setting(containerEl).setName("Card-header buttons").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Hidden buttons remain available through commands, Slipbox shortcuts, and card context menus."
    });
    this.renderDeckHeaderButtons(containerEl);
    new import_obsidian5.Setting(containerEl).setName("Keyboard shortcuts").setHeading();
    const shortcutIntro = containerEl.createDiv({ cls: "slipbox-shortcut-intro" });
    shortcutIntro.createEl("p", {
      cls: "setting-item-description",
      text: "These shortcuts work only while Slipbox is active and never fire in text or form controls."
    });
    const resetAll = shortcutIntro.createEl("button", {
      text: "Reset all shortcuts",
      attr: { type: "button" }
    });
    resetAll.addEventListener("click", () => {
      void this.save({
        ...this.slipbox.settings,
        deckKeybindings: DEFAULT_DECK_KEYBINDINGS
      }).then(() => this.redisplayPreservingScroll());
    });
    for (const definition of DECK_ACTION_DEFINITIONS) {
      this.renderShortcutSetting(containerEl, definition);
    }
  }
  renderCardSizeSettings(container) {
    new import_obsidian5.Setting(container).setName("Main card size").setDesc("Maximum Deck-card width: small 720 px, medium 840 px, or large 960 px.").addDropdown((dropdown) => {
      dropdown.addOption("small", "Small").addOption("medium", "Medium").addOption("large", "Large").setValue(this.slipbox.settings.mainCardSize).onChange((value) => void this.save({
        ...this.slipbox.settings,
        mainCardSize: normalizeCardSize(value)
      }));
    });
    new import_obsidian5.Setting(container).setName("Tray card size").setDesc("Maximum working-pile card width: small 280 px, medium 360 px, or large 440 px. Tray cards remain smaller than main cards.").addDropdown((dropdown) => {
      dropdown.addOption("small", "Small").addOption("medium", "Medium").addOption("large", "Large").setValue(this.slipbox.settings.trayCardSize).onChange((value) => void this.save({
        ...this.slipbox.settings,
        trayCardSize: normalizeCardSize(value)
      }));
    });
  }
  renderNewCardSettings(container) {
    const folderSetting = new import_obsidian5.Setting(container).setName("New card folder").setDesc("Optional vault-folder override for notes created through Slipbox. Leave empty to inherit the source note\u2019s folder, or the vault root when no source note is active.");
    folderSetting.addDropdown((dropdown) => {
      dropdown.addOption("", "Source note\u2019s folder");
      const folders = this.app.vault.getAllLoadedFiles().filter(
        (file) => file instanceof import_obsidian5.TFolder && !file.isRoot()
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
    const timestamp = new import_obsidian5.Setting(container).setName("Timestamp filename format").setDesc("Moment format used when the title is blank, or whenever titles come from frontmatter. Filename-unsafe characters become hyphens. Example: ");
    const sample = timestamp.descEl.createEl("code");
    timestamp.addMomentFormat((component) => {
      let format = this.slipbox.settings.newNoteTimestampFormat;
      const queueCommit = this.debounceTextCommit(component.inputEl, () => {
        if (format !== "" && format !== this.slipbox.settings.newNoteTimestampFormat) {
          void this.save({
            ...this.slipbox.settings,
            newNoteTimestampFormat: format
          });
        }
      });
      component.setSampleEl(sample).setDefaultFormat(DEFAULT_SETTINGS.newNoteTimestampFormat).setValue(this.slipbox.settings.newNoteTimestampFormat).onChange((value) => {
        format = value.trim();
        this.setTextValidity(
          timestamp,
          format !== "",
          "A non-empty timestamp format is required."
        );
        queueCommit();
      });
    });
    const info = this.slipbox.templatesInfo();
    let templateSetting = null;
    new import_obsidian5.Setting(container).setName("Apply a template to new cards").setDesc("Use Obsidian\u2019s templates core plugin after Slipbox creates and opens the note.").addToggle((toggle) => {
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
    const template = new import_obsidian5.Setting(container).setName("New card template").setDesc(description).setDisabled(templateDisabled);
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
    const setting = new import_obsidian5.Setting(container).setName("Address property").setDesc(
      "Exact top-level YAML key used to identify and order cards. Changing it re-indexes immediately but does not rewrite existing notes."
    );
    setting.addText((text) => {
      let property = this.slipbox.settings.addressProperty;
      const queueCommit = this.debounceTextCommit(text.inputEl, () => {
        if (property !== "" && property !== this.slipbox.settings.addressProperty) {
          void this.save({
            ...this.slipbox.settings,
            addressProperty: property
          });
        }
      });
      text.setPlaceholder(DEFAULT_SETTINGS.addressProperty).setValue(this.slipbox.settings.addressProperty).onChange((value) => {
        property = value.trim();
        this.setPropertyValidity(setting, property !== "");
        queueCommit();
      });
    });
  }
  renderDeckOrdering(container) {
    new import_obsidian5.Setting(container).setName("Deck ordering").setDesc("Controls how manually assigned addresses are arranged in the Deck. Changing this setting reorders cards but does not edit Markdown files.").addDropdown((dropdown) => {
      dropdown.addOption("natural", "Natural").addOption("lexicographic", "Lexicographic").setValue(this.slipbox.settings.deckOrdering).onChange((value) => void this.save({
        ...this.slipbox.settings,
        deckOrdering: value === "lexicographic" ? "lexicographic" : "natural"
      }));
    });
  }
  renderDeckHeaderButtons(container) {
    const labels = {
      "open-note": "Open Markdown note",
      "copy-link": "Copy card link",
      tray: "Pull out or return card",
      bookmark: "Toggle bookmark"
    };
    for (const [id, label] of Object.entries(labels)) {
      new import_obsidian5.Setting(container).setName(`Slipbox: ${label}`).addToggle((toggle) => {
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
  renderShortcutSetting(container, definition) {
    const { id: action, label } = definition;
    const setting = new import_obsidian5.Setting(container).setName(label);
    if (definition.description !== void 0) {
      setting.setDesc(definition.description);
    }
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
        }).then(() => this.redisplayPreservingScroll());
      });
    }
    const add = bindings.createEl("button", {
      text: "+ add shortcut",
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
            (candidate2) => candidate2.id === conflict
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
        }).then(() => this.redisplayPreservingScroll());
      };
      const finish = () => {
        add.removeEventListener("keydown", capture);
        add.removeEventListener("blur", finish);
        add.removeClass("is-capturing");
        add.setText("+ add shortcut");
      };
      add.addEventListener("keydown", capture);
      add.addEventListener("blur", finish);
    });
    const reset = bindings.createEl("button", {
      text: "Reset",
      attr: { type: "button", "aria-label": `Reset ${label} shortcuts` }
    });
    reset.addEventListener("click", () => {
      const defaults = definition.defaultBindings;
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
      }).then(() => this.redisplayPreservingScroll());
    });
  }
  bindingFromEvent(event) {
    return keyBindingFromKeyboardEvent(event, import_obsidian5.Platform.isMacOS);
  }
  redisplayPreservingScroll() {
    const positions = [];
    let element = this.containerEl;
    while (element !== null) {
      if (element.scrollTop !== 0 || element.scrollLeft !== 0 || element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
        positions.push({
          element,
          top: element.scrollTop,
          left: element.scrollLeft
        });
      }
      element = element.parentElement;
    }
    const restore = () => {
      for (const position of positions) {
        position.element.scrollTop = position.top;
        position.element.scrollLeft = position.left;
      }
    };
    this.display();
    restore();
    window.requestAnimationFrame(restore);
  }
  debounceTextCommit(input, commit) {
    let timer = null;
    const flush = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      commit();
    };
    input.addEventListener("blur", flush);
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(flush, 300);
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
      new import_obsidian5.Notice(`Could not save Slipbox settings: ${errorMessage2(error)}`);
    }
  }
};
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/card-index.ts
var import_obsidian6 = require("obsidian");

// src/card-metadata.ts
function cardMetadataRecord(path, frontmatter, addressProperty) {
  const hasAddress = frontmatter !== void 0 && Object.prototype.hasOwnProperty.call(frontmatter, addressProperty);
  return {
    path,
    hasAddress,
    address: hasAddress ? frontmatter[addressProperty] : void 0
  };
}
function displayValue(value) {
  const serialized = JSON.stringify(value);
  return serialized === void 0 ? String(value) : serialized;
}
function buildFiledCardLookups(filed) {
  const byPath = /* @__PURE__ */ new Map();
  const indexByPath = /* @__PURE__ */ new Map();
  const byAddress = /* @__PURE__ */ new Map();
  filed.forEach((card, index) => {
    byPath.set(card.path, card);
    indexByPath.set(card.path, index);
    const matches = byAddress.get(card.address) ?? [];
    matches.push(card);
    byAddress.set(card.address, matches);
  });
  return { byPath, indexByPath, byAddress };
}
function indexCardMetadata(records, addressProperty = "zettel-id", ordering = "natural") {
  const unfiledPaths = [];
  const issues = [];
  const filed = [];
  for (const record of records) {
    if (!record.hasAddress) {
      continue;
    }
    if (record.address === "" || record.address === null || record.address === void 0) {
      unfiledPaths.push(record.path);
      continue;
    }
    if (typeof record.address !== "string") {
      issues.push({
        kind: "invalid",
        severity: "error",
        paths: [record.path],
        message: `Unsupported ${addressProperty} ${displayValue(record.address)}: address must be text`
      });
      continue;
    }
    const validation = validateAddress(record.address);
    if (!validation.valid) {
      issues.push({
        kind: "invalid",
        severity: "error",
        paths: [record.path],
        message: `Unsupported ${addressProperty} ${displayValue(record.address)}: ${validation.message}`
      });
      continue;
    }
    filed.push({ path: record.path, address: validation.address });
  }
  filed.sort(cardComparatorFor(ordering));
  unfiledPaths.sort(compareVaultPaths);
  const pathsByAddress = /* @__PURE__ */ new Map();
  for (const card of filed) {
    const paths = pathsByAddress.get(card.address) ?? [];
    paths.push(card.path);
    pathsByAddress.set(card.address, paths);
  }
  for (const [address, paths] of pathsByAddress) {
    const first = paths[0];
    const second = paths[1];
    if (first !== void 0 && second !== void 0) {
      issues.push({
        kind: "duplicate",
        severity: "warning",
        address,
        paths: [first, second, ...paths.slice(2)],
        message: `Duplicate ${addressProperty} ${address}`
      });
    }
  }
  issues.sort((left, right) => {
    const pathComparison = compareVaultPaths(left.paths[0], right.paths[0]);
    return pathComparison !== 0 ? pathComparison : compareVaultPaths(left.kind, right.kind);
  });
  return { filed, unfiledPaths, issues };
}

// src/card-index.ts
var EMPTY_INDEX = {
  filed: [],
  unfiled: [],
  unfiledPaths: [],
  issues: [],
  backlinksByTargetPath: /* @__PURE__ */ new Map()
};
var NO_BACKLINKS = [];
var NO_FILED_CARDS = [];
var CardIndex = class {
  constructor(app, addressProperty = "zettel-id", ordering = "natural") {
    this.app = app;
    this.addressProperty = addressProperty;
    this.ordering = ordering;
  }
  current = EMPTY_INDEX;
  filedByPathMap = /* @__PURE__ */ new Map();
  filedIndexByPathMap = /* @__PURE__ */ new Map();
  filedByAddressMap = /* @__PURE__ */ new Map();
  get snapshot() {
    return this.current;
  }
  get deckOrdering() {
    return this.ordering;
  }
  setAddressProperty(addressProperty) {
    this.addressProperty = addressProperty;
  }
  setDeckOrdering(ordering) {
    this.ordering = ordering;
  }
  refresh() {
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const records = markdownFiles.map((file) => cardMetadataRecord(
      file.path,
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      this.addressProperty
    ));
    const indexed = indexCardMetadata(
      records,
      this.addressProperty,
      this.ordering
    );
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
    const lookups = buildFiledCardLookups(filed);
    this.filedByPathMap = new Map(lookups.byPath);
    this.filedIndexByPathMap = new Map(lookups.indexByPath);
    this.filedByAddressMap = new Map(lookups.byAddress);
    this.current = { ...indexed, filed, unfiled, backlinksByTargetPath };
    return this.current;
  }
  filedByPath(path) {
    return this.filedByPathMap.get(path);
  }
  filedByFile(file) {
    return this.filedByPath(file.path);
  }
  filedAtAddress(address) {
    return this.filedByAddressMap.get(address) ?? NO_FILED_CARDS;
  }
  firstFiledAtAddress(address) {
    return this.filedAtAddress(address)[0];
  }
  filedIndexForPath(path) {
    return path === null ? -1 : this.filedIndexByPathMap.get(path) ?? -1;
  }
  fileAtPath(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian6.TFile ? file : void 0;
  }
  backlinksForPath(path) {
    return this.current.backlinksByTargetPath.get(path) ?? NO_BACKLINKS;
  }
  /** Read only the note body, excluding the YAML frontmatter block. */
  async readBody(file) {
    const source = await this.app.vault.cachedRead(file);
    return source.slice((0, import_obsidian6.getFrontMatterInfo)(source).contentStart);
  }
};

// src/canvas-bridge.ts
var import_obsidian7 = require("obsidian");

// src/canvas-layout.ts
var DEFAULT_NODE_WIDTH = 400;
var DEFAULT_NODE_HEIGHT = 280;
var DEFAULT_HORIZONTAL_GAP = 80;
var DEFAULT_VERTICAL_GAP = 80;
var DEFAULT_COLUMNS = 4;
function parseCanvasDocument(source) {
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("The Canvas file does not contain valid JSON");
  }
  if (!isRecord5(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error("The Canvas file is missing its nodes or edges array");
  }
  return value;
}
function serializeCanvasDocument(data) {
  return `${JSON.stringify(data, null, 2)}
`;
}
function normalizeCanvasPath(value) {
  const segments = value.trim().replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter((segment) => segment !== "");
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  const joined = segments.join("/");
  const path = joined.toLowerCase().endsWith(".canvas") ? joined : `${joined}.canvas`;
  return path === ".canvas" ? null : path;
}
function layoutFilesOnCanvas(data, filePaths, options = {}) {
  const existingPaths = new Set(
    data.nodes.flatMap((node) => isFileNode(node) ? [node.file] : [])
  );
  const requested = uniqueNonempty(filePaths);
  const skippedPaths = requested.filter((path) => existingPaths.has(path));
  const addedPaths = requested.filter((path) => !existingPaths.has(path));
  if (addedPaths.length === 0) {
    return { data, addedPaths, skippedPaths };
  }
  const width = positive(options.nodeWidth, DEFAULT_NODE_WIDTH);
  const height = positive(options.nodeHeight, DEFAULT_NODE_HEIGHT);
  const horizontalGap = nonnegative(options.horizontalGap, DEFAULT_HORIZONTAL_GAP);
  const verticalGap = nonnegative(options.verticalGap, DEFAULT_VERTICAL_GAP);
  const columns = Math.max(1, Math.trunc(positive(options.columns, DEFAULT_COLUMNS)));
  const originX = finite(options.originX, 0);
  const originY = finite(options.originY, 0);
  const usedIds = new Set(data.nodes.map((node) => node.id));
  const nodes = addedPaths.map((file, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: uniqueCanvasNodeId(file, usedIds),
      type: "file",
      file,
      x: originX + column * (width + horizontalGap),
      y: originY + row * (height + verticalGap),
      width,
      height
    };
  });
  return {
    data: { ...data, nodes: [...data.nodes, ...nodes] },
    addedPaths,
    skippedPaths
  };
}
function layoutLegacyDeskOnCanvas(data, cards, options = {}) {
  const existingPaths = new Set(
    data.nodes.flatMap((node) => isFileNode(node) ? [node.file] : [])
  );
  const ordered = [...cards].filter((card) => card.cardRef !== "").sort((left, right) => left.z - right.z || left.cardRef.localeCompare(right.cardRef));
  const seen = /* @__PURE__ */ new Set();
  const unique = ordered.filter((card) => {
    if (seen.has(card.cardRef)) {
      return false;
    }
    seen.add(card.cardRef);
    return true;
  });
  const skippedPaths = unique.filter((card) => existingPaths.has(card.cardRef)).map((card) => card.cardRef);
  const additions = unique.filter((card) => !existingPaths.has(card.cardRef));
  const width = positive(options.nodeWidth, DEFAULT_NODE_WIDTH);
  const height = positive(options.nodeHeight, DEFAULT_NODE_HEIGHT);
  const originX = finite(options.originX, 0);
  const originY = finite(options.originY, 0);
  const usedIds = new Set(data.nodes.map((node) => node.id));
  const nodes = additions.map((card) => ({
    id: uniqueCanvasNodeId(card.cardRef, usedIds),
    type: "file",
    file: card.cardRef,
    x: originX + card.x,
    y: originY + card.y,
    width,
    height
  }));
  return {
    data: { ...data, nodes: [...data.nodes, ...nodes] },
    addedPaths: additions.map((card) => card.cardRef),
    skippedPaths
  };
}
function isFileNode(node) {
  return node.type === "file" && typeof node.file === "string";
}
function uniqueCanvasNodeId(file, used) {
  const base = `slipbox-${fnv1a(file).toString(16).padStart(8, "0")}`;
  let id = base;
  let sequence = 2;
  while (used.has(id)) {
    id = `${base}-${sequence}`;
    sequence += 1;
  }
  used.add(id);
  return id;
}
function uniqueNonempty(values) {
  const seen = /* @__PURE__ */ new Set();
  return values.filter((value) => {
    if (value === "" || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}
function isRecord5(value) {
  return typeof value === "object" && value !== null;
}
function finite(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function positive(value, fallback) {
  const result = finite(value, fallback);
  return result > 0 ? result : fallback;
}
function nonnegative(value, fallback) {
  const result = finite(value, fallback);
  return result >= 0 ? result : fallback;
}

// src/canvas-bridge.ts
var CanvasBridge = class {
  constructor(app) {
    this.app = app;
  }
  hasActiveCanvas() {
    return this.activeCanvasView() !== null;
  }
  canvasFiles() {
    return this.app.vault.getFiles().filter((file) => file.extension === "canvas").sort((left, right) => left.path.localeCompare(right.path));
  }
  async layoutFilesOnActiveCanvas(filePaths) {
    const view = this.activeCanvasView();
    if (view === null) {
      throw new Error("Open and focus a Canvas first");
    }
    const file = view.file;
    if (file === null || file.extension !== "canvas") {
      throw new Error("The active Canvas does not expose a Canvas file");
    }
    return this.updateOpenCanvas(view, file, (data) => layoutFilesOnCanvas(data, filePaths));
  }
  async layoutFilesOnCanvas(file, filePaths) {
    return this.updateCanvas(file, (data) => layoutFilesOnCanvas(data, filePaths));
  }
  async layoutLegacyDeskOnCanvas(file, cards) {
    return this.updateCanvas(file, (data) => layoutLegacyDeskOnCanvas(data, cards));
  }
  async createCanvas(path, filePaths) {
    return this.createCanvasWithLayout(path, (data) => layoutFilesOnCanvas(data, filePaths));
  }
  async createLegacyDeskCanvas(path, cards) {
    return this.createCanvasWithLayout(path, (data) => layoutLegacyDeskOnCanvas(data, cards));
  }
  async createCanvasWithLayout(path, transform) {
    const normalized = (0, import_obsidian7.normalizePath)(path);
    if (this.app.vault.getAbstractFileByPath(normalized) !== null) {
      throw new Error(`A file already exists at ${normalized}`);
    }
    await this.ensureParentFolder(normalized);
    const result = transform({ nodes: [], edges: [] });
    const file = await this.app.vault.create(
      normalized,
      serializeCanvasDocument(result.data)
    );
    try {
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      if (leaf.getViewState().type !== "canvas") {
        throw new Error("Enable Obsidian\u2019s Canvas core plugin to open the new Canvas");
      }
    } catch (error) {
      throw new Error(
        `Created ${normalized}, but could not open it: ${errorMessage3(error)}`
      );
    }
    return { ...result, file };
  }
  async updateCanvas(file, transform) {
    if (file.extension !== "canvas") {
      throw new Error(`${file.path} is not a Canvas file`);
    }
    const openView = await this.publicOpenCanvasView(file);
    if (openView !== null) {
      return this.updateOpenCanvas(openView, file, transform);
    }
    let result = null;
    await this.app.vault.process(file, (source) => {
      result = transform(parseCanvasDocument(source));
      return serializeCanvasDocument(result.data);
    });
    if (result === null) {
      throw new Error(`Could not update ${file.path}`);
    }
    return { ...result, file };
  }
  async updateOpenCanvas(view, file, transform) {
    const original = view.getViewData();
    const result = transform(parseCanvasDocument(original));
    if (result.addedPaths.length === 0) {
      return { ...result, file };
    }
    view.setViewData(serializeCanvasDocument(result.data), false);
    try {
      await view.save();
    } catch (error) {
      view.setViewData(original, false);
      throw error;
    }
    return { ...result, file };
  }
  async publicOpenCanvasView(file) {
    for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
      await leaf.loadIfDeferred();
      if (leaf.view instanceof import_obsidian7.TextFileView && leaf.view.file?.path === file.path) {
        return leaf.view;
      }
    }
    return null;
  }
  activeCanvasView() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian7.TextFileView);
    return view?.getViewType() === "canvas" ? view : null;
  }
  async ensureParentFolder(path) {
    const segments = path.split("/").slice(0, -1);
    let current = "";
    for (const segment of segments) {
      current = current === "" ? segment : `${current}/${segment}`;
      if (this.app.vault.getAbstractFileByPath(current) === null) {
        await this.app.vault.createFolder(current);
      }
    }
  }
};
function errorMessage3(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/note-body.ts
var NoteBodyConflictError = class extends Error {
  constructor() {
    super("The note body changed outside the inline editor");
    this.name = "NoteBodyConflictError";
  }
};
function splitNoteBody(source, contentStart) {
  if (!Number.isSafeInteger(contentStart) || contentStart < 0 || contentStart > source.length) {
    throw new RangeError("The note body offset is outside the source text");
  }
  return {
    prefix: source.slice(0, contentStart),
    body: source.slice(contentStart)
  };
}
function replaceNoteBodyIfUnchanged(source, contentStart, expectedBody, body) {
  const latest = splitNoteBody(source, contentStart);
  if (latest.body !== expectedBody) {
    throw new NoteBodyConflictError();
  }
  return latest.prefix + body;
}

// src/main.ts
var SlipboxPlugin = class extends import_obsidian8.Plugin {
  state = DEFAULT_STATE;
  settings = DEFAULT_SETTINGS;
  tray = EMPTY_TRAY;
  index;
  canvas;
  indexRefreshTimer = null;
  spreadSaveTimer = null;
  filingWriteInProgress = false;
  persistQueue = Promise.resolve();
  trayPileSequence = 0;
  rawSettings = {};
  inlineEditOwners = new InlineEditPathLock();
  detachedInlineEditDrafts = /* @__PURE__ */ new Map();
  async onload() {
    const loadedData = await this.loadData();
    const purgeRemovedEntryPoints = hasRemovedEntryPointData(loadedData);
    const data = normalizePluginData(loadedData);
    this.rawSettings = rawSettingsFromPluginData(loadedData);
    this.settings = data.settings;
    this.state = data.state;
    this.index = new CardIndex(
      this.app,
      this.settings.addressProperty,
      this.settings.deckOrdering
    );
    this.canvas = new CanvasBridge(this.app);
    this.addSettingTab(new SlipboxSettingTab(this.app, this));
    this.registerView(
      DECK_VIEW_TYPE,
      (leaf) => new DeckView(leaf, this)
    );
    this.registerHoverLinkSource(DECK_VIEW_TYPE, {
      display: "Slipbox",
      defaultMod: false
    });
    this.registerEvent(
      this.app.workspace.on("quit", (tasks) => {
        tasks.addPromise(this.finishInlineEdits("quit"));
      })
    );
    this.addRibbonIcon("archive", "Open Slipbox", () => {
      void this.openDeck();
    });
    this.registerCommands();
    if (purgeRemovedEntryPoints) {
      void this.persistState();
    }
    this.app.workspace.onLayoutReady(() => {
      this.registerIndexEvents();
      void this.initializeAfterLayoutReady();
    });
  }
  onunload() {
    void this.finishInlineEdits("plugin-unload");
    if (this.indexRefreshTimer !== null) {
      window.clearTimeout(this.indexRefreshTimer);
    }
    if (this.spreadSaveTimer !== null) {
      window.clearTimeout(this.spreadSaveTimer);
    }
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
      throw new Error("Obsidian did not create the Slipbox view");
    }
    if (filingFile !== void 0) {
      await leaf.view.startFiling(filingFile);
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
  acquireInlineEdit(path, owner) {
    const existing = this.inlineEditOwners.ownerAt(path);
    if (existing === owner) {
      return true;
    }
    if (existing !== void 0) {
      new import_obsidian8.Notice("This card is already being edited in another Slipbox view.");
      void this.app.workspace.revealLeaf(existing.leaf);
      return false;
    }
    if (this.detachedInlineEditDrafts.has(path)) {
      new import_obsidian8.Notice(
        "This card has an inline draft waiting to be restored in Slipbox."
      );
      return false;
    }
    return this.inlineEditOwners.acquire(path, owner);
  }
  releaseInlineEdit(path, owner) {
    this.inlineEditOwners.release(path, owner);
  }
  renameInlineEdit(oldPath, newPath, owner) {
    return this.inlineEditOwners.rename(oldPath, newPath, owner);
  }
  async prepareInlineEdit(file) {
    await this.flushOpenTextViews(file.path);
    const latest = this.app.vault.getAbstractFileByPath(file.path);
    if (!(latest instanceof import_obsidian8.TFile)) {
      throw new Error("The card no longer exists.");
    }
    const source = await this.app.vault.read(latest);
    const body = splitNoteBody(
      source,
      (0, import_obsidian8.getFrontMatterInfo)(source).contentStart
    ).body;
    return { file: latest, body };
  }
  async commitInlineEdit(request) {
    const file = this.app.vault.getAbstractFileByPath(request.path);
    if (!(file instanceof import_obsidian8.TFile)) {
      return {
        status: "conflict",
        message: "The card was deleted while it was being edited."
      };
    }
    try {
      await this.app.vault.process(file, (latest) => {
        const contentStart = (0, import_obsidian8.getFrontMatterInfo)(latest).contentStart;
        return replaceNoteBodyIfUnchanged(
          latest,
          contentStart,
          request.baseBody,
          request.draft
        );
      });
    } catch (error) {
      if (error instanceof NoteBodyConflictError) {
        return {
          status: "conflict",
          message: "The note body changed elsewhere. Your inline draft was kept."
        };
      }
      throw error;
    }
    return { status: "saved" };
  }
  async flushOpenTextViews(path) {
    const saves = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof import_obsidian8.TextFileView && view.file?.path === path) {
        saves.push(view.save());
      }
    });
    await Promise.all(saves);
  }
  retainDetachedInlineEdit(snapshot, file, presentation) {
    this.detachedInlineEditDrafts.set(snapshot.path, {
      path: snapshot.path,
      file,
      origin: snapshot.origin,
      baseBody: snapshot.baseBody,
      draft: snapshot.draft,
      conflictMessage: snapshot.failure?.kind === "conflict" ? snapshot.failure.message : null,
      conflictRetryable: snapshot.conflictRetryable,
      ...presentation
    });
  }
  takeDetachedInlineEdit() {
    for (const [path, draft] of this.detachedInlineEditDrafts) {
      if (this.inlineEditOwners.ownerAt(path) !== void 0) {
        continue;
      }
      this.detachedInlineEditDrafts.delete(path);
      return draft;
    }
    return null;
  }
  returnDetachedInlineEdit(draft) {
    this.detachedInlineEditDrafts.set(draft.path, draft);
  }
  async finishInlineEdits(reason) {
    const owners = this.inlineEditOwners.ownerSet();
    await Promise.all(
      [...owners].map(async (owner) => {
        await owner.finishInlineEditing(reason);
      })
    );
  }
  cardTitle(file) {
    return resolveCardTitle(
      file.basename,
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      this.settings
    );
  }
  filedCardLabel(path) {
    const card = this.index.filedByPath(path);
    return card === void 0 ? path : `${card.address} \xB7 ${this.cardTitle(card.file)}`;
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
    const previousOrdering = this.settings.deckOrdering;
    this.settings = normalizeSettings(value);
    this.index.setAddressProperty(this.settings.addressProperty);
    this.index.setDeckOrdering(this.settings.deckOrdering);
    await this.persistState();
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.updateKeybindings();
      }
    }
    if (this.settings.addressProperty !== previousAddressProperty || this.settings.deckOrdering !== previousOrdering) {
      await this.refreshIndex();
      if (this.settings.deckOrdering !== previousOrdering) {
        for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
          if (leaf.view instanceof DeckView) {
            await leaf.view.handleDeckOrderingChanged();
          }
        }
      }
    } else {
      await this.refreshDeckViews();
    }
  }
  showCardContextMenu(event, file, address, source, leaf) {
    event.preventDefault();
    event.stopPropagation();
    const isBookmarked = address !== null && this.bookmarkAtPath(file.path) !== void 0;
    const isInTray = trayContains(this.tray, file.path);
    const title = this.cardTitle(file);
    const menu = import_obsidian8.Menu.forEvent(event);
    const run = (reason, action) => {
      if (leaf.view instanceof DeckView) {
        void leaf.view.runAfterInlineEditing(reason, action);
      } else {
        void action();
      }
    };
    menu.addItem((item) => {
      item.setTitle(`Open ${title}`).setIcon("file-pen-line").setSection("slipbox-card").onClick(() => run(
        "card-menu-open-note",
        () => this.openMarkdownFile(file)
      ));
    });
    menu.addItem((item) => {
      item.setTitle(isBookmarked ? "Remove bookmark" : "Add bookmark").setIcon(isBookmarked ? "bookmark-minus" : "bookmark-plus").setSection("slipbox-card").setDisabled(address === null).onClick(() => {
        if (address !== null) {
          run(
            "card-menu-toggle-bookmark",
            () => this.toggleBookmark(file.path)
          );
        }
      });
    });
    menu.addItem((item) => {
      item.setTitle(trayToggleLabel(isInTray)).setIcon(isInTray ? "undo-2" : "inbox").setSection("slipbox-card").setDisabled(address === null).onClick(() => {
        if (address !== null) {
          run(
            "card-menu-toggle-tray",
            () => this.toggleFileInTray(file)
          );
        }
      });
    });
    menu.addItem((item) => {
      item.setTitle(`Delete ${title}`).setIcon("trash-2").setWarning(true).setSection("slipbox-card-danger").onClick(() => run(
        "card-menu-delete",
        () => this.deleteCard(file)
      ));
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
  showIssues() {
    this.index.refresh();
    new IssuesModal(this.app, this.index.snapshot, {
      open: (path) => {
        const file = this.index.fileAtPath(path);
        if (file === void 0) {
          new import_obsidian8.Notice(`Could not find ${path}.`);
        } else {
          void this.openMarkdownFile(file);
        }
      }
    }).open();
  }
  showBookmarks(view) {
    const bookmarks = this.state.bookmarks.filter(isPathBookmark);
    new BookmarksModal(this.app, bookmarks, {
      currentPath: view.activeCard?.path ?? null,
      isAvailable: (path) => this.index.filedByPath(path) !== void 0,
      label: (path) => this.filedCardLabel(path),
      visit: (path) => void view.jumpToPath(path),
      addCurrent: () => view.addBookmarkToCurrent(),
      remove: (path) => view.removeBookmark(path)
    }).open();
  }
  bookmarkAtPath(path) {
    return this.state.bookmarks.find(
      (bookmark) => isPathBookmark(bookmark) && bookmark.path === path
    );
  }
  async addBookmark(path) {
    if (this.index.filedByPath(path) === void 0) {
      new import_obsidian8.Notice("Only an available filed card can be bookmarked.");
      return;
    }
    const label = this.filedCardLabel(path);
    if (this.bookmarkAtPath(path) !== void 0) {
      new import_obsidian8.Notice(`${label} already has a bookmark.`);
      return;
    }
    try {
      this.state = {
        ...this.state,
        bookmarks: createBookmark(this.state.bookmarks, path)
      };
      this.refreshBookmarkUi();
      await this.persistState();
      new import_obsidian8.Notice(`Bookmarked ${label}.`);
    } catch (error) {
      new import_obsidian8.Notice(`Could not add bookmark: ${errorMessage4(error)}`);
    }
  }
  async toggleBookmark(path) {
    if (this.bookmarkAtPath(path) === void 0) {
      await this.addBookmark(path);
    } else {
      await this.removeBookmark(path);
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
      new import_obsidian8.Notice("Only an available filed card can be pulled out.");
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
  async setTrayPileExpanded(pileId, expanded) {
    this.tray = setPileExpanded(this.tray, pileId, expanded);
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
  hasActiveCanvas() {
    return this.canvas.hasActiveCanvas();
  }
  async layOutTrayPileOnActiveCanvas(pileId) {
    const paths = this.trayPilePaths(pileId);
    if (paths.length === 0) {
      return;
    }
    try {
      this.reportCanvasWrite(await this.canvas.layoutFilesOnActiveCanvas(paths));
    } catch (error) {
      new import_obsidian8.Notice(`Could not lay out the pile: ${errorMessage4(error)}`);
    }
  }
  async layOutTrayPileOnCanvas(pileId) {
    const paths = this.trayPilePaths(pileId);
    if (paths.length === 0) {
      return;
    }
    const canvases = this.canvas.canvasFiles();
    if (canvases.length === 0) {
      new import_obsidian8.Notice("There are no Canvas files in this vault. Create one from the pile instead.");
      return;
    }
    const file = await promptForCanvas(this.app, canvases);
    if (file === null) {
      return;
    }
    try {
      this.reportCanvasWrite(await this.canvas.layoutFilesOnCanvas(file, paths));
    } catch (error) {
      new import_obsidian8.Notice(`Could not lay out the pile: ${errorMessage4(error)}`);
    }
  }
  async createCanvasFromTrayPile(pileId) {
    const paths = this.trayPilePaths(pileId);
    if (paths.length === 0) {
      return;
    }
    const entered = await promptForText(
      this.app,
      "Create Canvas from pile",
      "Canvas filename or vault path"
    );
    if (entered === null) {
      return;
    }
    const path = normalizeCanvasPath(entered);
    if (path === null) {
      new import_obsidian8.Notice("Enter a valid Canvas filename or vault-relative path.");
      return;
    }
    try {
      this.reportCanvasWrite(await this.canvas.createCanvas(path, paths));
    } catch (error) {
      new import_obsidian8.Notice(`Could not create the Canvas: ${errorMessage4(error)}`);
    }
  }
  async exportLegacyDeskToCanvas() {
    const legacy = this.state.legacyDeskCards ?? [];
    if (legacy.length === 0) {
      new import_obsidian8.Notice("There is no legacy Desk layout to export.");
      return;
    }
    const entered = await promptForText(
      this.app,
      "Export legacy Desk to Canvas",
      "Canvas filename or vault path",
      "Legacy Slipbox Desk"
    );
    if (entered === null) {
      return;
    }
    const path = normalizeCanvasPath(entered);
    if (path === null) {
      new import_obsidian8.Notice("Enter a valid Canvas filename or vault-relative path.");
      return;
    }
    const available = legacy.filter((card) => {
      const file = this.app.vault.getAbstractFileByPath(card.cardRef);
      return file instanceof import_obsidian8.TFile && file.extension === "md";
    });
    const missingCount = legacy.length - available.length;
    if (available.length === 0) {
      new import_obsidian8.Notice("None of the cards in the legacy Desk layout still exist. The layout was kept.");
      return;
    }
    let result;
    try {
      result = await this.canvas.createLegacyDeskCanvas(path, available);
    } catch (error) {
      new import_obsidian8.Notice(`Could not export the legacy Desk: ${errorMessage4(error)}`);
      return;
    }
    const missing = missingCount === 0 ? "" : ` Omitted ${missingCount} missing card${missingCount === 1 ? "" : "s"}.`;
    new import_obsidian8.Notice(
      `Exported ${result.addedPaths.length} legacy Desk card${result.addedPaths.length === 1 ? "" : "s"} to ${result.file.basename}.${missing}`
    );
    const clear = await confirmAction(
      this.app,
      "Clear legacy Desk state?",
      "The Canvas was created successfully. Clear the old Desk layout from Slipbox\u2019s saved state?",
      "Clear legacy state"
    );
    if (!clear) {
      return;
    }
    const { legacyDeskCards: _legacyDeskCards, ...state } = this.state;
    this.state = state;
    await this.persistState();
    new import_obsidian8.Notice("Legacy Desk state cleared. The Canvas was kept.");
  }
  async beginFiling(file) {
    this.index.refresh();
    if (this.cardMetadataState(file) !== "unfiled") {
      new import_obsidian8.Notice("Only an unfiled card can enter filing mode.");
      return;
    }
    await this.openDeck(file);
  }
  isUnfiledCard(file) {
    return this.cardMetadataState(file) === "unfiled";
  }
  filingPreviewFor(file, address) {
    return createFilingPreview(
      this.index.snapshot.filed,
      { path: file.path, address },
      this.cardTitle(file),
      this.settings.deckOrdering
    );
  }
  async fileCard(file, preview) {
    let refreshAfterFiling = false;
    let placementChanged = false;
    this.filingWriteInProgress = true;
    try {
      this.index.refresh();
      this.assertFilingSource(file, preview.sourcePath);
      if (this.cardMetadataState(file) !== "unfiled") {
        throw new Error("The source card is no longer unfiled");
      }
      if (!this.filingPreviewMatches(file, preview)) {
        return { status: "preview-changed" };
      }
      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter) => {
          const property = this.settings.addressProperty;
          const hasAddress = Object.prototype.hasOwnProperty.call(
            frontmatter,
            property
          );
          const current = frontmatter[property];
          if (!hasAddress || !(current === "" || current === null || current === void 0)) {
            throw new Error(
              `The card is no longer unfiled; its ${property} was not changed`
            );
          }
          this.index.refresh();
          this.assertFilingSource(file, preview.sourcePath);
          if (!this.filingPreviewMatches(file, preview)) {
            placementChanged = true;
            throw new Error("The previewed filing position changed");
          }
          frontmatter[property] = preview.address;
        }
      );
      const cacheReady = await this.waitForCachedAddress(file, preview.address);
      refreshAfterFiling = !cacheReady;
      this.index.refresh();
      this.tray = removeTrayPath(this.tray, file.path);
      const filedIndex = this.index.filedIndexForPath(file.path);
      new import_obsidian8.Notice(
        cacheReady ? `Filed ${this.cardTitle(file)} as ${preview.address}.` : `Filed ${this.cardTitle(file)} as ${preview.address}. Slipbox will refresh when Obsidian finishes indexing it.`
      );
      return {
        status: "filed",
        address: preview.address,
        index: filedIndex < 0 ? preview.insertionIndex : filedIndex
      };
    } catch (error) {
      if (placementChanged) {
        return { status: "preview-changed" };
      }
      new import_obsidian8.Notice(`Could not file the card: ${errorMessage4(error)}`);
      return { status: "failed" };
    } finally {
      this.filingWriteInProgress = false;
      if (refreshAfterFiling) {
        this.queueIndexRefresh();
      }
    }
  }
  assertFilingSource(file, expectedPath) {
    if (file.path !== expectedPath || this.app.vault.getAbstractFileByPath(expectedPath) !== file) {
      throw new Error("The source path no longer identifies the intended card");
    }
  }
  filingPreviewMatches(file, preview) {
    if (preview.ordering !== this.settings.deckOrdering || !validateAddress(preview.address).valid) {
      return false;
    }
    return filingPlacementMatches(
      this.index.snapshot.filed,
      { path: file.path, address: preview.address },
      this.settings.deckOrdering,
      preview
    );
  }
  registerCommands() {
    this.addCommand({
      id: "open-deck",
      name: "Open",
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
      id: "toggle-tray",
      name: "Pull out or return current card",
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
      id: "clear-tray",
      name: "Return all filed cards",
      checkCallback: (checking) => {
        const available = trayHasFiledCards(this.tray);
        if (checking) {
          return available;
        }
        if (available) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck === null) {
            void this.clearTray();
          } else {
            void deck.runAfterInlineEditing(
              "command-clear-tray",
              () => this.clearTray()
            );
          }
        }
        return available;
      }
    });
    this.addCommand({
      id: "export-legacy-desk-to-canvas",
      name: "Export legacy Desk to Canvas\u2026",
      checkCallback: (checking) => {
        const available = (this.state.legacyDeskCards?.length ?? 0) > 0;
        if (checking) {
          return available;
        }
        if (available) {
          void this.exportLegacyDeskToCanvas();
        }
        return available;
      }
    });
    this.addCommand({
      id: "add-bookmark-current-card",
      name: "Toggle bookmark on current card",
      checkCallback: (checking) => {
        const path = this.currentFiledPath();
        const available = path !== null;
        if (checking) {
          return available;
        }
        if (available && path !== null) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck !== null) {
            deck.runAction("toggle-bookmark");
          } else {
            void this.toggleBookmark(path);
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
      id: "copy-current-card-link",
      name: "Copy link to current card",
      checkCallback: (checking) => {
        const path = this.currentFiledPath();
        const card = path === null ? void 0 : this.index.filedByPath(path);
        const available = card !== void 0;
        if (checking) {
          return available;
        }
        if (card !== void 0) {
          const deck = this.app.workspace.getActiveViewOfType(DeckView);
          if (deck === null) {
            void this.copyCardLink(card);
          } else {
            deck.runAction("copy-link", card);
          }
        }
        return available;
      }
    });
    this.registerDeckCommand("previous-card", "Previous card", "previous-card");
    this.registerDeckCommand("next-card", "Next card", "next-card");
    this.registerDeckCommand(
      "forward-ten-cards",
      "Move forward ten cards",
      "forward-ten-cards"
    );
    this.registerDeckCommand(
      "backward-ten-cards",
      "Move backward ten cards",
      "backward-ten-cards"
    );
    this.registerDeckCommand("centre-active-card", "Centre active card", "centre-card");
    this.registerDeckCommand("first-card", "First card", "first-card");
    this.registerDeckCommand("last-card", "Last card", "last-card");
    this.registerDeckCommand(
      "find-next-address-initial",
      "Find next address initial",
      "find-address-forward"
    );
    this.registerDeckCommand(
      "find-previous-address-initial",
      "Find previous address initial",
      "find-address-backward"
    );
    this.registerDeckCommand(
      "find-first-address-initial",
      "Go to first address initial",
      "find-address-first"
    );
    this.registerDeckCommand(
      "pull-into-numbered-pile",
      "Pull current card into numbered pile",
      "pull-into-pile"
    );
    this.registerDeckCommand(
      "toggle-toolbar-visibility",
      "Toggle toolbar visibility",
      "toggle-toolbar"
    );
    this.registerDeckCommand(
      "toggle-deck-map-visibility",
      "Toggle Deck-map visibility",
      "toggle-deck-map"
    );
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
    this.registerDeckCommand("confirm-filing", "File card", "confirm-filing");
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
  async createNewCardAtTrayPosition(position) {
    await this.createNewCard(position);
  }
  async createNewCard(trayPosition) {
    try {
      const file = await this.createCardFile();
      if (file === null) {
        return;
      }
      if (trayPosition !== void 0) {
        await this.waitForCachedAddress(file, "");
        this.index.refresh();
        this.reconcileSessionTray();
        const pileId = this.createTrayPileId();
        this.tray = placeUnfiledCardAtPosition(
          this.tray,
          file.path,
          pileId,
          trayPosition
        );
        await this.refreshDeckViews();
      }
      this.queueIndexRefresh();
    } catch (error) {
      new import_obsidian8.Notice(`Could not create a card: ${errorMessage4(error)}`);
    }
  }
  async makeNoteCard(file) {
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter) => {
          const property = this.settings.addressProperty;
          if (Object.prototype.hasOwnProperty.call(frontmatter, property)) {
            throw new Error(`This note already has a ${property} property`);
          }
          frontmatter[property] = "";
        }
      );
      this.queueIndexRefresh();
      new import_obsidian8.Notice(`${this.cardTitle(file)} is now an unfiled card.`);
    } catch (error) {
      new import_obsidian8.Notice(`Could not make this note a card: ${errorMessage4(error)}`);
    }
  }
  async createCardFile(sourcePath) {
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
      [this.settings.addressProperty]: ""
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
      new import_obsidian8.Notice("Enable Obsidian\u2019s templates core plugin to apply templates to new cards.");
      return null;
    }
    if (info.folder === "" || info.files.length === 0) {
      new import_obsidian8.Notice("Configure a templates folder containing at least one template to use it for new cards.");
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
    const rawFrontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const frontmatter = isRecord6(rawFrontmatter) ? rawFrontmatter : void 0;
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
    return validateAddress(value).valid ? "filed" : "invalid";
  }
  currentDeckView() {
    const active = this.app.workspace.getActiveViewOfType(DeckView);
    if (active !== null) {
      return active;
    }
    const leaf = this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)[0];
    return leaf?.view instanceof DeckView ? leaf.view : null;
  }
  currentFiledPath() {
    const deck = this.app.workspace.getActiveViewOfType(DeckView);
    const deckPath = deck?.activeCard?.path;
    if (deckPath !== void 0) {
      return deckPath;
    }
    const activeFile = this.app.workspace.getActiveFile();
    return activeFile === null ? null : this.index.filedByFile(activeFile)?.path ?? null;
  }
  currentCardFile() {
    const deck = this.app.workspace.getActiveViewOfType(DeckView);
    const deckFile = deck?.activeCard?.file;
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
  async copyCardLink(card) {
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
    const link = generateFiledCardLink(
      this.app,
      card.file,
      sourcePath,
      card.address
    );
    try {
      await navigator.clipboard.writeText(link);
      new import_obsidian8.Notice(`Copied ${link}.`);
    } catch (error) {
      new import_obsidian8.Notice(`Could not copy the card link: ${errorMessage4(error)}`);
    }
  }
  async removeBookmark(path) {
    if (this.bookmarkAtPath(path) === void 0) {
      return;
    }
    const label = this.filedCardLabel(path);
    this.state = {
      ...this.state,
      bookmarks: deleteBookmark(this.state.bookmarks, path)
    };
    this.refreshBookmarkUi();
    await this.persistState();
    new import_obsidian8.Notice(`Deleted bookmark at ${label}.`);
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
  registerIndexEvents() {
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.queueIndexRefresh())
    );
    this.registerEvent(
      this.app.metadataCache.on("deleted", () => this.queueIndexRefresh())
    );
    this.registerEvent(
      this.app.metadataCache.on("resolve", () => this.queueIndexRefresh())
    );
    this.registerEvent(
      this.app.vault.on("create", () => this.queueIndexRefresh())
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => this.handleDeletedFile(file))
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => this.handleRenamedFile(file, oldPath))
    );
  }
  async initializeAfterLayoutReady() {
    await this.refreshIndex();
  }
  async refreshIndex() {
    this.index.refresh();
    if (this.state.bookmarks.some((bookmark) => !isPathBookmark(bookmark))) {
      this.state = {
        ...this.state,
        bookmarks: migrateAddressBookmarks(
          this.state.bookmarks,
          (address) => this.index.firstFiledAtAddress(address)?.path
        )
      };
      await this.persistState();
    }
    this.reconcileSessionTray();
    await this.refreshDeckViews();
  }
  async refreshDeckViews() {
    await Promise.all(
      this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE).flatMap(
        (leaf) => leaf.view instanceof DeckView ? [leaf.view.refresh()] : []
      )
    );
  }
  refreshBookmarkUi() {
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.handleBookmarksChanged();
      }
    }
  }
  async persistState() {
    const persistedSettings = settingsForPersistence(
      this.rawSettings,
      this.settings
    );
    const write = this.persistQueue.then(() => this.saveData({
      schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
      settings: persistedSettings,
      state: this.state
    }));
    this.persistQueue = write.catch(() => void 0);
    try {
      await write;
      this.rawSettings = persistedSettings;
    } catch (error) {
      new import_obsidian8.Notice(`Could not save Slipbox state: ${errorMessage4(error)}`);
    }
  }
  async waitForCachedAddress(file, expectedAddress) {
    const cachedAddress = () => this.app.metadataCache.getFileCache(file)?.frontmatter?.[this.settings.addressProperty];
    if (cachedAddress() === expectedAddress) {
      return true;
    }
    return new Promise((resolve) => {
      let eventRef = null;
      let timeout = null;
      let settled = false;
      const finish = (ready) => {
        if (settled) {
          return;
        }
        settled = true;
        if (eventRef !== null) {
          this.app.metadataCache.offref(eventRef);
        }
        if (timeout !== null) {
          window.clearTimeout(timeout);
        }
        resolve(ready);
      };
      eventRef = this.app.metadataCache.on("changed", (changedFile) => {
        if (changedFile.path === file.path && cachedAddress() === expectedAddress) {
          finish(true);
        }
      });
      timeout = window.setTimeout(
        () => finish(cachedAddress() === expectedAddress),
        1e3
      );
      if (cachedAddress() === expectedAddress) {
        finish(true);
      }
    });
  }
  handleDeletedFile(file) {
    for (const [path, draft] of this.detachedInlineEditDrafts) {
      if (pathIsAtOrBelow(path, file.path)) {
        this.detachedInlineEditDrafts.set(path, {
          ...draft,
          conflictMessage: "The card was deleted while it was being edited. Your draft was kept.",
          conflictRetryable: true
        });
      }
    }
    this.tray = removeTrayPath(this.tray, file.path);
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.handlePathDeletion(file.path);
      }
    }
    const prefix = `${file.path.replace(/\/$/, "")}/`;
    const legacyDeskCards = this.state.legacyDeskCards ?? [];
    const removesLegacyDeskCard = legacyDeskCards.some(
      (card) => card.cardRef === file.path || card.cardRef.startsWith(prefix)
    );
    const nextBookmarks = removeBookmarkPaths(this.state.bookmarks, file.path);
    if (removesLegacyDeskCard || nextBookmarks.length !== this.state.bookmarks.length) {
      const next = removeDeskPath(legacyDeskCards, file.path);
      const { legacyDeskCards: _legacyDeskCards, ...state } = this.state;
      this.state = {
        ...state,
        bookmarks: nextBookmarks,
        ...next.length > 0 ? { legacyDeskCards: next } : {}
      };
      void this.persistState();
    }
    this.queueIndexRefresh();
  }
  handleRenamedFile(file, oldPath) {
    for (const [path, draft] of [...this.detachedInlineEditDrafts]) {
      const renamedPath = renamePathReference(path, oldPath, file.path);
      if (renamedPath === path) {
        continue;
      }
      this.detachedInlineEditDrafts.delete(path);
      const collision = this.detachedInlineEditDrafts.has(renamedPath) || this.inlineEditOwners.ownerAt(renamedPath) !== void 0;
      this.detachedInlineEditDrafts.set(renamedPath, {
        ...draft,
        path: renamedPath,
        conflictMessage: collision ? "The renamed path is already held by another inline-edit session." : draft.conflictMessage,
        conflictRetryable: collision ? false : draft.conflictRetryable
      });
    }
    this.tray = renameTrayPath(this.tray, oldPath, file.path);
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.handlePathRename(oldPath, file.path);
      }
    }
    const prefix = `${oldPath.replace(/\/$/, "")}/`;
    const legacyDeskCards = this.state.legacyDeskCards ?? [];
    const renamesLegacyDeskCard = legacyDeskCards.some(
      (card) => card.cardRef === oldPath || card.cardRef.startsWith(prefix)
    );
    const renamesBookmark = this.state.bookmarks.some(
      (bookmark) => isPathBookmark(bookmark) && pathIsAtOrBelow(bookmark.path, oldPath)
    );
    if (renamesLegacyDeskCard || renamesBookmark) {
      this.state = {
        ...this.state,
        bookmarks: renameBookmarkPaths(this.state.bookmarks, oldPath, file.path),
        ...renamesLegacyDeskCard ? { legacyDeskCards: renameDeskCard(legacyDeskCards, oldPath, file.path) } : {}
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
  trayPilePaths(pileId) {
    return this.tray.piles.find((pile) => pile.id === pileId)?.cards.map((card) => card.cardRef) ?? [];
  }
  reportCanvasWrite(result) {
    const added = result.addedPaths.length;
    const skipped = result.skippedPaths.length;
    const summary = added === 0 ? `No cards added to ${result.file.basename}.` : `Added ${added} card${added === 1 ? "" : "s"} to ${result.file.basename}.`;
    const existing = skipped === 0 ? "" : ` Skipped ${skipped} existing node${skipped === 1 ? "" : "s"}.`;
    new import_obsidian8.Notice(`${summary}${existing}`);
  }
};
function errorMessage4(error) {
  return error instanceof Error ? error.message : String(error);
}
function isRecord6(value) {
  return typeof value === "object" && value !== null;
}
function rawSettingsFromPluginData(value) {
  return isRecord6(value) && isRecord6(value.settings) ? value.settings : {};
}
