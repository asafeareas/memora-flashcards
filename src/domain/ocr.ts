/**
 * Finds text regions in an image to create occlusion masks automatically
 * (suggests what to cover). Uses tesseract.js;
 * the recognition model is downloaded on first use and cached by the browser.
 */
export async function detectTextBoxes(imageDataUrl: string, width: number, height: number): Promise<Array<{ x: number; y: number; w: number; h: number }>> {
  const { createWorker } = await import("tesseract.js");
  let worker: Awaited<ReturnType<typeof createWorker>>;
  try {
    worker = await createWorker(["por", "eng"]);
  } catch {
    throw new Error("Não foi possível carregar o reconhecimento de texto (requer internet no primeiro uso).");
  }
  try {
    const { data } = await worker.recognize(imageDataUrl);
    // Prefer word boxes (one card per label); fall back to lines on very dense images.
    const words = (data.words ?? []).filter((w) => w.confidence > 60 && /[\p{L}\p{N}]{2,}/u.test(w.text));
    const lines = (data.lines ?? []).filter((l) => l.confidence > 45 && l.text.trim().length > 1);
    const boxes = words.length && words.length <= 60 ? words : lines;
    const pad = 0.004;
    return boxes.map((l) => ({
      x: Math.max(0, l.bbox.x0 / width - pad),
      y: Math.max(0, l.bbox.y0 / height - pad),
      w: Math.min(1, (l.bbox.x1 - l.bbox.x0) / width + pad * 2),
      h: Math.min(1, (l.bbox.y1 - l.bbox.y0) / height + pad * 2),
    }));
  } finally {
    await worker.terminate();
  }
}
