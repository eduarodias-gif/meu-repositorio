# SIED SYSTEM V5 — Verificação M4 (DOM real e limites do leitor)

Data: 2026-11-17 (America/Sao_Paulo)

## Escopo desta entrega

M4 integral exige **sessão autorizada no PPE/SINESP** (CPF/senha/OTP digitados pelo responsável no portal oficial) para inspeção do DOM real. Essa validação em produção **não foi executada** nesta sessão — ela depende de quem tem a sessão autorizada abrir o Edge via `npm run ppe:inspecionar` e me passar fragmentos sanitizados (sem dados pessoais, nomes de envolvidos, OTP ou números reais).

Esta entrega avança as partes de M4 que não dependem do PPE real:

1. Dois bugs de robustez corrigidos (localizador CSS e desambiguação de aba PPE).
2. Dois reforços defensivos no detector de cabeçalho e nas revalidações pós-loading.
3. Três fixtures sintéticas novas + seis testes Playwright/Node novos exercitando casos antes não cobertos.

## Bugs corrigidos

### 1. `panelLocator` falhava silenciosamente em IDs JSF com `:` e `.`

IDs reais do PPE/JSF seguem o padrão `form:bo:tabs:panel` ou `form:bo.tabs.panel`. O seletor anterior `#${panelId}` era um seletor CSS válido mas **semanticamente errado**: o `:` iniciava pseudo-classe e o `.` iniciava classe. O resultado era `panel.count() === 0` → `PAINEL_AUSENTE: *` em todas as abas, apesar do painel existir no DOM.

Correção em `src/ppe/reader.mjs`: usar seletor de atributo `[id="..."]`, que não precisa de escape e aceita qualquer caractere exceto aspas duplas (já rejeitadas pela regex de validação anterior).

### 2. `ppePage()` escolhia a última aba PPE sem validar operação

O script `scripts/ppe-inspecao-assistida.mjs` fazia `pages.at(-1)` sobre todas as abas cuja URL começasse com `/ppe/`. Após `openExactBoReadOnly`, se o usuário tivesse outra aba PPE aberta por acidente (outro B.O., aba do histórico, etc.), o script podia operar sobre o B.O. errado.

Correção:
- Nova função exportada em `src/ppe/contract.mjs`: `isPesquisarUrl(url)` reconhece apenas `/ppe/pesquisar/BO/` (via regex ancorada).
- `ppePage(expect)` no script aceita `'pesquisar'`, `'visualizar'` ou `'any'`. Zero candidatos = erro imediato. Múltiplos candidatos compatíveis = erro listando todas as URLs encontradas, para o operador fechar as duplicadas.
- As duas chamadas de `ppePage()` no script foram parametrizadas: `'pesquisar'` depois do login manual, `'visualizar'` depois de abrir a lupa.

## Reforços defensivos

### 3. `exactHeaderNumber` tolera cabeçalhos duplicados com o mesmo número

A implementação anterior exigia `candidates.length === 1`. Isso rejeitava cenários legítimos como um h1 principal e um h2 de breadcrumb carregando o mesmo número do B.O. — ambos passavam o regex, `length === 2` → `null` → `NUMERO_NAO_CONFIRMADO`.

Correção: aplicar `new Set(candidates)` antes do teste. Agora:
- Dois cabeçalhos com o **mesmo** número → aceita (único após dedup).
- Dois cabeçalhos com **números diferentes** → rejeita (ambiguidade real).
- Suficixos distintos (`00000001/2026` vs `00000001/2026-OUTRO`) permanecem distintos e rejeitam.

### 4. Revalidação de sessão/acesso APÓS o `waitForFunction` de loading

Em `readBoTabs`, após a espera do `data-state !== 'loading'`, o código antes só verificava o estado final do painel. Se a sessão tivesse expirado DURANTE o loading (redirect assíncrono típico de SPA), o reader continuaria tratando o painel como normal.

Correção: após o `waitForFunction`, chamar de novo `sessionExpired(page)` e `accessRestricted(page)` antes de reavaliar o painel. Qualquer uma positiva corta com `FALHA/SESSAO_EXPIRADA` ou `RESTRITA/ACESSO_RESTRITO` — sem reportar `recognizedTabs` falsamente.

## Fixtures e testes acrescentados

### Fixtures (`tests/fixtures/ppe/`)

- **`bo-jsf-ids.html`** — As nove abas usam `aria-controls` no formato `form:bo:tabs:registro`, `form:bo.envolvidos`, etc. Os `<section id>` correspondem. Comprova que o novo seletor resolve IDs com `:` e `.`.
- **`bo-loading-infinite.html`** — Oito painéis normais + painel `Documentos` preso em `data-state="loading"` sem transição para `ready`. Comprova que o timeout de 1500ms vira `PARCIAL` com `PAINEL_NAO_CARREGADO: Documentos`, nunca `CONCLUIDA`.

### Testes

#### `tests/ppe-contract.test.mjs` — +1 teste

