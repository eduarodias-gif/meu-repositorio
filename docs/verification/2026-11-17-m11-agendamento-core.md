# SIED SYSTEM V5 — Verificação M11 (Agendamento, núcleo)

Data: 2026-11-17 (America/Sao_Paulo)

## Escopo

M11 completo prevê: configuração persistida, lógica pura de janela, integração com `acquire_next_pending`, UI do modal de agendamento, e opcionalmente tarefa Windows Scheduler (`schtasks.exe`) para iniciar o app no horário.

**Esta entrega fecha o núcleo determinístico**: `src-tauri/src/scheduler.rs` com `ScheduleConfig` e `window_status()` como função pura, testável sem relógio real, SQLite, filesystem ou mocks. Persistência, comando Tauri de configuração, UI e tarefa Windows ficam para iterações posteriores.

A política é clara: **o agendamento apenas libera ou trava `acquire_next_pending`**. Fora da janela, o worker sintético (ou futuro worker real) simplesmente não consegue adquirir tarefa. Não há "automação de ato oficial pelo relógio" — todos os controles M7/M10 permanecem.

## Semântica

`window_status(config, now_dow, now_minute_of_day, tasks_done_in_window)` devolve `WindowStatus`:

| campo | semântica |
|---|---|
| `allowed_to_acquire` | boolean definitivo que o caller usa |
| `in_window` | true se estamos entre start e end do horário configurado |
| `reason` | enum `Disabled`/`DayNotSelected`/`BeforeWindow`/`AfterWindow`/`TasksCapReached`/`InWindow`/`InvalidConfig` — para a UI explicar ao usuário |
| `tasks_done_in_window` | ecoa o input |
| `max_tasks_per_window` | ecoa o cap configurado |

Regras:

1. **Schedule desabilitado** → sempre `allowed=false, reason=Disabled`.
2. **Config inválida** (start=end, valores fora do dia, dayOfWeek > 6, now_dow > 6, now_minute >= 1440) → `allowed=false, reason=InvalidConfig`.
3. **Janela simples** (`end > start`, ex.: 08:00-18:00): o dia da semana atual precisa estar em `days_of_week` E `start ≤ now < end`. `end` é exclusivo — 18:00:00 já é fora.
4. **Janela que cruza meia-noite** (`end < start`, ex.: 22:00-06:00): pertence ao dia de início. Se hoje é um `start_dow`, janela vale de `start` até 23:59. Se ontem foi um `start_dow`, janela vale de 00:00 até `end` de hoje. Dois dias adjacentes selecionados (MON+TUE) cobrem duas noites completas sem gap.
5. **Cap de tarefas**: dentro da janela, se `tasks_done ≥ max_tasks`, `allowed=false, reason=TasksCapReached`. `max_tasks=0` sempre bloqueia.

## Arquivos alterados

- Novo `src-tauri/src/scheduler.rs` (~240 linhas, +140 de testes).
- `src-tauri/src/lib.rs`: `mod scheduler;`.

Nenhuma dependência nova. Não houve migração de schema — a persistência fica para a iteração seguinte e provavelmente usa `storage::secure_write` (M12) em `app_data_root/schedule.json`.

## Testes acrescentados (Rust 72 → 83, +11)

