import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditEvent, AuditEventType } from './event.js';
import { hashEvent, GENESIS } from './crypto.js';

function getRunsDir(): string {
  return join(process.env.AGENTLOG_DIR ?? '.agentlog', 'runs');
}

function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function ensureGitignore(): void {
  const root = findProjectRoot();
  const path = join(root, '.gitignore');
  const entry = '.agentlog/';
  if (!existsSync(path)) {
    writeFileSync(path, `${entry}\n`, 'utf8');
    return;
  }
  const contents = readFileSync(path, 'utf8');
  if (!/^\.agentlog\/$/m.test(contents)) {
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
  if (options?.gitignore !== false) {
    ensureGitignore();
  }

  const runId = randomUUID();
  const runsDir = getRunsDir();
  mkdirSync(runsDir, { recursive: true });
  const filePath = join(runsDir, `${runId}.jsonl`);

  const schemaVersion = '2' as const;
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

    const hash = hashEvent(partial, schemaVersion);
    const event: AuditEvent = { ...partial, hash };

    appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');

    seq += 1;
    prevHash = hash;

    return event;
  }

  writeEvent('run_start', {
    schemaVersion,
    framework: 'agentlog',
    captureMode: options?.captureMode ?? 'metadata',
    startedAt,
  });

  return {
    runId,

    append(type, payload, durationMs) {
      if (endEvent && type !== 'late_error') {
        throw new Error(`Cannot append event of type "${type}" after run has ended`);
      }
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
      const tmpPath = filePath.replace(/\.jsonl$/, '.head.json.tmp');
      const headPath = filePath.replace(/\.jsonl$/, '.head.json');
      writeFileSync(
        tmpPath,
        JSON.stringify({ runId, seq: endEvent.seq, hash: endEvent.hash, endedAt: Date.now() }),
        'utf8'
      );
      renameSync(tmpPath, headPath);
      return endEvent;
    },
  };
}
