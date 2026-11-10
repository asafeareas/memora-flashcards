import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { X, Volume2, Pencil, Snowflake, MoreHorizontal, Keyboard, Clock, Flame, CheckCircle2, RotateCcw, Home as HomeIcon } from "lucide-react";
import type { Card, Rating } from "../../db/types";
import { answerCard, restartSpeedRound, setCardFrozen } from "../../db/repo";
import { formatInterval, previewIntervals } from "../../domain/scheduler";
import { renderFaces } from "../../domain/render";
import { compareAnswer, expectedAnswer } from "../../domain/notes";
import { speak, speechTextFromHtml, stopSpeaking } from "../../domain/tts";
import { CardSide, HtmlFace } from "../../components/CardFace";
import { Menu } from "../../ui/Menu";
import { useUi } from "../../ui/UiProvider";
import { loadSession, pickNext, type SessionData } from "./session";
import { formatDuration, formatRelative, plural } from "../../domain/format";
import { useActivity, ACTIVE_DAY_GOAL } from "../../hooks/useData";
import { endOfToday } from "../../domain/queue";

const RATING_UI: { r: Rating; label: string; key: string; cls: string }[] = [
  { r: 1, label: "Errei", key: "1", cls: "again" },
  { r: 2, label: "Difícil", key: "2", cls: "hard" },
  { r: 3, label: "Bom", key: "3", cls: "good" },
  { r: 4, label: "Fácil", key: "4", cls: "easy" },
];

interface Stats {
  answered: number;
  correct: number;
  ms: number;
  newSeen: number;
}

