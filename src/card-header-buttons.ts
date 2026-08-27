import { Menu, setIcon } from "obsidian";

import {
  cardHeaderVisibleActionCount,
  enabledCardHeaderActions,
  type CardHeaderActionContext,
  type CardHeaderActionPresentation,
} from "./card-header-actions.js";
import type {
  CardHeaderButtonSettings,
  SlipboxAction,
} from "./settings.js";
import {
  preventPointerActivatedButtonFocus,
  releasePointerActivatedButtonFocus,
} from "./pointer-button-focus.js";
import { setCardTooltip } from "./card-tooltip.js";

export interface CardHeaderButtonRenderOptions {
  readonly container: HTMLElement;
  readonly context: CardHeaderActionContext;
  readonly settings: CardHeaderButtonSettings;
  readonly buttonClass: string;
  readonly showTooltips: boolean;
  readonly tooltipPlacement: "bottom" | "top";
  readonly run: (action: SlipboxAction) => void;
}

interface RenderedAction {
  readonly presentation: CardHeaderActionPresentation;
  readonly button: HTMLButtonElement;
}

export class CardHeaderButtonController {
  private readonly rendered: readonly RenderedAction[];
  private readonly moreButton: HTMLButtonElement;
  private readonly observer: ResizeObserver;
  private overflowed: readonly RenderedAction[] = [];
  private frame: number | null = null;

  constructor(private readonly options: CardHeaderButtonRenderOptions) {
    options.container.addClass("is-awaiting-layout");
    this.rendered = enabledCardHeaderActions(
      options.settings,
      options.context,
    ).map((presentation) => ({
      presentation,
      button: this.renderButton(presentation),
    }));
    this.moreButton = this.renderMoreButton();
    const ownerWindow = options.container.ownerDocument.defaultView;
    if (ownerWindow === null) {
      throw new Error("Card-header controls require an attached document");
    }
    this.observer = new ownerWindow.ResizeObserver(() =>
      this.scheduleLayout());
    this.observer.observe(options.container);
    const parent = options.container.parentElement;
    if (parent !== null) {
      this.observer.observe(parent);
    }
    this.scheduleLayout();
  }

  disconnect(): void {
    this.observer.disconnect();
    if (this.frame !== null) {
      this.options.container.win.cancelAnimationFrame(this.frame);
    }
    this.frame = null;
  }

  private renderButton(
    presentation: CardHeaderActionPresentation,
  ): HTMLButtonElement {
    const button = this.options.container.createEl("button", {
      cls: `clickable-icon slipbox-card-header-action ${this.options.buttonClass}`,
      attr: {
        type: "button",
        "data-slipbox-action": presentation.action,
      },
    });
    setIcon(button, presentation.icon);
    setCardTooltip(button, presentation.label, this.options.showTooltips, {
      placement: this.options.tooltipPlacement,
      delay: 250,
    });
    if (presentation.pressed !== undefined) {
      button.setAttr("aria-pressed", String(presentation.pressed));
      button.toggleClass("is-pressed", presentation.pressed);
    }
    button.toggleClass("is-warning", presentation.warning === true);
    button.addEventListener("pointerdown", (event) =>
      preventPointerActivatedButtonFocus(event));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.options.run(presentation.action);
      releasePointerActivatedButtonFocus(button, event);
    });
    return button;
  }

  private renderMoreButton(): HTMLButtonElement {
    const button = this.options.container.createEl("button", {
      cls: `clickable-icon slipbox-card-header-action slipbox-card-actions-more ${this.options.buttonClass}`,
      attr: {
        type: "button",
      },
    });
    setIcon(button, "ellipsis");
    setCardTooltip(button, "More card actions", this.options.showTooltips, {
      placement: this.options.tooltipPlacement,
      delay: 250,
    });
    button.hidden = true;
    button.addEventListener("pointerdown", (event) =>
      preventPointerActivatedButtonFocus(event));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = Menu.forEvent(event);
      for (const { presentation, button: actionButton } of this.overflowed) {
        menu.addItem((item) => {
          item
            .setTitle(actionButton.getAttribute("aria-label") ?? presentation.label)
            .setIcon(presentation.icon)
            .setWarning(presentation.warning === true)
            .onClick(() => this.options.run(presentation.action));
        });
      }
      menu.showAtMouseEvent(event);
    });
    return button;
  }

  private scheduleLayout(): void {
    if (this.frame !== null) {
      return;
    }
    const ownerWindow = this.options.container.win;
    this.frame = ownerWindow.requestAnimationFrame(() => {
      this.frame = null;
      this.layout();
    });
  }

  private layout(): void {
    for (const { button } of this.rendered) {
      button.hidden = false;
    }
    this.moreButton.hidden = true;
    this.overflowed = [];
    if (this.rendered.length === 0) {
      this.options.container.removeClass("is-awaiting-layout");
      return;
    }

    const container = this.options.container;
    const available = container.clientWidth;
    if (available <= 0) {
      return;
    }
    const style = container.win.getComputedStyle(container);
    const rawGap = style?.columnGap === "normal" ? "0" : style?.columnGap;
    const gap = Number.parseFloat(rawGap ?? "0") || 0;
    const widths = this.rendered.map(({ button }) => button.offsetWidth);
    this.moreButton.hidden = false;
    const moreWidth = this.moreButton.offsetWidth;
    const visibleCount = cardHeaderVisibleActionCount(
      widths,
      moreWidth,
      gap,
      available,
    );
    if (visibleCount === this.rendered.length) {
      this.moreButton.hidden = true;
      container.removeClass("is-awaiting-layout");
      return;
    }

    for (let index = visibleCount; index < this.rendered.length; index += 1) {
      this.rendered[index]?.button.toggleAttribute("hidden", true);
    }
    this.overflowed = this.rendered.slice(visibleCount);
    container.removeClass("is-awaiting-layout");
  }
}

export function renderCardHeaderButtons(
  options: CardHeaderButtonRenderOptions,
): CardHeaderButtonController {
  return new CardHeaderButtonController(options);
}
