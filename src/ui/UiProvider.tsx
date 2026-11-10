import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Modal } from "./Modal";

type ToastKind = "info" | "success" | "error";
interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  action?: { label: string; run: () => void };
}

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOptions {
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  validate?: (v: string) => string | null;
}

interface Ui {
  toast: (text: string, kind?: ToastKind, action?: Toast["action"]) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  prompt: (o: PromptOptions) => Promise<string | null>;
}

const Ctx = createContext<Ui | null>(null);
export const useUi = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("UiProvider missing");
  return v;
};

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [promptState, setPromptState] = useState<(PromptOptions & { resolve: (v: string | null) => void }) | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);

  const toast = useCallback<Ui["toast"]>((text, kind = "info", action) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3200);
  }, []);

  const confirm = useCallback<Ui["confirm"]>((o) => new Promise((resolve) => setConfirmState({ ...o, resolve })), []);
  const prompt = useCallback<Ui["prompt"]>((o) => {
    setPromptValue(o.initial ?? "");
    setPromptError(null);
    return new Promise((resolve) => setPromptState({ ...o, resolve }));
  }, []);

  const value = useMemo(() => ({ toast, confirm, prompt }), [toast, confirm, prompt]);

  const closeConfirm = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };
  const closePrompt = (v: string | null) => {
    if (v !== null && promptState?.validate) {
      const err = promptState.validate(v);
      if (err) {
        setPromptError(err);
        return;
      }
    }
    promptState?.resolve(v);
    setPromptState(null);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal
        open={!!confirmState}
        onClose={() => closeConfirm(false)}
        title={confirmState?.title}
        description={confirmState?.message}
        footer={
          <>
            <button className="btn btn--secondary" onClick={() => closeConfirm(false)}>
              {confirmState?.cancelLabel ?? "Cancelar"}
            </button>
            <button className={`btn ${confirmState?.danger ? "btn--danger" : "btn--primary"}`} data-autofocus onClick={() => closeConfirm(true)}>
              {confirmState?.confirmLabel ?? "Confirmar"}
            </button>
          </>
        }
      />
      <Modal
        open={!!promptState}
        onClose={() => closePrompt(null)}
        title={promptState?.title}
        footer={
          <>
            <button className="btn btn--secondary" onClick={() => closePrompt(null)}>
              Cancelar
            </button>
            <button className="btn btn--primary" disabled={!promptValue.trim()} onClick={() => closePrompt(promptValue.trim())}>
              {promptState?.confirmLabel ?? "Salvar"}
            </button>
          </>
        }
      >
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            if (promptValue.trim()) closePrompt(promptValue.trim());
          }}
        >
          {promptState?.label && <label htmlFor="prompt-input">{promptState.label}</label>}
          <input
            id="prompt-input"
            data-autofocus
            className={`input${promptError ? " input--error" : ""}`}
            value={promptValue}
            placeholder={promptState?.placeholder}
            maxLength={120}
            onChange={(e) => {
              setPromptValue(e.target.value);
              setPromptError(null);
            }}
          />
          {promptError && <div className="error-text">{promptError}</div>}
        </form>
      </Modal>
      {createPortal(
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast--${t.kind}`} role="status">
              {t.kind === "error" ? <AlertCircle /> : t.kind === "success" ? <CheckCircle2 /> : <Info />}
              <span>{t.text}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.run();
                    setToasts((x) => x.filter((y) => y.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}
