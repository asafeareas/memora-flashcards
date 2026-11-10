/** Reads an image file/blob and returns a resized data URL (keeps PNG when it has transparency). */
export async function imageToDataUrl(src: Blob, maxSide = 1400, quality = 0.85): Promise<{ dataUrl: string; width: number; height: number }> {
  const url = URL.createObjectURL(src);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, height);
    const keepPng = src.type === "image/png" || src.type === "image/gif" || src.type === "image/svg+xml";
    const dataUrl = keepPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality);
    // If PNG got too large, fall back to JPEG on a white background.
    if (keepPng && dataUrl.length > 1_500_000) {
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      return { dataUrl: canvas.toDataURL("image/jpeg", quality), width, height };
    }
    return { dataUrl, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    img.src = src;
  });
}

export async function urlToDataUrl(url: string, maxSide = 1400) {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("Falha ao baixar a imagem.");
  return imageToDataUrl(await res.blob(), maxSide);
}

export interface ImageSearchResult {
  title: string;
  thumb: string;
  full: string;
  width: number;
  height: number;
  page: string;
  license?: string;
  author?: string;
}

/**
 * Built-in image search using the public Wikimedia Commons API (no key, CORS enabled).
 */
export async function searchImages(query: string, limit = 24): Promise<ImageSearchResult[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "320",
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!res.ok) throw new Error("A busca de imagens falhou. Verifique sua conexão.");
  const json = await res.json();
  const pages = Object.values(json?.query?.pages ?? {}) as Array<{
    title: string;
    index: number;
    imageinfo?: Array<{ thumburl: string; url: string; width: number; height: number; descriptionurl: string; extmetadata?: Record<string, { value: string }> }>;
  }>;
  return pages
    .filter((p) => p.imageinfo?.[0]?.thumburl)
    .sort((a, b) => a.index - b.index)
    .map((p) => {
      const ii = p.imageinfo![0];
      const strip = (s?: string) => (s ? s.replace(/<[^>]+>/g, "").trim() : undefined);
      return {
        title: p.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
        thumb: ii.thumburl,
        full: ii.width > 1400 ? ii.thumburl.replace(/\/\d+px-/, "/1280px-") : ii.url,
        width: ii.width,
        height: ii.height,
        page: ii.descriptionurl,
        license: strip(ii.extmetadata?.LicenseShortName?.value),
        author: strip(ii.extmetadata?.Artist?.value),
      };
    });
}
