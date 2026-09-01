import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Window } from "happy-dom";

export const ARCHIVE_BASE = "https://niklas-luhmann-archiv.de/bestand/zettelkasten/zettel";
export const API_BASE = "https://v0.api.niklas-luhmann-archiv.de/ZK";
export const LICENSE = "CC BY-NC-SA 4.0";
export const CORPORA = Object.freeze({
  division17: Object.freeze({
    key: "17",
    label: "ZK I Division 17",
    zk: "1",
    prefix: "17",
    expected: Object.freeze({ total: 1009, fronts: 1008, dummies: 2, reverses: 1 }),
    dummyIds: Object.freeze(["ZK_1_NB_17-1b5d_V", "ZK_1_NB_17-1j_V"]),
    reverseIds: Object.freeze(["ZK_1_NB_17-7bc_R"]),
    preserveIds: Object.freeze(["ZK_1_NB_17_2_V", "ZK_1_NB_17-1_V", "ZK_1_NB_17-1a_V", "ZK_1_NB_17-1b_V", "ZK_1_NB_17-1c_V"]),
    refsStart: "<!-- BEGIN GENERATED DIVISION 17 -->",
    refsEnd: "<!-- END GENERATED DIVISION 17 -->",
    legacyRefsHeading: /^## 17(?:$|[, (])/u,
    reverse: Object.freeze({
      frontId: "ZK_1_NB_17-7bc_V",
      reverseId: "ZK_1_NB_17-7bc_R",
      reverseFilename: "Luhmann 17,7bc (R).md",
      branchLink: "[[Luhmann 17,7bc (R)|+R]]",
    }),
  }),
  zk2_9_8: Object.freeze({
    key: "zk2-9-8",
    label: "ZK II 9/8",
    zk: "2",
    prefix: "9/8",
    expected: Object.freeze({ total: 18, fronts: 18, dummies: 0, reverses: 0 }),
    dummyIds: Object.freeze([]),
    reverseIds: Object.freeze([]),
    preserveIds: Object.freeze([]),
    refsStart: "<!-- BEGIN GENERATED ZK II 9/8 -->",
    refsEnd: "<!-- END GENERATED ZK II 9/8 -->",
    legacyRefsHeading: null,
    reverse: null,
  }),
});

export const EXPECTED = CORPORA.division17.expected;

export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function archiveUrl(id) { return `${ARCHIVE_BASE}/${id}`; }
export function xmlUrl(id) { return `${API_BASE}/zettel/${id}/xml`; }
export function importRoot(vault) { return join(resolve(vault), ".luhmann-import"); }
export function cacheFilename(archiveId) { return `${archiveId}.${sha256(archiveId).slice(0, 10)}.xml`; }

function corpusFromValues(values) {
  if (values.division !== undefined) {
    if (values.division !== "17" || values.zk !== undefined || values.prefix !== undefined) throw new Error("--division supports only 17 and cannot be combined with --zk or --prefix");
    return CORPORA.division17;
  }
  if (values.zk === "2" && values.prefix === "9/8") return CORPORA.zk2_9_8;
  throw new Error("Select either --division 17 or --zk 2 --prefix 9/8");
}

