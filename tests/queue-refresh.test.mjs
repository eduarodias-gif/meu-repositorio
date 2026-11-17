import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotRunner } from '../src/queue/snapshot-runner.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const EMPTY_SUMMARY = { queue: 0, completed: 0, review: 0, errors: 0, restricted: 0, total: 0 };

test('estado inicial é loading, sem dados, erro vazio', () => {
  const runner = createSnapshotRunner(async () => ({ rows: [], summary: EMPTY_SUMMARY, revision: 0 }));
  assert.equal(runner.state.loading, true);
  assert.equal(runner.state.hasData, false);
  assert.equal(runner.state.error, '');
  assert.deepEqual(runner.state.rows, []);
  assert.equal(runner.state.revision, 0);
});

test('refresh bem sucedido popula rows, summary, revision e marca hasData', async () => {
  const runner = createSnapshotRunner(async () => ({
    rows: [{ number: 'BO-1', nature: 'Furto', status: 'PENDENTE', reason: '', createdAt: 't', updatedAt: 't' }],
    summary: { queue: 1, completed: 0, review: 0, errors: 0, restricted: 0, total: 1 },
    revision: 42,
  }));
  await runner.refresh();
  assert.equal(runner.state.loading, false);
  assert.equal(runner.state.hasData, true);
  assert.equal(runner.state.rows.length, 1);
  assert.equal(runner.state.rows[0].number, 'BO-1');
  assert.equal(runner.state.summary.queue, 1);
  assert.equal(runner.state.revision, 42);
  assert.equal(runner.state.error, '');
});

test('resposta atrasada da primeira chamada NÃO sobrescreve resposta mais recente', async () => {
  const d1 = deferred();
  const d2 = deferred();
  let callIndex = 0;
  const runner = createSnapshotRunner(() => {
    callIndex += 1;
    if (callIndex === 1) return d1.promise;
    return d2.promise;
  });

  const p1 = runner.refresh();
  const p2 = runner.refresh();

  d2.resolve({ rows: [{ number: 'NEW' }], summary: { total: 1 }, revision: 2 });
  await p2;
  assert.equal(runner.state.revision, 2);
  assert.equal(runner.state.rows[0].number, 'NEW');

  d1.resolve({ rows: [{ number: 'OLD' }], summary: { total: 99 }, revision: 1 });
  await p1;
  assert.equal(runner.state.revision, 2, 'resposta atrasada não pode sobrescrever a mais recente');
  assert.equal(runner.state.rows[0].number, 'NEW');
});

test('erro após leitura bem sucedida preserva rows anteriores e seta mensagem específica', async () => {
  let callIndex = 0;
  const runner = createSnapshotRunner(async () => {
    callIndex += 1;
    if (callIndex === 1) {
      return {
        rows: [{ number: 'BO-ST', nature: 'Furto', status: 'PENDENTE', reason: '', createdAt: 't', updatedAt: 't' }],
        summary: { queue: 1, completed: 0, review: 0, errors: 0, restricted: 0, total: 1 },
        revision: 7,
      };
    }
    throw new Error('Banco temporariamente indisponível.');
  });

  await runner.refresh();
  assert.equal(runner.state.hasData, true);
  assert.equal(runner.state.rows.length, 1);
  assert.equal(runner.state.revision, 7);

  await runner.refresh();
  assert.equal(runner.state.error, 'Banco temporariamente indisponível.');
  assert.equal(runner.state.rows.length, 1, 'rows anteriores preservadas no estado stale');
  assert.equal(runner.state.revision, 7, 'revision anterior preservada');
  assert.equal(runner.state.hasData, true, 'hasData continua true pois ainda temos a leitura anterior');
});

test('erro inicial (nunca houve sucesso) deixa hasData false e seta mensagem', async () => {
  const runner = createSnapshotRunner(async () => { throw new Error('Arquivo de banco corrompido.'); });
  await runner.refresh();
  assert.equal(runner.state.hasData, false);
  assert.equal(runner.state.loading, false);
  assert.equal(runner.state.error, 'Arquivo de banco corrompido.');
  assert.deepEqual(runner.state.rows, []);
});

test('rejeição com string simples (como vem do invoke do Tauri) preserva a mensagem exata', async () => {
  const runner = createSnapshotRunner(async () => { throw 'Fila local indisponível.'; });
  await runner.refresh();
  assert.equal(runner.state.error, 'Fila local indisponível.');
});

test('rejeição com valor opaco cai no fallback configurado', async () => {
  const runner = createSnapshotRunner(async () => { throw { code: 500 }; }, { fallback: 'FALLBACK_X' });
  await runner.refresh();
  assert.equal(runner.state.error, 'FALLBACK_X');
});

test('resposta malformada (sem rows/summary) cai no fallback sem quebrar o runner', async () => {
  const runner = createSnapshotRunner(async () => ({ foo: 'bar' }), { fallback: 'Snapshot inválido.' });
  await runner.refresh();
  assert.equal(runner.state.error, 'Snapshot inválido.');
  assert.equal(runner.state.hasData, false);
});

test('dispose descarta respostas pendentes e impede refresh posterior', async () => {
  const d = deferred();
  const runner = createSnapshotRunner(() => d.promise);
  const p = runner.refresh();
  runner.dispose();
  d.resolve({ rows: [{ number: 'TARDIO' }], summary: EMPTY_SUMMARY, revision: 99 });
  await p;
  assert.equal(runner.state.hasData, false, 'estado posterior ao dispose não pode ganhar hasData');
  assert.equal(runner.state.rows.length, 0);

  // refresh após dispose não deve emitir nada novo
  await runner.refresh();
  assert.equal(runner.state.hasData, false);
});

test('subscribe recebe cada emissão e unsubscribe silencia o listener', async () => {
  const runner = createSnapshotRunner(async () => ({ rows: [{ number: 'A' }], summary: { total: 1 }, revision: 1 }));
  const events = [];
  const unsubscribe = runner.subscribe(s => events.push({ loading: s.loading, revision: s.revision }));

  await runner.refresh();
  assert.ok(events.length >= 2, `esperava >=2 eventos (loading+ready), obteve ${events.length}`);
  assert.equal(events[0].loading, true);
  assert.equal(events.at(-1).loading, false);
  assert.equal(events.at(-1).revision, 1);

  const before = events.length;
  unsubscribe();
  await runner.refresh();
  assert.equal(events.length, before, 'listener cancelado não recebe novos eventos');
});
