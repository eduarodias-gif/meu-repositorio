import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseUrl = process.env.SIED_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });

try {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    if (sessionStorage.getItem('sied-smoke-initialized') === 'yes') return;
    localStorage.setItem('sied-v5-demo-preferences', JSON.stringify({
      configured: true,
      selectedNature: [],
      start: '08:00',
      end: '18:00',
      scheduleEnabled: false,
    }));
    localStorage.removeItem('sied-v5-browser-queue-v1');
    sessionStorage.setItem('sied-smoke-initialized', 'yes');
  });

  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.getByRole('heading', { name: /Central de controle/i }).waitFor({ timeout: 7_000 });

  await page.getByLabel('Número do boletim').fill('TESTE-LOCAL/2026');
  await page.getByLabel('Natureza').selectOption({ label: 'Furto' });
  await page.getByRole('button', { name: 'ADICIONAR' }).click();

  await page.getByText('TESTE-LOCAL/2026', { exact: true }).waitFor();
  assert.match(await page.locator('.metric-card').first().innerText(), /01/);

  await page.reload();
  await page.getByRole('heading', { name: /Central de controle/i }).waitFor({ timeout: 7_000 });
  await page.getByText('TESTE-LOCAL/2026', { exact: true }).waitFor();

  await page.getByLabel('Número do boletim').fill('TESTE-LOCAL/2026');
  await page.getByRole('button', { name: 'ADICIONAR' }).click();
  await page.getByRole('alert').filter({ hasText: 'já está na fila local' }).waitFor();

  await page.getByRole('button', { name: 'INICIAR TESTE LOCAL' }).click({ timeout: 5_000 });
  await page.getByText('AGUARDANDO REVISAO', { exact: true }).waitFor();
  assert.match(await page.locator('.review-card').innerText(), /01/);

  await page.locator('.review-card').click();
  await page.getByRole('dialog', { name: 'Boletins para revisão' }).waitFor();
  await page.getByRole('button', { name: 'VALIDAR TESTE-LOCAL/2026' }).click({ timeout: 5_000 });
  await page.getByText('VALIDADO PELO RESPONSAVEL', { exact: true }).waitFor();
  assert.match(await page.locator('.review-card').innerText(), /00/);

  await page.getByRole('button', { name: 'PREPARAR FINALIZAÇÃO TESTE-LOCAL/2026' }).click({ timeout: 5_000 });
  await page.getByText('AGUARDANDO FINALIZACAO', { exact: true }).waitFor();

  await page.reload();
  await page.getByRole('heading', { name: /Central de controle/i }).waitFor({ timeout: 7_000 });
  await page.getByText('AGUARDANDO FINALIZACAO', { exact: true }).waitFor();

  console.log('SMOKE_OK: leitura, análise, minuta, revisão e preparação local para finalização verificadas.');
} finally {
  await browser.close();
}
