# VTEX One: construa o consolidador de catálogo do zero

Imagine que duas lojas enviem o mesmo produto com descrições um pouco diferentes. O catálogo deve guardar **um produto** e registrar que **as duas lojas o vendem**. É isso que você vai construir aqui: um programa que lê o arquivo enviado pelos vendedores e atualiza um banco SQLite sem criar produtos duplicados.

Este guia começa de um clone limpo e termina com os comandos para testar e publicar a solução. A branch `main` ainda **não contém o aplicativo** em `projects/catalog-consolidation`. Ela contém a estrutura para desenvolvê-lo e o pacote [`catalog-consolidation-sdd-specs.zip`](catalog-consolidation-sdd-specs.zip), com 11 especificações (`SDD-000` a `SDD-010`). O pacote descreve o que construir e como conferir o resultado; não traz código pronto, testes executáveis, dados do exercício ou credenciais.

As especificações dividem o trabalho em etapas pequenas. `project:prepare` prepara as instruções de uma etapa; `project:run` pede ao Harness que trabalhe nela. Depois de cada execução, **revise o código e rode os testes**. Uma execução concluída, por si só, não significa que a etapa está pronta. O modelo ajuda a escrever o programa, mas o consolidador final deve funcionar localmente, sem depender de IA ou de uma conexão de rede.

## Escopo da avaliação e limite da evidência

- **O que entra:** um arquivo com ofertas de várias lojas e um catálogo SQLite que já contém produtos e uma tabela para relacioná-los aos vendedores.
- **O que gravar:** se o produto já existir, mantenha a linha de `Product` e crie apenas a relação em `SellerProduct`. Se for novo, cadastre o produto e associe o vendedor. Se não houver dados suficientes para decidir com segurança, interrompa a importação sem deixar alterações pela metade.
- **Onde está a dificuldade:** cada loja usa seus próprios IDs; diferenças de acento, pontuação ou idioma não devem criar duplicatas conhecidas; produtos de nomes parecidos não devem ser unidos por engano; e repetir o mesmo arquivo não deve acrescentar linhas. Há um comando de teste para cada caso na última seção.
- **O que é decisão de projeto:** o PDF permite mudanças justificadas no banco e deixa ambiguidades em aberto. As regras escolhidas nas especificações precisam ser explicadas e testadas — não apresentadas como se estivessem todas definidas no enunciado.
- **O que os arquivos de teste mostram:** o catálogo começa com 975 produtos e o arquivo tem 269 entradas. Para esses dados, esperamos 976 produtos e 268 relações após a primeira importação, sem novas linhas na segunda. Esses números não são uma regra para outros catálogos.
- **O que ainda falta comprovar:** a `main` contém as especificações, mas não o aplicativo. O workflow versionado define verificações da estrutura e do ZIP; não há uma execução pública atual para citar. O comportamento final só estará demonstrado depois que o código for criado e os testes passarem.
- **Como entregar:** o enunciado prevê 48 horas, repositório público e leitura de um *Guideline Document* separado, que não acompanha o ZIP. Confira esse documento antes do envio. Alterar a data de um commit não muda o horário real da publicação.

## 1. Prepare o ambiente

Você precisa de Node `^22.19.0 || >=24.0.0`, npm e Bash ou Zsh. Os comandos foram conferidos com Node `v24.0.0` e npm `11.3.0`. Execute o bloco abaixo em uma pasta onde ainda não exista um diretório chamado `vtex-coding-challenge`.

```bash
export WORK_ROOT="${WORK_ROOT:-$PWD}"
export REPO_DIR="${WORK_ROOT}/vtex-coding-challenge"
test ! -e "${REPO_DIR}"
git clone --branch main --single-branch --depth 1 \
  https://github.com/sergiofigueras/vtex-coding-challenge.git "${REPO_DIR}"
cd "${REPO_DIR}"
test "$(git branch --show-current)" = "main"
test ! -e projects/catalog-consolidation
test -f README_VTEX_ONE.md
test -f catalog-consolidation-sdd-specs.zip
node --version
npm --version
git rev-parse HEAD
```

