import {
  READ_ONLY_TABS,
  findUniqueExactBo,
  headerIndices,
  isVisualizarUrl,
  norm,
  toMetadata,
} from './contract.mjs';

async function sessionExpired(page) {
  if (await page.locator('[data-sied-session-expired="true"]').count()) return true;
  const loginForms = page.locator('form[action*="login"]');
  return await loginForms.count() > 0 && await page.locator('input[type="password"]').count() > 0;
}

async function accessRestricted(page) {
  return await page.locator('[data-access="restricted"], [data-access="denied"]').count() > 0;
}

async function exactHeaderNumber(page) {
  const candidates = [];
  for (const heading of await page.locator('h1, h2, [data-bo-number]').all()) {
    const explicit = await heading.getAttribute('data-bo-number');
    const text = norm(explicit || await heading.innerText());
    if (!explicit && !/boletim de ocorrência/i.test(text)) continue;
    const match = text.match(/\b\d{7,9}\/20\d\d(?:-[A-Z0-9]+)?\b/i);
    if (match) candidates.push(norm(match[0]).toUpperCase());
  }
  // Dedup para aceitar títulos repetidos com o mesmo número (ex.: breadcrumb + h1).
  // Se as regiões reconhecidas reportarem números diferentes, paramos com null —
  // não confiamos em "heurística" para escolher o principal.
  const unique = Array.from(new Set(candidates));
  return unique.length === 1 ? unique[0] : null;
}

function panelLocator(page, panelId) {
  // IDs reais de PPE/JSF podem conter `:` e `.` (por exemplo "form:bo:tabs:panel"),
  // que em seletores CSS iniciam pseudo-classes/classes. Usar o seletor de atributo
  // [id="..."] evita o problema sem precisar de CSS.escape. A regex abaixo é uma
  // defesa adicional: rejeitamos valores que contenham aspas, espaços ou outros
  // caracteres que poderiam quebrar o atributo.
  if (typeof panelId !== 'string') return null;
  if (!/^[A-Za-z][A-Za-z0-9_:.-]*$/.test(panelId)) return null;
  return page.locator(`[id="${panelId}"]`);
}

async function readOnlyTabTarget(page, label) {
  const tabs = page.getByRole('tab', { name: label, exact: true });
  const links = page.getByRole('link', { name: label, exact: true });
  const tabCount = await tabs.count();
  const linkCount = await links.count();
  const total = tabCount + linkCount;
  if (total !== 1) {
    return { reason: `${total > 1 ? 'ABA_AMBIGUA' : 'ABA_AUSENTE'}: ${label}` };
  }
  const target = tabCount === 1 ? tabs : links;
  const tagName = await target.evaluate(element => element.tagName.toUpperCase());
  const controls = norm(await target.getAttribute('aria-controls'));
  const href = norm(await target.getAttribute('href'));
  let panelId = controls;
  if (!panelId && tagName === 'A' && href.startsWith('#')) {
    panelId = decodeURIComponent(href.slice(1));
  }
  if (href && !href.startsWith('#')) return { reason: `ABA_INSEGURA: ${label}` };
  if (!panelId || !panelLocator(page, panelId)) return { reason: `PAINEL_AUSENTE: ${label}` };
  return { target, panelId };
}

async function recognizedTable(page) {
  const candidates = [];
  for (const table of await page.locator('table').all()) {
    const headers = await table.locator('thead tr').first().locator('th').allInnerTexts().catch(() => []);
    try {
      headerIndices(headers);
      candidates.push({ table, headers });
    } catch {
      // Unrelated table: it does not satisfy the PPE header contract.
    }
  }
  if (candidates.length !== 1) {
    throw new Error(`Tabela PPE não identificada de forma única (${candidates.length}).`);
  }
  return candidates[0];
}

async function tableRows(page) {
  if (await sessionExpired(page)) throw new Error('SESSAO_EXPIRADA');
  const { table, headers } = await recognizedTable(page);
  const rows = [];
  for (const locator of await table.locator('tbody tr').all()) {
    const cells = await locator.locator('td').allInnerTexts();
    if (cells.length < headers.length) continue;
    const metadata = toMetadata(headers, cells);
    if (metadata.number) rows.push({ ...metadata, locator });
  }
  if (!rows.length) throw new Error('Nenhum B.O. encontrado na tabela reconhecida.');
  return rows;
}

async function displayedPageSize(page) {
  const control = page.getByLabel(/itens por página/i);
  if (await control.count() !== 1) return null;
  const value = Number(await control.inputValue());
  return Number.isFinite(value) ? value : null;
}

async function displayedTotal(page) {
  const marker = page.locator('[data-result-total]');
  if (await marker.count() !== 1) return null;
  const explicit = Number(await marker.getAttribute('data-result-total'));
  if (Number.isFinite(explicit)) return explicit;
  const matches = (await marker.innerText()).match(/\d+/g);
  return matches?.length ? Number(matches.at(-1)) : null;
}

