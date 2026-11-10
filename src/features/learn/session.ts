import { db } from "../../db/db";
import type { Card, Deck, DeckSettings, Note } from "../../db/types";
import { buildQueue, dayKey, endOfToday } from "../../domain/queue";
import { subtreeIds } from "../../hooks/useData";

export interface SessionData {
  title: string;
  decks: Deck[];
  /** Root settings that apply to each deck id */
  settingsFor: Map<string, DeckSettings>;
  notes: Map<string, Note>;
  queue: Card[];
  speed: boolean;
  /** Learning cards due later today, not part of the queue yet */
  laterToday: Card[];
}

/** Loads everything for a study session: one deck tree, or "all" active root decks. */
export async function loadSession(deckId: string): Promise<SessionData | null> {
  const all = (await db.decks.toArray()).filter((d) => d.deletedAt === null && d.archivedAt === null);
  const todayReviews = await db.reviews.where("day").equals(dayKey()).toArray();
  const roots: { root: Deck; ids: string[] }[] = [];
  let title = "Todos os decks";
  if (deckId === "all") {
    for (const r of all.filter((d) => !d.parentId)) roots.push({ root: r, ids: subtreeIds(all, r.id) });
  } else {
    const deck = all.find((d) => d.id === deckId);
    if (!deck) return null;
    title = deck.name;
    let root = deck;
    while (root.parentId) {
      const p = all.find((d) => d.id === root.parentId);
      if (!p) break;
      root = p;
    }
    roots.push({ root: { ...deck, settings: { ...deck.settings, algorithm: root.settings.algorithm, params: root.settings.params } }, ids: subtreeIds(all, deck.id) });
  }
  const settingsFor = new Map<string, DeckSettings>();
  const queue: Card[] = [];
  const laterToday: Card[] = [];
  const allIds: string[] = [];
  for (const { root, ids } of roots) {
    for (const id of ids) settingsFor.set(id, root.settings);
    allIds.push(...ids);
    const cards = await db.cards.where("deckId").anyOf(ids).toArray();
    const reviews = todayReviews.filter((r) => ids.includes(r.deckId));
    const q = buildQueue(cards, root.settings, reviews);
    queue.push(...q);
  }
  const notesArr = await db.notes.where("deckId").anyOf(allIds).toArray();
  const speed = deckId !== "all" && roots[0]?.root.settings.algorithm === "speed";
  const eod = endOfToday();
  for (const c of queue) if ((c.state === "learning" || c.state === "relearning") && c.due > eod) laterToday.push(c);
  return { title, decks: all, settingsFor, notes: new Map(notesArr.map((n) => [n.id, n])), queue, speed, laterToday };
}

export const LEARN_AHEAD_MS = 20 * 60_000;

/** Picks the next card: due learning cards first, then new/review cards in order, then learning cards within the learn-ahead window. */
export function pickNext(queue: Card[], now = Date.now(), lastId?: string): Card | null {
  const notLast = (c: Card) => queue.length === 1 || c.id !== lastId;
  const dueLearning = queue.filter((c) => (c.state === "learning" || c.state === "relearning") && c.due <= now && notLast(c)).sort((a, b) => a.due - b.due);
  if (dueLearning.length) return dueLearning[0];
  const regular = queue.find((c) => (c.state === "new" || c.state === "review") && notLast(c));
  if (regular) return regular;
  const ahead = queue.filter((c) => c.due <= now + LEARN_AHEAD_MS).sort((a, b) => a.due - b.due);
  return ahead[0] ?? null;
}
