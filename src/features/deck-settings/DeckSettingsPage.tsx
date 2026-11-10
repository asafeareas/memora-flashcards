import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Brain, Volume2, Type, Repeat2, Shuffle, Download, Upload, Layers, FolderInput, Archive, RotateCcw, Trash2, Pencil, CalendarDays, Copy } from "lucide-react";
import { useDeck, useLibrary } from "../../hooks/useData";
import { SettingRow, Switch } from "../../ui/controls";
import { Modal } from "../../ui/Modal";
import { useUi } from "../../ui/UiProvider";
import { resetDeckProgress, updateDeckSettings } from "../../db/repo";
import { useDeckActions } from "../home/deckUi";
import { NotFoundPage } from "../shell/NotFoundPage";
import { ALGORITHM_LABEL } from "./algorithmLabels";
import { exportDeckCsv, exportDeckJson } from "../../domain/exporters";
import { downloadBlob, downloadJson } from "../../domain/backup";

export function DeckSettingsPage() {
  const { id } = useParams();
  const data = useDeck(id);
  const lib = useLibrary();
  const ui = useUi();
  const nav = useNavigate();
  const actions = useDeckActions();
  const [cpdOpen, setCpdOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  if (data === undefined) return null;
  if (!data || data.deck.deletedAt) return <NotFoundPage title="Deck não encontrado" />;
  const { deck, root, chain } = data;
  const s = deck.settings;
  const isSub = chain.length > 0;
  const algo = root.settings.algorithm;

  return (
    <div className="narrow">
      <div className="breadcrumb">
        <Link to={`/deck/${deck.id}`} className="icon-btn icon-btn--sm icon-btn--bordered" aria-label="Voltar">
          <ArrowLeft />
        </Link>
        <Link to={`/deck/${deck.id}`}>{deck.name}</Link>/<span className="current">Configurações</span>
      </div>
      <div className="page-head">
        <h1>Configurações</h1>
      </div>

      <div className="setting-group__title">Estudo</div>
      <div className="setting-group">
        <SettingRow
          title="Algoritmo de aprendizagem"
          description={isSub ? "Subdecks usam o algoritmo do deck principal." : ALGORITHM_LABEL[algo]}
          onClick={() => (isSub ? ui.toast("Para alterar o algoritmo, vá até o deck principal.", "info") : nav(`/deck/${deck.id}/settings/algorithm`))}
        >
          <span className="value">
            <Brain size={18} /> <ChevronRight size={18} />
          </span>
        </SettingRow>
        {algo !== "speed" && (
          <SettingRow title="Novos cartões por dia" description="Quantos cartões novos entram por dia. Comece com pouco." onClick={() => setCpdOpen(true)}>
            <span className="value">
              <CalendarDays size={18} /> {s.newPerDay} <ChevronRight size={18} />
            </span>
          </SettingRow>
        )}
        <SettingRow title="Embaralhar cartões" description="Mostra os cartões em ordem aleatória.">
          <Shuffle size={18} className="muted-icon" />
          <Switch checked={s.shuffle} onChange={(v) => updateDeckSettings(deck.id, { shuffle: v })} label="Embaralhar" />
        </SettingRow>
        <SettingRow title="Cartões reversos" description="Estude nos dois sentidos: cada cartão básico também é perguntado do verso para a frente. Cloze e oclusão não são revertidos.">
          <Repeat2 size={18} className="muted-icon" />
          <Switch
            checked={s.reverse}
            onChange={async (v) => {
              await updateDeckSettings(deck.id, { reverse: v });
              ui.toast(v ? "Modo reverso ativado" : "Modo reverso desativado", "success");
            }}
            label="Cartões reversos"
          />
        </SettingRow>
        <SettingRow title="Texto para fala" description={`Frente: ${s.tts.frontLang} · Verso: ${s.tts.backLang}${s.tts.autoplay ? " · reprodução automática" : ""}`} onClick={() => nav(`/deck/${deck.id}/settings/tts`)}>
          <span className="value">
            <Volume2 size={18} /> <ChevronRight size={18} />
          </span>
        </SettingRow>
        <SettingRow title="Estilo do cartão" description="Fonte, tamanho e alinhamento do texto." onClick={() => nav(`/deck/${deck.id}/style`)}>
          <span className="value">
            <Type size={18} /> <ChevronRight size={18} />
          </span>
        </SettingRow>
      </div>

      <div className="setting-group__title">Deck</div>
      <div className="setting-group">
        <SettingRow title="Renomear e aparência" onClick={() => actions.setEditing(deck)}>
          <Pencil size={18} className="muted-icon" />
        </SettingRow>
        <SettingRow title="Adicionar subdeck" onClick={() => actions.setSubdeckOf(deck)}>
          <Layers size={18} className="muted-icon" />
        </SettingRow>
        <SettingRow title="Mover deck" onClick={() => actions.setMoving({ deck, folders: lib?.folders ?? [], decks: lib?.decks ?? [] })}>
          <FolderInput size={18} className="muted-icon" />
        </SettingRow>
        <SettingRow title="Duplicar deck" onClick={() => actions.duplicate(deck)}>
          <Copy size={18} className="muted-icon" />
        </SettingRow>
        <SettingRow title="Importar cartões" description="Cole texto, ou importe CSV, TXT ou Anki." onClick={() => nav(`/deck/${deck.id}/import`)}>
          <Upload size={18} className="muted-icon" />
        </SettingRow>
        <SettingRow title="Exportar deck" description="CSV (texto simples) ou formato completo do Memora, com imagens e progresso." onClick={() => setExportOpen(true)}>
          <Download size={18} className="muted-icon" />
        </SettingRow>
      </div>

      <div className="setting-group__title">Zona de risco</div>
      <div className="setting-group">
        <SettingRow
          title="Redefinir progresso"
          description="Todos os cartões voltam para “Não estudado”."
          onClick={async () => {
            const ok = await ui.confirm({ title: "Redefinir progresso?", message: "Todo o progresso de estudo será perdido e todos os cartões voltarão a “Não estudado”.", confirmLabel: "Redefinir", danger: true });
            if (!ok) return;
            await resetDeckProgress(deck.id);
            ui.toast("Progresso redefinido", "success");
          }}
        >
          <RotateCcw size={18} className="muted-icon" />
        </SettingRow>
        <SettingRow title="Arquivar deck" description="Tira o deck da página inicial sem excluir nada." onClick={() => actions.archive(deck)}>
          <Archive size={18} className="muted-icon" />
        </SettingRow>
        <SettingRow
          title="Excluir deck"
          danger
          onClick={async () => {
            await actions.remove(deck);
            if (data.deck.deletedAt !== null) nav("/");
          }}
        >
          <Trash2 size={18} color="var(--danger)" />
        </SettingRow>
      </div>

      {actions.dialogs}
      {cpdOpen && <CardsPerDayDialog value={s.newPerDay} onClose={() => setCpdOpen(false)} onSave={(v) => updateDeckSettings(deck.id, { newPerDay: v }).then(() => setCpdOpen(false))} />}
      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Exportar deck">
        <div className="export-options">
          <button
            className="export-option"
            onClick={async () => {
              const csv = await exportDeckCsv(deck.id);
              downloadBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${safeName(deck.name)}.csv`);
              ui.toast("CSV exportado", "success");
              setExportOpen(false);
            }}
          >
            <strong>Excel (.csv)</strong>
            <span>Exportação simples de frente e verso, sem formatação nem imagens. Fácil de levar para outros apps.</span>
          </button>
          <ExportFull deckId={deck.id} name={deck.name} onDone={() => setExportOpen(false)} />
        </div>
      </Modal>
    </div>
  );
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "deck";

function ExportFull({ deckId, name, onDone }: { deckId: string; name: string; onDone: () => void }) {
  const [progress, setProgress] = useState(true);
  const ui = useUi();
  return (
    <div className="export-option">
      <strong>Formato Memora (.json)</strong>
      <span>Exportação completa com formatação, imagens e subdecks — ideal para backup ou para compartilhar.</span>
      <label className="inline-check" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={progress} onChange={(e) => setProgress(e.target.checked)} /> Incluir progresso de estudo
      </label>
      <button
        className="btn btn--primary btn--sm"
        style={{ marginTop: 10, alignSelf: "flex-start" }}
        onClick={async () => {
          downloadJson(await exportDeckJson(deckId, progress), `${safeName(name)}.memora.json`);
          ui.toast("Deck exportado", "success");
          onDone();
        }}
      >
        Exportar
      </button>
    </div>
  );
}

export function CardsPerDayDialog({ value, onSave, onClose }: { value: number; onSave: (v: number) => void; onClose: () => void }) {
  const presets = [5, 10, 20, 30, 50];
  const [v, setV] = useState(value);
  const [custom, setCustom] = useState(!presets.includes(value));
  return (
    <Modal
      open
      onClose={onClose}
      title="Novos cartões por dia"
      description="Quantos cartões novos você quer começar a estudar por dia. É melhor começar com pouco."
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" disabled={!(v >= 0)} onClick={() => onSave(Math.round(v))}>
            Salvar
          </button>
        </>
      }
    >
      <div className="cpd-grid">
        {presets.map((p) => (
          <button
            key={p}
            className={`cpd-cell${!custom && v === p ? " active" : ""}`}
            onClick={() => {
              setV(p);
              setCustom(false);
            }}
          >
            <strong>{p}</strong>
            <span>cartões/dia</span>
            <em>{p * 30} novos/mês</em>
          </button>
        ))}
        <button className={`cpd-cell${custom ? " active" : ""}`} onClick={() => setCustom(true)}>
          <strong>…</strong>
          <span>Personalizado</span>
        </button>
      </div>
      {custom && (
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="cpd">Quantidade personalizada</label>
          <input id="cpd" className="input" type="number" min={0} max={9999} value={v} onChange={(e) => setV(Number(e.target.value))} />
        </div>
      )}
    </Modal>
  );
}
