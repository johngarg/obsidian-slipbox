export type ShortcutArbitrationResult =
  | "command"
  | "conflict"
  | "slipbox";

/**
 * Decide the winner after Obsidian's keymap has had an opportunity to handle
 * a scoped Slipbox shortcut. A customized Obsidian command always wins.
 */
export function arbitrateShortcut(
  defaultPrevented: boolean,
  handledBySlipboxCommand: boolean,
  runSlipboxShortcut: () => void,
  reportConflict: () => void,
): ShortcutArbitrationResult {
  if (handledBySlipboxCommand) {
    return "command";
  }
  if (defaultPrevented) {
    reportConflict();
    return "conflict";
  }
  runSlipboxShortcut();
  return "slipbox";
}
