# SIED SYSTEM V5 — Verificação M7 (UI wire sintético, iteração 2)

Data: 2026-11-17 (America/Sao_Paulo)

## O que mudou em relação à primeira iteração do M7

A iteração anterior (ver `2026-11-17-m7-worker-foundation.md`) entregou o backend: CAS, `acquire_next_pending_on` e `record_read_outcome_on` como comandos Tauri. O botão INICIAR no desktop continuava mostrando apenas um toast informando que o worker ainda não existia.

Esta entrega **liga o botão INICIAR aos comandos novos em modo sintético**: clicar INICIAR no app desktop agora dispara um ciclo real contra o SQLite — adquire o B.O. PENDENTE mais antigo, "simula" uma leitura CONCLUÍDA com as 9 abas padrão, e aplica `record_read_outcome`. O painel atualiza sozinho via hook `useQueue` do M3.

**Nenhuma conexão com o PPE é feita.** O toast explicita isso.

## Mudanças

### Rust (`src-tauri/src/lib.rs`)

- Nova função `run_synthetic_cycle_on(conn)` que:
  1. Chama `acquire_next_pending_on(conn, "desktop-synthetic")`.
  2. Se `None`, retorna `Err("Nenhum B.O. PENDENTE na fila para simular.")`.
  3. Fabrica localmente a lista das 9 abas do contrato PPE.
  4. Chama `record_read_outcome_on(conn, &task.number, "CONCLUIDA", &[])` — a translação do M7 move `EM_LEITURA → LIDO`.
  5. Devolve `SyntheticCycleResult { number, next_status, recognized_tabs, is_synthetic: true }`.
- Novo comando Tauri `#[tauri::command] desktop_run_synthetic_cycle(app)` registrado no `invoke_handler`.

### TypeScript (`src/services.local.ts`)

- Novo tipo `SyntheticCycleResult`.
- Nova função `runDesktopSyntheticCycle()` que faz `invoke<SyntheticCycleResult>('desktop_run_synthetic_cycle')`. Jogamos erro explícito se chamado fora do desktop.

### React (`src/App.tsx`)

- `handleRunQueue` em modo desktop agora chama `runDesktopSyntheticCycle()`:
  - Sucesso → toast informa número + "marcado como LIDO (9 abas). Nenhuma leitura do PPE real foi feita." + atualiza `lastActivity` + `queue.refresh()`.
  - Erro → `setLocalError(toUserError(error, 'Falha ao executar o ciclo sintético.'))`. Isso cobre "sem B.O. PENDENTE" com a mensagem exata do Rust.

Como a UI consome `queue` (hook M3), a lista e os contadores do dashboard atualizam sozinhos após o ciclo.

## O que permanece inalterado por contrato

- Nenhuma chamada ao PPE real.
- Nenhuma automação de atos oficiais (despacho, assinatura, conclusão).
- Reuso dos comandos existentes — sem novo endpoint que escape dos controles de M7.
- O modo navegador continua usando `runLocalQueueTest` como antes (M3 intacto).
- `is_synthetic: true` no retorno — a UI e qualquer teste pode detectar se o ciclo foi real ou simulado.

## Testes acrescentados (Rust 70 → 72, +2)

- `run_synthetic_cycle_moves_a_pendente_to_lido_and_returns_number` — fila com um PENDENTE, cycle retorna número correto + `next_status: "LIDO"` + 9 abas + `is_synthetic: true`; a linha vira LIDO no banco.
- `run_synthetic_cycle_without_pendente_returns_clear_error` — fila vazia, erro contém "Nenhum B.O. PENDENTE".

## Testes executados

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```
Resultado: exit 0.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```
Resultado: **72 passed; 0 failed**.

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
Resultado: exit 0. Bundle principal foi para 271,09 KB (era 270,77 KB em M3 — +0,32 KB pela função nova + tipo).

## Não feito nesta entrega

- **Worker Node real (Playwright + Edge)**. Essa é a próxima iteração grande do M7. O design do sidecar (empacotar Node no instalador via `tauri.conf.json externalBin`) é parte do M13.
- **Modo "synthetic" vs "real" na UI**. Hoje a ligação é 100% sintética no desktop. Quando o worker real existir, o `handleRunQueue` roteará para o worker em vez de `desktop_run_synthetic_cycle`. Um toggle na configuração pode manter o modo sintético como opção para demo/treinamento.
- **Múltiplos ciclos consecutivos**. O botão INICIAR hoje roda 1 ciclo. Loop de "processar toda a fila PENDENTE" cabe no worker real.

## Instalador

O `.exe` NSIS **não foi regerado** nesta sessão. O instalador que vocês têm é o de M0 (sem os comandos novos). Para produzir uma nova versão: `npm run desktop:build` dentro desta pasta regenera `src-tauri/target/release/bundle/nsis/SIED SYSTEM V5_0.4.0_x64-setup.exe`.

## Ambiente

- Rustc 1.100.0, Node 26.13.1, Python 3.12.10
- Windows 10 Home 19045

## Próximo marco

O conjunto M0–M8 núcleo + M12 + M7 foundation + UI synthetic wire cobre o backend de ponta a ponta. Os próximos passos em ordem de dependência:

- **M11 (agendamento)** — independente; usa `acquire_next_pending`. Pequena entrega focada.
- **M8 integração** — editor de prompts no painel, comandos Tauri expondo `list_local_models` e `run_analysis`. Precisa Ollama instalado para teste end-to-end.
- **M9** — revisão humana vinculada à versão (depende de M8 integração).
- **Worker Node real** — depende de sessão PPE autorizada sua para validar; M4/M5/M6 reais são pré-requisito.
