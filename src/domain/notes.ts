import type { Note } from "../db/types";

const CLOZE_SPAN = /<span[^>]*data-cloze="(\d+)"[^>]*>([\s\S]*?)<\/span>/g;
const CLOZE_TEXT = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

const BARE_CLOZE = /\{\{(?!c\d+::)([^{}]+?)\}\}/g;

/**
 * Converts textual cloze syntax into editor spans:
 * {{c1::answer::hint}} keeps its index; bare {{answer}} gets the next free index.
 */
export function normalizeCloze(html: string): string {
  let out = html.replace(CLOZE_TEXT, (_m, n: string, answer: string, hint?: string) =>
    `<span data-cloze="${n}"${hint ? ` data-hint="${escapeAttr(hint)}"` : ""}>${answer}</span>`,
  );
  if (BARE_CLOZE.test(out)) {
    BARE_CLOZE.lastIndex = 0;
    let next = Math.max(0, ...[...out.matchAll(/data-cloze="(\d+)"/g)].map((m) => Number(m[1]))) + 1;
    out = out.replace(BARE_CLOZE, (_m, answer: string) => `<span data-cloze="${next++}">${answer}</span>`);
  }
  return out;
}

export const hasBareCloze = (text: string) => /\{\{[^{}]+\}\}/.test(text);

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function clozeIndices(html: string): number[] {
  const set = new Set<number>();
  for (const m of normalizeCloze(html).matchAll(CLOZE_SPAN)) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}

export function hasCloze(html: string): boolean {
  return clozeIndices(html).length > 0;
}

/** Card variants a note produces. */
export function variantsForNote(note: Pick<Note, "type" | "front" | "occlusion" | "reversed">, deckReverse: boolean): string[] {
  if (note.type === "cloze") {
    const idx = clozeIndices(note.front);
    return idx.length ? idx.map((i) => `c${i}`) : ["c1"];
  }
  if (note.type === "occlusion") {
    const masks = note.occlusion?.masks ?? [];
    return masks.length ? masks.map((m) => `m:${m.id}`) : [];
  }
  return deckReverse || note.reversed ? ["forward", "reverse"] : ["forward"];
}

/** Renders cloze HTML for a given card index. Front hides the active cloze, back reveals it. */
export function renderCloze(html: string, index: number, side: "front" | "back"): string {
  return normalizeCloze(html).replace(CLOZE_SPAN, (whole, n: string, inner: string) => {
    if (Number(n) !== index) return `<span class="cloze-other">${inner}</span>`;
    const hint = /data-hint="([^"]*)"/.exec(whole)?.[1];
    return side === "front"
      ? `<span class="cloze-blank">${hint ? `[${hint}]` : "[…]"}</span>`
      : `<span class="cloze-answer">${inner}</span>`;
  });
}

export function stripHtml(html: string): string {
  if (typeof document !== "undefined") {
    const d = document.createElement("div");
    d.innerHTML = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n");
    return (d.textContent ?? "").replace(/\n{2,}/g, "\n").trim();
  }
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Text the user must type when "type the answer" is enabled. */
export function expectedAnswer(note: Note, variant: string): string {
  if (note.type === "cloze") {
    const idx = Number(variant.slice(1));
    const parts: string[] = [];
    for (const m of normalizeCloze(note.front).matchAll(CLOZE_SPAN)) if (Number(m[1]) === idx) parts.push(stripHtml(m[2]));
    return parts.join(", ");
  }
  return stripHtml(variant === "reverse" ? note.front : note.back);
}

/** Simple similarity used to grade a typed answer (case/accents/punctuation-insensitive). */
export function compareAnswer(typed: string, expected: string): "exact" | "close" | "wrong" {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const a = norm(typed);
  const b = norm(expected);
  if (!a) return "wrong";
  if (a === b) return "exact";
  const dist = levenshtein(a, b);
  return dist <= Math.max(1, Math.floor(b.length * 0.15)) ? "close" : "wrong";
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
