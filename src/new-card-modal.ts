import { App, Modal } from "obsidian";

import { renderNewCardOptionsForm } from "./new-card-options-dom.js";
import type { NewCardInput } from "./new-note.js";

class NewCardOptionsModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly placeholder: string,
    private readonly resolveValue: (value: NewCardInput | null) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.contentEl.addClass("slipbox-modal");
    const form = renderNewCardOptionsForm(this.contentEl, {
      placeholder: this.placeholder,
      create: (input) => this.finish(input),
      cancel: () => this.finish(null),
    });
    form.titleInput.win.setTimeout(() => {
      form.titleInput.focus();
      form.titleInput.select();
    });
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveValue(null);
    }
  }

  private finish(value: NewCardInput | null): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveValue(value);
    this.close();
  }
}

export function promptForNewCardOptions(
  app: App,
  placeholder: string,
): Promise<NewCardInput | null> {
  return new Promise((resolve) => {
    const modal = new NewCardOptionsModal(app, placeholder, resolve);
    // A Deck shortcut can create the modal during its own keydown. Delay the
    // open so that keystroke cannot become the first title character.
    modal.contentEl.win.setTimeout(() => modal.open());
  });
}
