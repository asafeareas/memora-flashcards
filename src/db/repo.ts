import { db, uid } from "./db";
import type { Card, Deck, DeckSettings, Folder, Note, Rating, Review } from "./types";
import { defaultDeckSettings, paramsFor } from "../domain/presets";
import { newCardFields, resetCardProgress, schedule } from "../domain/scheduler";
import { variantsForNote, normalizeCloze, stripHtml } from "../domain/notes";
import { dayKey } from "../domain/queue";

export const TRASH_RETENTION_DAYS = 30;
export const MAX_CARDS_PER_DECK = 10_000;

const DECK_COLORS = ["#5b54e8", "#e8544f", "#f29b38", "#2fae6b", "#2f8fe0", "#c34fd6", "#13a3a3", "#e04f8f"];
export const pickColor = (seed: number) => DECK_COLORS[Math.abs(seed) % DECK_COLORS.length];
export { DECK_COLORS };

/* ------------------------------------------------------------------ decks */

export async function descendantIds(deckId: string): Promise<string[]> {
  const all = await db.decks.toArray();
  const out: string[] = [];
  const walk = (id: string) => {
    for (const d of all) if (d.parentId === id) {
      out.push(d.id);
      walk(d.id);
    }
  };
  walk(deckId);
  return out;
}

export const treeIds = async (deckId: string) => [deckId, ...(await descendantIds(deckId))];

export async function rootDeck(deckId: string): Promise<Deck | undefined> {
  let d = await db.decks.get(deckId);
  while (d?.parentId) {
    const p = await db.decks.get(d.parentId);
    if (!p) break;
    d = p;
  }
  return d;
}

export async function createDeck(input: { name: string; parentId?: string | null; folderId?: string | null; emoji?: string; color?: string; description?: string }): Promise<string> {
  const now = Date.now();
  const id = uid();
  const parent = input.parentId ? await db.decks.get(input.parentId) : undefined;
  const settings: DeckSettings = defaultDeckSettings();
  if (parent) {
    settings.algorithm = parent.settings.algorithm;
    settings.params = { ...parent.settings.params };
  }
  const count = await db.decks.count();
  await db.decks.add({
    id,
    name: input.name.trim() || "Novo deck",
    description: input.description,
    parentId: input.parentId ?? null,
    folderId: parent ? null : (input.folderId ?? null),
    color: input.color ?? pickColor(count),
    emoji: input.emoji ?? "",
    order: -now,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    deletedAt: null,
    settings,
  });
  return id;
}

export async function updateDeck(id: string, patch: Partial<Pick<Deck, "name" | "emoji" | "color" | "description" | "order">>) {
  await db.decks.update(id, { ...patch, updatedAt: Date.now() });
}

/**
 * Updates deck settings. Changing the algorithm resets the progress of the
 * whole deck tree and propagates to subdecks.
 */
export async function updateDeckSettings(id: string, patch: Partial<DeckSettings>) {
  await db.transaction("rw", db.decks, db.cards, async () => {
    const deck = await db.decks.get(id);
    if (!deck) return;
    const next: DeckSettings = { ...deck.settings, ...patch };
    const algorithmChanged = patch.algorithm !== undefined && patch.algorithm !== deck.settings.algorithm;
    if (algorithmChanged && patch.params === undefined) next.params = paramsFor(next.algorithm, deck.settings.params);
    await db.decks.update(id, { settings: next, updatedAt: Date.now() });
    const ids = await treeIds(id);
    if (algorithmChanged || patch.params) {
      for (const sub of ids.slice(1)) {
        const s = await db.decks.get(sub);
        if (s) await db.decks.update(sub, { settings: { ...s.settings, algorithm: next.algorithm, params: { ...next.params } } });
      }
    }
    if (algorithmChanged) {
      const cards = await db.cards.where("deckId").anyOf(ids).toArray();
      await db.cards.bulkPut(cards.map(resetCardProgress));
    }
  });
  if (patch.reverse !== undefined) await syncDeckCards(id);
}

export async function resetDeckProgress(id: string) {
  const ids = await treeIds(id);
  await db.transaction("rw", db.cards, async () => {
    const cards = await db.cards.where("deckId").anyOf(ids).toArray();
    await db.cards.bulkPut(cards.map(resetCardProgress));
  });
}

