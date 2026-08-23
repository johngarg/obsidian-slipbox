import {
  applyTextReplacement,
  beforeInputCandidate,
  restrictViewedCardPaste,
} from "./paper-workflow.js";

export const PROTECTED_TEXT_MESSAGE =
  "Text present when editing began is protected.";
export const RESTRICTED_PASTE_MESSAGE = "Only the first word was pasted.";

export interface PaperWorkflowTextareaEnvironment {
  readonly restrictPaste: boolean;
  readonly acceptsDraft: (draft: string) => boolean;
  readonly updateDraft: (draft: string) => boolean;
  readonly currentDraft: () => string;
  readonly accepted: () => void;
  readonly message: (message: string) => void;
}

/** Install Slipbox-only paste and protected-baseline behavior on one textarea. */
export function attachPaperWorkflowTextarea(
  textarea: HTMLTextAreaElement,
  environment: PaperWorkflowTextareaEnvironment,
): void {
  let fallbackSelectionStart = textarea.selectionStart;
  let fallbackSelectionEnd = textarea.selectionEnd;

  const acceptTextareaDraft = (): boolean => {
    if (!environment.updateDraft(textarea.value)) {
      textarea.value = environment.currentDraft();
      textarea.setSelectionRange(
        Math.min(fallbackSelectionStart, textarea.value.length),
        Math.min(fallbackSelectionEnd, textarea.value.length),
      );
      environment.message(PROTECTED_TEXT_MESSAGE);
      return false;
    }
    fallbackSelectionStart = textarea.selectionStart;
    fallbackSelectionEnd = textarea.selectionEnd;
    environment.accepted();
    return true;
  };

  textarea.addEventListener("beforeinput", (event) => {
    fallbackSelectionStart = textarea.selectionStart;
    fallbackSelectionEnd = textarea.selectionEnd;
    if (event.inputType === "insertFromPaste") {
      return;
    }
    const candidate = beforeInputCandidate(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
      event.inputType,
      event.data,
    );
    if (candidate !== null && !environment.acceptsDraft(candidate)) {
      event.preventDefault();
      environment.message(PROTECTED_TEXT_MESSAGE);
    }
  });

  textarea.addEventListener("input", () => {
    acceptTextareaDraft();
  });

  textarea.addEventListener("paste", (event) => {
    const clipboardText = event.clipboardData?.getData("text/plain") ?? "";
    const pasted = environment.restrictPaste
      ? restrictViewedCardPaste(clipboardText)
      : { text: clipboardText, truncated: false };
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const candidate = applyTextReplacement({
      value: textarea.value,
      selectionStart,
      selectionEnd,
      replacement: pasted.text,
    });
    if (!environment.acceptsDraft(candidate)) {
      event.preventDefault();
      environment.message(PROTECTED_TEXT_MESSAGE);
      return;
    }
    if (!environment.restrictPaste) {
      return;
    }
    event.preventDefault();
    textarea.value = candidate;
    const caret = selectionStart + pasted.text.length;
    textarea.setSelectionRange(caret, caret);
    fallbackSelectionStart = caret;
    fallbackSelectionEnd = caret;
    acceptTextareaDraft();
    if (pasted.truncated) {
      environment.message(RESTRICTED_PASTE_MESSAGE);
    }
  });
}
