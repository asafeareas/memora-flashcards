import katex from "katex";
import type { Note } from "../db/types";
import { renderCloze } from "./notes";

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "del", "sub", "sup", "mark", "span", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "blockquote", "pre", "code", "img", "div", "table", "thead", "tbody", "tr", "td", "th", "hr",
]);
const ALLOWED_ATTRS = new Set(["href", "src", "alt", "title", "style", "class", "data-cloze", "data-hint", "data-latex", "data-speak", "data-color", "colspan", "rowspan", "target", "rel"]);

/** Removes scripts, event handlers and unknown tags from imported or generated HTML. */
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        if (["script", "style", "iframe", "object", "embed", "link", "meta"].includes(tag)) child.remove();
        else child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        const v = attr.value.trim().toLowerCase();
        if (!ALLOWED_ATTRS.has(name) || ((name === "href" || name === "src") && (v.startsWith("javascript:") || (name === "src" && !(v.startsWith("data:image/") || v.startsWith("http") || v.startsWith("blob:")))))) {
          child.removeAttribute(attr.name);
        }
      }
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

export interface Faces {
  front: string;
  back: string;
  /** Back shows the front content too (cloze/reverse context) */
  backIncludesFront: boolean;
}

export function renderFaces(note: Note, variant: string): Faces {
  if (note.type === "cloze") {
    const idx = Number(variant.replace(/^c/, "")) || 1;
    const extra = note.back ? `<div class="card-extra">${note.back}</div>` : "";
    return { front: renderCloze(note.front, idx, "front"), back: renderCloze(note.front, idx, "back") + extra, backIncludesFront: true };
  }
  if (variant === "reverse") return { front: note.back, back: note.front, backIncludesFront: false };
  return { front: note.front, back: note.back, backIncludesFront: false };
}

/** Renders every [data-latex] element inside a container with KaTeX. */
export function renderMathIn(el: HTMLElement | null) {
  if (!el) return;
  el.querySelectorAll<HTMLElement>("[data-latex]").forEach((n) => {
    if (n.dataset.rendered === "1") return;
    try {
      katex.render(n.dataset.latex ?? "", n, { throwOnError: false });
      n.dataset.rendered = "1";
    } catch {
      /* keep raw */
    }
  });
}
