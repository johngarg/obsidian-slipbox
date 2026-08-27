interface ButtonFocusTarget {
  blur(): void;
}

interface ClickActivation {
  readonly detail: number;
}

interface PointerDownActivation {
  preventDefault(): void;
  stopPropagation(): void;
}

/**
 * Keep a pointer press on a card-header control from moving DOM focus to the
 * control (and, through focusin handlers, to the card that owns it). Keyboard
 * focus remains unaffected because this runs only for pointer events.
 */
export function preventPointerActivatedButtonFocus(
  activation: PointerDownActivation,
): void {
  activation.preventDefault();
  activation.stopPropagation();
}

/**
 * Pointer clicks should not leave a card-header control holding DOM focus.
 * Keyboard and assistive activations report detail 0 and retain focus.
 */
export function releasePointerActivatedButtonFocus(
  button: ButtonFocusTarget,
  activation: ClickActivation,
): boolean {
  if (activation.detail === 0) {
    return false;
  }
  button.blur();
  return true;
}
