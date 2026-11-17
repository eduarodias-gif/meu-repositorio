import test from 'node:test';
import assert from 'node:assert/strict';
import { processQueueRows } from '../src/worker/queue-processor.mjs';

const rows = [
  { number: '00000001/2026', nature: 'Furto', status: 'PENDENTE' },
  { number: '00000002/2026', nature: 'Roubo', status: 'PENDENTE' },
  { number: '00000003/2026', nature: 'Dano', status: 'AGUARDANDO_REVISAO' },
];

function statusRecorder() {
  const transitions = [];
  return {
    transitions,
    updateStatus: async (number, status, reason) => {
      transitions.push({ number, status, reason });
    },
  };
}

test('moves a complete structural read to human review without official write actions', async () => {
  const recorder = statusRecorder();
  const result = await processQueueRows([rows[0]], {
    readBo: async () => ({ completeness: 'CONCLUIDA', recognizedTabs: ['Dados do Registro'], reasons: [] }),
    updateStatus: recorder.updateStatus,
  });

  assert.deepEqual(recorder.transitions.map(item => item.status), [
    'EM_LEITURA',
    'LIDO',
    'EM_ANALISE',
    'MINUTA_GERADA',
    'AGUARDANDO_REVISAO',
  ]);
  assert.equal(result.processed, 1);
  assert.equal(result.stoppedReason, null);
  assert.deepEqual(result.results, [{ number: '00000001/2026', outcome: 'REVIEW' }]);
});

test('sends a partial read directly to review with sanitized structural reasons', async () => {
  const recorder = statusRecorder();
  await processQueueRows([rows[0]], {
    readBo: async () => ({
      completeness: 'PARCIAL',
      recognizedTabs: ['Dados do Registro'],
      reasons: ['ABA_AUSENTE: Documentos'],
    }),
    updateStatus: recorder.updateStatus,
  });

  assert.deepEqual(recorder.transitions.map(item => [item.status, item.reason]), [
    ['EM_LEITURA', 'Leitura estrutural iniciada.'],
    ['AGUARDANDO_REVISAO', 'Leitura parcial: ABA_AUSENTE: Documentos'],
  ]);
});

test('marks restricted access and stops before processing another B.O.', async () => {
  const recorder = statusRecorder();
  const requested = [];
  const result = await processQueueRows(rows, {
    readBo: async number => {
      requested.push(number);
      return { completeness: 'RESTRITA', recognizedTabs: [], reasons: ['ACESSO_RESTRITO'] };
    },
    updateStatus: recorder.updateStatus,
  });

  assert.deepEqual(requested, ['00000001/2026']);
  assert.deepEqual(recorder.transitions.map(item => item.status), ['EM_LEITURA', 'RESTRITO']);
  assert.equal(result.stoppedReason, 'ACESSO_RESTRITO');
});

test('records session expiration as an error and stops the queue', async () => {
  const recorder = statusRecorder();
  const result = await processQueueRows(rows, {
    readBo: async () => ({ completeness: 'FALHA', recognizedTabs: [], reasons: ['SESSAO_EXPIRADA'] }),
    updateStatus: recorder.updateStatus,
  });

  assert.deepEqual(recorder.transitions.map(item => [item.status, item.reason]), [
    ['EM_LEITURA', 'Leitura estrutural iniciada.'],
    ['ERRO', 'Sessão oficial expirada. Autentique novamente no portal.'],
  ]);
  assert.equal(result.stoppedReason, 'SESSAO_EXPIRADA');
  assert.equal(result.processed, 1);
});

test('does not retry or continue when persistence fails after a read', async () => {
  const transitions = [];
  let reads = 0;

  await assert.rejects(
    processQueueRows(rows, {
      readBo: async () => {
        reads += 1;
        return { completeness: 'CONCLUIDA', recognizedTabs: [], reasons: [] };
      },
      updateStatus: async (number, status) => {
        transitions.push([number, status]);
        if (status === 'LIDO') throw new Error('falha de persistência');
      },
    }),
    /falha de persistência/,
  );

  assert.equal(reads, 1);
  assert.deepEqual(transitions.map(item => item[1]), ['EM_LEITURA', 'LIDO']);
});

test('honors cancellation before starting the next pending item', async () => {
  const recorder = statusRecorder();
  const controller = new AbortController();
  let reads = 0;
  const result = await processQueueRows(rows, {
    signal: controller.signal,
    readBo: async () => {
      reads += 1;
      controller.abort();
      return { completeness: 'PARCIAL', recognizedTabs: [], reasons: ['TESTE_CANCELAMENTO'] };
    },
    updateStatus: recorder.updateStatus,
  });

  assert.equal(reads, 1);
  assert.equal(result.stoppedReason, 'CANCELADO');
  assert.equal(result.processed, 1);
});
