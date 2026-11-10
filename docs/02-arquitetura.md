# 02 — Arquitetura do Memora

## Princípios
- **Cobertura funcional** das funções mapeadas na engenharia reversa (doc 01, §4), com **todas as funções pagas do app de referência liberadas de graça e sem limites** (doc 01, §5).
- **Identidade visual própria**: nome, cores, tipografia, ícones (Lucide, licença ISC) e layout definidos para o Memora, seguindo convenções comuns de apps de estudo (barra superior, conteúdo centralizado, cards, visualizador de cartão que vira ao clicar).
- **Local-first**: tudo funciona offline e sem conta. Não há servidor, então recursos sociais (biblioteca pública, colaboração) ficam fora (justificativa no doc 04).

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Build | Vite 6 + TypeScript 5 | o projeto estava vazio; SPA rápida, sem servidor |
| UI | React 18 + React Router 6 | SPA com rotas por tela |
| Persistência | IndexedDB via **Dexie 4** + `dexie-react-hooks` (`useLiveQuery`) | banco transacional no navegador; as consultas são reativas, então a UI reflete toda escrita sem estado global duplicado |
| Editor | **Tiptap 2** (ProseMirror) + extensões próprias (cloze, LaTeX, imagem) | editor rico extensível |
| Matemática | KaTeX | renderização de LaTeX offline |
| Agendamento | Algoritmo SM-2 com passos (presets) + **ts-fsrs** (FSRS) | presets de estudo, incluindo FSRS |
| CSV | PapaParse | importação e exportação CSV |
| Ícones | lucide-react | conjunto de ícones aberto |
| Testes | Vitest + fake-indexeddb | lógica de domínio e persistência |

## Estrutura

```
src/
  db/           schema Dexie, repositórios (decks, notes, cards, reviews, media, settings)
  domain/       regras puras: scheduler (sm2, fsrs, speed), estados do cartão, fila de estudo,
                cloze, importadores (texto, CSV, Anki), exportadores, backup, streak
  editor/       Tiptap + extensões (cloze, math, image) e toolbar
  components/   primitivos de UI (Button, Modal, Menu, Toast, Tabs, EmptyState…)
  features/     telas: home, folder, deck, card-editor, learn, settings, activity, archive, trash, ai
  styles/       tokens.css (cores, raio, sombras, tipografia; claro/escuro/temas)
```

## Rotas

| Rota | Tela |
|---|---|
| `/` | início (decks e pastas) |
| `/folder/:id` | pasta |
| `/deck/:id` | deck (abas Geral/Cartões) |
| `/deck/:id/add`, `/deck/:id/note/:noteId` | editor de cartão |
| `/deck/:id/occlusion` | oclusão de imagem |
| `/deck/:id/settings` (+ `/algorithm`, `/tts`, `/style`) | configurações do deck |
| `/deck/:id/import` | importação |
| `/learn/:deckId` → `/learn/:deckId/complete` | estudo e conclusão |
| `/archive`, `/trash` | arquivo e excluídos recentemente |
| `/activity` | atividade e sequência |
| `/settings` | configurações |
| `/ai` | geração por IA |

## Modelo de dados

```
Folder  { id, name, icon, color, order, createdAt }
Deck    { id, name, parentId?, folderId?, color, emoji?, order, createdAt, updatedAt,
          archivedAt?, deletedAt?, settings: DeckSettings }
Note    { id, deckId, type: basic|cloze|occlusion, front, back (HTML), occlusion?,
          reversed?, createdAt, updatedAt }
Card    { id, noteId, deckId, variant (forward|reverse|c1..cn|m1..mn), state (new|learning|
          review|relearning), due, interval, ease, step, reps, lapses, stability?, difficulty?,
          lastReview?, frozen, createdAt }
Review  { id, cardId, deckId, rating, at, durationMs, prevInterval, interval, state }
Media   { id, blob, mime, createdAt }
Setting { key, value }   (tema, idioma, chave de IA, backup, streak freezes…)
```

- Uma **nota** gera **cartões**: básica → 1 (+1 se reverso); cloze → 1 por índice `{{c1::…}}`; oclusão → 1 por máscara (modo "esconder todas, adivinhar uma" ou "esconder uma, adivinhar uma").
- **Subdeck**: `parentId`; estudar o deck principal inclui os subdecks, e o algoritmo é herdado do principal.
- **Lixeira**: `deletedAt`; o expurgo após 30 dias roda na abertura do app. **Arquivo**: `archivedAt`; deck arquivado é somente leitura.

## Regras de negócio
- **Estados exibidos** (limites próprios [HIP]): Não estudado = `new`; Quase = `learning/relearning` após "Errei"; Aprendendo = `learning`; Aprendi = `review` com intervalo < 21 d; Dominado = `review` com intervalo ≥ 21 d; Congelado = `frozen`.
- **Presets** [HIP para os números]: Geral (passos 1m 10m, graduação 1 d, fácil 4 d, ease 2,5); Idiomas (passos 1m 10m 1h, intervalos mais curtos); Medicina (passos 10m 1h 1d, intervalo máximo 180 d); FSRS (retenção desejada 0,9); Rápido (sem agenda: Quase/Aprendi, repete até aprender tudo); Personalizado (todos os campos editáveis).
- Trocar de algoritmo reseta o progresso do deck (com confirmação).
- **Sem limites comerciais**: nenhum limite diário, de cartões, de IA ou de convidado. Os limites "novos/dia" e "máximo/dia" são preferência pedagógica do usuário (padrão 20 e 9999).
- **Streak**: um dia é "ativo" com 5 ou mais cartões estudados; congelamentos [HIP]: ganha 1 a cada 7 dias ativos seguidos, máximo 2, consumidos automaticamente para cobrir um dia perdido.

## Persistência garantida

O IndexedDB sozinho **não** sobrevive a "Limpar dados do site/cookies"; ele resiste a fechar o navegador e a limpar só o cache. Por isso a estratégia tem três camadas:

1. **IndexedDB (Dexie)** como banco principal, gravado a cada ação, com `navigator.storage.persist()` para o navegador não despejar os dados por falta de espaço.
2. **Backup automático em arquivo no disco** (File System Access API, Chrome e Edge): o usuário escolhe um arquivo `memora-backup.json` uma vez, e o app regrava esse arquivo (com as imagens) segundos depois de cada mudança. Esse arquivo fica fora do navegador e **sobrevive a limpar dados do site, trocar de perfil ou reinstalar o navegador**.
3. **Restauração**: se o app abrir com o banco vazio, oferece "Restaurar do backup" (abrir o arquivo). Também há exportar/importar manual em Configurações.

Limitação honesta: depois de uma limpeza total, o navegador esquece a *permissão* do arquivo, então restaurar exige um clique para escolher o arquivo de novo. Os dados estão nele.

## Dependências externas opcionais (só com internet)
- **IA** (gerar cartões, assistente): chave de API do próprio usuário, guardada localmente. Sem chave, as outras funções seguem funcionando.
- **Busca de imagens**: API pública da Wikimedia Commons (sem chave).
- **TTS**: Web Speech API do navegador (offline na maioria dos sistemas).
