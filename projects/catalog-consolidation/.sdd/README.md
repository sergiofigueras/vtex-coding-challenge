# Estado SDD público e privado

A pasta `.sdd/` normalmente contém estado operacional privado/efêmero (inputs ingeridos, prompts, execuções, sessões, transcrições, resultados e logs) e continua ignorada. Duas exceções revisadas podem ser públicas: este README e `.sdd/history/**`.

## Snapshot público portátil

O snapshot público imutável é:

- caminho: `.sdd/history/catalog-consolidation-pre-portable-history-2026-09-06`
- cutoff: `2026-09-06T17:58:48.000Z`
- cobertura: 25 runs, 17 sessões e 86 arquivos publicados
- SHA-256 do manifesto informado na criação: `d1a417f58a0e955bdd1904654c2f0580a6eef24b7ae58b70fe493b2ab836f390`

Ele contém a representação semântica sanitizada de eventos observáveis e relatórios de exclusão/custo, com hashes e mapeamentos. Não contém PDFs confidenciais, credenciais, raciocínio privado, replay criptografado, caminhos absolutos, fixtures ProductEntry brutas, SQLite, symlinks nem outro estado local privado.

Não regenere, sobrescreva, renomeie nem remova esse snapshot. Para inspecionar arquivos rastreados, use `git ls-files projects/catalog-consolidation/.sdd/history`; para revisar o manifesto e relatórios no checkout, abra `manifest.json`, `inventory.json` e `reports/` dentro do caminho acima.

A partir deste diretório, valide o snapshot sem modelo ou fixture privada:

```bash
npm run sdd:history:validate -- --snapshot catalog-consolidation-pre-portable-history-2026-09-06
```

Para uma exportação futura explicitamente autorizada (nunca para o snapshot acima), execute:

```bash
npm run sdd:history:create -- --snapshot <novo-id> --cutoff <ISO-8601>
npm run sdd:history:validate -- --snapshot <novo-id>
```
