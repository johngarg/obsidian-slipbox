import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatCurrentTimestamp } from "../src/timestamp.js";

describe("current timestamp formatting", () => {
  test("passes the configured pattern to the host formatter", () => {
    let receivedPattern = "";
    const formatted = formatCurrentTimestamp(
      () => ({
        format: (pattern: string) => {
          receivedPattern = pattern;
          return "20260825T184500";
        },
      }),
      "YYYYMMDDTHHmmss",
    );

    assert.equal(receivedPattern, "YYYYMMDDTHHmmss");
    assert.equal(formatted, "20260825T184500");
  });
});
