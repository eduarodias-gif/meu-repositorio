# SIED SYSTEM V5 — Verificação M2 (121 pares de transição e SQL compartilhado)

Data: 2026-11-17 (America/Sao_Paulo)

## Problema resolvido

- Os testes Rust originais exerciam apenas 5 das 121 combinações da matriz de transição `transition_allowed`. Uma alteração silenciosa na matriz podia passar despercebida.
- O resumo da fila era calculado por duas consultas separadas: uma embutida em `queue_summary` (Rust) e outra copiada em `tests/sqlite-contract.py`. As duas podiam divergir.
- Nenhum teste cobria o comportamento de `initialize_schema` em isolamento (banco novo, legado V0.3, V0.3 com status desconhecido, reinicialização idempotente), o comportamento do resumo em banco vazio nem a atomicidade do `update_bo_status` (rejeição não muda linha nem auditoria; número inexistente é rejeitado sem auditoria).

## Mudanças arquiteturais

- Novo arquivo `src-tauri/src/sql/queue_summary.sql` com a consulta oficial de resumo (COALESCE+SUM garantindo 0, nunca NULL).
- Em `src-tauri/src/lib.rs`:
  - Nova constante `QUEUE_SUMMARY_SQL` com `include_str!`.
  - Extraído `fn initialize_schema(db: &Connection) -> Result<(), String>` — chamado por `connection(app)` e também usado diretamente pelos testes com SQLite em memória, sem precisar de `AppHandle`.
  - Novo `fn queue_summary_for(conn: &Connection) -> Result<QueueSummary, String>` que carrega a consulta do arquivo. O comando `#[tauri::command] queue_summary` é agora um wrapper que delega.
  - Extraídos `fn add_bo_on(conn: &mut Connection, number, nature)` e `fn update_bo_status_on(conn: &mut Connection, number, next_status, reason)`. Comandos Tauri delegam.
  - `update_bo_status_on` agora executa o SELECT de status atual dentro da mesma `transaction()` em que ocorrem o UPDATE e o INSERT na auditoria — se qualquer passo retornar `Err`, a transação é descartada (rollback implícito ao dropar `tx`). Assinatura e mensagem pública preservadas.
  - `QueueSummary` ganhou `PartialEq + Eq + Debug` e `BoRow` ganhou `Debug` para asserts legíveis.
- `tests/sqlite-contract.py` agora carrega `src-tauri/src/sql/queue_summary.sql` do disco em `SUMMARY_SQL` e usa essa string em todos os testes de resumo. A consulta copiada foi eliminada.

## Testes acrescentados

### Rust (`src-tauri/src/lib.rs::tests`), de 3 para 20

- `queue_status_parse_and_as_str_round_trip_for_every_v04_value` — roundtrip para os 11 estados.
- `queue_status_parse_rejects_unknown_legacy_and_whitespace_values` — inclui variantes legadas (`done`, `pending`, `review`), string vazia, valor com espaço no final, versões em minúsculo.
- `transition_allowed_matches_independent_truth_table_for_all_121_pairs` — compara cada um dos 11×11 pares com a função `expected_pair_allowed`, escrita à mão a partir da tabela do spec M2, sem invocar `transition_allowed` internamente.
- `transition_allowed_count_matches_spec_allowed_pairs` — total deve ser exatamente 31.
- `no_status_transitions_to_itself` — nenhum estado permite auto-transição.
- `concluido_verificado_is_terminal` — nenhum destino é permitido a partir de `CONCLUIDO_VERIFICADO`.
- `direct_jump_from_pendente_to_official_completion_is_rejected` — 7 saltos proibidos a partir de `PENDENTE` (não só `CONCLUIDO_VERIFICADO`, também `VALIDADO`, `AGUARDANDO_FINALIZACAO`, `LIDO`, etc.).
- `initialize_schema_creates_queue_and_audit_tables_on_fresh_connection`.
- `initialize_schema_is_idempotent_on_existing_v04_database` — segunda chamada em base V0.4 não duplica linhas nem audita.
- `initialize_schema_migrates_legacy_v03_once_without_duplicating_audit` — migra 3 linhas legadas, mapeia estados, preserva auditoria pré-existente, e a segunda chamada não re-migra.
- `initialize_schema_preserves_unknown_legacy_status_in_audit` — status legado desconhecido vira `AGUARDANDO_REVISAO` e a auditoria registra o valor original como `migrated_legacy_status:UNKNOWN_V02_STATE`.
- `queue_summary_for_returns_zeros_not_null_on_empty_database` — todos os 6 campos retornam 0.
- `queue_summary_for_counts_one_of_each_state_as_7_1_3_1_1_11` — um registro de cada um dos 11 estados: `(7, 1, 3, 1, 1, 11)`.
- `queue_summary_for_matches_the_mixed_python_contract_case` — mesmo caso misto do contrato Python: `(2, 1, 3, 1, 1, 6)`.
- `update_bo_status_on_valid_transition_moves_row_and_records_audit`.
- `update_bo_status_on_invalid_transition_rejects_without_mutating_row_or_audit` — `PENDENTE → CONCLUIDO_VERIFICADO` é rejeitado; a linha permanece `PENDENTE` e `audit_log` continua vazia.
- `update_bo_status_on_nonexistent_number_is_rejected_without_audit`.
- `add_bo_on_rejects_duplicate_with_specific_message_and_does_not_double_insert` — segunda inserção falha com a mensagem exata e existe apenas 1 linha em `bo_queue` e 1 entrada `action='added'` em `audit_log`.
- `queue_status_repeating_same_state_is_rejected_by_update` — tentativa de `PENDENTE → PENDENTE` é rejeitada.
- (Mantido) `bo_validation` — verifica `clean_number`.

