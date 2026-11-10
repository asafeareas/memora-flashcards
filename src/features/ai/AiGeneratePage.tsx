import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Sparkles, FileUp, Loader2, Trash2, KeyRound, X, FileText, Type, Lightbulb } from "lucide-react";
import { useLibrary, useSetting } from "../../hooks/useData";
import { Segmented } from "../../ui/controls";
import { useUi } from "../../ui/UiProvider";
import { generateCards, fileToBase64, MAX_AI_CARDS, type AiFormat, type AiSource, type GeneratedCard } from "../../domain/ai";
import { bulkAddNotes, createDeck } from "../../db/repo";
import { pickFile } from "../../domain/backup";
import { normalizeCloze } from "../../domain/notes";
import { textToHtml } from "../../domain/importers";

type Tab = "prompt" | "text" | "pdf";
const FORMATS: { v: AiFormat; label: string; ex: string }[] = [
  { v: "question", label: "Pergunta / Resposta", ex: "Quem escreveu Dom Casmurro? / Machado de Assis" },
  { v: "definition", label: "Termo / Definição", ex: "Átomo / Menor unidade da matéria" },
  { v: "translation", label: "Palavra / Tradução", ex: "Hola / Olá" },
  { v: "cloze", label: "Cloze (lacunas)", ex: "A {{c1::mitocôndria}} produz ATP" },
];
const EXAMPLES = ["Vocabulário de francês: comida", "Conjugação de verbos em espanhol", "Neurotransmissores e suas funções", "Principais eventos da Segunda Guerra", "Identidades trigonométricas", "Princípios do direito contratual"];
const COUNTS = [10, 20, 30, 50];

