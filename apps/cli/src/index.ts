import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { verifyFile } from '@asafhaim/agentlog-core';
import type { AuditEvent } from '@asafhaim/agentlog-core';

const [, , command, filePath] = process.argv;

if (!command || !filePath) {
  console.error('Usage: agentlog <verify|view> <path-to-run.jsonl>');
  process.exit(1);
}

const absPath = resolve(filePath);

if (command === 'verify') {
  const result = await verifyFile(absPath);
  if (result.valid) {
    console.log(`✓ Valid — ${result.eventsChecked} events verified`);
  } else {
    console.error(`✗ Invalid — ${result.error}`);
    process.exit(1);
  }

} else if (command === 'view') {
  const rl = createInterface({ input: createReadStream(absPath), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const event: AuditEvent = JSON.parse(line);
    const ts = new Date(event.ts).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    const dur = event.durationMs != null ? ` (${event.durationMs}ms)` : '';
    console.log(`[${event.seq}] ${ts}  ${event.type}${dur}`);
    if (Object.keys(event.payload).length) {
      for (const [k, v] of Object.entries(event.payload)) {
        console.log(`      ${k}: ${JSON.stringify(v)}`);
      }
    }
  }

} else {
  console.error(`Unknown command: ${command}`);
  console.error('Usage: agentlog <verify|view> <path-to-run.jsonl>');
  process.exit(1);
}
