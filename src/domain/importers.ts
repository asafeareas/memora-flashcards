import Papa from "papaparse";
import type { Card, Deck, Note } from "../db/types";
import { normalizeCloze } from "./notes";
import { sanitizeHtml } from "./render";

export interface ParsedCard {
  front: string;
  back: string;
  type: "basic" | "cloze";
  error?: "front" | "back";
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Plain text → minimal HTML paragraphs (keeps line breaks). */
export const textToHtml = (s: string) =>
  s
    .trim()
    .split(/\r?\n/)
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join("");

const looksLikeHtml = (s: string) => /<\/?(p|br|b|i|strong|em|div|span|img|ul|ol|li)\b/i.test(s);
const toHtml = (s: string) => (looksLikeHtml(s) ? sanitizeHtml(s) : textToHtml(s));

function classify(front: string, back: string): ParsedCard {
  const isCloze = /\{\{c\d+::/.test(front);
  const card: ParsedCard = { front: isCloze ? normalizeCloze(toHtml(front)) : toHtml(front), back: back.trim() ? toHtml(back) : "", type: isCloze ? "cloze" : "basic" };
  if (!front.trim()) card.error = "front";
  else if (!isCloze && !back.trim()) card.error = "back";
  return card;
}

const unescapeSep = (s: string) => s.replace(/\\n/g, "\n").replace(/\\t/g, "\t");

/**
 * Parses pasted text (Quizlet export, spreadsheets, docs) with configurable
 * separators.
 */
export function parsePasted(text: string, betweenSides: string, betweenCards: string): ParsedCard[] {
  const sideSep = unescapeSep(betweenSides);
  const cardSep = unescapeSep(betweenCards);
  return text
    .replace(/\r\n/g, "\n")
    .split(cardSep)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const i = chunk.indexOf(sideSep);
      return i < 0 ? classify(chunk, "") : classify(chunk.slice(0, i), chunk.slice(i + sideSep.length));
    });
}

/** CSV / TSV: first column = front, second = back. Skips a header row named front/back/frente/verso. */
export function parseCsv(text: string): ParsedCard[] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
  if (res.errors.length && !res.data.length) throw new Error("Não foi possível ler o arquivo CSV.");
  let rows = res.data.filter((r) => r.some((c) => c && c.trim()));
  if (rows.length && /^(front|frente|pergunta|question|termo|term)$/i.test((rows[0][0] ?? "").trim())) rows = rows.slice(1);
  return rows.map((r) => classify(r[0] ?? "", r.slice(1).filter(Boolean).join("<br>")));
}

/* ------------------------------------------------------------------ Anki */

export interface AnkiImport {
  name: string;
  cards: ParsedCard[];
  skipped: number;
  images: number;
}

/**
 * Imports an Anki package (.apkg / .colpkg exported in legacy "anki2/anki21" format).
 * Fields are joined front/back; cloze note types become cloze cards; media images are embedded.
 */
export async function parseAnki(file: File): Promise<AnkiImport> {
  const [{ default: JSZip }, initSqlJs, wasmUrl] = await Promise.all([import("jszip"), import("sql.js").then((m) => m.default), import("sql.js/dist/sql-wasm.wasm?url").then((m) => m.default)]);
  const zip = await JSZip.loadAsync(file);
  const dbFile = zip.file("collection.anki21") ?? zip.file("collection.anki2");
  if (!dbFile) {
    if (zip.file("collection.anki21b")) throw new Error("Este pacote usa o formato novo e compactado do Anki. No Anki, exporte marcando “Suporte a versões antigas do Anki” e tente de novo.");
    throw new Error("Arquivo .apkg inválido.");
  }
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(new Uint8Array(await dbFile.async("uint8array")));
  try {
    const mediaMap: Record<string, string> = JSON.parse((await zip.file("media")?.async("string")) || "{}");
    const byName = new Map(Object.entries(mediaMap).map(([k, v]) => [v, k]));
    const colRow = db.exec("select models, decks from col")[0]?.values[0];
    const models: Record<string, { type: number; name: string }> = colRow ? JSON.parse(String(colRow[0])) : {};
    const decks: Record<string, { name: string }> = colRow ? JSON.parse(String(colRow[1])) : {};
    const deckName = Object.values(decks).find((d) => d.name !== "Default")?.name ?? file.name.replace(/\.(apkg|colpkg)$/i, "");
    const rows = db.exec("select mid, flds from notes")[0]?.values ?? [];
    const cache = new Map<string, string>();
    let images = 0;
    const embed = async (html: string) => {
      const names = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
      for (const n of names) {
        if (!cache.has(n)) {
          const key = byName.get(n);
          const entry = key ? zip.file(key) : null;
          if (!entry) continue;
          const ext = n.split(".").pop()?.toLowerCase();
          const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/jpeg";
          cache.set(n, `data:${mime};base64,${await entry.async("base64")}`);
          images++;
        }
        html = html.split(`src="${n}"`).join(`src="${cache.get(n)}"`);
      }
      return html.replace(/\[sound:[^\]]+\]/g, "");
    };
    const cards: ParsedCard[] = [];
    let skipped = 0;
    for (const [mid, flds] of rows) {
      const fields = String(flds).split("\x1f");
      const model = models[String(mid)];
      const front = await embed(fields[0] ?? "");
      const back = await embed(fields.slice(1).filter((f) => f.trim()).join("<br>"));
      if (!front.trim()) {
        skipped++;
        continue;
      }
      if (model?.type === 1) cards.push({ type: "cloze", front: normalizeCloze(sanitizeHtml(front)), back: sanitizeHtml(back) });
      else cards.push({ type: "basic", front: sanitizeHtml(front), back: sanitizeHtml(back) });
    }
    return { name: deckName.split("::").pop() ?? deckName, cards, skipped, images };
  } finally {
    db.close();
  }
}

/* --------------------------------------------------- Memora deck (.json) */

export interface DeckExportFile {
  app: "memora";
  kind: "deck";
  version: 1;
  decks: Deck[];
  notes: Note[];
  cards?: Card[];
}

export const isDeckExport = (x: unknown): x is DeckExportFile => {
  const d = x as DeckExportFile;
  return !!d && d.app === "memora" && d.kind === "deck" && Array.isArray(d.decks) && Array.isArray(d.notes);
};
