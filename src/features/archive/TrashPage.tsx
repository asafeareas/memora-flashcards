import { Link } from "react-router-dom";
import { Trash2, Undo2 } from "lucide-react";
import { useLibrary } from "../../hooks/useData";
import { DeckIcon } from "../home/deckUi";
import { EmptyState } from "../../ui/controls";
import { purgeDeck, restoreDeck, TRASH_RETENTION_DAYS } from "../../db/repo";
import { useUi } from "../../ui/UiProvider";
import { plural } from "../../domain/format";

export function TrashPage() {
  const lib = useLibrary();
  const ui = useUi();
  if (!lib) return null;
  const deleted = lib.allDecks.filter((d) => d.deletedAt !== null && (!d.parentId || !lib.allDecks.find((p) => p.id === d.parentId)?.deletedAt)).sort((a, b) => b.deletedAt! - a.deletedAt!);
  const daysLeft = (t: number) => Math.max(0, TRASH_RETENTION_DAYS - Math.floor((Date.now() - t) / 86_400_000));
  return (
    <div className="narrow">
      <div className="page-head">
        <div>
          <h1>Excluídos recentemente</h1>
          <div className="sub">Decks excluídos ficam guardados por {TRASH_RETENTION_DAYS} dias. Ao restaurar, o deck volta com todo o progresso de estudo.</div>
        </div>
      </div>
      {deleted.length === 0 ? (
        <EmptyState icon={<Trash2 />} title="Nenhum deck excluído recentemente">
          <Link to="/" className="btn btn--secondary">
            Voltar ao início
          </Link>
        </EmptyState>
      ) : (
        <div className="list">
          {deleted.map((d) => (
            <div key={d.id} className="row">
              <DeckIcon deck={d} />
              <div className="row__body">
                <div className="row__title">{d.name}</div>
                <div className="row__meta">
                  <span>{plural(daysLeft(d.deletedAt!), "dia restante", "dias restantes")} · progresso de estudo salvo</span>
                </div>
              </div>
              <button
                className="btn btn--secondary btn--sm"
                onClick={async () => {
                  await restoreDeck(d.id);
                  ui.toast("Deck restaurado", "success");
                }}
              >
                <Undo2 /> Restaurar
              </button>
              <button
                className="icon-btn icon-btn--sm"
                aria-label="Excluir permanentemente"
                onClick={async () => {
                  if (!(await ui.confirm({ title: "Excluir permanentemente?", message: "Este deck não poderá ser recuperado depois de excluído.", confirmLabel: "Excluir para sempre", danger: true }))) return;
                  await purgeDeck(d.id);
                  ui.toast("Deck excluído permanentemente", "success");
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
