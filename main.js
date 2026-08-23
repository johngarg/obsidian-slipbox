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
var import_obsidian9 = require("obsidian");

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
var import_obsidian4 = require("obsidian");

// src/deck-motion.ts
var DEFAULT_ACTIVE_HYSTERESIS = 0.06;
function cardStackOrder(cardIndex, activeIndex) {
  return cardIndex === activeIndex ? 220 : 100 - Math.abs(cardIndex - activeIndex);
}
function adjacentBookmarkIndex(bookmarkIndices, activeIndex, direction) {
  let target = null;
  for (const index of bookmarkIndices) {
    if (direction < 0) {
      if (index < activeIndex && (target === null || index > target)) {
        target = index;
      }
    } else if (index > activeIndex && (target === null || index < target)) {
      target = index;
    }
  }
  return target;
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
  return inTray ? "Return from Desk" : "Put on Desk";
}
function canRunDeckAction(action, context) {
  switch (action) {
    case "previous-card":
      return context.hasPreviousCard;
    case "next-card":
      return context.hasNextCard;
    case "previous-bookmark":
      return context.hasPreviousBookmark;
    case "next-bookmark":
      return context.hasNextBookmark;
    case "forward-ten-cards":
    case "backward-ten-cards":
      return context.hasActiveCard;
    case "centre-card":
    case "find-address-forward":
    case "find-address-backward":
    case "find-address-first":
      return context.hasActiveCard;
    case "open-note":
    case "delete-card":
      return context.hasFocusedCard;
    case "edit-card":
      return context.hasFocusedCard && !(context.focusedSurface === "deck" && context.focusedCardOnDesk);
    case "copy-link":
    case "toggle-tray":
    case "pull-into-pile":
      return context.focusedCardFiled;
    case "toggle-bookmark":
      return context.focusedCardFiled && context.focusedSurface === "deck";
    case "show-card-in-deck":
      return context.focusedCardFiled && context.focusedSurface !== "deck";
    case "toggle-viewed-card":
      return context.hasFocusedCard && !(context.focusedSurface === "deck" && context.focusedCardOnDesk) && (context.focusedSurface === "deck" || context.focusedSurface === "desk" || context.focusedSurface === "viewed");
    case "file-card":
      return context.focusedCardUnfiled && context.focusedSurface !== "deck";
    case "move-desk-card-left":
      return context.canMoveDeskCardLeft;
    case "move-desk-card-right":
      return context.canMoveDeskCardRight;
    case "next-pile":
    case "previous-pile":
      return context.hasDeskPiles && context.focusedSurface !== "viewed";
    case "swap-deck-pile":
      return context.hasDeskPiles && context.hasActiveCard && context.focusedSurface !== "viewed";
    case "toggle-pile":
    case "previous-card-in-pile":
    case "next-card-in-pile":
      return context.hasDeskPiles && context.focusedSurface === "desk";
    case "collapse-all-piles":
      return context.hasExpandedPiles;
    case "return-all-filed-cards":
      return context.hasFiledDeskCards;
    case "first-card":
    case "last-card":
      return context.hasActiveCard;
    case "problems":
      return context.hasProblems;
    case "confirm-filing":
      return context.filing;
    case "cancel-filing":
      return context.filing;
    case "bookmarks":
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
      item.setTitle(trayToggleLabel(inTray)).setIcon(inTray ? "undo-2" : "bring-to-front").onClick(() => this.environment.runAfterEditing(
        "backlink-tray-toggle",
        () => {
          this.environment.runAction("toggle-tray", backlink);
        }
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

// src/card-header-buttons.ts
var import_obsidian2 = require("obsidian");

// src/card-header-actions.ts
var CARD_BUTTON_DEFINITIONS = [
  { action: "edit-card", settingLabel: "Edit card", surfaces: ["deck", "desk", "viewed"] },
  { action: "open-note", settingLabel: "Open Markdown note", surfaces: ["deck", "desk", "viewed"] },
  { action: "toggle-viewed-card", settingLabel: "View or return card to its source", surfaces: ["desk", "viewed"] },
  { action: "show-card-in-deck", settingLabel: "Show card in Deck", surfaces: ["desk", "viewed"] },
  { action: "toggle-tray", settingLabel: "Put on or return from Desk", surfaces: ["deck", "desk", "viewed"] },
  { action: "file-card", settingLabel: "File card", surfaces: ["desk", "viewed"] },
  { action: "copy-link", settingLabel: "Copy card link", surfaces: ["deck", "desk", "viewed"] },
  { action: "toggle-bookmark", settingLabel: "Toggle bookmark", surfaces: ["deck"] },
  { action: "move-desk-card-left", settingLabel: "Move card left within pile", surfaces: ["desk"] },
  { action: "move-desk-card-right", settingLabel: "Move card right within pile", surfaces: ["desk"] },
  { action: "delete-card", settingLabel: "Delete card", surfaces: ["deck", "desk", "viewed"] }
];
var CARD_BUTTON_ORDER = {
  deck: [
    "edit-card",
    "open-note",
    "toggle-tray",
    "copy-link",
    "toggle-bookmark",
    "delete-card"
  ],
  desk: [
    "toggle-viewed-card",
    "edit-card",
    "open-note",
    "show-card-in-deck",
    "file-card",
    "toggle-tray",
    "copy-link",
    "move-desk-card-left",
    "move-desk-card-right",
    "delete-card"
  ],
  viewed: [
    "edit-card",
    "open-note",
    "show-card-in-deck",
    "file-card",
    "toggle-viewed-card",
    "toggle-tray",
    "copy-link",
    "delete-card"
  ]
};
var definitionByAction = new Map(
  CARD_BUTTON_DEFINITIONS.map((definition) => [definition.action, definition])
);
function cardHeaderButtonDefinitionsForSurface(surface) {
  return CARD_BUTTON_ORDER[surface].flatMap((action) => {
    const definition = definitionByAction.get(action);
    return definition === void 0 ? [] : [definition];
  });
}
function cardHeaderActionPresentation(action, context) {
  const definition = definitionByAction.get(action);
  if (definition === void 0 || !definition.surfaces.includes(context.surface)) {
    return null;
  }
  switch (definition.action) {
    case "edit-card":
      if (context.surface === "deck" && context.onDesk) {
        return null;
      }
      return {
        action: definition.action,
        icon: "file-pen-line",
        label: context.surface === "deck" || context.surface === "viewed" && context.viewedReturnSurface === "deck" ? "Edit on Desk" : "Edit card"
      };
    case "open-note":
      return { action: definition.action, icon: "file-text", label: "Open Markdown note" };
    case "toggle-viewed-card":
      return context.surface === "viewed" ? {
        action: definition.action,
        icon: "minimize-2",
        label: context.viewedReturnSurface === "deck" ? "Return to Deck" : "Return to Desk"
      } : { action: definition.action, icon: "maximize-2", label: "View" };
    case "show-card-in-deck":
      return context.filed && context.surface !== "deck" ? { action: definition.action, icon: "locate-fixed", label: "Show in Deck" } : null;
    case "toggle-tray":
      if (!context.filed) {
        return null;
      }
      return context.onDesk ? {
        action: definition.action,
        icon: "undo-2",
        label: "Return from Desk",
        pressed: true
      } : {
        action: definition.action,
        icon: "bring-to-front",
        label: "Put on Desk",
        pressed: false
      };
    case "file-card":
      return !context.filed && context.surface !== "deck" ? { action: definition.action, icon: "archive-restore", label: "File card" } : null;
    case "copy-link":
      return context.filed ? { action: definition.action, icon: "copy", label: "Copy card link" } : null;
    case "toggle-bookmark":
      return context.filed ? {
        action: definition.action,
        icon: "bookmark",
        label: context.bookmarked ? "Remove bookmark" : "Add bookmark",
        pressed: context.bookmarked
      } : null;
    case "move-desk-card-left":
      return context.surface === "desk" && context.canMoveLeft ? { action: definition.action, icon: "arrow-left", label: "Move left within pile" } : null;
    case "move-desk-card-right":
      return context.surface === "desk" && context.canMoveRight ? { action: definition.action, icon: "arrow-right", label: "Move right within pile" } : null;
    case "delete-card":
      return { action: definition.action, icon: "trash-2", label: "Delete card", warning: true };
  }
}
function applicableCardHeaderActions(context) {
  return CARD_BUTTON_ORDER[context.surface].flatMap((action) => {
    const presentation = cardHeaderActionPresentation(action, context);
    return presentation === null ? [] : [presentation];
  });
}
function enabledCardHeaderActions(settings, context) {
  return applicableCardHeaderActions(context).filter(
    ({ action }) => settings[context.surface][action]
  );
}
function cardHeaderVisibleActionCount(buttonWidths, moreButtonWidth, gap, availableWidth) {
  const normalizedWidths = buttonWidths.map((width) => Math.max(0, width));
  const normalizedGap = Math.max(0, gap);
  const available = Math.max(0, availableWidth);
  const total = normalizedWidths.reduce((sum, width) => sum + width, 0) + normalizedGap * Math.max(0, normalizedWidths.length - 1);
  if (total <= available) {
    return normalizedWidths.length;
  }
  const moreWidth = Math.max(0, moreButtonWidth);
  let used = 0;
  let visibleCount = 0;
  for (const width of normalizedWidths) {
    const next = used + (visibleCount > 0 ? normalizedGap : 0) + width;
    if (next + normalizedGap + moreWidth > available) {
      break;
    }
    used = next;
    visibleCount += 1;
  }
  return visibleCount;
}

// src/pointer-button-focus.ts
function releasePointerActivatedButtonFocus(button, activation) {
  if (activation.detail === 0) {
    return false;
  }
  button.blur();
  return true;
}

// src/card-header-buttons.ts
var CardHeaderButtonController = class {
  constructor(options) {
    this.options = options;
    this.rendered = enabledCardHeaderActions(
      options.settings,
      options.context
    ).map((presentation) => ({
      presentation,
      button: this.renderButton(presentation)
    }));
    this.moreButton = this.renderMoreButton();
    this.observer = new ResizeObserver(() => this.scheduleLayout());
    this.observer.observe(options.container);
    const parent = options.container.parentElement;
    if (parent !== null) {
      this.observer.observe(parent);
    }
    this.scheduleLayout();
  }
  rendered;
  moreButton;
  observer;
  overflowed = [];
  frame = null;
  disconnect() {
    this.observer.disconnect();
    const ownerWindow = this.options.container.ownerDocument.defaultView;
    if (this.frame !== null && ownerWindow !== null) {
      ownerWindow.cancelAnimationFrame(this.frame);
    }
    this.frame = null;
  }
  renderButton(presentation) {
    const button = this.options.container.createEl("button", {
      cls: `clickable-icon slipbox-card-header-action ${this.options.buttonClass}`,
      attr: {
        type: "button",
        "aria-label": presentation.label,
        "data-slipbox-action": presentation.action
      }
    });
    (0, import_obsidian2.setIcon)(button, presentation.icon);
    (0, import_obsidian2.setTooltip)(button, presentation.label, {
      placement: this.options.tooltipPlacement,
      delay: 250
    });
    if (presentation.pressed !== void 0) {
      button.setAttr("aria-pressed", String(presentation.pressed));
      button.toggleClass("is-pressed", presentation.pressed);
    }
    button.toggleClass("is-warning", presentation.warning === true);
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.options.run(presentation.action);
      releasePointerActivatedButtonFocus(button, event);
    });
    return button;
  }
  renderMoreButton() {
    const button = this.options.container.createEl("button", {
      cls: `clickable-icon slipbox-card-header-action slipbox-card-actions-more ${this.options.buttonClass}`,
      attr: {
        type: "button",
        "aria-label": "More card actions"
      }
    });
    (0, import_obsidian2.setIcon)(button, "ellipsis");
    (0, import_obsidian2.setTooltip)(button, "More card actions", {
      placement: this.options.tooltipPlacement,
      delay: 250
    });
    button.hidden = true;
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = import_obsidian2.Menu.forEvent(event);
      for (const { presentation, button: actionButton } of this.overflowed) {
        menu.addItem((item) => {
          item.setTitle(actionButton.getAttribute("aria-label") ?? presentation.label).setIcon(presentation.icon).setWarning(presentation.warning === true).onClick(() => this.options.run(presentation.action));
        });
      }
      menu.showAtMouseEvent(event);
    });
    return button;
  }
  scheduleLayout() {
    if (this.frame !== null) {
      return;
    }
    const ownerWindow = this.options.container.ownerDocument.defaultView;
    if (ownerWindow === null) {
      return;
    }
    this.frame = ownerWindow.requestAnimationFrame(() => {
      this.frame = null;
      this.layout();
    });
  }
  layout() {
    for (const { button } of this.rendered) {
      button.hidden = false;
    }
    this.moreButton.hidden = true;
    this.overflowed = [];
    if (this.rendered.length === 0) {
      return;
    }
    const container = this.options.container;
    const available = container.clientWidth;
    if (available <= 0) {
      return;
    }
    const style = container.ownerDocument.defaultView?.getComputedStyle(container);
    const rawGap = style?.columnGap === "normal" ? "0" : style?.columnGap;
    const gap = Number.parseFloat(rawGap ?? "0") || 0;
    const widths = this.rendered.map(({ button }) => button.offsetWidth);
    this.moreButton.hidden = false;
    const moreWidth = this.moreButton.offsetWidth;
    const visibleCount = cardHeaderVisibleActionCount(
      widths,
      moreWidth,
      gap,
      available
    );
    if (visibleCount === this.rendered.length) {
      this.moreButton.hidden = true;
      return;
    }
    for (let index = visibleCount; index < this.rendered.length; index += 1) {
      this.rendered[index]?.button.toggleAttribute("hidden", true);
    }
    this.overflowed = this.rendered.slice(visibleCount);
  }
};
function renderCardHeaderButtons(options) {
  return new CardHeaderButtonController(options);
}

