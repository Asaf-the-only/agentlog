import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditEvent, AuditEventType } from './event.js';
import { hashEvent, GENESIS } from './crypto.js';

function getRunsDir(): string {
  return join(process.env.AGENTLOG_DIR ?? '.agentlog', 'runs');
}

function ensureGitignore(): void {
  const path = '.gitignore';
  const entry = '.agentlog/';
  if (!existsSync(path)) {
    writeFileSync(path, `${entry}\n`, 'utf8');
    return;
  }
  const contents = readFileSync(path, 'utf8');
  if (!contents.includes(entry)) {
    appendFileSync(path, `\n${entry}\n`, 'utf8');
  }
}

export interface Run {
  runId: string;
  append(type: AuditEventType, payload: Record<string, unknown>, durationMs?: number): AuditEvent;
  end(status: 'success' | 'error', errorMessage?: string): AuditEvent;
}

export function createRun(options?: {
  agentName?: string;
  captureMode?: 'metadata' | 'full';
  gitignore?: boolean;
}): Run {
  if (options?.gitignore) {
    ensureGitignore();
  }

  const runId = randomUUID();
  const runsDir = getRunsDir();
  mkdirSync(runsDir, { recursive: true });
  const filePath = join(runsDir, `${runId}.jsonl`);

  let seq = 0;
  let prevHash = GENESIS;
  const startedAt = Date.now();
  let endEvent: AuditEvent | undefined;

  function writeEvent(type: AuditEventType, payload: Record<string, unknown>, durationMs?: number): AuditEvent {
    const partial: Omit<AuditEvent, 'hash'> = {
      id: randomUUID(),
      runId,
      agentName: options?.agentName,
      type,
      ts: Date.now(),
      durationMs,
      payload,
      seq,
      prevHash,
    };

    const hash = hashEvent(partial);
    const event: AuditEvent = { ...partial, hash };

    appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');

    seq += 1;
    prevHash = hash;

    return event;
  }

  writeEvent('run_start', {
    schemaVersion: '1',
    framework: 'agentlog',
    captureMode: options?.captureMode ?? 'metadata',
    startedAt,
  });

  return {
    runId,

    append(type, payload, durationMs) {
      return writeEvent(type, payload, durationMs);
    },

    end(status, errorMessage) {
      if (endEvent) return endEvent;
      endEvent = writeEvent('run_end', {
        status,
        errorMessage,
        totalEvents: seq,
        durationMs: Date.now() - startedAt,
      });
      return endEvent;
    },
  };
}
