# SIED SYSTEM V5 — Verificação M7 (Worker foundation — atomicidade e tradução de resultado)

Data: 2026-11-17 (America/Sao_Paulo)

## Escopo desta entrega

M7 completo prevê: worker Node sidecar (Playwright + Edge) controlado pelo Rust via stdin/stdout; UI dos botões INICIAR/PAUSAR/PARAR ligada a esse worker; recuperação de estados deixados por queda; eventos streaming para o hook `useQueue` do M3.

**Esta entrega fecha a fundação de backend** necessária para o worker: atomicidade de aquisição de tarefas (dois workers nunca pegam a mesma linha), tradução do resultado estrutural da leitura PPE no próximo estado da fila SQLite, e CAS (compare-and-swap) em toda transição para impedir "lost update" entre a UI do painel e o worker.

A **ponte via processo filho**, a **UI** e o **sidecar de distribuição** ficam para iteração futura. Com essa fundação pronta, o worker poderá ser adicionado sem mexer no backend.

## Problema resolvido

### 1. Race condition silencioso no `update_bo_status_on` (M2 + M3)

Antes desta entrega, o padrão era:

```rust
let tx = conn.transaction()?;          // BEGIN DEFERRED
let current = tx.query_row(SELECT…)?;  // snapshot: PENDENTE
if !transition_allowed(current, next) { return Err(…); }
tx.execute("UPDATE bo_queue SET status=? WHERE number=?", …)?;  // sem CAS
tx.commit()?;
```

Em WAL do SQLite com dois escritores (ex.: UI + worker), ambos podem ter `current=PENDENTE` no snapshot. O primeiro UPDATE adquire o lock e commita; o segundo começa a executar seu UPDATE contra o estado já modificado. **Como o WHERE não incluía `AND status='PENDENTE'`, o segundo UPDATE sobrescreveria silenciosamente o trabalho do primeiro.**

Agora o UPDATE é:

```rust
"UPDATE bo_queue SET status=?2, reason=?3, updated_at=…
 WHERE number=?1 AND status=?4",
params![number, next, reason, current_status.as_str()],
```

Se `changed == 0`, devolvemos erro claro `"Transição perdida para {number}: outro processo alterou o estado antes da operação concluir. Recarregue a fila e tente novamente."`. Nenhum audit log é gravado quando a transição é perdida (o `INSERT INTO audit_log` fica em `if changed != 0`).

### 2. Aquisição de tarefa atômica (`acquire_next_pending_on`)

Nova função: dado um `worker_id` arbitrário (string livre do worker), pega o B.O. **mais antigo** em `PENDENTE` (FIFO por `created_at ASC`, desempate por `number ASC`) e move para `EM_LEITURA` sob CAS. Retorna `Option<AcquiredTask>`:

- `Some(task)` quando a aquisição funcionou.
- `None` quando não há `PENDENTE` disponível **OU** quando outro worker ganhou a disputa (perdemos o CAS sem erro: apenas não há tarefa para nós).

O `worker_id` é passado por `sanitize::sanitize_reason` antes de entrar no `reason` da linha, para que worker names com controle ou narrativa não poluam o SQLite (reaproveita M12).

Audit log registra `action='EM_LEITURA'` com o B.O. adquirido — a mesma trilha que `update_bo_status_on` usa.

### 3. Tradução da leitura PPE para estado da fila (`record_read_outcome_on`)

Nova função que materializa o passo 7 do spec M7 ("Traduza resultados: leitura completa pode levar a LIDO; leitura parcial vai para revisão; acesso negado vai para RESTRITO; falha técnica vai para ERRO."). Mapeamento canônico, hoje único ponto de verdade:

| `completeness` do bridge (ver `src/ppe/bridge-protocol.mjs`) | Próximo estado | Prefixo de `reason` |
|---|---|---|
| `"CONCLUIDA"` | `LIDO` | "Leitura estrutural concluída." |
| `"PARCIAL"` | `AGUARDANDO_REVISAO` | "Leitura parcial:" + reasons unidos por "; " |
| `"RESTRITA"` | `RESTRITO` | "Acesso restrito pelo PPE:" + reasons |
| `"FALHA"` | `ERRO` | "Falha técnica na leitura:" + reasons |
| outro | erro | — |

O `reason` final é sanitizado antes de persistir (M12). Qualquer valor de `completeness` fora dos quatro é rejeitado com `Err("Completude 'X' não reconhecida pelo bridge.")`.

Importante: **nenhuma leitura parcial jamais vira `LIDO`**. Nenhum valor desconhecido é "tolerado" como sucesso. Timeout no painel (via `PAINEL_NAO_CARREGADO` do M4) chega aqui como `completeness: "PARCIAL"` e vai para revisão humana.

### 4. Comandos Tauri expostos

Dois novos `#[tauri::command]`:

- `acquire_next_pending(worker_id: String) -> Result<Option<AcquiredTask>, String>` — o worker Node chamará isso sob loop.
- `record_read_outcome(number: String, completeness: String, reasons: Vec<String>) -> Result<Vec<BoRow>, String>` — chamado após cada leitura.

Registrados no `invoke_handler` ao lado de `list_bos`, `queue_summary`, `queue_snapshot`, `add_bo`, `update_bo_status` e `open_sinesp_portal`.

## Arquivos alterados

