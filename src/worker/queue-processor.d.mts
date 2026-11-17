export type QueueProcessorRow = {
  number: string;
  nature: string;
  status: string;
};

export type StructuralReadResult = {
  completeness: 'CONCLUIDA' | 'PARCIAL' | 'RESTRITA' | 'FALHA';
  recognizedTabs: string[];
  reasons: string[];
};

export type QueueProcessorResult = {
  processed: number;
  stoppedReason: 'CANCELADO' | 'ACESSO_RESTRITO' | 'SESSAO_EXPIRADA' | null;
  results: Array<{
    number: string;
    outcome: 'REVIEW' | 'RESTRICTED' | 'ERROR';
  }>;
};

export function processQueueRows(
  rows: QueueProcessorRow[],
  options: {
    readBo(number: string): Promise<StructuralReadResult>;
    updateStatus(number: string, status: string, reason: string): Promise<unknown>;
    signal?: AbortSignal;
    onProgress?: (event: Record<string, string>) => void;
  },
): Promise<QueueProcessorResult>;
