import test from 'node:test';
import assert from 'node:assert/strict';
import { isOfficialPpeUrl, isVisualizarUrl, isPesquisarUrl, findUniqueExactBo, headerIndices, toMetadata, READ_ONLY_TABS } from '../src/ppe/contract.mjs';
const headers = ['Número','Data Registro','Responsável','Unidade Registro/Apuração','Natureza(s)','Envolvidos','Situação','Ações'];
test('reconhece apenas origem e caminhos PPE esperados', () => {
  assert.ok(isOfficialPpeUrl('https://ppe.sinesp.gov.br/ppe/pesquisar/BO/'));
  assert.ok(isVisualizarUrl('https://ppe.sinesp.gov.br/ppe/procedimento/12345678/visualizar/'));
  assert.ok(!isVisualizarUrl('https://ppe.sinesp.gov.br/ppe/procedimento/12345678/assinar/'));
  assert.ok(!isOfficialPpeUrl('https://ppe.sinesp.gov.br.evil.test/ppe/'));
  assert.ok(!isOfficialPpeUrl('http://ppe.sinesp.gov.br/ppe/'));
  assert.ok(!isOfficialPpeUrl('https://ppe.sinesp.gov.br.evil.test/ppe/'));
});
test('mapeia colunas por título, não coordenadas', () => {
  assert.equal(headerIndices(headers)['Natureza(s)'], 4);
  assert.deepEqual(toMetadata(headers,['00000001/2026','13/11/26 10:00','A','B','PERDA','sigiloso','Registrado','']), {
    number:'00000001/2026',registeredAt:'13/11/26 10:00',nature:'PERDA',status:'Registrado'
  });
  assert.throws(() => headerIndices(['Número','Natureza(s)']),/não reconhecidos/);
});
test('seleciona B.O. exato, não o primeiro nem semelhante', () => {
  const rows=[{number:'00000001/2026',status:'Registrado'},{number:'00000002/2026',status:'Registrado'}];
  assert.equal(findUniqueExactBo(rows,'00000002/2026').number,'00000002/2026');
  assert.throws(()=>findUniqueExactBo(rows,'00000003/2026'),/não encontrado/);
  assert.throws(()=>findUniqueExactBo([rows[0],rows[0]],'00000001/2026'),/não encontrado/);
  assert.throws(()=>findUniqueExactBo([{number:'00000001/2026',status:'Registrado - Aguardando Aceite'}],'00000001/2026'),/Situação/);
});
test('isPesquisarUrl reconhece apenas o caminho de pesquisa oficial', () => {
  assert.ok(isPesquisarUrl('https://ppe.sinesp.gov.br/ppe/pesquisar/BO/'));
  assert.ok(isPesquisarUrl('https://ppe.sinesp.gov.br/ppe/pesquisar/BO'));
  assert.ok(!isPesquisarUrl('https://ppe.sinesp.gov.br/ppe/pesquisar/outra/'));
  assert.ok(!isPesquisarUrl('https://ppe.sinesp.gov.br/ppe/procedimento/1/visualizar/'));
  assert.ok(!isPesquisarUrl('http://ppe.sinesp.gov.br/ppe/pesquisar/BO/'));
  assert.ok(!isPesquisarUrl('https://ppe.sinesp.gov.br.evil.test/ppe/pesquisar/BO/'));
});
test('abas são exclusivamente de leitura', () => {
  assert.ok(READ_ONLY_TABS.includes('Relato/Histórico'));
  assert.ok(READ_ONLY_TABS.includes('Despachos'));
  assert.ok(!READ_ONLY_TABS.includes('Assinar'));
  assert.ok(!READ_ONLY_TABS.includes('Despachar'));
});