export function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Expected --key value, received ${key ?? "end of input"}`);
    values[key.slice(2)] = value;
  }
  if (!["fetch", "stage", "validate", "apply"].includes(values.mode)) throw new Error("--mode must be fetch, stage, validate, or apply");
  if (!values.vault) throw new Error("--vault is required");
  return { mode: values.mode, corpus: corpusFromValues(values), vault: resolve(values.vault) };
}

export function normalizeSearchRecord(item) {
  const archiveId = item.ekin;
  const side = archiveId.endsWith("_R") ? "reverse" : "front";
  return {
    archiveId,
    address: String(item.shortTitle ?? item.luhmann_number).replace(/\(R\)$/u, "").replace(/\(\d+\)$/u, ""),
    shortTitle: String(item.shortTitle),
    side,
    isDummy: Boolean(item.isDummy),
    physicalOrder: String(item.meta?.["scan-in-drawer"] ?? ""),
    publicationReady: Boolean(item.transcription?.readyForPublication),
    publicationDate: item.pubDate ?? null,
    source: archiveUrl(archiveId),
  };
}

export function assertCorpus(records, corpus = CORPORA.division17) {
  const ids = new Set(records.map((record) => record.archiveId));
  const fronts = records.filter((record) => record.side === "front");
  const dummies = records.filter((record) => record.isDummy);
  const reverses = records.filter((record) => record.side === "reverse");
  const expected = corpus.expected;
  if (records.length !== expected.total || ids.size !== expected.total || fronts.length !== expected.fronts || dummies.length !== expected.dummies || reverses.length !== expected.reverses) {
    throw new Error(`Unexpected ${corpus.label} corpus: ${records.length} records, ${ids.size} IDs, ${fronts.length} fronts, ${dummies.length} dummies, ${reverses.length} reverses`);
  }
  const dummyIds = dummies.map((record) => record.archiveId).sort();
  if (dummyIds.join("\n") !== [...corpus.dummyIds].sort().join("\n")) throw new Error(`Unexpected placeholders: ${dummyIds.join(", ")}`);
  const reverseIds = reverses.map((record) => record.archiveId).sort();
  if (reverseIds.join("\n") !== [...corpus.reverseIds].sort().join("\n")) throw new Error(`Unexpected reverses: ${reverseIds.join(", ")}`);
}

async function json(path) { return JSON.parse(await readFile(path, "utf8")); }
async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
async function retryFetch(url, attempts = 5) {
  let error;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
      const retryAfter = Number(response.headers.get("retry-after"));
      if (response.status < 500 && response.status !== 429) throw new Error(`${response.status} ${response.statusText}`);
      await new Promise((done) => setTimeout(done, Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 750));
    } catch (caught) { error = caught; if (attempt < attempts) await new Promise((done) => setTimeout(done, attempt * 750)); }
  }
  throw new Error(`Failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`);
}
async function mapLimit(items, limit, task) {
  let cursor = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (cursor < items.length) { const index = cursor; cursor += 1; await task(items[index], index); }
  }));
}

export async function fetchCorpus({ vault, corpus = CORPORA.division17, log = console.log }) {
  const cache = join(importRoot(vault), "cache", corpus.key);
  await mkdir(cache, { recursive: true });
  const query = { page: 1, rows: 5000, fulltext: "", fuzzy: false, FTSearchMode: "and", zettelnummer: corpus.prefix, zettelnummerSearchMode: "starts-with", areas: [], ref: "", zks: [corpus.zk] };
  const searchText = await retryFetch(`${API_BASE}/search?q=${encodeURIComponent(JSON.stringify(query))}`);
  const search = JSON.parse(searchText);
  if (search.numberOfResults !== corpus.expected.total || !Array.isArray(search.results)) throw new Error(`Search returned ${search.numberOfResults ?? "unknown"} results for ${corpus.label}`);
  const records = search.results.map(normalizeSearchRecord);
  assertCorpus(records, corpus);
  const oldPath = join(cache, "manifest.json");
  const old = await exists(oldPath) ? await json(oldPath) : { records: [] };
  const oldById = new Map(old.records.map((record) => [record.archiveId, record]));
  let reused = 0; let downloaded = 0;
  await mapLimit(records, 6, async (record, index) => {
    const file = join(cache, cacheFilename(record.archiveId));
    const previous = oldById.get(record.archiveId);
    if (previous && await exists(file)) {
      const cached = await readFile(file);
      if (sha256(cached) === previous.checksum) { record.checksum = previous.checksum; record.retrievedAt = previous.retrievedAt; reused += 1; return; }
    }
    const xml = await retryFetch(xmlUrl(record.archiveId));
    record.checksum = sha256(xml); record.retrievedAt = new Date().toISOString();
    await atomicWrite(file, xml); downloaded += 1;
    if ((index + 1) % 100 === 0) log(`Fetched ${index + 1}/${records.length}`);
  });
  records.sort((a, b) => a.physicalOrder.localeCompare(b.physicalOrder) || a.archiveId.localeCompare(b.archiveId));
  const manifest = { schemaVersion: 2, corpus: corpus.key, zk: corpus.zk, prefix: corpus.prefix, fetchedAt: new Date().toISOString(), searchChecksum: sha256(searchText), records };
  await atomicWrite(oldPath, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`Fetch complete: ${downloaded} downloaded, ${reused} reused`);
  return manifest;
}

function parseXml(xml) {
  const window = new Window();
  const document = new window.DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Invalid TEI XML");
  return document;
}
function meaningfulText(node) { return (node.textContent ?? "").replace(/\s+/gu, " ").trim(); }
function rendition(node) { return node.getAttribute?.("rendition") ?? ""; }
function isTitleMarkup(node) { return node?.nodeType === 1 && (node.localName === "head" || (node.localName === "hi" && /#(?:u(?:_|\b)|b\b)/u.test(rendition(node)))); }

export function extractTitle(xml) {
  const document = parseXml(xml);
  const card = document.querySelector('div[type^="zettel-"]');
  const number = card?.querySelector('fw[type="luhmann_num"]');
  if (!number) return { title: "", evidence: null };
  let candidate = number.nextSibling;
  while (candidate && candidate.nodeType === 3 && meaningfulText(candidate) === "") candidate = candidate.nextSibling;
  if (!isTitleMarkup(candidate)) return { title: "", evidence: null };
  const title = meaningfulText(candidate);
  return title ? { title, evidence: { element: candidate.localName, rendition: rendition(candidate) || null, text: title } } : { title: "", evidence: null };
}

function targetAddress(target) {
  const id = target.replace(/^#/u, "");
  const match = id.match(/^ZK_(\d+)_[A-Z]+_(.+)_[VR]$/u);
  if (!match) return id;
  const zk = match[1]; const encoded = match[2]?.replace(/_/gu, "-") ?? "";
  if (zk === "2") {
    const parts = encoded.split("-");
    const division = parts.shift() ?? ""; const first = parts.shift() ?? "";
    return `${division}/${first}${parts.length ? `,${parts.join(",")}` : ""}`;
  }
  return encoded.replace(/-/gu, ",");
}
function wiki(target, alias) { return `[[${target}${alias && alias !== target ? `|${alias}` : ""}]]`; }
function isNaturalAddressAncestor(parent, candidate) {
  if (!parent || candidate.length <= parent.length || !candidate.startsWith(parent)) return false;
  return !(/[0-9]/u.test(parent.at(-1) ?? "") && /[0-9]/u.test(candidate[parent.length] ?? ""));
}

export function renderTei(xml, context = {}) {
  const document = parseXml(xml);
  const card = document.querySelector('div[type^="zettel-"]');
  if (!card) throw new Error("TEI contains no card div");
  const title = extractTitle(xml);
  const skipped = new Set();
  const number = card.querySelector('fw[type="luhmann_num"]');
  if (number) skipped.add(number);
  if (title.evidence) { let node = number?.nextSibling; while (node && node.nodeType === 3 && meaningfulText(node) === "") node = node.nextSibling; if (node) skipped.add(node); }
  const isLeadingCardReference = (node) => {
    const paragraph = node.closest?.("p");
    if (!paragraph || card.querySelector("p") !== paragraph) return false;
    for (const sibling of paragraph.childNodes) {
      if (sibling === node) return true;
      if (skipped.has(sibling)) continue;
      if (sibling.nodeType === 3 && meaningfulText(sibling) === "") continue;
      if (sibling.nodeType === 1 && ["fw", "pb"].includes(sibling.localName)) continue;
      return false;
    }
    return false;
  };
  const references = [];
  const render = (node) => {
    if (skipped.has(node)) return "";
    if (node.nodeType === 3) {
      const value = node.nodeValue ?? "";
      return /^\s+$/u.test(value) && /[\r\n]/u.test(value) ? "" : value.replace(/\s+/gu, " ");
    }
    if (node.nodeType !== 1) return "";
    const name = node.localName;
    if (["pb", "fw"].includes(name)) return "";
    if (name === "lb") return node.getAttribute("type") === "inWord" ? "" : " ";
    if (name === "choice") { const preferred = node.querySelector(":scope > orig, :scope > abbr"); return preferred ? render(preferred) : Array.from(node.childNodes).map(render).join(""); }
    if (name === "ref" || name === "join") {
      const raw = node.getAttribute("target") ?? ""; const id = raw.replace(/^#/u, "");
      const near = node.getAttribute("type") === "nl_vw_einzel_nah";
      if (context.suppressReferenceIds?.has(id)) return "";
      const imported = context.filenameById?.get(id);
      const importedAddress = context.addressById?.get(id);
      const visible = name === "join" ? importedAddress ?? targetAddress(raw) : meaningfulText(node);
      const redHeaderLabel = name === "ref" && isLeadingCardReference(node) && (rendition(node).includes("#red") || Boolean(node.querySelector('[rendition*="#red"]')));
      const returnsToAncestor = (near || redHeaderLabel) && importedAddress !== undefined && context.sourceAddress !== undefined && isNaturalAddressAncestor(importedAddress, context.sourceAddress);
      const branch = near && !returnsToAncestor;
      const linkTarget = imported ? imported.replace(/\.md$/u, "") : targetAddress(raw) || visible;
      const alias = `${branch ? "+" : ""}${visible || targetAddress(raw)}`;
      if (id) references.push({ archiveId: id, visible: visible || targetAddress(raw), near, redHeaderLabel, branch, omitted: returnsToAncestor, imported: Boolean(imported), filename: imported, url: archiveUrl(id) });
      if (returnsToAncestor) return "";
      return wiki(linkTarget, alias);
    }
    if (name === "hi") {
      const text = Array.from(node.childNodes).map(render).join(""); const rend = rendition(node);
      if (rend.includes("#sup")) return `<sup>${text}</sup>`;
      if (rend.includes("#sub")) return `<sub>${text}</sub>`;
      const first = Array.from(node.parentNode?.childNodes ?? []).find((child) => meaningfulText(child) !== "");
      if (/^#u(?:_|$)/u.test(rend) && first === node) return `*${text.trim()}*`;
      return text;
    }
    if (name === "del") return `~~${Array.from(node.childNodes).map(render).join("")}~~`;
    if (name === "gap") return "[…]";
    if (name === "milestone") return "\n\n";
    if (name === "table") return Array.from(node.querySelectorAll(":scope > row")).map((row) => `| ${Array.from(row.querySelectorAll(":scope > cell")).map((cell) => cleanInline(Array.from(cell.childNodes).map(render).join(""))).join(" | ")} |`).join("\n");
    if (name === "item") return `- ${cleanInline(Array.from(node.childNodes).map(render).join(""))}\n`;
    return Array.from(node.childNodes).map(render).join("");
  };
  const blocks = Array.from(card.childNodes).map((node) => {
    if (node.nodeType === 1 && node.localName === "p") return cleanInline(render(node));
    if (node.nodeType === 1 && ["table", "list"].includes(node.localName)) return render(node).trim();
    if (node.nodeType === 1 && node.localName === "milestone") return "";
    return cleanInline(render(node));
  }).filter(Boolean);
  return { body: blocks.join("\n\n").replace(/\n{3,}/gu, "\n\n").trim(), title: title.title, titleEvidence: title.evidence, references };
}
function cleanInline(value) { return value.replace(/[ \t\r\n]+/gu, " ").replace(/ +([.,;:!?])/gu, "$1").trim(); }

function groupBy(items, keyFor) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return groups;
}

function filenameAddress(address, corpus) { return corpus === CORPORA.zk2_9_8 ? address.replaceAll("/", "-") : address; }

export function assignFilenames(records, existing = new Map(), corpus = CORPORA.division17) {
  const result = new Map(); const used = new Set();
  for (const record of records) if (existing.has(record.archiveId)) { const name = existing.get(record.archiveId); result.set(record.archiveId, name); used.add(name.toLocaleLowerCase("en-US")); }
  const groups = groupBy(records, (record) => record.address);
  for (const [address, group] of groups) {
    const safeAddress = filenameAddress(address, corpus);
    for (const record of group) {
      if (result.has(record.archiveId)) continue;
      let name;
      if (corpus.reverse?.reverseId === record.archiveId) name = corpus.reverse.reverseFilename;
      else {
        const ordinal = record.shortTitle.match(/\((\d+)\)$/u)?.[1];
        name = `Luhmann ${safeAddress}${ordinal && group.length > 1 ? ` (${ordinal})` : ""}.md`;
        if (used.has(name.toLocaleLowerCase("en-US"))) { let suffix = 2; do { name = `Luhmann ${safeAddress} (${suffix}).md`; suffix += 1; } while (used.has(name.toLocaleLowerCase("en-US"))); }
      }
      result.set(record.archiveId, name); used.add(name.toLocaleLowerCase("en-US"));
    }
  }
  if (result.size !== records.length || used.size !== records.length) throw new Error("Filename mapping is not one-to-one");
  return result;
}

function frontmatter(record, rendered) {
  const lines = ["---", `zettel-id: ${JSON.stringify(record.address)}`, `title: ${JSON.stringify(rendered.title)}`, `archive-id: ${JSON.stringify(record.archiveId)}`, `source: ${JSON.stringify(record.source)}`, `license: ${JSON.stringify(LICENSE)}`];
  if (record.isDummy) lines.push("archive-placeholder: true");
  if (record.side === "reverse") lines.push("archive-side: reverse");
  lines.push("---"); return lines.join("\n");
}
function splitNote(note) { const match = note.match(/^---\n[\s\S]*?\n---\n?/u); return { body: match ? note.slice(match[0].length) : note }; }
function normalizeExistingBody(body, filenameByAddress, references) {
  const branchAliasByFilename = new Map(references.filter((reference) => reference.branch && reference.filename).map((reference) => [reference.filename, `+${reference.visible}`]));
  return body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu, (whole, target, alias) => {
    const address = String(target).replace(/^Luhmann /u, ""); const filename = filenameByAddress.get(address)?.replace(/\.md$/u, "");
    const branchAlias = filename ? branchAliasByFilename.get(`${filename}.md`) : undefined;
    return filename ? wiki(filename, branchAlias ?? alias ?? address) : whole;
  }).trimEnd();
}
async function existingNotes(vault) {
  const result = new Map();
  for (const entry of await readdir(vault, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const text = await readFile(join(vault, entry.name), "utf8"); const id = text.match(/^archive-id:\s*["']?([^"'\n]+)["']?$/mu)?.[1];
    if (id) result.set(id, { filename: entry.name, text });
  }
  return result;
}

export async function stageCorpus({ vault, corpus = CORPORA.division17, log = console.log }) {
  const root = importRoot(vault); const cache = join(root, "cache", corpus.key); const manifest = await json(join(cache, "manifest.json"));
  assertCorpus(manifest.records, corpus);
  const existing = await existingNotes(vault); const existingNames = new Map(Array.from(existing, ([id, value]) => [id, value.filename]));
  const filenameById = assignFilenames(manifest.records, existingNames, corpus);
  const addressById = new Map(manifest.records.map((record) => [record.archiveId, record.address]));
  const filenameByAddress = new Map(); for (const record of manifest.records) if (!filenameByAddress.has(record.address)) filenameByAddress.set(record.address, filenameById.get(record.archiveId));
  const stage = join(root, "stage", corpus.key); await rm(stage, { recursive: true, force: true }); await mkdir(stage, { recursive: true });
  const staged = []; const allReferences = [];
  const preserved = new Set(corpus.preserveIds);
  for (const record of manifest.records) {
    const xmlPath = join(cache, cacheFilename(record.archiveId)); const xml = await readFile(xmlPath, "utf8");
    if (sha256(xml) !== record.checksum) throw new Error(`Cache checksum mismatch: ${record.archiveId}`);
    const suppressReferenceIds = record.archiveId === corpus.reverse?.frontId
      ? new Set([corpus.reverse.reverseId])
      : record.archiveId === corpus.reverse?.reverseId ? new Set([corpus.reverse.frontId]) : new Set();
    const rendered = record.isDummy ? { body: "", title: "", titleEvidence: null, references: [] } : renderTei(xml, { filenameById, addressById, sourceAddress: record.address, suppressReferenceIds });
    let body = rendered.body;
    if (preserved.has(record.archiveId) && existing.has(record.archiveId)) body = normalizeExistingBody(splitNote(existing.get(record.archiveId).text).body, filenameByAddress, rendered.references);
    if (corpus.reverse !== null && record.archiveId === corpus.reverse.frontId) body = `${body}${body ? "\n\n" : ""}${corpus.reverse.branchLink}`;
    const content = `${frontmatter(record, rendered)}\n${body ? `${body}\n` : ""}`;
    const filename = filenameById.get(record.archiveId); await writeFile(join(stage, filename), content);
    staged.push({ ...record, filename, checksum: sha256(content), title: rendered.title, titleEvidence: rendered.titleEvidence, references: rendered.references });
    for (const reference of rendered.references) allReferences.push({ from: record.archiveId, ...reference });
  }
  const refs = renderRefs(staged, allReferences, corpus);
  await writeFile(join(root, "stage", `${corpus.key}-refs.md`), refs);
  const stageManifest = { schemaVersion: 2, corpus: corpus.key, zk: corpus.zk, prefix: corpus.prefix, generatedAt: new Date().toISOString(), cacheManifestChecksum: sha256(await readFile(join(cache, "manifest.json"))), refsChecksum: sha256(refs), records: staged };
  await atomicWrite(join(root, "stage", `${corpus.key}-manifest.json`), `${JSON.stringify(stageManifest, null, 2)}\n`);
  log(`Staged ${staged.length} notes in ${stage}`); return stageManifest;
}

function renderRefs(records, references, corpus) {
  const byFrom = groupBy(
    references.filter((reference) => !reference.imported),
    (reference) => reference.from,
  );
  const addressCounts = new Map();
  for (const record of records) addressCounts.set(record.address, (addressCounts.get(record.address) ?? 0) + 1);
  const sections = [];
  for (const record of records) {
    const refs = byFrom.get(record.archiveId) ?? []; if (!refs.length) continue;
    const unique = new Map(refs.map((reference) => [reference.archiveId, reference]));
    const heading = (addressCounts.get(record.address) ?? 0) > 1 || record.side === "reverse"
      ? record.filename.replace(/^Luhmann |\.md$/gu, "")
      : record.address;
    sections.push(`## ${heading}\n\n${Array.from(unique.values(), (reference) => `[${reference.visible}](${reference.url})`).join(" · ")}`);
  }
  return `${corpus.refsStart}\n${sections.join("\n\n")}\n${corpus.refsEnd}\n`;
}