export async function inspectSearchPage(page) {
  const rows = await tableRows(page);
  return {
    pageSize: await displayedPageSize(page),
    total: await displayedTotal(page),
    rows: rows.map(({ locator: _locator, ...metadata }) => metadata),
  };
}

export async function openExactBoReadOnly(page, number) {
  const rows = await tableRows(page);
  const selected = findUniqueExactBo(rows, number);
  const links = [];
  for (const anchor of await selected.locator.locator('a[href]').all()) {
    const href = await anchor.getAttribute('href');
    if (!href) continue;
    const candidate = new URL(href, page.url()).toString();
    if (isVisualizarUrl(candidate)) links.push({ anchor, candidate });
  }
  if (links.length !== 1) {
    throw new Error(`Lupa de visualização não identificada de forma única (${links.length}).`);
  }
  await Promise.all([
    page.waitForURL(url => isVisualizarUrl(url.toString()), { timeout: 7000 }),
    links[0].anchor.click({ timeout: 7000 }),
  ]);
  if (await exactHeaderNumber(page) !== norm(selected.number).toUpperCase()) {
    throw new Error('Número do boletim aberto não corresponde ao esperado.');
  }
  const { locator: _locator, ...metadata } = selected;
  return metadata;
}

export async function readBoTabs(page, expectedNumber) {
  if (await sessionExpired(page)) {
    return { completeness: 'FALHA', recognizedTabs: [], reasons: ['SESSAO_EXPIRADA'] };
  }
  if (await accessRestricted(page)) {
    return { completeness: 'RESTRITA', recognizedTabs: [], reasons: ['ACESSO_RESTRITO'] };
  }
  if (await exactHeaderNumber(page) !== norm(expectedNumber).toUpperCase()) {
    return { completeness: 'FALHA', recognizedTabs: [], reasons: ['NUMERO_NAO_CONFIRMADO'] };
  }

  const recognizedTabs = [];
  const reasons = [];
  for (const label of READ_ONLY_TABS) {
    if (await sessionExpired(page)) {
      return { completeness: 'FALHA', recognizedTabs, reasons: ['SESSAO_EXPIRADA'] };
    }
    if (await accessRestricted(page)) {
      return { completeness: 'RESTRITA', recognizedTabs, reasons: ['ACESSO_RESTRITO'] };
    }
    const descriptor = await readOnlyTabTarget(page, label);
    if (!descriptor.target) {
      reasons.push(descriptor.reason);
      continue;
    }
    await descriptor.target.click({ timeout: 7000 });
    if (await sessionExpired(page)) {
      return { completeness: 'FALHA', recognizedTabs, reasons: ['SESSAO_EXPIRADA'] };
    }
    if (await accessRestricted(page)) {
      return { completeness: 'RESTRITA', recognizedTabs, reasons: ['ACESSO_RESTRITO'] };
    }
    let panel = panelLocator(page, descriptor.panelId);
    if (!panel || await panel.count() !== 1) {
      reasons.push(`PAINEL_AUSENTE: ${label}`);
      continue;
    }
    if (await panel.getAttribute('data-state') === 'loading') {
      try {
        await page.waitForFunction(
          panelId => document.getElementById(panelId)?.dataset.state !== 'loading',
          descriptor.panelId,
          { timeout: 1500 },
        );
      } catch {
        reasons.push(`PAINEL_NAO_CARREGADO: ${label}`);
        continue;
      }
      // Revalida sessão/acesso após o carregamento assíncrono: o portal pode
      // ter expirado a sessão ou restringido o acesso durante o loading.
      if (await sessionExpired(page)) {
        return { completeness: 'FALHA', recognizedTabs, reasons: ['SESSAO_EXPIRADA'] };
      }
      if (await accessRestricted(page)) {
        return { completeness: 'RESTRITA', recognizedTabs, reasons: ['ACESSO_RESTRITO'] };
      }
      panel = panelLocator(page, descriptor.panelId);
    }
    if (!panel || await panel.count() !== 1) {
      reasons.push(`PAINEL_AUSENTE: ${label}`);
      continue;
    }
    const panelState = norm(await panel.getAttribute('data-state')).toLowerCase();
    const panelAccess = norm(await panel.getAttribute('data-access')).toLowerCase();
    if (panelAccess === 'restricted' || panelAccess === 'denied') {
      return { completeness: 'RESTRITA', recognizedTabs, reasons: [`ACESSO_RESTRITO: ${label}`] };
    }
    if (panelState === 'error') {
      reasons.push(`PAINEL_ERRO: ${label}`);
      continue;
    }
    const explicitEmpty = await panel.getAttribute('data-empty') === 'true';
    const hasContent = norm(await panel.innerText()).length > 0;
    if (!explicitEmpty && !hasContent) {
      reasons.push(`CONTEUDO_AUSENTE: ${label}`);
      continue;
    }
    recognizedTabs.push(label);
  }
  return {
    completeness: reasons.length ? 'PARCIAL' : 'CONCLUIDA',
    recognizedTabs,
    reasons,
  };
}
