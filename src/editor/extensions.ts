import { Mark, Node, InputRule, mergeAttributes } from "@tiptap/core";
import katex from "katex";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    cloze: {
      /** Wraps the selection in a new cloze (next index) or removes it. */
      toggleCloze: (opts?: { sameIndex?: boolean }) => ReturnType;
    };
    math: {
      insertMath: (latex: string) => ReturnType;
    };
    speak: {
      toggleSpeak: () => ReturnType;
    };
  }
}

/** Highest cloze index currently in the document. */
function maxClozeIndex(doc: import("@tiptap/pm/model").Node): number {
  let max = 0;
  doc.descendants((node) => {
    node.marks.forEach((m) => {
      if (m.type.name === "cloze") max = Math.max(max, Number(m.attrs.n) || 0);
    });
  });
  return max;
}

export const Cloze = Mark.create({
  name: "cloze",
  inclusive: false,
  addAttributes() {
    return {
      n: {
        default: 1,
        parseHTML: (el) => Number(el.getAttribute("data-cloze")) || 1,
        renderHTML: (a) => ({ "data-cloze": a.n }),
      },
      hint: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-hint"),
        renderHTML: (a) => (a.hint ? { "data-hint": a.hint } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-cloze]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "cloze-mark" }), 0];
  },
  addCommands() {
    return {
      toggleCloze:
        (opts) =>
        ({ state, commands }) => {
          if (state.selection.empty) return false;
          if (state.doc.rangeHasMark(state.selection.from, state.selection.to, state.schema.marks.cloze)) return commands.unsetMark(this.name);
          const max = maxClozeIndex(state.doc);
          const n = opts?.sameIndex ? Math.max(1, max) : max + 1;
          return commands.setMark(this.name, { n });
        },
    };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-c": () => this.editor.commands.toggleCloze(),
      "Mod-Alt-Shift-c": () => this.editor.commands.toggleCloze({ sameIndex: true }),
    };
  },
  addInputRules() {
    // Typing {{answer}} turns "answer" into the next cloze.
    return [
      new InputRule({
        find: /\{\{([^{}]+)\}\}$/,
        handler: ({ state, range, match }) => {
          const text = match[1];
          const n = maxClozeIndex(state.doc) + 1;
          const tr = state.tr;
          tr.insertText(text, range.from, range.to);
          tr.addMark(range.from, range.from + text.length, state.schema.marks.cloze.create({ n }));
          tr.removeStoredMark(state.schema.marks.cloze);
        },
      }),
    ];
  },
});

/** Marks a fragment to be read aloud by text-to-speech. */
export const Speak = Mark.create({
  name: "speak",
  inclusive: false,
  parseHTML() {
    return [{ tag: "span[data-speak]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-speak": "1", class: "speak-mark" }), 0];
  },
  addCommands() {
    return {
      toggleSpeak:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});

export const MathInline = Node.create({
  name: "math",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-latex") ?? "",
        renderHTML: (a) => ({ "data-latex": a.latex }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-latex]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "math" })];
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("span");
      dom.className = "math math--editor";
      dom.contentEditable = "false";
      try {
        katex.render(node.attrs.latex || "\\square", dom, { throwOnError: false });
      } catch {
        dom.textContent = node.attrs.latex;
      }
      dom.title = "Clique duas vezes para editar a fórmula";
      dom.addEventListener("dblclick", () => {
        const pos = typeof getPos === "function" ? getPos() : null;
        editor.view.dom.dispatchEvent(new CustomEvent("edit-math", { detail: { latex: node.attrs.latex, pos }, bubbles: true }));
      });
      return { dom };
    };
  },
  addCommands() {
    return {
      insertMath:
        (latex) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    };
  },
});
