# 03 — Validação

A validação usou o **REA** (`capture_browser_scenario`, modo *launch*, perfil novo e limpo do Chrome 156) para dirigir o Memora em `http://localhost:5180`, além de testes automatizados (Vitest) e verificações manuais no navegador embutido.

Cenários e Evidence: `docs/validation/scenarios/*.json`, `docs/validation/evidence/*.json`; screenshots: `docs/validation/screens/`.

## 1. Cenários REA executados contra o Memora

| Cenário | Passos | Resultado | O que prova |
|---|---|---|---|
| `memora-e2e-desktop` (1440×900) | 21 | ✅ 21/21 | criar deck → adicionar cartão no editor rico → aba Cartões → estudar (Espaço, tecla 4) → tela de conclusão → **recarregar e o deck continua lá** |
| `memora-e2e-mobile` (390×844) | 21 | ✅ 21/21 | o mesmo fluxo no layout mobile (menu hambúrguer, CTAs largos, botões de avaliação em 4 colunas) |
| `memora-features` (1440×900) | 34 | ✅ 34/34 | importação colando (Tab/Nova linha, linha inválida marcada em vermelho e ignorada, cloze detectado), busca de cartões, arquivar → banner → página Arquivo → restaurar, excluir → Excluídos recentemente → restaurar, Atividade, tema Escuro, tela de IA |
| `memora-occlusion` (1440×900) | 23 | ✅ 23/23 | **busca de imagens** (Wikimedia) → **oclusão de imagem** → **detectar texto (OCR)** criou 20 áreas → 20 cartões → estudo com área ativa revelada no verso |

Primeiras tentativas que falharam e foram corrigidas: seletores ambíguos (modo estrito do Playwright) nos próprios cenários, e uma imagem sem texto no teste de OCR, em que a ausência de áreas era o resultado correto.

## 2. Testes automatizados (Vitest + fake-indexeddb) — 27 passando

| Arquivo | Cobertura |
|---|---|
| `src/domain/scheduler.test.ts` (13) | SM-2 com passos (Errei/Difícil/Bom/Fácil), graduação, lapsos, intervalo máximo, FSRS, aprendizado rápido, estados exibidos, formatação de intervalos, fila diária (limite de novos, congelados), cloze, reverso, resposta digitada tolerante |
| `src/db/repo.test.ts` (6) | notas↔cartões preservando progresso, cloze, modo reverso de deck e por nota, troca de algoritmo reseta a árvore, lixeira de 30 dias com expurgo, arquivar/duplicar/mover (impede ciclo)/pastas/congelar/excluir |
| `src/domain/io.test.ts` (7) | colar com separadores, CSV com cabeçalho e aspas, `{{resposta}}` → cloze sequencial, sanitização de HTML, exportação CSV/JSON e reimportação com progresso, **backup completo → apagar tudo (simula "limpar dados do site") → restaurar** |
| `src/domain/anki.test.ts` (1) | pacote `.apkg` real (SQLite + zip) com nota básica, modelo cloze, imagem e som; nome do deck |

Verificação adicional: a chamada real à API da Anthropic com chave inválida retorna a mensagem amigável "Chave de API inválida" (a geração com chave válida não foi executada; ver §5).

`npm run build` (tsc + Vite) também passa. As rotas pesadas (editor, IA, importação Anki, OCR) são carregadas sob demanda.

## 3. Identidade visual

O Memora tem identidade visual própria (nome, índigo `#5b54e8`, Plus Jakarta Sans, ícones Lucide,
layout próprio). Por isso não houve comparação pixel a pixel com o app de referência: ela só
mediria diferenças intencionais. A validação visual conferiu o próprio Memora em desktop
(1440 px) e mobile (390 px): menu hambúrguer, margens de 16 px, CTAs em largura total e
estados vazios.

## 4. Problemas encontrados na validação e corrigidos

1. O ícone de menu aparecia no desktop: especificidade de CSS (`.icon-btn` sobrescrevia `.menu-toggle`).
2. Os botões do painel de estudo comprimiam o texto a 800 px: o painel agora quebra linha.
3. `{{resposta}}` não virava cloze com digitação programática ou colagem: a conversão agora roda a cada atualização e também ao salvar.
4. Rótulos no plural para um cartão ("1 novos", "Não estudados"): agora singular e plural.
5. O toast cobria os botões de avaliação no estudo: reposicionado.
6. Vão vazio no painel "Cartões para hoje" no mobile (`flex-basis` em coluna).
7. O rodapé fixo do editor/importação ficava translúcido sobre o conteúdo: agora tem fundo sólido e borda.
8. O calendário mostrava "Novembro De 2026".
9. O OCR por linha cobria linhas inteiras de tabelas: agora prioriza palavras.
10. O bundle principal tinha 1,6 MB: com divisão de código, caiu para 790 KB.

## 5. Não validado / limites da validação

- **Geração por IA com chave válida**: requer a chave do usuário. Validados apenas a montagem do pedido (até a autenticação) e o tratamento de erro.
- **Áudio do TTS**: a Web Speech API não é observável no navegador headless; a lógica de seleção de texto e idioma está implementada, mas o som não foi conferido.
- **Backup automático em arquivo** (File System Access API) exige gesto do usuário e seletor nativo de arquivo; não é automatizável no REA. O formato e a restauração estão cobertos pelo teste de "apagar tudo → restaurar".
- **Área logada do app de referência**: não observada sem conta (doc 01, §6); as telas internas do Memora foram projetadas do zero.
