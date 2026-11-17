# SIED SYSTEM V5 V0.4 Foundation Design

## Intent

Continue the existing V0.3 without replacing its approved visual identity. The first deliverable turns the current mixed demo/real foundation into a buildable local Windows application whose dashboard is driven by the SQLite queue and whose PPE reader can be proven against synthetic HTML before any authorized live-session validation.

## Goals

- Make the existing React/Tauri project compile and align all package versions.
- Preserve the three-second splash, black/silver/glass visual language, and existing onboarding flow.
- Replace demo dashboard counts with summaries derived from the local SQLite queue.
- Expand queue states so partial reads, reviews, restrictions, and verified completion are distinct.
- Split the PPE reading logic into testable, read-only modules.
- Add a synthetic PPE fixture covering table discovery, exact B.O. matching, pagination metadata, tabs, missing data, and restricted records.
- Keep CPF, password, OTP, police content, official classification, dispatch, signature, and completion outside automated write actions.

## Non-goals for this milestone

- No automatic click on Despachar, Assinar, Concluir, or any equivalent official action.
- No automatic legal decision or official classification.
- No Ollama integration yet.
- No PDF/document ingestion yet.
- No Windows Task Scheduler integration yet.
- No claim that live PPE integration works until an authorized session is separately validated.

## Constraints

- Initial service cost remains R$ 0 and all dependencies must be free.
- No deploy, hosting, Cloudflare, GitHub publication, or external AI provider.
- Data and logs remain local and exclude unnecessary personal or police content.
- Authentication occurs manually on the official SINESP page.
- Live-page uncertainty must stop safely and create a review condition, never guess a selector or target.
- The existing project folder is not currently a Git repository, so this milestone cannot provide commits until version control is explicitly initialized.

## Current-state audit

- React 19, TypeScript, Vite, Tauri 2, Rust, SQLite, and Playwright are already declared.
- The visual application and three-second splash are implemented.
- SQLite currently supports only `pending`, `review`, and `done`.
- The dashboard still uses hard-coded demo counts (`128`, `46`, and three reviews) instead of SQLite summaries.
- The Playwright inspection script is separate from the desktop UI and requires manual filter/page-size setup.
- The PPE contract already validates official URLs, exact row selection, known headers, and read-only tabs; its four tests pass.
- The SQLite contract test passes.
- The React source contains an immediate compile defect: the setup back button calls undefined `setUsername` and `setPassword` functions.
- Versions are inconsistent: package.json is 0.3.0 while Cargo and Tauri configuration are 0.2.0.
- `node_modules` and lockfiles are absent, so a frontend build has not yet been reproduced in this folder.

## Approaches considered

### 1. Direct live-PPE automation first

Fastest route to visible live behavior, but unsafe and brittle: the real DOM is unverified, failures would be difficult to reproduce, and the dashboard/database model is not ready to record partial or ambiguous outcomes. Rejected.

### 2. Contract-first local foundation, then authorized live validation

Stabilize the build, make SQLite authoritative, extract a read-only adapter, and prove behavior against a synthetic PPE fixture. Then validate selectors in an authorized session without write actions. Chosen because it is reproducible, least risky, and preserves progress.

### 3. Local AI and prompt integration first

Would produce attractive demonstrations but feed the model incomplete or unverified data and leave queue semantics unresolved. Rejected until reading completeness and review states are reliable.

## Architecture

The React UI consumes a small Tauri service boundary. Rust owns the SQLite schema, validation, state transitions, and audit metadata. A TypeScript/JavaScript PPE reader owns only browser interpretation and returns structured, privacy-conscious results; it never performs official write actions. The reader is first exercised against synthetic HTML and later reused by the assisted Edge session.

The queue becomes the source of truth for dashboard metrics. Records transition through explicit local workflow states. A `CONCLUIDO_VERIFICADO` state means only that the permitted final state was observed and recorded locally; it is never inferred from a click.

## Queue states

- `PENDENTE`
- `EM_LEITURA`
- `LIDO`
- `EM_ANALISE`
- `MINUTA_GERADA`
- `AGUARDANDO_REVISAO`
- `VALIDADO_PELO_RESPONSAVEL`
- `AGUARDANDO_FINALIZACAO`
- `CONCLUIDO_VERIFICADO`
- `ERRO`
- `RESTRITO`

Transitions are validated in the backend. Unknown outcomes become `AGUARDANDO_REVISAO` or `ERRO`; they are not retried as official actions.

## PPE reader result

The read-only adapter returns:

- exact B.O. number and source URL;
- table/page metadata and duplicate detection;
- status and nature text as displayed;
- recognized and missing tabs;
- read completeness: `CONCLUIDA`, `PARCIAL`, `RESTRITA`, or `FALHA`;
- technical review reasons without logging full police content.

## Testing strategy

- Rust unit tests for validation, queue states, transitions, and summary counts.
- Node contract tests for official URL restrictions, exact row selection, headers, and duplicate handling.
- Playwright tests against synthetic HTML for page size, exact lupa selection, header confirmation, tab traversal, missing documents, restricted access, and session-expired behavior.
- Frontend TypeScript build as the minimum integration check.
- Tauri/Rust tests and desktop build where Windows toolchain availability permits.

## Delivery boundary

This design defines the full direction, but implementation is split into independently verifiable milestones. The first plan covers build stabilization, the authoritative queue/dashboard, and the synthetic read-only PPE adapter. Ollama, legal-minuta UI, scheduling, and authorized live validation receive separate plans after this foundation passes.