// src/settings.ts
var SLIPBOX_DATA_SCHEMA_VERSION = 9;
var DEFAULT_CARD_SPREAD = 0.58;
var MIN_CARD_SPREAD = 0.18;
var MAX_CARD_SPREAD = 1.12;
var CARD_HEADER_BUTTON_ACTIONS = [
  "edit-card",
  "open-note",
  "toggle-viewed-card",
  "show-card-in-deck",
  "toggle-tray",
  "file-card",
  "copy-link",
  "toggle-bookmark",
  "move-desk-card-left",
  "move-desk-card-right",
  "delete-card"
];
var binding = (key, modifiers = []) => ({ key, modifiers });
var BASE_ACTION_DEFINITIONS = [
  {
    id: "previous-card",
    label: "Move Deck anchor to previous card",
    repeatable: true,
    defaultBindings: [binding("ArrowLeft"), binding("k")]
  },
  {
    id: "next-card",
    label: "Move Deck anchor to next card",
    repeatable: true,
    defaultBindings: [binding("ArrowRight"), binding("j")]
  },
  {
    id: "previous-bookmark",
    label: "Move Deck anchor to previous bookmark",
    repeatable: false,
    defaultBindings: [binding("[")]
  },
  {
    id: "next-bookmark",
    label: "Move Deck anchor to next bookmark",
    repeatable: false,
    defaultBindings: [binding("]")]
  },
  {
    id: "centre-card",
    label: "Centre Deck anchor",
    repeatable: false,
    defaultBindings: [binding("c")]
  },
  {
    id: "first-card",
    label: "Move Deck anchor to first card",
    repeatable: false,
    defaultBindings: [binding("0")]
  },
  {
    id: "last-card",
    label: "Move Deck anchor to last card",
    repeatable: false,
    defaultBindings: [binding("$", ["Shift"])]
  },
  {
    id: "forward-ten-cards",
    label: "Move Deck anchor forward ten cards",
    repeatable: true,
    defaultBindings: [binding("d", ["Ctrl"])]
  },
  {
    id: "backward-ten-cards",
    label: "Move Deck anchor backward ten cards",
    repeatable: true,
    defaultBindings: [binding("u", ["Ctrl"])]
  },
  {
    id: "open-note",
    label: "Open focused card in Markdown",
    repeatable: false,
    defaultBindings: [binding("o")]
  },
  {
    id: "toggle-tray",
    label: "Put focused card on or return it from Desk",
    repeatable: false,
    defaultBindings: [binding("p")]
  },
  {
    id: "toggle-bookmark",
    label: "Toggle bookmark on focused Deck card",
    repeatable: false,
    defaultBindings: [binding("b")]
  },
  {
    id: "find-address-forward",
    label: "Move Deck anchor to next address initial",
    description: "Type the address's first character after this prefix.",
    repeatable: false,
    defaultBindings: [binding("f")]
  },
  {
    id: "find-address-backward",
    label: "Move Deck anchor to previous address initial",
    description: "Type the address's first character after this prefix.",
    repeatable: false,
    defaultBindings: [binding("f", ["Shift"])]
  },
  {
    id: "find-address-first",
    label: "Move Deck anchor to first address initial",
    description: "Type the address's first character after this prefix.",
    repeatable: false,
    defaultBindings: [binding("g")]
  },
  {
    id: "pull-into-pile",
    label: "Put focused card into numbered pile",
    description: "Type a one-based pile number, then press Enter.",
    repeatable: false,
    defaultBindings: [binding("p", ["Shift"])]
  },
  {
    id: "next-pile",
    label: "Focus the next Desk pile",
    repeatable: true,
    defaultBindings: [binding("}", ["Shift"])]
  },
  {
    id: "previous-pile",
    label: "Focus the previous Desk pile",
    repeatable: true,
    defaultBindings: [binding("{", ["Shift"])]
  },
  {
    id: "swap-deck-pile",
    label: "Swap focus between the Deck and the last pile",
    repeatable: false,
    defaultBindings: [binding("%", ["Shift"])]
  },
  {
    id: "toggle-pile",
    label: "Expand or collapse the focused card's pile",
    repeatable: false,
    defaultBindings: [binding(" ")]
  },
  {
    id: "previous-card-in-pile",
    label: "Focus the previous card in the pile",
    repeatable: true,
    defaultBindings: [binding("h")]
  },
  {
    id: "next-card-in-pile",
    label: "Focus the next card in the pile",
    repeatable: true,
    defaultBindings: [binding("l")]
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
    label: "Copy link to focused card",
    repeatable: false,
    defaultBindings: [binding("y")]
  },
  {
    id: "edit-card",
    label: "Edit focused card on Desk",
    repeatable: false,
    defaultBindings: [binding("e")]
  },
  {
    id: "show-card-in-deck",
    label: "Show focused card in Deck",
    repeatable: false,
    defaultBindings: [binding("Enter")]
  },
  {
    id: "toggle-viewed-card",
    label: "View focused card or return it to its source",
    repeatable: false,
    defaultBindings: [binding("v")]
  },
  {
    id: "file-card",
    label: "File focused card",
    repeatable: false,
    defaultBindings: []
  },
  {
    id: "move-desk-card-left",
    label: "Move focused Desk card left",
    repeatable: true,
    defaultBindings: [binding("ArrowLeft", ["Alt"])]
  },
  {
    id: "move-desk-card-right",
    label: "Move focused Desk card right",
    repeatable: true,
    defaultBindings: [binding("ArrowRight", ["Alt"])]
  },
  {
    id: "delete-card",
    label: "Delete focused card",
    repeatable: false,
    defaultBindings: []
  },
  {
    id: "collapse-all-piles",
    label: "Collapse all Desk piles",
    repeatable: false,
    defaultBindings: []
  },
  {
    id: "return-all-filed-cards",
    label: "Return all filed Desk cards",
    repeatable: false,
    defaultBindings: []
  }
];
var ACTION_COMMAND_IDS = {
  "centre-card": "centre-active-card",
  "open-note": "open-current-card-markdown",
  "copy-link": "copy-current-card-link",
  "toggle-tray": "toggle-tray",
  "toggle-bookmark": "add-bookmark-current-card",
  "find-address-forward": "find-next-address-initial",
  "find-address-backward": "find-previous-address-initial",
  "find-address-first": "find-first-address-initial",
  "pull-into-pile": "pull-into-numbered-pile",
  "toggle-deck-map": "toggle-deck-map-visibility",
  bookmarks: "manage-bookmarks",
  problems: "show-card-problems",
  "return-all-filed-cards": "clear-tray"
};
var FOCUSED_CARD_ACTIONS = /* @__PURE__ */ new Set([
  "open-note",
  "copy-link",
  "toggle-tray",
  "toggle-bookmark",
  "pull-into-pile",
  "toggle-pile",
  "previous-card-in-pile",
  "next-card-in-pile",
  "edit-card",
  "show-card-in-deck",
  "toggle-viewed-card",
  "file-card",
  "move-desk-card-left",
  "move-desk-card-right",
  "delete-card"
]);
var GLOBAL_ACTIONS = /* @__PURE__ */ new Set(["bookmarks", "problems"]);
var VIEW_ACTIONS = /* @__PURE__ */ new Set([
  "toggle-deck-map",
  "confirm-filing",
  "cancel-filing",
  "collapse-all-piles",
  "return-all-filed-cards",
  "next-pile",
  "previous-pile",
  "swap-deck-pile"
]);
var SLIPBOX_ACTION_DEFINITIONS = BASE_ACTION_DEFINITIONS.map((definition) => ({
  ...definition,
  commandId: ACTION_COMMAND_IDS[definition.id] ?? definition.id,
  commandName: definition.label,
  scope: GLOBAL_ACTIONS.has(definition.id) ? "global" : "active-view",
  target: GLOBAL_ACTIONS.has(definition.id) ? "global" : FOCUSED_CARD_ACTIONS.has(definition.id) ? "focused-card" : VIEW_ACTIONS.has(definition.id) ? "view" : "deck-anchor"
}));
var DECK_ACTION_DEFINITIONS = SLIPBOX_ACTION_DEFINITIONS;
var allCardHeaderButtons = (enabled) => Object.fromEntries(
  CARD_HEADER_BUTTON_ACTIONS.map((action) => [action, enabled.includes(action)])
);
var DEFAULT_CARD_HEADER_BUTTONS = {
  deck: allCardHeaderButtons([
    "edit-card",
    "open-note",
    "toggle-tray",
    "copy-link",
    "toggle-bookmark"
  ]),
  desk: allCardHeaderButtons([
    "toggle-viewed-card",
    "edit-card",
    "open-note",
    "show-card-in-deck",
    "file-card",
    "toggle-tray"
  ]),
  viewed: allCardHeaderButtons([
    "edit-card",
    "open-note",
    "show-card-in-deck",
    "file-card",
    "toggle-viewed-card"
  ])
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
  showTitleInDeck: false,
  showDeckMap: true,
  cardSpread: DEFAULT_CARD_SPREAD,
  cardHeaderButtons: DEFAULT_CARD_HEADER_BUTTONS,
  deckKeybindings: DEFAULT_DECK_KEYBINDINGS
};
var MODIFIER_ORDER = ["Mod", "Ctrl", "Meta", "Alt", "Shift"];
function isRecord2(value) {
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
function normalizeCardSpread(value) {
  const spread = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_CARD_SPREAD;
  return Math.min(MAX_CARD_SPREAD, Math.max(MIN_CARD_SPREAD, spread));
}
function hasTitleAddressPropertyCollision(value) {
  if (!isRecord2(value) || value.titleSource !== "frontmatter") {
    return false;
  }
  const addressProperty = normalizePropertyName(
    value.addressProperty,
    DEFAULT_SETTINGS.addressProperty
  );
  const titleProperty = normalizePropertyName(
    value.titleProperty,
    DEFAULT_SETTINGS.titleProperty
  );
  return addressProperty === titleProperty;
}
function normalizeKeyBinding(value) {
  if (!isRecord2(value) || typeof value.key !== "string" || value.key === "") {
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
  if (bindingValue.modifiers.length === 1 && bindingValue.modifiers[0] === "Shift" && (key === "$" || key === "%" || key === "{" || key === "}")) {
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
  const source = isRecord2(value) ? value : {};
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
  const source = isRecord2(value) ? value : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      typeof source[key] === "boolean" ? source[key] : fallback
    ])
  );
}
function normalizeCardHeaderButtons(value, legacyDeckButtons = void 0) {
  const source = isRecord2(value) ? value : {};
  const legacy = isRecord2(legacyDeckButtons) ? legacyDeckButtons : {};
  const deckSource = isRecord2(source.deck) ? source.deck : {};
  const migratedDeck = {
    ...deckSource
  };
  const legacyMappings = {
    "open-note": "open-note",
    "copy-link": "copy-link",
    tray: "toggle-tray",
    bookmark: "toggle-bookmark"
  };
  for (const [legacyKey, action] of Object.entries(legacyMappings)) {
    if (typeof migratedDeck[action] !== "boolean" && typeof legacy[legacyKey] === "boolean") {
      migratedDeck[action] = legacy[legacyKey];
    }
  }
  return {
    deck: normalizeBooleanRecord(migratedDeck, DEFAULT_CARD_HEADER_BUTTONS.deck),
    desk: normalizeBooleanRecord(source.desk, DEFAULT_CARD_HEADER_BUTTONS.desk),
    viewed: normalizeBooleanRecord(source.viewed, DEFAULT_CARD_HEADER_BUTTONS.viewed)
  };
}
function normalizeSettings(value) {
  const source = isRecord2(value) ? value : {};
  const addressProperty = normalizePropertyName(
    source.addressProperty,
    DEFAULT_SETTINGS.addressProperty
  );
  const titleProperty = normalizePropertyName(
    source.titleProperty,
    DEFAULT_SETTINGS.titleProperty
  );
  const requestedTitleSource = source.titleSource === "frontmatter" ? "frontmatter" : "filename";
  return {
    addressProperty,
    deckOrdering: source.deckOrdering === "lexicographic" ? "lexicographic" : "natural",
    titleSource: requestedTitleSource === "frontmatter" && titleProperty === addressProperty ? "filename" : requestedTitleSource,
    titleProperty,
    mainCardSize: normalizeCardSize(source.mainCardSize),
    trayCardSize: normalizeCardSize(source.trayCardSize),
    newCardFolder: normalizeFolderPath(source.newCardFolder),
    newNoteTimestampFormat: normalizePropertyName(
      source.newNoteTimestampFormat,
      DEFAULT_SETTINGS.newNoteTimestampFormat
    ),
    showTitleInDeck: typeof source.showTitleInDeck === "boolean" ? source.showTitleInDeck : DEFAULT_SETTINGS.showTitleInDeck,
    showDeckMap: typeof source.showDeckMap === "boolean" ? source.showDeckMap : DEFAULT_SETTINGS.showDeckMap,
    cardSpread: normalizeCardSpread(source.cardSpread),
    cardHeaderButtons: normalizeCardHeaderButtons(
      source.cardHeaderButtons,
      source.deckHeaderButtons
    ),
    deckKeybindings: normalizeDeckKeybindings(source.deckKeybindings)
  };
}
function settingsForPersistence(rawValue, settings) {
  const raw = isRecord2(rawValue) ? rawValue : {};
  const {
    deckHeaderButtons: _legacyDeckHeaderButtons,
    showDeckToolbar: _showDeckToolbar,
    useTemplatesForNewNotes: _useTemplatesForNewNotes,
    newNoteTemplatePath: _newNoteTemplatePath,
    ...retainedRaw
  } = raw;
  const rawKeybindingsSource = isRecord2(raw.deckKeybindings) ? raw.deckKeybindings : {};
  const rawKeybindings = Object.fromEntries(
    Object.entries(rawKeybindingsSource).filter(
      ([key]) => key !== "entry-points" && key !== "back" && key !== "forward" && key !== "toggle-toolbar"
    )
  );
  return {
    ...retainedRaw,
    ...settings,
    cardHeaderButtons: settings.cardHeaderButtons,
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

// src/tray-view.ts
var import_obsidian3 = require("obsidian");

// src/desk-focus.ts
function isDeskCardFocusTarget(target) {
  return target !== null && target.closest(".slipbox-tray-card") !== null;
}

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
  return tagName === "input" || tagName === "textarea" || tagName === "select" || tagName === "button" || tagName === "a" || target.isContentEditable === true;
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
function deskCardPrimaryClickIntent(expanded) {
  return expanded ? "focus-only" : "expand-pile";
}
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
function cyclePileTopCard(state, pileId, direction) {
  const pileIndex = state.piles.findIndex((pile2) => pile2.id === pileId);
  const pile = state.piles[pileIndex];
  if (pile === void 0 || pile.cards.length < 2) {
    return state;
  }
  const cards = [...pile.cards];
  if (direction === 1) {
    const top = cards.shift();
    if (top !== void 0) {
      cards.push(top);
    }
  } else {
    const previous = cards.pop();
    if (previous !== void 0) {
      cards.unshift(previous);
    }
  }
  const piles = [...state.piles];
  piles[pileIndex] = { ...pile, cards };
  return { ...state, piles };
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
function collapseAllPiles(state) {
  return state.expandedPileIds.length === 0 ? state : { ...state, expandedPileIds: [] };
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

// src/pointer-drag.ts
function beginThresholdPointerDrag(options) {
  const {
    captureTarget,
    pointerId,
    startX,
    startY,
    threshold
  } = options;
  const document2 = captureTarget.ownerDocument;
  let dragging = false;
  const cleanup = () => {
    document2.removeEventListener("pointermove", move);
    document2.removeEventListener("pointerup", finish);
    document2.removeEventListener("pointercancel", cancel);
  };
  const releaseCapture = () => {
    if (captureTarget.hasPointerCapture(pointerId)) {
      captureTarget.releasePointerCapture(pointerId);
    }
  };
  const move = (event) => {
    if (event.pointerId !== pointerId) {
      return;
    }
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!dragging) {
      if (Math.hypot(deltaX, deltaY) < Math.max(0, threshold)) {
        return;
      }
      try {
        captureTarget.setPointerCapture(pointerId);
      } catch {
        cleanup();
        options.onCancel();
        return;
      }
      dragging = true;
      options.onDragStart();
    }
    event.preventDefault();
    options.onDragMove(event, deltaX, deltaY);
  };
  const finish = (event) => {
    if (event.pointerId !== pointerId) {
      return;
    }
    cleanup();
    releaseCapture();
    if (!dragging) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    options.onDrop(event);
  };
  const cancel = (event) => {
    if (event.pointerId !== pointerId) {
      return;
    }
    cleanup();
    releaseCapture();
    options.onCancel();
  };
  document2.addEventListener("pointermove", move);
  document2.addEventListener("pointerup", finish);
  document2.addEventListener("pointercancel", cancel);
}

// src/tray-drop.ts
function cardDropTargetPile(elements, sourcePileId) {
  const targetCard = elements.find(
    (element) => element.matches(".slipbox-tray-card:not(.is-dragging)")
  );
  const cardPile = targetCard?.closest(".slipbox-tray-pile");
  if (cardPile?.dataset.pileId !== void 0) {
    return cardPile;
  }
  const pile = elements.find(
    (element) => element.matches(".slipbox-tray-pile")
  );
  return pile?.dataset.pileId !== void 0 && pile.dataset.pileId !== sourcePileId ? pile : null;
}
function pilePositionAtWorkspacePoint(x, y, coordinateBounds, workspaceBounds, geometry) {
  if (x < workspaceBounds.left || x > workspaceBounds.right || y < workspaceBounds.top || y > workspaceBounds.bottom) {
    return null;
  }
  return {
    x: x - (coordinateBounds.left + coordinateBounds.width / 2),
    y: y - (coordinateBounds.top + coordinateBounds.height * geometry.baseYRatio - geometry.baseYOffsetPx) - geometry.cardHalfHeightPx
  };
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
  workspaceEl = null;
  cardHeaderButtonControllers = /* @__PURE__ */ new Set();
  filingEditor = null;
  suppressClickUntil = 0;
  pendingCardClickTimer = null;
  clear() {
    for (const controller of this.cardHeaderButtonControllers) {
      controller.disconnect();
    }
    this.cardHeaderButtonControllers.clear();
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
    this.workspaceEl = null;
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
    const component = new import_obsidian3.Component();
    component.load();
    this.components.set(file.path, component);
    preview.empty();
    preview.addClass("markdown-rendered");
    try {
      await import_obsidian3.MarkdownRenderer.render(
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
  async render(stage, space, filing, viewedPath, isCurrent) {
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
    this.workspaceEl = stage;
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
        viewedPath,
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
      const menu = import_obsidian3.Menu.forEvent(event);
      const position = this.positionAtPoint(
        event.clientX,
        event.clientY,
        space,
        stage
      );
      menu.addItem((item) => {
        item.setTitle("New card here").setIcon("file-plus-2").setDisabled(position === null).onClick(() => {
          if (position !== null) {
            void this.actions.runAfterEditing(
              "tray-new-card",
              () => this.plugin.createNewCardAtTrayPosition(position)
            );
          }
        });
      });
      menu.addItem((item) => {
        item.setTitle("New card with title here").setIcon("file-pen-line").setDisabled(position === null).onClick(() => {
          if (position !== null) {
            void this.actions.runAfterEditing(
              "tray-new-card",
              () => this.plugin.createNewCardAtTrayPosition(
                position,
                "prompt"
              )
            );
          }
        });
      });
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle("Collapse all piles").setIcon("minimize-2").setDisabled(!this.actions.canRunAction("collapse-all-piles")).onClick(() => this.actions.runAction("collapse-all-piles"));
      });
      menu.addItem((item) => {
        item.setTitle("Return all filed cards").setIcon("eraser").setDisabled(!this.actions.canRunAction("return-all-filed-cards")).onClick(() => this.actions.runAction("return-all-filed-cards"));
      });
      menu.showAtMouseEvent(event);
    });
  }
  renderPile(parent, pile, pileIndex, position, expanded, filing, viewedPath, isCurrent) {
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
    pileEl.addEventListener("focusin", (event) => {
      if (event.target instanceof Element && isDeskCardFocusTarget(event.target)) {
        return;
      }
      const top = pile.cards[0];
      if (top !== void 0) {
        this.actions.focusDeskCard(top.cardRef, pile.id);
      }
    });
    if (!expanded) {
      this.renderStackLayers(pileEl, pile);
      if (pile.cards.length > 1) {
        this.renderPileCycleButton(pileEl, pile, pileIndex, -1);
        this.renderPileCycleButton(pileEl, pile, pileIndex, 1);
      }
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
      (0, import_obsidian3.setIcon)(handle, "grip-vertical");
      (0, import_obsidian3.setTooltip)(handle, "Drag to move \xB7 Click to collapse", {
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
      viewedPath,
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
    pileEl.addEventListener("contextmenu", (event) => {
      if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select") !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const top = pile.cards[0];
      if (top !== void 0) {
        this.actions.focusDeskCard(top.cardRef, pile.id);
      }
      this.showPileMenu(event, pile);
    });
    this.attachPileDragging(pileEl, dragSurface, pile, position);
    return jobs;
  }
  renderPileCycleButton(parent, pile, pileIndex, direction) {
    const previous = direction === -1;
    const label = `${previous ? "Previous" : "Next"} card in pile ${pileIndex + 1}`;
    const button = parent.createEl("button", {
      cls: `clickable-icon slipbox-tray-pile-cycle ${previous ? "is-previous" : "is-next"}`,
      attr: { type: "button", "aria-label": label }
    });
    (0, import_obsidian3.setIcon)(button, previous ? "chevron-left" : "chevron-right");
    (0, import_obsidian3.setTooltip)(button, label, {
      placement: previous ? "left" : "right",
      delay: 250
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.actions.runAfterEditing(
        `tray-cycle-pile-${previous ? "previous" : "next"}`,
        async () => {
          await this.plugin.updateTray(cyclePileTopCard(
            this.plugin.tray,
            pile.id,
            direction
          ));
          this.focusPileCycleButton(pile.id, direction);
        }
      );
    });
  }
  focusPileCycleButton(pileId, direction) {
    if (this.rootEl === null) {
      return;
    }
    const pile = Array.from(this.rootEl.querySelectorAll(
      ".slipbox-tray-pile"
    )).find((candidate) => candidate.dataset.pileId === pileId);
    pile?.querySelector(
      `.slipbox-tray-pile-cycle.${direction === -1 ? "is-previous" : "is-next"}`
    )?.focus({ preventScroll: true });
  }
  async renderCard(parent, pile, card, cardIndex, pileIndex, expanded, filing, viewedPath, isCurrent) {
    const file = this.plugin.index.fileAtPath(card.cardRef);
    if (!(file instanceof import_obsidian3.TFile)) {
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    const address = filed?.address ?? "unfiled";
    const title = this.plugin.cardTitle(file);
    const isViewed = viewedPath === card.cardRef;
    const miniature = parent.createDiv({
      cls: "slipbox-tray-card",
      attr: {
        "data-card-ref": card.cardRef,
        role: isViewed || filed !== void 0 ? "button" : "group",
        "aria-label": isViewed ? `${address}, ${title}; viewed card placeholder. Activate to focus the viewed card.` : `${address}, ${title}; card ${cardIndex + 1} of ${pile.cards.length} in pile ${pileIndex + 1}`
      }
    });
    miniature.dataset.pileId = pile.id;
    const jitter = trayStackJitter(card.cardRef, cardIndex);
    miniature.style.setProperty(
      "--slipbox-tray-card-tilt",
      `${jitter.rotationDegrees}deg`
    );
    miniature.tabIndex = expanded ? 0 : -1;
    miniature.toggleClass("is-filed", filed !== void 0);
    miniature.toggleClass("is-unfiled", filed === void 0);
    miniature.toggleClass("is-viewed-ghost", isViewed);
    miniature.toggleClass(
      "is-card-focused",
      !isViewed && this.actions.isDeskCardFocused(card.cardRef, pile.id)
    );
    miniature.addEventListener("focusin", () => {
      if (isViewed) {
        this.actions.focusViewedCard();
      } else {
        this.actions.focusDeskCard(card.cardRef, pile.id);
      }
    });
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
      (0, import_obsidian3.setTooltip)(addressEl, "Double-click to file", {
        placement: "bottom",
        delay: 350
      });
      attachUnfiledAddressFiling(addressEl, () => {
        this.actions.focusDeskCard(card.cardRef, pile.id);
        this.actions.runAction("file-card");
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
    if (!isFilingSource && !isViewed) {
      const controls = identity.createDiv({ cls: "slipbox-tray-card-actions" });
      this.cardHeaderButtonControllers.add(renderCardHeaderButtons({
        container: controls,
        context: {
          surface: "desk",
          viewedReturnSurface: null,
          filed: filed !== void 0,
          onDesk: true,
          bookmarked: filed !== void 0 && this.plugin.bookmarkAtPath(filed.path) !== void 0,
          canMoveLeft: cardIndex > 0,
          canMoveRight: cardIndex < pile.cards.length - 1
        },
        settings: this.plugin.settings.cardHeaderButtons,
        buttonClass: "slipbox-tray-card-action",
        tooltipPlacement: "bottom",
        run: (action) => {
          this.actions.focusDeskCard(card.cardRef, pile.id);
          this.actions.runAction(action);
        }
      }));
    }
    if (isViewed) {
      miniature.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.cancelPendingCardClick();
        this.actions.focusViewedCard();
      });
      miniature.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        if (event.key === "Enter") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.actions.focusViewedCard();
      });
      miniature.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (expanded) {
          this.showCardMenu(event, pile, card);
        } else {
          this.showPileMenu(event, pile, card);
        }
      });
      return;
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
      this.actions.focusDeskCard(card.cardRef, pile.id);
      this.actions.runAction("edit-card");
    });
    this.attachPreviewLinkInteractions(preview, file.path);
    const component = new import_obsidian3.Component();
    component.load();
    this.components.set(file.path, component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (isCurrent()) {
        await import_obsidian3.MarkdownRenderer.render(
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
      this.actions.focusDeskCard(card.cardRef, pile.id);
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
        if (deskCardPrimaryClickIntent(expanded) === "expand-pile") {
          this.scheduleCardClick(() => {
            void this.actions.runAfterEditing(
              "tray-expand-pile",
              () => this.plugin.setTrayPileExpanded(pile.id, true)
            );
          });
        }
        return;
      }
      if (deskCardPrimaryClickIntent(expanded) === "expand-pile") {
        event.preventDefault();
        event.stopPropagation();
        void this.actions.runAfterEditing(
          "tray-expand-pile",
          () => this.plugin.setTrayPileExpanded(pile.id, true)
        );
      }
    });
    miniature.addEventListener("contextmenu", (event) => {
      if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select") !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.actions.focusDeskCard(card.cardRef, pile.id);
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
        const filed = internal ? resolveFiledCardLink((0, import_obsidian3.getLinkpath)(linktext), sourcePath, {
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
    const menu = import_obsidian3.Menu.forEvent(event);
    if (visibleCard !== void 0 && this.addCardFileMenuItems(menu, visibleCard, pile.id)) {
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
    const menu = import_obsidian3.Menu.forEvent(event);
    if (this.addCardFileMenuItems(menu, card, pile.id)) {
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
  addCardFileMenuItems(menu, card, pileId) {
    const file = this.plugin.index.fileAtPath(card.cardRef);
    if (file === void 0) {
      return false;
    }
    const filed = this.plugin.index.filedByFile(file);
    const position = cardPosition(this.plugin.tray, card.cardRef);
    const run = (action) => {
      this.actions.focusDeskCard(card.cardRef, pileId);
      this.actions.runAction(action);
    };
    for (const presentation of applicableCardHeaderActions({
      surface: "desk",
      viewedReturnSurface: null,
      filed: filed !== void 0,
      onDesk: true,
      bookmarked: filed !== void 0 && this.plugin.bookmarkAtPath(filed.path) !== void 0,
      canMoveLeft: position !== null && position.cardIndex > 0,
      canMoveRight: position !== null && position.cardIndex < position.pileSize - 1
    })) {
      menu.addItem((item) => {
        item.setTitle(presentation.action === "delete-card" ? `Delete ${this.plugin.cardTitle(file)}` : presentation.label).setIcon(presentation.icon).setWarning(presentation.warning === true).onClick(() => run(presentation.action));
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
        beginThresholdPointerDrag({
          captureTarget: element,
          pointerId,
          startX,
          startY,
          threshold: DRAG_THRESHOLD_PX,
          onDragStart: () => {
            element.addClass("is-dragging");
            this.rootEl?.addClass("is-dragging-card");
          },
          onDragMove: (moveEvent, dx, dy) => {
            element.style.translate = `${dx}px ${dy}px`;
            this.updateCardDropCues(moveEvent, pile.id, element);
          },
          onDrop: (upEvent) => {
            this.suppressClickUntil = performance.now() + 400;
            const next = this.cardDropState(
              card.cardRef,
              pile.id,
              upEvent.clientX,
              upEvent.clientY,
              element
            );
            const nextPosition = cardPosition(next, card.cardRef);
            if (nextPosition !== null) {
              this.actions.focusDeskCard(card.cardRef, nextPosition.pileId);
            }
            this.clearDropCues();
            void this.plugin.updateTray(next);
          },
          onCancel: () => this.clearDropCues()
        });
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
        beginThresholdPointerDrag({
          captureTarget: dragSurface,
          pointerId,
          startX,
          startY,
          threshold: DRAG_THRESHOLD_PX,
          onDragStart: () => element.addClass("is-dragging"),
          onDragMove: (moveEvent, dx, dy) => {
            element.style.translate = `${dx}px ${dy}px`;
            this.updatePileDropCues(moveEvent, pile.id, element);
          },
          onDrop: (upEvent) => {
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
          },
          onCancel: () => {
            element.setCssProps({ translate: "" });
            this.clearDropCues();
          }
        });
      });
    });
  }
  cardDropState(cardRef, sourcePileId, x, y, dragged) {
    const state = this.plugin.tray;
    const targetPileEl = cardDropTargetPile(
      this.elementsBelowPoint(x, y, dragged),
      sourcePileId
    );
    const targetPileId = targetPileEl?.dataset.pileId;
    if (targetPileEl !== null && targetPileId !== void 0) {
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
    const targetPile = cardDropTargetPile(elements, sourcePileId);
    if (targetPile === null) {
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
  positionAtPoint(x, y, coordinateElement = this.rootEl, hitBoundsElement = null) {
    const rect = coordinateElement?.getBoundingClientRect();
    const hitBounds = (hitBoundsElement ?? this.workspaceEl)?.getBoundingClientRect();
    if (rect === void 0 || hitBounds === void 0) {
      return null;
    }
    return pilePositionAtWorkspacePoint(x, y, rect, hitBounds, {
      baseYRatio: PILE_BASE_Y_RATIO,
      baseYOffsetPx: PILE_BASE_Y_OFFSET_PX,
      cardHalfHeightPx: PILE_CARD_HALF_HEIGHT_PX
    });
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
    const label = deckMapSectionLabel(card.address);
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
function deckMapSectionLabel(address) {
  return address.match(/^[0-9]+/u)?.[0] ?? Array.from(address)[0] ?? "";
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
var DEFAULT_DECK_MAP_VISIBILITY = {
  deckMapOverride: null
};
function deckMapIsVisible(state, showDeckMapSetting, cardCount) {
  return cardCount > 0 && (state.deckMapOverride ?? showDeckMapSetting);
}
function toggleDeckMapVisibility(state, showDeckMapSetting) {
  return {
    ...state,
    deckMapOverride: !(state.deckMapOverride ?? showDeckMapSetting)
  };
}
function applyDeckMapVisibility(deckMap, state, showDeckMapSetting, cardCount) {
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
  constructor(path, body, environment) {
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
function resolveDeckEscapeAction(event, state) {
  if (event.key !== "Escape") {
    return null;
  }
  if (state.editing) {
    return "finish-editing";
  }
  if (state.pendingCommand) {
    return "cancel-pending-command";
  }
  if (state.filing) {
    return "cancel-filing";
  }
  return "contain";
}
function consumeDeckEscape(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
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

// src/viewed-card.ts
function createViewedCardState(path, returnTarget) {
  return { path, returnTarget, x: 0, y: 0, scrollTop: 0 };
}
function resolveViewedCardReturnTarget(state, deckAvailable, deskPileId) {
  if (state.returnTarget.surface === "deck") {
    if (deckAvailable) {
      return state.returnTarget;
    }
    return deskPileId === void 0 ? null : { surface: "desk", pileId: deskPileId };
  }
  if (deskPileId !== void 0) {
    return { surface: "desk", pileId: deskPileId };
  }
  return deckAvailable ? { surface: "deck" } : null;
}
function retargetViewedCardState(state, returnTarget) {
  if (returnTarget.surface === "deck") {
    return state.returnTarget.surface === "deck" ? state : { ...state, returnTarget };
  }
  if (state.returnTarget.surface === "desk" && state.returnTarget.pileId === returnTarget.pileId) {
    return state;
  }
  return { ...state, returnTarget };
}
function moveViewedCardState(state, x, y, bounds) {
  const margin = Math.max(0, bounds.margin ?? 16);
  const maxX = Math.max(
    0,
    (Math.max(0, bounds.stageWidth) - Math.max(0, bounds.cardWidth)) / 2 - margin
  );
  const maxY = Math.max(
    0,
    (Math.max(0, bounds.stageHeight) - Math.max(0, bounds.cardHeight)) / 2 - margin
  );
  return {
    ...state,
    x: clamp(x, -maxX, maxX),
    y: clamp(y, -maxY, maxY)
  };
}
function scrollViewedCardState(state, scrollTop) {
  return { ...state, scrollTop: Math.max(0, scrollTop) };
}
function renameViewedCardState(state, path) {
  return path === state.path ? state : { ...state, path };
}
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

// src/card-focus.ts
function deckCardFocus(path) {
  return { surface: "deck", path };
}
function deskCardFocus(path, pileId) {
  return { surface: "desk", path, pileId };
}
function viewedCardFocus(path, pileId) {
  return pileId === void 0 ? { surface: "viewed", path } : { surface: "viewed", path, pileId };
}
function moveDeckFocusWithAnchor(focus, path) {
  return focus?.surface === "deck" ? deckCardFocus(path) : focus;
}
function renameCardFocus(focus, oldPath, newPath) {
  if (focus === null) {
    return null;
  }
  if (focus.path === oldPath) {
    return { ...focus, path: newPath };
  }
  const prefix = `${oldPath.replace(/\/$/, "")}/`;
  return focus.path.startsWith(prefix) ? { ...focus, path: `${newPath}${focus.path.slice(oldPath.length)}` } : focus;
}
function cardFocusDeleted(focus, deletedPath) {
  if (focus === null) {
    return false;
  }
  const prefix = `${deletedPath.replace(/\/$/, "")}/`;
  return focus.path === deletedPath || focus.path.startsWith(prefix);
}

// src/pile-navigation.ts
function pileTarget(pileId) {
  return { surface: "desk", pileId };
}
function cyclePileFocusTarget(pileIds, current, deckAvailable, direction) {
  if (pileIds.length === 0) {
    return null;
  }
  const targets = [
    ...deckAvailable ? [{ surface: "deck" }] : [],
    ...pileIds.map(pileTarget)
  ];
  const currentIndex = targets.findIndex(
    (target) => target.surface === current?.surface && (target.surface === "deck" || current?.surface === "desk" && target.pileId === current.pileId)
  );
  if (currentIndex < 0) {
    return direction === 1 ? targets[0] ?? null : targets[targets.length - 1] ?? null;
  }
  const targetIndex = (currentIndex + direction + targets.length) % targets.length;
  return targets[targetIndex] ?? null;
}
function swapPileFocusTarget(pileIds, current, lastFocusedPileId, deckAvailable) {
  if (pileIds.length === 0) {
    return null;
  }
  if (current.surface === "desk") {
    return deckAvailable ? { surface: "deck" } : null;
  }
  const fallback = pileIds[0];
  if (fallback === void 0) {
    return null;
  }
  const remembered = lastFocusedPileId === null ? void 0 : pileIds.find((pileId) => pileId === lastFocusedPileId);
  return pileTarget(remembered ?? fallback);
}
function wrappedPileCardNeighbour(pile, cardRef, direction) {
  const index = pile.cards.findIndex((card) => card.cardRef === cardRef);
  if (index < 0 || pile.cards.length === 0) {
    return null;
  }
  const targetIndex = (index + direction + pile.cards.length) % pile.cards.length;
  return pile.cards[targetIndex]?.cardRef ?? null;
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
var VIEWED_CARD_DRAG_THRESHOLD_PX = 5;
var PENDING_COMMAND_ACTIONS = /* @__PURE__ */ new Set([
  "find-address-forward",
  "find-address-backward",
  "find-address-first",
  "pull-into-pile"
]);
var inlineEditStatusSequence = 0;
var DeckView = class _DeckView extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.cardFooters = new CardFooterManager({
      app: this.app,
      leaf: this.leaf,
      hoverSource: DECK_VIEW_TYPE,
      isInTray: (file) => this.plugin.isFileInTray(file),
      runAction: (action, target) => this.runAction(action, target),
      runAfterEditing: (reason, action) => {
        void this.runAfterInlineEditing(reason, action);
      }
    });
    this.trayRenderer = new TrayRenderer(this.app, this.plugin, {
      jumpToFiledCard: (path) => this.jumpToPath(path),
      updateFilingInput: (value) => this.updateFilingInput(value),
      confirmFiling: () => void this.confirmFiling(),
      cancelFiling: () => void this.cancelFiling(),
      previewFilingPlacement: () => void this.previewFilingPlacement(),
      filingInputFocusChanged: (focused) => {
        this.setDeckKeybindingsSuspended(focused);
        if (focused) {
          this.restoreFilingSourceFocus();
        }
      },
      focusViewedCard: () => this.focusViewedCard(),
      focusDeskCard: (path, pileId) => this.focusDeskCard(path, pileId),
      isDeskCardFocused: (path, pileId) => this.cardFocus?.surface === "desk" && this.cardFocus.path === path && this.cardFocus.pileId === pileId,
      canRunAction: (action) => this.canRunAction(action),
      runAction: (action) => this.runAction(action),
      runAfterEditing: (reason, action) => this.runAfterInlineEditing(reason, action)
    });
    this.registerEvent(
      this.app.workspace.on("css-change", () => this.cardFooters.scheduleLayout())
    );
    this.scope = new import_obsidian4.Scope(this.app.scope);
    this.updateKeybindings();
  }
  /**
   * Slipbox is a static surface, not a navigable one.
   *
   * Leaving this at the default lets Obsidian navigate the Slipbox leaf away,
   * which is what an Escape arriving from a modal does, and what makes
   * `getLeaf(false)` treat the Slipbox leaf as reusable when opening a note.
   * The Deck's own Escape containment cannot prevent the first case, because
   * neither the view scope nor the content-element listener receives a
   * keystroke while a modal holds focus.
   */
  navigation = false;
  activePath = null;
  cardFocus = null;
  lastFocusedPileId = null;
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
  deckMapEl = null;
  deckMapRailEl = null;
  deckMapSectionLayerEl = null;
  deckMapBookmarkLayerEl = null;
  deckMapActiveMarkerEl = null;
  deckMapBookmarkMarkerEls = /* @__PURE__ */ new Map();
  deckMapSections = [];
  deckMapBookmarkCount = 0;
  resizeObserver = null;
  cardHeaderButtonControllers = /* @__PURE__ */ new Set();
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
  deckMapVisibility = DEFAULT_DECK_MAP_VISIBILITY;
  inlineEdit = null;
  inlineEditFinalization = new InlineEditFinalizationCoordinator();
  inlineEditStarting = false;
  renderRefreshDeferred = false;
  viewedCard = null;
  viewedCardEl = null;
  viewedCardBodyEl = null;
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
      if (this.handleDeckEscape(event)) {
        return;
      }
      if (this.filingFile !== null && event.key === "Tab" && event.shiftKey && event.target !== this.trayRenderer.filingInput) {
        event.preventDefault();
        this.restoreFilingSourceFocus();
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
          returnTarget: editing.returnTarget,
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
    this.clearCardHeaderButtonControllers();
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
    this.viewedCard = null;
    this.viewedCardEl = null;
    this.viewedCardBodyEl = null;
    this.cardFocus = null;
    this.lastFocusedPileId = null;
    this.spaceOffsetX = 0;
    this.spaceOffsetY = 0;
    this.renderedCards = [];
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
  }
  onResize() {
    this.scheduleCardPositioning();
    this.cardFooters.scheduleLayout();
    this.updateDeckMapSectionLabels();
    this.constrainViewedCard();
  }
  get activeCard() {
    if (this.activePath === null) {
      return null;
    }
    return this.plugin.index.filedByPath(this.activePath) ?? null;
  }
  get focusedCardFile() {
    return this.cardFocus === null ? null : this.plugin.index.fileAtPath(this.cardFocus.path) ?? null;
  }
  get focusedFiledCard() {
    const file = this.focusedCardFile;
    return file === null ? null : this.plugin.index.filedByFile(file) ?? null;
  }
  get cardFocusState() {
    return this.cardFocus;
  }
  get focusedDeckCardPath() {
    return this.cardFocus?.surface === "deck" ? this.cardFocus.path : null;
  }
  assignCardFocus(focus) {
    this.cardFocus = focus;
    if (focus?.surface === "desk" && focus.pileId !== void 0) {
      this.lastFocusedPileId = focus.pileId;
    }
  }
  setCardFocus(focus) {
    this.assignCardFocus(focus);
    this.applyCardFocusClasses();
  }
  focusDeskCard(path, pileId) {
    this.setCardFocus(deskCardFocus(path, pileId));
  }
  /**
   * Focus a card that is currently placed on the Desk.
   *
   * Call this only after the Desk has been rendered, so that the focus classes
   * land on a mounted card. Returns false when the path is not on the Desk.
   */
  focusDeskCardAtPath(path) {
    const position = cardPosition(this.plugin.tray, path);
    if (position === null) {
      return false;
    }
    this.focusDeskCard(path, position.pileId);
    return true;
  }
  focusDeckCard(path) {
    if (this.plugin.index.filedByPath(path) === void 0) {
      return;
    }
    if (path !== this.activePath) {
      this.selectCardWithoutMoving(path);
    }
    this.setCardFocus(deckCardFocus(path));
  }
  viewedCardReturnTargetForFocus() {
    if (this.cardFocus?.surface === "deck") {
      return { surface: "deck" };
    }
    if (this.cardFocus?.surface === "desk" && this.cardFocus.pileId !== void 0) {
      return { surface: "desk", pileId: this.cardFocus.pileId };
    }
    return null;
  }
  pileFocusLocation() {
    if (this.cardFocus?.surface === "deck") {
      return { surface: "deck" };
    }
    if (this.cardFocus?.surface === "desk" && this.cardFocus.pileId !== void 0) {
      return { surface: "desk", pileId: this.cardFocus.pileId };
    }
    return null;
  }
  focusPileNavigationTarget(target) {
    if (target.surface === "deck") {
      if (this.activePath !== null) {
        this.setCardFocus(deckCardFocus(this.activePath));
      }
      return;
    }
    const pile = this.plugin.tray.piles.find(
      (candidate) => candidate.id === target.pileId
    );
    const top = pile?.cards[0];
    if (pile !== void 0 && top !== void 0) {
      this.setCardFocus(deskCardFocus(top.cardRef, pile.id));
    }
  }
  cyclePileFocus(direction) {
    const target = cyclePileFocusTarget(
      this.plugin.tray.piles.map((pile) => pile.id),
      this.pileFocusLocation(),
      this.activePath !== null,
      direction
    );
    if (target !== null) {
      this.focusPileNavigationTarget(target);
    }
  }
  swapDeckPileFocus() {
    const current = this.pileFocusLocation();
    if (current === null) {
      return;
    }
    const target = swapPileFocusTarget(
      this.plugin.tray.piles.map((pile) => pile.id),
      current,
      this.lastFocusedPileId,
      this.activePath !== null
    );
    if (target !== null) {
      this.focusPileNavigationTarget(target);
    }
  }
  toggleFocusedPile() {
    if (this.cardFocus?.surface !== "desk" || this.cardFocus.pileId === void 0) {
      return;
    }
    const pileId = this.cardFocus.pileId;
    if (!this.plugin.tray.piles.some((pile) => pile.id === pileId)) {
      return;
    }
    const expanded = this.plugin.tray.expandedPileIds.includes(pileId);
    void this.plugin.setTrayPileExpanded(pileId, !expanded);
  }
  moveFocusWithinPile(direction) {
    if (this.cardFocus?.surface !== "desk" || this.cardFocus.pileId === void 0) {
      return;
    }
    const pile = this.plugin.tray.piles.find(
      (candidate) => candidate.id === this.cardFocus?.pileId
    );
    if (pile === void 0) {
      return;
    }
    if (!this.plugin.tray.expandedPileIds.includes(pile.id)) {
      const next = cyclePileTopCard(this.plugin.tray, pile.id, direction);
      if (next !== this.plugin.tray) {
        void this.plugin.updateTray(next);
      }
      return;
    }
    const target = wrappedPileCardNeighbour(pile, this.cardFocus.path, direction);
    if (target !== null) {
      this.setCardFocus(deskCardFocus(target, pile.id));
    }
  }
  setDeckAnchor(path) {
    this.activePath = path;
    this.cardFocus = moveDeckFocusWithAnchor(this.cardFocus, path);
  }
  applyCardFocusClasses() {
    for (const card of this.renderedCards) {
      const path = card.dataset.path;
      card.toggleClass("is-deck-anchor", path === this.activePath);
      card.toggleClass(
        "is-card-focused",
        path !== void 0 && this.cardFocus?.surface === "deck" && this.cardFocus.path === path
      );
    }
    this.stageEl?.querySelectorAll(".slipbox-tray-card").forEach((card) => {
      const path = card.dataset.cardRef;
      const pileId = card.dataset.pileId;
      card.toggleClass(
        "is-card-focused",
        !card.hasClass("is-viewed-ghost") && path !== void 0 && pileId !== void 0 && this.cardFocus?.surface === "desk" && this.cardFocus.path === path && this.cardFocus.pileId === pileId
      );
    });
    if (this.viewedCardEl !== null) {
      this.viewedCardEl.toggleClass(
        "is-card-focused",
        this.viewedCard !== null && this.cardFocus?.surface === "viewed" && this.cardFocus.path === this.viewedCard.path
      );
    }
  }
  reconcileCardFocus() {
    const focus = this.cardFocus;
    if (focus?.surface === "deck" && this.activePath !== null) {
      this.cardFocus = deckCardFocus(this.activePath);
      return;
    }
    if (focus?.surface === "viewed" && this.viewedCard?.path === focus.path && this.plugin.index.fileAtPath(focus.path) !== void 0) {
      return;
    }
    if (focus?.surface === "desk") {
      const pile = this.plugin.tray.piles.find(
        (candidate) => candidate.id === focus.pileId
      );
      const index = pile?.cards.findIndex((card) => card.cardRef === focus.path) ?? -1;
      if (pile !== void 0 && index >= 0) {
        if (this.plugin.tray.expandedPileIds.includes(pile.id) || index === 0) {
          return;
        }
        const top = pile.cards[0];
        if (top !== void 0) {
          this.assignCardFocus(deskCardFocus(top.cardRef, pile.id));
          return;
        }
      }
    }
    if (this.activePath !== null) {
      this.cardFocus = deckCardFocus(this.activePath);
      return;
    }
    const firstPile = this.plugin.tray.piles[0];
    const firstCard = firstPile?.cards[0];
    this.assignCardFocus(firstPile !== void 0 && firstCard !== void 0 ? deskCardFocus(firstCard.cardRef, firstPile.id) : null);
  }
  get isFiling() {
    return this.filingFile !== null;
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
    this.cardFocus = renameCardFocus(this.cardFocus, oldPath, newPath);
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
    const viewed = this.viewedCard;
    if (viewed !== null) {
      const renamedPath = renamePathReference(viewed.path, oldPath, newPath);
      if (renamedPath !== viewed.path) {
        this.viewedCard = renameViewedCardState(viewed, renamedPath);
        if (this.viewedCardEl !== null) {
          this.viewedCardEl.dataset.path = renamedPath;
        }
        const component = this.renderComponents.get(viewed.path);
        if (component !== void 0) {
          this.renderComponents.delete(viewed.path);
          this.renderComponents.set(renamedPath, component);
        }
      }
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
    if (cardFocusDeleted(this.cardFocus, deletedPath)) {
      this.cardFocus = null;
    }
    for (const path of this.cardScrollPositions.keys()) {
      if (pathIsAtOrBelow(path, deletedPath)) {
        this.cardScrollPositions.delete(path);
      }
    }
    if (this.filingSourcePath !== null && pathIsAtOrBelow(this.filingSourcePath, deletedPath)) {
      this.clearFilingPlacement();
      this.filingMessage = "The source card no longer exists.";
    }
    if (this.viewedCard !== null && pathIsAtOrBelow(this.viewedCard.path, deletedPath) && this.viewedCard.path !== editingPath) {
      this.viewedCard = null;
      this.viewedCardEl = null;
      this.viewedCardBodyEl = null;
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
    const escapeHandler = scope.register([], "Escape", (event) => {
      return this.handleDeckEscape(event) ? false : void 0;
    });
    this.keymapHandlers.push(escapeHandler);
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
  handleDeckEscape(event) {
    if (this.app.workspace.getActiveViewOfType(_DeckView) !== this) {
      return false;
    }
    const action = resolveDeckEscapeAction(event, {
      editing: this.inlineEdit !== null,
      pendingCommand: this.pendingCommand.kind !== "idle",
      filing: this.filingFile !== null && !this.filingConfirmationInProgress
    });
    if (action === null) {
      return false;
    }
    consumeDeckEscape(event);
    if (action === "finish-editing") {
      void this.finishInlineEditing("escape");
    } else if (action === "cancel-pending-command") {
      this.handleDeckCommandContinuation(event);
    } else if (action === "cancel-filing") {
      void this.cancelFiling();
    }
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
    const active = this.activeCard;
    const activeIndex = active === null ? -1 : this.plugin.index.filedIndexForPath(active.path);
    const needsBookmarkTarget = action === "previous-bookmark" || action === "next-bookmark";
    const bookmarkIndices = needsBookmarkTarget && activeIndex >= 0 ? this.bookmarkIndices() : [];
    const focusedFile = target?.file ?? this.focusedCardFile;
    const focusedFiled = target ?? this.focusedFiledCard;
    const focusedSurface = target === void 0 ? this.cardFocus?.surface ?? null : "deck";
    const focusedPosition = focusedFile === null ? null : cardPosition(this.plugin.tray, focusedFile.path);
    const focusedDeskPosition = focusedSurface === "desk" ? focusedPosition : null;
    return canRunDeckAction(action, {
      hasActiveCard: activeIndex >= 0,
      hasPreviousCard: activeIndex > 0,
      hasNextCard: activeIndex >= 0 && activeIndex < filed.length - 1,
      hasPreviousBookmark: action === "previous-bookmark" && adjacentBookmarkIndex(bookmarkIndices, activeIndex, -1) !== null,
      hasNextBookmark: action === "next-bookmark" && adjacentBookmarkIndex(bookmarkIndices, activeIndex, 1) !== null,
      hasProblems: this.plugin.index.snapshot.issues.length > 0,
      filing: this.filingFile !== null,
      hasFocusedCard: focusedFile !== null,
      focusedCardFiled: focusedFiled !== null,
      focusedCardUnfiled: focusedFile !== null && focusedFiled === null && this.cardFocus?.surface !== "deck",
      focusedSurface,
      focusedCardOnDesk: focusedPosition !== null,
      canMoveDeskCardLeft: focusedDeskPosition !== null && focusedDeskPosition.cardIndex > 0,
      canMoveDeskCardRight: focusedDeskPosition !== null && focusedDeskPosition.cardIndex < focusedDeskPosition.pileSize - 1,
      hasDeskPiles: this.plugin.tray.piles.length > 0,
      hasExpandedPiles: this.plugin.tray.expandedPileIds.length > 0,
      hasFiledDeskCards: trayHasFiledCards(this.plugin.tray)
    });
  }
  runAction(action, target) {
    if (target !== void 0) {
      this.focusDeckCard(target.path);
    }
    if (!this.canRunAction(action, target)) {
      return false;
    }
    const file = target?.file ?? this.focusedCardFile;
    const card = target ?? this.focusedFiledCard;
    return dispatchInlineAwareDeckAction(
      {
        editing: this.inlineEdit !== null,
        starting: this.inlineEditStarting
      },
      (semanticAction) => this.runAfterInlineEditing(
        `deck-action:${action}`,
        semanticAction
      ),
      () => this.performAction(action, file, card)
    );
  }
  performAction(action, file, card) {
    switch (action) {
      case "previous-card":
        this.moveBy(-1);
        break;
      case "next-card":
        this.moveBy(1);
        break;
      case "previous-bookmark":
        this.jumpToAdjacentBookmark(-1);
        break;
      case "next-bookmark":
        this.jumpToAdjacentBookmark(1);
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
        if (file !== null) {
          void this.plugin.openMarkdownFile(file);
        }
        break;
      case "copy-link":
        if (card !== null) {
          void this.plugin.copyCardLink(card);
        }
        break;
      case "toggle-tray":
        if (card !== null) {
          if (this.cardFocus?.surface === "desk" && this.plugin.isFileInTray(card.file)) {
            this.setDeckAnchor(card.path);
            this.cardFocus = deckCardFocus(card.path);
            this.viewportOffset = 0;
          }
          void this.plugin.toggleFileInTray(card.file);
        }
        break;
      case "toggle-bookmark":
        if (card !== null) {
          void this.toggleCardBookmark(card.path);
        }
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
      case "next-pile":
        this.cyclePileFocus(1);
        break;
      case "previous-pile":
        this.cyclePileFocus(-1);
        break;
      case "swap-deck-pile":
        this.swapDeckPileFocus();
        break;
      case "toggle-pile":
        this.toggleFocusedPile();
        break;
      case "previous-card-in-pile":
        this.moveFocusWithinPile(-1);
        break;
      case "next-card-in-pile":
        this.moveFocusWithinPile(1);
        break;
      case "toggle-deck-map":
        this.deckMapVisibility = toggleDeckMapVisibility(
          this.deckMapVisibility,
          this.plugin.settings.showDeckMap
        );
        this.applyDeckMapVisibility();
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
      case "edit-card":
        if (file !== null) {
          void this.editCardOnDesk(file);
        }
        break;
      case "show-card-in-deck":
        if (card !== null) {
          void this.showFocusedCardInDeck(card.path);
        }
        break;
      case "toggle-viewed-card":
        if (this.cardFocus?.surface === "viewed") {
          void this.closeViewedCard();
        } else if (file !== null) {
          const returnTarget = this.viewedCardReturnTargetForFocus();
          if (returnTarget !== null) {
            void this.viewCard(file, returnTarget, false);
          }
        }
        break;
      case "file-card":
        if (file !== null) {
          if (this.cardFocus?.surface === "viewed") {
            void this.beginFilingViewedCard(file);
          } else {
            void this.startFiling(file);
          }
        }
        break;
      case "move-desk-card-left":
        if (this.cardFocus?.surface === "desk") {
          void this.moveTrayCardBy(this.cardFocus.path, -1);
        }
        break;
      case "move-desk-card-right":
        if (this.cardFocus?.surface === "desk") {
          void this.moveTrayCardBy(this.cardFocus.path, 1);
        }
        break;
      case "delete-card":
        if (file !== null) {
          void this.deleteFocusedCard(file);
        }
        break;
      case "collapse-all-piles":
        void this.plugin.updateTray(collapseAllPiles(this.plugin.tray));
        break;
      case "return-all-filed-cards":
        if (card !== null && this.cardFocus?.surface === "desk" && this.plugin.isFileInTray(card.file)) {
          this.setDeckAnchor(card.path);
          this.cardFocus = deckCardFocus(card.path);
          this.viewportOffset = 0;
        }
        void this.plugin.clearTray();
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
    this.reconcileCardFocus();
    if (this.activePath !== previousActivePath) {
      this.viewportOffset = 0;
    }
    this.clampViewportOffset();
    await this.renderDeck(this.filingFile === null || restoreFilingInputFocus);
  }
  async startFiling(file) {
    const trayPosition = cardPosition(this.plugin.tray, file.path);
    if (trayPosition !== null) {
      this.assignCardFocus(deskCardFocus(file.path, trayPosition.pileId));
    }
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
    new import_obsidian4.Notice("Filing cancelled. The card remains in its pile.");
  }
  async handleDeckOrderingChanged() {
    const restoreFilingInputFocus = this.trayRenderer.isFilingInputFocused;
    this.recalculateFilingPreview();
    this.viewportOffset = 0;
    await this.renderDeck(restoreFilingInputFocus);
  }
  handleCardSpreadChanged() {
    this.positionCards();
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl);
    }
    this.scheduleCardPositioning();
  }
  async goToPath(path) {
    await this.navigateToPath(path);
  }
  async jumpToPath(path) {
    if (this.plugin.index.filedByPath(path) === void 0) {
      new import_obsidian4.Notice(`Card ${path} is missing or invalid.`);
      return;
    }
    await this.navigateToPath(path);
  }
  jumpToAdjacentBookmark(direction) {
    const activeIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const targetIndex = adjacentBookmarkIndex(
      this.bookmarkIndices(),
      activeIndex,
      direction
    );
    const target = targetIndex === null ? void 0 : this.plugin.index.snapshot.filed[targetIndex];
    if (target !== void 0) {
      void this.jumpToPath(target.path);
    }
  }
  async addBookmarkToCurrent() {
    const path = this.focusedDeckCardPath;
    if (path === null) {
      new import_obsidian4.Notice("Focus a Deck card before adding a bookmark.");
      return;
    }
    const bookmarkedPaths = this.bookmarkedPaths();
    bookmarkedPaths.add(path);
    this.updateBookmarkUi(bookmarkedPaths);
    await this.plugin.addBookmark(path);
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
      if (this.viewedCard?.path === path && this.viewedCardEl !== null) {
        this.viewedCardEl.focus({ preventScroll: true });
      } else {
        this.contentEl.focus({ preventScroll: true });
      }
    }
    return true;
  }
  async runAfterInlineEditing(reason, action) {
    return runAfterInlineEditing(
      () => this.finishInlineEditing(reason),
      action
    );
  }
  async viewCard(file, returnTarget, editImmediately) {
    if (this.filingFile !== null) {
      new import_obsidian4.Notice("Finish filing before viewing another card.");
      return;
    }
    if (this.viewedCard?.path !== file.path) {
      const viewed = await this.runAfterInlineEditing(
        "view-card",
        async () => {
          this.rememberViewedCardScroll();
          this.viewedCard = createViewedCardState(file.path, returnTarget);
          await this.renderDeck(false);
        }
      );
      if (!viewed) {
        return;
      }
    }
    this.focusViewedCard();
    if (editImmediately && this.viewedCardBodyEl !== null) {
      await this.beginInlineEditing(file, this.viewedCardBodyEl);
    }
  }
  async editCardOnDesk(file) {
    if (this.cardFocus?.surface === "deck" && this.plugin.isFileInTray(file)) {
      return;
    }
    if (this.filingFile !== null) {
      new import_obsidian4.Notice("Finish filing before editing a card body.");
      return;
    }
    if (!await this.plugin.putFileOnDesk(file)) {
      return;
    }
    let position = cardPosition(this.plugin.tray, file.path);
    if (position === null) {
      new import_obsidian4.Notice("Could not find the card on the Desk.");
      return;
    }
    if (position.cardIndex > 0 && !this.plugin.tray.expandedPileIds.includes(position.pileId)) {
      await this.plugin.setTrayPileExpanded(position.pileId, true);
      position = cardPosition(this.plugin.tray, file.path);
      if (position === null) {
        new import_obsidian4.Notice("Could not find the card on the Desk.");
        return;
      }
    }
    const returnTarget = {
      surface: "desk",
      pileId: position.pileId
    };
    if (this.viewedCard?.path !== file.path) {
      await this.viewCard(file, returnTarget, true);
      return;
    }
    const retargeted = retargetViewedCardState(this.viewedCard, returnTarget);
    if (retargeted !== this.viewedCard) {
      this.viewedCard = retargeted;
      await this.renderDeck(false);
    }
    this.focusViewedCard();
    await this.beginInlineEditing(file, this.viewedCardBodyEl);
  }
  async closeViewedCard() {
    const viewed = this.viewedCard;
    if (viewed === null) {
      return;
    }
    await this.runAfterInlineEditing("close-viewed-card", async () => {
      this.viewedCard = null;
      this.viewedCardEl = null;
      this.viewedCardBodyEl = null;
      const position = cardPosition(this.plugin.tray, viewed.path);
      const returnTarget = resolveViewedCardReturnTarget(
        viewed,
        this.plugin.index.filedByPath(viewed.path) !== void 0,
        position?.pileId
      );
      if (returnTarget?.surface === "deck") {
        this.setDeckAnchor(viewed.path);
        this.assignCardFocus(deckCardFocus(viewed.path));
        this.viewportOffset = 0;
      } else if (returnTarget?.surface === "desk") {
        this.assignCardFocus(deskCardFocus(viewed.path, returnTarget.pileId));
      } else {
        this.assignCardFocus(null);
        this.reconcileCardFocus();
      }
      await this.renderDeck(false);
      const deskCard = returnTarget?.surface === "desk" ? this.stageEl?.querySelector(
        `.slipbox-tray-card[data-card-ref="${CSS.escape(viewed.path)}"]`
      ) ?? null : null;
      (deskCard ?? this.contentEl).focus({ preventScroll: true });
    });
  }
  async beginInlineEditing(file, bodySurface, restored) {
    if (this.filingFile !== null) {
      new import_obsidian4.Notice("Finish filing before editing a card body.");
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
      new import_obsidian4.Notice(`Could not start inline editing: ${errorMessage(error)}`);
    } finally {
      this.inlineEditStarting = false;
    }
  }
  mountInlineEditing(file, baseBody, requestedBodySurface, restoredRenderedScrollTop) {
    const returnTarget = this.viewedCard?.path === file.path ? this.viewedCard.returnTarget : null;
    const bodyEl = requestedBodySurface;
    const cardEl = bodyEl?.closest(".slipbox-card") ?? null;
    if (returnTarget === null || bodyEl === null || cardEl === null) {
      throw new Error("The viewed card surface is unavailable");
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
      returnTarget,
      textarea,
      statusEl,
      bodyEl,
      cardEl,
      renderedScrollTop
    };
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
    new import_obsidian4.Notice(`${detail} Your draft remains in the card and can be copied.`);
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
  async rerenderEditedPath(file, target, scrollTop) {
    if (!target.isConnected) {
      return;
    }
    target.empty();
    target.removeClasses(["is-inline-editing", "has-inline-edit-error"]);
    target.addClass("markdown-rendered");
    if (this.viewedCard?.path === file.path && target.closest(".slipbox-viewed-card") !== null) {
      this.viewedCard = scrollViewedCardState(this.viewedCard, scrollTop);
      await this.renderViewedMarkdownCard(file, target, this.renderVersion);
      target.scrollTop = scrollTop;
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    if (filed === void 0) {
      return;
    }
    this.cardScrollPositions.set(file.path, scrollTop);
    await this.renderMarkdownCard(filed, target, this.renderVersion);
    target.scrollTop = scrollTop;
  }
  async restoreDetachedInlineEdit() {
    const draft = this.plugin.takeDetachedInlineEdit();
    if (draft === null) {
      return;
    }
    const file = this.plugin.index.fileAtPath(draft.path) ?? draft.file;
    this.viewedCard = createViewedCardState(draft.path, draft.returnTarget);
    const position = cardPosition(this.plugin.tray, draft.path);
    this.cardFocus = viewedCardFocus(draft.path, position?.pileId);
    await this.renderDeck(false);
    await this.beginInlineEditing(file, this.viewedCardBodyEl, {
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
      new import_obsidian4.Notice(`Card ${path} is missing or invalid.`);
      return false;
    }
    this.cancelViewportCentering();
    this.setDeckAnchor(path);
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
  async showFocusedCardInDeck(path) {
    this.cardFocus = deckCardFocus(path);
    await this.jumpToPath(path);
    this.contentEl.focus({ preventScroll: true });
    this.applyCardFocusClasses();
  }
  async deleteFocusedCard(file) {
    const focus = this.cardFocus;
    const filed = this.plugin.index.snapshot.filed;
    const deckIndex = this.plugin.index.filedIndexForPath(file.path);
    const nextDeckPath = deckIndex < 0 ? this.activePath : filed[deckIndex + 1]?.path ?? filed[deckIndex - 1]?.path ?? null;
    const position = cardPosition(this.plugin.tray, file.path);
    const pile = position === null ? void 0 : this.plugin.tray.piles[position.pileIndex];
    const nextDeskPath = position === null || pile === void 0 ? null : pile.cards[position.cardIndex + 1]?.cardRef ?? pile.cards[position.cardIndex - 1]?.cardRef ?? null;
    if (!await this.plugin.deleteCard(file)) {
      return;
    }
    if (focus?.path !== file.path) {
      return;
    }
    if (focus.surface !== "deck" && nextDeskPath !== null && position !== null) {
      this.assignCardFocus(deskCardFocus(nextDeskPath, position.pileId));
    } else if (nextDeckPath !== null) {
      this.setDeckAnchor(nextDeckPath);
      this.cardFocus = deckCardFocus(nextDeckPath);
      this.viewportOffset = 0;
    } else {
      this.cardFocus = null;
    }
    this.applyCardFocusClasses();
  }
  async renderDeck(focusFilingInput = true) {
    if (this.inlineEdit !== null || this.inlineEditStarting) {
      this.renderRefreshDeferred = true;
      return;
    }
    const version = ++this.renderVersion;
    this.rememberScrollPositions();
    this.rememberViewedCardScroll();
    if (this.viewedCard !== null && this.plugin.index.fileAtPath(this.viewedCard.path) === void 0) {
      this.viewedCard = null;
    }
    this.unloadRenderComponents();
    this.cardFooters.clear();
    this.trayRenderer.clear();
    this.clearCardHeaderButtonControllers();
    this.contentEl.empty();
    this.renderedCards = [];
    this.deckMapEl = null;
    this.deckMapRailEl = null;
    this.deckMapSectionLayerEl = null;
    this.deckMapBookmarkLayerEl = null;
    this.deckMapActiveMarkerEl = null;
    this.deckMapBookmarkMarkerEls.clear();
    this.deckMapSections = [];
    this.deckMapBookmarkCount = 0;
    this.pendingCommandEl = null;
    this.viewedCardEl = null;
    this.viewedCardBodyEl = null;
    this.contentEl.dataset.mainCardSize = this.plugin.settings.mainCardSize;
    this.contentEl.dataset.trayCardSize = this.plugin.settings.trayCardSize;
    const shell = this.contentEl.createDiv({ cls: "slipbox-deck-shell" });
    this.renderDeckMap(shell);
    this.renderPendingCommandStatus(shell);
    this.applyDeckMapVisibility();
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
      this.viewedCard?.path ?? null,
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
    await this.renderViewedCard(stage, version);
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
      const card = filed[index];
      marker.toggleClass(
        "is-in-tray",
        card !== void 0 && this.plugin.isFileInTray(card.file)
      );
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
  applyDeckMapVisibility() {
    applyDeckMapVisibility(
      this.deckMapEl,
      this.deckMapVisibility,
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
    const card = this.focusedFiledCard;
    if (card === null) {
      this.clearPendingCommand();
      this.showCommandFeedback("There is no focused filed card.");
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
      this.showCommandFeedback(`The focused card is already in pile ${ordinal}.`);
      return;
    }
    this.showCommandFeedback(
      source === null ? `Put the focused card into pile ${ordinal}.` : `Moved the focused card to pile ${ordinal}.`
    );
    const targetPile = this.plugin.tray.piles[ordinal - 1];
    if (targetPile !== void 0) {
      this.assignCardFocus(deskCardFocus(card.path, targetPile.id));
    }
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
      const card = this.plugin.index.filedByPath(path);
      marker.toggleClass(
        "is-in-tray",
        card !== void 0 && this.plugin.isFileInTray(card.file)
      );
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
    const summary = `Deck anchor ${activeIndex + 1} of ${cardCount}; ${bookmarkLabel}`;
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
      Math.max(3, Math.ceil(1 / this.plugin.settings.cardSpread) + 2)
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
      cardEl.toggleClass("is-deck-anchor", filedIndex === activeIndex);
      cardEl.toggleClass(
        "is-card-focused",
        this.cardFocus?.surface === "deck" && this.cardFocus.path === card.path
      );
      cardEl.addEventListener("focusin", () => this.focusDeckCard(card.path));
      const isViewed = this.viewedCard?.path === card.path;
      cardEl.toggleClass("is-viewed-ghost", isViewed);
      const isBookmarked = this.plugin.bookmarkAtPath(card.path) !== void 0;
      cardEl.toggleClass("is-bookmarked", isBookmarked);
      const isInTray = this.plugin.isFileInTray(card.file);
      cardEl.toggleClass("is-in-tray", isInTray);
      const title = this.plugin.cardTitle(card.file);
      const cardLabel = `${card.address} \xB7 ${title}${isInTray ? "; pulled out into a working pile" : ""}`;
      cardEl.setAttr("aria-label", cardLabel);
      (0, import_obsidian4.setTooltip)(cardEl, cardLabel, {
        placement: "bottom",
        delay: 350
      });
      cardEl.style.zIndex = String(
        cardStackOrder(filedIndex, focusDisplayIndex)
      );
      this.renderedCards.push(cardEl);
      if (isViewed) {
        cardEl.setAttr(
          "aria-label",
          `${card.address} \xB7 ${title}; viewed card placeholder. Activate to focus the viewed card.`
        );
        const ghost = cardEl.createEl("button", {
          cls: "clickable-icon slipbox-card-ghost-control",
          attr: {
            type: "button",
            "aria-label": `Focus viewed card ${title}`
          }
        });
        (0, import_obsidian4.setIcon)(ghost, "search");
        (0, import_obsidian4.setTooltip)(ghost, "Focus viewed card", {
          placement: "bottom",
          delay: 250
        });
        ghost.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.focusViewedCard();
        });
        cardEl.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.focusViewedCard();
        });
        cardEl.addEventListener("contextmenu", (event) => {
          this.focusViewedCard();
          this.plugin.showCardContextMenu(
            event,
            card.file,
            card.address,
            "viewed",
            DECK_VIEW_TYPE,
            this.leaf,
            this.viewedCard?.returnTarget.surface ?? null
          );
        });
        continue;
      }
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
      this.cardHeaderButtonControllers.add(renderCardHeaderButtons({
        container: cardActions,
        context: {
          surface: "deck",
          viewedReturnSurface: null,
          filed: true,
          onDesk: isInTray,
          bookmarked: isBookmarked,
          canMoveLeft: false,
          canMoveRight: false
        },
        settings: this.plugin.settings.cardHeaderButtons,
        buttonClass: "slipbox-card-toggle",
        tooltipPlacement: "bottom",
        run: (action) => {
          this.runAction(action, card);
        }
      }));
      const scroll = frame.createDiv({ cls: "slipbox-card-scroll markdown-rendered" });
      scroll.scrollTop = this.cardScrollPositions.get(card.path) ?? 0;
      scroll.addEventListener("dblclick", (event) => {
        if (isInTray || !isInlineEditBodyTarget(event.target, scroll)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.focusDeckCard(card.path);
        void this.editCardOnDesk(card.file);
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
        this.focusDeckCard(card.path);
        this.plugin.showCardContextMenu(
          event,
          card.file,
          card.address,
          "deck",
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
          this.setCardFocus(deckCardFocus(card.path));
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void this.runAfterInlineEditing(
          "select-card",
          () => this.focusDeckCard(card.path)
        );
      });
    }
    this.positionCards();
    await Promise.all(jobs);
  }
  async renderViewedCard(stage, version) {
    const state = this.viewedCard;
    if (state === null) {
      return;
    }
    const file = this.plugin.index.fileAtPath(state.path);
    if (file === void 0) {
      this.viewedCard = null;
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    const address = filed?.address ?? "unfiled";
    const title = this.plugin.cardTitle(file);
    const layer = stage.createDiv({ cls: "slipbox-viewed-card-layer" });
    const card = layer.createDiv({
      cls: "slipbox-card slipbox-viewed-card",
      attr: {
        role: "group",
        tabindex: "0",
        "aria-label": `Viewed card ${address} \xB7 ${title}`
      }
    });
    card.toggleClass(
      "is-card-focused",
      this.cardFocus?.surface === "viewed" && this.cardFocus.path === file.path
    );
    card.addEventListener("focusin", () => {
      const position = cardPosition(this.plugin.tray, file.path);
      this.setCardFocus(viewedCardFocus(file.path, position?.pileId));
    });
    card.dataset.path = file.path;
    card.toggleClass("is-bookmarked", filed !== void 0 && this.plugin.bookmarkAtPath(filed.path) !== void 0);
    this.viewedCardEl = card;
    this.applyViewedCardPosition();
    const frame = card.createDiv({ cls: "slipbox-card-frame" });
    const addressRow = frame.createDiv({
      cls: "slipbox-card-address-row slipbox-viewed-card-drag-handle"
    });
    (0, import_obsidian4.setTooltip)(addressRow, "Drag to move viewed card", {
      placement: "top",
      delay: 500
    });
    const identity = addressRow.createDiv({ cls: "slipbox-card-header-identity" });
    identity.createSpan({ cls: "slipbox-card-address", text: address });
    const headerTitle = cardHeaderTitle(
      title,
      this.plugin.settings.showTitleInDeck
    );
    if (headerTitle !== null) {
      identity.createSpan({ cls: "slipbox-card-header-title", text: headerTitle });
    }
    const actions = addressRow.createDiv({ cls: "slipbox-card-actions" });
    const viewedPosition = cardPosition(this.plugin.tray, file.path);
    this.cardHeaderButtonControllers.add(renderCardHeaderButtons({
      container: actions,
      context: {
        surface: "viewed",
        viewedReturnSurface: state.returnTarget.surface,
        filed: filed !== void 0,
        onDesk: viewedPosition !== null,
        bookmarked: filed !== void 0 && this.plugin.bookmarkAtPath(filed.path) !== void 0,
        canMoveLeft: false,
        canMoveRight: false
      },
      settings: this.plugin.settings.cardHeaderButtons,
      buttonClass: "slipbox-card-toggle",
      tooltipPlacement: "bottom",
      run: (action) => {
        this.focusViewedCard();
        this.runAction(action);
      }
    }));
    const body = frame.createDiv({ cls: "slipbox-card-scroll markdown-rendered" });
    body.scrollTop = state.scrollTop;
    body.addEventListener("scroll", () => {
      if (this.viewedCard?.path === file.path) {
        this.viewedCard = scrollViewedCardState(this.viewedCard, body.scrollTop);
      }
    }, { passive: true });
    body.addEventListener("dblclick", (event) => {
      if (!isInlineEditBodyTarget(event.target, body)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.focusViewedCard();
      void this.editCardOnDesk(file);
    });
    this.viewedCardBodyEl = body;
    if (filed !== void 0) {
      this.cardFooters.render(frame, {
        sourcePath: filed.path,
        backlinks: this.plugin.index.backlinksForPath(filed.path),
        interactive: true,
        activate: (backlink) => this.jumpToPath(backlink.path)
      });
    }
    card.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("a, button, input, textarea, select") !== null) {
        return;
      }
      this.focusViewedCard();
      this.plugin.showCardContextMenu(
        event,
        file,
        filed?.address ?? null,
        "viewed",
        DECK_VIEW_TYPE,
        this.leaf,
        state.returnTarget.surface
      );
    });
    this.attachViewedCardDragging(addressRow, card);
    await this.renderViewedMarkdownCard(file, body, version);
    if (version !== this.renderVersion || this.viewedCardEl !== card) {
      return;
    }
    window.requestAnimationFrame(() => {
      if (this.viewedCardEl === card) {
        this.constrainViewedCard();
      }
    });
  }
  async renderViewedMarkdownCard(file, target, version) {
    this.renderComponents.get(file.path)?.unload();
    const component = new import_obsidian4.Component();
    component.load();
    this.renderComponents.set(file.path, component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (version !== this.renderVersion || this.viewedCard?.path !== file.path || this.renderComponents.get(file.path) !== component) {
        return;
      }
      await import_obsidian4.MarkdownRenderer.render(
        this.app,
        body,
        target,
        file.path,
        component
      );
      this.attachInternalLinkInteractions(target, file.path);
      target.scrollTop = this.viewedCard.scrollTop;
    } catch (error) {
      target.createEl("p", {
        cls: "slipbox-render-error",
        text: `Could not render this card: ${errorMessage(error)}`
      });
    }
  }
  attachViewedCardDragging(handle, card) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target instanceof Element && event.target.closest("button, a, input, textarea, select") !== null) {
        return;
      }
      const startState = this.viewedCard;
      if (startState === null) {
        return;
      }
      card.focus({ preventScroll: true });
      beginThresholdPointerDrag({
        captureTarget: handle,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        threshold: VIEWED_CARD_DRAG_THRESHOLD_PX,
        onDragStart: () => card.addClass("is-dragging"),
        onDragMove: (_moveEvent, dx, dy) => {
          if (this.viewedCard?.path !== startState.path) {
            return;
          }
          this.viewedCard = moveViewedCardState(
            this.viewedCard,
            startState.x + dx,
            startState.y + dy,
            this.viewedCardBounds(card)
          );
          this.applyViewedCardPosition();
        },
        onDrop: () => card.removeClass("is-dragging"),
        onCancel: () => {
          card.removeClass("is-dragging");
          if (this.viewedCard?.path === startState.path) {
            this.viewedCard = startState;
            this.applyViewedCardPosition();
          }
        }
      });
    });
  }
  viewedCardBounds(card) {
    const stage = this.stageEl;
    return {
      stageWidth: stage?.clientWidth ?? 0,
      stageHeight: stage?.clientHeight ?? 0,
      cardWidth: card.offsetWidth,
      cardHeight: card.offsetHeight
    };
  }
  applyViewedCardPosition() {
    const state = this.viewedCard;
    const card = this.viewedCardEl;
    if (state === null || card === null) {
      return;
    }
    card.style.setProperty("--slipbox-viewed-card-x", `${state.x}px`);
    card.style.setProperty("--slipbox-viewed-card-y", `${state.y}px`);
  }
  constrainViewedCard() {
    const state = this.viewedCard;
    const card = this.viewedCardEl;
    if (state === null || card === null) {
      return;
    }
    this.viewedCard = moveViewedCardState(
      state,
      state.x,
      state.y,
      this.viewedCardBounds(card)
    );
    this.applyViewedCardPosition();
  }
  focusViewedCard() {
    const viewed = this.viewedCard;
    if (viewed === null) {
      return;
    }
    const position = cardPosition(this.plugin.tray, viewed.path);
    this.setCardFocus(viewedCardFocus(viewed.path, position?.pileId));
    this.viewedCardEl?.focus({ preventScroll: true });
  }
  async beginFilingViewedCard(file) {
    await this.runAfterInlineEditing("viewed-file-card", async () => {
      const position = cardPosition(this.plugin.tray, file.path);
      this.viewedCard = null;
      this.viewedCardEl = null;
      this.viewedCardBodyEl = null;
      if (position !== null) {
        this.assignCardFocus(deskCardFocus(file.path, position.pileId));
      }
      await this.startFiling(file);
    });
  }
  clearCardHeaderButtonControllers() {
    for (const controller of this.cardHeaderButtonControllers) {
      controller.disconnect();
    }
    this.cardHeaderButtonControllers.clear();
  }
  async renderMarkdownCard(card, target, version) {
    this.renderComponents.get(card.path)?.unload();
    const component = new import_obsidian4.Component();
    component.load();
    this.renderComponents.set(card.path, component);
    try {
      const body = await this.plugin.index.readBody(card.file);
      if (version !== this.renderVersion || this.renderComponents.get(card.path) !== component) {
        return;
      }
      await import_obsidian4.MarkdownRenderer.render(
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
          const filed = internal ? resolveFiledCardLink((0, import_obsidian4.getLinkpath)(linkPath), sourcePath, {
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
    this.cardFocus = deckCardFocus(targetPath);
    await this.jumpToPath(targetPath);
    this.contentEl.focus({ preventScroll: true });
  }
  restoreFilingSourceFocus() {
    const path = this.filingSourcePath;
    if (path === null) {
      return;
    }
    const position = cardPosition(this.plugin.tray, path);
    if (position !== null) {
      this.setCardFocus(deskCardFocus(path, position.pileId));
    }
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
        new import_obsidian4.Notice("The Deck changed. Review the updated position and confirm again.");
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
      this.setDeckAnchor(file.path);
      this.cardFocus = deckCardFocus(file.path);
      this.viewportOffset = 0;
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
    this.setDeckAnchor(target.path);
    this.viewportOffset = viewportPosition - targetIndex;
    this.centerViewportOnActive(targetIndex, true);
  }
  centerActiveCard() {
    if (this.activePath === null) {
      new import_obsidian4.Notice("There is no Deck anchor to centre.");
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
      new import_obsidian4.Notice("There are no filed cards.");
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
    return false;
  }
  selectCardWithoutMoving(path) {
    this.cancelViewportCentering();
    const previousActiveIndex = this.plugin.index.filedIndexForPath(this.activePath);
    const targetIndex = this.plugin.index.filedIndexForPath(path);
    if (targetIndex < 0) {
      return;
    }
    this.setDeckAnchor(path);
    this.viewportOffset = stationarySelectionOffset(
      previousActiveIndex,
      targetIndex,
      this.viewportOffset
    );
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
    this.setDeckAnchor(activeCard.path);
    this.viewportOffset = viewportPosition - activeIndex;
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
      card.toggleClass("is-deck-anchor", isActive);
      card.toggleClass(
        "is-card-focused",
        this.cardFocus?.surface === "deck" && card.dataset.path === this.cardFocus.path
      );
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
      card.toggleClass("is-deck-anchor", filedIndex === activeIndex);
      card.toggleClass(
        "is-card-focused",
        this.cardFocus?.surface === "deck" && card.dataset.path === this.cardFocus.path
      );
      card.style.zIndex = String(cardStackOrder(filedIndex, activeIndex));
      this.cardFooters.setInteractive(card, filedIndex === activeIndex);
    }
    if (this.stageEl !== null) {
      this.renderBookmarkEdgeTabs(this.stageEl);
    }
    this.updateDeckMapActiveUi();
    this.applyCardFocusClasses();
  }
  bookmarkedPaths() {
    return new Set(
      this.plugin.state.bookmarks.flatMap(
        (bookmark) => "path" in bookmark ? [bookmark.path] : []
      )
    );
  }
  bookmarkIndices() {
    return [...this.bookmarkedPaths()].flatMap((path) => {
      const index = this.plugin.index.filedIndexForPath(path);
      return index < 0 ? [] : [index];
    });
  }
  updateBookmarkUi(bookmarkedPaths = this.bookmarkedPaths()) {
    for (const cardEl of this.renderedCards) {
      const path = cardEl.dataset.path;
      if (path === void 0) {
        continue;
      }
      const isBookmarked = bookmarkedPaths.has(path);
      cardEl.toggleClass("is-bookmarked", isBookmarked);
      const toggle = cardEl.querySelector(
        '.slipbox-card-header-action[data-slipbox-action="toggle-bookmark"]'
      );
      if (toggle === null) {
        continue;
      }
      const action = isBookmarked ? "Remove bookmark" : "Add bookmark";
      toggle.toggleClass("is-pressed", isBookmarked);
      toggle.setAttr("aria-label", action);
      toggle.setAttr("aria-pressed", String(isBookmarked));
      (0, import_obsidian4.setTooltip)(toggle, action, {
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
  cardStep() {
    const firstCard = this.renderedCards[0];
    if (firstCard === void 0) {
      return 1;
    }
    return firstCard.offsetWidth * this.plugin.settings.cardSpread;
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
  rememberViewedCardScroll() {
    if (this.viewedCard !== null && this.viewedCardBodyEl !== null) {
      this.viewedCard = scrollViewedCardState(
        this.viewedCard,
        this.viewedCardBodyEl.scrollTop
      );
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

// src/desk-state.ts
var DESK_WIDTH = 2400;
var DESK_HEIGHT = 1600;
var DESK_CARD_WIDTH = 520;
var DESK_CARD_HEIGHT = 346;
function isRecord3(value) {
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
    if (!isRecord3(candidate) || typeof candidate.cardRef !== "string" || candidate.cardRef.trim() === "" || !finiteNumber(candidate.x) || !finiteNumber(candidate.y) || !finiteNumber(candidate.z)) {
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

// src/modals.ts
var import_obsidian5 = require("obsidian");

// src/card-link-suggestions.ts
var MATCH_TIERS = 4;
var NO_MATCH = -1;
function buildCardLinkSuggestions(candidates) {
  const counts = /* @__PURE__ */ new Map();
  for (const candidate of candidates) {
    counts.set(candidate.address, (counts.get(candidate.address) ?? 0) + 1);
  }
  return candidates.map((candidate) => ({
    ...candidate,
    ambiguous: (counts.get(candidate.address) ?? 0) > 1
  }));
}
function matchTier(candidate, needle) {
  const address = candidate.address.toLowerCase();
  if (address === needle) {
    return 0;
  }
  if (address.startsWith(needle)) {
    return 1;
  }
  if (address.includes(needle)) {
    return 2;
  }
  return candidate.title.toLowerCase().includes(needle) ? 3 : NO_MATCH;
}
function matchCardLinkSuggestions(candidates, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [...candidates];
  }
  const tiers = Array.from({ length: MATCH_TIERS }, () => []);
  for (const candidate of candidates) {
    const tier = matchTier(candidate, needle);
    if (tier !== NO_MATCH) {
      tiers[tier]?.push(candidate);
    }
  }
  return tiers.flat();
}

// src/modal-choice.ts
function modalChoice(resolve, schedule) {
  let settled = false;
  const settleWith = (value) => {
    if (settled) {
      return;
    }
    settled = true;
    schedule(() => resolve(value));
  };
  return {
    choose: (value) => settleWith(value),
    cancel: () => schedule(() => settleWith(null))
  };
}

// src/modals.ts
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
var CanvasPromptModal = class extends import_obsidian5.FuzzySuggestModal {
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
var CardLinkSuggestModal = class extends import_obsidian5.SuggestModal {
  constructor(app, suggestions, resolveSuggestion) {
    super(app);
    this.suggestions = suggestions;
    this.choice = modalChoice(resolveSuggestion, (task) => {
      window.setTimeout(task);
    });
    this.setPlaceholder("Card address or title (Esc to cancel)");
    this.emptyStateText = "No filed card matches.";
  }
  choice;
  getSuggestions(query) {
    return [...matchCardLinkSuggestions(this.suggestions, query)];
  }
  renderSuggestion(suggestion, el) {
    el.addClass("slipbox-card-link-suggestion");
    el.createDiv({
      cls: "slipbox-card-link-address",
      text: suggestion.address
    });
    el.createDiv({ cls: "slipbox-card-link-title", text: suggestion.title });
    if (suggestion.ambiguous) {
      el.createDiv({ cls: "slipbox-card-link-path", text: suggestion.path });
    }
  }
  onChooseSuggestion(suggestion) {
    this.choice.choose(suggestion);
  }
  onClose() {
    super.onClose();
    this.choice.cancel();
  }
};
function promptForCardLink(app, suggestions) {
  return new Promise((resolve) => {
    new CardLinkSuggestModal(app, suggestions, resolve).open();
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
var ConfirmationModal = class extends import_obsidian5.Modal {
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
var BookmarksModal = class extends import_obsidian5.Modal {
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
      label: "+ add focused Deck card as bookmark",
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
var IssuesModal = class extends import_obsidian5.Modal {
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
var UNSAFE_FILENAME_CHARACTERS = new Set('\\/:*?"<>|');
async function resolveNewCardTitle(mode, prompt) {
  return mode === "default" ? "" : prompt();
}
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

// src/plugin-state.ts
var DEFAULT_STATE = {
  bookmarks: []
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
function hasTitleAddressCollisionData(value) {
  if (!isRecord4(value)) {
    return false;
  }
  const settings = isRecord4(value.settings) ? value.settings : {};
  return hasTitleAddressPropertyCollision(settings);
}
function needsPluginDataMigration(value) {
  return isRecord4(value) && value.schemaVersion !== SLIPBOX_DATA_SCHEMA_VERSION;
}
function normalizePluginState(value) {
  if (!isRecord4(value)) {
    return DEFAULT_STATE;
  }
  const legacyDeskCards = normalizeDeskCards(
    Object.prototype.hasOwnProperty.call(value, "legacyDeskCards") ? value.legacyDeskCards : value.deskCards
  );
  return {
    bookmarks: normalizeBookmarks(value.bookmarks),
    ...legacyDeskCards.length > 0 ? { legacyDeskCards } : {}
  };
}
function normalizePluginData(value) {
  if (!isRecord4(value)) {
    return DEFAULT_DATA;
  }
  const versioned = isRecord4(value.state) || isRecord4(value.settings);
  const rawSettings = versioned && isRecord4(value.settings) ? value.settings : {};
  const rawState = versioned && isRecord4(value.state) ? value.state : value;
  const settingsWithMigratedSpread = {
    ...rawSettings,
    cardSpread: Object.prototype.hasOwnProperty.call(rawSettings, "cardSpread") ? rawSettings.cardSpread : isRecord4(rawState) ? rawState.spread : void 0
  };
  return {
    schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
    settings: normalizeSettings(settingsWithMigratedSpread),
    state: normalizePluginState(rawState)
  };
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
    this.renderDeckOrdering(containerEl);
    new import_obsidian6.Setting(containerEl).setName("Title source").setDesc("Choose the filename or a top-level frontmatter property for note titles. New card with title uses the entered title in the selected location; New card uses the default timestamp title.").addDropdown((dropdown) => {
      dropdown.addOption("filename", "Filename").addOption("frontmatter", "Frontmatter property").setValue(this.slipbox.settings.titleSource).onChange((value) => {
        if (value === "frontmatter" && this.slipbox.settings.titleProperty === this.slipbox.settings.addressProperty) {
          dropdown.setValue("filename");
          new import_obsidian6.Notice(
            "The title property must be different from the address property."
          );
          return;
        }
        void this.save({
          ...this.slipbox.settings,
          titleSource: value === "frontmatter" ? "frontmatter" : "filename"
        }).then(() => this.redisplayPreservingScroll());
      });
    });
    const titleProperty = new import_obsidian6.Setting(containerEl).setName("Title property").setDesc("Exact top-level YAML key. It must differ from the address property. Missing, blank, or non-text values fall back to the filename.").setDisabled(this.slipbox.settings.titleSource !== "frontmatter");
    titleProperty.addText((text) => {
      let property = this.slipbox.settings.titleProperty;
      const queueCommit = this.debounceTextCommit(text.inputEl, () => {
        if (property !== "" && property !== this.slipbox.settings.addressProperty && property !== this.slipbox.settings.titleProperty) {
          void this.save({
            ...this.slipbox.settings,
            titleProperty: property
          });
        }
      });
      text.setValue(this.slipbox.settings.titleProperty).setDisabled(this.slipbox.settings.titleSource !== "frontmatter").onChange((value) => {
        property = value.trim();
        this.setMetadataPropertyValidity(
          titleProperty,
          property,
          this.slipbox.settings.addressProperty
        );
        queueCommit();
      });
    });
    new import_obsidian6.Setting(containerEl).setName("Show title in Slipbox card headers").setDesc("Show resolved titles beside addresses in Deck and Desk card headers.").addToggle((toggle) => {
      toggle.setValue(this.slipbox.settings.showTitleInDeck).onChange((value) => void this.save({
        ...this.slipbox.settings,
        showTitleInDeck: value
      }));
    });
    new import_obsidian6.Setting(containerEl).setName("Show Deck map").setDesc("Show a clickable overview sampled from the filed sequence, with exact anchor and bookmark positions.").addToggle((toggle) => {
      toggle.setValue(this.slipbox.settings.showDeckMap).onChange((value) => void this.save({
        ...this.slipbox.settings,
        showDeckMap: value
      }));
    });
    new import_obsidian6.Setting(containerEl).setName("Card spread").setDesc("Set the separation between neighbouring Deck cards.").addSlider((slider) => {
      slider.setLimits(MIN_CARD_SPREAD, MAX_CARD_SPREAD, 0.01).setValue(this.slipbox.settings.cardSpread).setDynamicTooltip().onChange((value) => this.slipbox.setCardSpread(value));
    });
    new import_obsidian6.Setting(containerEl).setName("Card sizes").setHeading();
    this.renderCardSizeSettings(containerEl);
    new import_obsidian6.Setting(containerEl).setName("New cards").setHeading();
    this.renderNewCardSettings(containerEl);
    new import_obsidian6.Setting(containerEl).setName("Card header buttons").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Choose which actions appear in Deck, Desk, and viewed-card headers. Buttons that do not fit move into more card actions. Hidden actions remain available through commands, Slipbox shortcuts, and context menus."
    });
    this.renderCardHeaderButtons(containerEl, "deck", "Deck cards");
    this.renderCardHeaderButtons(containerEl, "desk", "Desk cards");
    this.renderCardHeaderButtons(containerEl, "viewed", "Viewed cards");
    new import_obsidian6.Setting(containerEl).setName("Keyboard shortcuts").setHeading();
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
    new import_obsidian6.Setting(container).setName("Main card size").setDesc("Maximum Deck-card width: small 720 px, medium 840 px, or large 960 px.").addDropdown((dropdown) => {
      dropdown.addOption("small", "Small").addOption("medium", "Medium").addOption("large", "Large").setValue(this.slipbox.settings.mainCardSize).onChange((value) => void this.save({
        ...this.slipbox.settings,
        mainCardSize: normalizeCardSize(value)
      }));
    });
    new import_obsidian6.Setting(container).setName("Desk card size").setDesc("Maximum working-pile card width: small 280 px, medium 360 px, or large 440 px. Desk cards remain smaller than main cards.").addDropdown((dropdown) => {
      dropdown.addOption("small", "Small").addOption("medium", "Medium").addOption("large", "Large").setValue(this.slipbox.settings.trayCardSize).onChange((value) => void this.save({
        ...this.slipbox.settings,
        trayCardSize: normalizeCardSize(value)
      }));
    });
  }
  renderNewCardSettings(container) {
    const folderSetting = new import_obsidian6.Setting(container).setName("New card folder").setDesc("Optional vault-folder override for notes created through Slipbox. Leave empty to follow Obsidian\u2019s own default location for new notes.");
    folderSetting.addDropdown((dropdown) => {
      dropdown.addOption("", "Obsidian\u2019s default location");
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
  }
  renderAddressProperty(container) {
    const setting = new import_obsidian6.Setting(container).setName("Address property").setDesc(
      "Exact top-level YAML key used to identify and order cards. Changing it re-indexes immediately but does not rewrite existing notes."
    );
    setting.addText((text) => {
      let property = this.slipbox.settings.addressProperty;
      const queueCommit = this.debounceTextCommit(text.inputEl, () => {
        if (property !== "" && !(this.slipbox.settings.titleSource === "frontmatter" && property === this.slipbox.settings.titleProperty) && property !== this.slipbox.settings.addressProperty) {
          void this.save({
            ...this.slipbox.settings,
            addressProperty: property
          });
        }
      });
      text.setPlaceholder(DEFAULT_SETTINGS.addressProperty).setValue(this.slipbox.settings.addressProperty).onChange((value) => {
        property = value.trim();
        this.setMetadataPropertyValidity(
          setting,
          property,
          this.slipbox.settings.titleSource === "frontmatter" ? this.slipbox.settings.titleProperty : null
        );
        queueCommit();
      });
    });
  }
  renderDeckOrdering(container) {
    new import_obsidian6.Setting(container).setName("Deck ordering").setDesc("Controls how manually assigned addresses are arranged in the Deck. Changing this setting reorders cards but does not edit Markdown files.").addDropdown((dropdown) => {
      dropdown.addOption("natural", "Natural").addOption("lexicographic", "Lexicographic").setValue(this.slipbox.settings.deckOrdering).onChange((value) => void this.save({
        ...this.slipbox.settings,
        deckOrdering: value === "lexicographic" ? "lexicographic" : "natural"
      }));
    });
  }
  renderCardHeaderButtons(container, surface, heading) {
    new import_obsidian6.Setting(container).setName(heading).setHeading();
    for (const definition of cardHeaderButtonDefinitionsForSurface(surface)) {
      new import_obsidian6.Setting(container).setName(definition.settingLabel).addToggle((toggle) => {
        toggle.setValue(
          this.slipbox.settings.cardHeaderButtons[surface][definition.action]
        ).onChange((value) => void this.save({
          ...this.slipbox.settings,
          cardHeaderButtons: {
            ...this.slipbox.settings.cardHeaderButtons,
            [surface]: {
              ...this.slipbox.settings.cardHeaderButtons[surface],
              [definition.action]: value
            }
          }
        }));
      });
    }
  }
  renderShortcutSetting(container, definition) {
    const { id: action, label } = definition;
    const setting = new import_obsidian6.Setting(container).setName(label);
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
    return keyBindingFromKeyboardEvent(event, import_obsidian6.Platform.isMacOS);
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
  setMetadataPropertyValidity(setting, property, disallowedProperty) {
    const empty = property === "";
    const collision = disallowedProperty !== null && property === disallowedProperty;
    this.setTextValidity(
      setting,
      !empty && !collision,
      collision ? "The title and address properties must use different keys." : "A non-empty top-level property name is required."
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
      new import_obsidian6.Notice(`Could not save Slipbox settings: ${errorMessage2(error)}`);
    }
  }
};
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/card-index.ts
var import_obsidian7 = require("obsidian");

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
    return this.app.vault.getFileByPath(path) ?? void 0;
  }
  backlinksForPath(path) {
    return this.current.backlinksByTargetPath.get(path) ?? NO_BACKLINKS;
  }
  /** Read only the note body, excluding the YAML frontmatter block. */
  async readBody(file) {
    const source = await this.app.vault.cachedRead(file);
    return source.slice((0, import_obsidian7.getFrontMatterInfo)(source).contentStart);
  }
};

// src/canvas-bridge.ts
var import_obsidian8 = require("obsidian");

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
    const normalized = (0, import_obsidian8.normalizePath)(path);
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
      if (leaf.view instanceof import_obsidian8.TextFileView && leaf.view.file?.path === file.path) {
        return leaf.view;
      }
    }
    return null;
  }
  activeCanvasView() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian8.TextFileView);
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
var SlipboxPlugin = class extends import_obsidian9.Plugin {
  state = DEFAULT_STATE;
  settings = DEFAULT_SETTINGS;
  tray = EMPTY_TRAY;
  index;
  canvas;
  indexRefreshTimer = null;
  cardSpreadSaveTimer = null;
  filingWriteInProgress = false;
  persistQueue = Promise.resolve();
  trayPileSequence = 0;
  rawSettings = {};
  inlineEditOwners = new InlineEditPathLock();
  detachedInlineEditDrafts = /* @__PURE__ */ new Map();
  async onload() {
    const loadedData = await this.loadData();
    const purgeRemovedEntryPoints = hasRemovedEntryPointData(loadedData);
    const migrateTitleCollision = hasTitleAddressCollisionData(loadedData);
    const migratePluginData = needsPluginDataMigration(loadedData);
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
    if (migrateTitleCollision) {
      new import_obsidian9.Notice(
        "Slipbox changed title source to filename because the title and address properties used the same key."
      );
    }
    if (purgeRemovedEntryPoints || migrateTitleCollision || migratePluginData) {
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
    if (this.cardSpreadSaveTimer !== null) {
      window.clearTimeout(this.cardSpreadSaveTimer);
      this.cardSpreadSaveTimer = null;
      void this.persistState();
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
  setCardSpread(value) {
    const cardSpread = normalizeCardSpread(value);
    if (cardSpread === this.settings.cardSpread) {
      return;
    }
    this.settings = { ...this.settings, cardSpread };
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.handleCardSpreadChanged();
      }
    }
    if (this.cardSpreadSaveTimer !== null) {
      window.clearTimeout(this.cardSpreadSaveTimer);
    }
    this.cardSpreadSaveTimer = window.setTimeout(() => {
      this.cardSpreadSaveTimer = null;
      void this.persistState().then(() => this.refreshDeckViews());
    }, 160);
  }
  /**
   * Open a card's note the way Obsidian itself opens a file.
   *
   * `getLeaf(false)` reuses a navigable leaf and honours pinning, so opening a
   * card matches the core New note and link-following behaviour rather than
   * always spawning a tab.
   */
  openMarkdownFile(file) {
    return this.app.workspace.getLeaf(false).openFile(file);
  }
  acquireInlineEdit(path, owner) {
    const existing = this.inlineEditOwners.ownerAt(path);
    if (existing === owner) {
      return true;
    }
    if (existing !== void 0) {
      new import_obsidian9.Notice("This card is already being edited in another Slipbox view.");
      void this.app.workspace.revealLeaf(existing.leaf);
      return false;
    }
    if (this.detachedInlineEditDrafts.has(path)) {
      new import_obsidian9.Notice(
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
    const latest = this.app.vault.getFileByPath(file.path);
    if (latest === null) {
      throw new Error("The card no longer exists.");
    }
    const source = await this.app.vault.read(latest);
    const body = splitNoteBody(
      source,
      (0, import_obsidian9.getFrontMatterInfo)(source).contentStart
    ).body;
    return { file: latest, body };
  }
  async commitInlineEdit(request) {
    const file = this.app.vault.getFileByPath(request.path);
    if (file === null) {
      return {
        status: "conflict",
        message: "The card was deleted while it was being edited."
      };
    }
    try {
      await this.app.vault.process(file, (latest) => {
        const contentStart = (0, import_obsidian9.getFrontMatterInfo)(latest).contentStart;
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
      if (view instanceof import_obsidian9.TextFileView && view.file?.path === path) {
        saves.push(view.save());
      }
    });
    await Promise.all(saves);
  }
  retainDetachedInlineEdit(snapshot, file, presentation) {
    this.detachedInlineEditDrafts.set(snapshot.path, {
      path: snapshot.path,
      file,
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
  showCardContextMenu(event, file, address, surface, source, leaf, viewedReturnSurface = null) {
    event.preventDefault();
    event.stopPropagation();
    const isBookmarked = address !== null && this.bookmarkAtPath(file.path) !== void 0;
    const isInTray = trayContains(this.tray, file.path);
    const title = this.cardTitle(file);
    const menu = import_obsidian9.Menu.forEvent(event);
    const runViewAction = (action) => {
      if (leaf.view instanceof DeckView) {
        leaf.view.runAction(action);
      }
    };
    for (const presentation of applicableCardHeaderActions({
      surface,
      viewedReturnSurface,
      filed: address !== null,
      onDesk: isInTray,
      bookmarked: isBookmarked,
      canMoveLeft: false,
      canMoveRight: false
    })) {
      menu.addItem((item) => {
        item.setTitle(presentation.action === "delete-card" ? `Delete ${title}` : presentation.label).setIcon(presentation.icon).setWarning(presentation.warning === true).setSection(presentation.warning === true ? "slipbox-card-danger" : "slipbox-card").onClick(() => runViewAction(presentation.action));
      });
    }
    this.app.workspace.trigger("file-menu", menu, file, source, leaf);
    menu.showAtMouseEvent(event);
  }
  async deleteCard(file) {
    if (!await this.app.fileManager.promptForDeletion(file)) {
      return false;
    }
    try {
      await this.app.fileManager.trashFile(file);
      return true;
    } catch (error) {
      new import_obsidian9.Notice(`Could not delete ${this.cardTitle(file)}: ${errorMessage4(error)}`);
      return false;
    }
  }
  showIssues() {
    this.index.refresh();
    new IssuesModal(this.app, this.index.snapshot, {
      open: (path) => {
        const file = this.index.fileAtPath(path);
        if (file === void 0) {
          new import_obsidian9.Notice(`Could not find ${path}.`);
        } else {
          void this.openMarkdownFile(file);
        }
      }
    }).open();
  }
  showBookmarks(view) {
    const bookmarks = this.state.bookmarks.filter(isPathBookmark);
    new BookmarksModal(this.app, bookmarks, {
      currentPath: view.focusedDeckCardPath,
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
      new import_obsidian9.Notice("Only an available filed card can be bookmarked.");
      return;
    }
    const label = this.filedCardLabel(path);
    if (this.bookmarkAtPath(path) !== void 0) {
      new import_obsidian9.Notice(`${label} already has a bookmark.`);
      return;
    }
    try {
      this.state = {
        ...this.state,
        bookmarks: createBookmark(this.state.bookmarks, path)
      };
      this.refreshBookmarkUi();
      await this.persistState();
      new import_obsidian9.Notice(`Bookmarked ${label}.`);
    } catch (error) {
      new import_obsidian9.Notice(`Could not add bookmark: ${errorMessage4(error)}`);
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
      new import_obsidian9.Notice("Only an available filed card can be pulled out.");
      return;
    }
    this.tray = toggleFiledCard(
      this.tray,
      { cardRef: file.path, kind: "filed" },
      this.createTrayPileId()
    );
    await this.refreshDeckViews();
  }
  async putFileOnDesk(file) {
    if (trayContains(this.tray, file.path)) {
      return true;
    }
    this.index.refresh();
    const filed = this.index.filedByFile(file);
    if (filed === void 0) {
      new import_obsidian9.Notice("Only an available filed card can be put on the Desk.");
      return false;
    }
    this.tray = toggleFiledCard(
      this.tray,
      { cardRef: file.path, kind: "filed" },
      this.createTrayPileId()
    );
    await this.refreshDeckViews();
    return trayContains(this.tray, file.path);
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
      new import_obsidian9.Notice(`Could not lay out the pile: ${errorMessage4(error)}`);
    }
  }
  async layOutTrayPileOnCanvas(pileId) {
    const paths = this.trayPilePaths(pileId);
    if (paths.length === 0) {
      return;
    }
    const canvases = this.canvas.canvasFiles();
    if (canvases.length === 0) {
      new import_obsidian9.Notice("There are no Canvas files in this vault. Create one from the pile instead.");
      return;
    }
    const file = await promptForCanvas(this.app, canvases);
    if (file === null) {
      return;
    }
    try {
      this.reportCanvasWrite(await this.canvas.layoutFilesOnCanvas(file, paths));
    } catch (error) {
      new import_obsidian9.Notice(`Could not lay out the pile: ${errorMessage4(error)}`);
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
      new import_obsidian9.Notice("Enter a valid Canvas filename or vault-relative path.");
      return;
    }
    try {
      this.reportCanvasWrite(await this.canvas.createCanvas(path, paths));
    } catch (error) {
      new import_obsidian9.Notice(`Could not create the Canvas: ${errorMessage4(error)}`);
    }
  }
  async exportLegacyDeskToCanvas() {
    const legacy = this.state.legacyDeskCards ?? [];
    if (legacy.length === 0) {
      new import_obsidian9.Notice("There is no legacy Desk layout to export.");
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
      new import_obsidian9.Notice("Enter a valid Canvas filename or vault-relative path.");
      return;
    }
    const available = legacy.filter(
      (card) => this.app.vault.getFileByPath(card.cardRef)?.extension === "md"
    );
    const missingCount = legacy.length - available.length;
    if (available.length === 0) {
      new import_obsidian9.Notice("None of the cards in the legacy Desk layout still exist. The layout was kept.");
      return;
    }
    let result;
    try {
      result = await this.canvas.createLegacyDeskCanvas(path, available);
    } catch (error) {
      new import_obsidian9.Notice(`Could not export the legacy Desk: ${errorMessage4(error)}`);
      return;
    }
    const missing = missingCount === 0 ? "" : ` Omitted ${missingCount} missing card${missingCount === 1 ? "" : "s"}.`;
    new import_obsidian9.Notice(
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
    new import_obsidian9.Notice("Legacy Desk state cleared. The Canvas was kept.");
  }
  async beginFiling(file) {
    this.index.refresh();
    if (this.cardMetadataState(file) !== "unfiled") {
      new import_obsidian9.Notice("Only an unfiled card can enter filing mode.");
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
      new import_obsidian9.Notice(
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
      new import_obsidian9.Notice(`Could not file the card: ${errorMessage4(error)}`);
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
      callback: () => void this.createNewCard("default")
    });
    this.addCommand({
      id: "new-card-with-title",
      name: "New card with title",
      callback: () => void this.createNewCard("prompt")
    });
    this.addCommand({
      id: "new-card-on-desk",
      name: "New card on Desk",
      callback: () => void this.createNewCardOnDesk("default")
    });
    this.addCommand({
      id: "new-card-with-title-on-desk",
      name: "New card with title on Desk",
      callback: () => void this.createNewCardOnDesk("prompt")
    });
    this.addCommand({
      id: "make-current-note-card",
      name: "Make active Markdown note a card",
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
      name: "File active unfiled Markdown note",
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
      id: "insert-card-link",
      name: "Insert link to card\u2026",
      editorCheckCallback: (checking, editor, ctx) => {
        const available = this.index.snapshot.filed.length > 0;
        if (checking) {
          return available;
        }
        if (available) {
          void this.insertCardLink(editor, ctx);
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
    for (const definition of SLIPBOX_ACTION_DEFINITIONS) {
      this.registerSlipboxActionCommand(definition);
    }
  }
  registerSlipboxActionCommand(definition) {
    if (definition.id === "bookmarks") {
      this.addCommand({
        id: definition.commandId,
        name: definition.commandName,
        callback: () => void this.openDeck().then((view) => {
          view.runAction(definition.id);
        })
      });
      return;
    }
    if (definition.id === "problems") {
      this.addCommand({
        id: definition.commandId,
        name: definition.commandName,
        checkCallback: (checking) => {
          const available = this.index.snapshot.issues.length > 0;
          if (!checking && available) {
            this.showIssues();
          }
          return available;
        }
      });
      return;
    }
    this.addCommand({
      id: definition.commandId,
      name: definition.commandName,
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(DeckView);
        const available = view?.canRunAction(definition.id) ?? false;
        if (checking) {
          return available;
        }
        if (available && view !== null) {
          view.runAction(definition.id);
        }
        return available;
      }
    });
  }
  async createNewCardAtTrayPosition(position, titleMode = "default") {
    await this.createNewCard(titleMode, { kind: "desk", position });
  }
  /** Create an unfiled card on the Desk without opening its note. */
  async createNewCardOnDesk(titleMode) {
    await this.openDeck();
    await this.createNewCard(titleMode, { kind: "desk" });
  }
  /**
   * Focus a newly placed Desk card in every Slipbox view.
   *
   * The Desk is shared plugin state rendered per view, while card focus is per
   * view, so each view focuses the card it has just rendered. Both Desk
   * creation paths leave the new card at the top of its pile, so focus
   * survives later reconciliation.
   */
  focusDeskCardInViews(path) {
    for (const leaf of this.app.workspace.getLeavesOfType(DECK_VIEW_TYPE)) {
      if (leaf.view instanceof DeckView) {
        leaf.view.focusDeskCardAtPath(path);
      }
    }
  }
  async createNewCard(titleMode, placement = { kind: "open" }) {
    try {
      const file = await this.createCardFile(
        titleMode,
        placement.kind === "open"
      );
      if (file === null) {
        return;
      }
      if (placement.kind === "desk") {
        await this.waitForCachedAddress(file, "");
        this.index.refresh();
        this.reconcileSessionTray();
        if (placement.position !== void 0) {
          this.tray = placeUnfiledCardAtPosition(
            this.tray,
            file.path,
            this.createTrayPileId(),
            placement.position
          );
        }
        await this.refreshDeckViews();
        this.focusDeskCardInViews(file.path);
      }
      this.queueIndexRefresh();
    } catch (error) {
      new import_obsidian9.Notice(`Could not create a card: ${errorMessage4(error)}`);
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
      new import_obsidian9.Notice(`${this.cardTitle(file)} is now an unfiled card.`);
    } catch (error) {
      new import_obsidian9.Notice(`Could not make this note a card: ${errorMessage4(error)}`);
    }
  }
  async createCardFile(titleMode, open, sourcePath) {
    const timestamp = newNoteBasename(
      "",
      (0, import_obsidian9.moment)().format(this.settings.newNoteTimestampFormat)
    );
    const title = await resolveNewCardTitle(
      titleMode,
      () => promptForNewCardTitle(
        this.app,
        newCardTitlePlaceholder(timestamp, this.settings.titleSource)
      )
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
    const prefix = parent.isRoot() ? "" : `${parent.path}/`;
    let sequence = 0;
    let path;
    do {
      const suffix = sequence === 0 ? "" : ` ${sequence}`;
      path = (0, import_obsidian9.normalizePath)(`${prefix}${basename}${suffix}.md`);
      sequence += 1;
    } while (this.app.vault.getAbstractFileByPath(path) !== null);
    const properties = {
      [this.settings.addressProperty]: ""
    };
    const frontmatterTitle = newCardFrontmatterTitle(
      title,
      this.settings.titleSource
    );
    if (frontmatterTitle !== null) {
      properties[this.settings.titleProperty] = frontmatterTitle;
    }
    const frontmatter = (0, import_obsidian9.stringifyYaml)(properties);
    const file = await this.app.vault.create(
      path,
      `---
${frontmatter}---

`
    );
    if (open) {
      await this.openMarkdownFile(file);
    }
    return file;
  }
  activeCreationSourcePath() {
    return this.app.workspace.getActiveViewOfType(DeckView)?.activeCard?.file.path ?? this.app.workspace.getActiveFile()?.path;
  }
  /**
   * Resolve the folder a new card belongs in.
   *
   * An empty setting defers to Obsidian's own Default location for new notes.
   * Slipbox supplies the source path so that the Same folder as current file
   * option resolves against the Deck's active card, not only the active note.
   */
  newCardParent(sourcePath) {
    const path = this.settings.newCardFolder;
    if (path === "") {
      return this.app.fileManager.getNewFileParent(sourcePath ?? "");
    }
    const folder = this.app.vault.getFolderByPath(path);
    if (folder === null) {
      throw new Error(
        `The configured new-card folder \u201C${path}\u201D is not a folder in this vault`
      );
    }
    return folder;
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
  cardLinkSuggestions() {
    return buildCardLinkSuggestions(
      this.index.snapshot.filed.map((card) => ({
        path: card.path,
        address: card.address,
        title: this.cardTitle(card.file)
      }))
    );
  }
  /**
   * Insert a link to a filed card at the cursor of a Markdown editor.
   *
   * This is an editor command, so it reaches ordinary notes and Canvas card
   * editors, but deliberately not the Slipbox inline card editor, which is a
   * plain textarea rather than an Obsidian editor.
   */
  async insertCardLink(editor, ctx) {
    const chosen = await promptForCardLink(
      this.app,
      this.cardLinkSuggestions()
    );
    if (chosen === null) {
      return;
    }
    const file = this.index.fileAtPath(chosen.path);
    if (file === void 0) {
      new import_obsidian9.Notice("Could not insert the card link: the card no longer exists.");
      return;
    }
    const link = generateFiledCardLink(
      this.app,
      file,
      ctx.file?.path ?? "",
      chosen.address
    );
    editor.focus();
    editor.replaceSelection(link);
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
      new import_obsidian9.Notice(`Copied ${link}.`);
    } catch (error) {
      new import_obsidian9.Notice(`Could not copy the card link: ${errorMessage4(error)}`);
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
    new import_obsidian9.Notice(`Deleted bookmark at ${label}.`);
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
      new import_obsidian9.Notice(`Could not save Slipbox state: ${errorMessage4(error)}`);
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
    new import_obsidian9.Notice(`${summary}${existing}`);
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
