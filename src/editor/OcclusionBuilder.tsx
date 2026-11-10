import { useEffect, useRef, useState } from "react";
import { ImagePlus, Search, Trash2, ScanText, Loader2, MousePointerSquareDashed, Replace } from "lucide-react";
import type { OcclusionData, OcclusionMask } from "../db/types";
import { imageToDataUrl } from "../domain/images";
import { pickFile } from "../domain/backup";
import { uid } from "../db/db";
import { ImageSearchDialog } from "./ImageSearchDialog";
import { Segmented } from "../ui/controls";
import { useUi } from "../ui/UiProvider";
import { detectTextBoxes } from "../domain/ocr";

interface Props {
  value: OcclusionData | undefined;
  onChange: (v: OcclusionData | undefined) => void;
}

type Drag = { kind: "draw"; x0: number; y0: number; id: string } | { kind: "move"; id: string; dx: number; dy: number } | null;

export function OcclusionBuilder({ value, onChange }: Props) {
  const ui = useUi();
  const box = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [search, setSearch] = useState(false);
  const [ocr, setOcr] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const setImage = async (blob: Blob) => {
    try {
      const { dataUrl, width, height } = await imageToDataUrl(blob, 1600);
      onChange({ image: dataUrl, width, height, mode: value?.mode ?? "hideAll", masks: [] });
    } catch (e) {
      ui.toast((e as Error).message, "error");
    }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        setImage(f);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !(e.target as HTMLElement).closest("input,textarea,[contenteditable=true]")) {
        e.preventDefault();
        removeMask(selected);
      }
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
    };
  });

  const rel = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const setMasks = (masks: OcclusionMask[]) => valueRef.current && onChange({ ...valueRef.current, masks });
  const removeMask = (id: string) => {
    setMasks((valueRef.current?.masks ?? []).filter((m) => m.id !== id));
    setSelected(null);
  };

  const down = (e: React.PointerEvent) => {
    if (!value) return;
    const p = rel(e);
    const hit = [...value.masks].reverse().find((m) => p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h);
    box.current!.setPointerCapture(e.pointerId);
    if (hit) {
      setSelected(hit.id);
      setDrag({ kind: "move", id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y });
      return;
    }
    const id = uid();
    setSelected(id);
    setDrag({ kind: "draw", x0: p.x, y0: p.y, id });
    setMasks([...value.masks, { id, x: p.x, y: p.y, w: 0, h: 0 }]);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag || !valueRef.current) return;
    const p = rel(e);
    const masks = valueRef.current.masks.map((m) => {
      if (m.id !== drag.id) return m;
      if (drag.kind === "draw") return { ...m, x: Math.min(drag.x0, p.x), y: Math.min(drag.y0, p.y), w: Math.abs(p.x - drag.x0), h: Math.abs(p.y - drag.y0) };
      return { ...m, x: Math.min(1 - m.w, Math.max(0, p.x - drag.dx)), y: Math.min(1 - m.h, Math.max(0, p.y - drag.dy)) };
    });
    setMasks(masks);
  };
  const up = () => {
    if (drag?.kind === "draw" && valueRef.current) {
      // Discard accidental tiny rectangles.
      setMasks(valueRef.current.masks.filter((m) => m.id !== drag.id || (m.w > 0.01 && m.h > 0.01)));
    }
    setDrag(null);
  };

  const autoDetect = async () => {
    if (!value) return;
    setOcr(true);
    try {
      const boxes = await detectTextBoxes(value.image, value.width, value.height);
      if (!boxes.length) ui.toast("Nenhum texto encontrado na imagem.", "info");
      else {
        setMasks([...value.masks, ...boxes.map((b) => ({ id: uid(), ...b }))]);
        ui.toast(`${boxes.length} área(s) de texto ocultadas`, "success");
      }
    } catch (e) {
      ui.toast((e as Error).message, "error");
    } finally {
      setOcr(false);
    }
  };

  if (!value) {
    return (
      <div className="occl-empty">
        <MousePointerSquareDashed size={32} />
        <h3>Oclusão de imagem</h3>
        <p>Envie uma imagem e desenhe retângulos sobre as partes que você quer memorizar. Cada área vira um cartão.</p>
        <div className="occl-empty__actions">
          <button
            className="btn btn--primary"
            onClick={async () => {
              try {
                setImage(await pickFile("image/*"));
              } catch {
                /* cancelled */
              }
            }}
          >
            <ImagePlus /> Enviar imagem
          </button>
          <button className="btn btn--secondary" onClick={() => setSearch(true)}>
            <Search /> Buscar imagem
          </button>
        </div>
        <div className="hint">Você também pode colar uma imagem (Ctrl+V).</div>
        {search && (
          <ImageSearchDialog
            onClose={() => setSearch(false)}
            onPick={async (dataUrl) => {
              setSearch(false);
              setImage(await (await fetch(dataUrl)).blob());
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="occl-builder">
      <div className="occl-builder__bar">
        <Segmented
          value={value.mode}
          onChange={(mode) => onChange({ ...value, mode })}
          options={[
            { value: "hideAll", label: "Ocultar todas, adivinhar uma" },
            { value: "hideOne", label: "Ocultar uma, adivinhar uma" },
          ]}
        />
        <div className="occl-builder__tools">
          <button className="btn btn--secondary btn--sm" onClick={autoDetect} disabled={ocr} title="Detecta textos na imagem e cria as áreas automaticamente">
            {ocr ? <Loader2 className="spin" /> : <ScanText />} Detectar texto
          </button>
          <button className="btn btn--ghost btn--sm" disabled={!selected} onClick={() => selected && removeMask(selected)}>
            <Trash2 /> Remover área
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={async () => {
              try {
                setImage(await pickFile("image/*"));
              } catch {
                /* cancelled */
              }
            }}
          >
            <Replace /> Trocar imagem
          </button>
        </div>
      </div>
      <div className="occl occl--edit" ref={box} style={{ aspectRatio: `${value.width} / ${value.height}` }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
        <img src={value.image} alt="" draggable={false} />
        {value.masks.map((m, i) => (
          <div key={m.id} className={`occl__mask occl__mask--edit${selected === m.id ? " selected" : ""}`} style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}>
            <span>{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="hint">
        Arraste sobre a imagem para criar uma área · clique numa área para selecioná-la e arraste para mover · Delete remove. {value.masks.length} área(s) = {value.masks.length} cartão(ões).
      </div>
    </div>
  );
}