- `disabled_schedule_never_allows_acquisition`.
- `simple_window_blocks_before_and_after` — antes de start/depois de end bloqueiam, no meio libera.
- `window_excludes_the_exact_end_minute` — 08:00 inclusivo, 18:00 exclusivo.
- `day_not_selected_blocks` — domingo não selecionado bloqueia com `DayNotSelected`.
- `tasks_cap_reached_blocks_even_in_window` — 3/3 bloqueia em plena janela com `TasksCapReached`; 10/3 (over) também.
- `zero_cap_always_blocks_even_in_window` — cap=0 bloqueia sempre.
- `midnight_crossing_window_starts_on_selected_day` — janela 22:00→06:00 em MON: Mon 23:00 libera, Tue 02:00 libera (continuação), Tue 07:00 e Tue 23:00 bloqueiam como `AfterWindow`, Wed 12:00 como `DayNotSelected` (previous_dow(WED)=TUE também não selecionado), Mon 21:00 como `BeforeWindow`.
- `midnight_crossing_window_with_two_adjacent_days_covers_two_full_nights` — MON+TUE: Mon 23:00, Tue 02:00, Tue 23:00, Wed 02:00 todos liberam; Wed 07:00 bloqueia.
- `validate_rejects_zero_length_window_and_out_of_day_values` — start=end rejeita; end=1440 rejeita; dayOfWeek=7 rejeita.
- `invalid_now_arguments_return_invalid_config` — now_dow=99 ou now_minute=1440 devolvem `InvalidConfig`.
- `schedule_config_round_trips_through_json` — serializa em camelCase (`"daysOfWeek"`, `"enabled":true`) e desserializa de volta igual.

## Testes executados

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```
Resultado: **83 passed; 0 failed**.

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
Resultado: exit 0.

## Não feito nesta entrega

### Persistência

`ScheduleConfig` ainda não é lido/gravado. A camada superior pode serializar via serde_json e usar `storage::secure_write(root, "schedule.json", json_bytes)` + `storage::secure_read(root, "schedule.json")` (M12). DPAPI é overkill para preferências de horário, mas usar o secure_write unifica o padrão de I/O escopado.

Alternativa mais simples (sem cifra): gravar em `root/schedule.json` plain. Decisão da camada superior.

### Comando Tauri + UI

Faltam:
- `#[tauri::command] get_schedule_config()` e `set_schedule_config(cfg)` com validação.
- Ligação do modal `schedule` em `src/App.tsx` (hoje salvo em `localStorage` via `Preferences`) ao novo comando. Migração do que já existe lá (start/end strings) para `ScheduleConfig` numérico.
- Botão no painel mostrando status atual (via `window_status` chamada a cada minuto).

### Integração com `acquire_next_pending`

O worker (sintético ou real) ainda chama `acquire_next_pending` diretamente, sem consultar o schedule. O fluxo final seria:

```
if window_status(cfg, now, done).allowed_to_acquire {
    acquire_next_pending(...)
}
```

Isso pode ser feito ou no lado JS (hook + chamada a um comando `check_window_status`) ou no Rust (`acquire_next_pending_if_in_window(cfg, now)`).

### Contagem de tarefas por janela

`tasks_done_in_window` é input para `window_status`. Quem mantém a contagem (janela atual, reset ao entrar numa nova janela) é responsabilidade da camada superior. O mais simples é persistir em SQLite uma linha de contador por janela ativa com ID da janela derivada de (data_start, dow, start_minute).

### Windows Task Scheduler

Não implementado. Se vier a ser necessário, o padrão seria:
- Comando `enable_wake_task(cfg)` que invoca `schtasks /Create /SC WEEKLY …` apontando para o `.exe` do app.
- Nome fixo e documentado (ex.: `SIED-V5-Wake`), permitindo `schtasks /Delete` para desinstalar.
- Habilitação sempre explícita do usuário via UI; nunca criado automaticamente.
- Documentar em README como desativar manualmente.

### Fuso horário

`now_dow` e `now_minute_of_day` são passados como entrada. A camada superior é responsável por converter o relógio real (presumivelmente `Local::now()` via `chrono`) para dow + minuto. Não dependemos de chrono aqui — o núcleo é puro.

## Ambiente

- Rustc 1.100.0 stable-x86_64-pc-windows-msvc
- Node 26.13.1, Python 3.12.10
- Windows 10 Home 19045

## Próximo marco

Com M11 núcleo pronto, a cascata natural é:

- **M11 persistência + UI** (~2-3h): ligar o módulo scheduler à UI de preferências e adicionar comando Tauri. Pequena iteração.
- **M8 integração + M9** — editor de prompts + UI de revisão humana (precisa Ollama instalado para teste end-to-end).
- **Worker Node real** — precisa sessão PPE autorizada sua para validar.
