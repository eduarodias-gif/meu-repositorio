# SIED SYSTEM V5 — Verificação M12 (Proteção local, retenção e auditoria)

Data: 2026-11-17 (America/Sao_Paulo)

## Problema resolvido

M12 é dependência **transversal** para M6-M10: antes de qualquer marco salvar conteúdo real em disco (relatos, minutas, anexos, resultados de leitura), precisam existir controles verificáveis para:

- Cifrar bytes sensíveis com mecanismo Windows nativo.
- Confinar leitura/escrita/exclusão ao diretório do aplicativo, bloqueando `..` e paths absolutos.
- Sanitizar o campo `reason` do `bo_queue` para que não vire depósito de narrativa ou dados pessoais.
- Mascarar sequências longas de dígitos em texto que vai para log/diagnóstico.

Antes desta entrega, nenhuma dessas camadas existia como código. A auditoria do SQLite já usa códigos curtos (`added`, `EM_LEITURA`, `migrated_legacy_status:*`), então essa parte permanece inalterada; o foco foi adicionar as três camadas que faltavam.

## Mudanças arquiteturais

### 1. `src-tauri/src/security.rs` — DPAPI via FFI direta a `Crypt32.dll`

- `protect(plaintext: &[u8]) -> Result<Vec<u8>, String>` chama `CryptProtectData` (escopo `CurrentUser`, flags=0). O ciphertext só pode ser recuperado pela mesma conta Windows na mesma máquina. Nenhum segredo precisa ser guardado pelo aplicativo — a chave fica no perfil do usuário, gerenciada pelo Windows.
- `unprotect(ciphertext: &[u8])` chama `CryptUnprotectData` e trata o ponteiro de descrição retornado (liberado com `LocalFree`).
- Implementação por `#[link(name = "Crypt32")]` + `extern "system"` (sem crate externa). Cross-platform: no `#[cfg(not(target_os = "windows"))]` as funções retornam `Err`, nunca passthrough — o requisito da política é "no fallback sem proteção".
- Tratamento de erros: `GetLastError()` é lido imediatamente após falha e formatado como `LastError=0x{:08X}` para diagnóstico técnico sem narrativa.

### 2. `src-tauri/src/storage.rs` — I/O estritamente escopado

- `app_data_root(app)` continua sendo a única via para descobrir o root real (`AppHandle::path::app_data_dir` em produção).
- `resolve_within(root, subpath)` aplica **checagens sintáticas**:
  - subpath vazio → erro
  - subpath > 512 chars → erro
  - absoluto (`is_absolute()`) → erro
  - componentes `..` (`Component::ParentDir`) → erro
  - raiz (`Component::RootDir`) → erro (ex: `\absolute` no Windows)
  - prefixo de volume (`Component::Prefix`) → erro (ex: `C:\...`, `\\server\share`)
- `secure_write(root, sub, plain)` → DPAPI protect, grava em `sub.tmp`, `rename` atômico.
- `secure_read(root, sub)` → lê arquivo, DPAPI unprotect, devolve bytes.
- `list_within(root, sub)` → entradas diretas, ordenadas, não-recursivas.
- `delete_within(root, sub)` aplica **defesa em profundidade**: além da checagem sintática em `resolve_within`, canonicaliza root e target para garantir que o path canônico final começa com o root canônico — bloqueia symlinks que pudessem apontar para fora.

### 3. `src-tauri/src/sanitize.rs` — sanitização de `reason` e logs

- `sanitize_reason(raw)`:
  - Controles, `\t`, `\n`, `\r` → espaço.
  - `split_whitespace().join(" ")` → colapsa múltiplos espaços.
  - Trunca em `MAX_REASON_CHARS = 300`.
  - Nenhum NUL, escape ANSI, bytes de controle sobrevivem.
- `sanitize_for_log(raw)`:
  - Aplica `sanitize_reason` como base.
  - Mascara **sequências ≥ 9 dígitos consecutivos** com `#`. Preserva o padrão de B.O. com barra (`00000001/2026` tem 8+4 dígitos, não é mascarado). Mascara CPF (11 dígitos) e números internos longos sem separador.

### 4. Integração no `update_bo_status` (lib.rs)

- `sanitize::sanitize_reason` substituiu o `trim() + length check`. Antes: `reason > 300` chars era rejeitado como erro; agora é **silenciosamente truncado** após sanitização. O backend não deve ser a única barreira contra narrativa; é a defesa final.

## Arquivos alterados

- Novos: `src-tauri/src/security.rs`, `src-tauri/src/storage.rs`, `src-tauri/src/sanitize.rs`.
- `src-tauri/src/lib.rs` — `mod sanitize/security/storage`; `update_bo_status` consome `sanitize_reason`.

Nenhuma dependência externa nova (`Crypt32.dll` e `Kernel32.dll` são bibliotecas do próprio Windows). `Cargo.toml` inalterado.

## Testes acrescentados (Rust: 22 → 43)

### `security::tests` (4, **Windows only** — `#[cfg(all(test, target_os = "windows"))]`)

