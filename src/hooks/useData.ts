import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import type { Card, Deck, DisplayStatus, Review } from "../db/types";
import { displayStatus } from "../domain/scheduler";
import { dayKey, todayCounts, type TodayCounts } from "../domain/queue";
import { setSetting } from "../db/repo";

export const STATUS_ORDER: DisplayStatus[] = ["notStudied", "notQuite", "learning", "gotIt", "mastered", "frozen"];

export interface DeckStats {
  notes: number;
  cards: number;
  byStatus: Record<DisplayStatus, number>;
  today: TodayCounts;
}

const emptyStatus = (): Record<DisplayStatus, number> => ({ notStudied: 0, notQuite: 0, learning: 0, gotIt: 0, mastered: 0, frozen: 0 });

/** Child map for quick tree lookups. */
export function childrenMap(decks: Deck[]) {
  const m = new Map<string | null, Deck[]>();
  for (const d of decks) {
    const k = d.parentId;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(d);
  }
  return m;
}

export function subtreeIds(decks: Deck[], id: string): string[] {
  const kids = childrenMap(decks);
  const out: string[] = [];
  const walk = (x: string) => {
    out.push(x);
    for (const k of kids.get(x) ?? []) walk(k.id);
  };
  walk(id);
  return out;
}

export function computeStats(deck: Deck, decks: Deck[], cards: Card[], notesCount: Map<string, number>, todayReviews: Review[]): DeckStats {
  const ids = new Set(subtreeIds(decks, deck.id));
  const mine = cards.filter((c) => ids.has(c.deckId));
  const byStatus = emptyStatus();
  for (const c of mine) byStatus[displayStatus(c)]++;
  let notes = 0;
  for (const id of ids) notes += notesCount.get(id) ?? 0;
  return {
    notes,
    cards: mine.length,
    byStatus,
    today: todayCounts(mine, deck.settings, todayReviews.filter((r) => ids.has(r.deckId))),
  };
}

/** Everything the home/folder screens need, in one reactive query. */
export function useLibrary() {
  return useLiveQuery(async () => {
    const [decks, folders, cards, notes, todayReviews] = await Promise.all([
      db.decks.toArray(),
      db.folders.orderBy("order").toArray(),
      db.cards.toArray(),
      db.notes.toArray(),
      db.reviews.where("day").equals(dayKey()).toArray(),
    ]);
    const notesCount = new Map<string, number>();
    for (const n of notes) notesCount.set(n.deckId, (notesCount.get(n.deckId) ?? 0) + 1);
    const live = decks.filter((d) => d.deletedAt === null);
    const stats = new Map<string, DeckStats>();
    for (const d of live) stats.set(d.id, computeStats(d, live, cards, notesCount, todayReviews));
    return { decks: live, allDecks: decks, folders, stats, todayReviews };
  }, []);
}

export function useDeck(id: string | undefined) {
  return useLiveQuery(async () => {
    if (!id) return null;
    const deck = await db.decks.get(id);
    if (!deck) return null;
    const all = (await db.decks.toArray()).filter((d) => d.deletedAt === null || d.id === id);
    const ids = subtreeIds(all, id);
    const [cards, notes, todayReviews] = await Promise.all([
      db.cards.where("deckId").anyOf(ids).toArray(),
      db.notes.where("deckId").anyOf(ids).toArray(),
      db.reviews.where("day").equals(dayKey()).toArray(),
    ]);
    const notesCount = new Map<string, number>();
    for (const n of notes) notesCount.set(n.deckId, (notesCount.get(n.deckId) ?? 0) + 1);
    const chain: Deck[] = [];
    let p = deck.parentId ? all.find((d) => d.id === deck.parentId) : undefined;
    while (p) {
      chain.unshift(p);
      const pid: string | null = p.parentId;
      p = pid ? all.find((d) => d.id === pid) : undefined;
    }
    const root = chain[0] ?? deck;
    const effective: Deck = { ...deck, settings: { ...deck.settings, algorithm: root.settings.algorithm, params: root.settings.params } };
    const stats = computeStats(effective, all, cards, notesCount, todayReviews);
    const subdecks = all.filter((d) => d.parentId === id && d.deletedAt === null);
    const subStats = new Map(subdecks.map((s) => [s.id, computeStats(s, all, cards, notesCount, todayReviews)]));
    const folder = deck.folderId ? await db.folders.get(deck.folderId) : undefined;
    return { deck, root, chain, cards, notes, stats, subdecks, subStats, folder, allDecks: all };
  }, [id]);
}

export function useSetting<T>(key: string, fallback: T): [T, (v: T) => Promise<unknown>] {
  const value = useLiveQuery(async () => (await db.settings.get(key))?.value as T | undefined, [key]);
  return [value === undefined ? fallback : value, (v: T) => setSetting(key, v)];
}

/* ----------------------------------------------------------------- streak */

export const ACTIVE_DAY_GOAL = 5;

export interface ActivityData {
  days: Map<string, number>;
  streak: number;
  longest: number;
  activeDays: number;
  todayCount: number;
  todayActive: boolean;
  freezes: number;
  frozenDays: Set<string>;
  totalReviews: number;
}

const prevDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
};

/**
 * Streak with "streak freezes": every 7 consecutive active days earns a freeze
 * (max 2) that automatically covers one missed day.
 */
export function computeActivity(reviews: Pick<Review, "day">[], today = dayKey()): ActivityData {
  const days = new Map<string, number>();
  for (const r of reviews) days.set(r.day, (days.get(r.day) ?? 0) + 1);
  const active = new Set([...days].filter(([, n]) => n >= ACTIVE_DAY_GOAL).map(([d]) => d));
  const sorted = [...active].sort();
  let freezes = 0;
  let run = 0;
  let longest = 0;
  let current = 0;
  const frozenDays = new Set<string>();
  if (sorted.length) {
    let cursor = sorted[0];
    const end = today;
    while (cursor <= end) {
      if (active.has(cursor)) {
        run++;
        current++;
        if (run % 7 === 0) freezes = Math.min(2, freezes + 1);
      } else if (cursor !== end) {
        if (freezes > 0 && current > 0) {
          freezes--;
          frozenDays.add(cursor);
        } else {
          current = 0;
          run = 0;
        }
      }
      longest = Math.max(longest, current);
      const [y, m, d] = cursor.split("-").map(Number);
      cursor = dayKey(new Date(y, m - 1, d + 1));
    }
  }
  // If yesterday was missed and not frozen, the streak is broken.
  const y = prevDay(today);
  if (!active.has(today) && !active.has(y) && !frozenDays.has(y)) current = 0;
  return {
    days,
    streak: current,
    longest,
    activeDays: active.size,
    todayCount: days.get(today) ?? 0,
    todayActive: active.has(today),
    freezes,
    frozenDays,
    totalReviews: reviews.length,
  };
}

export function useActivity() {
  return useLiveQuery(async () => {
    const reviews = await db.reviews.toArray();
    return { ...computeActivity(reviews), reviews };
  }, []);
}
