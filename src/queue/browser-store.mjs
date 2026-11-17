const STORAGE_KEY = 'sied-v5-browser-queue-v1';

const STATUSES = new Set([
  'PENDENTE',
  'EM_LEITURA',
  'LIDO',
  'EM_ANALISE',
  'MINUTA_GERADA',
  'AGUARDANDO_REVISAO',
  'VALIDADO_PELO_RESPONSAVEL',
  'AGUARDANDO_FINALIZACAO',
  'CONCLUIDO_VERIFICADO',
  'ERRO',
  'RESTRITO',
]);

const ALLOWED_TRANSITIONS = new Map([
  ['PENDENTE', new Set(['EM_LEITURA', 'ERRO', 'RESTRITO'])],
  ['EM_LEITURA', new Set(['LIDO', 'AGUARDANDO_REVISAO', 'ERRO', 'RESTRITO'])],
  ['LIDO', new Set(['EM_ANALISE', 'AGUARDANDO_REVISAO', 'ERRO'])],
  ['EM_ANALISE', new Set(['MINUTA_GERADA', 'AGUARDANDO_REVISAO', 'ERRO'])],
  ['MINUTA_GERADA', new Set(['AGUARDANDO_REVISAO', 'VALIDADO_PELO_RESPONSAVEL', 'ERRO'])],
  ['AGUARDANDO_REVISAO', new Set(['EM_LEITURA', 'EM_ANALISE', 'VALIDADO_PELO_RESPONSAVEL', 'ERRO', 'RESTRITO'])],
  ['VALIDADO_PELO_RESPONSAVEL', new Set(['AGUARDANDO_FINALIZACAO', 'AGUARDANDO_REVISAO', 'ERRO'])],
  ['AGUARDANDO_FINALIZACAO', new Set(['CONCLUIDO_VERIFICADO', 'AGUARDANDO_REVISAO', 'ERRO'])],
  ['CONCLUIDO_VERIFICADO', new Set()],
  ['ERRO', new Set(['PENDENTE', 'EM_LEITURA', 'AGUARDANDO_REVISAO'])],
  ['RESTRITO', new Set(['AGUARDANDO_REVISAO'])],
]);

const QUEUE_STATUSES = new Set([
  'PENDENTE',
  'EM_LEITURA',
  'LIDO',
  'EM_ANALISE',
  'MINUTA_GERADA',
  'VALIDADO_PELO_RESPONSAVEL',
  'AGUARDANDO_FINALIZACAO',
]);
const REVIEW_STATUSES = new Set(['AGUARDANDO_REVISAO', 'ERRO', 'RESTRITO']);

function emptyState() {
  return { rows: [], audit: [] };
}

function readState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows) || !Array.isArray(parsed.audit)) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}

function writeState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createBrowserQueue(storage, now = () => new Date().toISOString()) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('Armazenamento local indisponível.');
  }

  function list() {
    return copy(readState(storage).rows);
  }

  function audit() {
    return copy(readState(storage).audit);
  }

  function add(number, nature) {
    const normalizedNumber = String(number ?? '').trim();
    const normalizedNature = String(nature ?? '').trim();
    if (!normalizedNumber) throw new Error('Informe o número do B.O.');
    if (!normalizedNature) throw new Error('Informe a natureza do B.O.');

    const state = readState(storage);
    if (state.rows.some(row => row.number === normalizedNumber)) {
      throw new Error('Este B.O. já está na fila local.');
    }

    const timestamp = now();
    state.rows.unshift({
      number: normalizedNumber,
      nature: normalizedNature,
      status: 'PENDENTE',
      reason: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    state.audit.push({
      number: normalizedNumber,
      from: null,
      to: 'PENDENTE',
      reason: 'B.O. adicionado à fila local do navegador.',
      createdAt: timestamp,
    });
    writeState(storage, state);
    return copy(state.rows);
  }

  function update(number, status, reason = '') {
    const normalizedNumber = String(number ?? '').trim();
    if (!STATUSES.has(status)) throw new Error(`Estado desconhecido: ${status}.`);

    const state = readState(storage);
    const row = state.rows.find(item => item.number === normalizedNumber);
    if (!row) throw new Error('B.O. não encontrado na fila local.');
    if (!ALLOWED_TRANSITIONS.get(row.status)?.has(status)) {
      throw new Error(`Transição inválida: ${row.status} → ${status}.`);
    }

    const timestamp = now();
    const previous = row.status;
    row.status = status;
    row.reason = String(reason ?? '').trim();
    row.updatedAt = timestamp;
    state.audit.push({
      number: normalizedNumber,
      from: previous,
      to: status,
      reason: row.reason,
      createdAt: timestamp,
    });
    writeState(storage, state);
    return copy(state.rows);
  }

  function summary() {
    const rows = readState(storage).rows;
    return {
      queue: rows.filter(row => QUEUE_STATUSES.has(row.status)).length,
      completed: rows.filter(row => row.status === 'CONCLUIDO_VERIFICADO').length,
      review: rows.filter(row => REVIEW_STATUSES.has(row.status)).length,
      errors: rows.filter(row => row.status === 'ERRO').length,
      restricted: rows.filter(row => row.status === 'RESTRITO').length,
      total: rows.length,
    };
  }

  return { list, add, update, summary, audit };
}

