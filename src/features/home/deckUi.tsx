import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  BookOpen,
  Briefcase,
  Copy,
  FlaskConical,
  Folder as FolderIcon,
  FolderInput,
  GraduationCap,
  Heart,
  Languages,
  Layers,
  Palette,
  Pencil,
  Play,
  Plus,
  Star,
  Trash2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import type { Deck, Folder } from "../../db/types";
import type { DeckStats } from "../../hooks/useData";
import { STATUS_ORDER } from "../../hooks/useData";
import { Menu, type MenuItem } from "../../ui/Menu";
import { Modal } from "../../ui/Modal";
import { useUi } from "../../ui/UiProvider";
import {
  DECK_COLORS,
  archiveDeck,
  createDeck,
  createFolder,
  duplicateDeck,
  moveDeck,
  softDeleteDeck,
  restoreDeck,
  updateDeck,
  updateFolder,
} from "../../db/repo";
import { formatRelative } from "../../domain/format";

export const STATUS_LABEL: Record<string, string> = {
  notStudied: "Não estudados",
  notQuite: "Quase",
  learning: "Aprendendo",
  gotIt: "Aprendidos",
  mastered: "Dominados",
  frozen: "Congelados",
};
export const STATUS_LABEL_ONE: Record<string, string> = {
  notStudied: "Não estudado",
  notQuite: "Quase",
  learning: "Aprendendo",
  gotIt: "Aprendido",
  mastered: "Dominado",
  frozen: "Congelado",
};
export const STATUS_DESC: Record<string, string> = {
  notStudied: "Cartões novos que você ainda não avaliou.",
  notQuite: "Você errou na última vez — eles voltam com mais frequência para fixar.",
  learning: "Ainda na fase de aprendizagem; aparecem várias vezes no mesmo dia.",
  gotIt: "Bem aprendidos — revisados em intervalos que vão aumentando.",
  mastered: "Na memória de longo prazo (intervalo de 21 dias ou mais); aparecem raramente.",
  frozen: "Pausados por você; ficam fora do estudo até serem descongelados.",
};

export function StatusBar({ stats }: { stats: DeckStats }) {
  if (!stats.cards) return <div className="status-bar" />;
  return (
    <div className="status-bar" aria-hidden="true">
      {STATUS_ORDER.map((s) =>
        stats.byStatus[s] ? <i key={s} style={{ width: `${(stats.byStatus[s] / stats.cards) * 100}%`, background: `var(--st-${s})` }} /> : null,
      )}
    </div>
  );
}

export function DeckIcon({ deck, size = 44 }: { deck: Pick<Deck, "emoji" | "color">; size?: number }) {
  return (
    <div className="deck-icon" style={{ background: deck.color, width: size, height: size, fontSize: size * 0.5 }}>
      {deck.emoji ? <span>{deck.emoji}</span> : <BookOpen />}
    </div>
  );
}

export function learningHint(stats: DeckStats, speed: boolean): { text: string; tone: "due" | "done" | "empty" | "wait" } {
  if (!stats.cards) return { text: "Nenhum cartão ainda", tone: "empty" };
  if (stats.today.total > 0) return { text: `${speed ? "Cartões para estudar" : "Cartões para hoje"}: ${stats.today.total}`, tone: "due" };
  if (speed) return { text: "Tudo aprendido nesta rodada", tone: "done" };
  if (stats.today.nextDue) return { text: `Concluído hoje · próxima ${formatRelative(stats.today.nextDue)}`, tone: "done" };
  return { text: "Concluído hoje", tone: "done" };
}

interface DeckRowProps {
  deck: Deck;
  stats?: DeckStats;
  subCount?: number;
  folders: Folder[];
  decks: Deck[];
  extraMenu?: MenuItem[];
}

