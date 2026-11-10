import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDownAZ, ChevronDown, FileUp, FolderPlus, HardDriveUpload, Layers, Plus, Sparkles, ClipboardPaste, Play, Archive, Trash2 } from "lucide-react";
import { useLibrary, useSetting } from "../../hooks/useData";
import { Menu } from "../../ui/Menu";
import { useUi } from "../../ui/UiProvider";
import { DeckFormDialog, DeckRow, FolderFormDialog, FolderGlyph } from "./deckUi";
import type { Deck } from "../../db/types";
import type { DeckStats } from "../../hooks/useData";
import { afterRestore, importAll, pickBackupFile } from "../../domain/backup";
import { formatRelative, plural } from "../../domain/format";

export type SortMode = "auto" | "az" | "recent";
const SORT_LABEL: Record<SortMode, string> = { auto: "Automático", az: "A–Z", recent: "Mais recentes" };

/** "Automático": decks with cards due first, then most recently studied/updated. */
export function sortDecks(decks: Deck[], stats: Map<string, DeckStats>, mode: SortMode) {
  const a = [...decks];
  if (mode === "az") return a.sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));
  if (mode === "recent") return a.sort((x, y) => y.createdAt - x.createdAt);
  return a.sort((x, y) => {
    const dx = stats.get(x.id)?.today.total ? 1 : 0;
    const dy = stats.get(y.id)?.today.total ? 1 : 0;
    if (dx !== dy) return dy - dx;
    return Math.max(y.studiedAt ?? 0, y.updatedAt) - Math.max(x.studiedAt ?? 0, x.updatedAt);
  });
}