- `isPesquisarUrl reconhece apenas o caminho de pesquisa oficial` — aceita `/ppe/pesquisar/BO/` (com ou sem barra final); rejeita `http://`, hostnames parecidos, outros caminhos.

#### `tests/ppe-reader.test.mjs` — +5 testes

- `resolves panels whose IDs contain JSF separators (: and .)` — abre `bo-jsf-ids.html`, confirma `CONCLUIDA`, `reasons: []`, e 9 abas reconhecidas.
- `loading infinito vira PARCIAL com PAINEL_NAO_CARREGADO e NUNCA é tratado como leitura completa` — abre `bo-loading-infinite.html`, espera `PARCIAL` + reason `PAINEL_NAO_CARREGADO: Documentos`, 8 outras abas reconhecidas.
- `múltiplos cabeçalhos com B.O. diferentes geram NUMERO_NAO_CONFIRMADO` — HTML inline com `h1` de 99999999/2026 e `h2` de 00000001/2026 (o número pedido); espera `FALHA + ['NUMERO_NAO_CONFIRMADO']`.
- `cabeçalhos duplicados com o MESMO número são aceitos (dedup)` — HTML com três cabeçalhos todos referenciando 00000001/2026; espera `CONCLUIDA` ou `PARCIAL` sem `NUMERO_NAO_CONFIRMADO`.
- `sessão expirando APÓS loading do painel é detectada antes de marcar o painel como ok` — Simula um painel que começa em loading; depois de 100ms vira `ready` mas simultaneamente o body ganha `data-sied-session-expired="true"`. Espera `FALHA + ['SESSAO_EXPIRADA']`.

## Arquivos alterados

- `src/ppe/contract.mjs` — nova função `isPesquisarUrl`.
- `src/ppe/reader.mjs` — `panelLocator` com `[id="..."]`, `exactHeaderNumber` com dedup, revalidação pós-loading em `readBoTabs`.
- `scripts/ppe-inspecao-assistida.mjs` — `ppePage(expect)` parametrizado; duas chamadas atualizadas.
- Novos: `tests/fixtures/ppe/bo-jsf-ids.html`, `tests/fixtures/ppe/bo-loading-infinite.html`.
- `tests/ppe-contract.test.mjs` — +1 teste de `isPesquisarUrl`.
- `tests/ppe-reader.test.mjs` — +5 testes Playwright.

## Testes executados

```powershell
node --test tests/*.test.mjs
```
Resultado: **54 testes, 54 passaram** (era 48 antes de M4). Inclui a suíte Playwright no Edge (channel: 'msedge') contra fixtures sintéticas locais.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked
```
Resultado: 22/22. M4 não toca em código Rust; verificado apenas para confirmar que nada foi quebrado.

```powershell
python tests/sqlite-contract.py
```
Resultado: PASS.

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```
Resultado: exit 0.

```powershell
npm run build
```
Resultado: exit 0. 1589 módulos transformados; bundle principal 270,77 KB / 82,56 KB gzip (idêntico ao M3 — nenhum código TS novo chegou em produção; o bundle inclui apenas o que App.tsx usa).

## Não validado nesta entrega

- **DOM real do PPE**: todos os ajustes foram verificados contra fixtures sintéticas. Os detectores `sessionExpired(page)` e `accessRestricted(page)` continuam dependendo dos atributos inventados `data-sied-session-expired`, `data-access`, `data-state`, `data-empty` — o PPE real quase certamente NÃO tem esses atributos. A adaptação dos localizadores para o DOM observado em sessão autorizada é a parte restante de M4 que só avança com você rodando `npm run ppe:inspecionar` e me enviando fragmentos sanitizados do DOM (sem OTP, sem dados pessoais, sem números reais de B.O.).
- **`ppePage` multi-aba**: o refactor está testado por inspeção de código, não por teste automatizado (teste exigiria um contexto Playwright com várias páginas, infraestrutura que ainda não temos no projeto).
- **`exactHeaderNumber` com `[data-bo-number]`**: o seletor continua procurando esse atributo como uma dica explícita das fixtures. Em DOM real, só o `h1`/`h2` serão úteis.

## Ambiente

- Node.js 26.13.1 / npm 11.20.0, Playwright 1.56.1 contra Edge estável instalado na máquina
- Rustc 1.100.0 stable-x86_64-pc-windows-msvc, Python 3.12.10
- Vite 6.4.6, TypeScript 5.8, React 19.1
- Windows 10 Home 19045

## Próximo marco

**Decisão pendente com o usuário.** M5 (filtros/paginação real) também depende de sessão PPE autorizada; M6 (extrair dados do B.O.) depende de M4+M5 + M12 (proteção local). O caminho sem bloqueio é **pular para M12** (proteção local, DPAPI, retenção, auditoria) e depois voltar a M4/M5/M6 quando houver sessão autorizada disponível, OU avançar pequenas partes sintéticas de M5 (controle de paginação, assinatura de página) agora e deixar a validação real para depois.
