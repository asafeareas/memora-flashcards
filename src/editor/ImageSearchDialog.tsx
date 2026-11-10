import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { searchImages, urlToDataUrl, type ImageSearchResult } from "../domain/images";
import { useUi } from "../ui/UiProvider";

export function ImageSearchDialog({ onPick, onClose, initialQuery = "" }: { onPick: (dataUrl: string) => void; onClose: () => void; initialQuery?: string }) {
  const ui = useUi();
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<ImageSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);

  const run = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      setResults(await searchImages(q.trim()));
    } catch (e) {
      ui.toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };
  const pick = async (r: ImageSearchResult) => {
    setPicking(r.full);
    try {
      const { dataUrl } = await urlToDataUrl(r.full);
      onPick(dataUrl);
    } catch (e) {
      ui.toast((e as Error).message, "error");
    } finally {
      setPicking(null);
    }
  };
  return (
    <Modal open onClose={onClose} wide title="Buscar imagem" description="Imagens livres da Wikimedia Commons. Clique para inserir no cartão.">
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="search" style={{ flex: 1 }}>
          <Search />
          <input className="input" data-autofocus placeholder="Ex.: mitocôndria, Torre Eiffel, coração humano" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn--primary" disabled={!q.trim() || loading}>
          {loading ? <Loader2 className="spin" /> : "Buscar"}
        </button>
      </form>
      {results && results.length === 0 && <p className="hint" style={{ marginTop: 16 }}>Nenhuma imagem encontrada para “{q}”.</p>}
      {results && results.length > 0 && (
        <div className="image-grid">
          {results.map((r) => (
            <button key={r.full} className="image-grid__cell" onClick={() => pick(r)} disabled={!!picking} title={`${r.title}${r.license ? ` · ${r.license}` : ""}`}>
              <img src={r.thumb} alt={r.title} loading="lazy" />
              {picking === r.full && (
                <span className="image-grid__busy">
                  <Loader2 className="spin" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
