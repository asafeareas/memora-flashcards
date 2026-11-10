import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, FileUp, AlertTriangle, Loader2, HelpCircle } from "lucide-react";
import { db } from "../../db/db";
import { Segmented } from "../../ui/controls";
import { Modal } from "../../ui/Modal";
import { useUi } from "../../ui/UiProvider";
import { parseAnki, parseCsv, parsePasted, isDeckExport, type ParsedCard } from "../../domain/importers";
import { importDeckJson } from "../../domain/exporters";
import { bulkAddNotes, createDeck } from "../../db/repo";
import { pickFile } from "../../domain/backup";
import { stripHtml } from "../../domain/notes";

type Mode = "paste" | "file";
const SIDE_OPTS = [
  { v: "\t", label: "Tab" },
  { v: ",", label: "Vírgula" },
  { v: " - ", label: "Hífen ( - )" },
];
const CARD_OPTS = [
  { v: "\n", label: "Nova linha" },
  { v: ";", label: "Ponto e vírgula" },
  { v: "\n\n", label: "Linha em branco" },
];
const MAX_FILE = 60 * 1024 * 1024;

export function ImportPage() {
  const { id: deckId } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const ui = useUi();
  const deck = useLiveQuery(async () => (deckId ? (await db.decks.get(deckId)) ?? null : null), [deckId]);
  const [mode, setMode] = useState<Mode>((params.get("mode") as Mode) || "paste");
  const [text, setText] = useState("");
  const [side, setSide] = useState("\t");
  const [sideCustom, setSideCustom] = useState("");
  const [cardSep, setCardSep] = useState("\n");
  const [cardCustom, setCardCustom] = useState("");
  const [fileCards, setFileCards] = useState<ParsedCard[] | null>(null);
  const [fileInfo, setFileInfo] = useState<string>("");
  const [deckName, setDeckName] = useState("");
  const [busy, setBusy] = useState(false);
  const [quizletHelp, setQuizletHelp] = useState(false);

  const pasted = useMemo(() => (text.trim() ? parsePasted(text, side === "custom" ? sideCustom || "\t" : side, cardSep === "custom" ? cardCustom || "\n" : cardSep) : []), [text, side, sideCustom, cardSep, cardCustom]);
  const cards = mode === "paste" ? pasted : (fileCards ?? []);
  const valid = cards.filter((c) => !c.error);
  const invalid = cards.length - valid.length;
  const back = deckId ? `/deck/${deckId}` : "/";

  const loadFile = async () => {
    try {
      const f = await pickFile(".csv,.tsv,.txt,.apkg,.colpkg,.json");
      if (f.size > MAX_FILE) throw new Error("Arquivo muito grande. Selecione um arquivo menor.");
      setBusy(true);
      const name = f.name.replace(/\.[^.]+$/, "");
      if (/\.(apkg|colpkg)$/i.test(f.name)) {
        const r = await parseAnki(f);
        setFileCards(r.cards);
        setDeckName(r.name);
        setFileInfo(`${f.name} · Anki · ${r.cards.length} cartões${r.images ? ` · ${r.images} imagens` : ""}${r.skipped ? ` · ${r.skipped} ignorados` : ""}`);
      } else if (/\.json$/i.test(f.name)) {
        const json = JSON.parse(await f.text());
        if (!isDeckExport(json)) throw new Error("Este JSON não é um deck do Memora. Para restaurar um backup completo, use Configurações → Dados.");
        const id = await importDeckJson(json);
        ui.toast(`Deck “${json.decks[0]?.name}” importado`, "success");
        nav(`/deck/${id}`);
        return;
      } else {
        const content = await f.text();
        const parsed = /\.txt$/i.test(f.name) && !content.includes(",") ? parsePasted(content, "\t", "\n") : parseCsv(content);
        if (!parsed.length) throw new Error("Nenhum cartão válido foi encontrado neste arquivo.");
        setFileCards(parsed);
        setDeckName(name);
        setFileInfo(`${f.name} · ${parsed.length} linhas`);
      }
    } catch (e) {
      if ((e as Error).message !== "Nenhum arquivo selecionado") ui.toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!valid.length) return;
    setBusy(true);
    try {
      const target = deckId ?? (await createDeck({ name: deckName.trim() || "Deck importado" }));
      await bulkAddNotes(target, valid.map((c) => ({ type: c.type, front: c.front, back: c.back })));
      ui.toast(`${valid.length} cartões importados${invalid ? ` · ${invalid} ignorados` : ""}`, "success");
      nav(`/deck/${target}?tab=cards`);
    } catch (e) {
      ui.toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (deckId && deck === null) return null;

  return (
    <div className="narrow">
      <div className="breadcrumb">
        <Link to={back} className="icon-btn icon-btn--sm icon-btn--bordered" aria-label="Voltar">
          <ArrowLeft />
        </Link>
        {deck ? <Link to={back}>{deck.name}</Link> : <Link to="/">Início</Link>}/<span className="current">Importar cartões</span>
      </div>
      <div className="page-head">
        <div>
          <h1>Importar cartões</h1>
          <div className="sub">{deck ? `Os cartões serão adicionados a “${deck.name}”.` : "Um novo deck será criado com os cartões importados."}</div>
        </div>
      </div>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "paste", label: "Colar texto" },
          { value: "file", label: "Arquivo (CSV, TXT, Anki)" },
        ]}
      />

      {!deckId && (
        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="imp-name">Nome do novo deck</label>
          <input id="imp-name" className="input" value={deckName} placeholder="Deck importado" onChange={(e) => setDeckName(e.target.value)} />
        </div>
      )}

      {mode === "paste" ? (
        <div className="import-grid">
          <div className="form-stack">
            <div className="field">
              <label htmlFor="imp-text">
                Importe seus dados. Copie e cole aqui a partir do{" "}
                <button className="link-btn" onClick={() => setQuizletHelp(true)}>
                  Quizlet <HelpCircle size={13} />
                </button>
                , Google Docs, planilha etc.
              </label>
              <textarea
                id="imp-text"
                className="textarea"
                style={{ minHeight: 220, fontFamily: "var(--font-mono)", fontSize: 14 }}
                placeholder={"célula\tunidade básica da vida\nmitocôndria\tproduz ATP"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const t = e.currentTarget;
                    const s = t.selectionStart;
                    setText(text.slice(0, s) + "\t" + text.slice(t.selectionEnd));
                    requestAnimationFrame(() => t.setSelectionRange(s + 1, s + 1));
                  }
                }}
              />
            </div>
            <SepPicker title="Entre frente e verso" opts={SIDE_OPTS} value={side} onChange={setSide} custom={sideCustom} onCustom={setSideCustom} placeholder="Personalizado: ex. -" />
            <SepPicker title="Entre cartões" opts={CARD_OPTS} value={cardSep} onChange={setCardSep} custom={cardCustom} onCustom={setCardCustom} placeholder="Personalizado: ex. \n\n" />
          </div>
          <Preview cards={cards} />
        </div>
      ) : (
        <div className="import-grid">
          <div className="occl-empty" style={{ margin: 0 }}>
            <FileUp size={32} />
            <h3>Escolha um arquivo</h3>
            <p>CSV ou planilha salva como CSV (frente na 1ª coluna, verso na 2ª), TXT separado por tab, pacote do Anki (.apkg) ou deck do Memora (.json).</p>
            <button className="btn btn--primary" onClick={loadFile} disabled={busy}>
              {busy ? <Loader2 className="spin" /> : <FileUp />} Selecionar arquivo
            </button>
            {fileInfo && <p className="hint" style={{ marginTop: 12 }}>{fileInfo}</p>}
          </div>
          <Preview cards={cards} />
        </div>
      )}

      <div className="editor-actions">
        {invalid > 0 && (
          <span className="error-text" style={{ marginRight: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <AlertTriangle size={16} /> {invalid} cartão(ões) com lado faltando serão ignorados — confira os itens em vermelho.
          </span>
        )}
        <Link to={back} className="btn btn--secondary">
          Cancelar
        </Link>
        <button className="btn btn--primary" disabled={!valid.length || busy} onClick={doImport}>
          {busy ? <Loader2 className="spin" /> : null} Importar {valid.length || ""} cartões
        </button>
      </div>

      <Modal open={quizletHelp} onClose={() => setQuizletHelp(false)} title="Como importar do Quizlet?" footer={<button className="btn btn--primary" onClick={() => setQuizletHelp(false)}>Entendi</button>}>
        <ol className="steps-list">
          <li>Abra o conjunto no Quizlet e clique no menu de três pontos.</li>
          <li>Escolha <strong>Exportar</strong>. Se não aparecer, clique antes em “Salvar e editar”.</li>
          <li>Mantenha “Entre termo e definição: Tab” e “Entre cartões: Nova linha”, copie o texto e cole aqui.</li>
        </ol>
      </Modal>
    </div>
  );
}

