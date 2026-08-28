import {
  App,
  FuzzySuggestModal,
  Modal,
  Notice,
  SuggestModal,
  TFile,
  setIcon,
} from "obsidian";

import type { DeckBookmark } from "./bookmarks.js";
import type { VaultCardIndex } from "./card-index.js";
import {
  issueListDescription,
  type DuplicateAddressPolicy,
} from "./card-metadata.js";
import {
  matchCardLinkSuggestions,
  type CardLinkSuggestion,
} from "./card-link-suggestions.js";
import { modalChoice, type ModalChoice } from "./modal-choice.js";

export class TextPromptModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly heading: string,
    private readonly placeholder: string,
    private readonly initialValue: string,
    private readonly resolveValue: (value: string | null) => void,
    private readonly allowBlank = false,
    private readonly submitLabel = "Save",
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("slipbox-modal");
    contentEl.createEl("h2", { text: this.heading });

    const form = contentEl.createEl("form", { cls: "slipbox-prompt-form" });
    const input = form.createEl("input", {
      type: "text",
      placeholder: this.placeholder,
      value: this.initialValue,
    });
    input.required = !this.allowBlank;

    const actions = form.createDiv({ cls: "slipbox-modal-actions" });
    const cancel = actions.createEl("button", { text: "Cancel", type: "button" });
    const submit = actions.createEl("button", {
      text: this.submitLabel,
      type: "submit",
      cls: "mod-cta",
    });

    cancel.addEventListener("click", () => this.finish(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (value === "" && !this.allowBlank) {
        new Notice("A name is required.");
        return;
      }
      this.finish(value);
    });
    activateDefaultButtonOnEnter(contentEl, submit);

    input.win.setTimeout(() => {
      input.focus();
      input.select();
    });
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveValue(null);
    }
  }

  private finish(value: string | null): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveValue(value);
    this.close();
  }
}

class CanvasPromptModal extends FuzzySuggestModal<TFile> {
  private readonly choice: ModalChoice<TFile>;

  constructor(
    app: App,
    private readonly files: readonly TFile[],
    resolveFile: (file: TFile | null) => void,
  ) {
    super(app);
    this.choice = modalChoice(resolveFile, (task) => {
      this.contentEl.win.setTimeout(task);
    });
    this.setPlaceholder("Choose a Canvas (Esc to cancel)");
  }

  getItems(): TFile[] {
    return [...this.files];
  }

  getItemText(file: TFile): string {
    return file.path.slice(0, -".canvas".length);
  }

  onChooseItem(file: TFile): void {
    this.choice.choose(file);
  }

  override onClose(): void {
    super.onClose();
    this.choice.cancel();
  }
}

export function promptForCanvas(
  app: App,
  files: readonly TFile[],
): Promise<TFile | null> {
  return new Promise((resolve) => {
    new CanvasPromptModal(app, files, resolve).open();
  });
}

class CardLinkSuggestModal extends SuggestModal<CardLinkSuggestion> {
  private readonly choice: ModalChoice<CardLinkSuggestion>;

  constructor(
    app: App,
    private readonly suggestions: readonly CardLinkSuggestion[],
    resolveSuggestion: (suggestion: CardLinkSuggestion | null) => void,
  ) {
    super(app);
    this.choice = modalChoice(resolveSuggestion, (task) => {
      this.contentEl.win.setTimeout(task);
    });
    this.setPlaceholder("Card address or title (Esc to cancel)");
    this.emptyStateText = "No filed card matches.";
  }

  getSuggestions(query: string): CardLinkSuggestion[] {
    return [...matchCardLinkSuggestions(this.suggestions, query)];
  }

  renderSuggestion(suggestion: CardLinkSuggestion, el: HTMLElement): void {
    el.addClass("slipbox-card-link-suggestion");
    el.createDiv({
      cls: "slipbox-card-link-address",
      text: suggestion.address,
    });
    el.createDiv({ cls: "slipbox-card-link-title", text: suggestion.title });
    if (suggestion.ambiguous) {
      el.createDiv({ cls: "slipbox-card-link-path", text: suggestion.path });
    }
  }

  onChooseSuggestion(suggestion: CardLinkSuggestion): void {
    this.choice.choose(suggestion);
  }

  override onClose(): void {
    super.onClose();
    this.choice.cancel();
  }
}

export function promptForCardLink(
  app: App,
  suggestions: readonly CardLinkSuggestion[],
): Promise<CardLinkSuggestion | null> {
  return new Promise((resolve) => {
    new CardLinkSuggestModal(app, suggestions, resolve).open();
  });
}

export function promptForText(
  app: App,
  heading: string,
  placeholder: string,
  initialValue = "",
): Promise<string | null> {
  return new Promise((resolve) => {
    new TextPromptModal(
      app,
      heading,
      placeholder,
      initialValue,
      resolve,
    ).open();
  });
}

class ConfirmationModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly heading: string,
    private readonly message: string,
    private readonly confirmLabel: string,
    private readonly resolveChoice: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("slipbox-modal");
    contentEl.createEl("h2", { text: this.heading });
    contentEl.createEl("p", { text: this.message });
    const actions = contentEl.createDiv({ cls: "slipbox-modal-actions" });
    const cancel = actions.createEl("button", { text: "Keep", type: "button" });
    const confirm = actions.createEl("button", {
      text: this.confirmLabel,
      type: "button",
      cls: "mod-warning",
    });
    cancel.addEventListener("click", () => this.finish(false));
    confirm.addEventListener("click", () => this.finish(true));
    activateDefaultButtonOnEnter(contentEl, confirm);
    confirm.focus({ preventScroll: true });
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveChoice(false);
    }
  }

  private finish(confirmed: boolean): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveChoice(confirmed);
    this.close();
  }
}

