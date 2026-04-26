import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { hashEvent, GENESIS } from './crypto.js';
import type { AuditEvent } from './event.js';

export type VerifyResult = {
  valid: boolean;
  eventsChecked: number;
  error?: string;
};

export async function verifyFile(filePath: string): Promise<VerifyResult> {
  let rl: ReturnType<typeof createInterface> | undefined;

  try {
    const expectedRunId = basename(filePath, '.jsonl');

    rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let prevHash = GENESIS;
    let expectedSeq = 0;
    let eventsChecked = 0;
    let prevTs: number | undefined;
    let lineNo = 0;

    for await (const line of rl) {
      lineNo++;
      if (!line.trim()) continue;

      let event: AuditEvent;
      try {
        event = JSON.parse(line);
      } catch {
        return { valid: false, eventsChecked, error: `Invalid JSON at line ${lineNo}` };
      }

      if (event.seq !== expectedSeq) {
        return { valid: false, eventsChecked, error: `Sequence gap at seq ${event.seq}, expected ${expectedSeq}` };
      }

      if (event.runId !== expectedRunId) {
        return { valid: false, eventsChecked, error: `Run ID mismatch at seq ${event.seq}` };
      }

      if (event.prevHash !== prevHash) {
        return { valid: false, eventsChecked, error: `Hash chain broken at seq ${event.seq}` };
      }

      if (prevTs !== undefined && event.ts < prevTs) {
        return { valid: false, eventsChecked, error: `Timestamp regression at seq ${event.seq}` };
      }

      const { hash, ...rest } = event;
      const recomputed = hashEvent(rest);
      if (recomputed !== hash) {
        return { valid: false, eventsChecked, error: `Hash mismatch at seq ${event.seq}` };
      }

      prevHash = event.hash;
      prevTs = event.ts;
      expectedSeq++;
      eventsChecked++;
    }

    const headPath = filePath.replace(/\.jsonl$/, '.head.json');
    if (existsSync(headPath)) {
      try {
        const head = JSON.parse(readFileSync(headPath, 'utf8')) as {
          runId?: string;
          seq: number;
          hash: string;
        };
        const lastSeq = expectedSeq - 1;
        if (head.runId !== expectedRunId || head.seq !== lastSeq || head.hash !== prevHash) {
          return { valid: false, eventsChecked, error: 'Tail anchor mismatch' };
        }
      } catch {
        return { valid: false, eventsChecked, error: 'Tail anchor unreadable' };
      }
    }

    return { valid: true, eventsChecked };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, eventsChecked: 0, error: `File error: ${message}` };
  } finally {
    rl?.close();
  }
}