export function AiGeneratePage() {
  const [params] = useSearchParams();
  const lib = useLibrary();
  const nav = useNavigate();
  const ui = useUi();
  const [apiKey] = useSetting<string>("aiApiKey", "");
  const [tab, setTab] = useState<Tab>("prompt");
  const [prompt, setPrompt] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; base64?: string; text?: string } | null>(null);
  const [format, setFormat] = useState<AiFormat>("question");
  const [count, setCount] = useState(20);
  const [instructions, setInstructions] = useState("");
  const [deckId, setDeckId] = useState<string>(params.get("deck") ?? "new");
  const [deckName, setDeckName] = useState("");
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<GeneratedCard[] | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const decks = (lib?.decks ?? []).filter((d) => d.archivedAt === null);
  const source: AiSource | null =
    tab === "prompt" ? (prompt.trim() ? { kind: "prompt", value: prompt.trim() } : null) : tab === "text" ? (text.trim() ? { kind: "text", value: text } : null) : file ? (file.base64 ? { kind: "pdf", value: file.base64, fileName: file.name } : { kind: "text", value: file.text ?? "", fileName: file.name }) : null;

  const run = async () => {
    if (!apiKey) return ui.toast("Adicione sua chave de API em Configurações para usar a IA.", "error");
    if (!source) return;
    setBusy(true);
    setCards(null);
    abort.current = new AbortController();
    try {
      const result = await generateCards({ apiKey, source, format, count, instructions, language: "português do Brasil", signal: abort.current.signal });
      if (!result.length) throw new Error("Nenhum cartão foi gerado. Tente outro tema ou mais material.");
      setCards(result);
      if (!deckName) setDeckName(tab === "prompt" ? prompt.trim().slice(0, 60) : (file?.name.replace(/\.[^.]+$/, "") ?? "Cartões gerados com IA"));
    } catch (e) {
      if ((e as Error).name !== "AbortError") ui.toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!cards?.length) return;
    const valid = cards.filter((c) => c.front.trim());
    try {
      const target = deckId === "new" ? await createDeck({ name: deckName.trim() || "Cartões gerados com IA" }) : deckId;
      await bulkAddNotes(
        target,
        valid.map((c) => {
          const isCloze = /\{\{c\d+::/.test(c.front);
          const wrap = (s: string) => (/<\/?(p|br|b|i)\b/i.test(s) ? `<p>${s}</p>` : textToHtml(s));
          return { type: isCloze ? ("cloze" as const) : ("basic" as const), front: isCloze ? normalizeCloze(wrap(c.front)) : wrap(c.front), back: c.back.trim() ? wrap(c.back) : "" };
        }),
      );
      ui.toast(`${valid.length} cartões salvos`, "success");
      nav(`/deck/${target}?tab=cards`);
    } catch (e) {
      ui.toast((e as Error).message, "error");
    }
  };

  return (
    <div className="narrow">
      <div className="page-head">
        <div>
          <h1>Gerador de cartões com IA</h1>
          <div className="sub">Crie cartões a partir de um tema, de um texto ou de um documento — sem limites.</div>
        </div>
      </div>

      {!apiKey && (
        <div className="banner">
          <KeyRound />
          <div style={{ flex: 1 }}>
            <strong>Conecte sua chave de API da Anthropic</strong>
            <div className="hint" style={{ padding: 0 }}>
              A geração usa o Claude com a sua própria chave, salva só neste navegador.
            </div>
          </div>
          <Link to="/settings#ai" className="btn btn--primary btn--sm">
            Configurar
          </Link>
        </div>
      )}

      {cards === null ? (
        <div className="form-stack">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "prompt", label: "Tema / prompt" },
              { value: "text", label: "Colar texto" },
              { value: "pdf", label: "Enviar documento" },
            ]}
          />
          {tab === "prompt" && (
            <div className="field">
              <label htmlFor="ai-prompt">Sobre o que você quer estudar?</label>
              <textarea id="ai-prompt" className="textarea" style={{ minHeight: 100 }} placeholder="Ex.: Sistema cardiovascular — anatomia e função do coração" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              <div className="chips-row" style={{ marginTop: 6 }}>
                <Lightbulb size={16} className="muted-icon" />
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="chip" onClick={() => setPrompt(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "text" && (
            <div className="field">
              <label htmlFor="ai-text">Cole suas anotações, um capítulo ou um artigo</label>
              <textarea id="ai-text" className="textarea" style={{ minHeight: 200 }} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="hint">{text.length.toLocaleString("pt-BR")} caracteres</div>
            </div>
          )}
          {tab === "pdf" && (
            <div className="occl-empty" style={{ margin: 0 }}>
              <FileText size={30} />
              <h3>{file ? file.name : "PDF, TXT ou Markdown"}</h3>
              <p>A IA lê o documento inteiro (até 32 MB / 600 páginas) e cria os cartões.</p>
              <div className="occl-empty__actions">
                <button
                  className="btn btn--primary"
                  onClick={async () => {
                    try {
                      const f = await pickFile(".pdf,.txt,.md");
                      if (f.size > 32 * 1024 * 1024) throw new Error("O documento passa de 32 MB.");
                      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) setFile({ name: f.name, base64: await fileToBase64(f) });
                      else setFile({ name: f.name, text: await f.text() });
                    } catch (e) {
                      if ((e as Error).message !== "Nenhum arquivo selecionado") ui.toast((e as Error).message, "error");
                    }
                  }}
                >
                  <FileUp /> {file ? "Trocar arquivo" : "Escolher arquivo"}
                </button>
                {file && (
                  <button className="btn btn--ghost" onClick={() => setFile(null)}>
                    <X /> Remover
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="field">
            <span className="label">Formato dos cartões</span>
            <div className="format-grid">
              {FORMATS.map((f) => (
                <button key={f.v} className={`format-cell${format === f.v ? " active" : ""}`} onClick={() => setFormat(f.v)}>
                  <strong>{f.label}</strong>
                  <span>{f.ex}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Quantos cartões?</span>
            <div className="chips-row" style={{ marginBottom: 0, alignItems: "center" }}>
              {COUNTS.map((c) => (
                <button key={c} className={`chip${count === c ? " active" : ""}`} onClick={() => setCount(c)}>
                  {c} cartões
                </button>
              ))}
              <input className="input" style={{ width: 110, minHeight: 34, padding: "4px 10px" }} type="number" min={1} max={MAX_AI_CARDS} value={count} onChange={(e) => setCount(Math.max(1, Math.min(MAX_AI_CARDS, Number(e.target.value) || 1)))} aria-label="Quantidade personalizada" />
            </div>
          </div>

          <div className="field">
            <label htmlFor="ai-inst">Instruções (opcional)</label>
            <input id="ai-inst" className="input" placeholder="Ex.: foque no vocabulário que cai na prova; inclua exemplos" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>

          <DeckTarget decks={decks} deckId={deckId} setDeckId={setDeckId} deckName={deckName} setDeckName={setDeckName} />

          <div className="editor-actions">
            {busy && (
              <button className="btn btn--ghost" onClick={() => abort.current?.abort()}>
                Cancelar
              </button>
            )}
            <button className="btn btn--primary btn--lg" disabled={!source || busy || !apiKey} onClick={run}>
              {busy ? (
                <>
                  <Loader2 className="spin" /> Criando seus cartões…
                </>
              ) : (
                <>
                  <Sparkles /> Gerar {count} cartões
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>
            Cartões gerados <span className="count">{cards.length}</span>
            <button className="btn btn--ghost btn--sm" style={{ marginLeft: "auto" }} onClick={async () => (await ui.confirm({ title: "Descartar os cartões gerados?", message: "Os cartões gerados serão apagados.", confirmLabel: "Descartar", danger: true })) && setCards(null)}>
              Voltar
            </button>
          </div>
          <div className="gen-list">
            {cards.map((c, i) => (
              <div key={i} className="gen-card panel">
                <span className="import-item__n">{i + 1}</span>
                <div className="gen-card__fields">
                  <textarea className="textarea" rows={2} value={c.front} aria-label="Frente" onChange={(e) => setCards(cards.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))} />
                  <textarea className="textarea" rows={2} value={c.back} aria-label="Verso" placeholder={format === "cloze" ? "Extra (opcional)" : "Verso"} onChange={(e) => setCards(cards.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))} />
                </div>
                <button className="icon-btn icon-btn--sm" aria-label="Remover cartão" onClick={() => setCards(cards.filter((_, j) => j !== i))}>
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
          <DeckTarget decks={decks} deckId={deckId} setDeckId={setDeckId} deckName={deckName} setDeckName={setDeckName} />
          <div className="editor-actions">
            <button className="btn btn--secondary" onClick={run} disabled={busy}>
              {busy ? <Loader2 className="spin" /> : <Sparkles />} Gerar de novo
            </button>
            <button className="btn btn--primary" disabled={!cards.length} onClick={save}>
              <Type /> Salvar {cards.length} cartões
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeckTarget({ decks, deckId, setDeckId, deckName, setDeckName }: { decks: { id: string; name: string }[]; deckId: string; setDeckId: (v: string) => void; deckName: string; setDeckName: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor="ai-deck">Salvar em</label>
      <select id="ai-deck" className="select" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
        <option value="new">Novo deck</option>
        {decks.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {deckId === "new" && <input className="input" placeholder="Nome do novo deck" value={deckName} onChange={(e) => setDeckName(e.target.value)} aria-label="Nome do novo deck" />}
    </div>
  );
}
