import { createEmptyCard, fsrs, generatorParameters, State, type Card as FsrsCard, type Grade } from "ts-fsrs";
import type { AlgorithmParams, AlgorithmPreset, Card, CardState, DisplayStatus, Rating } from "../db/types";

export const MINUTE = 60_000;
export const DAY = 86_400_000;
export const MASTERED_DAYS = 21;

export interface ScheduleResult {
  card: Card;
  /** Interval in days, may be fractional for learning steps */
  interval: number;
}

const clampEase = (e: number) => Math.max(1.3, Math.round(e * 1000) / 1000);

/** SM-2 style scheduler with learning steps (Anki-like), used by every non-FSRS preset. */
export function scheduleSm2(card: Card, rating: Rating, p: AlgorithmParams, now: number): ScheduleResult {
  const c: Card = { ...card, reps: card.reps + 1, lastReview: now, struggling: rating === 1 };
  const learningLike = card.state === "new" || card.state === "learning" || card.state === "relearning";

  if (learningLike) {
    const relearn = card.state === "relearning";
    const steps = relearn ? p.relearningSteps : p.learningSteps;
    const graduateInterval = relearn ? Math.max(1, card.interval) : p.graduatingInterval;
    const step = card.state === "new" ? 0 : card.step;
    if (card.state === "new") c.ease = p.startingEase;

    const graduate = (days: number): ScheduleResult => {
      const interval = Math.min(p.maxInterval, Math.max(1, Math.round(days)));
      Object.assign(c, { state: "review" as CardState, step: 0, interval, due: now + interval * DAY });
      return { card: c, interval };
    };
    const stayIn = (state: CardState, nextStep: number, minutes: number): ScheduleResult => {
      Object.assign(c, { state, step: nextStep, due: now + minutes * MINUTE });
      return { card: c, interval: minutes / 1440 };
    };
    const learnState: CardState = relearn ? "relearning" : "learning";

    if (steps.length === 0) {
      if (rating === 1 && !relearn) return stayIn("learning", 0, 1);
      return graduate(rating === 4 ? (relearn ? graduateInterval + 1 : p.easyInterval) : graduateInterval);
    }
    switch (rating) {
      case 1:
        return stayIn(learnState, 0, steps[0]);
      case 2: {
        const cur = steps[Math.min(step, steps.length - 1)];
        const nxt = steps[step + 1];
        const minutes = step === 0 && nxt !== undefined ? (cur + nxt) / 2 : cur * 1.5;
        return stayIn(learnState, step, Math.min(minutes, cur + 1440));
      }
      case 3: {
        const next = step + 1;
        if (next >= steps.length) return graduate(graduateInterval);
        return stayIn(learnState, next, steps[next]);
      }
      case 4:
        return graduate(relearn ? graduateInterval + 1 : p.easyInterval);
    }
  }

  // Review card
  const elapsedDays = card.lastReview ? Math.max(0, (now - card.lastReview) / DAY) : card.interval;
  const delay = Math.max(0, elapsedDays - card.interval);
  const ease = card.ease || p.startingEase;
  const cap = (d: number) => Math.min(p.maxInterval, Math.max(1, Math.round(d)));

  if (rating === 1) {
    c.lapses = card.lapses + 1;
    c.ease = clampEase(ease - 0.2);
    const lapseInterval = cap(card.interval * 0.3);
    if (p.relearningSteps.length === 0) {
      Object.assign(c, { state: "review" as CardState, interval: lapseInterval, due: now + lapseInterval * DAY });
      return { card: c, interval: lapseInterval };
    }
    Object.assign(c, { state: "relearning" as CardState, step: 0, interval: lapseInterval, due: now + p.relearningSteps[0] * MINUTE });
    return { card: c, interval: p.relearningSteps[0] / 1440 };
  }
  let interval: number;
  if (rating === 2) {
    c.ease = clampEase(ease - 0.15);
    interval = cap(Math.max(card.interval + 1, card.interval * p.hardMultiplier * p.intervalModifier));
  } else if (rating === 3) {
    interval = cap(Math.max(card.interval + 1, (card.interval + delay / 2) * ease * p.intervalModifier));
  } else {
    c.ease = clampEase(ease + 0.15);
    const good = cap(Math.max(card.interval + 1, (card.interval + delay / 2) * ease * p.intervalModifier));
    interval = cap(Math.max(good + 1, (card.interval + delay) * ease * p.easyBonus * p.intervalModifier));
  }
  Object.assign(c, { state: "review" as CardState, interval, due: now + interval * DAY, step: 0 });
  return { card: c, interval };
}

const STATE_TO_FSRS: Record<CardState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const FSRS_TO_STATE: Record<State, CardState> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