function balancedLinks(text) { return (text.match(/\[\[/gu)?.length ?? 0) === (text.match(/\]\]/gu)?.length ?? 0); }
export async function validateCorpus({ vault, corpus = CORPORA.division17, log = console.log }) {
  const root = importRoot(vault); const stagePath = join(root, "stage", corpus.key); const manifestPath = join(root, "stage", `${corpus.key}-manifest.json`); const manifestText = await readFile(manifestPath); const manifest = JSON.parse(manifestText);
  const errors = []; const warnings = []; const files = (await readdir(stagePath)).filter((file) => file.endsWith(".md"));
  const expected = corpus.expected;
  if (files.length !== expected.total) errors.push(`Expected ${expected.total} Markdown files, found ${files.length}`);
  if (new Set(manifest.records.map((record) => record.archiveId)).size !== expected.total) errors.push("Archive IDs are not unique");
  if (new Set(manifest.records.map((record) => record.filename)).size !== expected.total) errors.push("Filenames are not unique");
  if (new Set(manifest.records.map((record) => record.filename.toLocaleLowerCase("en-US"))).size !== expected.total) errors.push("Filenames collide on a case-insensitive filesystem");
  const filenames = new Set(files.map((file) => file.replace(/\.md$/u, "")));
  const recordsById = new Map(manifest.records.map((record) => [record.archiveId, record]));
  for (const record of manifest.records) {
    const path = join(stagePath, record.filename); const content = await readFile(path, "utf8");
    if (sha256(content) !== record.checksum) errors.push(`Staged checksum changed: ${record.filename}`);
    if (!balancedLinks(content)) errors.push(`Unbalanced wikilinks: ${record.filename}`);
    if (record.title && !record.titleEvidence) errors.push(`Title lacks TEI evidence: ${record.filename}`);
    if (!/^---\nzettel-id: .+\ntitle: .*\narchive-id: .+\nsource: .+\nlicense: .+\n/mu.test(content)) errors.push(`Invalid frontmatter order: ${record.filename}`);
    if (!content.startsWith(`---\nzettel-id: ${JSON.stringify(record.address)}\n`)) errors.push(`Address changed in ${record.filename}`);
    if (record.filename.includes("/")) errors.push(`Filename contains a path separator: ${record.filename}`);
    for (const reference of record.references) {
      const target = recordsById.get(reference.archiveId);
      if (reference.branch && target && isNaturalAddressAncestor(target.address, record.address)) errors.push(`Return reference marked as branch: ${record.filename} -> ${target.filename}`);
      if (reference.omitted && (!(reference.near || reference.redHeaderLabel) || !target || !isNaturalAddressAncestor(target.address, record.address))) errors.push(`Invalid omitted reference evidence: ${record.filename} -> ${reference.archiveId}`);
    }
    for (const match of content.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu)) {
      const target = match[1]; const alias = match[2];
      if (target.startsWith("Luhmann ") && !filenames.has(target)) errors.push(`Missing internal target ${target} in ${record.filename}`);
      if (alias?.startsWith("+") && !/^\+[^+]/u.test(alias)) errors.push(`Noncanonical branch alias in ${record.filename}`);
    }
  }
  if (corpus.reverse !== null) {
    const frontRecord = manifest.records.find((record) => record.archiveId === corpus.reverse.frontId);
    const front = frontRecord ? await readFile(join(stagePath, frontRecord.filename), "utf8") : "";
    const reverse = await readFile(join(stagePath, corpus.reverse.reverseFilename), "utf8");
    if (!front.trimEnd().endsWith(corpus.reverse.branchLink) || front.split(corpus.reverse.branchLink).length !== 2) errors.push(`Front must end with exactly one reverse branch in ${corpus.label}`);
    if (reverse.includes("|+R]]")) errors.push(`Reverse must not branch back to its front in ${corpus.label}`);
  }
  const report = { schemaVersion: 2, corpus: corpus.key, zk: corpus.zk, prefix: corpus.prefix, validatedAt: new Date().toISOString(), passed: errors.length === 0 && warnings.length === 0, stageManifestChecksum: sha256(manifestText), errors, warnings };
  await atomicWrite(join(root, "stage", `${corpus.key}-validation.json`), `${JSON.stringify(report, null, 2)}\n`);
  log(report.passed ? "Validation passed" : `Validation failed with ${errors.length} errors and ${warnings.length} warnings`); return report;
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
function replaceRefs(original, generated, corpus) {
  const marked = new RegExp(`${escapeRegExp(corpus.refsStart)}[\\s\\S]*?${escapeRegExp(corpus.refsEnd)}\\n?`, "u"); if (marked.test(original)) return original.replace(marked, generated);
  if (corpus.legacyRefsHeading === null) return `${original.trimEnd()}\n\n${generated}`;
  const lines = original.split("\n"); const first = lines.findIndex((line) => corpus.legacyRefsHeading.test(line));
  if (first < 0) return `${original.trimEnd()}\n\n${generated}`;
  let end = first + 1; while (end < lines.length && (!lines[end].startsWith("## ") || corpus.legacyRefsHeading.test(lines[end]))) end += 1;
  return [...lines.slice(0, first), generated.trimEnd(), ...lines.slice(end)].join("\n").replace(/\n{3,}/gu, "\n\n").trimEnd() + "\n";
}

