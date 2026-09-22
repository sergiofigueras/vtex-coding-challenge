# Índice de evidências SDD

Este índice liga critérios de aceitação a comandos reprodutíveis. O ledger em `docs/sdd/traceability.json` permanece um registro de propriedade de requisitos e não contém campo de evidência.

## SDD-009 — `catalog-one-history`

| Critério | Estado | Evidência reproduzível |
|---|---|---|
| AC-009-01 | pendente de operador externo | A captura nova ainda não foi criada. Após os runs solicitados, o operador deve executar `npm --prefix engine run history:create -- --project catalog-consolidation --snapshot <novo-id-unico> --cutoff <YYYY-MM-DDTHH:MM:SSZ>` e `npm --prefix engine run history:validate -- --project catalog-consolidation --snapshot <novo-id-unico>`, então registrar aqui o ID, corte UTC, contagens reais e hash do manifesto. |
| AC-009-02 | pendente de operador externo | A criação e a validação acima devem produzir e revisar mapeamentos fonte-saída, hashes e exclusões sem material proibido. Não há snapshot publicado antes dessa evidência. |
| AC-009-03 | verificado para o artefato tutorial | `node --test test/sdd-project-history-tutorial.test.mjs` verifica os elementos públicos exigidos no `TUTORIAL.md`, incluindo português, cadeia de evidência, diagramas Mermaid, separação Harness/runtime, escopo de citação, roteamento OpenAI e custo datado. |
| AC-009-04 | verificado para o artefato tutorial | `node --test test/sdd-project-history-tutorial.test.mjs` verifica comandos de clone limpo, testes públicos e opt-in, execução descartável, histórico e exercício de extensão limitado. |
| AC-009-05 | parcialmente evidenciado; pendente de snapshot | O mesmo teste verifica que o tutorial declara os limites. A prova de que a nova captura valida offline, sem modelo ou fonte privada, depende da validação externa de AC-009-01. |

Não foram usados números, hashes ou cobertura de uma implementação anterior. Este índice será atualizado somente com resultados observados da nova invocação de histórico.

## SDD-011 — `catalog-one-feature-existence-demo`

| Critério | Estado | Evidência reproduzível |
|---|---|---|
| AC-011-01 | verificado | `npm run demo:feature` concluiu com `Feature demonstration passed.` após construir a aplicação e criar somente arquivos temporários sintéticos. `test/sdd-feature-existence-demonstration.test.mjs` executa o mesmo módulo reutilizável. |
| AC-011-02 | verificado | `npm run demo:feature` valida o resumo JSON versionado do `--dry-run` para exatamente 1 produto e 3 links planejados, compara SHA-256 do banco antes/depois e testa dois vendedores contra o produto já existente mais um produto distinto. |
| AC-011-03 | verificado | O mesmo comando valida 1 produto e 3 links na primeira execução e consulta diretamente as tabelas `Product` e `SellerProduct` para confirmar os relacionamentos, sem imprimir payloads. |
| AC-011-04 | verificado | O comando rejeita saída/exit code inesperados e prova que a repetição comprometida cria 0 produtos e 0 links, com contagens finais inalteradas. |
| AC-011-05 | verificado | Foram aprovados `node --test test/sdd-feature-existence-demonstration.test.mjs`, `npm run check`, `npm --prefix ../.. run check` e `git diff --check`; o teste focado cobre AC-011-01 até AC-011-04 e permanece incluído em `npm test`. |