export function HomePage() {
  const lib = useLibrary();
  const nav = useNavigate();
  const ui = useUi();
  const [sort, setSort] = useSetting<SortMode>("homeSort", "auto");
  const [newDeck, setNewDeck] = useState(false);
  const [newFolder, setNewFolder] = useState(false);

  const active = useMemo(() => lib?.decks.filter((d) => d.archivedAt === null) ?? [], [lib]);
  const roots = useMemo(() => (lib ? sortDecks(active.filter((d) => !d.parentId && !d.folderId), lib.stats, sort) : []), [lib, active, sort]);
  const rootAll = active.filter((d) => !d.parentId);
  const dueTotal = rootAll.reduce((s, d) => s + (lib?.stats.get(d.id)?.today.total ?? 0), 0);
  const nextDue = rootAll.reduce<number | null>((m, d) => {
    const n = lib?.stats.get(d.id)?.today.nextDue ?? null;
    return n !== null && (m === null || n < m) ? n : m;
  }, null);
  const studiedToday = lib?.todayReviews.length ?? 0;

  const restore = async () => {
    try {
      const b = await pickBackupFile();
      const ok = await ui.confirm({ title: "Restaurar backup?", message: `Backup de ${new Date(b.exportedAt).toLocaleString("pt-BR")} com ${plural(b.data.decks.length, "deck", "decks")}. Os dados atuais serão substituídos.`, confirmLabel: "Restaurar" });
      if (!ok) return;
      await importAll(b);
      await afterRestore();
      ui.toast("Backup restaurado", "success");
    } catch (e) {
      if ((e as Error).name !== "AbortError") ui.toast((e as Error).message, "error");
    }
  };

  const createItems = [
    { label: "Novo deck", icon: <Plus />, onSelect: () => setNewDeck(true) },
    { label: "Nova pasta", icon: <FolderPlus />, onSelect: () => setNewFolder(true) },
    { divider: true, label: "" },
    { label: "Criar com IA", icon: <Sparkles />, onSelect: () => nav("/ai") },
    { label: "Importar arquivo (CSV, Anki, TXT)", icon: <FileUp />, onSelect: () => nav("/import?mode=file") },
    { label: "Colar texto ou Quizlet", icon: <ClipboardPaste />, onSelect: () => nav("/import?mode=paste") },
  ];

  if (!lib) return <HomeSkeleton />;
  const isEmpty = active.length === 0 && lib.folders.length === 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Início</h1>
          <div className="sub">{active.length ? `${plural(rootAll.length, "deck", "decks")} · ${plural(studiedToday, "cartão estudado", "cartões estudados")} hoje` : "Crie seu primeiro deck para começar"}</div>
        </div>
        <div className="page-head__actions">
          <Menu
            align="right"
            items={(Object.keys(SORT_LABEL) as SortMode[]).map((m) => ({ label: SORT_LABEL[m], onSelect: () => setSort(m), hint: sort === m ? "✓" : undefined }))}
            trigger={(open) => (
              <button className="btn btn--ghost" onClick={(e) => open(e.currentTarget)} aria-label="Ordenar decks">
                <ArrowDownAZ /> <span className="hide-mobile">{SORT_LABEL[sort]}</span>
              </button>
            )}
          />
          <Menu
            items={createItems}
            trigger={(open) => (
              <button className="btn btn--primary" onClick={(e) => open(e.currentTarget)}>
                <Plus /> Criar <ChevronDown />
              </button>
            )}
          />
        </div>
      </div>

      {isEmpty ? (
        <div className="panel panel--pad empty-start">
          <h2>O que você quer aprender?</h2>
          <p>Crie cartões do seu jeito — tudo fica salvo neste dispositivo, sem conta e sem limites.</p>
          <div className="start-grid">
            <button className="start-tile" onClick={() => setNewDeck(true)}>
              <Layers />
              <strong>Criar manualmente</strong>
              <span>Um deck vazio para escrever seus cartões</span>
            </button>
            <button className="start-tile" onClick={() => nav("/ai")}>
              <Sparkles />
              <strong>Criar com IA</strong>
              <span>A partir de um tema, texto ou PDF</span>
            </button>
            <button className="start-tile" onClick={() => nav("/import?mode=file")}>
              <FileUp />
              <strong>Importar arquivo</strong>
              <span>CSV, Excel (CSV), Anki (.apkg) ou TXT</span>
            </button>
            <button className="start-tile" onClick={() => nav("/import?mode=paste")}>
              <ClipboardPaste />
              <strong>Colar</strong>
              <span>Texto ou cartões do Quizlet</span>
            </button>
          </div>
          <button className="btn btn--ghost" onClick={restore}>
            <HardDriveUpload /> Seus decks sumiram? Restaurar de um arquivo de backup
          </button>
        </div>
      ) : (
        <>
          <div className="today-card panel">
            <div className="today-card__text">
              <div className="today-card__eyebrow">Hoje</div>
              {dueTotal > 0 ? (
                <>
                  <h2>{plural(dueTotal, "cartão para estudar", "cartões para estudar")}</h2>
                  <p>Revise agora para lembrar por mais tempo.</p>
                </>
              ) : (
                <>
                  <h2>{studiedToday > 0 ? "Você concluiu tudo por hoje 🎉" : "Nada pendente agora"}</h2>
                  <p>{nextDue ? `Próxima sessão ${formatRelative(nextDue)}.` : "Adicione cartões para começar a estudar."}</p>
                </>
              )}
            </div>
            {dueTotal > 0 && (
              <Link to="/learn/all" className="btn btn--primary btn--lg">
                <Play /> Estudar tudo
              </Link>
            )}
          </div>

          {lib.folders.length > 0 && (
            <>
              <div className="section-title">
                Pastas <span className="count">{lib.folders.length}</span>
              </div>
              <div className="folder-grid">
                {lib.folders.map((f) => {
                  const inside = active.filter((d) => d.folderId === f.id);
                  const due = inside.reduce((s, d) => s + (lib.stats.get(d.id)?.today.total ?? 0), 0);
                  return (
                    <Link key={f.id} to={`/folder/${f.id}`} className="folder-tile">
                      <FolderGlyph folder={f} />
                      <div className="row__body">
                        <div className="row__title">{f.name}</div>
                        <div className="row__meta">
                          <span>{plural(inside.length, "deck", "decks")}</span>
                          {due > 0 && <span className="hint-tone hint-tone--due">{due} para hoje</span>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}

          <div className="section-title">
            Meus decks <span className="count">{roots.length}</span>
          </div>
          {roots.length === 0 ? (
            <div className="panel panel--pad hint">Todos os decks estão em pastas.</div>
          ) : (
            <div className="list">
              {roots.map((d) => (
                <DeckRow key={d.id} deck={d} stats={lib.stats.get(d.id)} subCount={active.filter((x) => x.parentId === d.id).length} folders={lib.folders} decks={active} />
              ))}
            </div>
          )}
          <div className="home-links">
            <Link to="/archive" className="btn btn--ghost btn--sm">
              <Archive /> Arquivo
            </Link>
            <Link to="/trash" className="btn btn--ghost btn--sm">
              <Trash2 /> Excluídos recentemente
            </Link>
          </div>
        </>
      )}
      {newDeck && <DeckFormDialog onClose={() => setNewDeck(false)} onCreated={(id) => nav(`/deck/${id}`)} />}
      {newFolder && <FolderFormDialog onClose={() => setNewFolder(false)} />}
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ height: 36, width: 180, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 110, marginBottom: 24 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton" style={{ height: 84, marginBottom: 10 }} />
      ))}
    </div>
  );
}
