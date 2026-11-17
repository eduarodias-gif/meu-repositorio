-- Produção e testes consomem exatamente esta consulta.
-- Alterações aqui impactam o dashboard e precisam de novo teste correspondente.
SELECT
  COALESCE(SUM(CASE WHEN status IN (
    'PENDENTE','EM_LEITURA','LIDO','EM_ANALISE','MINUTA_GERADA',
    'VALIDADO_PELO_RESPONSAVEL','AGUARDANDO_FINALIZACAO'
  ) THEN 1 ELSE 0 END), 0) AS queue_count,
  COALESCE(SUM(CASE WHEN status = 'CONCLUIDO_VERIFICADO' THEN 1 ELSE 0 END), 0) AS completed_count,
  COALESCE(SUM(CASE WHEN status IN ('AGUARDANDO_REVISAO','ERRO','RESTRITO') THEN 1 ELSE 0 END), 0) AS review_count,
  COALESCE(SUM(CASE WHEN status = 'ERRO' THEN 1 ELSE 0 END), 0) AS error_count,
  COALESCE(SUM(CASE WHEN status = 'RESTRITO' THEN 1 ELSE 0 END), 0) AS restricted_count,
  COUNT(*) AS total_count
FROM bo_queue
