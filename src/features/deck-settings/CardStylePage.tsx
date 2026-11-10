import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, AlignCenter, AlignLeft, AlignRight, RotateCcw } from "lucide-react";
import { useDeck } from "../../hooks/useData";
import type { CardStyle } from "../../db/types";
import { updateDeckSettings } from "../../db/repo";
import { FONT_LABELS, HtmlFace } from "../../components/CardFace";
import { defaultDeckSettings } from "../../domain/presets";
import { useUi } from "../../ui/UiProvider";
import { NotFoundPage } from "../shell/NotFoundPage";
import { renderFaces } from "../../domain/render";

const PRESETS: { name: string; style: CardStyle }[] = [
  { name: "Padrão", style: { font: "default", textSize: 22, align: "center" } },
  { name: "Leitura", style: { font: "serif", textSize: 20, align: "left" } },
  { name: "Grande", style: { font: "montserrat", textSize: 30, align: "center" } },
  { name: "Código", style: { font: "mono", textSize: 17, align: "left" } },
  { name: "Dislexia", style: { font: "dyslexic", textSize: 21, align: "left" } },
];

export function CardStylePage() {
  const { id } = useParams();
  const data = useDeck(id);
  const ui = useUi();
  const [style, setStyle] = useState<CardStyle | null>(null);
  useEffect(() => {
    if (data?.deck && !style) setStyle(data.deck.settings.style);
  }, [data, style]);
  if (data === undefined || !style) return null;
  if (!data) return <NotFoundPage title="Deck não encontrado" />;
  const { deck, notes } = data;
  const sample = notes.find((n) => n.type !== "occlusion");
  const faces = sample ? renderFaces(sample, sample.type === "cloze" ? "c1" : "forward") : { front: "<p>Qual é a capital da Austrália?</p>", back: "<p><strong>Camberra</strong></p>" };

  return (
    <div className="narrow">
      <div className="breadcrumb">
        <Link to={`/deck/${deck.id}/settings`} className="icon-btn icon-btn--sm icon-btn--bordered" aria-label="Voltar">
          <ArrowLeft />
        </Link>
        <Link to={`/deck/${deck.id}`}>{deck.name}</Link>/<span className="current">Estilo do cartão</span>
      </div>
      <div className="page-head">
        <h1>Estilo do cartão</h1>
        <div className="page-head__actions">
          <button
            className="btn btn--ghost"
            onClick={async () => {
              if (!(await ui.confirm({ title: "Redefinir todas as alterações?", confirmLabel: "Redefinir" }))) return;
              const d = defaultDeckSettings().style;
              setStyle(d);
              await updateDeckSettings(deck.id, { style: d });
              ui.toast("Estilo padrão restaurado", "success");
            }}
          >
            <RotateCcw /> Redefinir
          </button>
          <button
            className="btn btn--primary"
            onClick={async () => {
              await updateDeckSettings(deck.id, { style });
              ui.toast("Estilo personalizado aplicado ao deck", "success");
            }}
          >
            Aplicar
          </button>
        </div>
      </div>

      <div className="style-preview">
        <div className="study-card style-preview__card">
          <HtmlFace html={faces.front} style={style} />
          <hr className="study-card__divider" />
          <HtmlFace html={faces.back} style={style} />
        </div>
      </div>

      <div className="setting-group__title">Predefinições</div>
      <div className="chips-row">
        {PRESETS.map((p) => (
          <button key={p.name} className={`chip${JSON.stringify(p.style) === JSON.stringify(style) ? " active" : ""}`} onClick={() => setStyle(p.style)}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="setting-group__title">Fonte</div>
      <div className="font-grid">
        {Object.entries(FONT_LABELS).map(([k, label]) => (
          <button key={k} className={`font-cell${style.font === k ? " active" : ""}`} onClick={() => setStyle({ ...style, font: k })}>
            <span style={{ fontFamily: k === "default" ? "var(--font)" : undefined }} className={`font-sample font-sample--${k}`}>
              Aa
            </span>
            {label}
          </button>
        ))}
      </div>

      <div className="setting-group__title">Tamanho do texto: {style.textSize}px</div>
      <input type="range" min={14} max={40} value={style.textSize} onChange={(e) => setStyle({ ...style, textSize: Number(e.target.value) })} style={{ width: "100%" }} aria-label="Tamanho do texto" />

      <div className="setting-group__title">Alinhamento</div>
      <div className="segmented">
        {(["left", "center", "right"] as const).map((a) => (
          <button key={a} className={style.align === a ? "active" : ""} onClick={() => setStyle({ ...style, align: a })} aria-label={a}>
            {a === "left" ? <AlignLeft size={18} /> : a === "center" ? <AlignCenter size={18} /> : <AlignRight size={18} />}
          </button>
        ))}
      </div>
    </div>
  );
}
