# 04 — Relatório final

## 1. Funcionalidades mapeadas na engenharia reversa
Usamos o REA para fazer a engenharia reversa da versão web de um app comercial de flashcards e mapear as funções desse tipo de aplicativo. Detalhe no doc 01, §4. Em resumo:
- **Decks**: criar (manual, IA, arquivo, colar texto), renomear, ícone e cor, duplicar com ou sem progresso, subdecks, pastas, mover, arquivar, excluídos recentemente (30 dias), exportar (CSV ou completo), publicar/avaliar/compartilhar.
- **Cartões**: editor rico (negrito, itálico, sublinhado, tachado, sub/sobrescrito, títulos, listas, código, link, realce e cor, LaTeX, cloze, imagem, oclusão, desenho, TTS por trecho), formatos básico/cloze/oclusão, reverso por deck e em massa, busca, filtros, ordenação, seleção múltipla, congelar, mover, histórico e estatísticas, redefinir progresso, detecção de duplicatas.
- **Estudo**: virar, Errei/Difícil/Bom/Fácil com prévia de intervalo, modo rápido Quase/Aprendi, digitar a resposta, editar/congelar/mover durante o estudo, tela de conclusão.
- **Algoritmos**: geral, FSRS, rápido, idiomas, medicina, personalizado (passos, bônus de fácil, modificador, intervalo máximo, novos por dia, embaralhar).
- **Outros**: estilo do cartão, TTS, sequência com congelamentos e meta diária, temas, IA, offline.

## 2. Resultados da engenharia reversa com REA
- 7 ferramentas REA usadas (`list_browser_targets`, `inspect_web_page`, `capture_browser_scenario`, `analyze_web_bundle`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`). A Evidence bruta, por conter material de terceiros, fica só na máquina local.
- **Achados-chave**: o mapa de rotas veio do manifesto de build; o dicionário de interface embutido revelou as telas e ações; o código revelou quais funções eram pagas.
- **Limitação**: a área logada não foi observada (sem conta autorizada). As telas internas do Memora foram projetadas do zero. Doc 01, §6.

## 3. Arquitetura implementada
SPA local-first: React 18 + React Router 6 + Dexie (IndexedDB) com consultas reativas, sem estado global duplicado. As regras ficam em `src/domain` (agendadores, fila, cloze, importação/exportação, backup) e o acesso a dados em `src/db/repo.ts` (transações). Detalhes no doc 02.

## 4. Tecnologias
Vite 6, TypeScript 5.9, React 18.3, React Router 6.30, Dexie 4 + dexie-react-hooks, Tiptap 2 (ProseMirror), KaTeX, ts-fsrs 4.7, PapaParse, JSZip + sql.js (Anki), tesseract.js (OCR), @anthropic-ai/sdk 1.7 + zod (IA), lucide-react (ícones), Fontsource (fontes locais), Vitest + fake-indexeddb.

## 5. Funcionalidades reproduzidas
Todas as do item 1, exceto as listadas no item 6. **Funções pagas do app de referência liberadas sem limite**: estudo sem limite diário, FSRS, imagens, oclusão de imagem com detecção automática de texto, TTS, realce e cor, busca de imagens, geração por IA sem cota, uso offline, sem anúncios e sem conta.

Persistência: IndexedDB + `storage.persist()` + **backup automático em arquivo no disco** + restauração. É o que garante os dados mesmo depois de limpar os dados do navegador.

## 6. Não reproduzidas e por quê
| Funcionalidade | Motivo |
|---|---|
| Biblioteca pública, publicação de decks, avaliações, denúncia | dependem de servidor e de conteúdo de terceiros; o Memora é local e sem backend |
| Compartilhamento em tempo real e colaboradores | exigem servidor e contas; substituído por exportar/importar deck (.json) |
| Conta, login, perfil público, sincronização entre dispositivos | sem backend por decisão de escopo; os dados são locais, com backup em arquivo |
| Importar de foto e de vídeo | exigem OCR de documento ou transcrição de vídeo; a IA cobre texto e PDF |
| Retrospectiva anual, indicações, ofertas e promoções | marketing e monetização, fora do escopo e da regra "sem restrições comerciais" |
| Paywalls, testes grátis, assinatura | excluídos por requisito |

## 7. Testes realizados
- 27 testes automatizados (Vitest): agendadores, repositório, importação/exportação, Anki, backup/restauração.
- 4 cenários REA de ponta a ponta, 99 passos, 100% aprovados (desktop e mobile), incluindo persistência após recarregar.
- Verificação manual no navegador embutido: estudo com Errei/Bom/Fácil, cloze, congelar em massa, reverso, troca para FSRS, estilos.
- `tsc` sem erros e `vite build` concluído.

## 8. Decisões próprias
- **Identidade visual própria**: nome Memora, índigo, Plus Jakarta Sans, ícones Lucide.
- Layout das telas internas projetado do zero.
- Os números dos presets "Idiomas" e "Medicina", os limites de "Quase/Dominado" (21 dias) e a regra de congelamento de sequência (1 a cada 7 dias, máximo 2) são próprios.
- A IA usa a chave do próprio usuário; a detecção de áreas na oclusão usa OCR (tesseract).
- O TTS usa as vozes do sistema (Web Speech).
- Interface apenas em português.

## 9. Como executar
Veja o `README.md`: `npm install`, depois `npm run dev`, e abra http://localhost:5180.
