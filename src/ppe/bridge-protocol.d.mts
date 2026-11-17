export type PpeCompleteness = 'CONCLUIDA' | 'PARCIAL' | 'RESTRITA' | 'FALHA';

export type PpeReadResultEvent = {
  version: 1;
  type: 'PPE_READ_RESULT';
  number: string;
  completeness: PpeCompleteness;
  recognizedTabs: string[];
  reasons: string[];
};

export function createReadResultEvent(
  number: string,
  summary: {
    completeness: string;
    recognizedTabs: string[];
    reasons: string[];
    [key: string]: unknown;
  },
): PpeReadResultEvent;

export function stringifyBridgeEvent(event: PpeReadResultEvent): string;
export function parseBridgeLine(line: string): PpeReadResultEvent;
