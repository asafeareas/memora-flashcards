import { describe, expect, it } from "vitest";
import type { Card } from "../db/types";
import { PRESET_PARAMS } from "./presets";
import { DAY, MINUTE, displayStatus, formatInterval, newCardFields, schedule } from "./scheduler";
import { clozeIndices, compareAnswer, renderCloze, variantsForNote } from "./notes";
import { buildQueue } from "./queue";
import { defaultDeckSettings } from "./presets";

const now = new Date(2026, 10, 9, 12, 0, 0).getTime();
const mk = (over: Partial<Card> = {}): Card => ({ id: "c", noteId: "n", deckId: "d", variant: "forward", ...newCardFields(now - DAY), ...over });
const P = PRESET_PARAMS.general;

describe("SM-2 scheduler with learning steps", () => {
  it("new card: Again -> first step, Good -> second step, Easy -> graduates with easy interval", () => {
    expect(schedule(mk(), 1, "general", P, now).card).toMatchObject({ state: "learning", step: 0, due: now + 1 * MINUTE });
    expect(schedule(mk(), 3, "general", P, now).card).toMatchObject({ state: "learning", step: 1, due: now + 10 * MINUTE });
    expect(schedule(mk(), 4, "general", P, now).card).toMatchObject({ state: "review", interval: 4 });
  });
  it("graduates after the last learning step", () => {
    const c = mk({ state: "learning", step: 1 });
    expect(schedule(c, 3, "general", P, now).card).toMatchObject({ state: "review", interval: 1 });
  });
  it("review: Good multiplies by ease, Easy > Good > Hard", () => {
    const c = mk({ state: "review", interval: 10, ease: 2.5, lastReview: now - 10 * DAY });
    const hard = schedule(c, 2, "general", P, now).interval;
    const good = schedule(c, 3, "general", P, now).interval;
    const easy = schedule(c, 4, "general", P, now).interval;
    expect(good).toBe(25);
    expect(hard).toBeLessThan(good);
    expect(easy).toBeGreaterThan(good);
  });
  it("review lapse goes to relearning and lowers ease", () => {
    const c = mk({ state: "review", interval: 10, ease: 2.5, lastReview: now - 10 * DAY });
    const r = schedule(c, 1, "general", P, now).card;
    expect(r.state).toBe("relearning");
    expect(r.lapses).toBe(1);
    expect(r.ease).toBeCloseTo(2.3);
    expect(displayStatus(r)).toBe("notQuite");
  });
  it("respects the maximum interval", () => {
    const c = mk({ state: "review", interval: 170, ease: 2.5, lastReview: now - 170 * DAY });
    expect(schedule(c, 4, "medical", PRESET_PARAMS.medical, now).interval).toBe(180);
  });
});

describe("FSRS and speed learning", () => {
  it("FSRS produces stability/difficulty and growing intervals", () => {
    let c = mk();
    c = schedule(c, 3, "fsrs", PRESET_PARAMS.fsrs, now).card;
    expect(c.stability).toBeGreaterThan(0);
    let t = now;
    for (let i = 0; i < 4; i++) {
      t = c.due + 1000;
      c = schedule(c, 3, "fsrs", PRESET_PARAMS.fsrs, t).card;
    }
    expect(c.state).toBe("review");
    expect(c.interval).toBeGreaterThan(5);
  });
  it("speed learning: Not quite keeps pending, Got it marks learned", () => {
    expect(schedule(mk(), 1, "speed", PRESET_PARAMS.speed, now).card.state).toBe("learning");
    expect(schedule(mk(), 3, "speed", PRESET_PARAMS.speed, now).card.state).toBe("review");
  });
});

describe("statuses, formatting, queue", () => {
  it("display statuses", () => {
    expect(displayStatus(mk())).toBe("notStudied");
    expect(displayStatus(mk({ state: "review", interval: 5 }))).toBe("gotIt");
    expect(displayStatus(mk({ state: "review", interval: 30 }))).toBe("mastered");
    expect(displayStatus(mk({ frozen: true }))).toBe("frozen");
  });
  it("formats intervals", () => {
    expect(formatInterval(1 / 1440)).toBe("1 min");
    expect(formatInterval(10 / 1440)).toBe("10 min");
    expect(formatInterval(4)).toBe("4 d");
    expect(formatInterval(60)).toBe("2 mês");
  });
  it("queue respects new-per-day and excludes frozen cards", () => {
    const s = { ...defaultDeckSettings(), newPerDay: 2 };
    const cards = [mk({ id: "1" }), mk({ id: "2" }), mk({ id: "3" }), mk({ id: "4", frozen: true }), mk({ id: "5", state: "review", interval: 3, due: now - DAY })];
    const q = buildQueue(cards, s, [], now);
    expect(q.map((c) => c.id)).toEqual(["5", "1", "2"]);
  });
});

describe("notes", () => {
  it("cloze variants and rendering", () => {
    const html = "A {{c1::mitocôndria}} produz {{c2::ATP::energia}}";
    expect(clozeIndices(html)).toEqual([1, 2]);
    expect(variantsForNote({ type: "cloze", front: html }, false)).toEqual(["c1", "c2"]);
    expect(renderCloze(html, 2, "front")).toContain("[energia]");
    expect(renderCloze(html, 2, "back")).toContain('class="cloze-answer">ATP');
  });
  it("reverse variants", () => {
    expect(variantsForNote({ type: "basic", front: "a" }, true)).toEqual(["forward", "reverse"]);
    expect(variantsForNote({ type: "basic", front: "a", reversed: true }, false)).toEqual(["forward", "reverse"]);
  });
  it("typed answer comparison is tolerant", () => {
    expect(compareAnswer("Coração", "coracao")).toBe("exact");
    expect(compareAnswer("mitocondra", "mitocôndria")).toBe("close");
    expect(compareAnswer("rim", "fígado")).toBe("wrong");
  });
});
