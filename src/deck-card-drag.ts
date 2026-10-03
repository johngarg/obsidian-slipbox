import type { CardIndex, FiledCard } from "./card-index.js";
import {
  deckCardDropTarget,
  resolveDeckCardDrop,
  type DeckCardDropTarget,
  type ResolvedDeckCardDrop,
} from "./desk-drop.js";
import type { DeskService } from "./desk-service.js";
import type { DeskPilePosition } from "./desk-state.js";
import {
  cardPosition,
} from "./desk-state.js";
import { findDeskCard } from "./dom.js";
import {
  beginPointerActionAfterGate,
  beginThresholdPointerDrag,
  deckHeaderDragIntent,
} from "./pointer-drag.js";
import type { DeckOrientation } from "./settings.js";

interface DeckCardDragEnvironment {
  readonly root: HTMLElement;
  readonly desk: Pick<DeskService, "snapshot" | "createPileId" | "replace">;
  readonly index: Pick<CardIndex, "filedByPath">;
  stage(): HTMLElement | null;
  space(): HTMLElement | null;
  cardsContainer(): HTMLElement | null;
  orientation(): DeckOrientation;
  offset(): { x: number; y: number; };
  panTo(x: number, y: number): void;
  cancelMotion(): void;
  afterPan(): void;
  updateBranchPosition(): void;
  positionAtPoint(x: number, y: number): DeskPilePosition | null;
  assignFocus(path: string, pileId: string): void;
  runAfterEditing(reason: string, action: () => void): Promise<boolean>;
}

const DECK_CARD_DRAG_THRESHOLD_PX = 5;
const DECK_CARD_CLICK_SUPPRESSION_MS = 400;

/** Own header pointer sessions and drop presentation independently of Deck navigation. */
export class DeckCardDragController {
  private readonly bindings = new Map<HTMLElement, () => void>();
  private suppressedUntil = 0;
  private generation = 0;
  private disposed = false;
  private focusFrame: { ownerWindow: Window; handle: number; } | null = null;

  constructor(private readonly environment: DeckCardDragEnvironment) { }

  suppressesClick(now: number): boolean { return now < this.suppressedUntil; }

  removeCard(card: HTMLElement): void {
    this.bindings.get(card)?.();
    this.bindings.delete(card);
  }

  clear(): void {
    this.generation++;
    for (const remove of this.bindings.values()) remove();
    this.bindings.clear();
    this.cancelFocus();
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
  }

  private cancelFocus(): void {
    if (this.focusFrame !== null) this.focusFrame.ownerWindow.cancelAnimationFrame(this.focusFrame.handle);
    this.focusFrame = null;
  }

  attach(
    header: HTMLElement,
    cardEl: HTMLElement,
    card: FiledCard,
  ): void {
    this.removeCard(cardEl);
    let cancelGate: (() => void) | null = null;
    let cancelDrag: (() => void) | null = null;
    const pointerDown = (event: PointerEvent): void => {
      if (
        event.button !== 0 ||
        (
          event.targetNode?.instanceOf(Element) === true &&
          event.targetNode.closest(
            ".slipbox-card-actions, button, a, input, textarea, select, " +
            "[contenteditable='true']",
          ) !== null
        )
      ) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      cancelGate?.();
      cancelDrag?.();
      const generation = this.generation;
      cancelGate = beginPointerActionAfterGate(
        event,
        (action) => this.environment.runAfterEditing("deck-card-drag", action),
        () => {
          if (this.disposed || generation !== this.generation || !this.bindings.has(cardEl) || !header.isConnected || !cardEl.isConnected) {
            return;
          }
          let intent: "desk" | "pan" = "desk";
          let origin = this.environment.offset();
          cancelDrag = beginThresholdPointerDrag({
            captureTarget: header,
            pointerId,
            startX,
            startY,
            threshold: DECK_CARD_DRAG_THRESHOLD_PX,
            onDragStart: (dx, dy) => {
              intent = deckHeaderDragIntent(this.environment.orientation() === "vertical", dx, dy);
              this.environment.cancelMotion();
              origin = this.environment.offset();
              if (intent === "pan") {
                this.environment.stage()?.addClass("is-dragging");
                return;
              }
              this.environment.space()?.append(cardEl);
              cardEl.addClass("is-dragging-to-desk");
              this.environment.updateBranchPosition();
            },
            onDragMove: (moveEvent, dx, dy) => {
              if (intent === "pan") {
                this.environment.panTo(origin.x + dx, origin.y + dy);
                return;
              }
              cardEl.style.translate = `${dx}px ${dy}px`;
              this.updateDropCue(moveEvent, cardEl);
            },
            onDrop: (upEvent) => {
              this.environment.stage()?.removeClass("is-dragging");
              if (intent === "pan") {
                this.suppressedUntil = upEvent.win.performance.now() + DECK_CARD_CLICK_SUPPRESSION_MS;
                this.environment.afterPan();
                return;
              }
              this.suppressedUntil = upEvent.win.performance.now() +
                DECK_CARD_CLICK_SUPPRESSION_MS;
              const result = this.dropResult(
                card,
                upEvent.clientX,
                upEvent.clientY,
                cardEl,
              );
              this.clearDrag(cardEl);
              if (result === null) {
                return;
              }
              this.environment.assignFocus(result.focusPath, result.pileId);
              void this.applyDrop(result);
            },
            onCancel: () => {
              this.suppressedUntil = cardEl.win.performance.now() +
                DECK_CARD_CLICK_SUPPRESSION_MS;
              this.clearDrag(cardEl);
            },
          });
        },
      );
    };
    header.addEventListener("pointerdown", pointerDown);
    this.bindings.set(cardEl, () => {
      header.removeEventListener("pointerdown", pointerDown);
      cancelGate?.();
      cancelDrag?.();
    });
  }

