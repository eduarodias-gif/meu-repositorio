import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInspectionArgs } from '../src/ppe/cli-options.mjs';

test('accepts one explicit B.O. number for an assisted inspection', () => {
  assert.deepEqual(parseInspectionArgs(['--number', ' 00000001/2026 ']), { number: '00000001/2026' });
  assert.deepEqual(parseInspectionArgs([]), { number: null });
});

test('rejects missing, duplicated or unknown command-line options', () => {
  assert.throws(() => parseInspectionArgs(['--number']), /valor após --number/);
  assert.throws(() => parseInspectionArgs(['--number', '00000001/2026', '--number', '00000002/2026']), /uma única vez/);
  assert.throws(() => parseInspectionArgs(['--write']), /Opção não reconhecida/);
});
