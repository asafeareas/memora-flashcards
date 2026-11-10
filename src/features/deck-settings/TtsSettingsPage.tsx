import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Volume2 } from "lucide-react";
import { useDeck } from "../../hooks/useData";
import { updateDeckSettings } from "../../db/repo";
import { SettingRow, Switch } from "../../ui/controls";
import { TTS_LANGUAGES, loadVoices, speak, ttsSupported } from "../../domain/tts";
import { NotFoundPage } from "../shell/NotFoundPage";
import { useUi } from "../../ui/UiProvider";

const SAMPLE: Record<string, string> = { pt: "Olá! Este é um exemplo de voz.", en: "Hello! This is a voice sample.", es: "¡Hola! Este es un ejemplo de voz.", fr: "Bonjour ! Ceci est un exemple de voix.", de: "Hallo! Das ist ein Stimmbeispiel.", it: "Ciao! Questo è un esempio di voce.", ja: "こんにちは。これは音声のサンプルです。" };

export function TtsSettingsPage() {
  const { id } = useParams();
  const data = useDeck(id);
  const ui = useUi();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    loadVoices().then(setVoices);
  }, []);
  if (data === undefined) return null;
  if (!data) return <NotFoundPage title="Deck não encontrado" />;
  const { deck } = data;
  const tts = deck.settings.tts;
  const set = (patch: Partial<typeof tts>) => updateDeckSettings(deck.id, { tts: { ...tts, ...patch } });
  const hasVoice = (lang: string) => voices.some((v) => v.lang.toLowerCase().startsWith(lang.split("-")[0].toLowerCase()));
  const test = (lang: string) => speak(SAMPLE[lang.split("-")[0]] ?? "Olá!", lang).catch((e) => ui.toast((e as Error).message, "error"));

  const LangSelect = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <div className="tts-lang">
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {TTS_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
            {voices.length && !hasVoice(l.code) ? " (sem voz instalada)" : ""}
          </option>
        ))}
      </select>
      <button className="icon-btn icon-btn--bordered" aria-label="Testar voz" onClick={() => test(value)}>
        <Volume2 />
      </button>
    </div>
  );

  return (
    <div className="narrow">
      <div className="breadcrumb">
        <Link to={`/deck/${deck.id}/settings`} className="icon-btn icon-btn--sm icon-btn--bordered" aria-label="Voltar">
          <ArrowLeft />
        </Link>
        <Link to={`/deck/${deck.id}`}>{deck.name}</Link>/<Link to={`/deck/${deck.id}/settings`}>Configurações</Link>/<span className="current">Texto para fala</span>
      </div>
      <div className="page-head">
        <div>
          <h1>Texto para fala</h1>
          <div className="sub">Ouça a pronúncia do texto dos cartões. Selecione um trecho no editor e toque no alto-falante para que apenas ele seja lido.</div>
        </div>
      </div>
      {!ttsSupported() && <div className="banner">Seu navegador não oferece texto para fala.</div>}
      <div className="setting-group">
        <SettingRow title="Frente" description="Idioma usado para ler a frente.">
          <LangSelect value={tts.frontLang} onChange={(v) => set({ frontLang: v })} label="Idioma da frente" />
        </SettingRow>
        <SettingRow title="Verso" description="Idioma usado para ler o verso.">
          <LangSelect value={tts.backLang} onChange={(v) => set({ backLang: v })} label="Idioma do verso" />
        </SettingRow>
        <SettingRow title="Reprodução automática" description="Lê cada lado assim que ele aparece no estudo.">
          <Switch checked={tts.autoplay} onChange={(v) => set({ autoplay: v })} label="Reprodução automática" />
        </SettingRow>
        <SettingRow title="Ler o cartão inteiro" description="Quando nenhum trecho estiver marcado para leitura, lê o cartão todo.">
          <Switch checked={tts.readWholeCard} onChange={(v) => set({ readWholeCard: v })} label="Ler o cartão inteiro" />
        </SettingRow>
      </div>
      <p className="hint">As vozes vêm do seu sistema e navegador. Para mais idiomas, instale vozes nas configurações de fala do sistema operacional.</p>
    </div>
  );
}
