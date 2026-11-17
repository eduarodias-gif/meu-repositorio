# SIED SYSTEM V5 — Verificação M3 (Dashboard consistente e revisão básica)

Data: 2026-11-17 (America/Sao_Paulo)

## Problema resolvido

- A UI consumia `listLocalBos()` e `getQueueSummary()` em duas chamadas separadas. Entre as duas, qualquer escrita (por exemplo o futuro worker) deixaria lista e contadores apontando para revisões diferentes do banco.
- Não havia como a UI saber qual revisão do banco ela estava exibindo.
- Uma resposta tardia de uma chamada `then()` podia sobrescrever o resultado de uma chamada mais recente.
- Após erro de leitura, o painel ficava com `localBos=[]` e contadores em zero — indistinguível de uma fila realmente vazia (o spec exige diferenciar carregando / banco indisponível / fila vazia).
- Erro em um refresh após um cadastro bem sucedido poderia disparar re-INSERT se a UI tentasse "recuperar" sozinha.
- O texto do botão INICIAR, no modo desktop, dizia "O bridge PPE desktop aguarda o compilador MSVC para ser conectado." — informação agora desatualizada (MSVC está instalado); o que ainda falta é o worker M7.

## Mudanças arquiteturais

### Backend (Rust)

- Novo `struct QueueSnapshot { rows, summary, revision }` em `src-tauri/src/lib.rs`.
- Nova função `queue_snapshot_for(conn: &mut Connection) -> Result<QueueSnapshot, String>` que abre `conn.transaction()` (BEGIN DEFERRED), executa `list_all`, `queue_summary_for` e `SELECT COALESCE(MAX(id),0) FROM audit_log` sob a mesma visão do banco, e commita. Reutiliza as funções M2 — não há regra de contagem duplicada.
- Novo `#[tauri::command] fn queue_snapshot(app: AppHandle) -> Result<QueueSnapshot, String>` registrado no `invoke_handler`.
- `revision` é o maior `audit_log.id` existente; cresce monotonicamente a cada `add_bo_on`/`update_bo_status_on`.

### Núcleo portável (JavaScript)

- Novo `src/queue/snapshot-runner.mjs` com fábrica `createSnapshotRunner(fetchSnapshot, { fallback })` desacoplada de React. Responsável por:
  - Sequenciar chamadas: um `currentRequestId` incrementa a cada `refresh()`; respostas cujo `id` não seja mais o atual são descartadas.
  - Preservar o snapshot anterior em caso de erro em uma atualização posterior (estado "stale with error"): `hasData` continua `true`, `rows`/`summary`/`revision` continuam preenchidos, `error` recebe a mensagem específica.
  - Validar resposta: um objeto malformado (sem `rows` como array ou `summary` como objeto) vira erro de fallback — não quebra o runner.
  - `dispose()` corta respostas pendentes e limpa listeners.
  - Normalizar erros via `toUserError` do M1 (Error, string crua do Tauri, objeto opaco → mensagem exata ou fallback).
- Nova declaração `src/queue/snapshot-runner.d.mts` para consumo TypeScript estrito.

### Serviços TS

- `src/services.local.ts`: novo tipo `QueueSnapshot` e nova função `getQueueSnapshot()`. Modo desktop chama `invoke('queue_snapshot')`; modo navegador monta o snapshot a partir de `browserQueue.list()`, `browserQueue.summary()` e `browserQueue.audit().length` (revision).

### Hook React

- Novo `src/hooks/useQueue.ts`: fina camada React sobre o runner. Cria o runner uma única vez (lazy `useState`), se inscreve, chama `refresh()` no primeiro effect e `dispose()` na desmontagem. Expõe `{ rows, summary, revision, loading, error, hasData, refresh }`.

### App.tsx

- Removidos os `useState` de `queueSummary` e `localBos` e o `useEffect` de carregamento manual com `Promise.all([listLocalBos(), getQueueSummary()])`.
- Introduzido `const queue = useQueue()` com aliases `localBos = queue.rows` / `queueSummary = queue.summary` para preservar o resto do JSX inalterado.
- Removida a função `refreshQueue()`. Todos os handlers (`handleAddLocalBo`, `handleRunQueue`, `handleValidateLocalBo`, `handlePrepareFinalization`) agora chamam `queue.refresh()` depois da escrita, descartando o `Vec<BoRow>` que o backend retorna.
- `setLocalError('')` continua sendo zerado no início de cada handler para separar "erro de ação do usuário" (formulário) de "erro de leitura" (hook) — os dois têm manifestações distintas na UI.
- A área FILA LOCAL diferencia quatro estados:
  1. `!hasData && loading` → "Carregando fila local..."
  2. `!hasData && error` → "Banco local indisponível: {error}" + botão "Tentar atualizar"
  3. `hasData && rows.length === 0` → "Nenhum B.O. adicionado ao banco local."
  4. Lista populada (modo atual)
  - Além disso, `hasData && error` (stale) mostra "Última atualização falhou: {error}" + botão "Tentar atualizar" abaixo da lista — oferece atualização sem re-executar INSERT, conforme spec M3 passo 6.
