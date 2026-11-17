# SIED SYSTEM V5 — V0.4 em desenvolvimento

**Status:** base local em evolução. O frontend React compila em modo de produção, mas ainda NÃO é um robô operacional, não há integração de IA com boletins reais, não há acesso ao PPE validado neste ambiente e ainda não há instalador Windows validado.

## Continuar o desenvolvimento em casa

O [prompt de continuidade passo a passo](docs/PROMPT-CONTINUACAO-SIED-V5.md) detalha cada melhoria restante por arquivo, comando, teste e critério de conclusão. Inclui as duas melhorias adiadas, o ambiente C++, a integração com o PPE, IA local, revisão e o futuro acionamento do botão Assinar já existente, usando aprovação válida sem janelas próprias redundantes. O pedido técnico mais recente inclui planilha fictícia no teste funcional; a conexão com uma planilha real aguarda identificação do destino.

## Evidência de compilação local

Em 13/11/2026, nesta pasta, foram instaladas 78 dependências npm sem vulnerabilidades reportadas pelo `npm audit` da instalação e o comando abaixo concluiu com sucesso usando Node.js 24.14.1 e npm 11.11.0:

```powershell
npm.cmd run build
```

O resultado foi gerado em `dist/`. O projeto recomenda Node.js 20/22; a execução em Node.js 24 é apenas a evidência do ambiente atual, não uma alteração do requisito suportado.

## O que há nesta entrega

- Interface **Tauri 2 + React + TypeScript + Vite**, preservando o design preto/vidro/prata e abertura de três segundos.
- **Configuração sem captura de senhas**: botão que abre o SINESP em `https://seguranca.sinesp.gov.br/sinesp-seguranca/login.jsf` pelo navegador oficial do usuário.
- **Fila SQLite real e local**, com onze estados de trabalho, migração dos três estados da V0.3 e contadores do dashboard derivados do banco. O botão **Iniciar/Pausar** apenas habilita ou pausa o controle local; ele não consulta nem altera o PPE por conta própria.
- **Inspeção assistida de leitura** por Playwright no Edge, no arquivo `scripts/ppe-inspecao-assistida.mjs`, executada separadamente por comando. Ela não é iniciada automaticamente pelo painel.
- **Contrato de navegação**: URLs oficiais, localização de tabela por cabeçalhos, seleção de linha pelo B.O. completo, situação `Registrado` exata, visualização segura da lupa quando um link semanticamente inequívoco estiver disponível, validação do número após abrir e inspeção apenas de abas conhecidas.
- Seu **prompt jurídico original**, sem alterações, como material de referência em `config/prompts/prompt-despacho-referencia.txt`. **NÃO está ligado a nenhuma IA nem toma decisões por conta própria.** Exige revisão jurídica e aprovação do responsável antes de qualquer ato.
- Testes de contrato do PPE, leitor Playwright contra páginas sintéticas, métricas do dashboard e esquema/migração da fila SQLite.

## Funcionamento identificado nos prints (a validar via DOM)

1. Acesso ao site oficial SINESP. CPF → Senha → OTP em sequência **no próprio portal**.
2. Abrir o módulo **Procedimentos Policiais Eletrônicos (PPE)**.
3. Acessar `https://ppe.sinesp.gov.br/ppe/pesquisar/BO/`.
4. Aplicar situação **Registrado**. Escolher **100 itens por página** no controle da própria tela.
5. Escolher um B.O. **exato** e a **lupa da mesma linha**. Nunca clicar em uma lupa genérica.
6. Conferir o cabeçalho `Boletim de Ocorrência <número>`, então ler, conforme visibilidade e permissões: Dados do Registro, Dados do Fato, Envolvidos, Vínculos, Objetos, Relato/Histórico, Documentos, Histórico, Despachos.
7. Gerar eventualmente uma **minuta para revisão**. Classificação e despacho são ato do responsável; a V0.4 não clica em **Despachar**, **Assinar** ou **Concluir**.

**Nota:** os nomes exibidos nos prints não provam a estrutura semântica real do DOM. O inspetor interrompe o fluxo se não reconhecer uma tabela ou um botão com segurança. Esse teste inicial determina os ajustes de localizadores necessários sem arriscar cliques incorretos.

## Requisitos Windows 11