function SepPicker({ title, opts, value, onChange, custom, onCustom, placeholder }: { title: string; opts: { v: string; label: string }[]; value: string; onChange: (v: string) => void; custom: string; onCustom: (v: string) => void; placeholder: string }) {
  return (
    <div className="field">
      <span className="label">{title}</span>
      <div className="chips-row" style={{ marginBottom: 0 }}>
        {opts.map((o) => (
          <button key={o.label} className={`chip${value === o.v ? " active" : ""}`} onClick={() => onChange(o.v)}>
            {o.label}
          </button>
        ))}
        <button className={`chip${value === "custom" ? " active" : ""}`} onClick={() => onChange("custom")}>
          Personalizado
        </button>
      </div>
      {value === "custom" && <input className="input" value={custom} placeholder={placeholder} onChange={(e) => onCustom(e.target.value)} />}
    </div>
  );
}

function Preview({ cards }: { cards: ParsedCard[] }) {
  return (
    <div className="import-preview panel">
      <div className="import-preview__head">Pré-visualização dos cartões ({cards.length})</div>
      {cards.length === 0 ? (
        <p className="hint" style={{ padding: 16 }}>
          Os cartões aparecerão aqui.
        </p>
      ) : (
        <div className="import-preview__list">
          {cards.slice(0, 300).map((c, i) => (
            <div key={i} className={`import-item${c.error ? " import-item--error" : ""}`}>
              <span className="import-item__n">{i + 1}</span>
              <div>
                <div className={c.error === "front" ? "missing" : ""}>{stripHtml(c.front) || "Frente faltando"}</div>
                <div className={`hint ${c.error === "back" ? "missing" : ""}`} style={{ padding: 0 }}>
                  {c.type === "cloze" ? "Cloze" : stripHtml(c.back) || "Verso faltando"}
                </div>
              </div>
            </div>
          ))}
          {cards.length > 300 && <p className="hint">… e mais {cards.length - 300}</p>}
        </div>
      )}
    </div>
  );
}
