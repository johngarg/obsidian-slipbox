import type { App } from "obsidian";
import { Component, MarkdownRenderer, TFile } from "obsidian";
import type { BookmarkService } from "./bookmark-service.js";
import { UNFILED_ADDRESS_LABEL } from "./card-address.js";
import { applyCardColor } from "./card-color.js";
import {
  configureRenderedCardBody,
  shouldRenderAutomaticBacklinks,
} from "./card-display.js";
import {
  CardFooterManager,
  type CardFooterEnvironment,
} from "./card-footer.js";
import {
  renderCardHeaderButtons,
  type CardHeaderButtonController,
} from "./card-header-buttons.js";
import type { CardIndex } from "./card-index.js";
import { CardLinkPresenter } from "./card-link-presenter.js";
import type { CardService } from "./card-service.js";
import { CardSignatureManager, type CardSignatureEnvironment } from "./card-signature.js";
import { cardHeaderTitle } from "./card-title.js";
import { setCardTooltip } from "./card-tooltip.js";
import type { DeskService } from "./desk-service.js";
import {
  attachUnfiledAddressFiling,
  filingEditorMatchesSource,
  renderInlineFilingEditor,
  type InlineFilingEditorElements,
} from "./filing-editor.js";
import {
  type FilingSessionSnapshot,
} from "./filing-session.js";
import {
  isInlineEditBodyTarget,
} from "./inline-edit-interactions.js";
import {
  beginThresholdPointerDrag,
} from "./pointer-drag.js";
import { applyRenderedLinkAccessibility } from "./rendered-link-interactions.js";
import {
  type SlipboxAction,
  type SlipboxSettings,
} from "./settings.js";
import { errorMessage } from "./value-utils.js";
import {
  ViewedCardSession,
} from "./viewed-card.js";

export interface ViewedCardEnvironment {
  readonly app: App;
  readonly index: CardIndex;
  readonly cards: CardService;
  readonly bookmarks: BookmarkService;
  readonly session: ViewedCardSession;
  readonly links: CardLinkPresenter;
  readonly footer: CardFooterEnvironment;
  readonly signature: CardSignatureEnvironment;
  settings(): SlipboxSettings;
  stage(): HTMLElement | null;
  filing(): FilingSessionSnapshot | null;
  deskPosition(path: string): ReturnType<DeskService["positionOf"]>;
  isFocused(path: string): boolean;
  focus(path: string): void;
  filingFocusChanged(focused: boolean): void;
  updateFilingInput(value: string): void;
  confirmFiling(): Promise<void>;
  cancelFiling(): Promise<void>;
  previewFilingPlacement(): Promise<void>;
  applyFilingGuidance(input: HTMLInputElement, guidance: FilingSessionSnapshot["guidance"]): void;
  runAction(action: SlipboxAction): boolean;
  runCardAction(action: SlipboxAction, path: string, surface: "viewed"): boolean;
  editCardOnDesk(file: TFile): Promise<void>;
  jumpToPath(path: string): Promise<void>;
  showCardMenu(event: MouseEvent, file: TFile, address: string | null, surface: "viewed", returnSurface: "deck" | "desk"): void;
}

const VIEWED_CARD_DRAG_THRESHOLD_PX = 5;

/** Own the viewed card's mounted presentation; the view retains its session and workflow. */
export class ViewedCardRenderer {
  cardEl: HTMLElement | null = null;
  bodyEl: HTMLElement | null = null;
  filingEditor: InlineFilingEditorElements | null = null;
  private component: Component | null = null;
  private markdownEl: HTMLElement | null = null;
  private headerButtons: CardHeaderButtonController | null = null;
  readonly footers: CardFooterManager;
  readonly signatures: CardSignatureManager;
  private generation = 0;
  private positionFrame: number | null = null;
  private cancelDrag: (() => void) | null = null;

  constructor(private readonly environment: ViewedCardEnvironment) {
    this.footers = new CardFooterManager(environment.footer);
    this.signatures = new CardSignatureManager(environment.signature);
  }

  focus(): void {
    const path = this.environment.session.snapshot?.path;
    if (path === undefined) return;
    this.environment.focus(path);
    this.cardEl?.focus({ preventScroll: true });
  }

