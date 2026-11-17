/**
 * SIED V5 - Inspeção assistida LEITURA-APENAS do portal oficial.
 * Executar localmente: npm run ppe:inspecionar
 * O OPERADOR realiza login/OTP e escolhe o filtro e o item por vontade própria.
 * O script NÃO preenche formulários, despacha, assina, baixa documentos, nem envia dados.
 * Não salva fotos, PDF, cookies, narrativa ou dados pessoais em logs/arquivos do projeto.
 * O perfil persistente do Edge é mantido localmente e herda os controles do navegador.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { OFFICIAL_LOGIN, OFFICIAL_PPE_SEARCH, findUniqueExactBo, isOfficialPpeUrl, isPesquisarUrl, isVisualizarUrl, norm } from '../src/ppe/contract.mjs';
import { inspectSearchPage, openExactBoReadOnly, readBoTabs } from '../src/ppe/reader.mjs';
import { createReadResultEvent, stringifyBridgeEvent } from '../src/ppe/bridge-protocol.mjs';
import { parseInspectionArgs } from '../src/ppe/cli-options.mjs';

const rl = createInterface({ input, output });
let context;
const ask = question => rl.question(question);

async function ppePage(expect = 'any') {
  const pages = context.pages().filter(p => isOfficialPpeUrl(p.url()));
  let candidates;
  if (expect === 'pesquisar') candidates = pages.filter(p => isPesquisarUrl(p.url()));
  else if (expect === 'visualizar') candidates = pages.filter(p => isVisualizarUrl(p.url()));
  else candidates = pages;
  const descricao = expect === 'any' ? 'PPE' : `PPE (${expect})`;
  if (candidates.length === 0) {
    throw new Error(`Página ${descricao} não encontrada. Abra a aba correta antes de continuar.`);
  }
  if (candidates.length > 1) {
    const urls = candidates.map(p => p.url()).join(' | ');
    throw new Error(`Várias abas ${descricao} abertas (${candidates.length}). Feche as duplicadas para evitar escolher outra ocorrência: ${urls}`);
  }
  return candidates[0];
}

async function main() {
  const options = parseInspectionArgs(process.argv.slice(2));
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { throw new Error('Playwright não instalado. Rode: npm install --save-dev playwright'); }
  const profile = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'SIED-System-V5', 'perfil-edge');
  fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
  context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge', headless: false, acceptDownloads: false,
    // Sem extensão nem depuração remota: não coletar credenciais ou tokens.
    args: ['--disable-extensions'],
  });
  let page = context.pages()[0] || await context.newPage();
  console.log('\nSIED SYSTEM V5 — INSPEÇÃO ASSISTIDA (SOMENTE LEITURA)');
  console.log('Faça CPF, senha e OTP SOMENTE no portal oficial, nunca no terminal.');
  await page.goto(OFFICIAL_LOGIN, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await ask('\nApós entrar manualmente no portal e abrir o PPE, pressione ENTER aqui. ');
  page = await ppePage('pesquisar');
  await page.goto(OFFICIAL_PPE_SEARCH, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await ask('No PPE, escolha Situação = Registrado e "100 itens por página"; pressione ENTER quando a tabela estiver visível. ');
  const search = await inspectSearchPage(page);
  const registered = search.rows.filter(row => row.status === 'Registrado');
  console.log(`Tabela reconhecida: ${search.rows.length} linhas nesta página; ${registered.length} com situação exatamente Registrado.`);
  console.log(`Controle de página: ${search.pageSize ?? 'não reconhecido'} itens; total exibido: ${search.total ?? 'não reconhecido'}.`);
  if (search.pageSize === 10) console.log('Atenção: página ainda apresenta 10 itens. Você pode alterar para 100 no PPE.');
  const number = options.number
    ? norm(options.number)
    : norm(await ask('Informe somente o número EXATO de um B.O. que você tem autorização para consultar: '));
  const selected = findUniqueExactBo(registered, number);
  console.log(`Linha única conferida: ${selected.number} | Natureza: ${selected.nature} | Situação: ${selected.status}`);
  // Exige um único link de visualização dentro da mesma linha; ambiguidades interrompem a inspeção.
  await openExactBoReadOnly(page, selected.number);
  page = await ppePage('visualizar');
  console.log('Documento aberto e número do B.O. validado. Inspecionando apenas abas de leitura...');
  const summary = await readBoTabs(page, selected.number);
  console.log('\nResultado estrutural (sem conteúdo pessoal):');
  console.log(' - completude: ' + summary.completeness);
  for (const label of summary.recognizedTabs) console.log(' - aba reconhecida: ' + label);
  for (const reason of summary.reasons) console.log(' - pendência técnica: ' + reason);
  console.log(stringifyBridgeEvent(createReadResultEvent(selected.number, summary)));
  console.log('\nInspeção concluída. Nenhum despacho, assinatura ou alteração no PPE foi realizada.');
  await ask('Pressione ENTER para fechar este navegador de inspeção. ');
}

try { await main(); }
catch (error) { console.error('\nInterrompido com segurança: ' + (error instanceof Error ? error.message : 'erro desconhecido')); process.exitCode = 1; }
finally { rl.close(); await context?.close().catch(() => {}); }
