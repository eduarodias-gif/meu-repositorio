PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS bo_queue (
  number TEXT PRIMARY KEY NOT NULL,
  nature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN (
    'PENDENTE','EM_LEITURA','LIDO','EM_ANALISE','MINUTA_GERADA',
    'AGUARDANDO_REVISAO','VALIDADO_PELO_RESPONSAVEL',
    'AGUARDANDO_FINALIZACAO','CONCLUIDO_VERIFICADO','ERRO','RESTRITO'
  )),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  bo_number TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
PRAGMA user_version = 4;
