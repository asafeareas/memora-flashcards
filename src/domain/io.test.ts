import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import { answerCard, createDeck, saveNote, setSetting } from "../db/repo";
import { parseCsv, parsePasted } from "./importers";
import { exportDeckCsv, exportDeckJson, importDeckJson } from "./exporters";
import { exportAll, importAll, isEmptyDatabase } from "./backup";
import { normalizeCloze, clozeIndices } from "./notes";
import { sanitizeHtml } from "./render";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("importers", () => {
  it("parses pasted text with tab / newline (Quizlet export)", () => {
    const cards = parsePasted("célula\tunidade da vida\nmitocôndria\tATP\nsem verso", "\t", "\n");
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({ type: "basic", front: "<p>célula</p>", back: "<p>unidade da vida</p>" });
    expect(cards[2].error).toBe("back");
  });
  it("parses custom separators and cloze lines", () => {
    const cards = parsePasted("a - b;{{c1::Brasília}} é a capital", " - ", ";");
    expect(cards[0]).toMatchObject({ type: "basic" });
    expect(cards[1].type).toBe("cloze");
    expect(cards[1].error).toBeUndefined();
  });
  it("parses CSV with header and quoted commas", () => {
    const cards = parseCsv('Frente,Verso\n"Olá, mundo",Hello\nx,y');
    expect(cards).toHaveLength(2);
    expect(cards[0].front).toBe("<p>Olá, mundo</p>");
  });
  it("bare {{answer}} cloze gets sequential indices", () => {
    const html = normalizeCloze("<p>{{a}} e {{c3::b}} e {{c}}</p>");
    expect(clozeIndices(html)).toEqual([3, 4, 5]);
  });
  it("sanitizer removes scripts and handlers", () => {
    const out = sanitizeHtml('<p onclick="x()">ok<script>alert(1)</script><img src="javascript:1"><a href="javascript:2">l</a></p>');
    expect(out).not.toMatch(/script|onclick|javascript/);
  });
});

describe("export / import and backup", () => {
  it("deck CSV and JSON round trip with progress", async () => {
    const deck = await createDeck({ name: "Geo" });
    await createDeck({ name: "Sub", parentId: deck });
    const n = await saveNote({ deckId: deck, type: "basic", front: "<p>Capital do Brasil</p>", back: "<p>Brasília</p>" });
    const [card] = await db.cards.where("noteId").equals(n).toArray();
    await answerCard(card.id, 4, 1000);
    expect(await exportDeckCsv(deck)).toContain("Capital do Brasil,Brasília");
    const file = await exportDeckJson(deck, true);
    const copy = await importDeckJson(JSON.parse(JSON.stringify(file)));
    expect(copy).not.toBe(deck);
    expect(await db.decks.where("parentId").equals(copy).count()).toBe(1);
    const copiedCards = await db.cards.where("deckId").equals(copy).toArray();
    expect(copiedCards[0].state).toBe("review");
  });

  it("full backup restores everything after the database is wiped (simulates clearing site data)", async () => {
    const deck = await createDeck({ name: "Persistente" });
    await saveNote({ deckId: deck, type: "cloze", front: "{{c1::a}} {{c2::b}}", back: "" });
    await setSetting("theme", "dark");
    await setSetting("aiApiKey", "secret");
    const backup = JSON.parse(JSON.stringify(await exportAll()));
    expect(JSON.stringify(backup)).not.toContain("secret");
    // wipe everything
    await Promise.all(db.tables.map((t) => t.clear()));
    expect(await isEmptyDatabase()).toBe(true);
    await importAll(backup);
    expect((await db.decks.get(deck))?.name).toBe("Persistente");
    expect(await db.cards.count()).toBe(2);
    expect((await db.settings.get("theme"))?.value).toBe("dark");
  });
});
