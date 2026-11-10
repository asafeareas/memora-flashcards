import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  hint?: string;
  divider?: boolean;
  disabled?: boolean;
}

interface Props {
  items: MenuItem[];
  trigger?: (open: (el: HTMLElement) => void) => ReactNode;
  label?: string;
  align?: "left" | "right";
}

export function Menu({ items, trigger, label = "Mais opções", align = "right" }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const m = ref.current.getBoundingClientRect();
    let left = align === "right" ? r.right - m.width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - m.width - 8));
    let top = r.bottom + 6;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 6);
    setPos({ top, left });
  }, [anchor, align]);

  useEffect(() => {
    if (!anchor) return;
    const close = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      setAnchor(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAnchor(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  const open = (el: HTMLElement) => setAnchor((a) => (a ? null : el));
  return (
    <>
      {trigger ? (
        trigger(open)
      ) : (
        <button
          className="icon-btn icon-btn--sm"
          aria-label={label}
          aria-haspopup="menu"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            open(e.currentTarget);
          }}
        >
          <MoreHorizontal />
        </button>
      )}
      {anchor &&
        createPortal(
          <div className="menu" role="menu" ref={ref} style={pos ?? { top: -9999, left: -9999 }} onClick={(e) => e.stopPropagation()}>
            {items.map((it, i) =>
              it.divider ? (
                <hr key={i} />
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  className={it.danger ? "danger" : undefined}
                  disabled={it.disabled}
                  onClick={() => {
                    setAnchor(null);
                    it.onSelect?.();
                  }}
                >
                  {it.icon}
                  <span>{it.label}</span>
                  {it.hint && <span className="menu__hint">{it.hint}</span>}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
