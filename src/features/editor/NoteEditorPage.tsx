import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Repeat2, Keyboard, Trash2, Info } from "lucide-react";
import { db } from "../../db/db";
import type { NoteType, OcclusionData } from "../../db/types";
import { RichEditor } from "../../editor/RichEditor";
import { OcclusionBuilder } from "../../editor/OcclusionBuilder";
import { Segmented, Switch } from "../../ui/controls";
import { useUi } from "../../ui/UiProvider";
import { deleteNotes, findDuplicate, rootDeck, saveNote } from "../../db/repo";
import { clozeIndices, stripHtml } from "../../domain/notes";
import { NotFoundPage } from "../shell/NotFoundPage";
import { CardInfoDialog } from "../deck/CardInfoDialog";

export function NoteEditorPage() {
  const { id: deckId, noteId } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const ui = useUi();
  const data = useLiveQuery(async () => {
    const deck = deckId ? await db.decks.get(deckId) : undefined;
    const note = noteId ? await db.notes.get(noteId) : undefined;
    const root = deckId ? await rootDeck(deckId) : undefined;
    return { deck, note, root };
  }, [deckId, noteId]);

  const [type, setType] = useState<NoteType>("basic");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [reversed, setReversed] = useState(false);
  const [typeIn, setTypeIn] = useState(false);
  const [occlusion, setOcclusion] = useState<OcclusionData | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState(false);
  const returnTo = (loc.state as { returnTo?: string } | null)?.returnTo;

  useEffect(() => {
    if (!data || loaded) return;
    if (data.note) {
      setType(data.note.type);
      setFront(data.note.front);
      setBack(data.note.back);
      setReversed(!!data.note.reversed);
      setTypeIn(!!data.note.typeIn);
      setOcclusion(data.note.occlusion);
    } else {
      const last = sessionStorage.getItem("memora:lastNoteType") as NoteType | null;
      if (last) setType(last);
    }
    setLoaded(true);
  }, [data, loaded]);

  const deck = data?.deck;
  const settings = data?.root?.settings ?? deck?.settings;
  const archived = !!deck?.archivedAt;
  const clozeCount = useMemo(() => clozeIndices(front).length, [front]);

  const validation = (() => {
    if (type === "basic") {
      if (!stripHtml(front) && !front.includes("<img") && !front.includes("data-latex")) return "Preencha a frente do cartão.";
      if (!stripHtml(back) && !back.includes("<img") && !back.includes("data-latex")) return "Preencha o verso do cartão.";
    }
    if (type === "cloze" && clozeCount === 0) return "Selecione um trecho e use Cloze (ou digite {{resposta}}) para criar ao menos uma lacuna.";
    if (type === "occlusion") {
      if (!occlusion) return "Envie uma imagem.";
      if (!occlusion.masks.length) return "Desenhe ao menos uma área sobre a imagem.";
    }
    return null;
  })();

  if (!data) return null;
  if (!deck || deck.deletedAt) return <NotFoundPage title="Deck não encontrado" />;
  if (noteId && !data.note) return <NotFoundPage title="Cartão não encontrado" />;

  const back2 = returnTo ?? `/deck/${deck.id}?tab=cards`;

  const save = async (another: boolean) => {
    if (validation || saving || archived) {
      if (validation) ui.toast(validation, "error");
      return;
    }
    setSaving(true);
    try {
      const dup = !noteId && type !== "occlusion" ? await findDuplicate(deck.id, front) : undefined;
      const id = await saveNote({ id: noteId, deckId: deck.id, type, front, back, reversed: type === "basic" ? reversed : undefined, typeIn, occlusion: type === "occlusion" ? occlusion : undefined });
      sessionStorage.setItem("memora:lastNoteType", type);
      if (dup) ui.toast("Possível duplicata encontrada neste deck", "info", { label: "Ver cartão", run: () => nav(`/deck/${deck.id}/note/${dup.id}`) });
      else ui.toast(noteId ? "Cartão atualizado" : "Cartão adicionado", "success");
      if (another) {
        setFront("");
        setBack("");
        setOcclusion(type === "occlusion" ? undefined : occlusion);
        if (noteId) nav(`/deck/${deck.id}/add`, { replace: true });
      } else nav(back2, { replace: !!noteId });
      return id;
    } catch (e) {
      ui.toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!noteId) return;
    if (!(await ui.confirm({ title: "Excluir cartão?", message: "Tem certeza de que deseja excluir este cartão? O progresso dele será perdido.", confirmLabel: "Excluir", danger: true }))) return;
    await deleteNotes([noteId]);
    ui.toast("Cartão excluído", "success");
    nav(back2, { replace: true });
  };

  return (
    <div className="narrow editor-page">
      <div className="breadcrumb">
        <Link to={back2} className="icon-btn icon-btn--sm icon-btn--bordered" aria-label="Voltar">
          <ArrowLeft />
        </Link>
        <Link to={`/deck/${deck.id}`}>{deck.name}</Link>/<span className="current">{noteId ? "Editar cartão" : "Novo cartão"}</span>
      </div>
      <div className="page-head">
        <h1>{noteId ? "Editar cartão" : "Adicionar novo cartão"}</h1>
        {noteId && (
          <div className="page-head__actions">
            <button className="btn btn--ghost" onClick={() => setInfo(true)}>
              <Info /> Histórico
            </button>
            <button className="btn btn--danger-ghost" onClick={remove}>
              <Trash2 /> Excluir
            </button>
          </div>
        )}
      </div>
      {archived && <div className="banner">Este deck está arquivado. Restaure-o para editar cartões.</div>}

      <div className="editor-type">
        <Segmented
          value={type}
          onChange={(t) => !noteId && setType(t)}
          options={[
            { value: "basic", label: "Básico" },
            { value: "cloze", label: "Cloze (lacunas)" },
            { value: "occlusion", label: "Oclusão de imagem" },
          ]}
        />
        {noteId && <span className="hint">O tipo não pode ser alterado depois de criado.</span>}
      </div>

      {type === "basic" && (
        <>
          <div className="editor-field">
            <div className="label">Frente</div>
            <RichEditor value={front} onChange={setFront} placeholder="Pergunta, termo ou palavra" autoFocus ttsLang={settings?.tts.frontLang} onSubmit={() => save(!noteId)} label="Frente" />
          </div>
          <div className="editor-field">
            <div className="label">Verso</div>
            <RichEditor value={back} onChange={setBack} placeholder="Resposta, definição ou tradução" ttsLang={settings?.tts.backLang} onSubmit={() => save(!noteId)} label="Verso" />
          </div>
          <div className="editor-options panel">
            <label className="option-line">
              <Repeat2 />
              <div>
                <strong>Criar cartão reverso</strong>
                <div className="hint" style={{ padding: 0 }}>
                  Estude também do verso para a frente{settings?.reverse ? " (o deck já está no modo reverso)" : ""}.
                </div>
              </div>
              <Switch checked={reversed || !!settings?.reverse} onChange={setReversed} label="Cartão reverso" />
            </label>
            <label className="option-line">
              <Keyboard />
              <div>
                <strong>Digitar a resposta</strong>
                <div className="hint" style={{ padding: 0 }}>
                  No estudo, você escreve a resposta antes de ver o verso.
                </div>
              </div>
              <Switch checked={typeIn} onChange={setTypeIn} label="Digitar a resposta" />
            </label>
          </div>
        </>
      )}

      {type === "cloze" && (
        <>
          <div className="editor-field">
            <div className="label">
              Texto com lacunas {clozeCount > 0 && <span className="badge">{clozeCount} cartão(ões)</span>}
            </div>
            <RichEditor value={front} onChange={setFront} cloze placeholder="Escreva o texto, selecione um trecho e clique em Cloze — ou digite {{resposta}}" autoFocus ttsLang={settings?.tts.frontLang} onSubmit={() => save(!noteId)} label="Texto com lacunas" />
          </div>
          <div className="editor-field">
            <div className="label">Extra (aparece no verso, opcional)</div>
            <RichEditor value={back} onChange={setBack} placeholder="Explicação, fonte, imagem…" ttsLang={settings?.tts.backLang} minHeight={80} onSubmit={() => save(!noteId)} label="Extra" />
          </div>
          <div className="editor-options panel">
            <label className="option-line">
              <Keyboard />
              <div>
                <strong>Digitar a resposta</strong>
              </div>
              <Switch checked={typeIn} onChange={setTypeIn} label="Digitar a resposta" />
            </label>
          </div>
        </>
      )}

      {type === "occlusion" && (
        <>
          <OcclusionBuilder value={occlusion} onChange={setOcclusion} />
          <div className="editor-field">
            <div className="label">Pergunta (opcional)</div>
            <RichEditor value={front} onChange={setFront} placeholder="Ex.: Identifique a estrutura" minHeight={60} label="Pergunta" />
          </div>
          <div className="editor-field">
            <div className="label">Extra no verso (opcional)</div>
            <RichEditor value={back} onChange={setBack} placeholder="Explicação" minHeight={60} label="Extra" />
          </div>
        </>
      )}

      <div className="editor-actions">
        <span className="hint hide-mobile">Ctrl+Enter para salvar</span>
        <Link to={back2} className="btn btn--secondary">
          Cancelar
        </Link>
        {!noteId && (
          <button className="btn btn--outline" disabled={!!validation || saving || archived} onClick={() => save(true)}>
            Salvar e adicionar outro
          </button>
        )}
        <button className="btn btn--primary" disabled={!!validation || saving || archived} onClick={() => save(false)} title={validation ?? undefined}>
          {noteId ? "Salvar alterações" : "Salvar"}
        </button>
      </div>
      {info && noteId && <CardInfoDialog noteId={noteId} onClose={() => setInfo(false)} />}
    </div>
  );
}
