export type BrowserQueueStatus =
  | 'PENDENTE'
  | 'EM_LEITURA'
  | 'LIDO'
  | 'EM_ANALISE'
  | 'MINUTA_GERADA'
  | 'AGUARDANDO_REVISAO'
  | 'VALIDADO_PELO_RESPONSAVEL'
  | 'AGUARDANDO_FINALIZACAO'
  | 'CONCLUIDO_VERIFICADO'
  | 'ERRO'
  | 'RESTRITO';

export type BrowserQueueRow = {
  number: string;
  nature: string;
  status: BrowserQueueStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

export type BrowserQueueSummary = {
  queue: number;
  completed: number;
  review: number;
  errors: number;
  restricted: number;
  total: number;
};

export type BrowserAuditEntry = {
  number: string;
  from: BrowserQueueStatus | null;
  to: BrowserQueueStatus;
  reason: string;
  createdAt: string;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type BrowserQueue = {
  list(): BrowserQueueRow[];
  add(number: string, nature: string): BrowserQueueRow[];
  update(number: string, status: BrowserQueueStatus, reason?: string): BrowserQueueRow[];
  summary(): BrowserQueueSummary;
  audit(): BrowserAuditEntry[];
};

export function createBrowserQueue(storage: StorageLike, now?: () => string): BrowserQueue;
