"""Exercises the production V0.4 schema, V0.3 migration and shared summary SQL with synthetic data."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "src-tauri/src/sql/schema_v04.sql").read_text(encoding="utf-8")
MIGRATION = (ROOT / "src-tauri/src/sql/migrate_v03_to_v04.sql").read_text(encoding="utf-8")
SUMMARY_SQL = (ROOT / "src-tauri/src/sql/queue_summary.sql").read_text(encoding="utf-8")

LEGACY_SCHEMA = """
CREATE TABLE bo_queue (
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
);
"""

EXPECTED_STATES = {
    "PENDENTE", "EM_LEITURA", "LIDO", "EM_ANALISE", "MINUTA_GERADA",
    "AGUARDANDO_REVISAO", "VALIDADO_PELO_RESPONSAVEL",
    "AGUARDANDO_FINALIZACAO", "CONCLUIDO_VERIFICADO", "ERRO", "RESTRITO",
}


def test_new_schema_rejects_unknown_status():
    connection = sqlite3.connect(":memory:")
    connection.executescript(SCHEMA)
    connection.execute("INSERT INTO bo_queue(number,nature) VALUES (?,?)", ("BO-01", "Furto"))
    assert connection.execute("SELECT status FROM bo_queue").fetchone()[0] == "PENDENTE"
    for status in EXPECTED_STATES:
        connection.execute(
            "INSERT INTO bo_queue(number,nature,status) VALUES (?,?,?)",
            (f"BO-{status}", "Sintética", status),
        )
    try:
        connection.execute(
            "INSERT INTO bo_queue(number,nature,status) VALUES ('INVALID','Sintética','INVALIDO')"
        )
        raise AssertionError("CHECK constraint accepted an unknown status")
    except sqlite3.IntegrityError:
        pass


def test_legacy_migration_preserves_rows_and_maps_statuses():
    connection = sqlite3.connect(":memory:")
    connection.executescript(LEGACY_SCHEMA)
    connection.executemany(
        "INSERT INTO bo_queue(number,nature,status,reason) VALUES (?,?,?,?)",
        [
            ("LEGACY-P", "Furto", "pending", ""),
            ("LEGACY-R", "Perda", "review", "Conferir"),
            ("LEGACY-D", "Dano", "done", "Validado"),
        ],
    )
    connection.execute(
        "INSERT INTO audit_log(action,bo_number) VALUES ('added','LEGACY-P')"
    )
    connection.commit()
    connection.executescript(MIGRATION)
    assert connection.execute(
        "SELECT number,status FROM bo_queue ORDER BY number"
    ).fetchall() == [
        ("LEGACY-D", "CONCLUIDO_VERIFICADO"),
        ("LEGACY-P", "PENDENTE"),
        ("LEGACY-R", "AGUARDANDO_REVISAO"),
    ]
    assert connection.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0] == 1


def test_unknown_legacy_status_is_preserved_in_migration_audit():
    connection = sqlite3.connect(":memory:")
    connection.executescript(LEGACY_SCHEMA.replace(
        " CHECK(status IN ('pending','review','done'))", ""
    ))
    connection.execute(
        "INSERT INTO bo_queue(number,nature,status) VALUES (?,?,?)",
        ("LEGACY-UNKNOWN", "Sintética", "UNKNOWN_LEGACY_STATE"),
    )
    connection.commit()
    connection.executescript(MIGRATION)
    assert connection.execute(
        "SELECT status FROM bo_queue WHERE number='LEGACY-UNKNOWN'"
    ).fetchone()[0] == "AGUARDANDO_REVISAO"
    assert connection.execute(
        "SELECT action,bo_number FROM audit_log WHERE bo_number='LEGACY-UNKNOWN'"
    ).fetchone() == ("migrated_legacy_status:UNKNOWN_LEGACY_STATE", "LEGACY-UNKNOWN")


def test_summary_sql_returns_zeros_not_null_on_empty_database():
    connection = sqlite3.connect(":memory:")
    connection.executescript(SCHEMA)
    assert connection.execute(SUMMARY_SQL).fetchone() == (0, 0, 0, 0, 0, 0)


def test_summary_sql_counts_one_of_each_state_as_7_1_3_1_1_11():
    connection = sqlite3.connect(":memory:")
    connection.executescript(SCHEMA)
    for index, status in enumerate(sorted(EXPECTED_STATES)):
        connection.execute(
            "INSERT INTO bo_queue(number,nature,status) VALUES (?,?,?)",
            (f"BO-{index}", "Sintética", status),
        )
    assert connection.execute(SUMMARY_SQL).fetchone() == (7, 1, 3, 1, 1, 11)


def test_summary_sql_groups_mixed_case_as_2_1_3_1_1_6():
    connection = sqlite3.connect(":memory:")
    connection.executescript(SCHEMA)
    rows = [
        ("P1", "PENDENTE"),
        ("P2", "EM_LEITURA"),
        ("R1", "AGUARDANDO_REVISAO"),
        ("E1", "ERRO"),
        ("X1", "RESTRITO"),
        ("D1", "CONCLUIDO_VERIFICADO"),
    ]
    connection.executemany(
        "INSERT INTO bo_queue(number,nature,status) VALUES (?, 'Sintética', ?)", rows
    )
    assert connection.execute(SUMMARY_SQL).fetchone() == (2, 1, 3, 1, 1, 6)


test_new_schema_rejects_unknown_status()
test_legacy_migration_preserves_rows_and_maps_statuses()
test_unknown_legacy_status_is_preserved_in_migration_audit()
test_summary_sql_returns_zeros_not_null_on_empty_database()
test_summary_sql_counts_one_of_each_state_as_7_1_3_1_1_11()
test_summary_sql_groups_mixed_case_as_2_1_3_1_1_6()
print("PASS: schema V0.4, migração V0.3 e resumo da fila SQLite (SQL compartilhado)")