export function DeckRow({ deck, stats, subCount = 0, folders, decks, extraMenu = [] }: DeckRowProps) {
  const nav = useNavigate();
  const actions = useDeckActions();
  const hint = stats ? learningHint(stats, deck.settings.algorithm === "speed") : null;
  return (
    <div className="row row--link deck-row" onClick={() => nav(`/deck/${deck.id}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && nav(`/deck/${deck.id}`)}>
      <DeckIcon deck={deck} />
      <div className="row__body">
        <div className="row__title">{deck.name}</div>
        <div className="row__meta">
          <span>
            <Layers /> {stats?.notes ?? 0} {stats?.notes === 1 ? "cartão" : "cartões"}
          </span>
          {subCount > 0 && (
            <span>
              <FolderIcon /> {subCount} {subCount === 1 ? "subdeck" : "subdecks"}
            </span>
          )}
          {hint && (
            <span className={`hint-tone hint-tone--${hint.tone}`}>
              {hint.tone === "done" ? <CheckCircle2 /> : hint.tone === "due" ? <Clock /> : null}
              {hint.text}
            </span>
          )}
        </div>
        {stats && <StatusBar stats={stats} />}
      </div>
      {stats && stats.today.total > 0 && (
        <button
          className="btn btn--primary btn--sm hide-mobile"
          onClick={(e) => {
            e.stopPropagation();
            nav(`/learn/${deck.id}`);
          }}
        >
          <Play /> Estudar
        </button>
      )}
      <div onClick={(e) => e.stopPropagation()}>
        <Menu items={[...actions.menuFor(deck, folders, decks), ...extraMenu]} />
      </div>
      {actions.dialogs}
    </div>
  );
}

/** All deck actions (rename, move, duplicate, archive, delete...) with their dialogs. */
export function useDeckActions() {
  const ui = useUi();
  const nav = useNavigate();
  const [editing, setEditing] = useState<Deck | null>(null);
  const [moving, setMoving] = useState<{ deck: Deck; folders: Folder[]; decks: Deck[] } | null>(null);
  const [subdeckOf, setSubdeckOf] = useState<Deck | null>(null);

  const remove = async (deck: Deck) => {
    const ok = await ui.confirm({
      title: "Excluir este deck?",
      message: "Ele fica em “Excluídos recentemente” por 30 dias, com o progresso salvo, e pode ser restaurado.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    await softDeleteDeck(deck.id);
    ui.toast(`“${deck.name}” excluído`, "info", { label: "Desfazer", run: () => restoreDeck(deck.id) });
  };
  const archive = async (deck: Deck) => {
    const ok = await ui.confirm({ title: "Arquivar este deck?", message: "Você pode restaurá-lo do Arquivo depois. Decks arquivados não podem ser editados nem estudados.", confirmLabel: "Arquivar" });
    if (!ok) return;
    await archiveDeck(deck.id);
    ui.toast("Deck arquivado", "success", { label: "Desfazer", run: () => archiveDeck(deck.id, false) });
  };
  const duplicate = async (deck: Deck) => {
    const keep = await ui.confirm({ title: "Duplicar deck", message: "Deseja manter o progresso de estudo dos cartões na cópia?", confirmLabel: "Manter progresso", cancelLabel: "Começar do zero" });
    const id = await duplicateDeck(deck.id, keep);
    ui.toast("Deck duplicado", "success", { label: "Abrir", run: () => nav(`/deck/${id}`) });
  };

  const menuFor = (deck: Deck, folders: Folder[], decks: Deck[]): MenuItem[] => [
    { label: "Estudar", icon: <Play />, onSelect: () => nav(`/learn/${deck.id}`) },
    { label: "Adicionar cartões", icon: <Plus />, onSelect: () => nav(`/deck/${deck.id}/add`) },
    { divider: true, label: "" },
    { label: "Editar nome e aparência", icon: <Pencil />, onSelect: () => setEditing(deck) },
    { label: "Adicionar subdeck", icon: <Layers />, onSelect: () => setSubdeckOf(deck) },
    { label: "Mover", icon: <FolderInput />, onSelect: () => setMoving({ deck, folders, decks }) },
    { label: "Duplicar", icon: <Copy />, onSelect: () => duplicate(deck) },
    { label: "Arquivar", icon: <Archive />, onSelect: () => archive(deck) },
    { divider: true, label: "" },
    { label: "Excluir", icon: <Trash2 />, danger: true, onSelect: () => remove(deck) },
  ];

  const dialogs: ReactNode = (
    <>
      {editing && <DeckFormDialog deck={editing} onClose={() => setEditing(null)} />}
      {subdeckOf && <DeckFormDialog parentId={subdeckOf.id} onClose={() => setSubdeckOf(null)} />}
      {moving && <MoveDeckDialog {...moving} onClose={() => setMoving(null)} />}
    </>
  );
  return { menuFor, dialogs, remove, archive, duplicate, setEditing, setMoving, setSubdeckOf };
}

const EMOJIS = ["", "📘", "🧠", "🧬", "⚗️", "🩺", "🌍", "🗣️", "🇬🇧", "🇪🇸", "🇯🇵", "📐", "💻", "⚖️", "🎵", "🎨", "📜", "💡", "🏛️", "🔬"];

export function DeckFormDialog({ deck, parentId, folderId, onClose, onCreated }: { deck?: Deck; parentId?: string; folderId?: string | null; onClose: () => void; onCreated?: (id: string) => void }) {
  const ui = useUi();
  const [name, setName] = useState(deck?.name ?? "");
  const [emoji, setEmoji] = useState(deck?.emoji ?? "");
  const [color, setColor] = useState(deck?.color ?? DECK_COLORS[0]);
  const [desc, setDesc] = useState(deck?.description ?? "");
  const save = async () => {
    if (!name.trim()) return;
    if (deck) {
      await updateDeck(deck.id, { name: name.trim(), emoji, color, description: desc.trim() || undefined });
      ui.toast("Deck atualizado", "success");
    } else {
      const id = await createDeck({ name, emoji, color, parentId: parentId ?? null, folderId: folderId ?? null, description: desc.trim() || undefined });
      ui.toast(parentId ? "Subdeck criado" : "Deck criado", "success");
      onCreated?.(id);
    }
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={deck ? "Editar deck" : parentId ? "Novo subdeck" : "Novo deck"}
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" disabled={!name.trim()} onClick={save}>
            {deck ? "Salvar" : "Criar"}
          </button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="deck-preview-line">
          <DeckIcon deck={{ emoji, color }} size={52} />
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="deck-name">Nome</label>
            <input id="deck-name" data-autofocus className="input" value={name} maxLength={100} placeholder="Ex.: Anatomia — Sistema nervoso" onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="deck-desc">Descrição (opcional)</label>
          <input id="deck-desc" className="input" value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="field">
          <span className="label">Ícone</span>
          <div className="picker-grid">
            {EMOJIS.map((e) => (
              <button type="button" key={e || "none"} className={`picker-cell${emoji === e ? " active" : ""}`} onClick={() => setEmoji(e)} aria-label={e || "Sem emoji"}>
                {e || <BookOpen size={18} />}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Cor</span>
          <div className="picker-grid">
            {DECK_COLORS.map((c) => (
              <button type="button" key={c} className={`color-cell${color === c ? " active" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Cor ${c}`} />
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export const FOLDER_ICONS: Record<string, typeof FolderIcon> = {
  folder: FolderIcon,
  graduation: GraduationCap,
  flask: FlaskConical,
  languages: Languages,
  briefcase: Briefcase,
  heart: Heart,
  star: Star,
  palette: Palette,
};

export function FolderGlyph({ folder, size = 22 }: { folder: Pick<Folder, "icon" | "color">; size?: number }) {
  const Icon = FOLDER_ICONS[folder.icon] ?? FolderIcon;
  return (
    <div className="folder-glyph" style={{ background: `${folder.color}1f`, color: folder.color }}>
      <Icon size={size} />
    </div>
  );
}

export function FolderFormDialog({ folder, onClose, onCreated }: { folder?: Folder; onClose: () => void; onCreated?: (id: string) => void }) {
  const [name, setName] = useState(folder?.name ?? "");
  const [icon, setIcon] = useState(folder?.icon ?? "folder");
  const [color, setColor] = useState(folder?.color ?? DECK_COLORS[0]);
  const ui = useUi();
  const save = async () => {
    if (!name.trim()) return;
    if (folder) await updateFolder(folder.id, { name: name.trim(), icon, color });
    else onCreated?.(await createFolder(name, icon, color));
    ui.toast(folder ? "Pasta atualizada" : "Pasta criada", "success");
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={folder ? "Configurações da pasta" : "Nova pasta"}
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" disabled={!name.trim()} onClick={save}>
            {folder ? "Salvar" : "Criar"}
          </button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="field">
          <label htmlFor="folder-name">Nome da pasta</label>
          <input id="folder-name" data-autofocus className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <span className="label">Ícone e cor</span>
          <div className="picker-grid">
            {Object.entries(FOLDER_ICONS).map(([k, Icon]) => (
              <button type="button" key={k} className={`picker-cell${icon === k ? " active" : ""}`} onClick={() => setIcon(k)} aria-label={k}>
                <Icon size={18} />
              </button>
            ))}
          </div>
          <div className="picker-grid">
            {DECK_COLORS.map((c) => (
              <button type="button" key={c} className={`color-cell${color === c ? " active" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Cor ${c}`} />
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function MoveDeckDialog({ deck, folders, decks, onClose }: { deck: Deck; folders: Folder[]; decks: Deck[]; onClose: () => void }) {
  const ui = useUi();
  const forbidden = new Set<string>();
  const walk = (id: string) => {
    forbidden.add(id);
    decks.filter((d) => d.parentId === id).forEach((d) => walk(d.id));
  };
  walk(deck.id);
  const targets = decks.filter((d) => !forbidden.has(d.id) && d.archivedAt === null && d.deletedAt === null);
  const go = async (t: { parentId?: string | null; folderId?: string | null }, label: string) => {
    try {
      await moveDeck(deck.id, t);
      ui.toast(`Deck movido para ${label}`, "success");
      onClose();
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : String(e), "error");
    }
  };
  return (
    <Modal open onClose={onClose} title={`Mover “${deck.name}”`} description="Escolha uma pasta, ou um deck para transformá-lo em subdeck. Subdecks usam o algoritmo do deck principal.">
      <div className="pick-list">
        <button className="pick-item" onClick={() => go({ parentId: null, folderId: null }, "Início")}>
          <div className="folder-glyph">
            <BookOpen size={20} />
          </div>
          Início (sem pasta)
        </button>
        {folders.map((f) => (
          <button key={f.id} className="pick-item" onClick={() => go({ parentId: null, folderId: f.id }, f.name)}>
            <FolderGlyph folder={f} size={20} /> {f.name}
          </button>
        ))}
        {targets.length > 0 && <div className="pick-sep">Dentro de um deck</div>}
        {targets.map((d) => (
          <button key={d.id} className="pick-item" onClick={() => go({ parentId: d.id }, d.name)}>
            <DeckIcon deck={d} size={34} /> {d.name}
          </button>
        ))}
      </div>
    </Modal>
  );
}
