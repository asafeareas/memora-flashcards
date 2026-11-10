import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import initSqlJs from "sql.js";
import JSZip from "jszip";

const wasmPath = path.resolve("node_modules/sql.js/dist/sql-wasm.wasm");
vi.mock("sql.js/dist/sql-wasm.wasm?url", () => ({ default: path.resolve("node_modules/sql.js/dist/sql-wasm.wasm") }));

import { parseAnki } from "./importers";

/** Builds a minimal legacy Anki package: one basic note, one cloze note and one image. */
async function buildApkg(): Promise<File> {
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database();
  db.run("create table col (models text, decks text)");
  db.run("create table notes (id integer, mid integer, flds text)");
  const models = { "1": { type: 0, name: "Basic" }, "2": { type: 1, name: "Cloze" } };
  const decks = { "1": { name: "Default" }, "99": { name: "Biologia::Células" } };
  db.run("insert into col values (?, ?)", [JSON.stringify(models), JSON.stringify(decks)]);
  db.run("insert into notes values (1, 1, ?)", ['O que é ATP?<img src="atp.png">\x1fMoeda energética [sound:x.mp3]']);
  db.run("insert into notes values (2, 2, ?)", ["A {{c1::mitocôndria}} produz ATP\x1fExtra"]);
  const zip = new JSZip();
  zip.file("collection.anki2", db.export());
  zip.file("media", JSON.stringify({ "0": "atp.png" }));
  zip.file("0", new Uint8Array([137, 80, 78, 71]));
  const blob = await zip.generateAsync({ type: "arraybuffer" });
  return new File([blob], "bio.apkg");
}

describe("Anki import", () => {
  it("reads notes, cloze models, deck name and embeds images", async () => {
    const r = await parseAnki(await buildApkg());
    expect(r.name).toBe("Células");
    expect(r.cards).toHaveLength(2);
    expect(r.images).toBe(1);
    const basic = r.cards.find((c) => c.type === "basic")!;
    expect(basic.front).toContain("data:image/png;base64,");
    expect(basic.back).not.toContain("[sound:");
    const cloze = r.cards.find((c) => c.type === "cloze")!;
    expect(cloze.front).toContain('data-cloze="1"');
  });
});
