import { invoke, isTauri } from '@tauri-apps/api/core';
import { createBrowserQueue } from './queue/browser-store.mjs';
import { processQueueRows } from './worker/queue-processor.mjs';
import type { QueueProcessorResult } from './worker/queue-processor.mjs';

export type LocalBo = {
  number: string;
  nature: string;
  status: QueueStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

export type QueueStatus =
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

export type QueueSummary = {
  queue: number;
  completed: number;
  review: number;
  errors: number;
  restricted: number;
  total: number;
};

export type QueueSnapshot = {
  rows: LocalBo[];
  summary: QueueSummary;
  revision: number;
};

export const desktopAvailable = isTauri();
const browserQueue = !desktopAvailable && typeof window !== 'undefined'
  ? createBrowserQueue(window.localStorage)
  : null;

export async function listLocalBos(): Promise<LocalBo[]> {
  if (!desktopAvailable) return browserQueue?.list() as LocalBo[] ?? [];
  return invoke<LocalBo[]>('list_bos');
}
export async function getQueueSummary(): Promise<QueueSummary> {
  if (!desktopAvailable) return browserQueue?.summary() ?? { queue: 0, completed: 0, review: 0, errors: 0, restricted: 0, total: 0 };
  return invoke<QueueSummary>('queue_summary');
}
export async function getQueueSnapshot(): Promise<QueueSnapshot> {
  if (!desktopAvailable) {
    const rows = (browserQueue?.list() as LocalBo[]) ?? [];
    const summary = browserQueue?.summary() ?? { queue: 0, completed: 0, review: 0, errors: 0, restricted: 0, total: 0 };
    const revision = browserQueue?.audit().length ?? 0;
    return { rows, summary, revision };
  }
  return invoke<QueueSnapshot>('queue_snapshot');
}
export async function addLocalBo(number: string, nature: string): Promise<LocalBo[]> {
  if (!desktopAvailable) return browserQueue?.add(number, nature) as LocalBo[] ?? [];
  return invoke<LocalBo[]>('add_bo', { number, nature });
}
export async function updateLocalBo(number: string, status: LocalBo['status'], reason = ''): Promise<LocalBo[]> {
  if (!desktopAvailable) return browserQueue?.update(number, status, reason) as LocalBo[] ?? [];
  return invoke<LocalBo[]>('update_bo_status', { number, status, reason });
}
export async function runLocalQueueTest(options: {
  signal?: AbortSignal;
  onProgress?: (event: Record<string, string>) => void;
} = {}): Promise<QueueProcessorResult> {
  if (desktopAvailable) {
    throw new Error('O teste local do navegador não substitui a sessão PPE do aplicativo desktop.');
  }
  const rows = (await listLocalBos()).filter(row => row.status === 'PENDENTE' && /^TESTE-/i.test(row.number));
  if (rows.length === 0) {
    throw new Error('Cadastre um B.O. fictício começando com TESTE- para executar o fluxo local.');
  }
  return processQueueRows(rows, {
    signal: options.signal,
    onProgress: options.onProgress,
    readBo: async () => ({
      completeness: 'CONCLUIDA',
      recognizedTabs: ['Dados do Registro', 'Dados do Fato'],
      reasons: [],
    }),
    updateStatus: async (number, status, reason) => {
      await updateLocalBo(number, status as QueueStatus, reason);
    },
  });
}
export async function openOfficialPortal(): Promise<void> {
  if (!desktopAvailable) throw new Error('Abra o aplicativo desktop para iniciar a sessão oficial.');
  await invoke('open_sinesp_portal');
}

export type SyntheticCycleResult = {
  number: string;
  nextStatus: string;
  recognizedTabs: string[];
  isSynthetic: boolean;
};

export async function runDesktopSyntheticCycle(): Promise<SyntheticCycleResult> {
  if (!desktopAvailable) throw new Error('Ciclo sintético desktop requer o aplicativo nativo.');
  return invoke<SyntheticCycleResult>('desktop_run_synthetic_cycle');
}

// --- IA LOCAL (M8 integração) ---
// Nenhuma dessas funções chama serviço externo. Toda chamada é validada como
// loopback no backend Rust; redirects HTTP são rejeitados.

export type OllamaEndpointConfig = {
  host: string;
  port: number;
  timeoutSeconds?: number;
};

export type AnalysisRequest = {
  boNumber: string;
  model: string;
  promptVersionId: string;
  promptBody: string;
  readingHash: string;
  readingPayload: string;
};

export type AnalysisResult = {
  boNumber: string;
  model: string;
  promptVersionId: string;
  readingHash: string;
  classificacao: string;
  fatos: string[];
  justificativa: string;
  fundamentos: string[];
  lacunas: string[];
  alertas: string[];
  minuta: string;
  minutaCharCount: number;
  minutaOverflow: boolean;
};

export type PromptHashResult = { sha256Hex: string; charCount: number };

const DEFAULT_OLLAMA: OllamaEndpointConfig = { host: '127.0.0.1', port: 11434, timeoutSeconds: 30 };

export async function listOllamaModels(endpoint: OllamaEndpointConfig = DEFAULT_OLLAMA): Promise<string[]> {
  if (!desktopAvailable) throw new Error('IA local requer o aplicativo desktop.');
  return invoke<string[]>('ai_list_models', { endpoint });
}

export async function runOllamaAnalysis(
  request: AnalysisRequest,
  endpoint: OllamaEndpointConfig = DEFAULT_OLLAMA,
): Promise<AnalysisResult> {
  if (!desktopAvailable) throw new Error('IA local requer o aplicativo desktop.');
  return invoke<AnalysisResult>('ai_run_analysis', { endpoint, request });
}

export async function hashPromptBody(body: string): Promise<PromptHashResult> {
  if (!desktopAvailable) throw new Error('Hash do prompt requer o aplicativo desktop.');
  return invoke<PromptHashResult>('ai_hash_prompt_body', { body });
}

// --- AGENDAMENTO (M11 iteração 2) ---
// A configuração é persistida em %APPDATA%\br.sied.systemv5\config\schedule.json
// em texto plano (preferências não são sensíveis — o usuário precisa poder
// inspecionar sem o app rodar). Sempre valida antes de gravar.

export type ScheduleConfig = {
  enabled: boolean;
  daysOfWeek: number[]; // 0=Dom..6=Sáb
  startMinuteOfDay: number; // 0..1439
  endMinuteOfDay: number; // 0..1439
  maxTasksPerWindow: number;
};

export type WindowReason =
  | 'DISABLED'
  | 'DAY_NOT_SELECTED'
  | 'BEFORE_WINDOW'
  | 'AFTER_WINDOW'
  | 'TASKS_CAP_REACHED'
  | 'IN_WINDOW'
  | 'INVALID_CONFIG';

export type WindowStatus = {
  allowedToAcquire: boolean;
  inWindow: boolean;
  reason: WindowReason;
  tasksDoneInWindow: number;
  maxTasksPerWindow: number;
};

export async function getScheduleConfig(): Promise<ScheduleConfig> {
  if (!desktopAvailable) throw new Error('Agendamento persistido só no desktop.');
  return invoke<ScheduleConfig>('get_schedule_config');
}

export async function setScheduleConfig(config: ScheduleConfig): Promise<ScheduleConfig> {
  if (!desktopAvailable) throw new Error('Agendamento persistido só no desktop.');
  return invoke<ScheduleConfig>('set_schedule_config', { config });
}

export async function checkScheduleWindow(at: {
  nowDow: number;
  nowMinuteOfDay: number;
  tasksDoneInWindow: number;
}): Promise<WindowStatus> {
  if (!desktopAvailable) throw new Error('Checagem de janela só no desktop.');
  return invoke<WindowStatus>('check_schedule_window', { at });
}

export function currentWindowInput(tasksDoneInWindow = 0) {
  const now = new Date();
  return {
    nowDow: now.getDay(),
    nowMinuteOfDay: now.getHours() * 60 + now.getMinutes(),
    tasksDoneInWindow,
  };
}
