interface ButtonFocusTarget {
  blur(): void;
}

interface ClickActivation {
  readonly detail: number;
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