O clone baixa apenas a versão necessária para este tutorial. Neste ponto, a ausência de `projects/catalog-consolidation` é esperada: você vai criá-lo no próximo passo.

```bash
npm ci
npm run dsh:config
```

Ainda não rode `npm run check`: o verificador espera encontrar ao menos um projeto, que será criado no passo 2.

## 2. Crie o projeto e instale as especificações

`project:create` cria a pasta e os arquivos mínimos do projeto. Em seguida, confira se o ZIP é o esperado e extraia as especificações sobre essa estrutura. Se a conferência do SHA-256 falhar, pare: o arquivo não é o mesmo usado para preparar este tutorial.

```bash
npm run project:create -- \
  --id catalog-consolidation \
  --title "VTEX Catalog Consolidation"

export BUNDLE_PATH="${REPO_DIR}/catalog-consolidation-sdd-specs.zip"
export BUNDLE_SHA256="90b2f63a6dfac2a97896c51d9259449ed5d1075240828881d0484185e7659e09"
test "$(shasum -a 256 "${BUNDLE_PATH}" | awk '{print $1}')" = "${BUNDLE_SHA256}"
unzip -t "${BUNDLE_PATH}"
unzip -o "${BUNDLE_PATH}" -d "${REPO_DIR}"

npm run project:validate -- \
  --project catalog-consolidation --working-tree
npm run check
```

Os dois últimos comandos conferem se as especificações se encaixam na estrutura do repositório. Eles **não** testam a aplicação — ela ainda não existe. As 11 etapas devem aparecer como `ready`, aguardando implementação.

## 3. Baixe os dados do exercício

O exercício usa dois arquivos: `ProductEntry.json`, com as ofertas dos vendedores, e `catalog.db`, com o catálogo inicial. O comando abaixo baixa as versões definidas em `config/sources.json` e confere seus hashes. Os arquivos ficam em `.sdd/inputs/`, fora do controle de versão. Não publique o JSON nem o banco e não mude os hashes só para aceitar um download diferente.

```bash
npm run project:sources -- --project catalog-consolidation
test -f projects/catalog-consolidation/.sdd/inputs/ProductEntry.json
test -f projects/catalog-consolidation/.sdd/inputs/catalog.db
shasum -a 256 \
  projects/catalog-consolidation/.sdd/inputs/ProductEntry.json \
  projects/catalog-consolidation/.sdd/inputs/catalog.db
```

Compare a saída com estes SHA-256: `1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6` para o JSON e `733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404` para o SQLite. O comando de download também faz essa checagem; o `shasum` apenas mostra os valores para você conferir.

## 4. Informe a chave sem gravá-la no projeto

Você pode usar `project:prepare` sem chave para ler as instruções que serão enviadas ao agente. Para executar `project:run`, a chave precisa estar em `OPENAI_API_KEY`. O bloco abaixo a lê sem mostrá-la na tela se a variável ainda não estiver definida. Não coloque a chave no README, em arquivos versionados ou em mensagens do agente.

```bash
if [ -z "${OPENAI_API_KEY:-}" ]; then
  printf 'OPENAI_API_KEY: ' >&2
  IFS= read -r -s OPENAI_API_KEY
  printf '\n' >&2
  export OPENAI_API_KEY
fi
test -n "${OPENAI_API_KEY:-}"
```

Antes de cada execução, leia o `prompt.md` criado em `projects/catalog-consolidation/.sdd/runs/<run-id>/`. Depois, consulte `stdout.txt`, `stderr.txt` e `result.json` para entender o que aconteceu. Esses arquivos são locais e não entram no Git. A rota `default` usa Terra; só troque para Sol se houver aprovação e um motivo registrado.

## 5. Construa uma parte de cada vez

Em cada etapa, `project:prepare` mostra o trabalho proposto, `project:run` o executa e `project:validate` confere as especificações. Leia as mudanças e teste o que foi criado antes de passar à etapa seguinte. O valor de `--change` identifica aquela execução no controle de custos.