export async function applyCorpus({ vault, corpus = CORPORA.division17, log = console.log }) {
  const root = importRoot(vault); const stageRoot = join(root, "stage"); const manifestText = await readFile(join(stageRoot, `${corpus.key}-manifest.json`)); const manifest = JSON.parse(manifestText); const report = await json(join(stageRoot, `${corpus.key}-validation.json`));
  if (!report.passed || report.stageManifestChecksum !== sha256(manifestText)) throw new Error("Apply requires an unchanged, passing validation report");
  for (const record of manifest.records) if (sha256(await readFile(join(stageRoot, corpus.key, record.filename))) !== record.checksum) throw new Error(`Stage changed after validation: ${record.filename}`);
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-"); const backup = join(root, "backups", stamp); await mkdir(backup, { recursive: true });
  const operations = [];
  for (const record of manifest.records) {
    const destination = join(vault, record.filename); const wasPresent = await exists(destination);
    if (wasPresent) { await mkdir(join(backup, "notes"), { recursive: true }); await cp(destination, join(backup, "notes", record.filename)); }
    await atomicWrite(destination, await readFile(join(stageRoot, corpus.key, record.filename)));
    operations.push({ path: record.filename, action: wasPresent ? "replaced" : "created" });
  }
  const refsPath = join(vault, ".luhmann-refs.md"); const refsWasPresent = await exists(refsPath); const refsOriginal = refsWasPresent ? await readFile(refsPath, "utf8") : "# Luhmann refs\n\n";
  if (refsWasPresent) await cp(refsPath, join(backup, ".luhmann-refs.md"));
  const generated = await readFile(join(stageRoot, `${corpus.key}-refs.md`), "utf8"); await atomicWrite(refsPath, replaceRefs(refsOriginal, generated, corpus));
  operations.push({ path: ".luhmann-refs.md", action: refsWasPresent ? "replaced" : "created" });
  const rollback = { schemaVersion: 2, corpus: corpus.key, zk: corpus.zk, prefix: corpus.prefix, appliedAt: new Date().toISOString(), vault, operations };
  await atomicWrite(join(backup, "rollback.json"), `${JSON.stringify(rollback, null, 2)}\n`);
  log(`Applied ${manifest.records.length} notes; backup and rollback manifest: ${backup}`); return rollback;
}
