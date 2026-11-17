# SIED SYSTEM V5 — Verificação M8 (Integração Tauri — IA acessível ao frontend)

Data: 2026-11-17 (America/Sao_Paulo)

## Escopo

O **núcleo de IA** (ai.rs) foi entregue em iteração anterior (ver `2026-11-17-m8-ia-local-ollama.md`): cliente Ollama loopback-only, mensagens isoladas system/user, `AnalysisRaw` com `deny_unknown_fields`, minuta ≤ 4000 chars, parser estrito. Tudo testado contra mock HTTP in-process. Nenhuma função era acessível do frontend.

**Esta entrega expõe três comandos Tauri** e os wrappers TypeScript correspondentes, mantendo todas as políticas de segurança do núcleo. A UI (editor de prompts, tela de análise, botão "gerar minuta") fica para iterações posteriores — M9 é o natural dono dessa parte.

Nada do que foi publicado nesta entrega **chama serviço externo**. Toda chamada passa pela validação de loopback de `ai.rs`, que rejeita hostnames não-loopback E peers resolvidos fora do range de loopback E redirects HTTP.

## Comandos novos

### `ai_list_models(endpoint) -> Vec<String>`

Chama `GET /api/tags` no endpoint dado. Entrada:

```ts
{ host: '127.0.0.1', port: 11434, timeoutSeconds: 30 }
```

Validação: `host` precisa ser `127.0.0.1`, `localhost` ou `::1` (em `OllamaEndpoint::resolve`). `timeoutSeconds` tem default 30 e é clipado para ≥ 1. Retorna lista de nomes de modelos instalados localmente (`llama3:8b`, `qwen2.5:7b`, etc.).

### `ai_run_analysis(endpoint, request) -> AnalysisResult`

Executa a análise completa via `POST /api/chat` com `stream: false` e JSON Schema no `format`. Validações defensivas do backend **antes** da chamada:

- `bo_number` passa por `clean_number` (mesma validação do SQLite).
- `model` não vazio.
- `prompt_version_id` não vazio.
- `prompt_body` não vazio.
- `reading_hash` não vazio.

Devolve `AnalysisResult` em camelCase com `minuta_char_count` e `minuta_overflow` calculados. O campo `minuta` nunca é truncado pelo backend — se o modelo exceder 4000 chars, `minutaOverflow=true` sinaliza para revisão humana.

### `ai_hash_prompt_body(body) -> {sha256Hex, charCount}`

Expõe `ai::hash_prompt_body`. A UI de edição de prompts usa isso para derivar o `prompt_version_id` estável que vincula uma análise à versão exata do texto.

## Wrappers TypeScript (`src/services.local.ts`)

Três novas funções e cinco novos tipos:

- `listOllamaModels(endpoint?)` — default `127.0.0.1:11434`.
- `runOllamaAnalysis(request, endpoint?)` — request em camelCase.
- `hashPromptBody(body)`.
- Tipos: `OllamaEndpointConfig`, `AnalysisRequest`, `AnalysisResult`, `PromptHashResult`.

Todas lançam erro claro se chamadas no modo navegador (fora do Tauri).

## Arquivos alterados

- `src-tauri/src/lib.rs`:
  - Structs de input/output: `AiEndpointInput`, `AiAnalysisRequestInput`, `AiAnalysisResultOutput`, `PromptHashOutput`.
  - Três `#[tauri::command]`: `ai_list_models`, `ai_run_analysis`, `ai_hash_prompt_body`.
  - Registro no `invoke_handler`.
- `src/services.local.ts`: tipos e wrappers.

Nenhuma dependência nova. Nenhum teste quebrou. Rust 83/83 mantidos.

## Segurança ratificada

O núcleo `ai.rs` entregue antes já tinha 16 testes cobrindo:

- Rejeição de hostname não-loopback.
- Rejeição de peer não-loopback após `connect`.
- Rejeição de redirect HTTP 3xx.
- Rejeição de response com `done: false` (streaming parcial).
- Rejeição de response com `role` diferente de `assistant`.
- Rejeição de JSON com campo faltante.
- Rejeição de JSON com campo extra desconhecido (`deny_unknown_fields`).
- Minuta > 4000 marca overflow sem truncar.
- Separação system/user — prompt injection no payload do B.O. nunca vaza para o canal de instruções.
- Mock HTTP end-to-end via `TcpListener` sintético.

Esta entrega preserva 100% desse envelope — os comandos são wrappers finos sobre as funções já testadas.

## Testes executados

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```
Resultado: exit 0.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```
Resultado: **83 passed; 0 failed** (sem mudança — os comandos novos são wrappers compilados mas o Tauri command macro impede teste direto sem AppHandle; o trabalho real está em `ai.rs` e já é coberto).

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
Resultado: exit 0. Bundle principal 271,09 KB / 82,64 KB gzip (sem mudança — tipos só; sem código de runtime no bundle).

## Não feito nesta entrega

### UI de edição de prompts

Falta uma tela onde o responsável jurídico edite versões do prompt, veja hashes e compare versões. Ponto de partida: usar `hashPromptBody` para gerar `promptVersionId` e persistir as versões via `storage::secure_write` do M12 em `prompts/<versionId>.json`.

### UI de execução de análise

Falta ligar `runOllamaAnalysis` a um botão no modal de revisão. O modelo e endpoint devem ser escolhidos pelo responsável; o resultado precisa ser mostrado com os sete campos separados + contador de minuta + flag de overflow destacada.

### Persistência de análises

`AnalysisResult` precisa ser gravado em disco vinculado ao B.O.: `analyses/<bo>/<timestamp>-<versionId>.json` via `storage::secure_write`. Isso é M9 território.

### Teste end-to-end com Ollama real

Não feito nesta sessão (Ollama não instalado). Para fazer: `winget install Ollama.Ollama` + `ollama pull llama3:8b` (verificar tamanho — ~4,7 GB antes), depois `invoke('ai_list_models', {endpoint:{host:'127.0.0.1', port:11434}})` deve devolver `['llama3:8b']`. Uma chamada `ai_run_analysis` com dados sintéticos deve devolver `AnalysisResult` com os sete campos.

### Comando de descoberta do endpoint

Ollama por padrão escuta em `127.0.0.1:11434`, mas pode ser configurado em outra porta (variável `OLLAMA_HOST`). Um futuro `ai_detect_default_endpoint()` pode tentar `127.0.0.1:11434` primeiro e ler `OLLAMA_HOST` como fallback. Fora de escopo aqui.

### Modelo "é local" vs "é cloud"

`list_local_models` devolve nomes. Ollama só expõe modelos locais nesse endpoint. A confusão só existe se o usuário rodar um proxy HTTP no 11434 que forwarda para OpenAI/Anthropic — nesse caso o SIED continua falando apenas com loopback, mas a segurança depende do operador. Documentado como requisito operacional.

## Ambiente

- Rustc 1.100.0 stable-x86_64-pc-windows-msvc
- Node 26.13.1, Python 3.12.10
- Windows 10 Home 19045
- Ollama **não instalado** nesta sessão

## Próximo marco

Com M8 integração pronta, as opções naturais são:

- **M9 (revisão humana)** — UI do modal de revisão, editor de minuta vinculado à versão. Consome `runOllamaAnalysis` e `hashPromptBody`.
- **M11 iteração 2** — persistir ScheduleConfig, comando get/set, migrar modal.
- **Worker Node real** — depende de sessão PPE autorizada.
