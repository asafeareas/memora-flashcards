import { useLayoutEffect, useMemo, useRef } from "react";
import type { CardStyle, Note } from "../db/types";
import { renderMathIn, sanitizeHtml } from "../domain/render";
import { OcclusionView } from "./OcclusionView";

export const FONT_STACKS: Record<string, string> = {
  default: "var(--font)",
  serif: "'Merriweather', Georgia, 'Times New Roman', serif",
  montserrat: "'Montserrat', var(--font)",
  mono: "'Roboto Mono', ui-monospace, monospace",
  dyslexic: "'OpenDyslexic', var(--font)",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

export const FONT_LABELS: Record<string, string> = {
  default: "Jakarta (padrão)",
  serif: "Merriweather (serifa)",
  montserrat: "Montserrat",
  mono: "Roboto Mono",
  dyslexic: "OpenDyslexic",
  system: "Fonte do sistema",
};

export const cardStyleVars = (style?: CardStyle): React.CSSProperties =>
  style ? { fontFamily: FONT_STACKS[style.font] ?? FONT_STACKS.default, fontSize: style.textSize, textAlign: style.align } : {};

export function HtmlFace({ html, style, className = "" }: { html: string; style?: CardStyle; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const safe = useMemo(() => sanitizeHtml(html || ""), [html]);
  useLayoutEffect(() => renderMathIn(ref.current), [safe]);
  return <div ref={ref} className={`card-html ${className}`} style={cardStyleVars(style)} dangerouslySetInnerHTML={{ __html: safe }} />;
}

/** Renders one side of a card for any note type. */
export function CardSide({ note, variant, side, style }: { note: Note; variant: string; side: "front" | "back"; style?: CardStyle }) {
  if (note.type === "occlusion" && note.occlusion) {
    return (
      <div className="occlusion-face">
        <OcclusionView data={note.occlusion} activeMaskId={variant.slice(2)} revealed={side === "back"} />
        {side === "back" && note.back && <HtmlFace html={note.back} style={style} className="card-extra" />}
        {side === "front" && note.front && <HtmlFace html={note.front} style={style} />}
      </div>
    );
  }
  return null;
}
