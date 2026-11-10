import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, SlidersHorizontal, ArrowUpDown, CheckSquare, X, Snowflake, Sun, FolderInput, Repeat2, RotateCcw, Trash2, Pencil, Info, Plus, FileStack, Image as ImageIcon, Brackets } from "lucide-react";
import type { Card, DisplayStatus, Note } from "../../db/types";
import type { useDeck } from "../../hooks/useData";
import { STATUS_ORDER } from "../../hooks/useData";
import { displayStatus } from "../../domain/scheduler";
import { stripHtml } from "../../domain/notes";
import { formatRelative } from "../../domain/format";
import { Menu } from "../../ui/Menu";
import { Modal } from "../../ui/Modal";
import { EmptyState } from "../../ui/controls";
import { useUi } from "../../ui/UiProvider";
import { deleteNotes, moveNotes, resetNotesProgress, setNotesFrozen, setNotesReversed } from "../../db/repo";
import { STATUS_LABEL, STATUS_LABEL_ONE, DeckIcon } from "../home/deckUi";
import { CardInfoDialog } from "./CardInfoDialog";

type Data = NonNullable<ReturnType<typeof useDeck>>;
type SortKey = "newest" | "oldest" | "az" | "za" | "next";
const SORT_LABEL: Record<SortKey, string> = { newest: "Mais recentes", oldest: "Mais antigos", az: "A–Z", za: "Z–A", next: "Próxima revisão" };
const PAGE = 150;

/** Status of a note = "least advanced" status among its cards. */
function noteStatus(cards: Card[]): DisplayStatus {
  if (!cards.length) return "notStudied";
  if (cards.every((c) => c.frozen)) return "frozen";
  const rank: DisplayStatus[] = ["notQuite", "notStudied", "learning", "gotIt", "mastered", "frozen"];
  return cards.map(displayStatus).sort((a, b) => rank.indexOf(a) - rank.indexOf(b))[0];
}

