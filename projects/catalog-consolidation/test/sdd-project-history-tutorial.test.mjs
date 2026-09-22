import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tutorial = readFileSync(new URL('../TUTORIAL.md', import.meta.url), 'utf8');
const evidenceIndex = readFileSync(new URL('../docs/sdd/evidence-index.md', import.meta.url), 'utf8');

test('AC-009-03: Portuguese tutorial defends requirements and design-time orchestration', () => {
  assert.match(tutorial, /# Tutorial: consolidação de catálogo/i);
  assert.match(tutorial, /Cadeia de requisitos e evidências/);
  assert.match(tutorial, /Solicitação do usuário/);
  assert.match(tutorial, /Avaliação/);
  assert.match(tutorial, /Premissas/);
  assert.match(tutorial, /Observações de fixture/);
  assert.equal((tutorial.match(/```mermaid/g) ?? []).length >= 2, true);
  assert.match(tutorial, /DeepSeek Harness\/Cordis/);
  assert.match(tutorial, /runtime do catálogo continua determinístico e livre de modelos/);
  assert.match(tutorial, /único provedor é OpenAI/i);
  assert.match(tutorial, /contabilidade é datada/i);
  assert.match(tutorial, /Não há citação de artigo acadêmico/);
});

test('AC-009-04: tutorial supplies reproducible clean-clone, fixture, run, history, and extension commands', () => {
  for (const command of [
    'npm ci',
    'npm run check',
    'npm run sources:ingest && node --test test/sdd-consolidation-idempotency.test.mjs',
    'node dist/cli.js --input .sdd/inputs/ProductEntry.json --database "$tmpdir/catalog.db" --dry-run --format json',
    'npm --prefix engine run history:create -- --project catalog-consolidation --snapshot <novo-id-unico> --cutoff <YYYY-MM-DDTHH:MM:SSZ>',
    'npm --prefix engine run history:validate -- --project catalog-consolidation --snapshot <novo-id-unico>',
    'node --test test/sdd-product-identity.test.mjs',
    'git diff --check',
  ]) {
    assert.ok(tutorial.includes(command), `missing command: ${command}`);
  }
  assert.match(tutorial, /raciocínio privado/i);
  assert.match(tutorial, /replay criptografado/i);
  assert.match(tutorial, /caminhos absolutos/i);
  assert.match(tutorial, /credenciais/i);
  assert.match(tutorial, /PDFs/i);
  assert.match(tutorial, /bancos SQLite/i);
  assert.match(tutorial, /fixtures brutas/i);
  assert.match(tutorial, /symlinks/i);
  assert.match(evidenceIndex, /AC-009-03 \| verificado/);
  assert.match(evidenceIndex, /AC-009-04 \| verificado/);
  assert.match(evidenceIndex, /AC-009-01 \| pendente de operador externo/);
});
