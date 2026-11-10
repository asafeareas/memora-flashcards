# 01 — Engenharia reversa de um app de flashcards com o REA

Data da investigação: 2026-11-09. Ferramenta central: **REA (rea-agents 6.8.0)**, via MCP e CLI.

O Memora nasceu de uma engenharia reversa feita com o REA sobre a versão web de um aplicativo
comercial de flashcards com repetição espaçada (o "app de referência"). O objetivo era entender
quais funções um app desse tipo oferece e como elas se organizam, para depois construir uma
implementação própria, com código, nome e identidade visual independentes. Nenhum código, texto
de interface ou recurso gráfico do app de referência foi copiado para o Memora.

As capturas brutas (páginas, scripts e screenshots de terceiros) ficam só na máquina local e
não fazem parte deste repositório.

> Convenções: **[OBS]** = observado diretamente por uma ferramenta REA; **[EST]** = derivado de
> análise estática do código exportado pelo REA (o código existe, mas a execução não foi
> observada); **[HIP]** = hipótese ou decisão própria por falta de evidência.

## 1. Ambiente e ferramentas usadas

| Item | Situação |
|---|---|
| REA | 6.8.0 global, registrado no Claude Code como MCP (`mcp__rea__*`) + CLI `rea` |
| Navegador | Google Chrome (CDP em loopback e modo *launch* do REA com perfil temporário) |

Ferramentas REA usadas (todas com Evidence retida localmente):

| Ferramenta REA | Uso |
|---|---|
| `list_browser_targets` | descobrir a página aberta via CDP |
| `inspect_web_page` (MCP e CLI) | DOM, acessibilidade, recursos e scripts |
| `capture_browser_scenario` (MCP e CLI) | navegar, clicar, capturar URL, árvore de acessibilidade e screenshots |
| `analyze_web_bundle` | grafo de chunks e rotas |
| `export_web_scripts` | exportar os scripts da aplicação para disco (manifest com SHA-256) |
| `analyze_javascript_application` | análise estática do código exportado (parcial, ver §6) |
| `inspect_analysis_view` | paginar resultados retidos |

## 2. Achados de acesso — [OBS]

- A área de decks exige conta; sem login, o acesso é redirecionado para o site institucional.
- As páginas públicas (biblioteca de decks compartilhados, prévia de deck e onboarding de
  convidado) são acessíveis sem login e foram percorridas com cenários REA.

**Limitação principal:** a área logada **não foi observada**, porque criar conta ou usar
credenciais não estava autorizado. A descrição do app logado vem da análise estática do código
(rotas, nomes de telas e ações), não de telas observadas.

## 3. Estrutura da aplicação analisada — [EST]

- SPA web com roteamento por páginas e componentes compartilhados com a versão mobile.
- Mapa de rotas obtido do manifesto de build listado nos recursos capturados pelo
  `inspect_web_page`. As áreas encontradas: início e pastas, deck (cartões, editor, oclusão de
  imagem, estilo, importação), configurações do deck (algoritmo, TTS, compartilhamento), estudo
  e conclusão, geração por IA, conta, biblioteca pública e engajamento (sequência de dias).
- Um dicionário de interface embutido no código revelou quais telas e ações existem. Os textos
  não foram copiados; o Memora tem redação própria.

## 4. Funcionalidades identificadas — [EST], salvo indicação

### 4.1 Decks e organização
- Criar deck manualmente ou de forma automática (IA, arquivo, colar texto).
- Renomear, duplicar (com ou sem progresso), **subdecks**, **pastas** com ícone e cor, mover.
- **Arquivar** (deck arquivado não pode ser editado nem estudado) e restaurar.
- **Excluídos recentemente**: retidos por 30 dias com o progresso; restaurar ou excluir de vez.
- Indicadores por deck: cartões para hoje, concluído hoje, deck vazio.
- Exportar em CSV ou em formato completo, opcionalmente com progresso.
- Serviços de servidor: publicar, avaliar e compartilhar decks, colaboradores.

