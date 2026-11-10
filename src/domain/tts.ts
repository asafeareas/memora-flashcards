/** Text-to-speech through the browser's Web Speech API (free, works offline on most systems). */

export const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function voicesFor(lang: string): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  const all = window.speechSynthesis.getVoices();
  const base = lang.split("-")[0].toLowerCase();
  return all.filter((v) => v.lang.toLowerCase() === lang.toLowerCase() || v.lang.toLowerCase().startsWith(base));
}

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve([]);
    const v = window.speechSynthesis.getVoices();
    if (v.length) return resolve(v);
    const on = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", on);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", on);
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1200);
  });
}

export function speak(text: string, lang: string, rate = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ttsSupported()) return reject(new Error("Seu navegador não oferece texto-para-fala."));
    const clean = text.trim();
    if (!clean) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang;
    u.rate = rate;
    const voice = voicesFor(lang)[0];
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === "interrupted" || e.error === "canceled" ? resolve() : reject(new Error(e.error)));
    window.speechSynthesis.speak(u);
  });
}

export const stopSpeaking = () => ttsSupported() && window.speechSynthesis.cancel();

/** Text to read for a rendered card face: marked fragments if any, else the whole face (when allowed). */
export function speechTextFromHtml(html: string, readWhole: boolean): string {
  const d = document.createElement("div");
  d.innerHTML = html;
  d.querySelectorAll(".katex-mathml, script, style").forEach((n) => n.remove());
  const marked = [...d.querySelectorAll("[data-speak]")].map((n) => n.textContent ?? "").filter(Boolean);
  if (marked.length) return marked.join(". ");
  if (!readWhole) return "";
  d.querySelectorAll(".cloze-blank").forEach((n) => (n.textContent = "…"));
  return (d.textContent ?? "").replace(/\s+/g, " ").trim();
}

export const TTS_LANGUAGES: { code: string; label: string }[] = [
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "en-US", label: "Inglês (EUA)" },
  { code: "en-GB", label: "Inglês (Reino Unido)" },
  { code: "es-ES", label: "Espanhol (Espanha)" },
  { code: "es-MX", label: "Espanhol (México)" },
  { code: "fr-FR", label: "Francês" },
  { code: "de-DE", label: "Alemão" },
  { code: "it-IT", label: "Italiano" },
  { code: "ja-JP", label: "Japonês" },
  { code: "ko-KR", label: "Coreano" },
  { code: "zh-CN", label: "Chinês (Mandarim)" },
  { code: "ru-RU", label: "Russo" },
  { code: "pl-PL", label: "Polonês" },
  { code: "nl-NL", label: "Holandês" },
  { code: "sv-SE", label: "Sueco" },
  { code: "nb-NO", label: "Norueguês" },
  { code: "tr-TR", label: "Turco" },
  { code: "ar-SA", label: "Árabe" },
  { code: "hi-IN", label: "Hindi" },
  { code: "la", label: "Latim" },
];
