import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { inspectSearchPage, openExactBoReadOnly, readBoTabs } from '../src/ppe/reader.mjs';

const fixture = name => readFile(new URL(`./fixtures/ppe/${name}`, import.meta.url), 'utf8');
let browser;
let page;

before(async () => {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage();
});

after(async () => { await browser?.close(); });

test('reads page size, total and synthetic rows without exposing involved people', async () => {
  await page.goto('about:blank');
  await page.setContent(await fixture('search.html'));
  const result = await inspectSearchPage(page);
  assert.equal(result.pageSize, 10);
  assert.equal(result.total, 3);
  assert.deepEqual(result.rows.map(row => row.number), ['00000001/2026', '00000002/2026', '00000003/2026']);
  assert.ok(result.rows.every(row => !('involved' in row)));
});

test('opens only the contextual view link for the exact registered B.O.', async () => {
  const complete = await fixture('bo-complete.html');
  await page.route('https://ppe.sinesp.gov.br/ppe/procedimento/1001/visualizar/', route => route.fulfill({ contentType: 'text/html', body: complete }));
  await page.goto('about:blank');
  await page.setContent(await fixture('search.html'));
  const opened = await openExactBoReadOnly(page, '00000001/2026');
  assert.equal(opened.number, '00000001/2026');
  assert.equal(page.url(), 'https://ppe.sinesp.gov.br/ppe/procedimento/1001/visualizar/');
  assert.equal((await readBoTabs(page, opened.number)).completeness, 'CONCLUIDA');
  await page.unrouteAll();
});

test('rejects a navigated record whose unique header is not the exact requested B.O.', async () => {
  await page.goto('about:blank');
  await page.route('https://ppe.sinesp.gov.br/ppe/procedimento/1001/visualizar/', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><h1>Boletim de Ocorrência 00000001/2026-OUTRO</h1><p>Referência: 00000001/2026</p>',
  }));
  await page.setContent(await fixture('search.html'));
  await assert.rejects(() => openExactBoReadOnly(page, '00000001/2026'), /não corresponde/);
  await page.unrouteAll();
});

test('refuses duplicated exact B.O. rows before clicking any link', async () => {
  await page.goto('about:blank');
  await page.setContent(await fixture('search.html'));
  await page.locator('tbody').evaluate(body => body.append(body.querySelector('tr').cloneNode(true)));
  await assert.rejects(() => openExactBoReadOnly(page, '00000001/2026'), /forma única/);
  assert.equal(page.url(), 'about:blank');
});

test('classifies missing documents, restricted access and expired sessions distinctly', async () => {
  await page.goto('about:blank');
  await page.setContent(await fixture('bo-partial.html'));
  const partial = await readBoTabs(page, '00000001/2026');
  assert.equal(partial.completeness, 'PARCIAL');
  assert.ok(partial.reasons.includes('ABA_AUSENTE: Documentos'));

  await page.setContent(await fixture('bo-restricted.html'));
  assert.equal((await readBoTabs(page, '00000001/2026')).completeness, 'RESTRITA');

  await page.setContent(await fixture('session-expired.html'));
  const expired = await readBoTabs(page, '00000001/2026');
  assert.equal(expired.completeness, 'FALHA');
  assert.deepEqual(expired.reasons, ['SESSAO_EXPIRADA']);
});

test('never clicks a tab-labelled link that targets a write action', async () => {
  await page.goto('about:blank');
  let unsafeRequests = 0;
  await page.route('https://ppe.sinesp.gov.br/ppe/procedimento/1001/assinar/', route => {
    unsafeRequests += 1;
    return route.abort();
  });
  await page.setContent(`
    <h1>Boletim de Ocorrência 00000001/2026</h1>
    <a role="tab" href="https://ppe.sinesp.gov.br/ppe/procedimento/1001/assinar/">Dados do Registro</a>
  `);
  const result = await readBoTabs(page, '00000001/2026');
  assert.equal(unsafeRequests, 0);
  assert.equal(page.url(), 'about:blank');
  assert.equal(result.completeness, 'PARCIAL');
  assert.ok(result.reasons.includes('ABA_INSEGURA: Dados do Registro'));
  await page.unrouteAll();
});

test('stops immediately when the session expires or access becomes restricted during traversal', async () => {
  await page.goto('about:blank');
  await page.setContent(await fixture('bo-complete.html'));
  await page.evaluate(() => {
    window.syntheticClicks = 0;
    document.querySelectorAll('[role="tab"]').forEach(tab => tab.addEventListener('click', () => {
      window.syntheticClicks += 1;
      if (window.syntheticClicks === 1) document.body.dataset.siedSessionExpired = 'true';
    }));
  });
  const expired = await readBoTabs(page, '00000001/2026');
  assert.equal(expired.completeness, 'FALHA');
  assert.deepEqual(expired.reasons, ['SESSAO_EXPIRADA']);
  assert.equal(await page.evaluate(() => window.syntheticClicks), 1);

  await page.setContent(await fixture('bo-complete.html'));
  await page.locator('[role="tab"]').first().evaluate(tab => tab.addEventListener('click', () => {
    document.body.dataset.access = 'restricted';
  }));
  const restricted = await readBoTabs(page, '00000001/2026');
  assert.equal(restricted.completeness, 'RESTRITA');
  assert.deepEqual(restricted.reasons, ['ACESSO_RESTRITO']);
});

