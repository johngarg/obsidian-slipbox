import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assignFilenames, cacheFilename, extractTitle, normalizeSearchRecord, renderTei } from "../scripts/luhmann-import-lib.mjs";

const tei = (body) => `<TEI><text><body><div type="zettel-vorderseite">${body}</div></body></text></TEI>`;

describe("Luhmann importer", () => {
  test("accepts only leading autograph title markup", () => {
    assert.deepEqual(extractTitle(tei('<p><fw type="luhmann_num">17,1</fw><hi rendition="#u">Ideologie</hi> Text</p>')).title, "Ideologie");
    assert.equal(extractTitle(tei('<p><fw type="luhmann_num">17,1</fw>Text <hi rendition="#u">Ding an sich</hi></p>')).title, "");
  });

  test("renders joins, preferred abbreviations, Greek, additions, milestones, and tables", () => {
    const xml = tei('<p><fw type="luhmann_num">17,1</fw>Organi<lb type="inWord"/>sation <choice><abbr>allg.</abbr><expan>allgemeine</expan></choice> α <add hand="#editor">[Zusatz]</add><join target="#ZK_1_NB_17-1a_V"/></p><milestone unit="line"/><table><row><cell>A</cell><cell>B</cell></row></table>');
    const result = renderTei(xml, { filenameById: new Map([["ZK_1_NB_17-1a_V", "Luhmann 17,1a.md"]]) });
    assert.match(result.body, /Organisation allg\. α \[Zusatz\]\[\[Luhmann 17,1a\|17,1a\]\]/u);
    assert.match(result.body, /\| A \| B \|/u);
  });

  test("distinguishes near branches, distant links, and exact duplicate targets", () => {
    const xml = tei('<p><fw type="luhmann_num">17</fw><ref type="nl_vw_einzel_nah" target="#A">1</ref> <ref type="nl_vw_einzel_entf" target="#B">17,1</ref></p>');
    const result = renderTei(xml, { filenameById: new Map([["A", "Luhmann 17 (1).md"], ["B", "Luhmann 17 (2).md"]]) });
    assert.equal(result.body, "[[Luhmann 17 (1)|+1]] [[Luhmann 17 (2)|17,1]]");
  });

  test("omits a child-side branch label that the card header renders", () => {
    const xml = tei('<p><fw type="luhmann_num">17,1,1</fw><ref type="nl_vw_einzel_nah" target="#parent">1</ref> Definitionen</p>');
    const common = { filenameById: new Map([["parent", "Luhmann 17,1.md"]]), addressById: new Map([["parent", "17,1"]]) };
    const returned = renderTei(xml, { ...common, sourceAddress: "17,1,1" });
    const departing = renderTei(xml, { ...common, sourceAddress: "17" });
    assert.equal(returned.body, "Definitionen");
    assert.equal(returned.references[0].branch, false);
    assert.equal(returned.references[0].omitted, true);
    assert.equal(departing.body, "[[Luhmann 17,1|+1]] Definitionen");
    assert.equal(departing.references[0].branch, true);
    assert.equal(departing.references[0].omitted, false);
  });

  test("can suppress TEI face markers when the reverse is modeled separately", () => {
    const xml = tei('<p><fw type="luhmann_num">17,7bc</fw><ref type="nl_vw_einzel_nah" target="#reverse">R</ref> S<add hand="#editor">orel</add></p>');
    const result = renderTei(xml, { filenameById: new Map([["reverse", "Luhmann 17,7bc (R).md"]]), suppressReferenceIds: new Set(["reverse"]) });
    assert.equal(result.body, "Sorel");
  });

  test("assigns stable reverse and duplicate filenames", () => {
    const records = [
      { archiveId: "ZK_1_NB_17_1_V", address: "17", shortTitle: "17(1)" },
      { archiveId: "ZK_1_NB_17_2_V", address: "17", shortTitle: "17(2)" },
      { archiveId: "ZK_1_NB_17-7bc_R", address: "17,7bc", shortTitle: "17,7bc(R)" },
    ];
    const first = assignFilenames(records, new Map([["ZK_1_NB_17_2_V", "Luhmann 17.md"]]));
    const second = assignFilenames(records, new Map([["ZK_1_NB_17_2_V", "Luhmann 17.md"]]));
    assert.deepEqual([...first], [...second]);
    assert.equal(first.get("ZK_1_NB_17_1_V"), "Luhmann 17 (1).md");
    assert.equal(first.get("ZK_1_NB_17-7bc_R"), "Luhmann 17,7bc (R).md");
  });

  test("keeps case-distinct archive identities separate on case-insensitive filesystems", () => {
    assert.notEqual(cacheFilename("ZK_1_NB_17-1a_V").toLowerCase(), cacheFilename("ZK_1_NB_17-1A_V").toLowerCase());
    const files = assignFilenames([
      { archiveId: "lower", address: "17,1a", shortTitle: "17,1a" },
      { archiveId: "upper", address: "17,1A", shortTitle: "17,1A" },
    ]);
    assert.notEqual(files.get("lower").toLowerCase(), files.get("upper").toLowerCase());
    assert.equal(normalizeSearchRecord({ ekin: "x_V", shortTitle: "17,1a", meta: {}, transcription: {} }).address, "17,1a");
  });
});