- `protect_and_unprotect_round_trip_preserves_plaintext` — texto curto de 38 bytes; verifica que ciphertext ≠ plaintext e que unprotect recupera exatamente os bytes.
- `protect_binary_payload_round_trip` — 4 KiB de bytes 0x00–0xFF repetidos.
- `unprotect_tampered_ciphertext_fails_cleanly` — flip no último byte → unprotect retorna `Err("DPAPI unprotect falhou …")`.
- `unprotect_rejects_empty_input` — ciphertext vazio → `Err("vazio")`.

### `storage::tests` (9)

- `resolve_within_accepts_simple_subpath_and_nested_subpath`.
- `resolve_within_rejects_dotdot_absolute_and_empty_paths` — exercita `""`, `..`, `a/../b`, `../fora.txt`, `C:\Windows\win.ini`, `\\server\share\x`, `\absolute` (Windows) / `/etc/passwd` (POSIX).
- `secure_write_then_read_round_trip` **(Windows only)** — escreve, confirma que bytes em disco ≠ plaintext, lê de volta.
- `secure_write_uses_tmp_and_rename_pattern` **(Windows only)** — após concluir, nenhum `.tmp` residual fica no diretório.
- `list_within_returns_empty_for_missing_subdir`.
- `list_within_lists_direct_children_sorted` — valida ordenação e escopo não-recursivo.
- `delete_within_rejects_path_resolving_outside_root` — `../fora.bin` devolve erro com `..` mencionado.
- `delete_within_removes_existing_file`.
- `delete_within_noop_for_missing_file`.

### `sanitize::tests` (8)

- `sanitize_reason_replaces_newlines_and_control_chars`.
- `sanitize_reason_collapses_consecutive_whitespace`.
- `sanitize_reason_truncates_at_300_chars`.
- `sanitize_reason_strips_null_and_other_control_bytes`.
- `sanitize_for_log_masks_runs_of_9_or_more_digits` (CPF 11 dígitos → 11 `#`).
- `sanitize_for_log_preserves_bo_with_slash_year` (`00000001/2026` intacto).
- `sanitize_for_log_preserves_small_numbers` (`timeout 7000 ms` intacto).
- `sanitize_for_log_still_normalizes_whitespace`.

## Testes executados

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```
Resultado: exit 0.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked
```
Resultado: **43 testes, 43 passaram** (21 novos do M12). Nenhum existente foi quebrado pela sanitização do `reason`.

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

- **Consumo das funções em comandos Tauri**. `secure_write/secure_read/list_within/delete_within` e `app_data_root` são a base para M6 (armazenar extração de B.O.), M8 (persistir análises e versões de prompt) e M10 (log de tentativas de ato oficial). Para M12 isolado, as funções ficam disponíveis e testadas, mas nenhum `#[tauri::command]` as consome ainda. O compilador lista 15 warnings "function is never used" — intencional; serão consumidas nos próximos marcos.
- **ACL explícita no diretório**. O spec M12 (passo 2) observa que `mode: 0o700` no Node é inútil no Windows. Confiamos no fato de que `app_data_dir` fica dentro do perfil do usuário (`%APPDATA%\br.sied.systemv5`), cuja ACL default já é "usuário owner + SYSTEM/Administrators". Uma inspeção via `icacls` da pasta criada confirmaria o comportamento — não foi feita aqui porque `app_data_dir` só existe quando o Tauri real roda; nossos testes usam `std::env::temp_dir()`, cuja ACL é distinta.
- **Credential Manager**. O passo 4 do spec menciona Windows Credential Manager para "segredos de integrações futuras que realmente precisem existir". Nenhum segredo entra no app hoje; essa camada fica para quando houver — e nunca será usada para capturar senha SINESP ou segredo MFA.
- **Retenção/limpeza agendada**. O spec passo 6 pede "retenção e exclusão de temporários com prévia dos itens e confirmação para remoção material". `list_within` + `delete_within` dão a primitiva; a política + UI de confirmação ficam para quando houver temporários reais (M6, PDFs baixados e OCR).
- **Prova de proteção de WAL/backup/auxiliares**. O spec passo 3 alerta que cifrar só o arquivo principal e deixar temporários em claro não atende. Hoje o SQLite principal fica em `%APPDATA%\br.sied.systemv5\sied-v5-local.sqlite3` **em claro** (ele carrega apenas metadados: número do B.O., natureza, estado, reason sanitizado, timestamps). Nenhum conteúdo policial sensível vai para esse arquivo. Quando M6 começar a persistir conteúdo real, toda a escrita passará por `secure_write` para ir cifrada; o banco principal continuará sendo o índice de metadados.

## Ambiente

- Rustc 1.100.0 stable-x86_64-pc-windows-msvc
- Node 26.13.1, Python 3.12.10
- Windows 10 Home 19045
- DPAPI é parte do Windows desde XP SP3; `Crypt32.dll` sempre disponível neste alvo.

## Próximo marco

M12 estabelece a base. Os próximos passos possíveis são:

- **M4/M5/M6 com sessão PPE real** — depende de você abrir o Edge via `npm run ppe:inspecionar` numa sessão autorizada e me passar fragmentos sanitizados do DOM.
- **M11 (agendamento)** — independente de PPE, pode avançar; a parte de retenção que M11 toca já tem `delete_within` disponível.
- **M8 (IA local Ollama)** — independente de PPE para a parte sintética, usa `secure_write` para versionar prompts e análises.
