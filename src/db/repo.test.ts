import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  answerCard,
  archiveDeck,
  createDeck,
  createFolder,
  deleteFolder,
  deleteNotes,
  duplicateDeck,
  moveDeck,
  purgeExpiredTrash,
  restoreDeck,
  saveNote,
  setNotesFrozen,
  setNotesReversed,
  softDeleteDeck,
  updateDeckSettings,
} from "./repo";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("repository", () => {
  it("creates notes and cards; editing keeps progress", async () => {
    const deck = await createDeck({ name: "Bio" });
    const noteId = await saveNote({ deckId: deck, type: "basic", front: "<p>Q</p>", back: "<p>A</p>" });
    const [card] = await db.cards.where("noteId").equals(noteId).toArray();
    await answerCard(card.id, 4, 1000);
    await saveNote({ id: noteId, deckId: deck, type: "basic", front: "<p>Q2</p>", back: "<p>A</p>" });
    const after = await db.cards.get(card.id);
    expect(after?.state).toBe("review");
    expect((await db.notes.get(noteId))?.front).toBe("<p>Q2</p>");
    expect(await db.reviews.count()).toBe(1);
  });

  it("cloze notes produce one card per index", async () => {
    const deck = await createDeck({ name: "Cloze" });
    const id = await saveNote({ deckId: deck, type: "cloze", front: "{{c1::a}} {{c2::b}} {{c3::c}}", back: "" });
    expect(await db.cards.where("noteId").equals(id).count()).toBe(3);
  });

  it("deck reverse mode and per-note reverse add reverse cards", async () => {
    const deck = await createDeck({ name: "Rev" });
    const n = await saveNote({ deckId: deck, type: "basic", front: "a", back: "b" });
    await updateDeckSettings(deck, { reverse: true });
    expect(await db.cards.where("noteId").equals(n).count()).toBe(2);
    await updateDeckSettings(deck, { reverse: false });
    expect(await db.cards.where("noteId").equals(n).count()).toBe(1);
    await setNotesReversed([n], true);
    expect(await db.cards.where("noteId").equals(n).count()).toBe(2);
  });

  it("changing the algorithm resets progress of the tree", async () => {
    const deck = await createDeck({ name: "Alg" });
    const sub = await createDeck({ name: "Sub", parentId: deck });
    const n = await saveNote({ deckId: sub, type: "basic", front: "a", back: "b" });
    const [c] = await db.cards.where("noteId").equals(n).toArray();
    await answerCard(c.id, 4, 1000);
    await updateDeckSettings(deck, { algorithm: "fsrs" });
    expect((await db.cards.get(c.id))?.state).toBe("new");
    expect((await db.decks.get(sub))?.settings.algorithm).toBe("fsrs");
  });

  it("soft delete, restore and 30-day purge", async () => {
    const deck = await createDeck({ name: "Trash" });
    await saveNote({ deckId: deck, type: "basic", front: "a", back: "b" });
    await softDeleteDeck(deck);
    expect((await db.decks.get(deck))?.deletedAt).not.toBeNull();
    await restoreDeck(deck);
    expect((await db.decks.get(deck))?.deletedAt).toBeNull();
    await softDeleteDeck(deck);
    await purgeExpiredTrash(Date.now() + 31 * 86_400_000);
    expect(await db.decks.get(deck)).toBeUndefined();
    expect(await db.cards.count()).toBe(0);
  });

  it("archive, duplicate, move, folders, freeze, delete", async () => {
    const a = await createDeck({ name: "A" });
    const b = await createDeck({ name: "B" });
    await saveNote({ deckId: a, type: "basic", front: "x", back: "y" });
    await archiveDeck(a);
    expect((await db.decks.get(a))?.archivedAt).not.toBeNull();
    await archiveDeck(a, false);
    const copy = await duplicateDeck(a, false);
    expect(await db.notes.where("deckId").equals(copy).count()).toBe(1);
    await moveDeck(b, { parentId: a });
    await expect(moveDeck(a, { parentId: b })).rejects.toThrow();
    const f = await createFolder("Pasta");
    await moveDeck(copy, { folderId: f });
    await deleteFolder(f);
    expect((await db.decks.get(copy))?.deletedAt).not.toBeNull();
    const notes = await db.notes.where("deckId").equals(a).primaryKeys();
    await setNotesFrozen(notes as string[], true);
    expect((await db.cards.where("deckId").equals(a).first())?.frozen).toBe(true);
    await deleteNotes(notes as string[]);
    expect(await db.cards.where("deckId").equals(a).count()).toBe(0);
  });
});