export function confirmAction(
  app: App,
  heading: string,
  message: string,
  confirmLabel: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmationModal(app, heading, message, confirmLabel, resolve).open();
  });
}

export interface BookmarksModalActions {
  readonly currentPath: string | null;
  isAvailable(path: string): boolean;
  label(path: string): string;
  visit(path: string): void;
  addCurrent(): Promise<void>;
  remove(path: string): Promise<void>;
}

export class BookmarksModal extends Modal {
  private bookmarks: DeckBookmark[];
  private listEl: HTMLElement | null = null;
  private addButton: HTMLButtonElement | null = null;

  constructor(
    app: App,
    bookmarks: readonly DeckBookmark[],
    private readonly actions: BookmarksModalActions,
  ) {
    super(app);
    this.bookmarks = [...bookmarks];
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("slipbox-modal");
    contentEl.createEl("h2", { text: "Bookmarks" });
    contentEl.createEl("p", {
      cls: "slipbox-empty-copy",
      text: "One persistent physical bookmark may be attached to each filed card.",
    });
    this.listEl = contentEl.createDiv({ cls: "slipbox-modal-list" });
    this.renderList();
    this.addButton = renderCurrentCardAddAction(contentEl, {
      label: "+ add focused Deck card as bookmark",
      currentAddress: this.actions.currentPath,
      isCurrentListed: this.currentIsListed(),
      addCurrent: () => this.actions.addCurrent(),
      onAdded: () => this.close(),
    });
  }

  override onClose(): void {
    this.contentEl.empty();
    this.listEl = null;
    this.addButton = null;
  }

  private renderList(): void {
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
        attr: { type: "button" },
      });
      visit.createSpan({
        cls: "slipbox-list-label",
        text: available
          ? this.actions.label(bookmark.path)
          : `${bookmark.path} · missing`,
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
            (candidate) => candidate.path !== bookmark.path,
          );
          this.renderList();
          updateCurrentCardAddAction(
            this.addButton,
            this.actions.currentPath,
            this.currentIsListed(),
          );
        });
      });
    }
  }

  private currentIsListed(): boolean {
    return this.bookmarks.some(
      (bookmark) => bookmark.path === this.actions.currentPath,
    );
  }
}

interface CurrentCardAddActionOptions {
  readonly label: string;
  readonly currentAddress: string | null;
  readonly isCurrentListed: boolean;
  addCurrent(): Promise<void>;
  onAdded(): void;
}

function renderCurrentCardAddAction(
  contentEl: HTMLElement,
  options: CurrentCardAddActionOptions,
): HTMLButtonElement {
  const footer = contentEl.createDiv({ cls: "slipbox-modal-actions" });
  const add = footer.createEl("button", {
    text: options.label,
    cls: "mod-cta",
    attr: { type: "button" },
  });
  updateCurrentCardAddAction(
    add,
    options.currentAddress,
    options.isCurrentListed,
  );
  add.addEventListener("click", () => {
    add.disabled = true;
    void options.addCurrent().then(() => options.onAdded());
  });
  activateDefaultButtonOnEnter(contentEl, add);
  return add;
}

function updateCurrentCardAddAction(
  button: HTMLButtonElement | null,
  currentAddress: string | null,
  isCurrentListed: boolean,
): void {
  if (button !== null) {
    button.disabled = currentAddress === null || isCurrentListed;
  }
}

export interface IssuesModalActions {
  open(path: string): void;
}


export class IssuesModal extends Modal {
  constructor(
    app: App,
    private readonly index: VaultCardIndex,
    private readonly duplicatePolicy: DuplicateAddressPolicy,
    private readonly actions: IssuesModalActions,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("slipbox-modal");
    contentEl.createEl("h2", { text: "Card address issues" });
    contentEl.createEl("p", {
      text: issueListDescription(this.duplicatePolicy),
    });

    const list = contentEl.createDiv({ cls: "slipbox-modal-list" });
    for (const issue of this.index.issues) {
      const group = list.createDiv({ cls: "slipbox-issue-group" });
      group.createDiv({
        cls: `slipbox-issue-message is-${issue.severity}`,
        text: `${issue.severity === "warning" ? "Warning" : "Error"}: ${issue.message}`,
      });
      for (const path of issue.paths) {
        const button = group.createEl("button", {
          cls: "slipbox-issue-file",
          text: path,
          attr: { type: "button" },
        });
        button.addEventListener("click", () => {
          this.actions.open(path);
          this.close();
        });
      }
    }
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

function iconButton(
  parent: HTMLElement,
  icon: Parameters<typeof setIcon>[1],
  label: string,
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "clickable-icon slipbox-icon-button",
    attr: { type: "button", "aria-label": label },
  });
  setIcon(button, icon);
  return button;
}

function activateDefaultButtonOnEnter(
  container: HTMLElement,
  button: HTMLButtonElement,
): void {
  container.addEventListener("keydown", (event) => {
    if (
      event.key !== "Enter" ||
      event.repeat ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      button.disabled
    ) {
      return;
    }
    const target = event.targetNode;
    if (
      target?.instanceOf(Element) === true &&
      target.closest("button, a, textarea, select, [contenteditable='true']") !== null
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    button.click();
  });
}
