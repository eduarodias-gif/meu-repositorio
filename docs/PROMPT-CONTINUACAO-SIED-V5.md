# Prompt de continuidade — SIED SYSTEM V5

Atualizado em 13/11/2026. Base examinada: V0.4, commit `60a7802`.

Este arquivo é um prompt completo para o Codex no computador de casa. Abra o repositório como projeto e peça: **“Leia `docs/PROMPT-CONTINUACAO-SIED-V5.md` e execute a partir do primeiro marco pendente, conferindo o código atual.”** Cada marco abaixo também pode ser executado separadamente.

Os caminhos da seção “Onde mexer” são relativos à raiz do repositório. **Existente** significa que o arquivo está na base examinada; **novo** é uma proposta de implementação futura. Não crie todos os arquivos antecipadamente.

---

## 1. Instrução principal ao executor

Você continuará o SIED SYSTEM V5 a partir deste repositório privado:

[Doctor-Henrique-Oliveira/SIED-SYSTEM-V5](https://github.com/Doctor-Henrique-Oliveira/SIED-SYSTEM-V5)

O objetivo é concluir o aplicativo Windows gradualmente, com fila persistente, leitura autorizada do PPE, IA local e revisão humana. Preserve o nome, a abertura de três segundos, a balança da Justiça e o visual preto/prata/vidro. Aproveite os módulos existentes.

Execute passos pequenos. Para cada mudança de comportamento, escreva um teste que demonstre o problema, observe a falha, implemente e confira o resultado. Não considere uma etapa pronta por existir um botão, um arquivo ou uma simulação. Diferencie implementação, teste sintético, validação no desktop e validação autorizada no PPE.

As duas melhorias pequenas adiadas são os marcos M1 e M2. As demais seções detalham o restante do produto, em ordem de dependência. Este documento orienta desenvolvimento futuro; sua presença no Git não significa que os marcos já foram implementados.

### Escopo e decisões vigentes

- Execução e armazenamento locais; custo inicial de serviços R$ 0; dependências gratuitas.
- GitHub privado autorizado para código, documentação e testes sintéticos. Não enviar dados de B.O., capturas sensíveis, perfis Edge, bancos de produção, senhas, cookies ou tokens.
- CPF, senha e OTP são digitados manualmente no portal oficial. Não importar segredos MFA e não prometer sessão permanente.
- A IA sugere classificação e minuta; a decisão jurídica continua com o responsável competente.
- O usuário esclareceu que “Assinar” é um botão já existente no PPE. A evolução está detalhada em M10: usar documento aprovado, operação autorizada, sessão legítima e verificação do resultado. Não desenvolver certificados, imitar assinatura ou agir como outra pessoa.
- **Não criar janelas de confirmação adicionais para cada clique rotineiro já autorizado.** Aproveitar a aprovação do documento e o escopo de operação registrado. Respeitar confirmações realmente exigidas pelo PPE, pela ferramenta utilizada ou por regras institucionais comprovadas. Não inventar exigências pelo nome do botão.
- Planilhas foram adiadas anteriormente, mas o pedido técnico mais recente voltou a incluí-las no teste funcional. Cubra esse requisito inicialmente com um adaptador de planilha local de teste e dados fictícios. A integração com a planilha real continua dependendo da identificação do arquivo, formato e regras de atualização; não escolher ou alterar uma planilha pessoal por suposição. O SQLite continua sendo a fonte do histórico de operações.
- Sem deploy, hospedagem, Cloudflare, APIs de IA pagas ou processamento externo de dados policiais.
- Autorização para desenvolver código não dispensa aprovação do documento, permissão efetiva da sessão e controles obrigatórios do serviço. Quando esses requisitos já estiverem satisfeitos, executar o fluxo autorizado sem acrescentar popups próprios a cada etapa.

## 2. Estado real que deve ser preservado

| Local existente | O que faz hoje | O que ainda falta |
| --- | --- | --- |
| `src/App.tsx` | Splash, configuração local, painel, cadastro e revisão resumida | Worker, detalhes de revisão, atualização contínua, agendamento efetivo |
| `src/services.local.ts` | `invoke` dos comandos Tauri, tipos `LocalBo`, `QueueStatus`, `QueueSummary` | Normalização de erros, comandos/eventos dos módulos futuros |
| `src/queue/summary.mjs` | Converte resumo persistido em métricas | Integração com um worker real |
| `src-tauri/src/lib.rs` | SQLite, comandos, estados, transições, resumo e abertura do SINESP | Testes completos, processamento concorrente seguro, módulos futuros |
| `src-tauri/src/sql/schema_v04.sql` | Tabelas `bo_queue` e `audit_log` | Leituras, minutas, versões, execuções e configuração persistida |
| `src-tauri/src/sql/migrate_v03_to_v04.sql` | Migra `pending/review/done` e preserva status desconhecido em auditoria | Testes de inicialização repetida, versões futuras e falhas |
| `src/ppe/contract.mjs` | URLs, cabeçalhos, número exato, situação `Registrado`, nove abas | Adaptação ao DOM real validado |
| `src/ppe/reader.mjs` | Inspeção estrutural de tabela/abas; rejeita ambiguidades conhecidas | Extração completa, paginação, detectores reais e eventos tardios |
| `scripts/ppe-inspecao-assistida.mjs` | Edge isolado, login manual e inspeção de um B.O. | Integração com o painel e fila, seleção inequívoca de página |
| `config/prompts/prompt-despacho-referencia.txt` | Texto jurídico original de referência | Revisão dos critérios, versionamento e ligação à IA local |
| `tests/fixtures/ppe/` | Páginas fictícias | Variações realistas de DOM, falhas e transições assíncronas |

Evidência histórica da V0.4: 15 testes Node passaram, contrato SQLite Python passou, frontend compilou e `cargo fmt --check` passou. Os testes Rust e o instalador foram bloqueados por ausência de MSVC `link.exe`. A tentativa de instalar Build Tools retornou `5002` / `0x80070005`, acesso negado. Refaça o diagnóstico no outro computador; não presuma que o bloqueio continua lá.

Leia também:

1. `README.md`.
2. `docs/verification/2026-11-13-v04-foundation.md`.
3. `docs/superpowers/specs/2026-11-13-sied-v04-foundation-design.md`.
4. `docs/superpowers/plans/2026-11-13-sied-v04-foundation.md`.

O plano antigo contém descrições da V0.3 e caixas que podem estar desatualizadas. Use o código e os relatórios de verificação para evitar refazer trabalho já concluído. A pasta `.superpowers/` é ignorada pelo Git e não deve ser necessária para retomar em casa.

---

## M0 — Abrir o projeto em casa e liberar o build Windows

**Entrega:** checkout reproduzível, dependências confirmadas e diagnóstico conclusivo do desktop.

**Onde mexer:** inicialmente apenas ambiente Windows. Se necessário, corrigir `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` e `package.json` mantendo versões compatíveis. Registrar evidências em um novo arquivo de `docs/verification/`.

### Passo a passo

1. Escolha uma pasta de projetos no computador de casa. Se ainda não houver clone, execute nela:

   ```powershell
   git clone https://github.com/Doctor-Henrique-Oliveira/SIED-SYSTEM-V5.git
   Set-Location .\SIED-SYSTEM-V5
   ```

   Se já existir clone, entre nele e examine `git status` antes de `git pull --ff-only`. Preserve alterações locais. O caminho antigo `C:\SIED PAINEL V5\SIED-SYSTEM-V5-V03` é uma referência da outra máquina, não um requisito para o novo computador.

2. Confira o ponto de partida e abra uma branch de trabalho descritiva:

   ```powershell
   git status --short --branch
   git log -3 --oneline
   git remote -v
   git switch -c melhorias/continuidade-v5
   ```

   Se essa branch já existir, examine seu estado e continue nela; não a sobrescreva.

3. Confira ferramentas: `node --version`, `npm.cmd --version`, `rustc --version`, `cargo --version`, `py --version` e `rustup target list --installed`. Use uma versão Node suportada pelas dependências travadas e documente-a. A base foi compilada com Node 24.14.1; não atualize frameworks apenas por estarem disponíveis versões novas.

4. Pelo instalador oficial do Visual Studio, verifique **Desktop development with C++**, compilador MSVC x64/x86 e Windows SDK. Verifique também WebView2 e Edge. VS Code sozinho não fornece o compilador. Se já estiverem instalados, abra o **Developer PowerShell for VS** para x64. Use `where.exe link` e confira que o resultado pertence ao MSVC; o `link.exe` do Git não é o linker necessário. Uma instalação administrativa pode exigir confirmação direta da pessoa no Windows.

5. Na raiz do clone, instale as versões do lockfile e execute a base:

   ```powershell
   npm.cmd ci
   node --test tests/*.test.mjs
   py tests/sqlite-contract.py
   npm.cmd run build
   cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
   cargo test --manifest-path src-tauri/Cargo.toml --locked
   ```

   Confira o código de saída de cada comando antes do próximo. Se o Python estiver disponível como `python`, use esse executável e registre a substituição. Os testes de navegador usam Edge; não baixe vários navegadores por padrão.

6. Execute `npm.cmd run desktop:dev`. Confira splash, botão Voltar, configuração, cadastro de um B.O. fictício, contadores, revisão e persistência após reiniciar. Depois execute `npm.cmd run desktop:build`. A configuração atual gera NSIS; não habilite MSI ou outros formatos sem necessidade.

7. Localize os arquivos realmente gerados em `src-tauri/target/release/` e `src-tauri/target/release/bundle/nsis/`, ou no diretório indicado pelo Cargo caso exista `CARGO_TARGET_DIR` configurado. Registre o caminho e o hash SHA-256 do instalador. Não invente o nome do executável. Se houver falha, registre comando, saída e dependência faltante.

**Pronto quando:** testes Rust executaram ou há bloqueio reproduzido; o desktop foi efetivamente aberto se o ambiente permitiu; a situação do instalador está descrita com evidência. Um bloqueio de toolchain não impede implementar e testar utilitários independentes de M1.

Referências: [pré-requisitos oficiais do Tauri](https://v2.tauri.app/start/prerequisites/) e [instalador Windows](https://v2.tauri.app/distribute/windows-installer/).

## M1 — Mostrar corretamente os erros retornados pelo Tauri

**Problema concreto:** Rust retorna `Result<..., String>`. Em `handleAddLocalBo`, `App.tsx` reconhece apenas `Error`; uma rejeição textual como “Este B.O. já está na fila local.” vira mensagem genérica.

**Onde mexer:**

- Existentes: `src/services.local.ts`, `src/App.tsx`, especialmente `handleAddLocalBo` e carregamento inicial.
- Novos propostos: `src/services/errors.mjs`, `src/services/errors.d.mts`, `tests/service-errors.test.mjs`.

### Passo a passo

1. Crie um normalizador puro `toUserError(error, fallback)` no módulo proposto. Defina o comportamento pelos testes antes de implementá-lo: `Error` com mensagem, string não vazia, string vazia, `null`, objeto desconhecido e erro genérico. Preserve a mensagem específica de duplicidade e use o fallback para entradas sem mensagem aproveitável.
2. Execute `node --test tests/service-errors.test.mjs`, confirme a falha esperada e implemente o normalizador. Não use `JSON.stringify` indiscriminado em objetos de erro, pois eles podem carregar payloads e detalhes que não devem aparecer na tela.
3. Adicione a declaração `.d.mts` para TypeScript estrito, seguindo o padrão já usado em `src/queue/summary.d.mts`.
4. Normalize as rejeições no limite de serviços Tauri, mantendo as assinaturas públicas existentes, ou use o mesmo utilitário em todos os catches relevantes. Evite quatro versões diferentes da mesma regra. Preserve erros técnicos completos apenas em diagnóstico local sanitizado, quando necessário.
5. Em `App.tsx`, mostre a mensagem normalizada no campo de erro. A tentativa de adicionar um B.O. duplicado não deve limpar o formulário, incrementar contadores nem criar um segundo registro.
6. Execute o teste novo, a suíte Node e o build frontend. No desktop com dados fictícios, adicione duas vezes o mesmo número e confira a mensagem específica e apenas uma linha na fila.

**Pronto quando:** a pessoa entende o motivo de duplicidade/validação e o estado da fila continua correto. Teste o comportamento, não a presença de uma string no código-fonte.

## M2 — Testar todas as transições e a consulta SQL real

**Problema concreto:** os testes Rust cobrem poucos pares de estados. O contrato Python calcula o resumo com uma consulta copiada, que pode divergir da consulta do backend.

**Onde mexer:**

- Existentes: `src-tauri/src/lib.rs`, funções `transition_allowed`, `connection`, `queue_summary`, `update_bo_status` e módulo `tests`; `tests/sqlite-contract.py`.
- Novo proposto: `src-tauri/src/sql/queue_summary.sql`.
- Preserve `schema_v04.sql` e `migrate_v03_to_v04.sql` como migrações históricas. Alterações futuras de esquema precisam de uma migração nova, não de reescrever a história de bancos já instalados.

### Passo a passo

1. Antes de alterar regras, use a tabela abaixo como expectativa explícita da V0.4. Identifique os onze estados nos testes e percorra os **121 pares** possíveis. Compare com uma tabela independente de pares permitidos. Não chame `transition_allowed` para calcular o próprio resultado esperado.

   | Origem | Destinos permitidos atualmente |
   | --- | --- |
   | `PENDENTE` | `EM_LEITURA`, `ERRO`, `RESTRITO` |
   | `EM_LEITURA` | `LIDO`, `AGUARDANDO_REVISAO`, `ERRO`, `RESTRITO` |
   | `LIDO` | `EM_ANALISE`, `AGUARDANDO_REVISAO`, `ERRO` |
   | `EM_ANALISE` | `MINUTA_GERADA`, `AGUARDANDO_REVISAO`, `ERRO` |
   | `MINUTA_GERADA` | `AGUARDANDO_REVISAO`, `VALIDADO_PELO_RESPONSAVEL`, `ERRO` |
   | `AGUARDANDO_REVISAO` | `EM_LEITURA`, `EM_ANALISE`, `VALIDADO_PELO_RESPONSAVEL`, `ERRO`, `RESTRITO` |
   | `VALIDADO_PELO_RESPONSAVEL` | `AGUARDANDO_FINALIZACAO`, `AGUARDANDO_REVISAO`, `ERRO` |
   | `AGUARDANDO_FINALIZACAO` | `CONCLUIDO_VERIFICADO`, `AGUARDANDO_REVISAO`, `ERRO` |
   | `CONCLUIDO_VERIFICADO` | Nenhum |
   | `ERRO` | `PENDENTE`, `EM_LEITURA`, `AGUARDANDO_REVISAO` |
   | `RESTRITO` | `AGUARDANDO_REVISAO` |

2. Mantenha testes de round-trip `QueueStatus::parse`/`as_str`, estado desconhecido, repetição do mesmo estado e tentativas de saltar diretamente de `PENDENTE` para conclusão. Uma mudança de regra exige um teste e justificativa no relatório.
3. Extraia o SELECT atual de `queue_summary` para `queue_summary.sql` e carregue-o com `include_str!` no Rust. Faça `tests/sqlite-contract.py` ler exatamente esse arquivo. Elimine a consulta copiada do teste.
4. Extraia uma função de resumo que receba `&Connection` para ser executada tanto pelo comando Tauri como pelos testes Rust com SQLite em memória. O teste não deve precisar construir `AppHandle` para testar SQL.
5. Teste banco vazio: todos os seis valores do resumo devem ser zero, não `NULL`. Insira um registro sintético de cada estado: o resultado esperado é **7 em fluxo, 1 concluído, 3 em revisão, 1 erro, 1 restrito, 11 no total**. Teste também o caso misto já existente, `(2, 1, 3, 1, 1, 6)`.
6. Separe a inicialização/migração do caminho específico do aplicativo para testá-la com conexão em memória. Confira banco novo, legado, status desconhecido preservado na auditoria, razões, timestamps, reabertura e inicialização repetida. A segunda inicialização não pode repetir migração nem duplicar auditoria. Esquema mais novo que o suportado deve ser identificado sem downgrade silencioso.
7. Teste a função de atualização realmente usada pelo comando: transição inválida não muda linha nem auditoria; falha na escrita de auditoria reverte o estado; número inexistente é rejeitado. Extraia o núcleo para uma função que receba conexão quando necessário.
8. Rode os testes Python, `cargo test --manifest-path src-tauri/Cargo.toml --locked`, `cargo fmt --check` com o manifest e o build frontend. Registre a quantidade efetivamente executada; não marque Rust como aprovado se o linker impediu a execução.

**Pronto quando:** produção e testes usam o mesmo SQL de resumo e toda a matriz é exercitada, com persistência e migrações testadas por comportamento.

## M3 — Atualização consistente do dashboard e revisão básica

**Onde mexer:** `src/App.tsx`, `src/services.local.ts`, `src/queue/summary.mjs`, `src-tauri/src/lib.rs`. Novos propostos: `src/hooks/useQueue.ts`, `tests/queue-refresh.test.mjs` e um teste de interface conforme a infraestrutura escolhida.

### Passo a passo

1. Preserve a fonte SQLite. Hoje linhas e resumo são carregados por chamadas separadas; uma mudança entre elas pode deixar números e lista inconsistentes.
2. Crie um comando que devolva um snapshot `{ rows, summary, revision }` obtido numa leitura consistente do banco. Reutilize as funções do M2 e evite duas regras distintas de contagem.
3. Centralize carregamento, erro e atualização em um hook pequeno, sem reestruturar o visual. Uma resposta antiga não pode sobrescrever uma atualização mais nova; trate fechamento da tela e cancelamento.
4. Atualize o snapshot após cadastro, transição e eventos do worker futuro. Diferencie carregando, banco indisponível e fila vazia; erro de leitura não equivale a zero registros.
5. Preserve o modal clicável e a busca por número, natureza e motivo. Mostre hora local formatada e estado legível. Não exiba JSON técnico ou relato completo na lista resumida.
6. Teste duplicidade, erro inicial, resposta fora de ordem, erro após escrita já confirmada e atualização após evento. Adicionar com sucesso e falhar ao recarregar deve oferecer “atualizar”, sem repetir o INSERT automaticamente.
7. Até M7, `INICIAR` deve informar claramente que o worker ainda não foi integrado. Não use status “executando” para representar processamento inexistente.

**Pronto quando:** lista e contadores representam a mesma revisão do banco e nenhum temporizador fabrica progresso.

## M4 — Validar DOM real e fortalecer os limites do leitor

**Onde mexer:** `src/ppe/contract.mjs`, `src/ppe/reader.mjs`, `scripts/ppe-inspecao-assistida.mjs`, `tests/ppe-contract.test.mjs`, `tests/ppe-reader.test.mjs`, fixtures em `tests/fixtures/ppe/`.

### Passo a passo

1. Revise os testes sintéticos existentes antes de abrir produção. A presença de `data-result-total`, `data-access`, `data-state` ou `data-empty` nas fixtures não prova que esses atributos existem no PPE.
2. Em uma sessão autorizada, deixe a pessoa autenticar CPF/senha/OTP no portal oficial. Inspecione apenas o DOM necessário para tabelas, cabeçalhos, lupa, abas e estados. Registre descrições ou fragmentos sanitizados sem valores de credenciais ou dados pessoais.
3. Corrija `ppePage()`: não selecionar simplesmente a última página PPE. Associe a página à operação e ao B.O.; zero ou várias candidatas exigem identificação inequívoca. Teste visualização na mesma aba e em nova aba sem escolher outra ocorrência por acidente.
4. Corrija `panelLocator`: IDs JSF podem conter `:` e `.`. O seletor atual `#${panelId}` precisa de escape CSS correto ou de busca exata por ID. Teste IDs com dois-pontos, ponto, caracteres escapáveis, ID ausente e ID duplicado.
5. Reforce `exactHeaderNumber`: valide o identificador completo da região de cabeçalho reconhecida. Teste sufixos diferentes, múltiplos cabeçalhos, prefixo válido dentro de identificador maior e referência a outro B.O. no corpo.
6. Adapte os detectores de sessão expirada, login em etapas e acesso restrito ao DOM observado. Revalide após cada ação **e depois de carregamentos assíncronos**, incluindo o último painel; testar apenas o estado antes do clique não basta.
7. Mantenha `reader.mjs` estritamente voltado à leitura. Não adicione nele cliques em Despachar, Assinar ou Concluir. M10 terá um módulo separado para atos assistidos. Nomes de abas e links por si só não provam navegação segura: use os destinos e a estrutura observados, com parada em caso de dúvida.
8. Teste navegação inválida, painel com erro, loading que nunca termina, restrição tardia, redirect de sessão, botão com rótulo enganoso, zero registros e DOM incompatível. Um timeout não pode virar leitura completa.

**Pronto quando:** os localizadores reais possuem evidência e fixtures sanitizadas; integração real só é declarada para o que foi realmente validado. Sem acesso ao portal, avance com fixtures e marque validação real como pendente.

## M5 — Situação, 100 itens, paginação e filtros reais

**Onde mexer:** leitor/contrato/script do M4 e controles de filtro em `App.tsx`. Novos propostos: `src/ppe/search.mjs`, `src/ppe/search.d.mts`, `tests/ppe-pagination.test.mjs` e fixtures de múltiplas páginas.

### Passo a passo

1. Crie funções propostas `configureRegisteredSearch(page, options)` e `collectRegisteredBos(page, options)`. Elas devem usar controles semanticamente identificados no M4; não invente IDs do PPE.
2. Aplique situação exatamente `Registrado` e confirme o valor exibido. Se a operação exigir um botão Pesquisar, valide esse botão e aguarde a atualização real da tabela.
3. Selecione 100 no controle observado, aguarde a mudança e leia o tamanho efetivo. “100” é o tamanho desejado da página, não a quantidade total de B.O.s disponíveis.
4. Extraia total, página, ordenação e registros visíveis. Quando o total não puder ser identificado, mantenha `null` e use o controle de próxima página comprovado. Não fabrique total a partir do tamanho da página.
5. Percorra páginas com conjunto de números vistos e assinatura da página. Valide a mudança após avançar. Controle próxima desabilitada, página repetida, total variável, reordenação, limite de itens, cancelamento e expiração. Não entre em loop nem declare cobertura completa se a listagem mudou durante a leitura.
6. Registre checkpoints técnicos com filtro, ordenação, data e última página/identificador. Na retomada, reconcilie com a listagem atual. Detecte duplicatas entre páginas sem produzir tarefas duplicadas.
7. Faça os filtros usarem os códigos/textos realmente descobertos. Preserve natureza original e código quando disponíveis; o array fixo `NATURES` não deve ser tratado como catálogo oficial. Categoria seleciona tarefas, mas não permite ignorar outras informações do B.O. durante sua leitura.
8. Teste 0, 1, 10, 100 e 101 registros; última página parcial; página só com estados não elegíveis; alteração de total; repetição; mesmo número em páginas diferentes; interrupção e retorno. Esses testes usam apenas HTML sintético.

**Pronto quando:** é possível explicar quantas páginas foram verificadas, quantos B.O.s únicos foram encontrados e se a cobertura é completa ou parcial.

## M6 — Extrair os dados do B.O. e tratar documentos

**Onde mexer:** `src/ppe/reader.mjs`, contrato e fixtures. Novos propostos: `src/types/boletim.ts`, `src/ppe/extract.mjs`, `src/ppe/documents.mjs`, `tests/ppe-extraction.test.mjs`, `tests/ppe-documents.test.mjs`. A proteção de persistência do M12 deve existir antes de salvar conteúdo real.

### Passo a passo

1. Defina `Boletim` com número, unidade, situação, naturezas, fatos, envolvidos, objetos, relatos, documentos e histórico. Inclua em cada seção estado de leitura, referência de origem, horário e pendências. Dados ausentes devem continuar ausentes; não preencher com informação inventada.
2. Crie extratores por aba. Hoje `readBoTabs` retorna somente `completeness`, `recognizedTabs` e `reasons`; isso é inspeção estrutural. Mantenha essa distinção e não entregue a IA apenas uma lista de abas como se fosse o boletim completo.
3. Extraia somente o painel confirmado do B.O. exato. Diferencie conteúdo vazio explícito, ausente, ilegível, restrito, erro e informação ainda carregando. Valide identidade antes/depois de navegar entre abas.
4. Consolide as nove abas com identificação de fonte. Se natureza e relato divergirem, preserve os dois e acrescente alerta. Não faça classificação jurídica durante a extração.
5. Para documentos, primeiro implemente testes com PDFs sintéticos. Identifique links autorizados, MIME, tamanho, hash, associação ao B.O. e tratamento de redirect. O script atual usa `acceptDownloads: false`; mudar isso exige um fluxo específico, limitado e testado.
6. Implemente leitura local de PDF de texto. Se for imagem, marque necessidade de OCR e adicione OCR local somente se houver dependência e recursos disponíveis. Mantenha indicação de incerteza; não confunda texto de OCR com transcrição confirmada.
7. Arquivos temporários ficam no diretório de dados/temporários do aplicativo, fora do repositório e com retenção controlada. Não abrir macros, executar anexos ou enviar documentos a serviços externos.
8. Teste documento ausente, negado, corrompido, sem texto, grande demais e interrompido. Documento necessário não lido impede afirmar leitura integral e encaminha a revisão.

**Pronto quando:** o resultado consolidado possui dados e fontes verificáveis; completude não é apenas “todos os botões foram encontrados”.

## M7 — Ligar navegador, fila e painel; implementar pausa e retomada

**Onde mexer:** `src/App.tsx`, `src/services.local.ts`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, capacidades e configuração Tauri somente quando necessário. Novos propostos: `automation/worker.mjs`, `automation/protocol.mjs`, `src-tauri/src/worker.rs`, `src-tauri/src/queue.rs`, `tests/worker-protocol.test.mjs`, `tests/queue-worker.test.mjs`.

### Passo a passo

1. Defina um protocolo local versionado entre Rust e worker Node/Playwright. Prefira processo filho com stdin/stdout delimitado e validação de mensagens; não exponha servidor acessível na rede para controlar o navegador. O backend controla caminhos, argumentos e ciclo de vida.
2. Mensagens mínimas: iniciar, pausar, parar, retomar, estado da sessão, tarefa atual, leitura concluída e falha técnica. Separe mensagens de protocolo dos logs. Não imprima payload de B.O. no console; transporte conteúdo somente no canal necessário e protegido.
3. Rust permanece responsável pelo SQLite. Não deixe dois processos atualizarem a mesma fila com regras diferentes. Valide protocolo, tamanho, versão, número, estado anterior e permissões de operação em cada resultado recebido.
4. Faça aquisição de tarefa/transição de estado ser atômica. Hoje `update_bo_status` lê o estado antes da transação e depois atualiza sem condição sobre o estado antigo. Mova a validação para a transação e use condição/versionamento que impeça dois workers de adquirir a mesma tarefa.
5. Preserve ordem da fila usando sequência persistida ou critério FIFO estável. `list_all` atualmente ordena os registros mais novos primeiro para exibição; não use essa ordem automaticamente como ordem de processamento. Importação precisa ser idempotente e preservar estados avançados.
6. Ligue os botões do painel a comandos reais. Pausar impede iniciar outra tarefa; parar encerra com checkpoint seguro; retomar valida sessão e último ponto consistente. Não mate abruptamente uma escrita de banco ou ato oficial de resultado desconhecido.
7. Traduza resultados: leitura completa pode levar a `LIDO`; leitura parcial vai para revisão; acesso negado vai para `RESTRITO`; falha técnica vai para `ERRO`. IA pronta não equivale a B.O. oficialmente finalizado. Pendência individual não deve travar todas as outras leituras elegíveis.
8. Defina recuperação de `EM_LEITURA`/`EM_ANALISE` deixados por queda. Registre tentativa e resultado sem duplicar trabalho. Autenticação expirada suspende operações dependentes da sessão e solicita login manual.
9. Emita eventos para o hook do M3 atualizar snapshot, tarefa e última atividade. Teste duas instâncias, pausa durante leitura, fechamento inesperado, mensagem inválida, reinício, fila grande e limite de tentativas de leitura.

**Pronto quando:** Iniciar/Pausar executam tarefas reais e verificáveis em ambiente sintético, e reiniciar o aplicativo preserva a fila sem repetir efeitos oficiais.

Referência de empacotamento para a etapa final: [binários externos do Tauri](https://v2.tauri.app/develop/sidecar/). Um script Node em desenvolvimento não vira automaticamente um componente instalado do aplicativo.

## M8 — Prompt versionado e IA local com Ollama

**Onde mexer:** preserve `config/prompts/prompt-despacho-referencia.txt`; acrescente serviços em `src/services/ai/`, backend em `src-tauri/src/ai.rs`, UI de configuração em componente próprio e comandos em `services.local.ts`. Novos propostos: testes do cliente, do parser e do limite de minuta; migração SQLite para versões de prompt/análise.

### Passo a passo

1. Leia o prompt jurídico integral. Preserve uma versão original imutável e um hash. Antes de uso real, registre revisão dos critérios pelo responsável jurídico; este guia não valida a correção ou vigência do texto legal.
2. Implemente editor de versões com ID, data e relação com versão anterior. Uma edição cria versão nova, não altera retroativamente análises já geradas.
3. Detecte Ollama local e modelos disponíveis. Pode usar `ollama list` para diagnóstico e `GET http://127.0.0.1:11434/api/tags` para o cliente. Escolha um modelo realmente local, compatível com RAM/VRAM e contexto. Não selecione um modelo de nuvem ou faça download grande sem informar tamanho e obter a escolha necessária do usuário.
4. Prefira cliente no backend com destino loopback validado, timeout e cancelamento. A CSP atual do frontend permite apenas a própria aplicação e Vite; não abra acesso genérico à rede para resolver isso. Não aceitar redirects para provedores externos.
5. Use `POST /api/chat`, inicialmente com `stream: false` e esquema JSON em `format`. Valide a resposta novamente no aplicativo. Esquema válido não prova verdade jurídica. Endpoint local e modelo de nuvem também são coisas diferentes: confirme execução local do modelo.
6. Separe instruções do sistema, prompt versionado e dados extraídos. Relatos e documentos são dados não confiáveis; instruções embutidas num B.O. não podem mudar o comportamento do sistema, solicitar credenciais ou autorizar cliques.
7. Resultado mínimo: classificação sugerida, fatos com fontes, justificativa, fundamentos a conferir, informações ausentes, alertas e minuta. O limite da minuta é 4.000 caracteres; mostre contagem e trate excesso como resultado a revisar, sem cortar silenciosamente o dispositivo.
8. Vincule análise a número do B.O., hash/revisão da leitura, modelo e versão do prompt. Se uma fonte mudar, a análise anterior fica desatualizada e exige nova revisão. Não envie leitura parcial como se fosse integral e não complete lacunas por suposição.
9. Teste serviço indisponível, modelo ausente, modelo remoto rejeitado, timeout, cancelamento, JSON inválido, texto truncado, excesso de 4.000 caracteres, dados faltantes e prompt injection em conteúdo sintético. Testes de contrato podem usar servidor HTTP local controlado; uma execução real com modelo local deve ser relatada separadamente.

**Pronto quando:** uma leitura sintética gera proposta estruturada e rastreável para revisão humana, com nenhuma chamada externa. A IA não escolhe papel de autoridade nem aciona o PPE.

Referências: [listar modelos](https://docs.ollama.com/api/tags), [chat](https://docs.ollama.com/api/chat), [saída estruturada](https://docs.ollama.com/capabilities/structured-outputs).

## M9 — Revisão humana, edição e aprovação vinculada à versão

**Onde mexer:** modal de revisão em `src/App.tsx`, serviço `updateLocalBo` e módulos de banco. Novos propostos: `src/components/review/ReviewDetail.tsx`, `DraftEditor.tsx`, serviços de revisão e testes de fluxo.

### Passo a passo

1. Ao selecionar um número no modal, abra detalhe com leitura, fontes, completude, alertas, sugestão e minuta. A lista atual mostra apenas metadados; não trate isso como tela de aprovação já existente.
2. Adicione editor, contagem de caracteres, comparação de versões e botão Copiar. Disponibilize fontes necessárias à conferência sem poluir a lista principal.
3. A pessoa deve poder corrigir, rejeitar, pedir nova leitura ou solicitar nova análise. Alteração da minuta mantém histórico. Mudança de fonte, prompt ou texto aprovado invalida a aprovação anterior.
4. Grave aprovação expressa com identificação local do responsável, timestamp e hashes/revisões exatas. O nome digitado em preferência não prova identidade nem permissão no PPE; a sessão oficial deve ser conferida em M10.
5. Conduza os estados conforme a transição válida. `VALIDADO_PELO_RESPONSAVEL` significa que uma versão foi revisada; `AGUARDANDO_FINALIZACAO` significa que ainda há ato no PPE. Não conclua apenas porque houve aprovação local.
6. Mantenha execução de atos oficiais fora do modelo de IA. M10 consome a versão aprovada e a autorização correspondente, sem pedir novamente uma aprovação válida já concedida para a operação.
7. Teste edição após aprovação, recarregamento, duas revisões concorrentes, cancelamento, texto acima do limite e tentativa de finalizar versão desatualizada.

**Pronto quando:** fica claro quem aprovou qual versão e qualquer alteração material exige nova conferência.

## M10 — Botão “Assinar” existente no PPE: acionamento assistido

### Esclarecimento incorporado do usuário

O PPE/SINESP já possui um botão identificado como **Assinar** no fluxo de despacho. O pedido é localizar e acionar esse elemento usando a sessão de uma pessoa legitimamente autorizada, depois conferir o resultado. Não é pedido para criar, falsificar ou reproduzir assinatura, emitir certificados ou desenvolver mecanismo próprio de assinatura digital. Evitar coordenadas X/Y fixas; preferir nome acessível, HTML e localizadores contextuais validados.

A última especificação voltou a pedir planilha no teste. Use inicialmente uma planilha fictícia e um adaptador separado, sem acoplar a execução do ato oficial à disponibilidade de uma planilha externa. A conexão com um arquivo real aguarda identificação do destino.

**Limite do fluxo:** classificação e minuta devem ter sido revisadas. Valide a aprovação já existente, vinculada ao B.O., versão e ação autorizada, e a identidade/permissão efetiva da sessão. Não acrescente uma janela própria para cada clique de uma operação já aprovada. Confirmações exigidas pelo PPE e aprovações institucionais aplicáveis continuam no fluxo. Uma sugestão da IA, isoladamente, não é aprovação jurídica.

**Onde mexer:** criar `src/ppe/actions.mjs`, `src/ppe/actions.d.mts`, controle de execução/reconciliação e `tests/ppe-actions.test.mjs` com fixtures exclusivamente sintéticas. Acrescentar comandos específicos e auditoria no backend do M7. Proposta para planilha: `src/services/reports/` e teste de atualização idempotente por B.O. `reader.mjs` permanece somente leitura.

### Passo a passo

1. Mapeie, com inspeção autorizada, a sequência real de classificação, texto, Despachar, modal, papel, usuário logado, Assinar e eventual Concluir. Não presuma a ordem ou que um clique com o mesmo rótulo tenha a mesma consequência em telas diferentes. Valide a política do serviço para a automação assistida.
2. Crie primeiro uma simulação com esses controles e resultados. Separe preparação, validação da aprovação já concedida, execução e verificação. O modo padrão é simulação; nenhum teste automatizado chama o portal real para executar atos.
3. Antes de preparar o formulário, confira origem oficial, número exato, unidade, situação atual, identidade autenticada e papel legitimamente disponível. Não selecionar “Outro usuário”, trocar identidade ou atribuir papel de Delegado(a) sem a atribuição efetiva na sessão.
4. Carregue somente a minuta/classificação já aprovada no M9, vinculada à revisão da leitura. O preenchimento assistido deve ser solicitado pelo responsável e conferido no formulário real. Se faltar campo, houver divergência ou o servidor rejeitar, registre pendência e pare.
5. Localize o botão **no modal/formulário do B.O. confirmado**, por role/nome/elemento observado. Exija correspondência única, botão visível/habilitado e contexto esperado. Vários botões Assinar, modal inesperado ou número divergente impedem a ação. Não fazer fallback para o primeiro resultado.
6. Valide número, ação, conta/papel e hash da versão aprovada. A aprovação pode ter sido concedida antes desta etapa e deve ser invalidada quando mudarem B.O., sessão autorizada, papel ou documento. Não confunda essa validação de estado com a criação de nova janela de confirmação.
7. **Antes do primeiro clique com efeito oficial**, registre transacionalmente a tentativa no SQLite, com identificador único, aprovação utilizada e estado de execução. Proteja contra execução concorrente/duplicada. Só então acione o botão já existente na sessão autorizada. Não gerar certificados, capturar OTP, exportar chaves ou implementar assinatura paralela. Autenticação adicional solicitada pelo PPE é realizada no portal.
8. Confira o resultado permitido pelo portal: número exato, identificador/estado do despacho, indicação de assinatura e situação posterior. Toast ou sucesso do `.click()` sozinho não bastam. Concluir pode ser outro ato com efeito próprio: execute-o somente se fizer parte do fluxo aprovado e preserve as confirmações que o próprio PPE/instituição exigir.
9. Atualize a mesma tentativa com resultado, horário e referência de comprovação, mantendo metadados mínimos e sem narrativa/senha/cookies/tokens no log. `CONCLUIDO_VERIFICADO` exige evidência do resultado esperado; pode continuar `AGUARDANDO_FINALIZACAO` se apenas uma parte terminou. Atualize a linha correspondente da planilha de teste somente após verificar o resultado. Use número completo e identificador estável; rejeite linhas duplicadas. Se a planilha falhar, registre sincronização pendente, sem repetir o ato no PPE.
10. Se cair a rede ou fechar a janela após o clique, use estado de **resultado desconhecido**, encaminhe à reconciliação e confira o portal antes de qualquer outra tentativa. No reinício, localize tentativas iniciadas sem resultado final e reconcilie antes de executar novamente. Nunca repetir assinatura, despacho ou conclusão por timeout. Reconheça também um despacho já assinado antes de iniciar a ação.
11. Teste B.O. errado, papel inválido, usuário trocado, rótulo duplicado, modal inesperado, aprovação inválida/ausente, texto alterado, execução repetida, sessão expirada, operação já realizada e queda após clique. Teste parada solicitada pelo operador e retentativa apenas da atualização da planilha. Prove que uma aprovação válida permite o fluxo sem janela adicional inventada.

**Pronto quando:** um teste funcional com dados fictícios demonstra procedimento exato, documento aprovado, localização/acionamento do botão Assinar, estado posterior, auditoria persistente e atualização da planilha de teste. A etapa só será chamada de validada em produção após execução autorizada com DOM real e resultado conferido no PPE.

**Se houver impedimento:** identifique operação exata, origem da restrição (ferramenta, autenticação do PPE ou regra institucional) e evidência concreta. Não atribua uma regra à instituição sem fonte. Informe o que foi implementado/testado imediatamente e a alternativa permitida para o restante. Não responder apenas “requer confirmação manual”. Não presumir que a possibilidade relatada de desmarcar Assinar torna todos os efeitos do fluxo reversíveis; confirme o estado real e a consequência de cada controle observado.

## M11 — Agendamento recorrente e recuperação

**Onde mexer:** `saveSchedule`, `Preferences`, `loadPrefs` e modal em `src/App.tsx`; backend/banco do M7. Novos propostos: `src/services/scheduler/`, `src-tauri/src/scheduler.rs` e testes de janela/retomada.

### Passo a passo

1. Migre preferências necessárias do `localStorage` para configuração durável no banco, sem perder preferências existentes. Registre dias da semana, início/fim, fuso local, limite de tarefas e comportamento após falha.
2. Faça o núcleo de cálculo receber o horário como entrada para testes determinísticos. Cubra janela normal e janela que cruza meia-noite; defina a qual dia pertence o início da janela noturna.
3. Ao terminar a janela, não adquirir tarefa nova. Concluir apenas a etapa corrente que puder terminar com segurança e salvar checkpoint; não iniciar atos oficiais automaticamente por causa do horário.
4. Evite duas execuções sobrepostas, inclusive depois de suspensão, reinício ou mudança de horário do Windows. Não repetir trabalho nem executar retroativamente uma fila inteira sem controle.
5. Separe scheduler com aplicativo aberto de inicialização pelo Agendador de Tarefas do Windows. Se precisar de tarefa do Windows, documente nome, executável, argumentos e mecanismo de desativação; sua criação altera configuração local e deve ser explicitamente habilitada pelo usuário.
6. Sessão expirada pode suspender a parte PPE; autenticação permanece manual. O agendamento não substitui revisão humana do documento, aprovação válida nem controles obrigatórios do PPE. Operações já autorizadas não devem ganhar popups próprios apenas por serem agendadas.
7. Teste virada do dia, horário inválido, limite zero/atingido, mudança de fuso, pausa manual, sessão perdida, suspensão, fila vazia e recuperação após falha.

**Pronto quando:** horários controlam aquisição real de tarefas e a configuração sobrevive ao reinício, sem falsa promessa de rotina executada com aplicativo fechado.

## M12 — Proteção local, retenção e auditoria

**Onde mexer:** conexão SQLite, diretório de dados, perfil Edge, armazenamento de leituras/minutas e logs. Novos propostos: `src-tauri/src/security.rs`, `src-tauri/src/storage.rs`, controles mínimos de privacidade e testes com diretório temporário isolado.

Esta etapa é dependência transversal: seus controles devem existir **antes** de persistir conteúdo real nos marcos M6–M10, mesmo que o acabamento da tela venha depois.

### Passo a passo

1. Inventarie quais informações cada módulo realmente precisa salvar. Metadados de fila, narrativas, anexos, minutas e tokens têm necessidades diferentes. Minimize conteúdo e prazo de retenção.
2. Use o diretório de dados do aplicativo, com acesso restrito ao usuário Windows. Não use `mode: 0o700` no Node como prova de ACL no Windows. Verifique permissões efetivas e tratamento de contas compartilhadas.
3. Proteja dados sensíveis locais com mecanismo Windows apropriado, como DPAPI e proteção de chaves nativa, após revisar a biblioteca/documentação oficial escolhida. WAL, backups, temporários e arquivos auxiliares precisam de tratamento consistente; criptografar só uma cópia e deixar o original em claro não atende ao requisito.
4. Credential Manager pode proteger segredos de integrações futuras que realmente precisem existir. Não usar isso para coletar senha SINESP, segredo MFA ou prometer reaproveitamento de sessão contrário às regras do portal.
5. Perfil Edge continua separado do repositório. Não copiar perfil completo, autenticação, cookies ou tokens para GitHub ou para a máquina de casa. No novo computador, a pessoa autentica novamente.
6. Implemente retenção e exclusão de temporários com prévia dos itens e confirmação para remoção material. Uma rotina deve operar somente no diretório próprio validado, nunca na raiz de projetos ou documentos da pessoa.
7. Audite eventos, origem/destino de estado, versão e resultado. O campo de motivo não deve virar depósito de narrativas ou dados pessoais; use códigos técnicos e detalhes mínimos. Redija mensagens de erro antes de exportar diagnósticos.
8. Teste falta de permissão, falha ao proteger/desproteger, backup protegido, chave indisponível em outro usuário, limpeza limitada ao alvo e ausência de conteúdo sensível nos logs. Diferencie o que foi conferido por código e o que foi validado no Windows real.

**Pronto quando:** conteúdo real só é persistido sob controles verificáveis e nenhum segredo/perfil/banco de produção entra no histórico Git.

## M13 — Empacotar, testar instalação e entregar

**Onde mexer:** `package.json`/lockfile, `src-tauri/Cargo.toml`/lockfile, `src-tauri/tauri.conf.json`, capacidades, recursos do worker, README e relatório de verificação.

### Passo a passo

1. Defina como o worker e seu runtime serão distribuídos. Não pressupor Node.js/npm no computador de quem só instalará o produto. Empacote o runtime/worker compatível com o alvo e recursos necessários usando o mecanismo Tauri suportado; fixe caminhos e argumentos, sem shell arbitrário.
2. Teste o instalador em Windows com nome de usuário/pasta contendo espaços e acentos. Confirme Edge/WebView2 e recursos realmente necessários. Não empacote perfil autenticado, banco da máquina de desenvolvimento ou modelo gigantesco por padrão.
3. Sincronize versões de frontend, Cargo e Tauri e gere lockfiles coerentes. Não libere permissões genéricas de execução/arquivo só para fazer o sidecar funcionar.
4. Execute os testes novos de cada marco, a suíte Node completa, contrato Python, testes Rust, formatação e build frontend. Depois gere o instalador com `npm.cmd run desktop:build`.
5. Instale de fato e confira: splash de três segundos, onboarding, cadastro sintético, persistência, revisão, worker, pausa/retomada, detecção da IA local, agendamento e atualização/migração. Ensaios de atos oficiais usam o simulador; produção exige aprovação válida e sessão autorizada conforme M10.
6. Verifique atualização sobre a versão anterior sem perder dados e desinstalação sem exclusão inesperada do banco. Registre comportamento escolhido para preservar ou remover dados mediante solicitação explícita.
7. Registre versão, ambiente, comandos, contagens de testes, falhas, caminho/hash do instalador e limitações. Código-fonte, build frontend e instalador testado são entregas diferentes.
8. Revise `git diff --check`, lista de arquivos e ausência de segredos. Faça commits pequenos e push para o repositório privado autorizado, conferindo branch e SHA remoto. Não enviar `node_modules`, `dist`, `target`, perfis, bancos reais ou anexos policiais. Publicar um Release ou executar CI com custo é uma decisão separada.

**Pronto quando:** o instalador foi usado com sucesso em um ambiente de destino e existe um relato reproduzível do que funciona e do que ainda está pendente.

---

## 3. Ordem prática e critérios para continuar

1. Comece por M0, M1 e M2: liberar ambiente e quitar as melhorias adiadas.
2. M3 estabiliza o painel. M4/M5 validam navegação e descoberta. M6 define dados de leitura.
3. M7 conecta a execução real; M8 produz sugestões locais; M9 permite revisão.
4. M10 trata o acionamento assistido do botão existente, separado do leitor.
5. M11 implementa horários. A proteção de M12 é transversal e deve preceder o armazenamento real de M6–M10. M13 fecha a distribuição.

Se um marco depender de sessão real indisponível, conclua o componente sintético e outras partes independentes. Registre a dependência, o último ponto válido e o próximo comando. Não declarar produção validada por testes de fixture.

Não executar todos os marcos como uma alteração gigante. Ao fim de cada entrega, escreva em `docs/verification/`:

- Problema resolvido e comportamento resultante.
- Arquivos alterados e novos.
- Testes efetivamente executados, com comando e resultado.
- O que foi verificado no desktop/PPE e o que foi só simulado.
- Se compilou; caminho e hash do instalador apenas se existir.
- Dependências, limites e próximo marco pendente.
- Branch, commit e situação do push.

Não modificar testes para esconder falhas, não usar dados policiais reais nas fixtures e não eliminar funcionalidades existentes para aparentar conclusão.

## 4. Comandos de conferência recorrente

Execute na raiz, escolhendo os testes pertinentes ao marco. Estes nomes existentes podem ser executados desde a base; testes novos citados acima só existirão após sua criação.

```powershell
node --test tests/*.test.mjs
py tests/sqlite-contract.py
npm.cmd run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
git diff --check
git status --short --branch
```

`npm.cmd run test:ppe` atualmente executa somente `tests/ppe-contract.test.mjs`; ele não substitui a suíte inteira. Um arquivo novo de teste deve estar incluído no comando de suíte adotado.

## 5. Primeiro pedido pronto para colar

> Continue o SIED SYSTEM V5 a partir do repositório aberto. Leia este guia inteiro, o README e o último relatório de verificação. Confira o código atual, quite M0/M1/M2 pendentes e priorize um teste funcional completo de M10 com dados fictícios: B.O. exato, documento aprovado, botão Assinar existente, acionamento, verificação, auditoria e planilha de teste. Preserve o visual. Não invente janelas adicionais para operações já autorizadas; respeite autenticação, permissões, confirmações do PPE e aprovações institucionais comprovadas. Planilha real depende do destino identificado. Avance nas partes independentes quando faltar ambiente ou acesso, explique bloqueios com evidência, documente resultados e envie commits revisados ao repositório privado autorizado. Não declarar marco concluído sem executar a verificação correspondente.
