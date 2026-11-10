import { useEffect, useRef, useState } from "react";
import { Eraser, Undo2, Trash2 } from "lucide-react";
import { Modal } from "../ui/Modal";

const COLORS = ["#1d1f26", "#e5484d", "#ef9a2c", "#23a566", "#3b82f6", "#7c3aed", "#ffffff"];

/** Freehand drawing canvas: color, opacity and thickness. */
export function CanvasDialog({ onSave, onClose }: { onSave: (dataUrl: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(4);
  const [opacity, setOpacity] = useState(1);
  const [eraser, setEraser] = useState(false);
  const history = useRef<ImageData[]>([]);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ref.current!.width, y: ((e.clientY - r.top) / r.height) * ref.current!.height };
  };
  const start = (e: React.PointerEvent) => {
    const ctx = ref.current!.getContext("2d")!;
    history.current.push(ctx.getImageData(0, 0, ref.current!.width, ref.current!.height));
    if (history.current.length > 30) history.current.shift();
    drawing.current = true;
    last.current = point(e);
    ref.current!.setPointerCapture(e.pointerId);
    move(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = point(e);
    ctx.globalAlpha = eraser ? 1 : opacity;
    ctx.strokeStyle = eraser ? "#fff" : color;
    ctx.lineWidth = eraser ? size * 4 : size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const end = () => {
    drawing.current = false;
    last.current = null;
  };
  const undo = () => {
    const prev = history.current.pop();
    if (prev) ref.current!.getContext("2d")!.putImageData(prev, 0, 0);
  };
  const clear = () => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    history.current.push(ctx.getImageData(0, 0, c.width, c.height));
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  };

  return (
    <Modal
      open
      persistent
      wide
      onClose={onClose}
      title="Tela de desenho"
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" onClick={() => onSave(ref.current!.toDataURL("image/png"))}>
            Inserir desenho
          </button>
        </>
      }
    >
      <div className="canvas-tools">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`color-cell${color === c && !eraser ? " active" : ""}`}
            style={{ background: c }}
            aria-label={`Cor ${c}`}
            onClick={() => {
              setColor(c);
              setEraser(false);
            }}
          />
        ))}
        <button className={`icon-btn icon-btn--sm${eraser ? " active" : ""}`} title="Borracha" onClick={() => setEraser((v) => !v)}>
          <Eraser />
        </button>
        <button className="icon-btn icon-btn--sm" title="Desfazer" onClick={undo}>
          <Undo2 />
        </button>
        <button className="icon-btn icon-btn--sm" title="Limpar" onClick={clear}>
          <Trash2 />
        </button>
        <label className="canvas-slider">
          Espessura
          <input type="range" min={1} max={24} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
        <label className="canvas-slider">
          Opacidade
          <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </label>
      </div>
      <canvas ref={ref} width={1200} height={700} className="draw-canvas" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
    </Modal>
  );
}