  async render(stage: HTMLElement): Promise<void> {
    this.clear();
    const version = this.generation;
    const state = this.environment.session.snapshot;
    if (state === null) {
      return;
    }
    const file = this.environment.index.fileAtPath(state.path);
    if (file === undefined) {
      if (this.environment.session.remove(state.path) !== null) {
        this.clear();
      }
      return;
    }
    const filed = this.environment.index.filedByFile(file);
    const address = filed?.address ?? null;
    const filing = this.environment.filing();
    const isFilingSource = filed === undefined &&
      filing !== null &&
      filingEditorMatchesSource(
        filing.sourcePath,
        filing.sourceSurface,
        file.path,
        "viewed",
      );
    const displayTitle = this.environment.cards.displayTitle(file);
    const title = displayTitle ?? file.basename;
    const layer = stage.createDiv({ cls: "slipbox-viewed-card-layer" });
    const card = layer.createDiv({
      cls: "slipbox-card slipbox-viewed-card",
      attr: {
        role: "group",
        tabindex: "0",
      },
    });
    setCardTooltip(
      card,
      `Viewed card ${address ?? UNFILED_ADDRESS_LABEL} · ${title}`,
      false,
    );
    card.toggleClass(
      "is-card-focused",
      this.environment.isFocused(file.path),
    );
    card.toggleClass("is-filing-source", isFilingSource);
    card.addEventListener("focusin", () => {
      this.environment.focus(file.path);
    });
    card.dataset.path = file.path;
    applyCardColor(card, this.environment.cards.color(file));
    card.toggleClass("is-bookmarked", filed !== undefined &&
      this.environment.bookmarks.at(filed.path) !== undefined);
    this.cardEl = card;
    this.applyPosition();

    const frame = card.createDiv({ cls: "slipbox-card-frame" });
    const addressRow = frame.createDiv({
      cls: "slipbox-card-address-row slipbox-viewed-card-drag-handle",
    });
    setCardTooltip(
      addressRow,
      "Drag to move viewed card",
      this.environment.settings().showTooltips,
      { placement: "top", delay: 500 },
    );
    const identity = addressRow.createDiv({ cls: "slipbox-card-header-identity" });
    const addressEl = this.signatures.render(identity, {
      path: file.path,
      address,
      addressClass: "slipbox-card-address",
      interactive: true,
    });
    if (isFilingSource && filing !== null) {
      this.filingEditor = renderInlineFilingEditor(
        addressEl,
        card,
        filing,
        {
          showTooltips: this.environment.settings().showTooltips,
          onInput: (value) => this.environment.updateFilingInput(value),
          onConfirm: () => void this.environment.confirmFiling(),
          onCancel: () => void this.environment.cancelFiling(),
          onPreview: () => void this.environment.previewFilingPlacement(),
          onFocusChange: (focused) => this.environment.filingFocusChanged(focused),
        },
      );
      this.environment.applyFilingGuidance(
        this.filingEditor.input,
        filing.guidance,
      );
    } else if (filed === undefined) {
      setCardTooltip(
        addressEl,
        "Unfiled card address; double-click to enter an address",
        this.environment.settings().showTooltips,
        { placement: "bottom", delay: 350 },
      );
      attachUnfiledAddressFiling(addressEl, () => {
        this.focus();
        this.environment.runAction("file-card");
      });
    }
    const headerTitle = cardHeaderTitle(
      displayTitle,
      this.environment.settings().showTitleInDeck,
    );
    if (headerTitle !== null) {
      identity.createSpan({ cls: "slipbox-card-header-title", text: headerTitle });
    }
    const viewedPosition = this.environment.deskPosition(file.path);
    if (!isFilingSource) {
      const actions = addressRow.createDiv({ cls: "slipbox-card-actions" });
      this.headerButtons = renderCardHeaderButtons({
        container: actions,
        context: {
          surface: "viewed",
          viewedReturnSurface: state.returnTarget.surface,
          filed: filed !== undefined,
          onDesk: viewedPosition !== null,
          bookmarked: filed !== undefined &&
            this.environment.bookmarks.at(filed.path) !== undefined,
          canMoveLeft: false,
          canMoveRight: false,
        },
        settings: this.environment.settings().cardHeaderButtons,
        buttonClass: "slipbox-card-toggle",
        showTooltips: this.environment.settings().showTooltips,
        tooltipPlacement: "bottom",
        run: (action) => this.environment.runCardAction(action, file.path, "viewed"),
      });
    }

    const body = frame.createDiv({ cls: "slipbox-card-scroll markdown-rendered" });
    configureRenderedCardBody(
      body,
      this.environment.settings().allowCardScrolling,
      state.scrollTop,
    );
    body.addEventListener("scroll", () => {
      this.environment.session.setScrollTop(file.path, body.scrollTop);
    }, { passive: true });
    body.addEventListener("dblclick", (event) => {
      if (!isInlineEditBodyTarget(event.target, body)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.focus();
      void this.environment.editCardOnDesk(file);
    });
    this.bodyEl = body;
    if (shouldRenderAutomaticBacklinks(
      this.environment.settings().showAutomaticBacklinks,
      filed !== undefined,
    ) && filed !== undefined) {
      this.footers.render(frame, {
        sourcePath: filed.path,
        backlinks: this.environment.index.backlinksForPath(filed.path),
        interactive: true,
        activate: (backlink) => this.environment.jumpToPath(backlink.path),
      });
    }
    card.addEventListener("contextmenu", (event) => {
      const target = event.targetNode;
      if (
        target?.instanceOf(Element) !== true ||
        target.closest("a, button, input, textarea, select") !== null
      ) {
        return;
      }
      this.focus();
      this.environment.showCardMenu(
        event,
        file,
        filed?.address ?? null,
        "viewed",
        state.returnTarget.surface,
      );
    });
    this.attachDragging(addressRow, card);
    await this.renderBody(file, body);
    if (version !== this.generation || this.cardEl !== card) {
      return;
    }
    this.positionFrame = card.win.requestAnimationFrame(() => {
      this.positionFrame = null;
      if (this.cardEl === card) {
        this.constrain();
      }
    });
  }

  async renderBody(
    file: TFile,
    target: HTMLElement,
  ): Promise<void> {
    this.unloadMarkdown();
    const component = new Component();
    component.load();
    this.component = component;
    try {
      const body = await this.environment.index.readBody(file);
      if (
        !this.environment.session.isViewing(file.path) ||
        this.component !== component ||
        !target.isConnected
      ) {
        return;
      }
      // Keep each render's container mounted: postprocessors can retain it or
      // wait for visible content. Detaching it on unload isolates late writes.
      target.empty();
      const rendered = target.createDiv({ cls: "slipbox-viewed-card-content" });
      this.markdownEl = rendered;
      const rendering = MarkdownRenderer.render(
        this.environment.app,
        body,
        rendered,
        file.path,
        component,
      );
      this.environment.links.attach(rendered, file.path, "rendered-link");
      // Restore scrolling after content expands: an early clamped scroll event
      // would overwrite the session's saved position.
      await rendering;
      if (this.component !== component || !target.isConnected) return;
      this.environment.links.outline(rendered, file);
      applyRenderedLinkAccessibility(
        rendered,
        this.environment.settings().followLinksFromCards,
        this.environment.settings().showTooltips,
      );
      configureRenderedCardBody(
        target,
        this.environment.settings().allowCardScrolling,
        this.environment.session.snapshot?.scrollTop ?? 0,
      );
    } catch (error) {
      if (this.component !== component || !target.isConnected) return;
      target.createEl("p", {
        cls: "slipbox-render-error",
        text: `Could not render this card: ${errorMessage(error)}`,
      });
    }
  }

  private attachDragging(
    handle: HTMLElement,
    card: HTMLElement,
  ): void {
    handle.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (
          event.targetNode?.instanceOf(Element) === true &&
          event.targetNode.closest("button, a, input, textarea, select") !== null
        )
      ) {
        return;
      }
      const origin = this.environment.session.capturePosition();
      if (origin === null) {
        return;
      }
      card.focus({ preventScroll: true });
      this.cancelDrag?.();
      this.cancelDrag = beginThresholdPointerDrag({
        captureTarget: handle,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        threshold: VIEWED_CARD_DRAG_THRESHOLD_PX,
        onDragStart: () => card.addClass("is-dragging"),
        onDragMove: (_moveEvent, dx, dy) => {
          if (this.environment.session.moveFrom(
            origin,
            dx,
            dy,
            this.bounds(card),
          )) {
            this.applyPosition();
          }
        },
        onDrop: () => card.removeClass("is-dragging"),
        onCancel: () => {
          card.removeClass("is-dragging");
          if (this.environment.session.restorePosition(origin)) {
            this.applyPosition();
          }
        },
      });
    });
  }

  private bounds(card: HTMLElement) {
    const stage = this.environment.stage();
    return {
      stageWidth: stage?.clientWidth ?? 0,
      stageHeight: stage?.clientHeight ?? 0,
      cardWidth: card.offsetWidth,
      cardHeight: card.offsetHeight,
    };
  }

  private applyPosition(): void {
    const state = this.environment.session.snapshot;
    const card = this.cardEl;
    if (state === null || card === null) {
      return;
    }
    card.style.setProperty("--slipbox-viewed-card-x", `${state.x}px`);
    card.style.setProperty("--slipbox-viewed-card-y", `${state.y}px`);
  }

  constrain(): void {
    const card = this.cardEl;
    if (card === null) {
      return;
    }
    if (this.environment.session.constrain(this.bounds(card))) {
      this.applyPosition();
    }
  }

  private clearHeaderButtons(): void {
    this.headerButtons?.disconnect();
    this.headerButtons = null;
  }

  clear(): void {
    this.generation++;
    this.cancelDrag?.();
    this.cancelDrag = null;
    if (this.positionFrame !== null) this.cardEl?.win.cancelAnimationFrame(this.positionFrame);
    this.positionFrame = null;
    this.cardEl?.parentElement?.remove();
    this.footers.clear();
    this.signatures.clear();
    this.cardEl = null;
    this.bodyEl = null;
    this.filingEditor = null;
    this.clearHeaderButtons();
    this.unloadMarkdown();
  }

  rememberScroll(): void {
    const viewed = this.environment.session.snapshot;
    if (viewed !== null && this.bodyEl !== null) {
      this.environment.session.setScrollTop(
        viewed.path,
        this.bodyEl.scrollTop,
      );
    }
  }

  unloadMarkdown(): void {
    const component = this.component;
    this.component = null;
    this.markdownEl?.remove();
    this.markdownEl = null;
    component?.unload();
  }
}
