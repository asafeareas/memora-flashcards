import Dexie, { type EntityTable } from "dexie";
import type { Card, Deck, Folder, Note, Review, Setting } from "./types";

export class MemoraDB extends Dexie {
  decks!: EntityTable<Deck, "id">;
  folders!: EntityTable<Folder, "id">;
  notes!: EntityTable<Note, "id">;
  cards!: EntityTable<Card, "id">;
  reviews!: EntityTable<Review, "id">;
  settings!: EntityTable<Setting, "key">;

  constructor(name = "memora") {
    super(name);
    this.version(1).stores({
      decks: "id, parentId, folderId, archivedAt, deletedAt, order, updatedAt",
      folders: "id, order",
      notes: "id, deckId, updatedAt, createdAt",
      cards: "id, noteId, deckId, due, state, [deckId+due]",
      reviews: "id, cardId, noteId, deckId, at, day",
      settings: "key",
    });
  }
}

export const db = new MemoraDB();

export const uid = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 20);

/** Listeners notified after any write (used by the automatic file backup). */
const changeListeners = new Set<() => void>();
export const onDataChanged = (fn: () => void) => {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
};
const notify = () => changeListeners.forEach((fn) => fn());

for (const table of ["decks", "folders", "notes", "cards", "reviews", "settings"] as const) {
  const t = db.table(table);
  t.hook("creating", function () {
    this.onsuccess = notify;
  });
  t.hook("updating", function () {
    this.onsuccess = notify;
  });
  t.hook("deleting", function () {
    this.onsuccess = notify;
  });
}