export async function archiveDeck(id: string, archived = true) {
  const ids = await treeIds(id);
  const ts = archived ? Date.now() : null;
  await db.decks.bulkUpdate(ids.map((key) => ({ key, changes: { archivedAt: ts } })));
}

/** Moves the deck tree to "Recently deleted" (kept for 30 days with its progress). */
export async function softDeleteDeck(id: string) {
  const ids = await treeIds(id);
  const ts = Date.now();
  await db.decks.bulkUpdate(ids.map((key) => ({ key, changes: { deletedAt: ts } })));
  const deck = await db.decks.get(id);
  if (deck?.parentId) {
    const parent = await db.decks.get(deck.parentId);
    if (!parent || parent.deletedAt === null) await db.decks.update(id, { parentId: null, folderId: null });
  }
}

export async function restoreDeck(id: string) {
  const ids = await treeIds(id);
  await db.decks.bulkUpdate(ids.map((key) => ({ key, changes: { deletedAt: null } })));
  const deck = await db.decks.get(id);
  if (deck?.folderId && !(await db.folders.get(deck.folderId))) await db.decks.update(id, { folderId: null });
}

export async function purgeDeck(id: string) {
  const ids = await treeIds(id);
  await db.transaction("rw", db.decks, db.notes, db.cards, db.reviews, async () => {
    await db.notes.where("deckId").anyOf(ids).delete();
    await db.cards.where("deckId").anyOf(ids).delete();
    await db.reviews.where("deckId").anyOf(ids).delete();
    await db.decks.bulkDelete(ids);
  });
}

export async function purgeExpiredTrash(now = Date.now()) {
  const limit = now - TRASH_RETENTION_DAYS * 86_400_000;
  const expired = await db.decks.filter((d) => d.deletedAt !== null && d.deletedAt < limit && !d.parentId).toArray();
  for (const d of expired) await purgeDeck(d.id);
  return expired.length;
}

export async function moveDeck(id: string, target: { parentId?: string | null; folderId?: string | null }) {
  if (target.parentId) {
    const forbidden = await treeIds(id);
    if (forbidden.includes(target.parentId)) throw new Error("Não é possível mover um deck para dentro dele mesmo.");
    const parent = await db.decks.get(target.parentId);
    await db.decks.update(id, { parentId: target.parentId, folderId: null, updatedAt: Date.now() });
    if (parent) {
      for (const sub of await treeIds(id)) {
        const s = await db.decks.get(sub);
        if (s && s.settings.algorithm !== parent.settings.algorithm) {
          await db.decks.update(sub, { settings: { ...s.settings, algorithm: parent.settings.algorithm, params: { ...parent.settings.params } } });
          const cards = await db.cards.where("deckId").equals(sub).toArray();
          await db.cards.bulkPut(cards.map(resetCardProgress));
        }
      }
    }
  } else {
    await db.decks.update(id, { parentId: null, folderId: target.folderId ?? null, updatedAt: Date.now() });
  }
}

/** Duplicates a deck tree (notes, cards, optionally progress). */
export async function duplicateDeck(id: string, keepProgress: boolean, newParent: string | null | undefined = undefined): Promise<string> {
  const src = await db.decks.get(id);
  if (!src) throw new Error("Deck não encontrado");
  const now = Date.now();
  const copyId = uid();
  await db.decks.add({
    ...structuredClone(src),
    id: copyId,
    name: newParent === undefined ? `${src.name} (cópia)` : src.name,
    parentId: newParent === undefined ? src.parentId : newParent,
    createdAt: now,
    updatedAt: now,
    order: -now,
    archivedAt: null,
    deletedAt: null,
  });
  const notes = await db.notes.where("deckId").equals(id).toArray();
  const cards = await db.cards.where("deckId").equals(id).toArray();
  const noteMap = new Map<string, string>();
  await db.notes.bulkAdd(
    notes.map((n) => {
      const nid = uid();
      noteMap.set(n.id, nid);
      return { ...structuredClone(n), id: nid, deckId: copyId, createdAt: now, updatedAt: now };
    }),
  );
  await db.cards.bulkAdd(
    cards.map((c) => {
      const base: Card = { ...c, id: uid(), noteId: noteMap.get(c.noteId)!, deckId: copyId };
      return keepProgress ? base : { ...resetCardProgress(base), frozen: false };
    }),
  );
  const subs = await db.decks.where("parentId").equals(id).toArray();
  for (const s of subs) if (s.deletedAt === null) await duplicateDeck(s.id, keepProgress, copyId);
  return copyId;
}

