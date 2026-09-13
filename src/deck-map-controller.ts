import { verticalDeckMapInset } from "./deck-map-layout.js";
import { deckAxis } from "./deck-axis.js";
import type { DeckOrientation } from "./settings.js";
import { DeckMapRenderer } from "./deck-map-renderer.js";
import {
  bucketDeckMapLandmarks,
  buildDeckMapLandmarks,
  buildDeckMapSections,
  deckMapAriaValueText,
  deckMapIndexAtOffset,
  deckMapLandmarkForCard,
  deckMapPhysicalPixelBucket,
  deckMapPhysicalPixelWidth,
  deckMapReadout,
  deckMapViewportRange,
  preventPrimaryDeckMapPointerFocus,
  visibleDeckMapSectionLabels,
  type DeckMapCard,
  type DeckMapLandmark,
  type DeckMapRenderableLandmark,
  type DeckMapSection,
  type DeckMapWindow,
} from "./deck-map.js";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const SECTION_LABEL_SPACING = 18;

export type DeckMapKeyboardAction =
  | "previous-card"
  | "next-card"
  | "first-card"
  | "last-card";

export interface DeckMapControllerEnvironment {
  navigate(path: string): void | Promise<void>;
  runAfterEditing(reason: string, action: () => void | Promise<void>): void;
  runAction(action: DeckMapKeyboardAction): void;
}

