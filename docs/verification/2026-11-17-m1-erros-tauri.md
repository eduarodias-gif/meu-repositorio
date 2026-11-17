# SIED SYSTEM V5 — Verificação M1 (Mostrar erros do Tauri)

Data: 2026-11-17 (America/Sao_Paulo)

## Problema resolvido

Rust retorna `Result<_, String>`. No fluxo `handleAddLocalBo` (e nos outros 5 `catch` do painel), mensagens específicas como "Este B.O. já está na fila local." e "Transição de X para Y não permitida." precisavam aparecer como estão na UI, em vez de virarem uma mensagem genérica. A rejeição do Tauri pode chegar ao JS tanto como `Error` quanto como string crua, dependendo do caminho, e também como `null`/`undefined`/objeto quando o problema vem do navegador (modo não-desktop).

## O que foi feito nesta entrega

- Cobertura de teste do normalizador puro `toUserError(error, fallback)` ampliada de 2 para 8 casos, exercitando todos os formatos de entrada citados pelo spec M1: `Error` com mensagem, string não vazia (aparada), string vazia/só espaços, `null`/`undefined`, objeto desconhecido (incluindo `{message}` não-Error), número, booleano, `Error` sem mensagem útil, e a preservação da mensagem exata de duplicidade do Rust em qualquer uma dessas formas.
- Verificado por código que `src/services/errors.mjs` e `src/services/errors.d.mts` já existem e implementam corretamente os 8 casos.
- Verificado por `grep` em `src/App.tsx` que os 6 pontos de catch relevantes — carregamento inicial da fila (linha 82), abertura do portal (131), `handleAddLocalBo` (141), `handleRunQueue` (177), `handleValidateLocalBo` (202) e `handlePrepareFinalization` (224) — já importam e usam `toUserError`, com fallbacks específicos. Nenhum `catch` restante faz `JSON.stringify` ou vaza payload técnico.
- Verificado por leitura de `handleAddLocalBo` (linhas 134–143) que:
  - `setNewBoNumber('')` ocorre APENAS dentro do `try`, após o `invoke` retornar com sucesso — uma rejeição por duplicidade preserva o valor digitado.
  - `setLocalBos(data)` e `setQueueSummary(summary)` só correm após o sucesso, derivados da verdade persistida pelo Rust/SQLite; não há incremento manual de contadores.
  - A chave primária `UNIQUE` de `bo_queue` no backend Rust (`src-tauri/src/sql/schema_v04.sql`, `number TEXT PRIMARY KEY`) impede o segundo registro, com `clean_number` normalizando o `trim()`/`to_uppercase()` em `src-tauri/src/src/lib.rs`.

## Arquivos alterados nesta entrega

- `tests/service-errors.test.mjs` — expandido de 2 para 8 testes.

## Arquivos conferidos sem alteração

- `src/services/errors.mjs`
- `src/services/errors.d.mts`
- `src/App.tsx` (apenas inspeção estática dos 6 `catch`)
- `src/services.local.ts`

## Testes executados

```powershell
node --test tests/service-errors.test.mjs
```

Resultado: 8 testes, 8 passaram, 0 falharam, 0 pulados.

```powershell
node --test tests/*.test.mjs
```

Resultado: 38 testes, 38 passaram, 0 falharam, 0 pulados.

```powershell
npm run build
```

Resultado: exit 0. TypeScript (`tsc -b`) e Vite 6.4.6 produziram `dist/` (0,57 KB HTML + 25,11 KB CSS + 268,99 KB JS, ~82 KB gzip no bundle principal).

## Não validado nesta entrega

- Teste manual no desktop com dados fictícios (adicionar duas vezes o mesmo número e verificar mensagem específica + apenas uma linha). O instalador NSIS está em `src-tauri/target/release/bundle/nsis/SIED SYSTEM V5_0.4.0_x64-setup.exe` mas a verificação visual da UI real não foi feita nesta janela de trabalho.
- `cargo test` — a suíte Rust existente (3 testes em `src-tauri/src/lib.rs`) não foi executada nesta entrega porque M1 não toca em código Rust. Será executada em M2.

## Ambiente

- Node.js 26.13.1 / npm 11.20.0
- rustc 1.100.0 stable-x86_64-pc-windows-msvc (não usado neste marco)
- Windows 10 Home 19045
- Vite 6.4.6, TypeScript 5.8 (via `tsc -b`)

## Próximo marco

M2 — Testar todas as transições (121 pares) e extrair a consulta SQL de `queue_summary` para `src-tauri/src/sql/queue_summary.sql`, carregando-a com `include_str!` no Rust e lendo-a direto no `tests/sqlite-contract.py`. Requer `cargo test` com MSVC (agora disponível).
