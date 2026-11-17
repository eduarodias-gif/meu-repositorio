PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;
ALTER TABLE bo_queue RENAME TO bo_queue_v03;
CREATE TABLE bo_queue (
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
INSERT INTO audit_log(action,bo_number)
SELECT 'migrated_legacy_status:' || status, number
FROM bo_queue_v03
WHERE status NOT IN ('pending','review','done');
INSERT INTO bo_queue(number,nature,status,reason,created_at,updated_at)
SELECT number,nature,
  CASE status
    WHEN 'pending' THEN 'PENDENTE'
    WHEN 'review' THEN 'AGUARDANDO_REVISAO'
    WHEN 'done' THEN 'CONCLUIDO_VERIFICADO'
    ELSE 'AGUARDANDO_REVISAO'
  END,
  reason,created_at,updated_at
FROM bo_queue_v03;
DROP TABLE bo_queue_v03;
PRAGMA user_version = 4;
COMMIT;
PRAGMA foreign_keys = ON;
