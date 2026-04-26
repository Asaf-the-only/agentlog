import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { verifyFile } from './verify.js';
import { hashEvent, GENESIS } from './crypto.js';
import type { AuditEvent, AuditEventType } from './event.js';

function makeEvent(
  runId: string,
  seq: number,
  prevHash: string,
  type: AuditEventType,
  payload: Record<string, unknown> = {}
): AuditEvent {
  const partial: Omit<AuditEvent, 'hash'> = {
    id: randomUUID(),
    runId,
    type,
    ts: 1_000_000_000_000 + seq * 100,
    payload,
    seq,
    prevHash,
  };
  return { ...partial, hash: hashEvent(partial) };
}

function buildChain(types: AuditEventType[]): AuditEvent[] {
  const runId = randomUUID();
  let prevHash = GENESIS;
  return types.map((type, seq) => {
    const event = makeEvent(runId, seq, prevHash, type);
    prevHash = event.hash;
    return event;
  });
}

function writeTmp(events: AuditEvent[]): string {
  const dir = join(tmpdir(), randomUUID());
  mkdirSync(dir);
  const path = join(dir, 'run.jsonl');
  writeFileSync(path, events.map(e => JSON.stringify(e)).join('\n') + '\n');
  return path;
}

describe('verifyFile', () => {
  it('valid chain passes', async () => {
    const path = writeTmp(buildChain(['run_start', 'prompt', 'response', 'run_end']));
    const result = await verifyFile(path);
    expect(result.valid).toBe(true);
    expect(result.eventsChecked).toBe(4);
  });

  it('edited payload fails', async () => {
    const path = writeTmp(buildChain(['run_start', 'prompt', 'response', 'run_end']));
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    const tampered = JSON.parse(lines[1]) as AuditEvent;
    tampered.payload.injected = 'evil';
    lines[1] = JSON.stringify(tampered);
    writeFileSync(path, lines.join('\n') + '\n');

    const result = await verifyFile(path);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/hash mismatch/i);
  });

  it('deleted event fails', async () => {
    const path = writeTmp(buildChain(['run_start', 'prompt', 'response', 'run_end']));
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    lines.splice(2, 1);
    writeFileSync(path, lines.join('\n') + '\n');

    const result = await verifyFile(path);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/sequence gap|hash chain broken/i);
  });

  it('edited redacted event payload fails', async () => {
    const path = writeTmp(buildChain(['run_start', 'prompt', 'redacted', 'run_end']));
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    const tampered = JSON.parse(lines[2]) as AuditEvent;
    tampered.payload.targetEventId = 'forged-id';
    lines[2] = JSON.stringify(tampered);
    writeFileSync(path, lines.join('\n') + '\n');

    const result = await verifyFile(path);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/hash mismatch/i);
  });
});
