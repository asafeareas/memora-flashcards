# Memora

Aplicativo web de flashcards com repetição espaçada, local-first, desenvolvido a partir de uma engenharia reversa, feita com o REA, de um aplicativo comercial de flashcards. A engenharia reversa serviu para mapear as funções desse tipo de app; o código, o nome e a identidade visual do Memora são próprios. Todas as funções são gratuitas e sem limites.

## Como executar

Requer Node.js 22.23+ ou 24.22+.

```bash
npm install
npm run dev
```

Abra http://localhost:5180.

Versão de produção:

```bash
npm run build
npm run preview
```

Abra http://localhost:5181.

Testes:

```bash
npm test
```

## Seus dados

- Tudo fica no IndexedDB do navegador, com armazenamento persistente solicitado.
- **Recomendado:** em Configurações → Seus dados, ative o **backup automático em arquivo** (Chrome/Edge). O arquivo é regravado a cada alteração e sobrevive a "limpar dados do site". Para recuperar, use "Restaurar backup" ou o botão da tela inicial vazia.
- Também é possível exportar e importar backups manualmente.

## IA (opcional)

Em Configurações → Inteligência artificial, informe sua chave da API da Anthropic. Ela fica só neste navegador e não entra nos backups. A geração usa `claude-opus-5-5` com saída estruturada.

## Documentação

- `docs/01-engenharia-reversa.md`: método com o REA, funcionalidades mapeadas e matriz gratuito × pago
- `docs/02-arquitetura.md`: decisões, modelo de dados e estratégia de persistência
- `docs/03-validacao.md`: cenários REA, testes e correções
- `docs/04-relatorio-final.md`: relatório final
- `docs/validation/`: cenários REA e screenshots da validação do Memora
