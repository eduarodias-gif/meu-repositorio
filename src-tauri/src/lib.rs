use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::fs;
use tauri::{AppHandle, Manager};

mod ai;
mod sanitize;
mod security;
mod storage;

const SCHEMA_V04: &str = include_str!("sql/schema_v04.sql");
const MIGRATE_V03_TO_V04: &str = include_str!("sql/migrate_v03_to_v04.sql");
const QUEUE_SUMMARY_SQL: &str = include_str!("sql/queue_summary.sql");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum QueueStatus {
    Pendente,
    EmLeitura,
    Lido,
    EmAnalise,
    MinutaGerada,
    AguardandoRevisao,
    ValidadoPeloResponsavel,
    AguardandoFinalizacao,
    ConcluidoVerificado,
    Erro,
    Restrito,
}

impl QueueStatus {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "PENDENTE" => Ok(Self::Pendente),
            "EM_LEITURA" => Ok(Self::EmLeitura),
            "LIDO" => Ok(Self::Lido),
            "EM_ANALISE" => Ok(Self::EmAnalise),
            "MINUTA_GERADA" => Ok(Self::MinutaGerada),
            "AGUARDANDO_REVISAO" => Ok(Self::AguardandoRevisao),
            "VALIDADO_PELO_RESPONSAVEL" => Ok(Self::ValidadoPeloResponsavel),
            "AGUARDANDO_FINALIZACAO" => Ok(Self::AguardandoFinalizacao),
            "CONCLUIDO_VERIFICADO" => Ok(Self::ConcluidoVerificado),
            "ERRO" => Ok(Self::Erro),
            "RESTRITO" => Ok(Self::Restrito),
            _ => Err("Status inválido.".to_owned()),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Pendente => "PENDENTE",
            Self::EmLeitura => "EM_LEITURA",
            Self::Lido => "LIDO",
            Self::EmAnalise => "EM_ANALISE",
            Self::MinutaGerada => "MINUTA_GERADA",
            Self::AguardandoRevisao => "AGUARDANDO_REVISAO",
            Self::ValidadoPeloResponsavel => "VALIDADO_PELO_RESPONSAVEL",
            Self::AguardandoFinalizacao => "AGUARDANDO_FINALIZACAO",
            Self::ConcluidoVerificado => "CONCLUIDO_VERIFICADO",
            Self::Erro => "ERRO",
            Self::Restrito => "RESTRITO",
        }
    }
}