- A mensagem do botão INICIAR no modo desktop foi atualizada de "aguarda o compilador MSVC" para "Worker de leitura do PPE ainda não integrado (marco M7). Use \"npm run ppe:inspecionar\" para a sessão assistida." — o toolchain MSVC agora existe; o que falta é o worker M7.

## Arquivos alterados

- `src-tauri/src/lib.rs` — `QueueSnapshot`, `queue_snapshot_for`, comando `queue_snapshot`, registro no invoke_handler, 2 testes novos.
- Novo `src/queue/snapshot-runner.mjs` (+ `.d.mts`).
- `src/services.local.ts` — tipo `QueueSnapshot` e função `getQueueSnapshot`.
- Novo `src/hooks/useQueue.ts`.
- `src/App.tsx` — refatoração para consumir o hook (sem reestruturação visual; preservados splash de 3 s, design preto/vidro/prata, revisão com busca por `number nature reason status`).
- Novo `tests/queue-refresh.test.mjs` com 10 testes.

## Testes acrescentados

### Rust (`src-tauri/src/lib.rs::tests`) — de 20 para 22

- `queue_snapshot_for_returns_consistent_rows_summary_and_revision` — snapshot vazio tem revisão 0; após `add_bo_on`, revisão > 0 e `summary.queue=1`; após `update_bo_status_on`, status propaga e revisão cresce novamente.
- `queue_snapshot_revision_is_the_highest_audit_log_id` — `snapshot.revision == MAX(audit_log.id)`.

### Node (`tests/queue-refresh.test.mjs`) — 10 novos

- `estado inicial é loading, sem dados, erro vazio`.
- `refresh bem sucedido popula rows, summary, revision e marca hasData`.
- `resposta atrasada da primeira chamada NÃO sobrescreve resposta mais recente` — simula latência cruzada; a tardia é descartada pelo requestId.
- `erro após leitura bem sucedida preserva rows anteriores e seta mensagem específica` — o "stale with error".
- `erro inicial (nunca houve sucesso) deixa hasData false e seta mensagem`.
- `rejeição com string simples (como vem do invoke do Tauri) preserva a mensagem exata`.
- `rejeição com valor opaco cai no fallback configurado`.
- `resposta malformada (sem rows/summary) cai no fallback sem quebrar o runner`.
- `dispose descarta respostas pendentes e impede refresh posterior`.
- `subscribe recebe cada emissão e unsubscribe silencia o listener`.

## Testes executados

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```
Resultado: exit 0.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked
```
Resultado: 22 testes, 22 passaram, 0 falharam.

```powershell
node --test tests/*.test.mjs
```
Resultado: 48 testes, 48 passaram, 0 falharam.

```powershell
python tests/sqlite-contract.py
```
Resultado: `PASS: schema V0.4, migração V0.3 e resumo da fila SQLite (SQL compartilhado)`.

```powershell
npm run build
```
Resultado: exit 0. Vite 6.4.6 transformou 1589 módulos (era 1587 antes do M3), bundle principal foi de 268,99 KB para 270,77 KB (+1,78 KB, gzip +0,60 KB).

## Não feito nesta entrega

- Testes de interface (renderização React do `useQueue`): não foi instalada infraestrutura React Testing Library / Vitest; a lógica foi testada como `snapshot-runner` puro, que é o que efetivamente sequencia requestIds e transições de estado. A camada do hook é um wrapper trivial sobre o runner.
- O `queue_snapshot` é lido via transação BEGIN DEFERRED. Isso dá consistência de leitura dentro da transação. A atomicidade escrita↔leitura cruzando commandos Tauri concorrentes depende do `busy_timeout = 5s` existente; para dois escritores concorrentes é uma garantia M7 (worker integrado), não M3.
- O instalador NSIS não foi regerado nesta sessão; o `.exe` anterior é da versão M0 do backend. `npm run desktop:build` pode ser executado a qualquer momento para gerar a nova versão incluindo o comando `queue_snapshot`.
- Teste manual no app real do Windows (ver splash de 3 s, cadastrar fictício duas vezes seguidas, derrubar o banco e ver "Tentar atualizar") não foi feito aqui; só a verificação por código, build, cargo test e contratos sintéticos.

## Ambiente

- Node.js 26.13.1 / npm 11.20.0
- Rustc 1.100.0 stable-x86_64-pc-windows-msvc
- Python 3.12.10
- Vite 6.4.6, TypeScript 5.8, React 19.1
- Windows 10 Home 19045

## Próximo marco

M4 — Validar DOM real do PPE: requer **sessão autorizada no SINESP/PPE** com login manual (CPF/senha/OTP). Esta etapa eu não consigo executar sozinho — você precisa abrir o Edge, autenticar e me passar fragmentos sanitizados do DOM (sem dados pessoais, nomes de envolvidos ou números reais de B.O.) para eu ajustar `src/ppe/contract.mjs`, `src/ppe/reader.mjs` e os fixtures sintéticos. Enquanto a sessão real não é acessada, M4 só pode avançar na parte sintética (robustecer o escape de `#ID` com `:` em `panelLocator`, validar checagem de sessão após carregamento assíncrono, cobertura de timeout).
