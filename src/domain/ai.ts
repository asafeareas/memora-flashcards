import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";

/**
 * AI card generation, with no quota.
 * Uses the user's own Anthropic API key, kept only in this browser.
 */

export const AI_MODEL = "claude-opus-5-5";
export const MAX_AI_CARDS = 200;

export type AiFormat = "question" | "definition" | "translation" | "cloze";

export interface AiSource {
  kind: "prompt" | "text" | "pdf";
  /** Topic / prompt, plain text, or base64 PDF */
  value: string;
  fileName?: string;
}

export interface AiRequest {
  apiKey: string;
  source: AiSource;
  format: AiFormat;
  count: number;
  /** Optional extra instruction from the user */
  instructions?: string;
  language: string;
  signal?: AbortSignal;
}

export interface GeneratedCard {
  front: string;
  back: string;
}

const CardsSchema = z.object({
  cards: z.array(
    z.object({
      front: z.string(),
      back: z.string(),
    }),
  ),
});

const FORMAT_RULES: Record<AiFormat, string> = {
  question: "Each card is a question on the front and a concise answer on the back.",
  definition: "Each card has a term or concept on the front and its definition or meaning on the back.",
  translation: "Each card has a word or short phrase in the language being learned on the front and its translation on the back.",
  cloze:
    "Each card is a cloze deletion: write one self-contained sentence on the front and mark the key fact with {{c1::answer}} (use c2, c3 for additional blanks in the same sentence when useful). Put a short optional explanation on the back, or leave it empty.",
};

export async function generateCards(req: AiRequest): Promise<GeneratedCard[]> {
  const client = new Anthropic({ apiKey: req.apiKey, dangerouslyAllowBrowser: true });
  const count = Math.max(1, Math.min(MAX_AI_CARDS, Math.round(req.count)));
  const system = [
    "You create high-quality study flashcards for spaced repetition.",
    "Cards must be atomic (one fact per card), accurate, and unambiguous; the front must make sense without seeing other cards.",
    FORMAT_RULES[req.format],
    `Write the cards in ${req.language} unless the material or the user's instructions clearly call for another language.`,
    "Use plain text; you may use simple inline HTML (<b>, <i>, <br>) for emphasis. Do not number the cards.",
    `Return exactly ${count} cards when the material allows it; return fewer only if it does not contain enough distinct facts.`,
  ].join("\n");

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.source.kind === "pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: req.source.value } });
    content.push({ type: "text", text: `Create ${count} flashcards from the attached document.` });
  } else if (req.source.kind === "text") {
    content.push({ type: "text", text: `<material>\n${req.source.value}\n</material>\n\nCreate ${count} flashcards from the material above.` });
  } else {
    content.push({ type: "text", text: `Create ${count} flashcards about: ${req.source.value}` });
  }
  if (req.instructions?.trim()) content.push({ type: "text", text: `Additional instructions from the learner: ${req.instructions.trim()}` });

  try {
    const response = await client.beta.messages.parse(
      {
        model: AI_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(CardsSchema) },
        system,
        messages: [{ role: "user", content }],
      },
      { signal: req.signal },
    );
    if (response.stop_reason === "refusal") throw new Error("A IA recusou este pedido. Tente reformular o tema ou o material.");
    if (response.stop_reason === "max_tokens") throw new Error("A resposta ficou longa demais. Peça menos cartões de uma vez.");
    const parsed = response.parsed_output;
    if (!parsed) throw new Error("A IA não retornou cartões em um formato válido. Tente novamente.");
    return parsed.cards.filter((c) => c.front.trim()).slice(0, count);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Chave de API inválida. Confira em Configurações → Inteligência artificial.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error("Sua chave de API não tem permissão para este modelo.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Limite de uso da API atingido. Aguarde um pouco e tente de novo.");
    if (e instanceof Anthropic.BadRequestError) throw new Error(`Pedido inválido: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new Error("Sem conexão com a API. Verifique sua internet.");
    if (e instanceof Anthropic.APIError) throw new Error(`Erro da API (${e.status}): ${e.message}`);
    throw e;
  }
}

/** Cheap validation call to check the key works. */
export async function testApiKey(apiKey: string): Promise<void> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    await client.models.retrieve(AI_MODEL);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Chave de API inválida.");
    if (e instanceof Anthropic.APIError) throw new Error(`Erro da API (${e.status}): ${e.message}`);
    throw new Error("Não foi possível conectar à API.");
  }
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    r.readAsDataURL(file);
  });
}