/** Own one stable, focusable Deck-map rail and its live interaction state. */
export class DeckMapController {
  readonly rootElement: HTMLElement;
  private readonly renderer: DeckMapRenderer;
  private cards: readonly DeckMapCard[] = [];
  private cardIndexByPath = new Map<string, number>();
  private activePath: string | null = null;
  private bookmarkedPaths = new Set<string>();
  private renderedWindow: DeckMapWindow | null = null;
  private sections: readonly DeckMapSection[] = [];
  private landmarksByPath = new Map<string, DeckMapLandmark>();
  private renderedLandmarks: readonly DeckMapRenderableLandmark[] = [];
  private railWidth = 0;
  private orientation: DeckOrientation = "horizontal";
  private devicePixelRatio = 1;
  private currentReadoutKey: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private statusBar: HTMLElement | null = null;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly environment: DeckMapControllerEnvironment,
  ) {
    this.rootElement = container.ownerDocument.createElementNS(
      HTML_NAMESPACE,
      "div",
    );
    container.append(this.rootElement);
    this.renderer = new DeckMapRenderer(this.rootElement);
    this.rootElement.addEventListener("pointerdown", this.handlePointerDown);
    this.rootElement.addEventListener("pointermove", this.handlePointerMove);
    this.rootElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.rootElement.addEventListener("click", this.handleClick);
    this.rootElement.addEventListener("keydown", this.handleKeydown);

    const ownerWindow = this.ownerWindow;
    ownerWindow?.addEventListener("resize", this.handleResize);
    const ResizeObserverConstructor = deckMapResizeObserver(ownerWindow);
    if (ResizeObserverConstructor !== null) {
      const observer = new ResizeObserverConstructor((entries) => {
        const railEntry = entries.find((entry) => entry.target === this.renderer.railElement);
        const physicalWidth = railEntry?.devicePixelContentBoxSize?.[0]
          ?.[this.orientation === "vertical" ? "blockSize" : "inlineSize"];
        this.refreshLayout(physicalWidth);
      });
      this.resizeObserver = observer;
      observer.observe(container);
      try {
        observer.observe(this.renderer.railElement, {
          box: "device-pixel-content-box",
        });
      } catch {
        observer.observe(this.renderer.railElement);
      }
    }
  }

  reconcile(
    cards: readonly DeckMapCard[],
    activePath: string | null,
    bookmarkedPaths: ReadonlySet<string>,
    renderedWindow: DeckMapWindow | null,
  ): void {
    this.cards = cards;
    this.cardIndexByPath = new Map(
      cards.map((card, index) => [card.path, index]),
    );
    this.activePath = activePath;
    this.bookmarkedPaths = new Set(bookmarkedPaths);
    this.renderedWindow = renderedWindow;
    this.sections = buildDeckMapSections(cards);
    this.landmarksByPath = new Map(
      buildDeckMapLandmarks(cards, activePath, this.bookmarkedPaths)
        .map((landmark) => [landmark.path, landmark]),
    );
    this.clearReadout();
    this.refreshLayout();
  }

  updateActive(
    activePath: string | null,
    renderedWindow: DeckMapWindow | null,
  ): void {
    const previousPath = this.activePath;
    this.activePath = activePath;
    this.renderedWindow = renderedWindow;
    if (previousPath !== activePath) {
      if (previousPath !== null) {
        this.refreshLandmark(previousPath);
      }
      if (activePath !== null) {
        this.refreshLandmark(activePath);
      }
      this.reconcileLandmarks();
    }
    this.updateAria();
  }

  updateBookmarks(bookmarkedPaths: ReadonlySet<string>): void {
    const previous = this.bookmarkedPaths;
    const next = new Set(bookmarkedPaths);
    this.bookmarkedPaths = next;
    for (const path of new Set([...previous, ...next])) {
      if (previous.has(path) !== next.has(path)) {
        this.refreshLandmark(path);
      }
    }
    this.reconcileLandmarks();
    this.updateAria();
  }

  updateRenderedWindow(renderedWindow: DeckMapWindow | null): void {
    this.renderedWindow = renderedWindow;
    this.updateAria();
  }

  setVisible(visible: boolean): void {
    this.rootElement.hidden = !visible;
    if (!visible) {
      this.clearReadout();
    }
  }

  setOrientation(orientation: DeckOrientation): void {
    this.orientation = orientation;
    this.renderer.setOrientation(orientation);
    this.clearReadout();
    this.refreshLayout();
  }

  private axisBounds(): { start: number; extent: number } {
    const bounds = this.renderer.railElement.getBoundingClientRect();
    const axis = deckAxis(this.orientation);
    return { start: axis.point(bounds.left, bounds.top), extent: axis.extent(bounds.width, bounds.height) };
  }

  refreshLayout(physicalPixelWidth?: number): void {
    if (this.disposed) {
      return;
    }
    if (this.refreshMapInsets()) physicalPixelWidth = undefined;
    const bounds = this.renderer.railElement.getBoundingClientRect();
    this.railWidth = Math.max(0, deckAxis(this.orientation).extent(bounds.width, bounds.height));
    this.devicePixelRatio =
      physicalPixelWidth !== undefined &&
        Number.isFinite(physicalPixelWidth) &&
        physicalPixelWidth > 0 &&
        this.railWidth > 0
        ? physicalPixelWidth / this.railWidth
        : this.ownerWindow?.devicePixelRatio ?? 1;
    const visibleLabels = new Set(
      visibleDeckMapSectionLabels(
        this.sections,
        this.railWidth,
        SECTION_LABEL_SPACING,
      ).map((section) => section.path),
    );
    this.renderer.reconcileSections(this.sections, visibleLabels);
    this.reconcileLandmarks();
    this.updateAria();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.statusBar = null;
    this.ownerWindow?.removeEventListener("resize", this.handleResize);
    this.rootElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.rootElement.removeEventListener("pointermove", this.handlePointerMove);
    this.rootElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.rootElement.removeEventListener("click", this.handleClick);
    this.rootElement.removeEventListener("keydown", this.handleKeydown);
    this.renderer.clear();
    this.rootElement.remove();
    this.cards = [];
    this.cardIndexByPath.clear();
    this.landmarksByPath.clear();
  }

  private refreshMapInsets(): boolean {
    const statusBar = this.container.ownerDocument.querySelector<HTMLElement>(".status-bar");
    if (statusBar !== this.statusBar) {
      if (this.statusBar !== null) this.resizeObserver?.unobserve(this.statusBar);
      this.statusBar = statusBar;
      if (statusBar !== null) this.resizeObserver?.observe(statusBar);
    }
    if (this.orientation !== "vertical") return false;

    const pane = this.container.getBoundingClientRect();
    const inset = verticalDeckMapInset(
      pane,
      this.rootElement.getBoundingClientRect(),
      statusBar?.getBoundingClientRect() ?? null,
    );
    const style = this.rootElement.style;
    const value = `${inset}px`;
    const changed = style.getPropertyValue("--slipbox-deck-map-inset") !== value;
    if (changed) style.setProperty("--slipbox-deck-map-inset", value);
    return changed;
  }

  private get ownerWindow(): Window | null {
    return this.rootElement.ownerDocument.defaultView;
  }

  private refreshLandmark(path: string): void {
    const index = this.cardIndexByPath.get(path);
    const card = index === undefined ? undefined : this.cards[index];
    if (index === undefined || card === undefined) {
      this.landmarksByPath.delete(path);
      return;
    }
    const landmark = deckMapLandmarkForCard(
      card,
      index,
      this.cards.length,
      this.activePath,
      this.bookmarkedPaths,
    );
    if (landmark === null) {
      this.landmarksByPath.delete(path);
    } else {
      this.landmarksByPath.set(path, landmark);
    }
  }

  private reconcileLandmarks(): void {
    this.renderedLandmarks = bucketDeckMapLandmarks(
      this.landmarksByPath.values(),
      this.railWidth,
      this.devicePixelRatio,
    );
    this.renderer.reconcileLandmarks(this.renderedLandmarks);
  }

  private updateAria(
    range = deckMapViewportRange(this.renderedWindow, this.cards.length),
  ): void {
    const cardCount = this.cards.length;
    if (cardCount === 0) {
      this.rootElement.removeAttribute("aria-valuemin");
      this.rootElement.removeAttribute("aria-valuemax");
      this.rootElement.removeAttribute("aria-valuenow");
    } else {
      this.rootElement.setAttribute("aria-valuemin", "1");
      this.rootElement.setAttribute("aria-valuemax", String(cardCount));
      const activeIndex = this.activePath === null
        ? undefined
        : this.cardIndexByPath.get(this.activePath);
      if (activeIndex === undefined) {
        this.rootElement.removeAttribute("aria-valuenow");
      } else {
        this.rootElement.setAttribute("aria-valuenow", String(activeIndex + 1));
      }
    }
    const active = this.activePath === null
      ? null
      : this.landmarksByPath.get(this.activePath) ?? null;
    const bookmarkCount = [...this.bookmarkedPaths].filter((path) =>
      this.cardIndexByPath.has(path)
    ).length;
    this.rootElement.setAttribute(
      "aria-valuetext",
      deckMapAriaValueText(active, cardCount, range, bookmarkCount),
    );
  }

  private clearReadout(): void {
    this.currentReadoutKey = null;
    this.renderer.updateReadout(null);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    preventPrimaryDeckMapPointerFocus(event);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.rootElement.hidden || this.cards.length === 0) {
      this.clearReadout();
      return;
    }
    const bounds = this.axisBounds();
    const offset = deckAxis(this.orientation).point(event.clientX, event.clientY) - bounds.start;
    const index = deckMapIndexAtOffset(offset, bounds.extent, this.cards.length);
    const card = index === null ? undefined : this.cards[index];
    if (index === null || card === undefined) {
      this.clearReadout();
      return;
    }
    const normalized = bounds.extent <= 0
      ? 0
      : Math.max(0, Math.min(1, offset / bounds.extent));
    const physicalWidth = deckMapPhysicalPixelWidth(
      bounds.extent,
      this.devicePixelRatio,
    );
    const bucket = deckMapPhysicalPixelBucket(normalized, physicalWidth);
    const readout = deckMapReadout(
      card,
      index,
      this.cards.length,
      bucket,
    );
    if (readout === null || readout.key === this.currentReadoutKey) {
      return;
    }
    this.currentReadoutKey = readout.key;
    this.renderer.updateReadout(readout);
  };

  private readonly handlePointerLeave = (): void => {
    this.clearReadout();
  };

  private readonly handleClick = (event: MouseEvent): void => {
    const bounds = this.axisBounds();
    const index = deckMapIndexAtOffset(
      deckAxis(this.orientation).point(event.clientX, event.clientY) - bounds.start,
      bounds.extent,
      this.cards.length,
    );
    const target = index === null ? undefined : this.cards[index];
    if (target === undefined || target.path === this.activePath) {
      return;
    }
    this.environment.runAfterEditing(
      "deck-map-jump",
      () => this.environment.navigate(target.path),
    );
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    const action: DeckMapKeyboardAction | null = event.key === deckAxis(this.orientation).previousKey
      ? "previous-card"
      : event.key === deckAxis(this.orientation).nextKey
        ? "next-card"
        : event.key === "Home"
          ? "first-card"
          : event.key === "End"
            ? "last-card"
            : null;
    if (action === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.environment.runAction(action);
  };

  private readonly handleResize = (): void => {
    this.refreshLayout();
  };
}

function deckMapResizeObserver(
  ownerWindow: Window | null,
): typeof ResizeObserver | null {
  if (ownerWindow === null) {
    return null;
  }
  const candidate: unknown = Reflect.get(ownerWindow, "ResizeObserver");
  return typeof candidate === "function"
    ? candidate as typeof ResizeObserver
    : null;
}
