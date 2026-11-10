import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UIcon,
  Strikethrough,
  Heading2,
  List,
  ListOrdered,
  Code2,
  Link2,
  Highlighter,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Sigma,
  Brackets,
  ImagePlus,
  ImageUp,
  Search,
  PenLine,
  Volume2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Baseline,
  Eraser,
} from "lucide-react";
import katex from "katex";
import { Cloze, MathInline, Speak } from "./extensions";
import { Modal } from "../ui/Modal";
import { useUi } from "../ui/UiProvider";
import { imageToDataUrl } from "../domain/images";
import { pickFile } from "../domain/backup";
import { speak, speechTextFromHtml } from "../domain/tts";
import { ImageSearchDialog } from "./ImageSearchDialog";
import { hasBareCloze, normalizeCloze } from "../domain/notes";
import { CanvasDialog } from "./CanvasDialog";

export interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Show the cloze tool */
  cloze?: boolean;
  ttsLang?: string;
  autoFocus?: boolean;
  label?: string;
  onSubmit?: () => void;
  minHeight?: number;
}

const HIGHLIGHTS = ["#fff59d", "#c8f7c5", "#bfe3ff", "#ffd6e7", "#ffd8a8"];
const TEXT_COLORS = ["#1d1f26", "#e5484d", "#ef9a2c", "#23a566", "#3b82f6", "#7c3aed"];