test('requires an exact unique B.O. header and does not accept suffix or body references', async () => {
  await page.goto('about:blank');
  await page.setContent(`
    <h1>Boletim de Ocorrência 00000001/2026-OUTRO</h1>
    <p>Referência relacionada: 00000001/2026</p>
  `);
  assert.deepEqual(await readBoTabs(page, '00000001/2026'), {
    completeness: 'FALHA', recognizedTabs: [], reasons: ['NUMERO_NAO_CONFIRMADO'],
  });
});

test('requires a resolved panel and distinguishes explicit empty content from missing content', async () => {
  await page.goto('about:blank');
  await page.setContent(await fixture('bo-complete.html'));
  await page.locator('#documentos').evaluate(panel => panel.remove());
  const missingPanel = await readBoTabs(page, '00000001/2026');
  assert.equal(missingPanel.completeness, 'PARCIAL');
  assert.ok(missingPanel.reasons.includes('PAINEL_AUSENTE: Documentos'));

  await page.setContent(await fixture('bo-complete.html'));
  await page.locator('#documentos').evaluate(panel => {
    panel.textContent = '';
    panel.dataset.empty = 'true';
  });
  assert.equal((await readBoTabs(page, '00000001/2026')).completeness, 'CONCLUIDA');
});

test('resolves panels whose IDs contain JSF separators (: and .)', async () => {
  await page.goto('about:blank');
  await page.setContent(await fixture('bo-jsf-ids.html'));
  const result = await readBoTabs(page, '00000001/2026');
  assert.equal(result.completeness, 'CONCLUIDA');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.recognizedTabs.length, 9);
});

test('loading infinito vira PARCIAL com PAINEL_NAO_CARREGADO e NUNCA é tratado como leitura completa', async () => {
  await page.goto('about:blank');
  await page.setContent(await fixture('bo-loading-infinite.html'));
  const result = await readBoTabs(page, '00000001/2026');
  assert.equal(result.completeness, 'PARCIAL', 'timeout no painel não pode virar CONCLUIDA');
  assert.ok(
    result.reasons.includes('PAINEL_NAO_CARREGADO: Documentos'),
    `esperava PAINEL_NAO_CARREGADO: Documentos, veio: ${JSON.stringify(result.reasons)}`,
  );
  // Os outros oito painéis devem ter sido reconhecidos (não impacto do loading infinito).
  assert.equal(result.recognizedTabs.length, 8);
});

test('múltiplos cabeçalhos com B.O. diferentes geram NUMERO_NAO_CONFIRMADO', async () => {
  await page.goto('about:blank');
  await page.setContent(`
    <h1>Boletim de Ocorrência 99999999/2026</h1>
    <h2>Boletim de Ocorrência 00000001/2026</h2>
    <div role="tablist"><button role="tab" aria-controls="x">Dados do Registro</button></div>
    <section id="x">x</section>
  `);
  const result = await readBoTabs(page, '00000001/2026');
  assert.equal(result.completeness, 'FALHA');
  assert.deepEqual(result.reasons, ['NUMERO_NAO_CONFIRMADO']);
});

test('cabeçalhos duplicados com o MESMO número são aceitos (dedup)', async () => {
  await page.goto('about:blank');
  await page.setContent(`
    <h1>Boletim de Ocorrência 00000001/2026</h1>
    <h2>Boletim de Ocorrência 00000001/2026 - breadcrumb</h2>
    <h2>Boletim de Ocorrência 00000001/2026</h2>
    <div role="tablist"><button role="tab" aria-controls="r">Dados do Registro</button></div>
    <section id="r">r</section>
  `);
  const result = await readBoTabs(page, '00000001/2026');
  // Com dedup, 00000001/2026 continua único — mas "00000001/2026 - breadcrumb" pode
  // gerar outra captura (apenas se o regex casar o sufixo). O match é greedy: `\d+/\d+(?:-[A-Z0-9]+)?`,
  // então "00000001/2026 - breadcrumb" NÃO casa (há espaço antes do `-`). O resultado é único.
  assert.ok(result.completeness === 'CONCLUIDA' || result.completeness === 'PARCIAL',
    `esperava CONCLUIDA/PARCIAL, veio ${result.completeness}: ${JSON.stringify(result.reasons)}`);
  assert.ok(!result.reasons.includes('NUMERO_NAO_CONFIRMADO'),
    'número era confirmável após dedup');
});

test('sessão expirando APÓS loading do painel é detectada antes de marcar o painel como ok', async () => {
  await page.goto('about:blank');
  await page.setContent(await fixture('bo-complete.html'));
  // Simula um painel que começa em "loading" e depois sai de loading, mas no meio
  // disso a sessão expira. O reader deve retornar FALHA/SESSAO_EXPIRADA.
  await page.evaluate(() => {
    const panel = document.getElementById('documentos');
    panel.dataset.state = 'loading';
    setTimeout(() => {
      panel.dataset.state = 'ready';
      document.body.dataset.siedSessionExpired = 'true';
    }, 100);
  });
  const result = await readBoTabs(page, '00000001/2026');
  assert.equal(result.completeness, 'FALHA');
  assert.deepEqual(result.reasons, ['SESSAO_EXPIRADA']);
});