export function CardsTab({ data }: { data: Data }) {
  const { deck, notes, cards, subdecks, allDecks } = data;
  const nav = useNavigate();
  const ui = useUi();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filters, setFilters] = useState<Set<DisplayStatus>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [includeSubs, setIncludeSubs] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [info, setInfo] = useState<string | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const archived = !!deck.archivedAt;

  const cardsByNote = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const c of cards) {
      if (!m.has(c.noteId)) m.set(c.noteId, []);
      m.get(c.noteId)!.push(c);
    }
    return m;
  }, [cards]);

  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    let list = notes
      .filter((n) => includeSubs || n.deckId === deck.id)
      .map((n) => {
        const cs = cardsByNote.get(n.id) ?? [];
        return {
          note: n,
          cards: cs,
          status: noteStatus(cs),
          frontText: n.type === "occlusion" ? stripHtml(n.front) || "Oclusão de imagem" : stripHtml(n.front),
          backText: stripHtml(n.back),
          nextDue: cs.filter((c) => !c.frozen && c.state !== "new").reduce<number | null>((m, c) => (m === null || c.due < m ? c.due : m), null),
        };
      });
    if (text) list = list.filter((r) => r.frontText.toLowerCase().includes(text) || r.backText.toLowerCase().includes(text));
    if (filters.size) list = list.filter((r) => filters.has(r.status) || (filters.has("frozen") && r.cards.some((c) => c.frozen)));
    const cmp: Record<SortKey, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      newest: (a, b) => b.note.createdAt - a.note.createdAt,
      oldest: (a, b) => a.note.createdAt - b.note.createdAt,
      az: (a, b) => a.frontText.localeCompare(b.frontText, "pt-BR"),
      za: (a, b) => b.frontText.localeCompare(a.frontText, "pt-BR"),
      next: (a, b) => (a.nextDue ?? Infinity) - (b.nextDue ?? Infinity),
    };
    return list.sort(cmp[sort]);
  }, [notes, cardsByNote, q, filters, sort, includeSubs, deck.id]);

  const visible = rows.slice(0, limit);
  const selIds = [...sel];
  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  };
  const exitSelect = () => {
    setSelecting(false);
    setSel(new Set());
  };
  const bulk = async (fn: () => Promise<unknown>, msg: string) => {
    await fn();
    ui.toast(msg, "success");
    exitSelect();
  };
  const confirmDelete = async (ids: string[]) => {
    const ok = await ui.confirm({ title: ids.length > 1 ? `Excluir ${ids.length} cartões?` : "Excluir cartão?", message: "Essa ação não pode ser desfeita. O progresso dos cartões será perdido.", confirmLabel: "Excluir", danger: true });
    if (!ok) return false;
    await deleteNotes(ids);
    ui.toast(ids.length > 1 ? `${ids.length} cartões excluídos` : "Cartão excluído", "success");
    return true;
  };

  const rowMenu = (n: Note, cs: Card[]) => {
    const frozen = cs.length > 0 && cs.every((c) => c.frozen);
    return [
      { label: "Editar", icon: <Pencil />, onSelect: () => nav(`/deck/${n.deckId}/note/${n.id}`, { state: { returnTo: `/deck/${deck.id}?tab=cards` } }) },
      { label: "Histórico de estudo", icon: <Info />, onSelect: () => setInfo(n.id) },
      { label: frozen ? "Descongelar" : "Congelar", icon: frozen ? <Sun /> : <Snowflake />, onSelect: () => setNotesFrozen([n.id], !frozen).then(() => ui.toast(frozen ? "Cartão descongelado" : "Cartão congelado", "success")) },
      { label: "Mover", icon: <FolderInput />, onSelect: () => setMoveIds([n.id]) },
      ...(n.type === "basic" ? [{ label: n.reversed ? "Remover reverso" : "Criar reverso", icon: <Repeat2 />, onSelect: () => setNotesReversed([n.id], !n.reversed) }] : []),
      { label: "Redefinir progresso", icon: <RotateCcw />, onSelect: () => resetNotesProgress([n.id]).then(() => ui.toast("Progresso redefinido", "success")) },
      { divider: true, label: "" },
      { label: "Excluir", icon: <Trash2 />, danger: true, onSelect: () => confirmDelete([n.id]) },
    ];
  };

  if (notes.length === 0)
    return (
      <EmptyState icon={<FileStack />} title="Este deck não tem cartões" text="Adicione seu primeiro cartão ou importe vários de uma vez.">
        {!archived && (
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to={`/deck/${deck.id}/add`} className="btn btn--primary">
              <Plus /> Adicionar cartões
            </Link>
            <Link to={`/deck/${deck.id}/import`} className="btn btn--secondary">
              Importar
            </Link>
          </div>
        )}
      </EmptyState>
    );

  return (
    <div>
      <div className="cards-toolbar">
        <div className="search" style={{ flex: 1, minWidth: 200 }}>
          <Search />
          <input className="input" placeholder="Pesquisar cartões" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar cartões" />
        </div>
        <button className={`btn btn--secondary${filters.size ? " has-filter" : ""}`} onClick={() => setFilterOpen(true)}>
          <SlidersHorizontal /> Filtros{filters.size ? ` (${filters.size})` : ""}
        </button>
        <Menu
          items={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({ label: SORT_LABEL[k], hint: sort === k ? "✓" : undefined, onSelect: () => setSort(k) }))}
          trigger={(open) => (
            <button className="btn btn--secondary" onClick={(e) => open(e.currentTarget)}>
              <ArrowUpDown /> <span className="hide-mobile">{SORT_LABEL[sort]}</span>
            </button>
          )}
        />
        {!archived && (
          <button className={`btn ${selecting ? "btn--primary" : "btn--secondary"}`} onClick={() => (selecting ? exitSelect() : setSelecting(true))}>
            {selecting ? <X /> : <CheckSquare />} <span className="hide-mobile">{selecting ? "Cancelar" : "Selecionar"}</span>
          </button>
        )}
      </div>
      <div className="cards-count">
        <span>
          Cartões no deck ({rows.length}
          {rows.length !== notes.filter((n) => includeSubs || n.deckId === deck.id).length ? ` de ${notes.filter((n) => includeSubs || n.deckId === deck.id).length}` : ""})
        </span>
        {subdecks.length > 0 && (
          <label className="inline-check">
            <input type="checkbox" checked={includeSubs} onChange={(e) => setIncludeSubs(e.target.checked)} /> Incluir subdecks
          </label>
        )}
      </div>

      {selecting && (
        <div className="bulk-bar">
          <button className="btn btn--ghost btn--sm" onClick={() => setSel(sel.size === rows.length ? new Set() : new Set(rows.map((r) => r.note.id)))}>
            {sel.size === rows.length && rows.length ? "Desmarcar tudo" : "Selecionar tudo"}
          </button>
          <strong>{sel.size === rows.length && rows.length ? "Todos os cartões selecionados" : `${sel.size} selecionado(s)`}</strong>
          <div className="bulk-bar__actions">
            <button className="btn btn--secondary btn--sm" disabled={!sel.size} onClick={() => bulk(() => setNotesFrozen(selIds, true), "Cartões congelados")}>
              <Snowflake /> Congelar
            </button>
            <button className="btn btn--secondary btn--sm" disabled={!sel.size} onClick={() => bulk(() => setNotesFrozen(selIds, false), "Cartões descongelados")}>
              <Sun /> Descongelar
            </button>
            <button className="btn btn--secondary btn--sm" disabled={!sel.size} onClick={() => setMoveIds(selIds)}>
              <FolderInput /> Mover
            </button>
            <Menu
              items={[
                {
                  label: "Criar reversos",
                  icon: <Repeat2 />,
                  onSelect: async () => {
                    const skipped = selIds.filter((id) => notes.find((n) => n.id === id)?.type !== "basic").length;
                    await setNotesReversed(selIds, true);
                    ui.toast(skipped ? `Reversos criados. ${skipped} cartão(ões) de cloze/oclusão não podem ser revertidos.` : "Reversos criados", "success");
                    exitSelect();
                  },
                },
                { label: "Remover reversos", icon: <Repeat2 />, onSelect: () => bulk(() => setNotesReversed(selIds, false), "Reversos removidos") },
                { label: "Redefinir progresso", icon: <RotateCcw />, onSelect: () => bulk(() => resetNotesProgress(selIds), "Progresso redefinido") },
                { divider: true, label: "" },
                { label: "Excluir", icon: <Trash2 />, danger: true, onSelect: async () => (await confirmDelete(selIds)) && exitSelect() },
              ]}
              trigger={(open) => (
                <button className="btn btn--secondary btn--sm" disabled={!sel.size} onClick={(e) => open(e.currentTarget)}>
                  Mais
                </button>
              )}
            />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={<Search />} title="Nenhum cartão encontrado" text="Tente outra busca ou limpe os filtros.">
          <button
            className="btn btn--secondary"
            onClick={() => {
              setQ("");
              setFilters(new Set());
            }}
          >
            Redefinir filtros
          </button>
        </EmptyState>
      ) : (
        <div className="note-list">
          {visible.map(({ note, cards: cs, status, frontText, backText, nextDue }) => (
            <div
              key={note.id}
              className={`note-row${sel.has(note.id) ? " selected" : ""}`}
              onClick={() => (selecting ? toggle(note.id) : nav(`/deck/${note.deckId}/note/${note.id}`, { state: { returnTo: `/deck/${deck.id}?tab=cards` } }))}
            >
              {selecting && <input type="checkbox" checked={sel.has(note.id)} onChange={() => toggle(note.id)} onClick={(e) => e.stopPropagation()} aria-label="Selecionar cartão" />}
              {note.type === "occlusion" && note.occlusion ? (
                <img className="note-row__thumb" src={note.occlusion.image} alt="" />
              ) : null}
              <div className="note-row__body">
                <div className="note-row__front">{frontText || <em className="hint">(sem texto)</em>}</div>
                {backText && <div className="note-row__back">{backText}</div>}
                <div className="note-row__meta">
                  <span className="status-tag">
                    <i className="dot" style={{ background: `var(--st-${status})` }} /> {STATUS_LABEL_ONE[status]}
                  </span>
                  {note.type === "cloze" && (
                    <span>
                      <Brackets size={13} /> Cloze · {cs.length}
                    </span>
                  )}
                  {note.type === "occlusion" && (
                    <span>
                      <ImageIcon size={13} /> {cs.length} áreas
                    </span>
                  )}
                  {(note.reversed || deck.settings.reverse) && note.type === "basic" && (
                    <span>
                      <Repeat2 size={13} /> Reverso
                    </span>
                  )}
                  {nextDue && status !== "frozen" && <span>Revisão {formatRelative(nextDue)}</span>}
                  {includeSubs && note.deckId !== deck.id && <span>{allDecks.find((d) => d.id === note.deckId)?.name}</span>}
                </div>
              </div>
              {!selecting && (
                <div onClick={(e) => e.stopPropagation()}>
                  <Menu items={rowMenu(note, cs)} />
                </div>
              )}
            </div>
          ))}
          {rows.length > limit && (
            <button className="btn btn--secondary btn--block" onClick={() => setLimit((l) => l + PAGE)}>
              Mostrar mais ({rows.length - limit} restantes)
            </button>
          )}
        </div>
      )}

      <Modal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title={filters.size ? `Filtros (${filters.size})` : "Filtros"}
        footer={
          <>
            <button className="btn btn--secondary" onClick={() => setFilters(new Set())}>
              Redefinir
            </button>
            <button className="btn btn--primary" onClick={() => setFilterOpen(false)}>
              Aplicar
            </button>
          </>
        }
      >
        <div className="label" style={{ marginBottom: 8 }}>
          Estado de aprendizagem
        </div>
        <div className="chips-row">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              className={`chip${filters.has(s) ? " active" : ""}`}
              onClick={() => {
                const n = new Set(filters);
                if (n.has(s)) n.delete(s);
                else n.add(s);
                setFilters(n);
              }}
            >
              <i className="dot" style={{ background: `var(--st-${s})` }} /> {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </Modal>
      {info && <CardInfoDialog noteId={info} onClose={() => setInfo(null)} />}
      {moveIds && (
        <Modal open onClose={() => setMoveIds(null)} title={moveIds.length > 1 ? `Mover ${moveIds.length} cartões` : "Mover cartão"} description="Escolha o deck de destino. O progresso é mantido.">
          <div className="pick-list">
            {allDecks
              .filter((d) => d.deletedAt === null && d.archivedAt === null)
              .map((d) => (
                <button
                  key={d.id}
                  className="pick-item"
                  disabled={moveIds.every((id) => notes.find((n) => n.id === id)?.deckId === d.id)}
                  onClick={async () => {
                    await moveNotes(moveIds, d.id);
                    ui.toast(`Movido para ${d.name}`, "success");
                    setMoveIds(null);
                    exitSelect();
                  }}
                >
                  <DeckIcon deck={d} size={34} /> {d.name}
                </button>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