/* ---------------------------------------------------------------- folders */

export async function createFolder(name: string, icon = "folder", color = "#5b54e8"): Promise<string> {
  const id = uid();
  await db.folders.add({ id, name: name.trim() || "Nova pasta", icon, color, order: Date.now(), createdAt: Date.now() });
  return id;
}

export const updateFolder = (id: string, patch: Partial<Pick<Folder, "name" | "icon" | "color">>) => db.folders.update(id, patch);

/** Deleting a folder removes the decks it contains (to "Recently deleted"). */
export async function deleteFolder(id: string) {
  const decks = await db.decks.where("folderId").equals(id).toArray();
  for (const d of decks) {
    await softDeleteDeck(d.id);
    await db.decks.update(d.id, { folderId: null });
  }
  await db.folders.delete(id);
}

export async function setDecksFolder(deckIds: string[], folderId: string | null) {
  await db.decks.bulkUpdate(deckIds.map((key) => ({ key, changes: { folderId, parentId: null } })));
}

/* ------------------------------------------------------------------ notes */

export async function deckCardCount(deckId: string) {
  return db.notes.where("deckId").equals(deckId).count();
}

/** Creates or updates cards so they match the note's variants, keeping existing progress. */
async function syncNoteCards(note: Note, deckReverse: boolean) {
  const wanted = variantsForNote(note, deckReverse);
  const existing = await db.cards.where("noteId").equals(note.id).toArray();
  const byVariant = new Map(existing.map((c) => [c.variant, c]));
  const now = Date.now();
  const toAdd: Card[] = [];
  for (const v of wanted) {
    const c = byVariant.get(v);
    if (c) {
      if (c.deckId !== note.deckId) await db.cards.update(c.id, { deckId: note.deckId });
    } else toAdd.push({ id: uid(), noteId: note.id, deckId: note.deckId, variant: v, ...newCardFields(now) });
  }
  if (toAdd.length) await db.cards.bulkAdd(toAdd);
  const remove = existing.filter((c) => !wanted.includes(c.variant)).map((c) => c.id);
  if (remove.length) await db.cards.bulkDelete(remove);
}

export async function syncDeckCards(deckId: string) {
  const deck = await db.decks.get(deckId);
  if (!deck) return;
  await db.transaction("rw", db.notes, db.cards, async () => {
    const notes = await db.notes.where("deckId").equals(deckId).toArray();
    for (const n of notes) await syncNoteCards(n, deck.settings.reverse);
  });
}

export type NoteInput = Omit<Note, "id" | "createdAt" | "updatedAt"> & { id?: string };

export async function saveNote(input: NoteInput): Promise<string> {
  const deck = await db.decks.get(input.deckId);
  if (!deck) throw new Error("Deck não encontrado");
  const now = Date.now();
  const front = input.type === "cloze" ? normalizeCloze(input.front) : input.front;
  return db.transaction("rw", db.notes, db.cards, db.decks, async () => {
    let note: Note;
    if (input.id) {
      const prev = await db.notes.get(input.id);
      if (!prev) throw new Error("Cartão não encontrado");
      note = { ...prev, ...input, front, id: input.id, updatedAt: now };
    } else {
      if ((await deckCardCount(input.deckId)) >= MAX_CARDS_PER_DECK) throw new Error(`O deck atingiu o limite de ${MAX_CARDS_PER_DECK} cartões.`);
      note = { ...input, front, id: uid(), createdAt: now, updatedAt: now };
    }
    await db.notes.put(note);
    await syncNoteCards(note, deck.settings.reverse);
    await db.decks.update(deck.id, { updatedAt: now });
    return note.id;
  });
}

export async function bulkAddNotes(deckId: string, notes: Array<Pick<Note, "type" | "front" | "back"> & Partial<Note>>) {
  const deck = await db.decks.get(deckId);
  if (!deck) throw new Error("Deck não encontrado");
  const existing = await deckCardCount(deckId);
  if (existing + notes.length > MAX_CARDS_PER_DECK) throw new Error(`O deck atingiu o limite de ${MAX_CARDS_PER_DECK} cartões.`);
  const now = Date.now();
  await db.transaction("rw", db.notes, db.cards, db.decks, async () => {
    const rows: Note[] = notes.map((n, i) => ({
      ...n,
      id: uid(),
      deckId,
      front: n.type === "cloze" ? normalizeCloze(n.front) : n.front,
      createdAt: now + i,
      updatedAt: now + i,
    }));
    await db.notes.bulkAdd(rows);
    const cards: Card[] = [];
    for (const n of rows) for (const v of variantsForNote(n, deck.settings.reverse)) cards.push({ id: uid(), noteId: n.id, deckId, variant: v, ...newCardFields(n.createdAt) });
    await db.cards.bulkAdd(cards);
    await db.decks.update(deckId, { updatedAt: now });
  });
  return notes.length;
}

