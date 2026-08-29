import {
  CARD_COLORS,
  type CardColor,
} from "./card-color.js";
import type { NewCardInput } from "./new-note.js";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

function createHtmlElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
): HTMLElementTagNameMap[K] {
  return document.createElementNS(HTML_NAMESPACE, tag) as HTMLElementTagNameMap[K];
}

export interface NewCardOptionsFormActions {
  readonly placeholder: string;
  create(input: NewCardInput): void;
  cancel(): void;
}

export interface NewCardOptionsFormElements {
  readonly form: HTMLFormElement;
  readonly titleInput: HTMLInputElement;
  readonly colorButtons: readonly HTMLButtonElement[];
  readonly selectedColor: HTMLElement;
  readonly cancelButton: HTMLButtonElement;
  readonly createButton: HTMLButtonElement;
}

function colorLabel(color: CardColor): string {
  return `${color.charAt(0).toUpperCase()}${color.slice(1)}`;
}

/** Render the testable form separately from Obsidian's modal lifecycle. */
export function renderNewCardOptionsForm(
  contentEl: HTMLElement,
  actions: NewCardOptionsFormActions,
): NewCardOptionsFormElements {
  const document = contentEl.ownerDocument;
  const heading = createHtmlElement(document, "h2");
  heading.textContent = "New card options";
  contentEl.append(heading);

  const form = createHtmlElement(document, "form");
  form.className = "slipbox-prompt-form slipbox-new-card-options-form";
  contentEl.append(form);

  const titleField = createHtmlElement(document, "label");
  titleField.className = "slipbox-field";
  const titleLabel = createHtmlElement(document, "span");
  titleLabel.textContent = "Title";
  const titleInput = createHtmlElement(document, "input");
  titleInput.type = "text";
  titleInput.placeholder = actions.placeholder;
  titleField.append(titleLabel, titleInput);
  form.append(titleField);

  const fieldset = createHtmlElement(document, "fieldset");
  fieldset.className = "slipbox-card-color-field";
  const legend = createHtmlElement(document, "legend");
  legend.textContent = "Card colour";
  fieldset.append(legend);

  const colorRow = createHtmlElement(document, "div");
  colorRow.className = "slipbox-card-color-options";
  fieldset.append(colorRow);

  const selectedColor = createHtmlElement(document, "div");
  selectedColor.className = "slipbox-card-color-selection";
  selectedColor.setAttribute("aria-live", "polite");
  selectedColor.textContent = "No colour";
  fieldset.append(selectedColor);
  form.append(fieldset);

  let selectedColorValue: CardColor | null = null;
  const colorButtons: HTMLButtonElement[] = [];
  const choices: readonly (CardColor | null)[] = [null, ...CARD_COLORS];
  for (const color of choices) {
    const label = color === null ? "No colour" : colorLabel(color);
    const choice = createHtmlElement(document, "button");
    choice.type = "button";
    choice.className = "slipbox-card-color-choice";
    choice.title = label;
    choice.setAttribute("aria-label", label);
    choice.setAttribute("aria-pressed", String(color === null));
    if (color === null) {
      choice.classList.add("is-no-color");
    } else {
      choice.dataset.slipboxCardColor = color;
    }

    choice.addEventListener("click", () => {
      selectedColorValue = color;
      selectedColor.textContent = label;
      for (const button of colorButtons) {
        button.setAttribute("aria-pressed", String(button === choice));
      }
    });
    colorRow.append(choice);
    colorButtons.push(choice);
  }

  const actionRow = createHtmlElement(document, "div");
  actionRow.className = "slipbox-modal-actions";
  const cancelButton = createHtmlElement(document, "button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  const createButton = createHtmlElement(document, "button");
  createButton.type = "submit";
  createButton.className = "mod-cta";
  createButton.textContent = "Create";
  actionRow.append(cancelButton, createButton);
  form.append(actionRow);

  cancelButton.addEventListener("click", () => actions.cancel());
  titleInput.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.repeat &&
      !event.isComposing &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      form.requestSubmit(createButton);
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    actions.create({
      title: titleInput.value.trim(),
      color: selectedColorValue,
    });
  });

  return {
    form,
    titleInput,
    colorButtons,
    selectedColor,
    cancelButton,
    createButton,
  };
}