### Comece pela interface do programa (SDD-000 e SDD-001)

Aqui nascem o comando de terminal, a estrutura TypeScript e os primeiros testes.

```bash
npm run project:prepare -- --project catalog-consolidation \
  --change catalog-one-foundation --spec SDD-000,SDD-001 --route default
npm run project:run -- --project catalog-consolidation \
  --change catalog-one-foundation --spec SDD-000,SDD-001 --route default
npm run project:validate -- --project catalog-consolidation --working-tree
```

Quando a execução terminar, confira o `package-lock.json` gerado e instale as dependências do novo projeto:

```bash
test -f projects/catalog-consolidation/package-lock.json
npm --prefix projects/catalog-consolidation ci
```

### Leia e valide o arquivo de entrada (SDD-002)

O próximo passo define quais campos são aceitos e como detectar registros inválidos ou conflitantes antes de escrever no banco.

```bash
npm run project:prepare -- --project catalog-consolidation \
  --change catalog-one-input --spec SDD-002 --route default
npm run project:run -- --project catalog-consolidation \
  --change catalog-one-input --spec SDD-002 --route default
npm run project:validate -- --project catalog-consolidation --working-tree
```

### Prepare o banco SQLite (SDD-003)

Agora ajuste o esquema sem perder os produtos existentes. O ID que uma loja dá ao produto deve continuar sendo texto, mesmo quando parece um número.

```bash
npm run project:prepare -- --project catalog-consolidation \
  --change catalog-one-schema --spec SDD-003 --route default
npm run project:run -- --project catalog-consolidation \
  --change catalog-one-schema --spec SDD-003 --route default
npm run project:validate -- --project catalog-consolidation --working-tree
```

### Decida quando dois registros são o mesmo produto (SDD-004)

Esta é a parte central do desafio. A comparação considera nome, marca e categoria normalizados. Os aliases conhecidos precisam funcionar também dentro de nomes compostos, mas nunca em parte de outra palavra. Casos parecidos demais para uma decisão segura devem parar para revisão, não virar uma duplicata silenciosa.

```bash
npm run project:prepare -- --project catalog-consolidation \
  --change catalog-one-identity --spec SDD-004 --route default
npm run project:run -- --project catalog-consolidation \
  --change catalog-one-identity --spec SDD-004 --route default
npm run project:validate -- --project catalog-consolidation --working-tree
```

### Grave produtos e vendedores sem deixar trabalho pela metade (SDD-005)

Uma importação deve completar tudo ou desfazer tudo. Se você importar o mesmo arquivo duas vezes, a segunda execução não deve criar novos produtos nem relações.

```bash
npm run project:prepare -- --project catalog-consolidation \
  --change catalog-one-consolidation --spec SDD-005 --route default
npm run project:run -- --project catalog-consolidation \
  --change catalog-one-consolidation --spec SDD-005 --route default
npm run project:validate -- --project catalog-consolidation --working-tree
```

### Cuide dos erros e da segurança (SDD-006)

Erros esperados precisam ser claros; valores vindos do arquivo nunca devem ser executados como SQL nem aparecer sem controle nos logs.

```bash
npm run project:prepare -- --project catalog-consolidation \
  --change catalog-one-safety --spec SDD-006 --route default
npm run project:run -- --project catalog-consolidation \
  --change catalog-one-safety --spec SDD-006 --route default
npm run project:validate -- --project catalog-consolidation --working-tree
```

### Escreva os testes que sustentam cada decisão (SDD-007)

Além dos testes gerais, esta etapa deve criar os oito arquivos de teste dos casos difíceis listados no final deste guia.

```bash
npm run project:prepare -- --project catalog-consolidation \
  --change catalog-one-verification --spec SDD-007 --route default
npm run project:run -- --project catalog-consolidation \
  --change catalog-one-verification --spec SDD-007 --route default
npm run project:validate -- --project catalog-consolidation --working-tree
```

