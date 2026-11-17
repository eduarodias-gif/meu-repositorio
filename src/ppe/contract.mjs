/**
 * Contrato da integração PPE (somente leitura), independente do navegador.
 * NUNCA contém credenciais, OTP, dados pessoais, textos de B.O. ou assinatura.
 */
export const OFFICIAL_LOGIN = 'https://seguranca.sinesp.gov.br/sinesp-seguranca/login.jsf';
export const OFFICIAL_PPE_SEARCH = 'https://ppe.sinesp.gov.br/ppe/pesquisar/BO/';
export const REQUIRED_HEADERS = ['Número', 'Data Registro', 'Natureza(s)', 'Situação', 'Ações'];
export const READ_ONLY_TABS = [
  'Dados do Registro', 'Dados do Fato', 'Envolvidos', 'Vínculos',
  'Objetos', 'Relato/Histórico', 'Documentos', 'Histórico', 'Despachos',
];

export function isOfficialPpeUrl(candidate) {
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && url.hostname === 'ppe.sinesp.gov.br'
      && (url.pathname === '/ppe/' || url.pathname.startsWith('/ppe/'));
  } catch { return false; }
}

export function isVisualizarUrl(candidate) {
  if (!isOfficialPpeUrl(candidate)) return false;
  const url = new URL(candidate);
  return /^\/ppe\/procedimento\/\d+\/visualizar\/?$/.test(url.pathname);
}

export function isPesquisarUrl(candidate) {
  if (!isOfficialPpeUrl(candidate)) return false;
  const url = new URL(candidate);
  return /^\/ppe\/pesquisar\/BO\/?$/.test(url.pathname);
}

export function norm(value) { return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim(); }
export function findUniqueExactBo(rows, number) {
  const wanted = norm(number);
  if (!/^\d{7,9}\/20\d\d(?:-[A-Z0-9]+)?$/.test(wanted)) {
    throw new Error('Informe um número completo de B.O. no padrão 00000000/2026, com eventual sufixo.');
  }
  const found = rows.filter(row => norm(row.number) === wanted);
  if (found.length !== 1) throw new Error(`B.O. não encontrado de forma única (${found.length} correspondências). Pare e confira a tabela.`);
  if (norm(found[0].status) !== 'Registrado') {
    throw new Error('Situação não é exatamente Registrado. Nenhuma ação executada.');
  }
  return found[0];
}

export function headerIndices(headers) {
  const normalized = headers.map(norm);
  const indices = Object.fromEntries(REQUIRED_HEADERS.map(k => [k, normalized.indexOf(k)]));
  const missing = REQUIRED_HEADERS.filter(k => indices[k] < 0);
  if (missing.length) throw new Error('Cabeçalhos do PPE não reconhecidos: ' + missing.join(', '));
  return indices;
}

export function toMetadata(headers, cells) {
  const h = headerIndices(headers);
  return {
    number: norm(cells[h['Número']]),
    registeredAt: norm(cells[h['Data Registro']]),
    nature: norm(cells[h['Natureza(s)']]),
    status: norm(cells[h['Situação']]),
  };
}
