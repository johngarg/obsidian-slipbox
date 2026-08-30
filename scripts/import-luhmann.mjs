#!/usr/bin/env node
import { applyCorpus, fetchCorpus, parseArgs, stageCorpus, validateCorpus } from "./luhmann-import-lib.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "fetch") await fetchCorpus(options);
  else if (options.mode === "stage") await stageCorpus(options);
  else if (options.mode === "validate") { const report = await validateCorpus(options); if (!report.passed) process.exitCode = 1; }
  else await applyCorpus(options);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