### 4.2 Cartões
- Editor rico: negrito, itálico, sublinhado, tachado, sub/sobrescrito, títulos, listas, código,
  link, **realce e cor**, **LaTeX**, **cloze**, **imagem**, **oclusão de imagem**, **desenho**,
  **TTS de trecho selecionado**.
- Formatos: básico (pergunta → resposta), cloze e oclusão de imagem.
- Importar colando texto com separadores configuráveis e prévia de erros; importar CSV.
- **Reverso** por deck e em massa (só cartões básicos).
- Lista de cartões com busca, filtros, ordenação, seleção múltipla e detecção de duplicatas.
- Metadados do cartão (estado, intervalo, facilidade, revisões, próxima revisão), histórico de
  revisões e redefinição de progresso.
- **Congelar/descongelar** cartão (tira do estudo).

### 4.3 Estudo
- Clique para mostrar a resposta; avaliação **Errei / Difícil / Bom / Fácil** com prévia do
  intervalo.
- Aprendizado rápido sem agenda: **Quase / Aprendi**.
- Editar, congelar e mover cartão durante o estudo; **digitar a resposta**.
- Tela de conclusão (tudo revisado, conclusão parcial, continuar estudando).
- Estados do cartão: Não estudado, Quase, Aprendendo, Aprendi, Dominado, Congelado.

### 4.4 Algoritmos
- Predefinições: repetição espaçada geral, **FSRS**, aprendizado rápido, idiomas, medicina e
  personalizado.
- Campos editáveis: passos de aprendizagem, bônus de fácil, modificador de intervalo, intervalo
  máximo, máximo de cartões por dia, novos por dia, embaralhar.
- Trocar de algoritmo **reseta o progresso do deck**; o subdeck herda o algoritmo do deck principal.

### 4.5 Personalização, TTS e engajamento
- **Estilo do cartão** por deck: fonte, tamanho, alinhamento.
- **TTS**: idioma da frente e do verso, reprodução automática.
- **Atividade**: sequência de dias, maior sequência, dias ativos com meta diária e congelamento
  de sequência.
- Aparência (claro, escuro, sistema e temas), modo offline.

### 4.6 IA
- Gerar cartões a partir de tema/prompt ou de documento PDF.
- Oclusão de imagem com sugestão automática de áreas.

## 5. Matriz Gratuito × Pago — [EST]

O código do app de referência separa as funções entre plano gratuito e pago. No Memora tudo é
gratuito e sem limites:

| Funcionalidade | Gratuito (referência) | Pago (referência) | No Memora |
|---|---|---|---|
| Flashcards básicos | ✔ | ✔ | ✔ |
| Repetição espaçada FSRS | parcial | ✔ | ✔ |
| Estudo sem limite diário | ✘ | ✔ | ✔ |
| Imagem no cartão | ✘ | ✔ | ✔ |
| Oclusão de imagem | ✘ | ✔ | ✔ |
| Texto-para-fala | ✘ | ✔ | ✔ (Web Speech API) |
| Realce e cor | ✘ | ✔ | ✔ |
| Busca de imagens integrada | ✘ | ✔ | ✔ (Wikimedia Commons) |
| Geração de cartões por IA | limitada | ✔ | ✔ com a chave de API do próprio usuário |
| Uso offline | ✘ | ✔ | ✔ (local-first) |
| Sem anúncios | ✘ | ✔ | ✔ |

## 6. Limitações e lacunas

1. **Área logada não observada** (exige conta). O layout das telas internas do Memora é
   **[HIP]**, projetado do zero.
2. `analyze_javascript_application` terminou **parcial** por tempo esgotado e limite de
   capacidade (registrado na própria Evidence).
3. Valores numéricos de presets e limites não aparecem no código do cliente; os do Memora são
   próprios.
4. Biblioteca pública, publicação, avaliações, colaboradores e sincronização são serviços de
   servidor, fora do escopo de um app local.