- `src-tauri/src/lib.rs`:
  - `update_bo_status_on` reforçado com CAS.
  - `AcquiredTask` struct (serializável para o frontend).
  - `acquire_next_pending_on` e `record_read_outcome_on`.
  - `acquire_next_pending` e `record_read_outcome` como `#[tauri::command]`.
  - Registro no `invoke_handler`.
  - Módulo de testes ampliado (12 testes novos).

Nenhuma dependência nova. Nenhuma migração SQLite. Nenhum arquivo fora de `src-tauri/src/lib.rs` foi alterado.

## Testes acrescentados (Rust 59 → 70, +11)

- `acquire_next_pending_returns_none_on_empty_database`.
- `acquire_next_pending_returns_none_when_no_pendente_exists` — entries em outros estados são ignoradas.
- `acquire_next_pending_takes_oldest_pending_first_fifo` — 3 B.O.s com `created_at` explícitos; aquisição vem na ordem cronológica.
- `acquire_next_pending_moves_row_to_em_leitura_and_audits_with_worker_label` — status vira `EM_LEITURA`, `reason` contém `"worker-alpha"`, audit_log tem `['added', 'EM_LEITURA']` nessa ordem.
- `acquire_next_pending_sanitizes_worker_id_with_control_chars` — `"worker\n\tpalpite"` vira `"worker palpite"` no reason.
- `record_read_outcome_concluida_moves_em_leitura_to_lido`.
- `record_read_outcome_parcial_moves_to_aguardando_revisao_with_joined_reasons` — duas razões viram `"Leitura parcial: ABA_AUSENTE: Documentos; PAINEL_NAO_CARREGADO: Relato"`.
- `record_read_outcome_restrita_moves_em_leitura_to_restrito`.
- `record_read_outcome_falha_moves_em_leitura_to_erro`.
- `record_read_outcome_rejects_unknown_completeness_variant` — `"INVENTADO"` → erro com `"Completude"`.
- `update_cas_prevents_lost_update_when_underlying_status_changed_externally` — prova direta: linha em EM_LEITURA, tenta UPDATE com `WHERE status='PENDENTE'` → `changed == 0`, nenhum audit, status mantido.

## Testes executados

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```
Resultado: **70 passed; 0 failed** (11 novos do M7).

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

### Worker Node sidecar

Falta implementar:

1. Arquivo `automation/worker.mjs` que:
   - Recebe por stdin mensagens tipo `{"type":"ACQUIRE","worker_id":"edge-primary"}`, `{"type":"PAUSE"}`, `{"type":"STOP"}`.
   - Em cada `ACQUIRE`, chama `invoke('acquire_next_pending', …)` e, se vier `Some`, roda `src/ppe/reader.mjs` contra a sessão Edge.
   - Emite resultado via stdout no formato de `src/ppe/bridge-protocol.mjs` (já existe), que o Rust parsa e aciona `record_read_outcome`.
2. Processo filho em Rust: `std::process::Command::new(node).args(['automation/worker.mjs'])` com pipes para stdin/stdout, lifecycle control (start/pause/stop/resume) via `Mutex<WorkerHandle>`.
3. Sidecar para empacotamento: `tauri.conf.json` com `"externalBin"` apontando para o worker + runtime Node embarcado. Isso é tratado em M13.

### UI dos botões INICIAR/PAUSAR

O botão INICIAR hoje mostra toast "Worker de leitura do PPE ainda não integrado (marco M7)". Com os comandos `acquire_next_pending` e `record_read_outcome` prontos, a UI pode chamá-los diretamente em modo "simulação sintética" (sem worker Node) usando as fixtures existentes — fica como follow-up curto quando quisermos demonstrar o fluxo end-to-end.

### Recuperação de estados deixados por queda

Spec M7 passo 8: tarefas em `EM_LEITURA`/`EM_ANALISE` deixadas por queda precisam de uma estratégia de retomada. Hoje elas ficam no estado atual e `acquire_next_pending` não as redescobre (pega só `PENDENTE`). A política de "quantas tentativas, qual o backoff, quando promover para ERRO automático" fica para o worker real: ele precisa saber quando foi reiniciado.

### Testes de concorrência real

O teste `update_cas_prevents_lost_update_when_underlying_status_changed_externally` prova a semântica do CAS por SQL direto. Teste com **duas threads** e DB compartilhado (via `file::memory:?cache=shared` ou DB em arquivo temp) viria junto do worker real, quando houver concorrência de verdade. O padrão CAS é suficientemente simples e testado unitariamente que o risco de regressão é baixo.

## Ambiente

- Rustc 1.100.0 stable-x86_64-pc-windows-msvc
- Node 26.13.1, Python 3.12.10
- Windows 10 Home 19045

## Próximo marco

Com M7 foundation pronto, as opções naturais são:

- **M11 (agendamento)** — curto, usa `acquire_next_pending` do M7. Horários de execução + persistência em SQLite.
- **UI synthetic run** — ligar o botão INICIAR aos comandos novos em modo fixture, demonstrando end-to-end sem precisar do worker real. Pequeno follow-up.
- **M4 real + M5 + M6 + worker real** — bloqueado por sessão PPE autorizada sua.
- **M8 integração + M9** — editor de prompts + UI de revisão humana. Depende de Ollama instalado para teste end-to-end.
