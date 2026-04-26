export type AuditEventType =
  | 'prompt'
  | 'response'
  | 'tool_call'
  | 'tool_result'
  | 'run_start'
  | 'run_end'
  | 'error'
  | 'redacted';

export interface AuditEvent {
  id: string;
  runId: string;
  agentName?: string;
  type: AuditEventType;
  ts: number;
  durationMs?: number;
  payload: Record<string, unknown>;
  seq: number;
  prevHash: string;
  hash: string;
}
