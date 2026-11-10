import { Link } from "react-router-dom";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useLibrary } from "../../hooks/useData";
import { DeckIcon } from "../home/deckUi";
import { EmptyState } from "../../ui/controls";
import { archiveDeck, softDeleteDeck } from "../../db/repo";
import { useUi } from "../../ui/UiProvider";
import { formatDate, plural } from "../../domain/format";

export function ArchivePage() {
  const lib = useLibrary();
  const ui = useUi();
  if (!lib) return null;
  const archived = lib.decks.filter((d) => d.archivedAt !== null && (!d.parentId || !lib.decks.find((p) => p.id === d.parentId)?.archivedAt));
  return (
    <div className="narrow">
      <div className="page-head">
        <div>
          <h1>Arquivo</h1>
          <div className="sub">Decks arquivados não podem ser editados nem estudados. Restaure um deck para voltar a usá-lo.</div>
        </div>
      </div>
      {archived.length === 0 ? (
        <EmptyState icon={<Archive />} title="Nenhum deck no arquivo" text="Arquive decks que você não está usando para manter a página inicial organizada.">
          <Link to="/" className="btn btn--secondary">
            Voltar ao início
          </Link>
        </EmptyState>
      ) : (
        <div className="list">
          {archived.map((d) => (
            <div key={d.id} className="row">
              <DeckIcon deck={d} />
              <div className="row__body">
                <Link to={`/deck/${d.id}`} className="row__title" style={{ color: "var(--text)", display: "block" }}>
                  {d.name}
                </Link>
                <div className="row__meta">
                  <span>{plural(lib.stats.get(d.id)?.notes ?? 0, "cartão", "cartões")}</span>
                  <span>Arquivado em {formatDate(d.archivedAt!)}</span>
                </div>
              </div>
              <button
                className="btn btn--secondary btn--sm"
                onClick={async () => {
                  await archiveDeck(d.id, false);
                  ui.toast("Deck restaurado", "success");
                }}
              >
                <ArchiveRestore /> Restaurar
              </button>
              <button
                className="icon-btn icon-btn--sm"
                aria-label="Excluir"
                onClick={async () => {
                  if (!(await ui.confirm({ title: "Excluir este deck?", message: "Ele fica em “Excluídos recentemente” por 30 dias.", confirmLabel: "Excluir", danger: true }))) return;
                  await softDeleteDeck(d.id);
                  ui.toast(`“${d.name}” excluído`, "success");
                }}
              >
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