export function RichEditor({ value, onChange, placeholder, cloze, ttsLang = "pt-BR", autoFocus, label, onSubmit, minHeight = 120 }: RichEditorProps) {
  const ui = useUi();
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const clozeRef = useRef(!!cloze);
  clozeRef.current = !!cloze;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Subscript,
      Superscript,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Image.configure({ allowBase64: true, inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Cloze,
      Speak,
      MathInline,
    ],
    content: value,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: { class: "rte__content", "aria-label": label ?? placeholder ?? "Editor", style: `min-height:${minHeight}px` },
      handleKeyDown: (_v, e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          submitRef.current?.();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
        if (!file) return false;
        insertImageFile(file);
        return true;
      },
      handleDrop: (_view, event) => {
        const file = [...((event as DragEvent).dataTransfer?.files ?? [])].find((f) => f.type.startsWith("image/"));
        if (!file) return false;
        event.preventDefault();
        insertImageFile(file);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      // Typed or pasted {{answer}} becomes a cloze immediately.
      if (clozeRef.current && hasBareCloze(editor.getText())) {
        editor.commands.setContent(normalizeCloze(editor.getHTML()), false);
        editor.commands.focus("end");
      }
      onChange(editor.isEmpty ? "" : editor.getHTML());
    },
  });

  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;
  async function insertImageFile(file: Blob) {
    try {
      const { dataUrl } = await imageToDataUrl(file);
      editorRef.current?.chain().focus().setImage({ src: dataUrl }).run();
    } catch (e) {
      ui.toast((e as Error).message, "error");
    }
  }

  // Keep external value changes in sync (e.g. "save and add another" clears fields).
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) editor.commands.setContent(value || "", false);
  }, [value, editor]);

  const [mathOpen, setMathOpen] = useState<{ latex: string; pos: number | null } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onEdit = (e: Event) => setMathOpen((e as CustomEvent).detail);
    dom.addEventListener("edit-math", onEdit);
    return () => dom.removeEventListener("edit-math", onEdit);
  }, [editor]);

  if (!editor) return <div className="rte rte--loading" style={{ minHeight }} />;

  const B = ({ on, title, children, active, disabled }: { on: () => void; title: string; children: ReactNode; active?: boolean; disabled?: boolean }) => (
    <button
      type="button"
      className={`rte__btn${active ? " active" : ""}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
    >
      {children}
    </button>
  );
  const hasSelection = !editor.state.selection.empty;

  const readAloud = async () => {
    const { from, to, empty } = editor.state.selection;
    const text = empty ? speechTextFromHtml(editor.getHTML(), true) : editor.state.doc.textBetween(from, to, " ");
    try {
      await speak(text, ttsLang);
    } catch (e) {
      ui.toast((e as Error).message, "error");
    }
  };

  return (
    <div className="rte">
      <div className="rte__toolbar" role="toolbar" aria-label="Formatação">
        <B title="Negrito (Ctrl+B)" active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()}>
          <Bold />
        </B>
        <B title="Itálico (Ctrl+I)" active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()}>
          <Italic />
        </B>
        <B title="Sublinhado (Ctrl+U)" active={editor.isActive("underline")} on={() => editor.chain().focus().toggleUnderline().run()}>
          <UIcon />
        </B>
        <B title="Tachado" active={editor.isActive("strike")} on={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough />
        </B>
        <ColorMenu
          icon={<Highlighter />}
          title="Realce e cor"
          colors={HIGHLIGHTS}
          active={editor.isActive("highlight")}
          onPick={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
          onClear={() => editor.chain().focus().unsetHighlight().run()}
        />
        <ColorMenu icon={<Baseline />} title="Cor do texto" colors={TEXT_COLORS} onPick={(c) => editor.chain().focus().setColor(c).run()} onClear={() => editor.chain().focus().unsetColor().run()} />
        <span className="rte__sep" />
        <B title="Título" active={editor.isActive("heading")} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 />
        </B>
        <B title="Lista com marcadores" active={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()}>
          <List />
        </B>
        <B title="Lista numerada" active={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered />
        </B>
        <B title="Subscrito" active={editor.isActive("subscript")} on={() => editor.chain().focus().toggleSubscript().run()}>
          <SubIcon />
        </B>
        <B title="Sobrescrito" active={editor.isActive("superscript")} on={() => editor.chain().focus().toggleSuperscript().run()}>
          <SupIcon />
        </B>
        <B title="Código" active={editor.isActive("codeBlock")} on={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code2 />
        </B>
        <B title="Link" active={editor.isActive("link")} on={() => setLinkOpen(true)}>
          <Link2 />
        </B>
        <span className="rte__sep" />
        <B title="Fórmula LaTeX" on={() => setMathOpen({ latex: "", pos: null })}>
          <Sigma />
        </B>
        {cloze && (
          <B title="Cloze — oculta a seleção (Ctrl+Shift+C) ou digite {{resposta}}" active={editor.isActive("cloze")} disabled={!hasSelection && !editor.isActive("cloze")} on={() => editor.chain().focus().toggleCloze().run()}>
            <Brackets />
            <span className="rte__btn-label">Cloze</span>
          </B>
        )}
        <B
          title="Anexar imagem"
          on={async () => {
            try {
              insertImageFile(await pickFile("image/*"));
            } catch {
              /* cancelled */
            }
          }}
        >
          <ImagePlus />
        </B>
        <B title="Buscar imagem" on={() => setSearchOpen(true)}>
          <Search />
        </B>
        <B title="Desenhar (tela)" on={() => setCanvasOpen(true)}>
          <PenLine />
        </B>
        <B title={hasSelection ? "Marcar trecho para leitura em voz alta" : "Ouvir"} active={editor.isActive("speak")} on={() => (hasSelection ? editor.chain().focus().toggleSpeak().run() : readAloud())}>
          <Volume2 />
        </B>
        <span className="rte__sep" />
        <B title="Alinhar à esquerda" active={editor.isActive({ textAlign: "left" })} on={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft />
        </B>
        <B title="Centralizar" active={editor.isActive({ textAlign: "center" })} on={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter />
        </B>
        <B title="Alinhar à direita" active={editor.isActive({ textAlign: "right" })} on={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight />
        </B>
        <B title="Limpar formatação" on={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          <Eraser />
        </B>
      </div>
      <EditorContent editor={editor} />
      {mathOpen && (
        <MathDialog
          initial={mathOpen.latex}
          onClose={() => setMathOpen(null)}
          onSave={(latex) => {
            if (mathOpen.pos !== null && mathOpen.pos !== undefined) {
              editor.chain().focus().setNodeSelection(mathOpen.pos).deleteSelection().insertMath(latex).run();
            } else editor.chain().focus().insertMath(latex).run();
            setMathOpen(null);
          }}
        />
      )}
      {linkOpen && (
        <LinkDialog
          initial={editor.getAttributes("link").href ?? ""}
          onClose={() => setLinkOpen(false)}
          onSave={(href) => {
            if (!href) editor.chain().focus().extendMarkRange("link").unsetLink().run();
            else if (editor.state.selection.empty && !editor.isActive("link")) editor.chain().focus().insertContent(`<a href="${href}">${href}</a>`).run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
            setLinkOpen(false);
          }}
        />
      )}
      {searchOpen && (
        <ImageSearchDialog
          onClose={() => setSearchOpen(false)}
          onPick={(dataUrl) => {
            editor.chain().focus().setImage({ src: dataUrl }).run();
            setSearchOpen(false);
          }}
        />
      )}
      {canvasOpen && (
        <CanvasDialog
          onClose={() => setCanvasOpen(false)}
          onSave={(dataUrl) => {
            editor.chain().focus().setImage({ src: dataUrl }).run();
            setCanvasOpen(false);
          }}
        />
      )}
      <ImageInsertHint />
    </div>
  );
}

function ImageInsertHint() {
  return (
    <div className="rte__hint">
      <ImageUp size={14} /> Cole ou arraste imagens aqui
    </div>
  );
}

function ColorMenu({ icon, title, colors, onPick, onClear, active }: { icon: ReactNode; title: string; colors: string[]; onPick: (c: string) => void; onClear: () => void; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="rte__color" ref={ref}>
      <button type="button" className={`rte__btn${active ? " active" : ""}`} title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>
        {icon}
      </button>
      {open && (
        <div className="rte__palette" onMouseDown={(e) => e.preventDefault()}>
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              className="color-cell"
              style={{ background: c }}
              aria-label={c}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
            />
          ))}
          <button
            type="button"
            className="rte__btn"
            title="Remover"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            <Eraser />
          </button>
        </div>
      )}
    </div>
  );
}

function MathDialog({ initial, onSave, onClose }: { initial: string; onSave: (latex: string) => void; onClose: () => void }) {
  const [latex, setLatex] = useState(initial);
  const preview = (() => {
    try {
      return katex.renderToString(latex || "\\text{Prévia}", { throwOnError: true, displayMode: true });
    } catch (e) {
      return `<span class="error-text">${(e as Error).message.replace(/</g, "&lt;")}</span>`;
    }
  })();
  return (
    <Modal
      open
      onClose={onClose}
      title="Fórmula LaTeX"
      description="Ex.: \\frac{a}{b}, x^2, \\sqrt{x}, \\int_0^1 f(x)\\,dx"
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" disabled={!latex.trim()} onClick={() => onSave(latex.trim())}>
            Inserir
          </button>
        </>
      }
    >
      <textarea className="textarea input--mono" data-autofocus style={{ minHeight: 90, fontFamily: "var(--font-mono)" }} value={latex} onChange={(e) => setLatex(e.target.value)} />
      <div className="math-preview" dangerouslySetInnerHTML={{ __html: preview }} />
    </Modal>
  );
}

function LinkDialog({ initial, onSave, onClose }: { initial: string; onSave: (href: string) => void; onClose: () => void }) {
  const [href, setHref] = useState(initial);
  const normalized = href.trim() && !/^[a-z]+:/i.test(href.trim()) ? `https://${href.trim()}` : href.trim();
  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar link"
      footer={
        <>
          {initial && (
            <button className="btn btn--danger-ghost" onClick={() => onSave("")}>
              Remover link
            </button>
          )}
          <button className="btn btn--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" disabled={!href.trim()} onClick={() => onSave(normalized)}>
            Salvar
          </button>
        </>
      }
    >
      <input className="input" data-autofocus placeholder="https://…" value={href} onChange={(e) => setHref(e.target.value)} onKeyDown={(e) => e.key === "Enter" && href.trim() && onSave(normalized)} />
    </Modal>
  );
}