Registre em `docs/sdd/evidence-index.md` qual teste comprova cada critério `AC-...`. Anote somente comandos que você realmente conseguiu executar nesta implementação.

### Ajuste os limites de entrada e de espera do SQLite (SDD-010)

Tamanho de arquivo, número de linhas e tempo de espera não devem ficar presos a valores pequenos e escondidos no código. Esta etapa define valores padrão e opções para ajustá-los.

```bash
npm run project:prepare -- --project catalog-consolidation \
  --change catalog-one-operational-limits --spec SDD-010 --route default
npm run project:run -- --project catalog-consolidation \
  --change catalog-one-operational-limits --spec SDD-010 --route default
npm run project:validate -- --project catalog-consolidation --working-tree
```

### Prepare a entrega (SDD-008)

Revise a documentação, os testes e os arquivos que entrarão no repositório público.

```bash
npm run project:prepare -- --project catalog-consolidation \
  --change catalog-one-release --spec SDD-008 --route default
npm run project:run -- --project catalog-consolidation \
  --change catalog-one-release --spec SDD-008 --route default
npm run project:validate -- --project catalog-consolidation --working-tree
```

### Registre a execução e escreva o tutorial do projeto (SDD-009)

Este registro descreve o trabalho feito pelo Harness nesta nova implementação; não é o histórico de commits do Git.

```bash
npm run project:prepare -- --project catalog-consolidation \
  --change catalog-one-history --spec SDD-009 --route default
npm run project:run -- --project catalog-consolidation \
  --change catalog-one-history --spec SDD-009 --route default
npm run project:validate -- --project catalog-consolidation --working-tree
```

Quando as execuções terminarem, crie um registro novo com os números desta implementação. Não reutilize um registro antigo. Os dois comandos abaixo geram um identificador e um horário de corte em UTC:

```bash
export SNAPSHOT_ID="catalog-consolidation-build-$(date -u +%Y%m%d%H%M%S)"
export SNAPSHOT_CUTOFF="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
npm run project:history:create -- --project catalog-consolidation \
  --snapshot "${SNAPSHOT_ID}" --cutoff "${SNAPSHOT_CUTOFF}"
npm run project:history:validate -- --project catalog-consolidation \
  --snapshot "${SNAPSHOT_ID}"
```

Confira o manifesto, o que ficou de fora e os hashes do registro. Anote os números reais em `docs/sdd/evidence-index.md` e `TUTORIAL.md`; só então marque `SDD-009` como `verified`.

## 6. Confira a solução antes de publicar

Rode estes comandos na ordem. A verificação do repositório não substitui os testes do aplicativo. O teste com os dados do exercício usa uma cópia temporária do banco. Os parênteses executam o bloco em um subprocesso: se uma linha falhar, as seguintes não rodam, sem fechar seu terminal.

```bash
(
set -e
npm --prefix projects/catalog-consolidation ci
npm --prefix projects/catalog-consolidation run check
npm --prefix projects/catalog-consolidation run test:fixture
npm run project:validate -- --project catalog-consolidation --working-tree
npm run check
git diff --check
npm run project:cost -- --project catalog-consolidation
)
```

Faça também uma importação completa à mão. Primeiro copie `catalog.db` para uma pasta temporária: **não escreva no banco original** que foi baixado no passo 3. Compile o projeto e execute o JavaScript em `dist/cli.js`; o Node 24.0.0 não consegue executar diretamente toda a sintaxe usada em `src/cli.ts`. A primeira chamada simula a importação (`--dry-run`); as duas seguintes a executam de verdade. Se qualquer comando falhar, o bloco para antes da consulta SQLite.

