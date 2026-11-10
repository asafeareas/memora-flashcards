import Papa from "papaparse";
import { db, uid } from "../db/db";
import type { Card, Deck, Note } from "../db/types";
import { treeIds } from "../db/repo";
import { stripHtml, variantsForNote } from "./notes";
import { newCardFields } from "./scheduler";
import { isDeckExport, type DeckExportFile } from "./importers";

/** Cloze spans back to {{cN::text}} so the CSV can be re-imported. */
const clozeToText = (html: string) => stripHtml(html.replace(/<span[^>]*data-cloze="(\d+)"[^>]*>([\s\S]*?)<\/span>/g, (_m, n, t) => `{{c${n}::${t}}}`));

export async function exportDeckCsv(deckId: string): Promise<string> {
  const ids = await treeIds(deckId);
  const notes = await db.notes.where("deckId").anyOf(ids).toArray();
  const rows = notes
    .filter((n) => n.type !== "occlusion")
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((n) => [n.type === "cloze" ? clozeToText(n.front) : stripHtml(n.front), stripHtml(n.back)]);
  return Papa.unparse([["Frente", "Verso"], ...rows]);
}

export async function exportDeckJson(deckId: string, includeProgress: boolean): Promise<DeckExportFile> {
  const ids = await treeIds(deckId);
  const decks = await db.decks.bulkGet(ids);
  const notes = await db.notes.where("deckId").anyOf(ids).toArray();
  const cards = includeProgress ? await db.cards.where("deckId").anyOf(ids).toArray() : undefined;
  return { app: "memora", kind: "deck", version: 1, decks: decks.filter(Boolean) as Deck[], notes, cards };
}

/** Imports a deck exported in the Memora format as a new deck tree (new ids). */
export async function importDeckJson(file: unknown, folderId: string | null = null): Promise<string> {
  if (!isDeckExport(file)) throw new Error("Este arquivo não é um deck exportado pelo Memora.");
  const now = Date.now();
  const deckIds = new Map(file.decks.map((d) => [d.id, uid()]));
  const noteIds = new Map(file.notes.map((n) => [n.id, uid()]));
  const rootOld = file.decks.find((d) => !d.parentId || !deckIds.has(d.parentId)) ?? file.decks[0];
  await db.transaction("rw", db.decks, db.notes, db.cards, async () => {
    await db.decks.bulkAdd(
      file.decks.map((d) => ({
        ...d,
        id: deckIds.get(d.id)!,
        parentId: d.parentId && deckIds.has(d.parentId) ? deckIds.get(d.parentId)! : null,
        folderId: d.id === rootOld.id ? folderId : null,
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        order: -now,
      })),
    );
    await db.notes.bulkAdd(file.notes.filter((n) => deckIds.has(n.deckId)).map((n): Note => ({ ...n, id: noteIds.get(n.id)!, deckId: deckIds.get(n.deckId)! })));
    const cards: Card[] = file.cards?.length
      ? file.cards.filter((c) => noteIds.has(c.noteId)).map((c) => ({ ...c, id: uid(), noteId: noteIds.get(c.noteId)!, deckId: deckIds.get(c.deckId) ?? deckIds.get(rootOld.id)! }))
      : [];
    if (!cards.length) {
      // No progress in the file: regenerate fresh cards from the notes.
      for (const n of file.notes) {
        const deck = file.decks.find((d) => d.id === n.deckId);
        for (const v of variantsForNote(n, !!deck?.settings.reverse)) cards.push({ id: uid(), noteId: noteIds.get(n.id)!, deckId: deckIds.get(n.deckId)!, variant: v, ...newCardFields(now) });
      }
    }
    await db.cards.bulkAdd(cards);
  });
  return deckIds.get(rootOld.id)!;
}
