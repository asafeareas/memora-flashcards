import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Settings, Plus, Play, Sparkles, ClipboardPaste, HelpCircle, Layers, ArchiveRestore, Clock, Brain, PartyPopper } from "lucide-react";
import { useDeck, useLibrary, STATUS_ORDER } from "../../hooks/useData";
import { DeckIcon, DeckRow, StatusBar, STATUS_LABEL, STATUS_DESC, useDeckActions, DeckFormDialog } from "../home/deckUi";
import { Menu } from "../../ui/Menu";
import { Modal } from "../../ui/Modal";
import { Segmented } from "../../ui/controls";
import { archiveDeck } from "../../db/repo";
import { useUi } from "../../ui/UiProvider";
import { NotFoundPage } from "../shell/NotFoundPage";
import { CardsTab } from "./CardsTab";
import { formatRelative, plural } from "../../domain/format";
import { ALGORITHM_LABEL } from "../deck-settings/algorithmLabels";

export function DeckPage() {
  const { id } = useParams();
  const data = useDeck(id);
  const lib = useLibrary();
  const nav = useNavigate();
  const ui = useUi();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "cards" ? "cards" : "general";
  const actions = useDeckActions();
  const [explain, setExplain] = useState(false);
  const [why, setWhy] = useState(false);
  const [newSub, setNewSub] = useState(false);

  if (data === undefined) return <div className="skeleton" style={{ height: 300 }} />;
  if (!data || data.deck.deletedAt) return <NotFoundPage title="Deck não encontrado" text="Ele pode ter sido excluído. Veja “Excluídos recentemente”." />;
  const { deck, stats, chain, subdecks, subStats, folder, root } = data;
  const archived = !!deck.archivedAt;
  const speed = root.settings.algorithm === "speed";
  const today = stats.today;

  return (
    <div>
      <div className="breadcrumb">
        <button className="icon-btn icon-btn--sm icon-btn--bordered" aria-label="Voltar" onClick={() => nav(chain.length ? `/deck/${chain[chain.length - 1].id}` : folder ? `/folder/${folder.id}` : "/")}>
          <ArrowLeft />
        </button>
        <Link to="/">Início</Link>
        {folder && (
          <>
            /<Link to={`/folder/${folder.id}`}>{folder.name}</Link>
          </>
        )}
        {chain.map((c) => (
          <span key={c.id}>
            /{" "}
            <Link to={`/deck/${c.id}`}>{c.name}</Link>
          </span>
        ))}
        /<span className="current">{deck.name}</span>
      </div>

      <div className="page-head deck-head">
        <DeckIcon deck={deck} size={56} />
        <div style={{ minWidth: 0 }}>
          <h1>{deck.name}</h1>
          <div className="sub">
            {plural(stats.notes, "cartão", "cartões")}
            {subdecks.length > 0 && ` · ${plural(subdecks.length, "subdeck", "subdecks")}`}
            {deck.description && ` · ${deck.description}`}
          </div>
        </div>
        <div className="page-head__actions">
          {!archived && (
            <Link to={`/deck/${deck.id}/add`} className="btn btn--secondary">
              <Plus /> <span>Adicionar cartões</span>
            </Link>
          )}
          <Link to={`/deck/${deck.id}/settings`} className="icon-btn icon-btn--bordered" aria-label="Configurações do deck">
            <Settings />
          </Link>
          <Menu items={actions.menuFor(deck, lib?.folders ?? [], lib?.decks ?? [])} />
        </div>
      </div>

      {archived && (
        <div className="banner">
          <ArchiveRestore />
          <div style={{ flex: 1 }}>Este deck está arquivado. Decks arquivados não podem ser editados nem estudados.</div>
          <button
            className="btn btn--primary btn--sm"
            onClick={async () => {
              await archiveDeck(deck.id, false);
              ui.toast("Deck restaurado", "success");
            }}
          >
            Restaurar
          </button>
        </div>
      )}

      <div className="tabs-line">
        <Segmented
          value={tab}
          onChange={(t) => setParams(t === "cards" ? { tab: "cards" } : {}, { replace: true })}
          options={[
            { value: "general", label: "Geral" },
            { value: "cards", label: `Cartões (${stats.notes})` },
          ]}
        />
      </div>

      {tab === "general" ? (
        <>
          <div className="study-panel panel">
            <div className="study-panel__main">
              <div className="study-panel__eyebrow">{speed ? "Cartões para estudar" : "Cartões para hoje"}</div>
              {stats.cards === 0 ? (
                <>
                  <h2>Este deck não tem cartões</h2>
                  <p className="hint" style={{ padding: 0 }}>
                    Adicione cartões manualmente, gere com IA ou importe.
                  </p>
                </>
              ) : today.total > 0 ? (
                <>
                  <div className="big-number">{today.total}</div>
                  {!speed && (
                    <div className="today-split">
                      <span>
                        <i className="dot" style={{ background: "var(--st-notStudied)" }} /> {plural(today.newCount, "novo", "novos")}
                      </span>
                      <span>
                        <i className="dot" style={{ background: "var(--st-learning)" }} /> {today.learnCount} aprendendo
                      </span>
                      <span>
                        <i className="dot" style={{ background: "var(--st-gotIt)" }} /> {plural(today.reviewCount, "revisão", "revisões")}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2 className="done-title">
                    <PartyPopper /> {speed ? "Você aprendeu tudo!" : "Tudo feito por agora!"}
                  </h2>
                  {!speed && today.nextDue && (
                    <p className="next-due">
                      <Clock size={16} /> Próximos cartões {formatRelative(today.nextDue)}.{" "}
                      <button className="link-btn" onClick={() => setWhy(true)}>
                        Por que não agora?
                      </button>
                    </p>
                  )}
                </>
              )}
            </div>
            {!archived && stats.cards > 0 && (today.total > 0 || speed) && (
              <Link to={`/learn/${deck.id}`} className="btn btn--primary btn--lg study-cta">
                <Play /> {today.total > 0 ? "Estudar cartões" : "Estudar de novo"}
              </Link>
            )}
            {!archived && stats.cards === 0 && (
              <div className="study-panel__ctas">
                <Link to={`/deck/${deck.id}/add`} className="btn btn--primary">
                  <Plus /> Adicionar cartões
                </Link>
                <Link to={`/ai?deck=${deck.id}`} className="btn btn--secondary">
                  <Sparkles /> Gerar com IA
                </Link>
                <Link to={`/deck/${deck.id}/import`} className="btn btn--secondary">
                  <ClipboardPaste /> Importar colando
                </Link>
              </div>
            )}
          </div>

          {stats.cards > 0 && (
            <div className="panel panel--pad status-panel">
              <div className="status-panel__head">
                <strong>Estados dos cartões</strong>
                <button className="icon-btn icon-btn--sm" aria-label="O que significam os estados?" onClick={() => setExplain(true)}>
                  <HelpCircle />
                </button>
                <Link to={`/deck/${deck.id}/settings/algorithm`} className="algo-chip">
                  <Brain size={15} /> {ALGORITHM_LABEL[root.settings.algorithm]}
                </Link>
              </div>
              <StatusBar stats={stats} />
              <div className="status-legend">
                {STATUS_ORDER.map((s) => (
                  <div key={s}>
                    <i className="dot" style={{ background: `var(--st-${s})` }} />
                    <span>{STATUS_LABEL[s]}</span>
                    <strong>{stats.byStatus[s]}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.cards > 0 && !archived && (
            <div className="quick-add">
              <Link to={`/deck/${deck.id}/add`} className="quick-add__item">
                <Plus /> Adicionar cartões
              </Link>
              <Link to={`/ai?deck=${deck.id}`} className="quick-add__item">
                <Sparkles /> Gerar cartões com IA
              </Link>
              <Link to={`/deck/${deck.id}/import`} className="quick-add__item">
                <ClipboardPaste /> Importar colando
              </Link>
            </div>
          )}

          <div className="section-title">
            Subdecks <span className="count">{subdecks.length}</span>
            {!archived && (
              <button className="btn btn--ghost btn--sm" style={{ marginLeft: "auto" }} onClick={() => setNewSub(true)}>
                <Layers /> Adicionar subdeck
              </button>
            )}
          </div>
          {subdecks.length === 0 ? (
            <p className="hint">Organize o conteúdo em subdecks. Ao estudar este deck, os cartões dos subdecks também entram.</p>
          ) : (
            <div className="list">
              {subdecks.map((s) => (
                <DeckRow key={s.id} deck={s} stats={subStats.get(s.id)} folders={lib?.folders ?? []} decks={lib?.decks ?? []} subCount={data.allDecks.filter((d) => d.parentId === s.id && d.deletedAt === null).length} />
              ))}
            </div>
          )}
        </>
      ) : (
        <CardsTab data={data} />
      )}

      {actions.dialogs}
      {newSub && <DeckFormDialog parentId={deck.id} onClose={() => setNewSub(false)} />}
      <Modal open={explain} onClose={() => setExplain(false)} title="Estados dos cartões">
        <div className="explain-list">
          {STATUS_ORDER.map((s) => (
            <div key={s}>
              <i className="dot" style={{ background: `var(--st-${s})` }} />
              <div>
                <strong>{STATUS_LABEL[s]}</strong>
                <p>{STATUS_DESC[s]}</p>
              </div>
            </div>
          ))}
        </div>
      </Modal>
      <Modal open={why} onClose={() => setWhy(false)} title="Descanse um pouco" footer={<button className="btn btn--primary" onClick={() => setWhy(false)}>Entendi</button>}>
        <p>
          A repetição espaçada mostra cada cartão pouco antes de você esquecê-lo. Revisar cedo demais gasta tempo e fixa menos. Volte quando os próximos cartões vencerem — o Memora avisa na página inicial.
        </p>
      </Modal>
    </div>
  );
}