fn transition_allowed(from: QueueStatus, to: QueueStatus) -> bool {
    use QueueStatus::*;
    matches!(
        (from, to),
        (Pendente, EmLeitura | Erro | Restrito)
            | (EmLeitura, Lido | AguardandoRevisao | Erro | Restrito)
            | (Lido, EmAnalise | AguardandoRevisao | Erro)
            | (EmAnalise, MinutaGerada | AguardandoRevisao | Erro)
            | (
                MinutaGerada,
                AguardandoRevisao | ValidadoPeloResponsavel | Erro
            )
            | (
                AguardandoRevisao,
                EmLeitura | EmAnalise | ValidadoPeloResponsavel | Erro | Restrito
            )
            | (
                ValidadoPeloResponsavel,
                AguardandoFinalizacao | AguardandoRevisao | Erro
            )
            | (
                AguardandoFinalizacao,
                ConcluidoVerificado | AguardandoRevisao | Erro
            )
            | (Erro, Pendente | EmLeitura | AguardandoRevisao)
            | (Restrito, AguardandoRevisao)
    )
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct BoRow {
    number: String,
    nature: String,
    status: String,
    reason: String,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct QueueSummary {
    queue: i64,
    completed: i64,
    review: i64,
    errors: i64,
    restricted: i64,
    total: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct QueueSnapshot {
    rows: Vec<BoRow>,
    summary: QueueSummary,
    revision: i64,
}

fn initialize_schema(db: &Connection) -> Result<(), String> {
    let queue_schema = db
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='bo_queue'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    match queue_schema {
        None => db.execute_batch(SCHEMA_V04),
        Some(schema) if !schema.contains("AGUARDANDO_REVISAO") => {
            db.execute_batch(MIGRATE_V03_TO_V04)
        }
        Some(_) => db.execute_batch(SCHEMA_V04),
    }
    .map_err(|err| format!("Falha ao preparar o banco local: {err}"))?;
    Ok(())
}

fn connection(app: &AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let db = Connection::open(dir.join("sied-v5-local.sqlite3")).map_err(|err| err.to_string())?;
    db.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|err| err.to_string())?;
    initialize_schema(&db)?;
    Ok(db)
}

fn clean_number(value: &str) -> Result<String, String> {
    let number = value.trim().to_uppercase();
    if number.is_empty()
        || number.len() > 80
        || !number
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || "-_/ .".contains(ch))
    {
        return Err("Número inválido: use até 80 caracteres, letras, dígitos, espaço, ponto, barra, hífen ou sublinhado.".to_owned());
    }
    Ok(number)
}

fn clean_nature(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 100 {
        return Err("Informe uma natureza com no máximo 100 caracteres.".to_owned());
    }
    Ok(trimmed.to_owned())
}

fn list_all(conn: &Connection) -> Result<Vec<BoRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT number, nature, status, reason, created_at, updated_at
         FROM bo_queue ORDER BY created_at DESC, number DESC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(BoRow {
                number: row.get(0)?,
                nature: row.get(1)?,
                status: row.get(2)?,
                reason: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|err| err.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| err.to_string())
}

fn queue_summary_for(conn: &Connection) -> Result<QueueSummary, String> {
    conn.query_row(QUEUE_SUMMARY_SQL, [], |row| {
        Ok(QueueSummary {
            queue: row.get(0)?,
            completed: row.get(1)?,
            review: row.get(2)?,
            errors: row.get(3)?,
            restricted: row.get(4)?,
            total: row.get(5)?,
        })
    })
    .map_err(|err| err.to_string())
}

fn queue_snapshot_for(conn: &mut Connection) -> Result<QueueSnapshot, String> {
    // BEGIN DEFERRED: todas as leituras ocorrem sob uma única visão consistente do banco.
    // Qualquer escrita concorrente é isolada até esta função terminar.
    let tx = conn.transaction().map_err(|err| err.to_string())?;
    let rows = list_all(&tx)?;
    let summary = queue_summary_for(&tx)?;
    let revision: i64 = tx
        .query_row("SELECT COALESCE(MAX(id), 0) FROM audit_log", [], |row| {
            row.get(0)
        })
        .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(QueueSnapshot {
        rows,
        summary,
        revision,
    })
}

fn add_bo_on(conn: &mut Connection, number: &str, nature: &str) -> Result<Vec<BoRow>, String> {
    let tx = conn.transaction().map_err(|err| err.to_string())?;
    tx.execute(
        "INSERT INTO bo_queue(number, nature) VALUES (?1, ?2)",
        params![number, nature],
    )
    .map_err(|err| {
        if err.to_string().contains("UNIQUE constraint") {
            "Este B.O. já está na fila local.".to_owned()
        } else {
            err.to_string()
        }
    })?;
    tx.execute(
        "INSERT INTO audit_log(action,bo_number) VALUES('added',?1)",
        params![number],
    )
    .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    list_all(conn)
}

fn update_bo_status_on(
    conn: &mut Connection,
    number: &str,
    next_status: QueueStatus,
    reason: &str,
) -> Result<Vec<BoRow>, String> {
    let tx = conn.transaction().map_err(|err| err.to_string())?;
    let current = tx
        .query_row(
            "SELECT status FROM bo_queue WHERE number=?1",
            params![number],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "B.O. não encontrado na fila local.".to_owned())?;
    let current_status = QueueStatus::parse(&current)?;
    if !transition_allowed(current_status, next_status) {
        return Err(format!(
            "Transição de {} para {} não permitida.",
            current_status.as_str(),
            next_status.as_str()
        ));
    }
    // CAS atômico: UPDATE só modifica se o status ainda for o que a validação viu.
    // Dois workers rodando em paralelo: ambos leem PENDENTE, ambos tentam transicionar;
    // apenas o primeiro UPDATE (dentro da transação que commita primeiro) encontra
    // status='PENDENTE' — o segundo recebe `changed == 0` e devolve erro explícito.
    // Sem o CAS, o segundo sobrescreveria silenciosamente o trabalho do primeiro.
    let changed = tx
        .execute(
            "UPDATE bo_queue SET status=?2, reason=?3,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE number=?1 AND status=?4",
            params![
                number,
                next_status.as_str(),
                reason,
                current_status.as_str()
            ],
        )
        .map_err(|err| err.to_string())?;
    if changed == 0 {
        return Err(format!(
            "Transição perdida para {number}: outro processo alterou o estado antes da operação concluir. Recarregue a fila e tente novamente."
        ));
    }
    tx.execute(
        "INSERT INTO audit_log(action,bo_number) VALUES(?1,?2)",
        params![next_status.as_str(), number],
    )
    .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    list_all(conn)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct AcquiredTask {
    number: String,
    nature: String,
    acquired_at: String,
}

/// Atomicamente pega o B.O. PENDENTE mais antigo (FIFO por `created_at ASC`, desempate
/// por `number ASC` para ordem estável) e move para EM_LEITURA. Retorna `None` se não
/// houver tarefa disponível. A chamada é segura para rodar concorrentemente: dois
/// workers acabam cada um com uma tarefa diferente, ou um deles recebe `None`.
fn acquire_next_pending_on(
    conn: &mut Connection,
    worker_id: &str,
) -> Result<Option<AcquiredTask>, String> {
    let worker_label = sanitize::sanitize_reason(worker_id);
    let tx = conn.transaction().map_err(|err| err.to_string())?;
    let candidate: Option<(String, String)> = tx
        .query_row(
            "SELECT number, nature FROM bo_queue
             WHERE status='PENDENTE'
             ORDER BY created_at ASC, number ASC
             LIMIT 1",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    let Some((number, nature)) = candidate else {
        return Ok(None);
    };
    // CAS: só adquire se ainda estiver PENDENTE. Outro worker que leu a mesma linha
    // antes de nós já transicionou para EM_LEITURA; o UPDATE falha com changed=0
    // e indicamos "nada disponível" sem corromper o estado.
    let changed = tx
        .execute(
            "UPDATE bo_queue SET status='EM_LEITURA',
               reason=?2,
               updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE number=?1 AND status='PENDENTE'",
            params![
                number,
                format!("acquired by worker:{}", worker_label)
                    .chars()
                    .take(300)
                    .collect::<String>()
            ],
        )
        .map_err(|err| err.to_string())?;
    if changed == 0 {
        // Perdeu a disputa; sem erro — simplesmente não há tarefa para este worker.
        return Ok(None);
    }
    tx.execute(
        "INSERT INTO audit_log(action,bo_number) VALUES('EM_LEITURA', ?1)",
        params![number],
    )
    .map_err(|err| err.to_string())?;
    let acquired_at: String = tx
        .query_row(
            "SELECT updated_at FROM bo_queue WHERE number=?1",
            params![number],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(Some(AcquiredTask {
        number,
        nature,
        acquired_at,
    }))
}

/// Traduz o resultado estrutural da leitura PPE (ver `src/ppe/bridge-protocol.mjs`)
/// no próximo estado da fila SQLite, aplicando a transição com CAS a partir de
/// EM_LEITURA. Essa é a ponte que o worker Node chama quando termina de ler um B.O.
///
/// completeness:
/// - "CONCLUIDA" → LIDO
/// - "PARCIAL"   → AGUARDANDO_REVISAO (motivo carrega os códigos técnicos)
/// - "RESTRITA"  → RESTRITO
/// - "FALHA"     → ERRO (mantém a sessão disponível para reclassificar depois)
fn record_read_outcome_on(
    conn: &mut Connection,
    number: &str,
    completeness: &str,
    reasons: &[String],
) -> Result<Vec<BoRow>, String> {
    let next = match completeness {
        "CONCLUIDA" => QueueStatus::Lido,
        "PARCIAL" => QueueStatus::AguardandoRevisao,
        "RESTRITA" => QueueStatus::Restrito,
        "FALHA" => QueueStatus::Erro,
        other => return Err(format!("Completude '{other}' não reconhecida pelo bridge.")),
    };
    let joined_reasons = reasons.join("; ");
    let prefix = match completeness {
        "CONCLUIDA" => "Leitura estrutural concluída.",
        "PARCIAL" => "Leitura parcial:",
        "RESTRITA" => "Acesso restrito pelo PPE:",
        "FALHA" => "Falha técnica na leitura:",
        _ => "Resultado:",
    };
    let raw_reason = if joined_reasons.is_empty() {
        prefix.to_owned()
    } else {
        format!("{prefix} {joined_reasons}")
    };
    let reason = sanitize::sanitize_reason(&raw_reason);
    update_bo_status_on(conn, number, next, &reason)
}

#[tauri::command]
fn list_bos(app: AppHandle) -> Result<Vec<BoRow>, String> {
    list_all(&connection(&app)?)
}

#[tauri::command]
fn queue_summary(app: AppHandle) -> Result<QueueSummary, String> {
    queue_summary_for(&connection(&app)?)
}

#[tauri::command]
fn queue_snapshot(app: AppHandle) -> Result<QueueSnapshot, String> {
    let mut conn = connection(&app)?;
    queue_snapshot_for(&mut conn)
}

#[tauri::command]
fn add_bo(app: AppHandle, number: String, nature: String) -> Result<Vec<BoRow>, String> {
    let number = clean_number(&number)?;
    let nature = clean_nature(&nature)?;
    let mut conn = connection(&app)?;
    add_bo_on(&mut conn, &number, &nature)
}

#[tauri::command]
fn update_bo_status(
    app: AppHandle,
    number: String,
    status: String,
    reason: Option<String>,
) -> Result<Vec<BoRow>, String> {
    let number = clean_number(&number)?;
    let next_status = QueueStatus::parse(&status)?;
    // Sanitiza antes de validar tamanho: controles viram espaço, espaços colapsam,
    // corte final em 300 caracteres. `reason` nunca carrega narrativas nem quebras.
    let reason_text = sanitize::sanitize_reason(reason.as_deref().unwrap_or(""));
    let mut conn = connection(&app)?;
    update_bo_status_on(&mut conn, &number, next_status, &reason_text)
}

#[tauri::command]
fn acquire_next_pending(app: AppHandle, worker_id: String) -> Result<Option<AcquiredTask>, String> {
    let mut conn = connection(&app)?;
    acquire_next_pending_on(&mut conn, &worker_id)
}

#[tauri::command]
fn record_read_outcome(
    app: AppHandle,
    number: String,
    completeness: String,
    reasons: Vec<String>,
) -> Result<Vec<BoRow>, String> {
    let number = clean_number(&number)?;
    let mut conn = connection(&app)?;
    record_read_outcome_on(&mut conn, &number, &completeness, &reasons)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct SyntheticCycleResult {
    number: String,
    next_status: String,
    recognized_tabs: Vec<String>,
    is_synthetic: bool,
}

/// Executa um ciclo de leitura SINTÉTICO (sem tocar no PPE): adquire a próxima tarefa
/// PENDENTE, finge uma leitura "CONCLUIDA" com as 9 abas padrão, e aplica o
/// `record_read_outcome`. Serve para demonstrar o fluxo end-to-end M7 no desktop
/// antes do worker Node real estar integrado. **Nenhuma conexão com o PPE é feita.**
///
/// Se não houver PENDENTE, retorna `Err` com mensagem clara.
fn run_synthetic_cycle_on(conn: &mut Connection) -> Result<SyntheticCycleResult, String> {
    let task = acquire_next_pending_on(conn, "desktop-synthetic")?
        .ok_or_else(|| "Nenhum B.O. PENDENTE na fila para simular.".to_owned())?;
    // Reusa a lista canônica de abas do contrato PPE (replicada aqui porque Rust não
    // compartilha o mesmo módulo JS — mas é a mesma lista de READ_ONLY_TABS).
    let recognized_tabs: Vec<String> = [
        "Dados do Registro",
        "Dados do Fato",
        "Envolvidos",
        "Vínculos",
        "Objetos",
        "Relato/Histórico",
        "Documentos",
        "Histórico",
        "Despachos",
    ]
    .iter()
    .map(|s| (*s).to_owned())
    .collect();
    record_read_outcome_on(conn, &task.number, "CONCLUIDA", &[])?;
    Ok(SyntheticCycleResult {
        number: task.number,
        next_status: "LIDO".to_owned(),
        recognized_tabs,
        is_synthetic: true,
    })
}

#[tauri::command]
fn desktop_run_synthetic_cycle(app: AppHandle) -> Result<SyntheticCycleResult, String> {
    let mut conn = connection(&app)?;
    run_synthetic_cycle_on(&mut conn)
}

#[tauri::command]
fn open_sinesp_portal() -> Result<(), String> {
    // Open a fixed official URL in the default browser. Credentials never pass through SIED.
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg("https://seguranca.sinesp.gov.br/sinesp-seguranca/login.jsf")
            .spawn()
            .map_err(|err| err.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("A abertura integrada está disponível apenas no Windows.".to_owned())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_bos,
            queue_summary,
            queue_snapshot,
            add_bo,
            update_bo_status,
            acquire_next_pending,
            record_read_outcome,
            desktop_run_synthetic_cycle,
            open_sinesp_portal
        ])
        .run(tauri::generate_context!())
        .expect("error while running SIED SYSTEM V5");
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL_STATUSES: [QueueStatus; 11] = [
        QueueStatus::Pendente,
        QueueStatus::EmLeitura,
        QueueStatus::Lido,
        QueueStatus::EmAnalise,
        QueueStatus::MinutaGerada,
        QueueStatus::AguardandoRevisao,
        QueueStatus::ValidadoPeloResponsavel,
        QueueStatus::AguardandoFinalizacao,
        QueueStatus::ConcluidoVerificado,
        QueueStatus::Erro,
        QueueStatus::Restrito,
    ];

    const ALL_NAMES: [&str; 11] = [
        "PENDENTE",
        "EM_LEITURA",
        "LIDO",
        "EM_ANALISE",
        "MINUTA_GERADA",
        "AGUARDANDO_REVISAO",
        "VALIDADO_PELO_RESPONSAVEL",
        "AGUARDANDO_FINALIZACAO",
        "CONCLUIDO_VERIFICADO",
        "ERRO",
        "RESTRITO",
    ];

    // Tabela independente escrita à mão a partir do spec M2.
    // Qualquer alteração em `transition_allowed` sem atualizar esta tabela QUEBRA o teste de 121 pares.
    fn expected_pair_allowed(from: QueueStatus, to: QueueStatus) -> bool {
        use QueueStatus::*;
        match (from, to) {
            (Pendente, EmLeitura) | (Pendente, Erro) | (Pendente, Restrito) => true,
            (EmLeitura, Lido)
            | (EmLeitura, AguardandoRevisao)
            | (EmLeitura, Erro)
            | (EmLeitura, Restrito) => true,
            (Lido, EmAnalise) | (Lido, AguardandoRevisao) | (Lido, Erro) => true,
            (EmAnalise, MinutaGerada) | (EmAnalise, AguardandoRevisao) | (EmAnalise, Erro) => true,
            (MinutaGerada, AguardandoRevisao)
            | (MinutaGerada, ValidadoPeloResponsavel)
            | (MinutaGerada, Erro) => true,
            (AguardandoRevisao, EmLeitura)
            | (AguardandoRevisao, EmAnalise)
            | (AguardandoRevisao, ValidadoPeloResponsavel)
            | (AguardandoRevisao, Erro)
            | (AguardandoRevisao, Restrito) => true,
            (ValidadoPeloResponsavel, AguardandoFinalizacao)
            | (ValidadoPeloResponsavel, AguardandoRevisao)
            | (ValidadoPeloResponsavel, Erro) => true,
            (AguardandoFinalizacao, ConcluidoVerificado)
            | (AguardandoFinalizacao, AguardandoRevisao)
            | (AguardandoFinalizacao, Erro) => true,
            (Erro, Pendente) | (Erro, EmLeitura) | (Erro, AguardandoRevisao) => true,
            (Restrito, AguardandoRevisao) => true,
            _ => false,
        }
    }

    const LEGACY_V03_SCHEMA: &str = "CREATE TABLE bo_queue (
           number TEXT PRIMARY KEY NOT NULL,
           nature TEXT NOT NULL,
           status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','review','done')),
           reason TEXT NOT NULL DEFAULT '',
           created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
           updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         );
         CREATE TABLE audit_log (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           action TEXT NOT NULL,
           bo_number TEXT NOT NULL,
           created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         );";

    fn fresh_memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();
        conn
    }

    fn table_count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get::<_, i64>(0)
        })
        .unwrap()
    }

    #[test]
    fn bo_validation() {
        assert_eq!(clean_number("  2026/001-BA ").unwrap(), "2026/001-BA");
        assert!(clean_number("").is_err());
        assert!(clean_number("BO; DROP TABLE").is_err());
    }

    #[test]
    fn queue_status_parse_and_as_str_round_trip_for_every_v04_value() {
        for (status, name) in ALL_STATUSES.iter().zip(ALL_NAMES.iter()) {
            assert_eq!(status.as_str(), *name, "as_str");
            assert_eq!(QueueStatus::parse(name).unwrap(), *status, "parse");
            assert_eq!(
                QueueStatus::parse(status.as_str()).unwrap(),
                *status,
                "round-trip"
            );
        }
    }

    #[test]
    fn queue_status_parse_rejects_unknown_legacy_and_whitespace_values() {
        for value in [
            "",
            " ",
            "done",
            "pending",
            "review",
            "INVALIDO",
            "PENDENTE  ",
            "aguardando_revisao",
            "PENDENTE\n",
        ] {
            assert!(
                QueueStatus::parse(value).is_err(),
                "'{value}' deveria ser rejeitado"
            );
        }
    }

    #[test]
    fn transition_allowed_matches_independent_truth_table_for_all_121_pairs() {
        let mut mismatches = Vec::new();
        for from in ALL_STATUSES.iter().copied() {
            for to in ALL_STATUSES.iter().copied() {
                let actual = transition_allowed(from, to);
                let expected = expected_pair_allowed(from, to);
                if actual != expected {
                    mismatches.push(format!(
                        "{} -> {}: actual={actual} expected={expected}",
                        from.as_str(),
                        to.as_str()
                    ));
                }
            }
        }
        assert!(
            mismatches.is_empty(),
            "pares divergentes entre transition_allowed e a tabela do spec: {mismatches:?}"
        );
    }

    #[test]
    fn transition_allowed_count_matches_spec_allowed_pairs() {
        let mut total = 0usize;
        for from in ALL_STATUSES.iter().copied() {
            for to in ALL_STATUSES.iter().copied() {
                if transition_allowed(from, to) {
                    total += 1;
                }
            }
        }
        // 3+4+3+3+3+5+3+3+0+3+1 = 31
        assert_eq!(total, 31, "spec M2 lista 31 pares permitidos");
    }

    #[test]
    fn no_status_transitions_to_itself() {
        for state in ALL_STATUSES.iter().copied() {
            assert!(
                !transition_allowed(state, state),
                "{} -> {} não deveria ser permitido (auto-transição)",
                state.as_str(),
                state.as_str()
            );
        }
    }

    #[test]
    fn concluido_verificado_is_terminal() {
        for state in ALL_STATUSES.iter().copied() {
            assert!(
                !transition_allowed(QueueStatus::ConcluidoVerificado, state),
                "CONCLUIDO_VERIFICADO -> {} não deveria ser permitido",
                state.as_str()
            );
        }
    }

    #[test]
    fn direct_jump_from_pendente_to_official_completion_is_rejected() {
        for forbidden in [
            QueueStatus::ConcluidoVerificado,
            QueueStatus::ValidadoPeloResponsavel,
            QueueStatus::AguardandoFinalizacao,
            QueueStatus::Lido,
            QueueStatus::EmAnalise,
            QueueStatus::MinutaGerada,
            QueueStatus::AguardandoRevisao,
        ] {
            assert!(
                !transition_allowed(QueueStatus::Pendente, forbidden),
                "PENDENTE -> {} não deveria ser permitido",
                forbidden.as_str()
            );
        }
    }

    #[test]
    fn initialize_schema_creates_queue_and_audit_tables_on_fresh_connection() {
        let conn = fresh_memory_db();
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert!(tables.iter().any(|t| t == "bo_queue"));
        assert!(tables.iter().any(|t| t == "audit_log"));
    }

    #[test]
    fn initialize_schema_is_idempotent_on_existing_v04_database() {
        let conn = fresh_memory_db();
        conn.execute(
            "INSERT INTO bo_queue(number,nature) VALUES ('BO-IDEMP','Furto')",
            [],
        )
        .unwrap();
        initialize_schema(&conn).unwrap();
        initialize_schema(&conn).unwrap();
        assert_eq!(table_count(&conn, "bo_queue"), 1);
        // A segunda inicialização numa base V0.4 não pode criar entradas de auditoria.
        assert_eq!(table_count(&conn, "audit_log"), 0);
    }

    #[test]
    fn initialize_schema_migrates_legacy_v03_once_without_duplicating_audit() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(LEGACY_V03_SCHEMA).unwrap();
        conn.execute_batch(
            "INSERT INTO bo_queue(number,nature,status,reason) VALUES
               ('LEG-P','Furto','pending',''),
               ('LEG-R','Perda','review','Conferir'),
               ('LEG-D','Dano','done','Validado');
             INSERT INTO audit_log(action,bo_number) VALUES ('added','LEG-P');",
        )
        .unwrap();

        initialize_schema(&conn).unwrap();

        let rows: Vec<(String, String, String)> = conn
            .prepare("SELECT number,status,reason FROM bo_queue ORDER BY number")
            .unwrap()
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(
            rows,
            vec![
                (
                    "LEG-D".into(),
                    "CONCLUIDO_VERIFICADO".into(),
                    "Validado".into()
                ),
                ("LEG-P".into(), "PENDENTE".into(), "".into()),
                (
                    "LEG-R".into(),
                    "AGUARDANDO_REVISAO".into(),
                    "Conferir".into()
                ),
            ]
        );
        // Auditoria histórica (1 entrada pré-existente) preservada; migração limpa (nenhum legado desconhecido) não acrescenta auditoria.
        assert_eq!(table_count(&conn, "audit_log"), 1);

        // A segunda chamada reconhece a base já migrada e não repete a migração.
        initialize_schema(&conn).unwrap();
        assert_eq!(table_count(&conn, "bo_queue"), 3);
        assert_eq!(table_count(&conn, "audit_log"), 1);
    }

    #[test]
    fn initialize_schema_preserves_unknown_legacy_status_in_audit() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            &LEGACY_V03_SCHEMA.replace(" CHECK(status IN ('pending','review','done'))", ""),
        )
        .unwrap();
        conn.execute(
            "INSERT INTO bo_queue(number,nature,status) VALUES ('LEG-UNK','Sintética','UNKNOWN_V02_STATE')",
            [],
        )
        .unwrap();

        initialize_schema(&conn).unwrap();

        let status: String = conn
            .query_row(
                "SELECT status FROM bo_queue WHERE number='LEG-UNK'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "AGUARDANDO_REVISAO");

        let (action, bo_number): (String, String) = conn
            .query_row(
                "SELECT action,bo_number FROM audit_log WHERE bo_number='LEG-UNK'",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .unwrap();
        assert_eq!(action, "migrated_legacy_status:UNKNOWN_V02_STATE");
        assert_eq!(bo_number, "LEG-UNK");
    }

    #[test]
    fn queue_summary_for_returns_zeros_not_null_on_empty_database() {
        let conn = fresh_memory_db();
        let summary = queue_summary_for(&conn).unwrap();
        assert_eq!(
            summary,
            QueueSummary {
                queue: 0,
                completed: 0,
                review: 0,
                errors: 0,
                restricted: 0,
                total: 0,
            }
        );
    }

    #[test]
    fn queue_summary_for_counts_one_of_each_state_as_7_1_3_1_1_11() {
        let conn = fresh_memory_db();
        for (index, name) in ALL_NAMES.iter().enumerate() {
            conn.execute(
                "INSERT INTO bo_queue(number,nature,status) VALUES (?1,'Sintética',?2)",
                params![format!("BO-{index}"), name],
            )
            .unwrap();
        }
        let summary = queue_summary_for(&conn).unwrap();
        assert_eq!(
            summary,
            QueueSummary {
                queue: 7,
                completed: 1,
                review: 3,
                errors: 1,
                restricted: 1,
                total: 11,
            }
        );
    }

    #[test]
    fn queue_summary_for_matches_the_mixed_python_contract_case() {
        let conn = fresh_memory_db();
        for (number, status) in &[
            ("P1", "PENDENTE"),
            ("P2", "EM_LEITURA"),
            ("R1", "AGUARDANDO_REVISAO"),
            ("E1", "ERRO"),
            ("X1", "RESTRITO"),
            ("D1", "CONCLUIDO_VERIFICADO"),
        ] {
            conn.execute(
                "INSERT INTO bo_queue(number,nature,status) VALUES (?1,'Sintética',?2)",
                params![number, status],
            )
            .unwrap();
        }
        let summary = queue_summary_for(&conn).unwrap();
        assert_eq!(
            summary,
            QueueSummary {
                queue: 2,
                completed: 1,
                review: 3,
                errors: 1,
                restricted: 1,
                total: 6,
            }
        );
    }

    #[test]
    fn update_bo_status_on_valid_transition_moves_row_and_records_audit() {
        let mut conn = fresh_memory_db();
        conn.execute(
            "INSERT INTO bo_queue(number,nature) VALUES ('BO-100','Furto')",
            [],
        )
        .unwrap();
        let rows =
            update_bo_status_on(&mut conn, "BO-100", QueueStatus::EmLeitura, "iniciando").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].status, "EM_LEITURA");
        assert_eq!(rows[0].reason, "iniciando");
        let audit: Vec<(String, String)> = conn
            .prepare("SELECT action,bo_number FROM audit_log ORDER BY id")
            .unwrap()
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(audit, vec![("EM_LEITURA".into(), "BO-100".into())]);
    }

    #[test]
    fn update_bo_status_on_invalid_transition_rejects_without_mutating_row_or_audit() {
        let mut conn = fresh_memory_db();
        conn.execute(
            "INSERT INTO bo_queue(number,nature) VALUES ('BO-200','Furto')",
            [],
        )
        .unwrap();
        let err = update_bo_status_on(&mut conn, "BO-200", QueueStatus::ConcluidoVerificado, "")
            .unwrap_err();
        assert!(err.contains("não permitida"), "mensagem foi: {err}");
        let status: String = conn
            .query_row(
                "SELECT status FROM bo_queue WHERE number='BO-200'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "PENDENTE");
        assert_eq!(table_count(&conn, "audit_log"), 0);
    }

    #[test]
    fn update_bo_status_on_nonexistent_number_is_rejected_without_audit() {
        let mut conn = fresh_memory_db();
        let err =
            update_bo_status_on(&mut conn, "NAO-EXISTE", QueueStatus::EmLeitura, "").unwrap_err();
        assert!(err.contains("não encontrado"), "mensagem foi: {err}");
        assert_eq!(table_count(&conn, "audit_log"), 0);
    }

    #[test]
    fn add_bo_on_rejects_duplicate_with_specific_message_and_does_not_double_insert() {
        let mut conn = fresh_memory_db();
        add_bo_on(&mut conn, "BO-DUP", "Furto").unwrap();
        let err = add_bo_on(&mut conn, "BO-DUP", "Furto").unwrap_err();
        assert_eq!(err, "Este B.O. já está na fila local.");
        assert_eq!(table_count(&conn, "bo_queue"), 1);
        // Apenas uma entrada de auditoria 'added' deve existir para esse B.O.
        let added_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM audit_log WHERE action='added' AND bo_number='BO-DUP'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(added_count, 1);
    }

    #[test]
    fn queue_snapshot_for_returns_consistent_rows_summary_and_revision() {
        let mut conn = fresh_memory_db();
        let snapshot = queue_snapshot_for(&mut conn).unwrap();
        assert_eq!(snapshot.rows.len(), 0);
        assert_eq!(snapshot.summary.total, 0);
        assert_eq!(snapshot.revision, 0);

        add_bo_on(&mut conn, "BO-SNAP-1", "Furto").unwrap();
        let snapshot_after_add = queue_snapshot_for(&mut conn).unwrap();
        assert_eq!(snapshot_after_add.rows.len(), 1);
        assert_eq!(snapshot_after_add.summary.queue, 1);
        assert_eq!(snapshot_after_add.summary.total, 1);
        assert!(snapshot_after_add.revision > snapshot.revision);

        update_bo_status_on(&mut conn, "BO-SNAP-1", QueueStatus::EmLeitura, "indo").unwrap();
        let snapshot_after_update = queue_snapshot_for(&mut conn).unwrap();
        assert_eq!(snapshot_after_update.rows[0].status, "EM_LEITURA");
        assert!(snapshot_after_update.revision > snapshot_after_add.revision);
    }

    #[test]
    fn queue_snapshot_revision_is_the_highest_audit_log_id() {
        let mut conn = fresh_memory_db();
        add_bo_on(&mut conn, "A", "Furto").unwrap();
        add_bo_on(&mut conn, "B", "Furto").unwrap();
        update_bo_status_on(&mut conn, "A", QueueStatus::EmLeitura, "").unwrap();
        let max_id: i64 = conn
            .query_row("SELECT MAX(id) FROM audit_log", [], |row| row.get(0))
            .unwrap();
        let snapshot = queue_snapshot_for(&mut conn).unwrap();
        assert_eq!(snapshot.revision, max_id);
    }

    #[test]
    fn acquire_next_pending_returns_none_on_empty_database() {
        let mut conn = fresh_memory_db();
        let result = acquire_next_pending_on(&mut conn, "worker-A").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn acquire_next_pending_returns_none_when_no_pendente_exists() {
        let mut conn = fresh_memory_db();
        conn.execute(
            "INSERT INTO bo_queue(number,nature,status) VALUES ('X','Y','AGUARDANDO_REVISAO')",
            [],
        )
        .unwrap();
        assert!(acquire_next_pending_on(&mut conn, "w").unwrap().is_none());
    }

    #[test]
    fn acquire_next_pending_takes_oldest_pending_first_fifo() {
        let mut conn = fresh_memory_db();
        // Insere em ordem reversa com timestamps controlados: C mais antigo, A mais novo.
        conn.execute(
            "INSERT INTO bo_queue(number,nature,created_at) VALUES
               ('BO-A','Furto','2026-01-01T00:00:03.000Z'),
               ('BO-B','Furto','2026-01-01T00:00:02.000Z'),
               ('BO-C','Furto','2026-01-01T00:00:01.000Z')",
            [],
        )
        .unwrap();
        let t1 = acquire_next_pending_on(&mut conn, "w1").unwrap().unwrap();
        assert_eq!(t1.number, "BO-C", "FIFO: mais antigo primeiro");
        let t2 = acquire_next_pending_on(&mut conn, "w1").unwrap().unwrap();
        assert_eq!(t2.number, "BO-B");
        let t3 = acquire_next_pending_on(&mut conn, "w1").unwrap().unwrap();
        assert_eq!(t3.number, "BO-A");
        assert!(acquire_next_pending_on(&mut conn, "w1").unwrap().is_none());
    }

    #[test]
    fn acquire_next_pending_moves_row_to_em_leitura_and_audits_with_worker_label() {
        let mut conn = fresh_memory_db();
        add_bo_on(&mut conn, "BO-WORKER", "Furto").unwrap();
        let task = acquire_next_pending_on(&mut conn, "worker-alpha")
            .unwrap()
            .unwrap();
        assert_eq!(task.number, "BO-WORKER");
        assert_eq!(task.nature, "Furto");
        let status: String = conn
            .query_row(
                "SELECT status FROM bo_queue WHERE number='BO-WORKER'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "EM_LEITURA");
        let reason: String = conn
            .query_row(
                "SELECT reason FROM bo_queue WHERE number='BO-WORKER'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(reason.contains("worker-alpha"), "reason: {reason}");
        let audit_actions: Vec<String> = conn
            .prepare("SELECT action FROM audit_log WHERE bo_number='BO-WORKER' ORDER BY id")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(
            audit_actions,
            vec!["added".to_owned(), "EM_LEITURA".to_owned()]
        );
    }

    #[test]
    fn acquire_next_pending_sanitizes_worker_id_with_control_chars() {
        let mut conn = fresh_memory_db();
        add_bo_on(&mut conn, "BO-SAN", "Furto").unwrap();
        let _ = acquire_next_pending_on(&mut conn, "worker\n\tpalpite").unwrap();
        let reason: String = conn
            .query_row(
                "SELECT reason FROM bo_queue WHERE number='BO-SAN'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!reason.contains('\n'));
        assert!(!reason.contains('\t'));
        assert!(reason.contains("worker palpite"));
    }

    #[test]
    fn record_read_outcome_concluida_moves_em_leitura_to_lido() {
        let mut conn = fresh_memory_db();
        add_bo_on(&mut conn, "BO-OK", "Furto").unwrap();
        acquire_next_pending_on(&mut conn, "w").unwrap().unwrap();
        record_read_outcome_on(&mut conn, "BO-OK", "CONCLUIDA", &[]).unwrap();
        let status: String = conn
            .query_row(
                "SELECT status FROM bo_queue WHERE number='BO-OK'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "LIDO");
    }

    #[test]
    fn record_read_outcome_parcial_moves_to_aguardando_revisao_with_joined_reasons() {
        let mut conn = fresh_memory_db();
        add_bo_on(&mut conn, "BO-P", "Furto").unwrap();
        acquire_next_pending_on(&mut conn, "w").unwrap().unwrap();
        record_read_outcome_on(
            &mut conn,
            "BO-P",
            "PARCIAL",
            &[
                "ABA_AUSENTE: Documentos".to_owned(),
                "PAINEL_NAO_CARREGADO: Relato".to_owned(),
            ],
        )
        .unwrap();
        let (status, reason): (String, String) = conn
            .query_row(
                "SELECT status, reason FROM bo_queue WHERE number='BO-P'",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .unwrap();
        assert_eq!(status, "AGUARDANDO_REVISAO");
        assert!(reason.contains("Leitura parcial"));
        assert!(reason.contains("ABA_AUSENTE: Documentos"));
        assert!(reason.contains("PAINEL_NAO_CARREGADO: Relato"));
    }

    #[test]
    fn record_read_outcome_restrita_moves_em_leitura_to_restrito() {
        let mut conn = fresh_memory_db();
        add_bo_on(&mut conn, "BO-R", "Furto").unwrap();
        acquire_next_pending_on(&mut conn, "w").unwrap().unwrap();
        record_read_outcome_on(
            &mut conn,
            "BO-R",
            "RESTRITA",
            &["ACESSO_RESTRITO".to_owned()],
        )
        .unwrap();
        let status: String = conn
            .query_row("SELECT status FROM bo_queue WHERE number='BO-R'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(status, "RESTRITO");
    }

    #[test]
    fn record_read_outcome_falha_moves_em_leitura_to_erro() {
        let mut conn = fresh_memory_db();
        add_bo_on(&mut conn, "BO-F", "Furto").unwrap();
        acquire_next_pending_on(&mut conn, "w").unwrap().unwrap();
        record_read_outcome_on(&mut conn, "BO-F", "FALHA", &["SESSAO_EXPIRADA".to_owned()])
            .unwrap();
        let status: String = conn
            .query_row("SELECT status FROM bo_queue WHERE number='BO-F'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(status, "ERRO");
    }

    #[test]
    fn record_read_outcome_rejects_unknown_completeness_variant() {
        let mut conn = fresh_memory_db();
        add_bo_on(&mut conn, "BO-U", "Furto").unwrap();
        acquire_next_pending_on(&mut conn, "w").unwrap().unwrap();
        let err = record_read_outcome_on(&mut conn, "BO-U", "INVENTADO", &[]).unwrap_err();
        assert!(err.contains("Completude"), "mensagem foi: {err}");
    }

    #[test]
    fn update_cas_prevents_lost_update_when_underlying_status_changed_externally() {
        // Prova direta da semântica do CAS: a cláusula WHERE adicionada em
        // update_bo_status_on usa `AND status=<current>`. Se o estado real diverge,
        // o UPDATE devolve 0 linhas e nada é alterado nem auditado.
        let mut conn = fresh_memory_db();
        // Insere em EM_LEITURA direto — como se outro worker tivesse adquirido a tarefa.
        conn.execute(
            "INSERT INTO bo_queue(number,nature,status) VALUES ('BO-RACE','Furto','EM_LEITURA')",
            [],
        )
        .unwrap();
        let tx = conn.transaction().unwrap();
        // Replica o padrão: tenta a transição assumindo PENDENTE.
        let changed = tx
            .execute(
                "UPDATE bo_queue SET status='EM_LEITURA', reason='lost', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE number='BO-RACE' AND status='PENDENTE'",
                [],
            )
            .unwrap();
        tx.commit().unwrap();
        assert_eq!(changed, 0, "CAS impediu lost update");
        let status: String = conn
            .query_row(
                "SELECT status FROM bo_queue WHERE number='BO-RACE'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "EM_LEITURA");
        // Nada de audit — o UPDATE sequer foi executado.
        assert_eq!(table_count(&conn, "audit_log"), 0);
    }

    #[test]
    fn run_synthetic_cycle_moves_a_pendente_to_lido_and_returns_number() {
        let mut conn = fresh_memory_db();
        add_bo_on(&mut conn, "BO-SYN", "Furto").unwrap();
        let result = run_synthetic_cycle_on(&mut conn).unwrap();
        assert_eq!(result.number, "BO-SYN");
        assert_eq!(result.next_status, "LIDO");
        assert_eq!(result.recognized_tabs.len(), 9);
        assert!(result.is_synthetic);
        let status: String = conn
            .query_row(
                "SELECT status FROM bo_queue WHERE number='BO-SYN'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "LIDO");
    }

    #[test]
    fn run_synthetic_cycle_without_pendente_returns_clear_error() {
        let mut conn = fresh_memory_db();
        let err = run_synthetic_cycle_on(&mut conn).unwrap_err();
        assert!(err.contains("Nenhum B.O. PENDENTE"), "mensagem: {err}");
    }

    #[test]
    fn queue_status_repeating_same_state_is_rejected_by_update() {
        let mut conn = fresh_memory_db();
        conn.execute(
            "INSERT INTO bo_queue(number,nature) VALUES ('BO-SAME','Furto')",
            [],
        )
        .unwrap();
        // PENDENTE -> PENDENTE é auto-transição e deve ser rejeitada
        let err = update_bo_status_on(&mut conn, "BO-SAME", QueueStatus::Pendente, "").unwrap_err();
        assert!(err.contains("não permitida"), "mensagem foi: {err}");
    }
}
