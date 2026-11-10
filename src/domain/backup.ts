import { db, onDataChanged } from "../db/db";
import { getSetting, setSetting } from "../db/repo";

/** Settings that never leave this browser (secrets and browser-specific handles). */
const PRIVATE_SETTINGS = new Set(["backupHandle", "aiApiKey"]);

export interface BackupFile {
  app: "memora";
  version: 1;
  exportedAt: number;
  data: {
    decks: unknown[];
    folders: unknown[];
    notes: unknown[];
    cards: unknown[];
    reviews: unknown[];
    settings: unknown[];
  };
}

export async function exportAll(): Promise<BackupFile> {
  return db.transaction("r", [db.decks, db.folders, db.notes, db.cards, db.reviews, db.settings], async () => ({
    app: "memora" as const,
    version: 1 as const,
    exportedAt: Date.now(),
    data: {
      decks: await db.decks.toArray(),
      folders: await db.folders.toArray(),
      notes: await db.notes.toArray(),
      cards: await db.cards.toArray(),
      reviews: await db.reviews.toArray(),
      settings: (await db.settings.toArray()).filter((s) => !PRIVATE_SETTINGS.has(s.key)),
    },
  }));
}

export function isBackup(x: unknown): x is BackupFile {
  const b = x as BackupFile;
  return !!b && b.app === "memora" && b.version === 1 && !!b.data && Array.isArray(b.data.decks) && Array.isArray(b.data.cards);
}

/** Replaces all local data with the backup content (private settings are kept). */
export async function importAll(backup: BackupFile) {
  if (!isBackup(backup)) throw new Error("Arquivo de backup inválido.");
  await db.transaction("rw", [db.decks, db.folders, db.notes, db.cards, db.reviews, db.settings], async () => {
    const keep = (await db.settings.toArray()).filter((s) => PRIVATE_SETTINGS.has(s.key));
    await Promise.all([db.decks.clear(), db.folders.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.settings.clear()]);
    await db.decks.bulkAdd(backup.data.decks as never[]);
    await db.folders.bulkAdd(backup.data.folders as never[]);
    await db.notes.bulkAdd(backup.data.notes as never[]);
    await db.cards.bulkAdd(backup.data.cards as never[]);
    await db.reviews.bulkAdd(backup.data.reviews as never[]);
    await db.settings.bulkPut([...(backup.data.settings as never[]), ...keep]);
  });
}

export const isEmptyDatabase = async () => (await db.decks.count()) === 0 && (await db.reviews.count()) === 0;

export function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const backupFileName = () => `memora-backup-${new Date().toISOString().slice(0, 10)}.json`;

/* ------------------------------------------------------ persistent storage */

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageStatus() {
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    const est = await navigator.storage?.estimate?.();
    return { persisted, usage: est?.usage ?? 0, quota: est?.quota ?? 0 };
  } catch {
    return { persisted: false, usage: 0, quota: 0 };
  }
}

/* --------------------------------------------- automatic file backup (FSA) */

type FileHandle = FileSystemFileHandle & {
  queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
};

type PickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<FileHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<FileHandle[]>;
};

export const fileBackupSupported = () => typeof window !== "undefined" && "showSaveFilePicker" in window;

const pickerTypes = [{ description: "Backup do Memora", accept: { "application/json": [".json"] } }];

export interface AutoBackupState {
  enabled: boolean;
  fileName: string | null;
  lastSavedAt: number | null;
  needsPermission: boolean;
  error: string | null;
}

let state: AutoBackupState = { enabled: false, fileName: null, lastSavedAt: null, needsPermission: false, error: null };
const listeners = new Set<(s: AutoBackupState) => void>();
const emit = (patch: Partial<AutoBackupState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
};
export const subscribeAutoBackup = (fn: (s: AutoBackupState) => void) => {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
};
export const getAutoBackupState = () => state;

let handle: FileHandle | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let writing = false;
let pending = false;

async function hasPermission(h: FileHandle, ask: boolean) {
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
  if (ask && h.requestPermission) return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  return false;
}

async function writeNow() {
  if (!handle) return;
  if (writing) {
    pending = true;
    return;
  }
  writing = true;
  try {
    if (!(await hasPermission(handle, false))) {
      emit({ needsPermission: true });
      return;
    }
    const data = await exportAll();
    const w = await handle.createWritable();
    await w.write(JSON.stringify(data));
    await w.close();
    const ts = Date.now();
    await setSetting("backupLastSavedAt", ts);
    emit({ lastSavedAt: ts, needsPermission: false, error: null });
  } catch (e) {
    emit({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    writing = false;
    if (pending) {
      pending = false;
      schedule();
    }
  }
}

function schedule() {
  if (!handle) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(writeNow, 1500);
}

let unsubscribe: (() => void) | null = null;

/** Called once at startup: restores the stored handle and starts watching changes. */
export async function initAutoBackup() {
  if (!fileBackupSupported()) return;
  const stored = await getSetting<FileHandle | null>("backupHandle", null);
  const last = await getSetting<number | null>("backupLastSavedAt", null);
  if (stored) {
    handle = stored;
    const ok = await hasPermission(stored, false);
    emit({ enabled: true, fileName: stored.name, lastSavedAt: last, needsPermission: !ok });
  }
  unsubscribe?.();
  unsubscribe = onDataChanged(() => {
    if (state.enabled && !state.needsPermission) schedule();
  });
}

/** Lets the user choose (or create) the backup file and writes it immediately. */
export async function chooseBackupFile() {
  const w = window as PickerWindow;
  const h = await w.showSaveFilePicker!({ suggestedName: "memora-backup.json", types: pickerTypes });
  handle = h;
  await setSetting("backupHandle", h);
  emit({ enabled: true, fileName: h.name, needsPermission: false, error: null });
  await writeNow();
}

/** Re-grants permission after a browser restart (needs a user gesture). */
export async function reconnectBackupFile() {
  if (!handle) return;
  if (await hasPermission(handle, true)) {
    emit({ needsPermission: false });
    await writeNow();
  }
}

export async function disableAutoBackup() {
  handle = null;
  await db.settings.delete("backupHandle");
  emit({ enabled: false, fileName: null, needsPermission: false });
}

export const backupNow = () => writeNow();

/** Opens a backup file chosen by the user and returns its parsed content. */
export async function pickBackupFile(): Promise<BackupFile> {
  const w = window as PickerWindow;
  let text: string;
  if (w.showOpenFilePicker) {
    const [h] = await w.showOpenFilePicker({ types: pickerTypes, multiple: false });
    text = await (await h.getFile()).text();
    // Re-link this file for automatic backups after restoring.
    handle = h;
    await setSetting("backupHandle", h);
  } else {
    text = await pickTextFile(".json");
  }
  const parsed = JSON.parse(text);
  if (!isBackup(parsed)) throw new Error("Este arquivo não é um backup do Memora.");
  return parsed;
}

export function pickTextFile(accept: string): Promise<string> {
  return pickFile(accept).then((f) => f.text());
}

export function pickFile(accept: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) resolve(f);
      else reject(new Error("Nenhum arquivo selecionado"));
    };
    input.click();
  });
}

/** After a restore, start writing to the linked file again. */
export async function afterRestore() {
  if (handle) {
    emit({ enabled: true, fileName: handle.name, needsPermission: false });
    await writeNow();
  }
}
