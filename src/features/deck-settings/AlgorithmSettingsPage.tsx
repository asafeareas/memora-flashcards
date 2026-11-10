import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Plus, X, ChevronDown } from "lucide-react";
import { useDeck } from "../../hooks/useData";
import type { AlgorithmParams, AlgorithmPreset } from "../../db/types";
import { updateDeckSettings } from "../../db/repo";
import { paramsFor } from "../../domain/presets";
import { useUi } from "../../ui/UiProvider";
import { NotFoundPage } from "../shell/NotFoundPage";
import { ALGORITHM_DESC, ALGORITHM_LABEL } from "./algorithmLabels";

const ORDER: AlgorithmPreset[] = ["general", "fsrs", "speed", "language", "medical", "custom"];

type Unit = "m" | "h" | "d";
const toUnit = (min: number): { v: number; u: Unit } => (min % 1440 === 0 ? { v: min / 1440, u: "d" } : min % 60 === 0 ? { v: min / 60, u: "h" } : { v: min, u: "m" });
const fromUnit = (v: number, u: Unit) => Math.max(1, Math.round(v * (u === "d" ? 1440 : u === "h" ? 60 : 1)));

export function AlgorithmSettingsPage() {
  const { id } = useParams();
  const data = useDeck(id);
  const ui = useUi();
  const [advanced, setAdvanced] = useState(false);
  const [draft, setDraft] = useState<AlgorithmParams | null>(null);
  const [maxPerDay, setMaxPerDay] = useState(9999);

  useEffect(() => {
    if (data?.deck && !draft) {
      setDraft({ ...data.deck.settings.params });
      setMaxPerDay(data.deck.settings.maxReviewsPerDay);
    }
  }, [data, draft]);

  if (data === undefined) return null;
  if (!data) return <NotFoundPage title="Deck não encontrado" />;
  const { deck, chain } = data;
  if (chain.length) return <NotFoundPage title="Algoritmo herdado" text="Este é um subdeck: ele usa o algoritmo do deck principal." />;
  const current = deck.settings.algorithm;

  const choose = async (preset: AlgorithmPreset) => {
    if (preset === current) return;
    const ok = await ui.confirm({
      title: "Trocar o algoritmo de aprendizagem?",
      message: "Trocar o algoritmo redefine o progresso do deck e dos subdecks. Seus cartões não são apagados.",
      confirmLabel: "Trocar",
      danger: true,
    });
    if (!ok) return;
    const params = paramsFor(preset, draft ?? undefined);
    await updateDeckSettings(deck.id, { algorithm: preset, params });
    setDraft({ ...params });
    ui.toast("Algoritmo atualizado", "success");
  };

  const save = async () => {
    if (!draft) return;
    await updateDeckSettings(deck.id, { params: draft, maxReviewsPerDay: maxPerDay, ...(current !== "custom" && current !== "fsrs" ? { algorithm: "custom" as const } : {}) });
    ui.toast("Configurações do algoritmo salvas", "success");
  };

  const set = <K extends keyof AlgorithmParams>(k: K, v: AlgorithmParams[K]) => draft && setDraft({ ...draft, [k]: v });

  return (
    <div className="narrow">
      <div className="breadcrumb">
        <Link to={`/deck/${deck.id}/settings`} className="icon-btn icon-btn--sm icon-btn--bordered" aria-label="Voltar">
          <ArrowLeft />
        </Link>
        <Link to={`/deck/${deck.id}`}>{deck.name}</Link>/<Link to={`/deck/${deck.id}/settings`}>Configurações</Link>/<span className="current">Algoritmo</span>
      </div>
      <div className="page-head">
        <div>
          <h1>Escolha o algoritmo de aprendizagem</h1>
          <div className="sub">Trocar o algoritmo redefine o progresso do deck.</div>
        </div>
      </div>
      <div className="algo-list">
        {ORDER.map((p) => (
          <button key={p} className={`algo-option${current === p ? " active" : ""}`} onClick={() => choose(p)}>
            <div>
              <strong>{ALGORITHM_LABEL[p]}</strong>
              <p>{ALGORITHM_DESC[p]}</p>
            </div>
            {current === p && <Check className="algo-option__check" />}
          </button>
        ))}
      </div>

      {current !== "speed" && draft && (
        <>
          <button className="btn btn--ghost" style={{ marginTop: 18 }} onClick={() => setAdvanced((a) => !a)}>
            Configurações avançadas <ChevronDown style={{ transform: advanced ? "rotate(180deg)" : undefined }} />
          </button>
          {advanced && (
            <div className="panel panel--pad form-stack" style={{ marginTop: 10 }}>
              {current !== "custom" && current !== "fsrs" && <div className="banner">Ao salvar alterações, o deck passa a usar o algoritmo “Personalizado”.</div>}
              {current === "fsrs" ? (
                <div className="field">
                  <label>Retenção desejada: {Math.round(draft.desiredRetention * 100)}%</label>
                  <input type="range" min={0.7} max={0.99} step={0.01} value={draft.desiredRetention} onChange={(e) => set("desiredRetention", Number(e.target.value))} />
                  <div className="hint">Probabilidade de lembrar um cartão quando ele for revisado. Mais alta = mais revisões.</div>
                </div>
              ) : (
                <>
                  <StepsEditor title="Fase de aprendizagem" description="Durante a fase de aprendizagem, o cartão passa por passos com intervalos fixos antes de ir para a fase de revisão." steps={draft.learningSteps} onChange={(v) => set("learningSteps", v)} />
                  <StepsEditor title="Reaprendizagem (após errar)" description="Passos usados quando você erra um cartão que já estava em revisão." steps={draft.relearningSteps} onChange={(v) => set("relearningSteps", v)} />
                  <NumberField label="Intervalo de graduação (dias)" hint="Primeiro intervalo quando o cartão sai da aprendizagem com “Bom”." value={draft.graduatingInterval} min={1} onChange={(v) => set("graduatingInterval", v)} />
                  <NumberField label="Intervalo do “Fácil” (dias)" value={draft.easyInterval} min={1} onChange={(v) => set("easyInterval", v)} />
                  <NumberField label="Facilidade inicial (%)" hint="Multiplicador inicial dos intervalos na fase de revisão." value={Math.round(draft.startingEase * 100)} min={130} max={500} onChange={(v) => set("startingEase", v / 100)} />
                  <NumberField label="Bônus do “Fácil” (%)" hint="Quando você responde “Fácil”, o intervalo é multiplicado por este valor a mais." value={Math.round(draft.easyBonus * 100)} min={100} max={500} onChange={(v) => set("easyBonus", v / 100)} />
                  <NumberField label="Modificador de intervalo (%)" hint="Todos os intervalos da fase de revisão são multiplicados por este valor. 80% = revisões mais frequentes." value={Math.round(draft.intervalModifier * 100)} min={10} max={500} onChange={(v) => set("intervalModifier", v / 100)} />
                </>
              )}
              <NumberField label="Intervalo máximo (dias)" hint="O maior intervalo que um cartão dominado pode ter." value={draft.maxInterval} min={1} max={36500} onChange={(v) => set("maxInterval", v)} />
              <NumberField label="Máximo de revisões por dia" hint="Limite pedagógico opcional (padrão: sem limite prático)." value={maxPerDay} min={1} max={9999} onChange={setMaxPerDay} />
              <button className="btn btn--primary" onClick={save}>
                Salvar alterações
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NumberField({ label, hint, value, onChange, min, max }: { label: string; hint?: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" type="number" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function StepsEditor({ title, description, steps, onChange }: { title: string; description: string; steps: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="field">
      <label>{title}</label>
      <div className="hint" style={{ marginBottom: 6 }}>
        {description}
      </div>
      <div className="steps">
        {steps.map((m, i) => {
          const { v, u } = toUnit(m);
          return (
            <div key={i} className="step">
              <span className="step__n">Revisão {i + 1}</span>
              <input className="input" type="number" min={1} value={v} onChange={(e) => onChange(steps.map((x, j) => (j === i ? fromUnit(Number(e.target.value), u) : x)))} />
              <select className="select" value={u} onChange={(e) => onChange(steps.map((x, j) => (j === i ? fromUnit(v, e.target.value as Unit) : x)))}>
                <option value="m">minutos</option>
                <option value="h">horas</option>
                <option value="d">dias</option>
              </select>
              <button className="icon-btn icon-btn--sm" aria-label="Remover passo" onClick={() => onChange(steps.filter((_, j) => j !== i))}>
                <X />
              </button>
            </div>
          );
        })}
        <button className="btn btn--secondary btn--sm" onClick={() => onChange([...steps, steps.length ? steps[steps.length - 1] * 2 : 10])}>
          <Plus /> Adicionar
        </button>
      </div>
    </div>
  );
}
