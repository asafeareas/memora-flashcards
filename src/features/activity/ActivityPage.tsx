import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Flame, Snowflake, CalendarCheck, Trophy, Download, Target } from "lucide-react";
import { useActivity, ACTIVE_DAY_GOAL } from "../../hooks/useData";
import { dayKey } from "../../domain/queue";
import { plural } from "../../domain/format";
import { downloadBlob } from "../../domain/backup";
import { Modal } from "../../ui/Modal";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function ActivityPage() {
  const a = useActivity();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [explain, setExplain] = useState<"freeze" | "active" | null>(null);

  const cells = useMemo(() => {
    const first = new Date(month);
    const start = first.getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(start).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  }, [month]);

  const last30 = useMemo(() => {
    const out: { key: string; label: string; n: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      out.push({ key, label: `${d.getDate()}/${d.getMonth() + 1}`, n: a?.days.get(key) ?? 0 });
    }
    return out;
  }, [a]);

  if (!a) return null;
  const max30 = Math.max(1, ...last30.map((d) => d.n));
  const today = dayKey();
  const goalPct = Math.min(100, (a.todayCount / ACTIVE_DAY_GOAL) * 100);

  return (
    <div className="narrow">
      <div className="page-head">
        <div>
          <h1>Atividade</h1>
          <div className="sub">Estude pelo menos {ACTIVE_DAY_GOAL} cartões por dia para manter sua sequência.</div>
        </div>
        <div className="page-head__actions">
          <button className="btn btn--secondary" onClick={() => shareStreak(a.streak)}>
            <Download /> Imagem da sequência
          </button>
        </div>
      </div>

      <div className="streak-hero panel">
        <div className={`streak-hero__flame${a.todayActive ? " lit" : ""}`}>
          <Flame size={44} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="streak-hero__n">{plural(a.streak, "dia", "dias")}</div>
          <div className="hint" style={{ padding: 0 }}>
            {a.todayActive ? "Meta de hoje concluída!" : `Faltam ${Math.max(0, ACTIVE_DAY_GOAL - a.todayCount)} cartões para a meta de hoje`}
          </div>
          <div className="goal-bar" aria-label="Progresso da meta diária">
            <i style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric panel">
          <Trophy />
          <strong>{a.longest}</strong>
          <span>Maior sequência</span>
        </div>
        <button className="metric panel" onClick={() => setExplain("active")}>
          <CalendarCheck />
          <strong>{a.activeDays}</strong>
          <span>Dias ativos</span>
        </button>
        <button className="metric panel" onClick={() => setExplain("freeze")}>
          <Snowflake />
          <strong>{a.freezes}/2</strong>
          <span>Congelamentos</span>
        </button>
        <div className="metric panel">
          <Target />
          <strong>{a.totalReviews}</strong>
          <span>Revisões no total</span>
        </div>
      </div>

      <div className="panel panel--pad calendar">
        <div className="calendar__head">
          <button className="icon-btn icon-btn--sm" aria-label="Mês anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft />
          </button>
          <strong>{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase())}</strong>
          <button className="icon-btn icon-btn--sm" aria-label="Próximo mês" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight />
          </button>
        </div>
        <div className="calendar__grid">
          {WEEKDAYS.map((w) => (
            <span key={w} className="calendar__wd">
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const k = dayKey(d);
            const n = a.days.get(k) ?? 0;
            const cls = n >= ACTIVE_DAY_GOAL ? "active" : a.frozenDays.has(k) ? "frozen" : n > 0 ? "partial" : "";
            return (
              <span key={i} className={`calendar__day ${cls}${k === today ? " today" : ""}`} title={`${d.toLocaleDateString("pt-BR")}: ${plural(n, "cartão", "cartões")}${a.frozenDays.has(k) ? " · congelado" : ""}`}>
                {d.getDate()}
              </span>
            );
          })}
        </div>
        <div className="calendar__legend">
          <span>
            <i className="calendar__day active" /> Dia ativo
          </span>
          <span>
            <i className="calendar__day partial" /> Estudou um pouco
          </span>
          <span>
            <i className="calendar__day frozen" /> Sequência congelada
          </span>
        </div>
      </div>

      <div className="setting-group__title">Últimos 30 dias</div>
      <div className="panel panel--pad">
        <div className="bars" role="img" aria-label="Cartões estudados por dia nos últimos 30 dias">
          {last30.map((d) => (
            <div key={d.key} className="bars__col" title={`${d.label}: ${d.n}`}>
              <i style={{ height: `${(d.n / max30) * 100}%` }} className={d.n >= ACTIVE_DAY_GOAL ? "ok" : ""} />
            </div>
          ))}
        </div>
        <div className="bars__axis">
          <span>{last30[0].label}</span>
          <span>hoje</span>
        </div>
      </div>

      <Modal open={explain === "freeze"} onClose={() => setExplain(null)} title="Mantenha sua sequência" footer={<button className="btn btn--primary" onClick={() => setExplain(null)}>Entendi</button>}>
        <p>Cada congelamento permite pular um dia sem perder a sequência — ele é usado automaticamente. Você ganha 1 congelamento a cada 7 dias ativos seguidos e pode guardar até 2.</p>
      </Modal>
      <Modal open={explain === "active"} onClose={() => setExplain(null)} title="Meta diária" footer={<button className="btn btn--primary" onClick={() => setExplain(null)}>Entendi</button>}>
        <p>Um dia conta como ativo quando você estuda pelo menos {ACTIVE_DAY_GOAL} cartões.</p>
      </Modal>
    </div>
  );
}

/** Generates a shareable PNG of the current streak. */
function shareStreak(streak: number) {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1080;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 1080, 1080);
  g.addColorStop(0, "#5b54e8");
  g.addColorStop(1, "#e0447f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(540, 470, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "800 64px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("Eu alcancei uma", 540, 300);
  ctx.font = "800 260px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(String(streak), 540, 570);
  ctx.font = "700 64px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(streak === 1 ? "dia de sequência" : "dias de sequência", 540, 680);
  ctx.font = "600 40px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("de estudos no Memora 🔥", 540, 760);
  c.toBlob((b) => b && downloadBlob(b, `sequencia-${streak}-dias.png`), "image/png");
}
