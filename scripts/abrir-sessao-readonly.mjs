/**
 * Ferramenta opcional para inspeção assistida e SOMENTE LEITURA.
 * Abra o portal, autentique manualmente e explore as telas; NÃO modifica B.O.s.
 * NÃO registra screenshots, senhas, conteúdo da página, cookies nem tokens em log.
 * Requer `npm install -D playwright` e Edge instalado. Não executa sozinho no app.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const profile = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'SIED-System-V5', 'browser-profile');
fs.mkdirSync(profile, { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  channel: 'msedge', headless: false, acceptDownloads: false,
  args: ['--disable-extensions'],
});
const page = context.pages()[0] || await context.newPage();
console.log('Abrindo portal oficial. Faça login/MFA manualmente no Edge.');
console.log('Esta ferramenta NÃO lê nem modifica ocorrências. Feche o navegador para terminar.');
await page.goto('https://seguranca.sinesp.gov.br/', { waitUntil: 'domcontentloaded' });
await new Promise(resolve => context.on('close', resolve));
