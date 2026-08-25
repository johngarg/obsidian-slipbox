export interface FormattableTimestamp {
  format(pattern: string): string;
}

function isTimestampFactory(value: unknown): value is () => unknown {
  return typeof value === "function";
}

function isFormattableTimestamp(value: unknown): value is FormattableTimestamp {
  return typeof value === "object" && value !== null &&
    "format" in value && typeof value.format === "function";
}

/** Format the current time without leaking a host API's loose types. */
export function formatCurrentTimestamp(
  createTimestamp: unknown,
  pattern: string,
): string {
  if (!isTimestampFactory(createTimestamp)) {
    throw new TypeError("The host timestamp factory is unavailable");
  }
  const timestamp = createTimestamp();
  if (!isFormattableTimestamp(timestamp)) {
    throw new TypeError("The host timestamp formatter is unavailable");
  }
  return timestamp.format(pattern);
}
