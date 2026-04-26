import { createHash } from 'node:crypto';
import type { AuditEvent } from './event.js';

export const GENESIS = createHash('sha256').update('agentlog-genesis-v1').digest('hex');

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object).sort().map(k => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

export function hashEvent(event: Omit<AuditEvent, 'hash'>): string {
  const canonical = event.prevHash + JSON.stringify(sortKeys({
    id: event.id,
    runId: event.runId,
    seq: event.seq,
    type: event.type,
    ts: event.ts,
    payload: event.payload,
  }));
  return createHash('sha256').update(canonical).digest('hex');
}