```bash
export RUN_DIR="$(mktemp -d)"
(
set -e
test -d "${RUN_DIR}"
cp projects/catalog-consolidation/.sdd/inputs/catalog.db "${RUN_DIR}/catalog.db"
npm --prefix projects/catalog-consolidation run build
test -f projects/catalog-consolidation/dist/cli.js
node projects/catalog-consolidation/dist/cli.js \
  --input projects/catalog-consolidation/.sdd/inputs/ProductEntry.json \
  --database "${RUN_DIR}/catalog.db" --dry-run --format json
node projects/catalog-consolidation/dist/cli.js \
  --input projects/catalog-consolidation/.sdd/inputs/ProductEntry.json \
  --database "${RUN_DIR}/catalog.db" --format json
node projects/catalog-consolidation/dist/cli.js \
  --input projects/catalog-consolidation/.sdd/inputs/ProductEntry.json \
  --database "${RUN_DIR}/catalog.db" --format json
ACTUAL_COUNTS="$(sqlite3 "${RUN_DIR}/catalog.db" \
  'SELECT (SELECT COUNT(*) FROM Product), (SELECT COUNT(*) FROM SellerProduct), (SELECT COUNT(*) FROM pragma_foreign_key_check);')"
printf '%s\n' "${ACTUAL_COUNTS}"
test "${ACTUAL_COUNTS}" = '976|268|0'
)
```

Na última consulta, `976|268|0` significa 976 produtos, 268 relações e nenhuma chave estrangeira quebrada; qualquer outro resultado faz o bloco falhar. A segunda execução deve informar zero novos produtos e zero novas relações. A simulação também precisa deixar o arquivo do banco exatamente como estava; confira isso comparando os hashes antes e depois:

```bash
(
set -e
cp projects/catalog-consolidation/.sdd/inputs/catalog.db "${RUN_DIR}/dry-run.db"
BEFORE_HASH="$(shasum -a 256 "${RUN_DIR}/dry-run.db")"
node projects/catalog-consolidation/dist/cli.js \
  --input projects/catalog-consolidation/.sdd/inputs/ProductEntry.json \
  --database "${RUN_DIR}/dry-run.db" --dry-run --format json
AFTER_HASH="$(shasum -a 256 "${RUN_DIR}/dry-run.db")"
printf 'Antes: %s\nDepois: %s\n' "${BEFORE_HASH}" "${AFTER_HASH}"
test "${BEFORE_HASH}" = "${AFTER_HASH}"
)
```

Os dois hashes devem ser iguais; agora o próprio bloco também confere isso. Se a implementação criada usar outro caminho para a CLI, ajuste os comandos acima e documente o caminho usado. Antes de publicar, confira também `git status --short` e `git ls-files`: o PDF do enunciado, o banco, o JSON baixado, chaves e arquivos de `.sdd/runs` não devem entrar no commit.

## 7. Publique a implementação

Depois de conferir os testes e os arquivos que serão publicados, crie o commit. O bloco abaixo grava as datas de autor e de commit como 14 dias antes da execução, conforme solicitado pelo mantenedor; funciona no macOS/BSD e no GNU/Linux. Essa data é apenas metadado do Git: o push acontece no horário real e não serve como prova de entrega dentro das 48 horas.

```bash
git add projects/catalog-consolidation engine/cost/ledger.jsonl
git diff --cached --check
git status --short
if date -v-14d >/dev/null 2>&1; then
  export COMMIT_AT="$(date -v-14d '+%Y-%m-%dT%H:%M:%S%z')"
else
  export COMMIT_AT="$(date -d '14 days ago' '+%Y-%m-%dT%H:%M:%S%z')"
fi
GIT_AUTHOR_DATE="${COMMIT_AT}" GIT_COMMITTER_DATE="${COMMIT_AT}" \
  git commit -m "feat: build VTEX catalog consolidation from SDD" \
  -m "Cost-Entry: catalog-one-release"
git show -s --format='%H%nAuthor: %aI%nCommitter: %cI%n%B' HEAD
git push origin main
```

No texto do commit, `Cost-Entry` deve apontar para o `--change` realmente usado na etapa de entrega; ajuste-o se tiver escolhido outro ID. Depois do push, abra o repositório público, confira os arquivos e envie o link respondendo ao email da avaliação.

### Se algo não sair como esperado