export async function deleteNotes(noteIds: string[]) {
  await db.transaction("rw", db.notes, db.cards, async () => {
    await db.cards.where("noteId").anyOf(noteIds).delete();
    await db.notes.bulkDelete(noteIds);
  });
}

export async function moveNotes(noteIds: string[], deckId: string) {
  const deck = await db.decks.get(deckId);
  if (!deck) throw new Error("Deck não encontrado");
  await db.transaction("rw", db.notes, db.cards, async () => {
    for (const id of noteIds) {
      const n = await db.notes.get(id);
      if (!n) continue;
      const moved = { ...n, deckId, updatedAt: Date.now() };
      await db.notes.put(moved);
      await syncNoteCards(moved, deck.settings.reverse);
    }
  });
}

export async function setNotesFrozen(noteIds: string[], frozen: boolean) {
  const cards = await db.cards.where("noteId").anyOf(noteIds).toArray();
  await db.cards.bulkUpdate(cards.map((c) => ({ key: c.id, changes: { frozen } })));
}

export const setCardFrozen = (cardId: string, frozen: boolean) => db.cards.update(cardId, { frozen });

export async function setNotesReversed(noteIds: string[], reversed: boolean) {
  await db.transaction("rw", db.notes, db.cards, db.decks, async () => {
    for (const id of noteIds) {
      const n = await db.notes.get(id);
      if (!n || n.type !== "basic") continue;
      const deck = await db.decks.get(n.deckId);
      const updated = { ...n, reversed };
      await db.notes.put(updated);
      await syncNoteCards(updated, !!deck?.settings.reverse);
    }
  });
}

export async function resetNotesProgress(noteIds: string[]) {
  const cards = await db.cards.where("noteId").anyOf(noteIds).toArray();
  await db.cards.bulkPut(cards.map(resetCardProgress));
}

/** Potential duplicate: same front text in the same deck. */
export async function findDuplicate(deckId: string, frontHtml: string, ignoreId?: string): Promise<Note | undefined> {
  const text = stripHtml(frontHtml).toLowerCase();
  if (!text) return undefined;
  return db.notes.where("deckId").equals(deckId).filter((n) => n.id !== ignoreId && stripHtml(n.front).toLowerCase() === text).first();
}

/* ---------------------------------------------------------------- reviews */

export async function answerCard(cardId: string, rating: Rating, durationMs: number, now = Date.now()): Promise<Card> {
  return db.transaction("rw", db.cards, db.reviews, db.decks, async () => {
    const card = await db.cards.get(cardId);
    if (!card) throw new Error("Cartão não encontrado");
    const root = await rootDeck(card.deckId);
    const settings = root?.settings ?? defaultDeckSettings();
    const { card: next } = schedule(card, rating, settings.algorithm, settings.params, now);
    await db.cards.put(next);
    const review: Review = {
      id: uid(),
      cardId,
      noteId: card.noteId,
      deckId: card.deckId,
      rating,
      at: now,
      durationMs: Math.min(durationMs, 5 * 60_000),
      prevInterval: card.interval,
      interval: next.interval,
      prevState: card.state,
      state: next.state,
      day: dayKey(now),
    };
    await db.reviews.add(review);
    await db.decks.update(card.deckId, { studiedAt: now });
    if (root && root.id !== card.deckId) await db.decks.update(root.id, { studiedAt: now });
    return next;
  });
}

/** Restarts a speed-learning round: every card becomes pending again. */
export async function restartSpeedRound(deckId: string) {
  const ids = await treeIds(deckId);
  const cards = await db.cards.where("deckId").anyOf(ids).toArray();
  await db.cards.bulkUpdate(cards.filter((c) => c.state === "review").map((c) => ({ key: c.id, changes: { state: "learning" as const, struggling: false } })));
}

/* --------------------------------------------------------------- settings */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value });