/** FSRS scheduler (ts-fsrs), used by the "FSRS" preset. */
export function scheduleFsrs(card: Card, rating: Rating, p: AlgorithmParams, now: number): ScheduleResult {
  const f = fsrs(generatorParameters({ request_retention: p.desiredRetention, maximum_interval: p.maxInterval, enable_fuzz: false }));
  const base: FsrsCard =
    card.state === "new" || card.stability === undefined
      ? createEmptyCard(new Date(now))
      : {
          due: new Date(card.due),
          stability: card.stability,
          difficulty: card.difficulty ?? 5,
          elapsed_days: card.lastReview ? Math.max(0, Math.floor((now - card.lastReview) / DAY)) : 0,
          scheduled_days: Math.round(card.interval),
          reps: card.reps,
          lapses: card.lapses,
          state: STATE_TO_FSRS[card.state],
          last_review: card.lastReview ? new Date(card.lastReview) : undefined,
        };
  const { card: next } = f.next(base, new Date(now), rating as Grade);
  const due = next.due.getTime();
  const interval = Math.max(0, (due - now) / DAY);
  const c: Card = {
    ...card,
    state: FSRS_TO_STATE[next.state],
    due,
    interval: next.state === State.Review ? Math.max(1, next.scheduled_days) : interval,
    stability: next.stability,
    difficulty: next.difficulty,
    reps: card.reps + 1,
    lapses: next.lapses,
    lastReview: now,
    struggling: rating === 1,
    step: 0,
  };
  return { card: c, interval };
}

/**
 * Speed learning ("Aprendizado rápido"): no schedule, cards are always available.
 * Not quite (1) keeps the card in the current round; Got it (3) marks it learned.
 */
export function scheduleSpeed(card: Card, rating: Rating, now: number): ScheduleResult {
  const gotIt = rating >= 3;
  const c: Card = {
    ...card,
    reps: card.reps + 1,
    lastReview: now,
    struggling: !gotIt,
    state: gotIt ? "review" : "learning",
    lapses: gotIt ? card.lapses : card.lapses + (card.state === "review" ? 1 : 0),
    interval: gotIt ? Math.max(1, card.interval) : 0,
    due: now,
  };
  return { card: c, interval: 0 };
}

export function schedule(card: Card, rating: Rating, preset: AlgorithmPreset, p: AlgorithmParams, now = Date.now()): ScheduleResult {
  if (preset === "speed") return scheduleSpeed(card, rating, now);
  if (preset === "fsrs") return scheduleFsrs(card, rating, p, now);
  return scheduleSm2(card, rating, p, now);
}

/** Preview of the next interval for each answer button. */
export function previewIntervals(card: Card, preset: AlgorithmPreset, p: AlgorithmParams, now = Date.now()): Record<Rating, number> {
  const out = {} as Record<Rating, number>;
  for (const r of [1, 2, 3, 4] as Rating[]) out[r] = schedule(card, r, preset, p, now).interval;
  return out;
}

/** Human readable interval: "<1 min", "10 min", "3 h", "4 d", "2 mês", "1,5 ano". */
export function formatInterval(days: number, lang: "pt" | "en" = "pt"): string {
  const minutes = days * 1440;
  const t = lang === "pt" ? { min: "min", h: "h", d: "d", mo: "mês", y: "ano" } : { min: "min", h: "h", d: "d", mo: "mo", y: "y" };
  if (minutes < 1) return `<1 ${t.min}`;
  if (minutes < 60) return `${Math.round(minutes)} ${t.min}`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} ${t.h}`;
  if (days < 30) return `${Math.round(days)} ${t.d}`;
  if (days < 365) return `${Math.round((days / 30) * 10) / 10} ${t.mo}`.replace(".", ",");
  return `${Math.round((days / 365) * 10) / 10} ${t.y}`.replace(".", ",");
}

export function displayStatus(card: Card): DisplayStatus {
  if (card.frozen) return "frozen";
  if (card.state === "new") return "notStudied";
  if (card.state === "learning" || card.state === "relearning") return card.struggling ? "notQuite" : "learning";
  if (card.struggling) return "notQuite";
  return card.interval >= MASTERED_DAYS ? "mastered" : "gotIt";
}

export const newCardFields = (now = Date.now()) => ({
  state: "new" as CardState,
  due: now,
  interval: 0,
  ease: 2.5,
  step: 0,
  reps: 0,
  lapses: 0,
  frozen: false,
  createdAt: now,
});

export const resetCardProgress = (card: Card): Card => ({
  ...card,
  ...newCardFields(card.createdAt),
  frozen: card.frozen,
  stability: undefined,
  difficulty: undefined,
  lastReview: undefined,
  struggling: undefined,
});