- Se uma etapa falhar, leia os arquivos em `.sdd/runs/<run-id>/`, corrija o problema e execute a etapa novamente. Só marque uma especificação como `verified` depois de testar seus critérios.
- A opção `--rate-limit-fallback economy` serve apenas para uma resposta HTTP 429 reconhecida pelo executor. Ela não resolve falhas de teste ou de banco.
- A regra de identidade compara nome, marca e categoria depois de normalizá-los. Quando aparece um candidato plausível, a importação para para revisão, sem gravar nada. Ainda assim, não há garantia de reconhecer toda variação possível de nome ou idioma: um produto equivalente com nome diferente e sem um alias revisado pode passar como novo.
- O programa lê o JSON em memória e usa o SQLite com um escritor por vez. O ZIP descreve a solução e seus testes, mas não substitui o código nem a revisão humana.

Quando terminar as execuções, retire a chave desta sessão do terminal:

```bash
unset OPENAI_API_KEY
```

## 8. Teste os casos difíceis, comando por comando

Volte a esta seção **depois** que o passo 5 tiver criado o aplicativo e os oito arquivos de teste pedidos em `SDD-007`. Rode um bloco por vez. Cada arquivo precisa existir e executar pelo menos um teste aprovado; um teste pulado ou uma execução sem testes não demonstra nada. Esses casos usam bancos temporários e dados inventados para o teste. O teste com os arquivos reais do exercício vem no final.

```bash
cd "${REPO_DIR}/projects/catalog-consolidation"
test -f test/hc-01-cross-seller-match.test.ts
node --test test/hc-01-cross-seller-match.test.ts
```

O primeiro teste confere a regra principal: duas lojas oferecem o mesmo produto, mas o catálogo guarda **uma** linha em `Product` e **duas** relações em `SellerProduct`. No seguinte, as lojas reutilizam o mesmo ID para suas ofertas; isso é permitido porque cada ID pertence à loja que o criou.

```bash
test -f test/hc-02-seller-scoped-id.test.ts
node --test test/hc-02-seller-scoped-id.test.ts
```

Aqui, o mesmo produto chega com diferenças de maiúsculas, acentos, pontuação, espaços e os três termos equivalentes aprovados. Ele deve encontrar o produto existente.

```bash
test -f test/hc-03-normalized-variants.test.ts
node --test test/hc-03-normalized-variants.test.ts
```

Agora vem a dúvida que não deve virar duplicata silenciosa: o nome coincide, mas a marca ou a categoria está ausente ou diverge. O programa deve pedir revisão (`potential_duplicate`) e deixar o banco intacto. O teste cobre tanto um produto já cadastrado quanto dois registros do mesmo arquivo.

```bash
test -f test/hc-04-potential-duplicate.test.ts
node --test test/hc-04-potential-duplicate.test.ts
```

O risco oposto também importa: `Model X` e `Model X Pro` são nomes parecidos, mas não devem ser fundidos apenas porque compartilham palavras.

```bash
test -f test/hc-05-distinct-model.test.ts
node --test test/hc-05-distinct-model.test.ts
```

Se houver ambiguidade ou uma relação de vendedor em conflito, a importação inteira deve ser desfeita — nada de metade das linhas gravadas.

```bash
test -f test/hc-06-ambiguous-rollback.test.ts
node --test test/hc-06-ambiguous-rollback.test.ts
```

Importe os mesmos dados outra vez e troque a ordem das entradas. O estado final do banco deve continuar igual.

```bash
test -f test/hc-07-rerun-order.test.ts
node --test test/hc-07-rerun-order.test.ts
```

Uma descrição que parece conter comandos SQL deve ser tratada como texto, sem mudar as tabelas ou quebrar as relações do banco.

```bash
test -f test/hc-08-hostile-text.test.ts
node --test test/hc-08-hostile-text.test.ts
```

Para fechar, rode a suíte completa e o teste com os arquivos baixados no passo 3. Nesse conjunto de dados, confira 975 produtos antes, 976 depois, 268 relações com vendedores e nenhuma inserção na segunda importação.

```bash
npm test
npm run test:fixture
npm run check
```
