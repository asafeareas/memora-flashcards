import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Prevent closing with backdrop click (forms with unsaved content). */
  persistent?: boolean;
  labelledBy?: string;
}

export function Modal({ open, onClose, title, description, children, footer, wide, persistent }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select, button:not(.icon-btn)");
      el?.focus();
    }, 30);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => !persistent && e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " modal--wide" : ""}`} role="dialog" aria-modal="true" ref={ref}>
        {(title || description) && (
          <div className="modal__head">
            <div style={{ flex: 1 }}>
              {title && <h2>{title}</h2>}
              {description && <p>{description}</p>}
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <X />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
