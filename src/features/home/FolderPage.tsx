import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FolderOpen, Plus, Settings, Trash2, ListPlus } from "lucide-react";
import { useLibrary } from "../../hooks/useData";
import { DeckFormDialog, DeckRow, FolderFormDialog, FolderGlyph } from "./deckUi";
import { sortDecks, HomeSkeleton } from "./HomePage";
import { EmptyState } from "../../ui/controls";
import { Modal } from "../../ui/Modal";
import { useUi } from "../../ui/UiProvider";
import { deleteFolder, setDecksFolder } from "../../db/repo";
import { NotFoundPage } from "../shell/NotFoundPage";
import { Menu } from "../../ui/Menu";
import { DeckIcon } from "./deckUi";

export function FolderPage() {
  const { id } = useParams();
  const lib = useLibrary();
  const ui = useUi();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [newDeck, setNewDeck] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (!lib) return <HomeSkeleton />;
  const folder = lib.folders.find((f) => f.id === id);
  if (!folder) return <NotFoundPage title="Pasta não encontrada" />;
  const active = lib.decks.filter((d) => d.archivedAt === null);
  const decks = sortDecks(active.filter((d) => d.folderId === folder.id && !d.parentId), lib.stats, "auto");
  const outside = active.filter((d) => !d.parentId && d.folderId !== folder.id);

  const remove = async () => {
    const ok = await ui.confirm({ title: "Excluir pasta?", message: "Excluir esta pasta remove todos os decks que ela contém (eles ficam em “Excluídos recentemente” por 30 dias).", confirmLabel: "Excluir", danger: true });
    if (!ok) return;
    await deleteFolder(folder.id);
    ui.toast("Pasta excluída", "success");
    nav("/");
  };

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/" className="icon-btn icon-btn--sm icon-btn--bordered" aria-label="Voltar">
          <ArrowLeft />
        </Link>
        <Link to="/">Início</Link>/<span className="current">{folder.name}</span>
      </div>
      <div className="page-head">
        <FolderGlyph folder={folder} size={26} />
        <div>
          <h1>{folder.name}</h1>
          <div className="sub">{decks.length} decks</div>
        </div>
        <div className="page-head__actions">
          <button className="btn btn--secondary" onClick={() => setAdding(true)}>
            <ListPlus /> Adicionar decks
          </button>
          <button className="btn btn--primary" onClick={() => setNewDeck(true)}>
            <Plus /> Novo deck
          </button>
          <Menu
            items={[
              { label: "Configurações da pasta", icon: <Settings />, onSelect: () => setEdit(true) },
              { label: "Excluir pasta", icon: <Trash2 />, danger: true, onSelect: remove },
            ]}
          />
        </div>
      </div>
      {decks.length === 0 ? (
        <EmptyState icon={<FolderOpen />} title="A pasta está vazia" text="Crie um deck aqui ou mova decks existentes para esta pasta.">
          <button className="btn btn--primary" onClick={() => setAdding(true)}>
            Adicionar decks
          </button>
        </EmptyState>
      ) : (
        <div className="list">
          {decks.map((d) => (
            <DeckRow
              key={d.id}
              deck={d}
              stats={lib.stats.get(d.id)}
              subCount={active.filter((x) => x.parentId === d.id).length}
              folders={lib.folders}
              decks={active}
              extraMenu={[{ label: "Remover da pasta", icon: <FolderOpen />, onSelect: () => setDecksFolder([d.id], null) }]}
            />
          ))}
        </div>
      )}
      {edit && <FolderFormDialog folder={folder} onClose={() => setEdit(false)} />}
      {newDeck && <DeckFormDialog folderId={folder.id} onClose={() => setNewDeck(false)} />}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Adicionar decks à pasta"
        footer={
          <>
            <button className="btn btn--secondary" onClick={() => setAdding(false)}>
              Cancelar
            </button>
            <button
              className="btn btn--primary"
              disabled={!picked.size}
              onClick={async () => {
                await setDecksFolder([...picked], folder.id);
                ui.toast(`${picked.size} deck(s) adicionados`, "success");
                setPicked(new Set());
                setAdding(false);
              }}
            >
              Adicionar à pasta
            </button>
          </>
        }
      >
        {outside.length === 0 ? (
          <p className="hint">Não há outros decks para adicionar.</p>
        ) : (
          <div className="pick-list">
            {outside.map((d) => (
              <label key={d.id} className="pick-item">
                <input
                  type="checkbox"
                  checked={picked.has(d.id)}
                  onChange={(e) => {
                    const n = new Set(picked);
                    if (e.target.checked) n.add(d.id);
                    else n.delete(d.id);
                    setPicked(n);
                  }}
                />
                <DeckIcon deck={d} size={34} /> {d.name}
              </label>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
