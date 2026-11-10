import type { Card, DeckSettings, Review } from "../db/types";
import { DAY } from "./scheduler";

export const dayKey = (t: number | Date = Date.now()): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const endOfToday = (now = Date.now()) => {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

export interface TodayCounts {
  /** New cards available today */
  newCount: number;
  /** Learning/relearning cards due today */
  learnCount: number;
  /** Review cards due today */
  reviewCount: number;
  total: number;
  /** Next due timestamp among non-frozen cards, if any */
  nextDue: number | null;
}

/**
 * Builds today's study queue for a deck tree (scheduled presets).
 * Order: due learning cards, due reviews, then new cards (limited by the daily settings).
 */
export function buildQueue(cards: Card[], settings: DeckSettings, todayReviews: Review[], now = Date.now()): Card[] {
  const active = cards.filter((c) => !c.frozen);
  if (settings.algorithm === "speed") {
    const pending = active.filter((c) => c.state !== "review");
    return orderSpeed(pending, settings.shuffle);
  }
  const eod = endOfToday(now);
  const newStudied = new Set(todayReviews.filter((r) => r.prevState === "new").map((r) => r.cardId)).size;
  const reviewsDone = todayReviews.filter((r) => r.prevState === "review").length;
  const newLimit = Math.max(0, settings.newPerDay - newStudied);
  const reviewLimit = Math.max(0, settings.maxReviewsPerDay - reviewsDone);

  const learning = active.filter((c) => (c.state === "learning" || c.state === "relearning") && c.due <= eod).sort((a, b) => a.due - b.due);
  let reviews = active.filter((c) => c.state === "review" && c.due <= eod).sort((a, b) => a.due - b.due).slice(0, reviewLimit);
  let fresh = active.filter((c) => c.state === "new").sort((a, b) => a.createdAt - b.createdAt || a.variant.localeCompare(b.variant)).slice(0, newLimit);
  if (settings.shuffle) {
    reviews = shuffle(reviews);
    fresh = shuffle(fresh);
  }
  return [...learning, ...reviews, ...fresh];
}

/** Cards of the queue that can be shown right now (learning steps may be waiting). */
export function availableNow(queue: Card[], now = Date.now(), learnAheadMs = 20 * 60_000): Card[] {
  return queue.filter((c) => c.state === "new" || c.state === "review" || c.due <= now + learnAheadMs);
}

export function todayCounts(cards: Card[], settings: DeckSettings, todayReviews: Review[], now = Date.now()): TodayCounts {
  const q = buildQueue(cards, settings, todayReviews, now);
  const nextDue = cards.filter((c) => !c.frozen && c.state !== "new").reduce<number | null>((m, c) => (m === null || c.due < m ? c.due : m), null);
  const newCount = q.filter((c) => c.state === "new").length;
  const learnCount = q.filter((c) => c.state === "learning" || c.state === "relearning").length;
  const reviewCount = q.filter((c) => c.state === "review").length;
  return { newCount, learnCount, reviewCount, total: q.length, nextDue };
}

function orderSpeed(cards: Card[], shuffleIt: boolean) {
  const sorted = [...cards].sort((a, b) => Number(!!b.struggling) - Number(!!a.struggling) || a.createdAt - b.createdAt);
  return shuffleIt ? shuffle(sorted) : sorted;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Days until a timestamp, for "next session" hints. */
export const daysUntil = (t: number, now = Date.now()) => Math.ceil((t - now) / DAY);
