import {
  Component,
  MarkdownRenderer,
  Menu,
  TFile,
  setIcon,
  setTooltip,
  type App,
} from "obsidian";

import type SlipboxPlugin from "./main.js";
import {
  cardPosition,
  insertionIndexForPoint,
  mergePiles,
  moveCardBetweenPiles,
  moveCardWithinPile,
  reorderPiles,
  splitCardIntoNewPile,
  trayHasFiledCards,
  trayStackJitter,
  type TrayCard,
  type TrayPile,
} from "./tray-state.js";

const DRAG_THRESHOLD_PX = 5;
const AUTO_SCROLL_EDGE_PX = 44;
const AUTO_SCROLL_STEP_PX = 18;

export interface TrayViewActions {
  jumpToFiledCard(id: string): Promise<void>;
  moveCardBy(cardRef: string, delta: -1 | 1): Promise<void>;
}

export class TrayRenderer {
  private components: Component[] = [];
  private rootEl: HTMLElement | null = null;
  private suppressClickUntil = 0;

  constructor(
    private readonly app: App,
    private readonly plugin: SlipboxPlugin,
    private readonly actions: TrayViewActions,
  ) {}

  clear(): void {
    for (const component of this.components) {
      component.unload();
    }
    this.components = [];
    this.rootEl = null;
  }

