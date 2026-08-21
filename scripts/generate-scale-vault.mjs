import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    output: { type: "string", short: "o" },
    notes: { type: "string", short: "n", default: "10000" },
    filed: { type: "string", default: "70" },
    unfiled: { type: "string", default: "10" },
    links: { type: "string", default: "4" },
  },
  strict: true,
});

function integerOption(name, value, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

const noteCount = integerOption("--notes", values.notes, 1, 1_000_000);
const filedPercent = integerOption("--filed", values.filed, 0, 100);
const unfiledPercent = integerOption("--unfiled", values.unfiled, 0, 100);
const linksPerFiledCard = integerOption("--links", values.links, 0, 100);
if (filedPercent + unfiledPercent > 100) {
  throw new Error("--filed and --unfiled percentages cannot exceed 100 in total.");
}

const output = resolve(values.output ?? join(tmpdir(), "SlipboxScaleVault"));
const sourceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const filedCount = Math.floor(noteCount * filedPercent / 100);
const unfiledCount = Math.floor(noteCount * unfiledPercent / 100);
const filenameWidth = String(noteCount).length;

await ensureEmptyDirectory(output);
await mkdir(join(output, "Cards"), { recursive: true });
const pluginDirectory = join(output, ".obsidian", "plugins", "slipbox");
await mkdir(pluginDirectory, { recursive: true });
await Promise.all(
  ["manifest.json", "main.js", "styles.css"].map((name) =>
    copyFile(join(sourceRoot, name), join(pluginDirectory, name))),
);
await writeFile(
  join(output, ".obsidian", "community-plugins.json"),
  `${JSON.stringify(["slipbox"], null, 2)}\n`,
);

const batchSize = 128;
for (let start = 0; start < noteCount; start += batchSize) {
  const end = Math.min(noteCount, start + batchSize);
  await Promise.all(
    Array.from({ length: end - start }, (_, offset) => {
      const index = start + offset;
      const filename = noteFilename(index);
      return writeFile(join(output, "Cards", filename), noteSource(index));
    }),
  );
  if (end % 5_000 === 0 || end === noteCount) {
    console.log(`Generated ${end.toLocaleString()} of ${noteCount.toLocaleString()} notes.`);
  }
}

await writeFile(
  join(output, ".slipbox-scale.json"),
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    notes: noteCount,
    filed: filedCount,
    unfiled: unfiledCount,
    ordinary: noteCount - filedCount - unfiledCount,
    linksPerFiledCard,
  }, null, 2)}\n`,
);
console.log(`Scale vault ready at ${output}`);

async function ensureEmptyDirectory(directory) {
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory);
  if (entries.length > 0) {
    throw new Error(`Refusing to write into non-empty directory: ${directory}`);
  }
}

function noteFilename(index) {
  return `Note ${String(index + 1).padStart(filenameWidth, "0")}.md`;
}

function noteLink(index, label) {
  const stem = basename(noteFilename(index), ".md");
  return `[[Cards/${stem}|${label}]]`;
}

function noteSource(index) {
  const title = `Scale note ${index + 1}`;
  if (index < filedCount) {
    const address = index === 0 ? "0" : `A-${index}`;
    const links = filedLinks(index);
    return [
      "---",
      `zettel-id: ${JSON.stringify(address)}`,
      `title: ${JSON.stringify(title)}`,
      "---",
      "",
      `# ${title}`,
      "",
      "Deterministic synthetic content for Slipbox large-vault testing.",
      ...(links.length === 0 ? [] : ["", `Related cards: ${links.join(" · ")}`]),
      "",
    ].join("\n");
  }
  if (index < filedCount + unfiledCount) {
    return [
      "---",
      "zettel-id: \"\"",
      `title: ${JSON.stringify(title)}`,
      "---",
      "",
      `# ${title}`,
      "",
      "Synthetic unfiled card for Tray testing.",
      "",
    ].join("\n");
  }
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    "tags: [scale-fixture]",
    "---",
    "",
    `# ${title}`,
    "",
    "Synthetic ordinary note without a Slipbox address property.",
    "",
  ].join("\n");
}

function filedLinks(index) {
  const limit = Math.min(linksPerFiledCard, Math.max(0, filedCount - 1));
  if (limit === 0) {
    return [];
  }
  const targets = new Set();
  if (index !== 0) {
    targets.add(0);
  }
  for (let offset = 1; targets.size < limit && offset < filedCount * 2; offset += 1) {
    const target = (index + offset * 7919) % filedCount;
    if (target !== index) {
      targets.add(target);
    }
  }
  return [...targets].map((target) => noteLink(target, `card ${target + 1}`));
}
