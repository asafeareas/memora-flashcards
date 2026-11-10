import { useEffect, useState } from "react";
import { HardDrive, ShieldCheck, ShieldAlert, Download, Upload, FileCheck2, Unlink, KeyRound, Eye, EyeOff, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { useSetting } from "../../hooks/useData";
import type { ThemeSetting } from "../../hooks/useTheme";
import { SettingRow } from "../../ui/controls";
import { useUi } from "../../ui/UiProvider";
import {
  afterRestore,
  backupFileName,
  backupNow,
  chooseBackupFile,
  disableAutoBackup,
  downloadJson,
  exportAll,
  fileBackupSupported,
  importAll,
  pickBackupFile,
  reconnectBackupFile,
  requestPersistentStorage,
  storageStatus,
  subscribeAutoBackup,
  type AutoBackupState,
} from "../../domain/backup";
import { formatDateTime, formatRelative } from "../../domain/format";
import { db } from "../../db/db";
import { plural } from "../../domain/format";

const THEMES: { v: ThemeSetting; label: string; swatch: string[] }[] = [
  { v: "system", label: "Sistema", swatch: ["#ffffff", "#1b1d24"] },
  { v: "light", label: "Claro", swatch: ["#ffffff", "#5b54e8"] },
  { v: "dark", label: "Escuro", swatch: ["#1b1d24", "#7c76ff"] },
  { v: "amber", label: "Âmbar", swatch: ["#fffcf7", "#d9741c"] },
  { v: "rose", label: "Rosa", swatch: ["#ffffff", "#e0447f"] },
];

export function AppSettingsPage() {
  const ui = useUi();
  const [theme, setTheme] = useSetting<ThemeSetting>("theme", "system");
  const [apiKey, setApiKey] = useSetting<string>("aiApiKey", "");
  const [keyDraft, setKeyDraft] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [backup, setBackup] = useState<AutoBackupState | null>(null);
  const [storage, setStorage] = useState<{ persisted: boolean; usage: number; quota: number } | null>(null);

  useEffect(() => {
    const off = subscribeAutoBackup(setBackup);
    storageStatus().then(setStorage);
    return () => {
      off();
    };
  }, []);

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  const restore = async () => {
    try {
      const b = await pickBackupFile();
      const ok = await ui.confirm({ title: "Restaurar backup?", message: `Backup de ${formatDateTime(b.exportedAt)} com ${plural(b.data.decks.length, "deck", "decks")} e ${plural(b.data.notes.length, "cartão", "cartões")}. Os dados atuais deste navegador serão substituídos.`, confirmLabel: "Restaurar", danger: true });
      if (!ok) return;
      await importAll(b);
      await afterRestore();
      ui.toast("Backup restaurado", "success");
    } catch (e) {
      if ((e as Error).name !== "AbortError" && (e as Error).message !== "Nenhum arquivo selecionado") ui.toast((e as Error).message, "error");
    }
  };

  return (
    <div className="narrow">
      <div className="page-head">
        <div>
          <h1>Configurações</h1>
          <div className="sub">Todas as funções estão liberadas — sem planos, sem limites e sem conta.</div>
        </div>
      </div>

      <div className="setting-group__title">Aparência</div>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button key={t.v} className={`theme-cell${theme === t.v ? " active" : ""}`} onClick={() => setTheme(t.v)}>
            <span className="theme-cell__swatch" style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)` }} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="setting-group__title" id="data">
        Seus dados
      </div>
      <div className="setting-group">
        <SettingRow
          title="Armazenamento persistente"
          description={
            storage?.persisted
              ? `Protegido: o navegador não apaga os dados por falta de espaço. Em uso: ${mb(storage.usage)}.`
              : "O navegador ainda pode apagar os dados se faltar espaço. Clique para pedir proteção."
          }
          onClick={async () => {
            const ok = await requestPersistentStorage();
            setStorage(await storageStatus());
            ui.toast(ok ? "Armazenamento persistente ativado" : "O navegador não concedeu o armazenamento persistente. Use o backup automático em arquivo.", ok ? "success" : "info");
          }}
        >
          {storage?.persisted ? <ShieldCheck color="var(--success)" /> : <ShieldAlert color="var(--warning)" />}
        </SettingRow>
        {fileBackupSupported() ? (
          backup?.enabled ? (
            <>
              <SettingRow
                title={`Backup automático em arquivo: ${backup.fileName}`}
                description={
                  backup.needsPermission
                    ? "O navegador pediu sua confirmação para continuar gravando no arquivo."
                    : backup.lastSavedAt
                      ? `Salvo automaticamente ${formatRelative(backup.lastSavedAt)} — a cada alteração. Esse arquivo fica no seu disco, fora do navegador.`
                      : "Ativo."
                }
              >
                {backup.needsPermission ? (
                  <button className="btn btn--primary btn--sm" onClick={reconnectBackupFile}>
                    Permitir
                  </button>
                ) : (
                  <button className="btn btn--secondary btn--sm" onClick={() => backupNow().then(() => ui.toast("Backup salvo", "success"))}>
                    Salvar agora
                  </button>
                )}
              </SettingRow>
              <SettingRow title="Trocar arquivo de backup" onClick={() => chooseBackupFile().catch(() => undefined)}>
                <FileCheck2 size={18} className="muted-icon" />
              </SettingRow>
              <SettingRow title="Desativar backup automático" onClick={async () => (await ui.confirm({ title: "Desativar o backup automático?", message: "O arquivo existente continua no disco, mas não será mais atualizado.", confirmLabel: "Desativar" })) && disableAutoBackup()}>
                <Unlink size={18} className="muted-icon" />
              </SettingRow>
            </>
          ) : (
            <SettingRow
              title="Ativar backup automático em arquivo (recomendado)"
              description="Escolha um arquivo no seu computador. O Memora grava uma cópia completa nele a cada alteração — mesmo que você limpe os dados do navegador, seus decks continuam nesse arquivo."
              onClick={async () => {
                try {
                  await chooseBackupFile();
                  ui.toast("Backup automático ativado", "success");
                } catch (e) {
                  if ((e as Error).name !== "AbortError") ui.toast((e as Error).message, "error");
                }
              }}
            >
              <HardDrive size={18} className="muted-icon" />
            </SettingRow>
          )
        ) : (
          <SettingRow title="Backup automático em arquivo" description="Disponível no Chrome e no Edge para computador. Neste navegador, exporte o backup manualmente com frequência." />
        )}
        <SettingRow
          title="Exportar backup completo"
          description="Baixa um arquivo .json com todos os decks, cartões, imagens, progresso e configurações."
          onClick={async () => {
            downloadJson(await exportAll(), backupFileName());
            ui.toast("Backup exportado", "success");
          }}
        >
          <Download size={18} className="muted-icon" />
        </SettingRow>
        <SettingRow title="Restaurar backup" description="Substitui os dados deste navegador pelos de um arquivo de backup." onClick={restore}>
          <Upload size={18} className="muted-icon" />
        </SettingRow>
        <SettingRow
          title="Apagar todos os dados"
          danger
          description="Remove todos os decks, cartões e o histórico deste navegador."
          onClick={async () => {
            const ok = await ui.confirm({ title: "Apagar todos os dados?", message: "Isso não pode ser desfeito. Exporte um backup antes se quiser guardar uma cópia.", confirmLabel: "Apagar tudo", danger: true });
            if (!ok) return;
            await Promise.all([db.decks.clear(), db.folders.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear()]);
            ui.toast("Dados apagados", "success");
          }}
        >
          <Trash2 size={18} color="var(--danger)" />
        </SettingRow>
      </div>

      <div className="setting-group__title" id="ai">
        Inteligência artificial
      </div>
      <div className="setting-group">
        <div className="setting-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div>
            <div className="setting-row__title">
              <KeyRound size={16} style={{ verticalAlign: -3 }} /> Chave de API da Anthropic
            </div>
            <div className="setting-row__desc">
              Usada para gerar cartões com IA ({apiKey ? "configurada" : "não configurada"}). Ela fica salva somente neste navegador, não entra nos backups e é enviada apenas para a API da Anthropic. Crie uma chave em console.anthropic.com.
            </div>
          </div>
          <div className="key-row">
            <input
              className="input"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              placeholder={apiKey ? "•••••••••••• (salva)" : "sk-ant-…"}
              value={keyDraft ?? ""}
              onChange={(e) => setKeyDraft(e.target.value)}
              aria-label="Chave de API"
            />
            <button className="icon-btn icon-btn--bordered" aria-label={showKey ? "Ocultar" : "Mostrar"} onClick={() => setShowKey((v) => !v)}>
              {showKey ? <EyeOff /> : <Eye />}
            </button>
            <button
              className="btn btn--primary"
              disabled={!keyDraft?.trim() || testing}
              onClick={async () => {
                setTesting(true);
                try {
                  const { testApiKey } = await import("../../domain/ai");
                  await testApiKey(keyDraft!.trim());
                  await setApiKey(keyDraft!.trim());
                  setKeyDraft(null);
                  ui.toast("Chave verificada e salva", "success");
                } catch (e) {
                  ui.toast((e as Error).message, "error");
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? <Loader2 className="spin" /> : <CheckCircle2 />} Verificar e salvar
            </button>
          </div>
          {apiKey && (
            <button className="btn btn--danger-ghost btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setApiKey("").then(() => ui.toast("Chave removida", "success"))}>
              Remover chave
            </button>
          )}
        </div>
      </div>

      <div className="setting-group__title">Atalhos de teclado</div>
      <div className="setting-group shortcuts">
        <SettingRow title="Mostrar resposta" description="No estudo">
          <kbd>Espaço</kbd>
        </SettingRow>
        <SettingRow title="Errei · Difícil · Bom · Fácil">
          <span>
            <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd>
          </span>
        </SettingRow>
        <SettingRow title="Editar cartão / ouvir" description="No estudo">
          <span>
            <kbd>E</kbd> <kbd>R</kbd>
          </span>
        </SettingRow>
        <SettingRow title="Salvar cartão" description="No editor">
          <kbd>Ctrl + Enter</kbd>
        </SettingRow>
        <SettingRow title="Criar lacuna (cloze)" description="Selecione o texto, ou digite {{resposta}}">
          <kbd>Ctrl + Shift + C</kbd>
        </SettingRow>
      </div>

      <p className="hint" style={{ textAlign: "center", marginTop: 28 }}>
        Memora 1.0 · local-first · dados guardados neste dispositivo
      </p>
    </div>
  );
}
