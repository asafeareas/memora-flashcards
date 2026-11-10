import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RotateCcw, Snowflake } from "lucide-react";
import { db } from "../../db/db";
import { Modal } from "../../ui/Modal";
import { useUi } from "../../ui/UiProvider";
import { displayStatus, formatInterval } from "../../domain/scheduler";
import { formatDate, formatDateTime, formatDuration, formatRelative } from "../../domain/format";
import { resetNotesProgress, setCardFrozen } from "../../db/repo";
import { STATUS_LABEL_ONE as STATUS_LABEL } from "../home/deckUi";

const RATING_LABEL = { 1: "Errei", 2: "Difícil", 3: "Bom", 4: "Fácil" } as const;
const VARIANT_LABEL = (v: string) => (v === "forward" ? "Frente → verso" : v === "reverse" ? "Verso → frente" : v.startsWith("c") ? `Lacuna ${v.slice(1)}` : "Área da imagem");

export function CardInfoDialog({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const ui = useUi();
  const [idx, setIdx] = useState(0);
  const data = useLiveQuery(async () => {
    const note = await db.notes.get(noteId);
    const cards = (await db.cards.where("noteId").equals(noteId).toArray()).sort((a, b) => a.variant.localeCompare(b.variant));
    const reviews = await db.reviews.where("noteId").equals(noteId).toArray();
    return { note, cards, reviews };
  }, [noteId]);
  if (!data?.note) return null;
  const card = data.cards[Math.min(idx, data.cards.length - 1)];
  const reviews = card ? data.reviews.filter((r) => r.cardId === card.id).sort((a, b) => b.at - a.at) : [];
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.durationMs, 0) / reviews.length : 0;
  const status = card ? displayStatus(card) : "notStudied";

  return (
    <Modal
      open
      onClose={onClose}
      title="Histórico de estudo"
      footer={
        <>
          {card && (
            <button className="btn btn--secondary" onClick={() => setCardFrozen(card.id, !card.frozen)}>
              <Snowflake /> {card.frozen ? "Descongelar" : "Congelar"}
            </button>
          )}
          <button
            className="btn btn--danger-ghost"
            onClick={async () => {
              const ok = await ui.confirm({ title: "Redefinir progresso?", message: "Todo o progresso de estudo será perdido e o cartão voltará para “Não estudado”.", confirmLabel: "Redefinir", danger: true });
              if (!ok) return;
              await resetNotesProgress([noteId]);
              ui.toast("Progresso redefinido", "success");
            }}
          >
            <RotateCcw /> Redefinir progresso
          </button>
        </>
      }
    >
      {data.cards.length > 1 && (
        <div className="chips-row">
          {data.cards.map((c, i) => (
            <button key={c.id} className={`chip${i === idx ? " active" : ""}`} onClick={() => setIdx(i)}>
              {VARIANT_LABEL(c.variant)}
            </button>
          ))}
        </div>
      )}
      {card && (
        <dl className="stats-grid">
          <div>
            <dt>Estado</dt>
            <dd>
              <span className="dot" style={{ background: `var(--st-${status})` }} /> {STATUS_LABEL[status]}
            </dd>
          </div>
          <div>
            <dt>Próxima revisão</dt>
            <dd>{card.state === "new" ? "—" : card.frozen ? "Congelado" : formatRelative(card.due)}</dd>
          </div>
          <div>
            <dt>Intervalo</dt>
            <dd>{card.state === "new" ? "—" : formatInterval(card.interval)}</dd>
          </div>
          <div>
            <dt>Facilidade</dt>
            <dd>{card.difficulty !== undefined ? `Dificuldade ${card.difficulty.toFixed(1)}` : `${Math.round(card.ease * 100)}%`}</dd>
          </div>
          <div>
            <dt>Revisões</dt>
            <dd>{card.reps}</dd>
          </div>
          <div>
            <dt>Erros</dt>
            <dd>{card.lapses}</dd>
          </div>
          <div>
            <dt>Tempo médio</dt>
            <dd>{avg ? formatDuration(avg) : "—"}</dd>
          </div>
          <div>
            <dt>Criado em</dt>
            <dd>{formatDate(card.createdAt)}</dd>
          </div>
        </dl>
      )}
      <div className="setting-group__title">Histórico de revisões</div>
      {reviews.length === 0 ? (
        <p className="hint">Este cartão ainda não foi estudado.</p>
      ) : (
        <div className="history">
          {reviews.map((r) => (
            <div key={r.id} className="history__row">
              <span className={`rate-pill rate-pill--${r.rating}`}>{RATING_LABEL[r.rating]}</span>
              <span>{formatDateTime(r.at)}</span>
              <span className="hint">{formatDuration(r.durationMs)}</span>
              <span className="hint" style={{ marginLeft: "auto" }}>
                → {r.state === "review" ? formatInterval(r.interval) : "aprendendo"}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