- Node.js 20/22 e npm;
- Microsoft Edge;
- Rust, Visual Studio Build Tools C++ e WebView2 para o desktop Tauri.
- **Custo inicial de serviços: R$ 0**. Sem Cloudflare, API paga ou deploy. Código e documentação são mantidos no repositório GitHub privado autorizado.

## Iniciar a interface

```powershell
npm install
npm run desktop:dev
```

Para visualizar somente no navegador:

```powershell
npm run dev
```

## Inspecionar o PPE em modo assistido (somente leitura)

No PowerShell, dentro desta pasta:

```powershell
npm install
npm run ppe:inspecionar
```

1. Abre um perfil isolado do Edge e a página oficial do SINESP.
2. **O operador faz login e autenticação OTP manualmente no Edge**.
3. Após entrar no PPE, confirma no terminal. O script abre a pesquisa oficial.
4. **O operador aplica Registrado + 100 itens** e confirma no terminal.
5. O script lê somente metadados da tabela (número, data, natureza, situação), solicita um número de B.O. para leitura autorizado e valida linha única e status.
6. Se a lupa for um link inequívoco para `/visualizar/`, ele a abre. Caso contrário, a inspeção é interrompida para validação do DOM; o script atual não faz fallback automático ou manual dentro dessa execução.
7. Verifica número e URL do documento e tenta percorrer abas **sem realizar operações de edição ou assinatura**.
8. Mostra apenas quais abas foram reconhecidas. **Não imprime os relatos/nomes, não salva conteúdo integral, não faz screenshots e não exporta boletins.**

O perfil local do Edge pode manter sessão/cookies conforme mecanismos do navegador, mas o SINESP poderá requerer autenticação novamente. **Nunca importar sementes/códigos OTP, burlar CAPTCHA ou exigências do portal.**

## Testes

```powershell
node --test tests\*.test.mjs
py tests\sqlite-contract.py
npm.cmd run build
```

Em 13/11/2026, **15 testes Node passaram**, incluindo nove testes Playwright contra HTML totalmente sintético, e o contrato Python do SQLite passou. O frontend de produção também compilou. `cargo test` e o instalador Tauri continuam bloqueados antes da compilação do projeto porque o ambiente não possui o linker MSVC `link.exe`/Visual Studio Build Tools C++. A tentativa de instalar o componente confirmou que o instalador precisa de privilégios administrativos. Os testes sintéticos não substituem a inspeção autorizada do DOM real.

## Onde a integração real ainda não está pronta

- A automação de leitura é um **script assistido separado**, não controlado pelo botão Iniciar do painel.
- A paginação de 100 e o filtro são ajustados **manualmente** nesta versão.
- A interpretação de B.O.s via IA ainda não foi implantada. Um modelo local (por exemplo, Ollama) e uma revisão jurídica dos critérios precisam ser configurados antes.
- Documentos PDF/anexos ainda não são baixados ou analisados.
- O estado `CONCLUIDO_VERIFICADO` reflete uma verificação registrada no controle local; ele nunca é inferido apenas de um clique.
- O executável/instalador Windows ainda não foi gerado porque falta o toolchain MSVC C++.
- **Na V0.4, assinaturas eletrônicas, despachos, arquivamentos e procedimentos oficiais permanecem manuais.** A evolução para o acionamento de controles existentes, usando documento aprovado e sessão autorizada, está descrita no marco M10 do guia de continuidade e ainda não foi implementada. O guia não exige janelas próprias adicionais para operações já autorizadas.

## Arquivos principais

```text
src/App.tsx                     UI V0.4, botão SINESP e fila SQLite
src/services.local.ts          integração local com Tauri
src/ppe/contract.mjs           contrato seguro de navegação
src/ppe/reader.mjs             leitor estrutural somente leitura
scripts/ppe-inspecao-assistida.mjs  navegação assistida Playwright
src-tauri/src/lib.rs           comandos Tauri, banco SQLite e abertura de portal
src-tauri/src/sql/             esquema V0.4 e migração da V0.3
config/prompts/                prompt de referência fornecido pelo usuário
tests/ppe-contract.test.mjs    testes sem acesso ao PPE
tests/ppe-reader.test.mjs      testes Playwright com HTML sintético
tests/sqlite-contract.py       testes de banco local
legacy-demo/                   demonstrativo HTML da versão anterior
```

**Segurança:** não enviar logs com informações de B.O.s, CPF, nomes de envolvidos ou OTP. Para fornecer novas capturas do PPE, ocultar dados pessoais e informações sigilosas antes de compartilhar.
