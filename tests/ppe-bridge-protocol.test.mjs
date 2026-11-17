import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadResultEvent, parseBridgeLine, stringifyBridgeEvent } from '../src/ppe/bridge-protocol.mjs';

test('round-trips a sanitized structural PPE result', () => {
  const event = createReadResultEvent('00000001/2026', {
    completeness: 'PARCIAL',
    recognizedTabs: ['Dados do Registro'],
    reasons: ['ABA_AUSENTE: Documentos'],
    narrative: 'este conteúdo não pode sair do leitor',
  });

  const line = stringifyBridgeEvent(event);
  assert.match(line, /^SIED_BRIDGE /);
  assert.equal(line.includes('conteúdo não pode sair'), false);
  assert.deepEqual(parseBridgeLine(line), {
    version: 1,
    type: 'PPE_READ_RESULT',
    number: '00000001/2026',
    completeness: 'PARCIAL',
    recognizedTabs: ['Dados do Registro'],
    reasons: ['ABA_AUSENTE: Documentos'],
  });
});

test('rejects malformed identifiers and unsupported result values', () => {
  assert.throws(
    () => createReadResultEvent('TESTE-LOCAL/2026', { completeness: 'CONCLUIDA', recognizedTabs: [], reasons: [] }),
    /número completo de B\.O\./,
  );
  assert.throws(
    () => createReadResultEvent('00000001/2026', { completeness: 'DESCONHECIDA', recognizedTabs: [], reasons: [] }),
    /completude não reconhecida/i,
  );
});

test('rejects unrelated stdout and oversized structural fields', () => {
  assert.throws(() => parseBridgeLine('login efetuado'), /Linha não pertence ao bridge/);
  assert.throws(
    () => createReadResultEvent('00000001/2026', {
      completeness: 'FALHA',
      recognizedTabs: [],
      reasons: ['X'.repeat(301)],
    }),
    /motivo estrutural inválido/i,
  );
});
