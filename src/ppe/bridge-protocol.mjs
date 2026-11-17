const PREFIX = 'SIED_BRIDGE ';
const COMPLETENESS = new Set(['CONCLUIDA', 'PARCIAL', 'RESTRITA', 'FALHA']);
const NUMBER_PATTERN = /^\d{7,9}\/20\d\d(?:-[A-Z0-9]+)?$/;

function exactNumber(value) {
  const number = String(value ?? '').normalize('NFKC').trim().toUpperCase();
  if (!NUMBER_PATTERN.test(number)) {
    throw new Error('Informe um número completo de B.O. no padrão 00000000/2026, com eventual sufixo.');
  }
  return number;
}

function structuralList(value, label, maxLength) {
  if (!Array.isArray(value) || value.length > 20) throw new Error(`${label} estrutural inválido.`);
  return value.map(item => {
    if (typeof item !== 'string') throw new Error(`${label} estrutural inválido.`);
    const normalized = item.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.length > maxLength) throw new Error(`${label} estrutural inválido.`);
    return normalized;
  });
}

export function createReadResultEvent(number, summary) {
  const completeness = String(summary?.completeness ?? '').trim().toUpperCase();
  if (!COMPLETENESS.has(completeness)) throw new Error('Completude não reconhecida pelo bridge PPE.');
  return {
    version: 1,
    type: 'PPE_READ_RESULT',
    number: exactNumber(number),
    completeness,
    recognizedTabs: structuralList(summary?.recognizedTabs, 'Aba', 100),
    reasons: structuralList(summary?.reasons, 'Motivo', 300),
  };
}

export function stringifyBridgeEvent(event) {
  const sanitized = createReadResultEvent(event?.number, event);
  return PREFIX + JSON.stringify(sanitized);
}

export function parseBridgeLine(line) {
  if (typeof line !== 'string' || !line.startsWith(PREFIX)) {
    throw new Error('Linha não pertence ao bridge SIED.');
  }
  let parsed;
  try {
    parsed = JSON.parse(line.slice(PREFIX.length));
  } catch {
    throw new Error('JSON inválido no bridge SIED.');
  }
  if (parsed?.version !== 1 || parsed?.type !== 'PPE_READ_RESULT') {
    throw new Error('Evento incompatível com o bridge SIED.');
  }
  return createReadResultEvent(parsed.number, parsed);
}