### Python (`tests/sqlite-contract.py`), de 4 para 6

- `test_summary_sql_returns_zeros_not_null_on_empty_database` — consome `queue_summary.sql`, banco vazio retorna `(0, 0, 0, 0, 0, 0)`.
- `test_summary_sql_counts_one_of_each_state_as_7_1_3_1_1_11` — consome `queue_summary.sql`, um de cada estado retorna `(7, 1, 3, 1, 1, 11)`.
- `test_summary_sql_groups_mixed_case_as_2_1_3_1_1_6` — renomeado e passou a consumir `queue_summary.sql`.

## Arquivos alterados

- Criado `src-tauri/src/sql/queue_summary.sql`.
- `src-tauri/src/lib.rs` — refatorações e expansão de testes.
- `tests/sqlite-contract.py` — carrega `queue_summary.sql` do disco e acrescenta 2 testes.

## Testes executados

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Resultado: exit 0.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Resultado: 20 testes, 20 passaram, 0 falharam. Primeiro build com dependências (release compiladas antes, debug compiladas agora) demorou 5 min 52 s para compilar dependências + rodar testes; `test result: ok. 20 passed; 0 failed; 0 ignored` em 0.02 s de execução.

```powershell
python tests/sqlite-contract.py
```

Resultado: `PASS: schema V0.4, migração V0.3 e resumo da fila SQLite (SQL compartilhado)` — 6 funções de teste executadas, nenhum `AssertionError`.

```powershell
node --test tests/*.test.mjs
```

Resultado: 38 testes, 38 passaram, 0 falharam. Nenhuma suíte Node foi quebrada pela mudança do backend.

```powershell
npm run build
```

Resultado: exit 0. `tsc -b` + Vite 6.4.6 produziram `dist/` igual ao da verificação M1.

## Não feito nesta entrega

- Teste manual no desktop (rodar o instalador, adicionar B.O. duplicado, verificar que o `audit_log` persistido em `%APPDATA%\br.sied.systemv5\sied-v5-local.sqlite3` continua coerente). O backend foi provado em memória, mas a execução com disco real do usuário Windows ainda não foi observada nesta sessão.
- `npm run desktop:build` com as mudanças Rust não foi re-executado; o `.exe` NSIS gerado anteriormente ainda é da versão M0 do backend. Dá para regerar a qualquer momento — o `cargo build --release` será incremental agora (as dependências já estão compiladas em debug, release recompila mas os crates com build.rs ficam em cache separado).
- Testes de concorrência ("dois workers tentando `update_bo_status` na mesma linha simultaneamente") — ficam para M7, que é o marco onde a atomicidade importa para valer.

## Ambiente

- Node.js 26.13.1 / npm 11.20.0
- Rustc 1.100.0 stable-x86_64-pc-windows-msvc
- Python 3.12.10 (instalado nesta sessão via `winget Python.Python.3.12`)
- Windows 10 Home 19045
- Vite 6.4.6, TypeScript 5.8

## Próximo marco

M3 — Atualização consistente do dashboard: criar comando `snapshot_queue` em Rust que retorna `{rows, summary, revision}` numa leitura consistente, hook `useQueue` em TS, e cuidar de respostas fora de ordem.