  private dropResult(
    card: FiledCard,
    x: number,
    y: number,
    dragged: HTMLElement,
  ): ResolvedDeckCardDrop | null {
    const state = this.environment.desk.snapshot;
    if (
      this.environment.index.filedByPath(card.path) === undefined ||
      cardPosition(state, card.path) !== null
    ) {
      return null;
    }
    const target = this.targetAtPoint(x, y, dragged);
    if (target?.kind === "pile") {
      const pileId = target.pile.dataset.pileId;
      if (pileId === undefined) {
        return null;
      }
      return resolveDeckCardDrop(state, card.path, {
        kind: "pile",
        pileId,
      });
    }
    if (target?.kind !== "workspace") {
      return null;
    }
    const position = this.environment.positionAtPoint(x, y);
    if (position === null) {
      return null;
    }
    const pileId = this.environment.desk.createPileId();
    return resolveDeckCardDrop(state, card.path, {
      kind: "workspace",
      pileId,
      position,
    });
  }

  private targetAtPoint(
    x: number,
    y: number,
    dragged: HTMLElement,
  ): DeckCardDropTarget | null {
    return deckCardDropTarget(this.elementsBelow(x, y, dragged));
  }

  private elementsBelow(
    x: number,
    y: number,
    dragged: HTMLElement,
  ): Element[] {
    dragged.addClass("slipbox-ignore-pointer-events");
    try {
      return dragged.doc.elementsFromPoint(x, y);
    } finally {
      dragged.removeClass("slipbox-ignore-pointer-events");
    }
  }

  private updateDropCue(
    event: PointerEvent,
    dragged: HTMLElement,
  ): void {
    this.clearDropCues();
    const target = this.targetAtPoint(
      event.clientX,
      event.clientY,
      dragged,
    );
    if (target?.kind === "pile") {
      target.pile.addClass("is-card-drop-target");
    }
  }

  private clearDropCues(): void {
    this.environment.stage()?.querySelectorAll<HTMLElement>(
      ".slipbox-desk-pile.is-card-drop-target",
    ).forEach((pile) => pile.removeClass("is-card-drop-target"));
  }

  private clearDrag(card: HTMLElement): void {
    this.environment.stage()?.removeClass("is-dragging");
    if (card.parentElement === this.environment.space()) this.environment.cardsContainer()?.append(card);
    card.removeClass("is-dragging-to-desk");
    card.setCssProps({ translate: "" });
    this.environment.updateBranchPosition();
    this.clearDropCues();
  }

  private async applyDrop(result: ResolvedDeckCardDrop): Promise<void> {
    await this.environment.desk.replace(result.state);
    if (this.disposed || !this.environment.root.isConnected) return;
    this.cancelFocus();
    const ownerWindow = this.environment.root.win;
    const handle = ownerWindow.requestAnimationFrame(() => {
      this.focusFrame = null;
      if (!this.disposed) findDeskCard(this.environment.stage(), result.focusPath)?.focus({ preventScroll: true });
    });
    this.focusFrame = { ownerWindow, handle };
  }
}
