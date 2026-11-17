# SIED SYSTEM V5 — Verificação M11 (Iteração 2 — persistência + comandos Tauri)

Data: 2026-11-17 (America/Sao_Paulo)

## Escopo

A primeira iteração do M11 (ver `2026-11-17-m11-agendamento-core.md`) entregou o núcleo determinístico: `ScheduleConfig` + `window_status()` puro. Essa iteração fecha a persistência e expõe tudo ao frontend via três comandos Tauri — a UI (modal de agendamento migrado do `localStorage` para `ScheduleConfig`) fica para um ajuste de App.tsx em outra iteração.

## Mudanças

### `src-tauri/src/storage.rs` — I/O em texto plano

Adicionadas três funções irmãs das `secure_write/secure_read/exists_within`:

- **`write_plain(root, subpath, bytes)`** — grava bytes em claro, com o mesmo padrão tmp + rename atômico do `secure_write`. Para **preferências não sensíveis** (horários, filtros, flags). O usuário precisa poder abrir o arquivo em notepad.exe sem o app rodar.
- **`read_plain(root, subpath)`** — contraparte.
- **`exists_within(root, subpath)`** — verifica presença sem levantar erro.

Separação explícita: conteúdo policial sensível continua indo por `secure_write` (DPAPI). Preferências vão por `write_plain`.

### `src-tauri/src/scheduler.rs` — persistência via storage

Adicionadas duas funções novas, mais uma constante:

- **`CONFIG_SUBPATH = "config/schedule.json"`** — caminho relativo à `app_data_root`.
- **`save_config(root, cfg)`** — valida, serializa como JSON pretty em camelCase, grava via `storage::write_plain`. Qualquer erro de validação impede a escrita (`storage::exists_within` prova que o arquivo não foi criado).
- **`load_config(root)`** — se `schedule.json` não existir, devolve `ScheduleConfig::default_disabled()` silenciosamente (primeiro uso do app). Se existir mas conter JSON malformado ou config inválida, devolve `Err` com mensagem clara — a camada superior decide se perguntar ao usuário "quer corrigir ou reiniciar com default?". **Nunca** silenciosamente troca por default — perder o agendamento sem avisar seria pior do que falhar.

### `src-tauri/src/lib.rs` — três comandos Tauri novos

- `get_schedule_config() -> ScheduleConfig` — lê do disco.
- `set_schedule_config(config) -> ScheduleConfig` — valida, grava, releia e devolve (confirma persistência).
- `check_schedule_window(at: {nowDow, nowMinuteOfDay, tasksDoneInWindow}) -> WindowStatus` — carrega config do disco e roda `window_status`. A UI pode chamar periodicamente para mostrar status atual ("em janela", "janela abre em 1h27", "dia não selecionado").

### `src/services.local.ts` — wrappers TS

- Tipos: `ScheduleConfig`, `WindowReason`, `WindowStatus`.
- Funções: `getScheduleConfig()`, `setScheduleConfig(cfg)`, `checkScheduleWindow(at)`.
- Helper `currentWindowInput(tasksDoneInWindow = 0)` que calcula `nowDow` + `nowMinuteOfDay` a partir de `new Date()`. Isso centraliza a conversão de fuso (`Date.getDay()` e `Date.getHours()` são locais do usuário), evitando que cada caller recrie essa lógica.

## Arquivos alterados

- `src-tauri/src/storage.rs` — 3 funções + 3 testes.
- `src-tauri/src/scheduler.rs` — persistência + constante + 5 testes.
- `src-tauri/src/lib.rs` — 3 `#[tauri::command]` + registro no invoke_handler.
- `src/services.local.ts` — 3 tipos + 3 wrappers + helper.

Nenhuma dependência nova.

## Testes acrescentados (Rust 83 → 91, +8)

### `storage::tests` (3)

- `write_plain_round_trips_bytes_and_cleans_tmp` — grava, lê de volta igual, nenhum `.tmp` residual.
- `exists_within_returns_false_for_missing_and_true_for_present`.
- `write_plain_rejects_dotdot_escape` — `../out.json` → erro com `..`.

### `scheduler::tests` (5)

- `load_config_returns_default_disabled_when_file_missing` — primeiro uso.
- `save_then_load_round_trips_config` — grava config completa, lê, compara.
- `save_rejects_invalid_config_before_writing_file` — `start == end` → erro, arquivo não criado.
- `load_config_rejects_malformed_json_without_falling_back_to_default` — "{ not json" → erro com "inválido".
- `load_config_rejects_well_formed_json_that_fails_validation` — JSON válido com `daysOfWeek: [7]` → erro com "dayOfWeek".

## Testes executados

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```
Resultado: **91 passed; 0 failed**.

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```
Resultado: exit 0.

```powershell
python tests/sqlite-contract.py
```
Resultado: PASS.

```powershell
node --test tests/*.test.mjs
```
Resultado: 54/54.

```powershell
npm run build
```
Resultado: exit 0. Bundle sem mudança (271,09 KB / 82,64 KB gzip) — TS wrappers são tipos finos que o compilador apaga.

## Não feito nesta entrega

### Migração do modal `schedule` em App.tsx

O painel React ainda guarda start/end como strings `"08:00"`/`"18:00"` em `Preferences` do localStorage. Precisa:

1. Trocar `Preferences` por uma estrutura que combine localStorage (coisas por-dispositivo) e ScheduleConfig (coisas compartilhadas entre sessões).
2. Parsing `HH:MM` → `minuto_do_dia` ao salvar; formato inverso ao carregar.
3. Adicionar checkboxes para `daysOfWeek` (hoje só tem start/end).
4. Adicionar campo `maxTasksPerWindow`.
5. No botão "salvar", chamar `setScheduleConfig` em vez de só persistir no localStorage.
6. Indicador visual do `checkScheduleWindow` atual no dashboard (ex.: badge "em janela — 7/50 tarefas processadas" ou "fora da janela — próxima em 1h27").

### Integração com `acquire_next_pending`

O ciclo sintético `desktop_run_synthetic_cycle` do M7 ainda chama `acquire_next_pending_on` sem consultar o schedule. O próximo passo: em modo "scheduled", só chamar `acquire_next_pending` depois de verificar `check_schedule_window`. Uma opção limpa é um novo comando `desktop_run_scheduled_cycle` que embrulha a verificação.

### Contagem de tarefas por janela

`tasks_done_in_window` vem do caller. Quem incrementa? Uma primeira versão pode gastar uma linha em `app_config` (ou um novo arquivo `config/schedule-progress.json`) com `{current_window_id, tasks_done}`. `current_window_id` é derivado da data de início da janela corrente. Ao mudar de janela, zera.

### Comando "quando abre a próxima janela"

`check_schedule_window` devolve apenas boolean + reason. Uma versão enriquecida com "próximo evento" (abertura ou fechamento) + minutos até lá torna a UI muito mais útil.

## Ambiente

- Rustc 1.100.0, Node 26.13.1, Python 3.12.10
- Windows 10 Home 19045

## Próximo marco

- **M11 UI** (pequena iteração): migrar modal. Depois disso, M11 está fechado.
- **M9** (revisão humana): editor de minuta, consome `runOllamaAnalysis` do M8 integração. Precisa Ollama para testar end-to-end, mas pode fazer UI com fixture.
- **Worker Node real** — bloqueado por sessão PPE.