export function LearnPage() {
  const { deckId = "all" } = useParams();
  const nav = useNavigate();
  const ui = useUi();
  const [session, setSession] = useState<SessionData | null | undefined>(undefined);
  const [queue, setQueue] = useState<Card[]>([]);
  const [current, setCurrent] = useState<Card | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");
  const [stats, setStats] = useState<Stats>({ answered: 0, correct: 0, ms: 0, newSeen: 0 });
  const [waitingUntil, setWaitingUntil] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const shownAt = useRef(Date.now());
  const lastId = useRef<string | undefined>(undefined);
  const backTo = deckId === "all" ? "/" : `/deck/${deckId}`;

  const start = useCallback(async () => {
    const s = await loadSession(deckId);
    setSession(s);
    if (!s) return;
    const q = s.queue.filter((c) => !s.laterToday.includes(c));
    setQueue(q);
    setCurrent(pickNext(q));
    setFlipped(false);
    shownAt.current = Date.now();
  }, [deckId]);

  useEffect(() => {
    start();
    return () => {
      stopSpeaking();
    };
  }, [start]);

  const note = current && session ? session.notes.get(current.noteId) : undefined;
  const settings = current && session ? session.settingsFor.get(current.deckId) : undefined;
  const faces = useMemo(() => (note && current ? renderFaces(note, current.variant) : null), [note, current]);
  const previews = useMemo(() => (current && settings ? previewIntervals(current, settings.algorithm, settings.params) : null), [current, settings]);

  // Autoplay TTS
  useEffect(() => {
    if (!current || !faces || !settings?.tts.autoplay) return;
    const html = flipped ? faces.back : faces.front;
    const lang = flipped ? (current.variant === "reverse" ? settings.tts.frontLang : settings.tts.backLang) : current.variant === "reverse" ? settings.tts.backLang : settings.tts.frontLang;
    speak(speechTextFromHtml(html, settings.tts.readWholeCard), lang).catch(() => undefined);
  }, [current, flipped, faces, settings]);

  // Waiting for learning cards: tick until one becomes available.
  useEffect(() => {
    if (current || !queue.length) {
      setWaitingUntil(null);
      return;
    }
    const next = Math.min(...queue.map((c) => c.due));
    setWaitingUntil(next);
    const t = setInterval(() => {
      const c = pickNext(queue);
      if (c) {
        setCurrent(c);
        shownAt.current = Date.now();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [current, queue]);

  const flip = useCallback(() => {
    if (!current || flipped) return;
    setFlipped(true);
  }, [current, flipped]);

  const answer = useCallback(
    async (rating: Rating) => {
      if (!current || !flipped || busy || !session) return;
      setBusy(true);
      stopSpeaking();
      const duration = Date.now() - shownAt.current;
      try {
        const next = await answerCard(current.id, rating, duration);
        const wasNew = current.state === "new";
        setStats((s) => ({ answered: s.answered + 1, correct: s.correct + (rating >= 3 ? 1 : 0), ms: s.ms + Math.min(duration, 300_000), newSeen: s.newSeen + (wasNew ? 1 : 0) }));
        let q = queue.filter((c) => c.id !== current.id);
        const stayToday = session.speed ? next.state !== "review" : (next.state === "learning" || next.state === "relearning") && next.due <= endOfToday();
        if (stayToday) {
          if (session.speed) {
            const pos = Math.min(q.length, 3 + Math.floor(Math.random() * 3));
            q = [...q.slice(0, pos), next, ...q.slice(pos)];
          } else q = [...q, next];
        }
        lastId.current = current.id;
        setQueue(q);
        const n = session.speed ? (q[0] ?? null) : pickNext(q, Date.now(), current.id);
        setCurrent(n);
        setFlipped(false);
        setTyped("");
        shownAt.current = Date.now();
      } catch (e) {
        ui.toast((e as Error).message, "error");
      } finally {
        setBusy(false);
      }
    },
    [current, flipped, busy, session, queue, ui],
  );

  const freeze = async () => {
    if (!current) return;
    await setCardFrozen(current.id, true);
    ui.toast("Cartão congelado — ele não aparecerá até ser descongelado", "success", { label: "Desfazer", run: () => setCardFrozen(current.id, false).then(start) });
    const q = queue.filter((c) => c.id !== current.id);
    setQueue(q);
    setCurrent(session?.speed ? (q[0] ?? null) : pickNext(q));
    setFlipped(false);
  };

  const readAloud = () => {
    if (!current || !faces || !settings) return;
    const html = flipped ? faces.back : faces.front;
    const lang = flipped !== (current.variant === "reverse") ? settings.tts.backLang : settings.tts.frontLang;
    speak(speechTextFromHtml(html, true), lang).catch((e) => ui.toast((e as Error).message, "error"));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement).closest("input, textarea, [contenteditable=true]");
      if (e.key === "Escape") {
        nav(backTo);
        return;
      }
      if (inField) {
        if (e.key === "Enter" && !flipped) {
          e.preventDefault();
          flip();
        }
        return;
      }
      if ((e.key === " " || e.key === "Enter") && !flipped) {
        e.preventDefault();
        flip();
        return;
      }
      if (flipped) {
        if (session?.speed) {
          if (e.key === "1") answer(1);
          if (e.key === "2" || e.key === " " || e.key === "Enter") {
            e.preventDefault();
            answer(3);
          }
        } else {
          if (["1", "2", "3", "4"].includes(e.key)) answer(Number(e.key) as Rating);
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            answer(3);
          }
        }
      }
      if (e.key.toLowerCase() === "e" && current) nav(`/deck/${current.deckId}/note/${current.noteId}`, { state: { returnTo: `/learn/${deckId}` } });
      if (e.key.toLowerCase() === "r") readAloud();
      if (e.key === "?") setShowKeys((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (session === undefined) return <div className="learn" />;
  if (session === null)
    return (
      <div className="learn learn--center">
        <p>Deck não encontrado ou arquivado.</p>
        <Link className="btn btn--primary" to="/">
          Voltar ao início
        </Link>
      </div>
    );

  const remaining = { new: queue.filter((c) => c.state === "new").length, learn: queue.filter((c) => c.state === "learning" || c.state === "relearning").length, review: queue.filter((c) => c.state === "review").length };
  const total = stats.answered + queue.length;
  const progress = total ? (stats.answered / total) * 100 : 100;

  const header = (
    <header className="learn__top">
      <Link to={backTo} className="icon-btn" aria-label="Encerrar estudo">
        <X />
      </Link>
      <div className="learn__progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${progress}%` }} />
      </div>
      {!session.speed ? (
        <div className="learn__counts" title="Novos · Aprendendo · Revisões">
          <span style={{ color: "var(--st-gotIt)" }}>{remaining.new}</span>
          <span style={{ color: "var(--st-notQuite)" }}>{remaining.learn}</span>
          <span style={{ color: "var(--success)" }}>{remaining.review}</span>
        </div>
      ) : (
        <div className="learn__counts">
          <span>{queue.length}</span>
        </div>
      )}
      {current && (
        <Menu
          items={[
            { label: "Ouvir", icon: <Volume2 />, hint: "R", onSelect: readAloud },
            { label: "Editar cartão", icon: <Pencil />, hint: "E", onSelect: () => nav(`/deck/${current.deckId}/note/${current.noteId}`, { state: { returnTo: `/learn/${deckId}` } }) },
            { label: "Congelar cartão", icon: <Snowflake />, onSelect: freeze },
            { label: "Atalhos de teclado", icon: <Keyboard />, hint: "?", onSelect: () => setShowKeys(true) },
          ]}
          trigger={(open) => (
            <button className="icon-btn" aria-label="Ações do cartão" onClick={(e) => open(e.currentTarget)}>
              <MoreHorizontal />
            </button>
          )}
        />
      )}
    </header>
  );

  if (!current) {
    if (waitingUntil && queue.length) {
      return (
        <div className="learn">
          {header}
          <div className="learn__body learn--center">
            <Clock size={40} className="muted-icon" />
            <h2>Os próximos cartões ainda estão na fase de aprendizagem</h2>
            <p className="hint">Eles voltam {formatRelative(waitingUntil)}. Você pode esperar aqui ou estudar agora.</p>
            <div className="row-actions">
              <button
                className="btn btn--primary"
                onClick={() => {
                  const c = [...queue].sort((a, b) => a.due - b.due)[0];
                  setCurrent(c);
                  shownAt.current = Date.now();
                }}
              >
                Estudar agora
              </button>
              <Link to={backTo} className="btn btn--secondary">
                Terminar por agora
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return <CompleteScreen stats={stats} speed={session.speed} backTo={backTo} title={session.title} laterCount={session.laterToday.length} onRestart={async () => {
      await restartSpeedRound(deckId);
      setStats({ answered: 0, correct: 0, ms: 0, newSeen: 0 });
      start();
    }} />;
  }

  if (!note || !faces || !settings) return null;
  const style = settings.style;
  const isOcclusion = note.type === "occlusion";
  const typeIn = !!note.typeIn && !isOcclusion;
  const expected = typeIn ? expectedAnswer(note, current.variant) : "";
  const verdict = typeIn && flipped ? compareAnswer(typed, expected) : null;

  return (
    <div className="learn">
      {header}
      <div className="learn__body">
        <div className="learn__deckname">{session.decks.find((d) => d.id === current.deckId)?.name}</div>
        <div className={`study-card${flipped ? " is-flipped" : ""}`} onClick={() => !flipped && !typeIn && flip()} role={flipped ? undefined : "button"} aria-label={flipped ? undefined : "Mostrar resposta"}>
          <div className="study-card__face">
            {isOcclusion ? (
              <CardSide note={note} variant={current.variant} side={flipped ? "back" : "front"} style={style} />
            ) : (
              <>
                {(!flipped || !faces.backIncludesFront) && <HtmlFace html={faces.front} style={style} />}
                {flipped && (
                  <>
                    {!faces.backIncludesFront && <hr className="study-card__divider" />}
                    <HtmlFace html={faces.back} style={style} className="study-card__back" />
                  </>
                )}
              </>
            )}
            {typeIn && (
              <div className="type-in" onClick={(e) => e.stopPropagation()}>
                {!flipped ? (
                  <input className="input" autoFocus placeholder="Digite sua resposta e pressione Enter" value={typed} onChange={(e) => setTyped(e.target.value)} />
                ) : (
                  <div className={`type-in__result type-in__result--${verdict}`}>
                    <div>
                      <span className="hint">Sua resposta:</span> <strong>{typed || "—"}</strong>
                    </div>
                    <div>
                      {verdict === "exact" ? "Correto!" : verdict === "close" ? "Quase — confira a grafia." : "Resposta esperada:"} {verdict !== "exact" && <strong>{expected}</strong>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="icon-btn study-card__speak"
            aria-label="Ouvir"
            onClick={(e) => {
              e.stopPropagation();
              readAloud();
            }}
          >
            <Volume2 />
          </button>
        </div>
      </div>
      <footer className="learn__footer">
        {!flipped ? (
          <button className="btn btn--primary btn--lg learn__reveal" onClick={flip}>
            Mostrar resposta <kbd>Espaço</kbd>
          </button>
        ) : session.speed ? (
          <div className="rate-row rate-row--two">
            <button className="rate-btn rate-btn--again" onClick={() => answer(1)} disabled={busy}>
              <strong>Quase</strong>
              <kbd>1</kbd>
            </button>
            <button className="rate-btn rate-btn--good" onClick={() => answer(3)} disabled={busy}>
              <strong>Aprendi</strong>
              <kbd>2</kbd>
            </button>
          </div>
        ) : (
          <div className="rate-row">
            {RATING_UI.map((b) => (
              <button key={b.r} className={`rate-btn rate-btn--${b.cls}`} onClick={() => answer(b.r)} disabled={busy}>
                <span className="rate-btn__interval">{previews ? formatInterval(previews[b.r]) : ""}</span>
                <strong>{b.label}</strong>
                <kbd>{b.key}</kbd>
              </button>
            ))}
          </div>
        )}
      </footer>
      {showKeys && (
        <div className="keys-pop" onClick={() => setShowKeys(false)}>
          <div className="keys-pop__card panel panel--pad" onClick={(e) => e.stopPropagation()}>
            <h3>Atalhos de teclado</h3>
            <ul>
              <li>
                <kbd>Espaço</kbd>/<kbd>Enter</kbd> mostrar resposta · responder “Bom”
              </li>
              <li>
                <kbd>1</kbd>–<kbd>4</kbd> Errei, Difícil, Bom, Fácil
              </li>
              <li>
                <kbd>E</kbd> editar cartão · <kbd>R</kbd> ouvir
              </li>
              <li>
                <kbd>Esc</kbd> sair do estudo
              </li>
            </ul>
            <button className="btn btn--secondary btn--block" onClick={() => setShowKeys(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompleteScreen({ stats, speed, backTo, title, laterCount, onRestart }: { stats: Stats; speed: boolean; backTo: string; title: string; laterCount: number; onRestart: () => void }) {
  const activity = useActivity();
  const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  return (
    <div className="learn learn--center learn--complete">
      <div className="complete-badge">
        <CheckCircle2 size={44} />
      </div>
      <h1>{stats.answered === 0 ? (speed ? "Você aprendeu tudo!" : "Nada para estudar agora") : speed ? "Parabéns! Você aprendeu tudo!" : "Muito bem! Você revisou tudo por hoje"}</h1>
      <p className="hint">{stats.answered === 0 ? (speed ? "Comece uma nova rodada para revisar os cartões." : "Novos cartões chegam em breve.") : `${title} · ${plural(stats.answered, "cartão estudado", "cartões estudados")}`}</p>
      {stats.answered > 0 && (
        <div className="complete-stats">
          <div>
            <strong>{stats.answered}</strong>
            <span>respostas</span>
          </div>
          <div>
            <strong>{accuracy}%</strong>
            <span>acertos</span>
          </div>
          <div>
            <strong>{formatDuration(stats.ms)}</strong>
            <span>de estudo</span>
          </div>
        </div>
      )}
      {activity && (
        <div className="complete-streak">
          <Flame /> {activity.todayActive ? `Sequência de ${plural(activity.streak, "dia", "dias")}! Meta de hoje concluída.` : `Estude ${Math.max(0, ACTIVE_DAY_GOAL - activity.todayCount)} cartão(ões) a mais para concluir a meta de hoje.`}
        </div>
      )}
      {laterCount > 0 && <p className="hint">{plural(laterCount, "cartão volta", "cartões voltam")} mais tarde hoje.</p>}
      <div className="row-actions">
        {speed && (
          <button className="btn btn--primary" onClick={onRestart}>
            <RotateCcw /> Continuar estudando
          </button>
        )}
        <Link to={backTo} className={`btn ${speed ? "btn--secondary" : "btn--primary"}`}>
          Voltar ao deck
        </Link>
        <Link to="/" className="btn btn--ghost">
          <HomeIcon /> Início
        </Link>
      </div>
    </div>
  );
}
