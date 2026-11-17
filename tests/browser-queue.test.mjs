import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserQueue } from '../src/queue/browser-store.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

const CLOCK = () => '2026-11-16T12:00:00.000Z';

test('persists a new B.O. across browser queue instances', () => {
  const storage = memoryStorage();
  const first = createBrowserQueue(storage, CLOCK);

  const rows = first.add('  00000001/2026  ', 'Furto');

  assert.deepEqual(rows, [{
    number: '00000001/2026',
    nature: 'Furto',
    status: 'PENDENTE',
    reason: '',
    createdAt: '2026-11-16T12:00:00.000Z',
    updatedAt: '2026-11-16T12:00:00.000Z',
  }]);
  assert.deepEqual(createBrowserQueue(storage, CLOCK).list(), rows);
  assert.deepEqual(first.summary(), {
    queue: 1,
    completed: 0,
    review: 0,
    errors: 0,
    restricted: 0,
    total: 1,
  });
});

test('rejects empty and duplicate identifiers without changing persisted rows', () => {
  const storage = memoryStorage();
  const queue = createBrowserQueue(storage, CLOCK);
  queue.add('00000002/2026', 'Roubo');

  assert.throws(() => queue.add('  ', 'Roubo'), /Informe o número do B\.O\./);
  assert.throws(() => queue.add('00000002/2026', 'Furto'), /já está na fila local/);
  assert.equal(queue.list().length, 1);
});

test('blocks an invalid status jump and records only successful transitions', () => {
  const storage = memoryStorage();
  const queue = createBrowserQueue(storage, CLOCK);
  queue.add('00000003/2026', 'Ameaça');

  assert.throws(
    () => queue.update('00000003/2026', 'CONCLUIDO_VERIFICADO', 'salto indevido'),
    /Transição inválida/,
  );
  assert.equal(queue.list()[0].status, 'PENDENTE');

  queue.update('00000003/2026', 'EM_LEITURA', 'Leitura iniciada');
  queue.update('00000003/2026', 'AGUARDANDO_REVISAO', 'Revisão humana necessária');

  assert.equal(queue.list()[0].status, 'AGUARDANDO_REVISAO');
  assert.deepEqual(queue.summary(), {
    queue: 0,
    completed: 0,
    review: 1,
    errors: 0,
    restricted: 0,
    total: 1,
  });
  assert.deepEqual(queue.audit().map(entry => [entry.from, entry.to]), [
    [null, 'PENDENTE'],
    ['PENDENTE', 'EM_LEITURA'],
    ['EM_LEITURA', 'AGUARDANDO_REVISAO'],
  ]);
});

test('counts verified, error and restricted states independently', () => {
  const storage = memoryStorage();
  const queue = createBrowserQueue(storage, CLOCK);
  queue.add('A/2026', 'Furto');
  queue.add('B/2026', 'Roubo');
  queue.add('C/2026', 'Dano');

  for (const status of ['EM_LEITURA', 'LIDO', 'EM_ANALISE', 'MINUTA_GERADA', 'VALIDADO_PELO_RESPONSAVEL', 'AGUARDANDO_FINALIZACAO', 'CONCLUIDO_VERIFICADO']) {
    queue.update('A/2026', status, 'Fluxo autorizado de teste');
  }
  queue.update('B/2026', 'ERRO', 'Falha simulada');
  queue.update('C/2026', 'RESTRITO', 'Acesso restrito simulado');

  assert.deepEqual(queue.summary(), {
    queue: 0,
    completed: 1,
    review: 2,
    errors: 1,
    restricted: 1,
    total: 3,
  });
});
