import test from 'node:test';
import assert from 'node:assert/strict';
import { toUserError } from '../src/services/errors.mjs';

const FALLBACK = 'Falha genérica.';

test('Error com mensagem útil é preservado', () => {
  assert.equal(
    toUserError(new Error('Este B.O. já está na fila local.'), FALLBACK),
    'Este B.O. já está na fila local.',
  );
  assert.equal(
    toUserError(new Error('Transição de PENDENTE para CONCLUIDO_VERIFICADO não permitida.'), FALLBACK),
    'Transição de PENDENTE para CONCLUIDO_VERIFICADO não permitida.',
  );
});

test('string não vazia é preservada e aparada', () => {
  assert.equal(toUserError('Este B.O. já está na fila local.', FALLBACK), 'Este B.O. já está na fila local.');
  assert.equal(toUserError('   Transição inválida.   ', FALLBACK), 'Transição inválida.');
});

test('string vazia ou só espaços cai no fallback', () => {
  assert.equal(toUserError('', FALLBACK), FALLBACK);
  assert.equal(toUserError('   ', FALLBACK), FALLBACK);
  assert.equal(toUserError('\n\t ', FALLBACK), FALLBACK);
});

test('null e undefined caem no fallback', () => {
  assert.equal(toUserError(null, FALLBACK), FALLBACK);
  assert.equal(toUserError(undefined, FALLBACK), FALLBACK);
});

test('objeto desconhecido cai no fallback (sem vazar payload)', () => {
  assert.equal(toUserError({ code: 500, detail: 'secret' }, FALLBACK), FALLBACK);
  assert.equal(toUserError({ message: 'tecnico' }, FALLBACK), FALLBACK);
  assert.equal(toUserError([], FALLBACK), FALLBACK);
  assert.equal(toUserError(42, FALLBACK), FALLBACK);
  assert.equal(toUserError(true, FALLBACK), FALLBACK);
});

test('Error sem mensagem útil (erro genérico) cai no fallback', () => {
  assert.equal(toUserError(new Error(''), FALLBACK), FALLBACK);
  assert.equal(toUserError(new Error('   '), FALLBACK), FALLBACK);
});

test('fallback é devolvido literalmente quando a entrada não tem texto aproveitável', () => {
  const customFallback = 'Mensagem técnica sanitizada de reserva.';
  assert.equal(toUserError(null, customFallback), customFallback);
  assert.equal(toUserError({}, customFallback), customFallback);
});

test('a mensagem de duplicidade do Rust é preservada em qualquer forma (Error ou string)', () => {
  const duplicateMsg = 'Este B.O. já está na fila local.';
  assert.equal(toUserError(new Error(duplicateMsg), FALLBACK), duplicateMsg);
  assert.equal(toUserError(duplicateMsg, FALLBACK), duplicateMsg);
});