  async render(
    stage: HTMLElement,
    filing: boolean,
    isCurrent: () => boolean,
  ): Promise<void> {
    const state = this.plugin.tray;
    const cardCount = state.piles.reduce(
      (total, pile) => total + pile.cards.length,
      0,
    );
    if (cardCount === 0) {
      return;
    }

    stage.addClass("has-tray");
    stage.toggleClass("has-compact-tray", filing);
    stage.toggleClass("has-expanded-tray", state.expandedPileId !== null && !filing);
    const tray = stage.createDiv({
      cls: "slipbox-tray",
      attr: { "aria-label": `Tray, ${cardCount} card${cardCount === 1 ? "" : "s"}` },
    });
    this.rootEl = tray;
    tray.toggleClass("is-compact", filing);
    tray.addEventListener("wheel", (event) => event.stopPropagation());
    const controls = tray.createDiv({ cls: "slipbox-tray-controls" });
    controls.createSpan({ cls: "slipbox-tray-title", text: "Tray" });
    controls.createSpan({
      cls: "slipbox-tray-total",
      text: `${state.piles.length} pile${state.piles.length === 1 ? "" : "s"} · ${cardCount} card${cardCount === 1 ? "" : "s"}`,
    });

    if (filing) {
      controls.createSpan({
        cls: "slipbox-tray-filing-note",
        text: "preserved while filing",
      });
      return;
    }

    const clear = controls.createEl("button", {
      text: "Clear",
      attr: { type: "button" },
    });
    clear.disabled = !trayHasFiledCards(state);
    clear.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.plugin.clearTray();
    });

    const piles = tray.createDiv({ cls: "slipbox-tray-piles" });
    const jobs: Promise<void>[] = [];
    state.piles.forEach((pile, pileIndex) => {
      jobs.push(...this.renderPile(
        piles,
        pile,
        pileIndex,
        state.expandedPileId === pile.id,
        isCurrent,
      ));
    });
    await Promise.all(jobs);
  }

  private renderPile(
    parent: HTMLElement,
    pile: TrayPile,
    pileIndex: number,
    expanded: boolean,
    isCurrent: () => boolean,
  ): Promise<void>[] {
    const pileEl = parent.createDiv({
      cls: `slipbox-tray-pile ${expanded ? "is-expanded" : "is-collapsed"}`,
      attr: {
        "data-pile-id": pile.id,
        "aria-label": `Pile ${pileIndex + 1}, ${pile.cards.length} card${
          pile.cards.length === 1 ? "" : "s"
        }`,
      },
    });
    pileEl.tabIndex = 0;

    pileEl.setAttr("role", "button");
    pileEl.setAttr("aria-expanded", String(expanded));
    if (!expanded) {
      this.renderStackLayers(pileEl, pile);
    }
    pileEl.createSpan({
      cls: "slipbox-tray-pile-count",
      text: String(pile.cards.length),
      attr: {
        "aria-label": `${pile.cards.length} card${pile.cards.length === 1 ? "" : "s"}`,
      },
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
      isCurrent,
    ));

    pileEl.addEventListener("click", (event) => {
      if (performance.now() < this.suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest("button, a") !== null
      ) {
        return;
      }
      if (
        expanded &&
        event.target instanceof Element &&
        event.target.closest(".slipbox-tray-card") !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void this.plugin.expandTrayPile(expanded ? null : pile.id);
    });
    pileEl.addEventListener("keydown", (event) => {
      if (
        event.target !== pileEl ||
        (event.key !== "Enter" && event.key !== " ")
      ) {
        return;
      }
      event.preventDefault();
      void this.plugin.expandTrayPile(expanded ? null : pile.id);
    });
    pileEl.addEventListener("contextmenu", (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("button, a") !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.showPileMenu(event, pile);
    });
    this.attachPileDragging(pileEl, pile, expanded);
    return jobs;
  }

  private async renderCard(
    parent: HTMLElement,
    pile: TrayPile,
    card: TrayCard,
    cardIndex: number,
    pileIndex: number,
    expanded: boolean,
    isCurrent: () => boolean,
  ): Promise<void> {
    const file = this.plugin.index.fileAtPath(card.cardRef);
    if (!(file instanceof TFile)) {
      return;
    }
    const filed = this.plugin.index.filedByFile(file);
    const address = filed?.id ?? "unfiled";
    const title = this.plugin.cardTitle(file);
    const miniature = parent.createDiv({
      cls: "slipbox-tray-card",
      attr: {
        "data-card-ref": card.cardRef,
        role: filed === undefined ? "group" : "button",
        "aria-label": `${address}, ${title}; card ${cardIndex + 1} of ${
          pile.cards.length
        } in pile ${pileIndex + 1}`,
      },
    });
    const jitter = trayStackJitter(card.cardRef, cardIndex);
    miniature.style.setProperty(
      "--slipbox-tray-card-tilt",
      `${jitter.rotationDegrees}deg`,
    );
    miniature.tabIndex = expanded ? 0 : -1;
    miniature.toggleClass("is-filed", filed !== undefined);
    miniature.toggleClass("is-unfiled", filed === undefined);

    const identity = miniature.createDiv({ cls: "slipbox-tray-card-identity" });
    identity.createSpan({ cls: "slipbox-tray-card-address", text: address });
    identity.createSpan({ cls: "slipbox-tray-card-title", text: title });
    const controls = miniature.createDiv({ cls: "slipbox-tray-card-actions" });
    if (filed === undefined) {
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
        `Return ${filed.id} · ${title} to Deck`,
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
      cls: "slipbox-tray-card-preview markdown-rendered",
    });
    const component = new Component();
    component.load();
    this.components.push(component);
    try {
      const body = await this.plugin.index.readBody(file);
      if (isCurrent()) {
        await MarkdownRenderer.render(
          this.app,
          body,
          preview,
          file.path,
          component,
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
      if (event.target instanceof Element && event.target.closest("button, a") !== null) {
        return;
      }
      if (!expanded) {
        event.preventDefault();
        event.stopPropagation();
        void this.plugin.expandTrayPile(pile.id);
        return;
      }
      if (filed === undefined) {
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
          event.key === "ArrowLeft" ? -1 : 1,
        );
        return;
      }
      if (event.key === "Enter" && filed !== undefined) {
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
      if (expanded) {
        this.showCardMenu(event, pile, card);
      } else {
        this.showPileMenu(event, pile);
      }
    });
    this.attachCardDragging(miniature, pile, card, expanded);
  }

  private renderStackLayers(parent: HTMLElement, pile: TrayPile): void {
    const hiddenCards = pile.cards.slice(1, 8);
    hiddenCards.forEach((card, index) => {
      const depth = index + 1;
      const jitter = trayStackJitter(card.cardRef, depth);
      const layer = parent.createDiv({
        cls: "slipbox-tray-stack-layer",
        attr: { "aria-hidden": "true" },
      });
      layer.style.setProperty("--slipbox-stack-depth", String(depth));
      layer.style.setProperty("--slipbox-stack-x", `${jitter.offsetX}px`);
      layer.style.setProperty("--slipbox-stack-y", `${jitter.offsetY}px`);
      layer.style.setProperty(
        "--slipbox-stack-tilt",
        `${jitter.rotationDegrees}deg`,
      );
    });
  }

  private showPileMenu(event: MouseEvent, pile: TrayPile): void {
    const menu = Menu.forEvent(event);
    menu.addItem((item) => {
      item
        .setTitle("Lay out pile on active Canvas")
        .setIcon("layout-dashboard")
        .setDisabled(!this.plugin.hasActiveCanvas())
        .onClick(() => void this.plugin.layOutTrayPileOnActiveCanvas(pile.id));
    });
    menu.addItem((item) => {
      item
        .setTitle("Lay out pile on Canvas…")
        .setIcon("layout-template")
        .onClick(() => void this.plugin.layOutTrayPileOnCanvas(pile.id));
    });
    menu.addItem((item) => {
      item
        .setTitle("Create Canvas from pile…")
        .setIcon("file-plus-2")
        .onClick(() => void this.plugin.createCanvasFromTrayPile(pile.id));
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle("Clear pile")
        .setIcon("eraser")
        .setDisabled(!pile.cards.some((card) => card.kind === "filed"))
        .onClick(() => void this.plugin.clearTrayPile(pile.id));
    });
    menu.showAtMouseEvent(event);
  }

  private showCardMenu(event: MouseEvent, pile: TrayPile, card: TrayCard): void {
    const state = this.plugin.tray;
    const position = cardPosition(state, card.cardRef);
    if (position === null) {
      return;
    }
    const menu = Menu.forEvent(event);
    menu.addItem((item) => {
      item
        .setTitle("Move to previous pile")
        .setIcon("arrow-left")
        .setDisabled(position.pileIndex <= 0)
        .onClick(() => {
          const target = state.piles[position.pileIndex - 1];
          if (target !== undefined) {
            void this.moveAndFocus(moveCardBetweenPiles(
              state,
              card.cardRef,
              target.id,
            ), card.cardRef);
          }
        });
    });
    menu.addItem((item) => {
      item
        .setTitle("Move to next pile")
        .setIcon("arrow-right")
        .setDisabled(position.pileIndex >= state.piles.length - 1)
        .onClick(() => {
          const target = state.piles[position.pileIndex + 1];
          if (target !== undefined) {
            void this.moveAndFocus(moveCardBetweenPiles(
              state,
              card.cardRef,
              target.id,
            ), card.cardRef);
          }
        });
    });
    menu.addItem((item) => {
      item
        .setTitle("Split into new pile")
        .setIcon("split")
        .setDisabled(pile.cards.length <= 1)
        .onClick(() => void this.moveAndFocus(splitCardIntoNewPile(
          state,
          card.cardRef,
          this.plugin.createTrayPileId(),
        ), card.cardRef));
    });
    menu.showAtMouseEvent(event);
  }

  private attachCardDragging(
    element: HTMLElement,
    pile: TrayPile,
    card: TrayCard,
    expanded: boolean,
  ): void {
    if (!expanded) {
      return;
    }
    element.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (event.target instanceof Element && event.target.closest("button, a") !== null)
      ) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;
      const pointerId = event.pointerId;
      element.setPointerCapture(pointerId);

      const move = (moveEvent: PointerEvent): void => {
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
        this.autoScroll(moveEvent.clientX, moveEvent.clientY);
      };
      const finish = (upEvent: PointerEvent): void => {
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
          element,
        );
        this.clearDropCues();
        void this.moveAndFocus(next, card.cardRef);
      };
      const cancel = (): void => {
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

  private attachPileDragging(
    element: HTMLElement,
    pile: TrayPile,
    expanded: boolean,
  ): void {
    if (expanded) {
      return;
    }
    element.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (event.target instanceof Element &&
          event.target.closest("button, a") !== null)
      ) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;
      const pointerId = event.pointerId;
      element.setPointerCapture(pointerId);
      const move = (moveEvent: PointerEvent): void => {
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
        this.autoScroll(moveEvent.clientX, moveEvent.clientY);
      };
      const finish = (upEvent: PointerEvent): void => {
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
          element,
        );
        this.clearDropCues();
        void this.plugin.updateTray(next);
      };
      const cancel = (): void => {
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

  private cardDropState(
    cardRef: string,
    x: number,
    y: number,
    dragged: HTMLElement,
  ) {
    const state = this.plugin.tray;
    const targetPileEl = this.elementsBelowPoint(x, y, dragged)
      .find((element) => element.matches(".slipbox-tray-pile")) as HTMLElement | undefined;
    const targetPileId = targetPileEl?.dataset.pileId;
    if (targetPileEl !== undefined && targetPileId !== undefined) {
      const cards = Array.from(targetPileEl.querySelectorAll<HTMLElement>(
        ".slipbox-tray-card:not(.is-dragging)",
      ));
      const insertionIndex = insertionIndexForPoint(
        x,
        cards.map((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left + rect.width / 2;
        }),
      );
      return moveCardBetweenPiles(state, cardRef, targetPileId, insertionIndex);
    }
    const trayEl = this.rootEl?.querySelector<HTMLElement>(".slipbox-tray-piles");
    const trayRect = trayEl?.getBoundingClientRect();
    if (
      trayEl !== null && trayEl !== undefined &&
      trayRect !== undefined &&
      x >= trayRect.left && x <= trayRect.right &&
      y >= trayRect.top && y <= trayRect.bottom
    ) {
      const pileElements = Array.from(trayEl.querySelectorAll<HTMLElement>(
        ".slipbox-tray-pile:not(.is-dragging)",
      ));
      const pileIndex = insertionIndexForPoint(
        y,
        pileElements.map((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top + rect.height / 2;
        }),
      );
      return splitCardIntoNewPile(
        state,
        cardRef,
        this.plugin.createTrayPileId(),
        pileIndex,
      );
    }
    return state;
  }

  private pileDropState(
    sourcePileId: string,
    x: number,
    y: number,
    dragged: HTMLElement,
  ) {
    const state = this.plugin.tray;
    const target = this.elementsBelowPoint(x, y, dragged)
      .find((element) =>
        element.matches(".slipbox-tray-pile") &&
        (element as HTMLElement).dataset.pileId !== sourcePileId,
      ) as HTMLElement | undefined;
    const targetId = target?.dataset.pileId;
    if (target !== undefined && targetId !== undefined) {
      const rect = target.getBoundingClientRect();
      const relativeX = (x - rect.left) / Math.max(1, rect.width);
      const relativeY = (y - rect.top) / Math.max(1, rect.height);
      if (
        relativeX > 0.2 && relativeX < 0.8 &&
        relativeY > 0.2 && relativeY < 0.8
      ) {
        return mergePiles(state, sourcePileId, targetId);
      }
    }
    const sourceIndex = state.piles.findIndex((pile) => pile.id === sourcePileId);
    const container = this.rootEl?.querySelector<HTMLElement>(".slipbox-tray-piles");
    if (sourceIndex < 0 || container === null || container === undefined) {
      return state;
    }
    const pileElements = Array.from(container.querySelectorAll<HTMLElement>(
      ".slipbox-tray-pile:not(.is-dragging)",
    ));
    const insertionIndex = insertionIndexForPoint(
      y,
      pileElements.map((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top + rect.height / 2;
      }),
    );
    return reorderPiles(state, sourceIndex, insertionIndex);
  }

  private updateCardDropCues(
    event: PointerEvent,
    sourcePileId: string,
    dragged: HTMLElement,
  ): void {
    this.clearDropCues(dragged);
    const targetPile = this.elementsBelowPoint(
      event.clientX,
      event.clientY,
      dragged,
    ).find((element) => element.matches(".slipbox-tray-pile")) as HTMLElement | undefined;
    if (targetPile === undefined) {
      return;
    }
    targetPile.addClass(
      targetPile.dataset.pileId === sourcePileId
        ? "is-reorder-target"
        : "is-card-drop-target",
    );
    const targetCard = this.elementsBelowPoint(
      event.clientX,
      event.clientY,
      dragged,
    ).find((element) => element.matches(".slipbox-tray-card"));
    targetCard?.addClass("is-insertion-target");
  }

  private updatePileDropCues(
    event: PointerEvent,
    sourcePileId: string,
    dragged: HTMLElement,
  ): void {
    this.clearDropCues(dragged);
    const target = this.elementsBelowPoint(
      event.clientX,
      event.clientY,
      dragged,
    ).find((element) =>
      element.matches(".slipbox-tray-pile") &&
      (element as HTMLElement).dataset.pileId !== sourcePileId,
    ) as HTMLElement | undefined;
    if (target === undefined) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / Math.max(1, rect.width);
    const relativeY = (event.clientY - rect.top) / Math.max(1, rect.height);
    target.addClass(
      relativeX > 0.2 && relativeX < 0.8 &&
      relativeY > 0.2 && relativeY < 0.8
      ? "is-merge-target"
      : "is-reorder-target",
    );
  }

  private elementsBelowPoint(
    x: number,
    y: number,
    dragged: HTMLElement,
  ): Element[] {
    const previous = dragged.style.pointerEvents;
    dragged.style.pointerEvents = "none";
    const elements = document.elementsFromPoint(x, y);
    dragged.style.pointerEvents = previous;
    return elements;
  }

  private autoScroll(clientX: number, clientY: number): void {
    const container = this.rootEl?.querySelector<HTMLElement>(".slipbox-tray-piles");
    if (container === null || container === undefined) {
      return;
    }
    const rect = container.getBoundingClientRect();
    if (clientY < rect.top + AUTO_SCROLL_EDGE_PX) {
      container.scrollTop -= AUTO_SCROLL_STEP_PX;
    } else if (clientY > rect.bottom - AUTO_SCROLL_EDGE_PX) {
      container.scrollTop += AUTO_SCROLL_STEP_PX;
    }

    const sequence = Array.from(container.querySelectorAll<HTMLElement>(
      ".slipbox-tray-pile.is-expanded .slipbox-tray-sequence",
    )).find((element) => {
      const bounds = element.getBoundingClientRect();
      return clientX >= bounds.left && clientX <= bounds.right &&
        clientY >= bounds.top && clientY <= bounds.bottom;
    });
    if (sequence === undefined) {
      return;
    }
    const sequenceRect = sequence.getBoundingClientRect();
    if (clientX < sequenceRect.left + AUTO_SCROLL_EDGE_PX) {
      sequence.scrollLeft -= AUTO_SCROLL_STEP_PX;
    } else if (clientX > sequenceRect.right - AUTO_SCROLL_EDGE_PX) {
      sequence.scrollLeft += AUTO_SCROLL_STEP_PX;
    }
  }

  private clearDropCues(except?: HTMLElement): void {
    this.rootEl?.querySelectorAll<HTMLElement>(
      ".is-dragging, .is-merge-target, .is-reorder-target, " +
      ".is-card-drop-target, .is-insertion-target",
    ).forEach((element) => {
      if (element === except) {
        return;
      }
      element.removeClasses([
        "is-dragging",
        "is-merge-target",
        "is-reorder-target",
        "is-card-drop-target",
        "is-insertion-target",
      ]);
      element.style.translate = "";
    });
    this.rootEl?.removeClass("is-dragging-card");
  }

  private async moveAndFocus(nextState: ReturnType<typeof reorderPiles>, cardRef: string) {
    await this.plugin.updateTray(nextState);
    window.requestAnimationFrame(() => {
      const escaped = CSS.escape(cardRef);
      this.rootEl
        ?.querySelector<HTMLElement>(`.slipbox-tray-card[data-card-ref="${escaped}"]`)
        ?.focus({ preventScroll: true });
    });
  }
}

function trayIconButton(
  parent: HTMLElement,
  icon: Parameters<typeof setIcon>[1],
  label: string,
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "clickable-icon slipbox-tray-card-action",
    attr: { type: "button", "aria-label": label },
  });
  setIcon(button, icon);
  setTooltip(button, label, { placement: "bottom", delay: 250 });
  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  return button;
}
