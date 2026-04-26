# agentlog — Technical Debt

All items deferred from v0.1. Organized by target version and category.

---

## v0.2

### Core — Public API Surface

- **`./internal` subpath export** for `hashEvent` and `GENESIS`
  Why: Both are implementation details that leak as public API. Hiding them reduces the pinned contract surface. Deferred because zero consumers depend on them yet — evaluate when first external consumer appears.

- **`verifyEvents(events: AuditEvent[])`** — in-memory verify alongside `verifyFile`
  Why: Vercel AI SDK adapter may want to verify in-memory before flushing to disk. File-only is sufficient for v0.1.

- **Subpath split for `verify.ts`** — move to `./verify` subpath export
  Why: `verify.ts` depends on Node `fs` and is not portable to browser/edge. Split when a non-Node consumer needs the rest of core without pulling in Node-only deps.

- **`HASHING.md` spec doc** — canonical JSON form, field set, algorithm, version
  Why: Needed for GDPR DPIA and EU AI Act Article 12 compliance defensibility. Write after working example exists — documentation written before real usage is fiction.

---

### Core — Crypto & Hashing

- **Web Crypto API** (`crypto.subtle`) instead of `node:crypto`
  Why: `node:crypto` blocks Vercel Edge and Cloudflare Workers compatibility.

- **`toHashable()` projection** — explicit `HashableEvent` type instead of `Omit<AuditEvent, 'hash'>`
  Why: `durationMs` is silently excluded from the hash by `hashEvent`'s field enumeration. If `hashEvent` ever changes, verification silently breaks. A typed projection makes the contract explicit.

- **`hashAlg` field on every event**
  Why: When SHA-3 or BLAKE3 lands, files written under SHA-256 have no in-band signal. A `hashAlg` field bound into the canonical hash enables algorithm agility without breaking old files.

- **`hashVersion` field for schema evolution**
  Why: Future schema changes need a versioned hash scheme so old files don't silently fail or pass incorrectly.

---

### Core — Verify

- **Tail anchor** — sidecar `.head` file storing `{ seq, hash }` after each append
  Why: Hash chains cannot detect tail truncation. Dropping the last N events still passes `verifyFile`. The `.head` file is the minimal fix.

- **`runId` cross-check** — assert `event.runId` matches the filename `<runId>.jsonl`
  Why: Events from one run can be moved into another file's JSONL and verify clean. Filename-to-runId binding closes chain substitution attacks.

- **Structured error codes** instead of free-text strings
  Why: Free-text errors can't be handled programmatically by CI gates, dashboards, or compliance reports.
  Shape:
  ```ts
  type VerifyError = {
    code: 'SEQ_GAP' | 'HASH_MISMATCH' | 'CHAIN_BROKEN' | 'TS_REGRESSION' | 'BAD_JSON' | 'FILE_ERROR'
    seq?: number
    lineNo?: number
    message: string
  }
  ```

- **`errors: VerifyError[]` with `stopOnFirst` option** in `VerifyResult`
  Why: Single `error: string` collapses on first failure. Forensic use needs all violations.

- **`eventsChecked` preserved on stream failure**
  Why: Outer catch currently returns `eventsChecked: 0` even if the stream fails mid-file after events were validated. Loses partial progress info.

- **Signed redaction tombstone** — `eventType: 'redacted'` currently bypasses payload hash
  Why: An attacker with file write access can insert a fake `eventType: 'redacted'` event with a bogus payload. A signed tombstone or redaction-specific hash discipline closes this.

- **Redaction audit trail** on the redacted event payload
  Why: GDPR Art. 17 erasure requires knowing who redacted, when, and under what legal basis. The current `RedactedPayload` only has `targetEventId` and `reason`.

- **Timestamp comparison via `Date.parse`** instead of lexicographic string compare
  Why: String compare assumes UTC `Z` suffix. A non-UTC ISO string (e.g. `+00:00` offset) breaks monotonicity checks silently.

- **`verifyFileDetailed`** — extended `VerifyResult` for compliance use
  Why: Annex IV evidentiary use requires `firstTimestampISO`, `lastTimestampISO`, `fileHash` (terminal hash), `verifierVersion`.
  ```ts
  type VerifyResultDetailed = VerifyResult & {
    firstTimestampISO?: string
    lastTimestampISO?: string
    terminalHash?: string
    verifierVersion: string
  }
  ```

---

### Core — Schema & Event Types

- **`BaseEvent<T, P>` discriminated union** — replace `data: Record<string, unknown>` with typed payloads per event type
  Why: `data: unknown` loses all type safety at the package boundary. Deferred because generics complexity wasn't worth it before real consumers existed.

- **`ts: number` (unix ms)** instead of `timestampISO: string`
  Why: Numeric timestamps sort, diff, and do math correctly. String was chosen for JSONL readability. Reconsider when v0.2 adds SQLite.

- **`sha256("agentlog-genesis-v1")` as genesis hash** instead of the string `"GENESIS"`
  Why: Versioned genesis hash makes the chain deterministic and schema-version-aware.

- **`captureStack: true` opt-in** for `ErrorPayload`
  Why: Stack traces expose server directory structure. Currently excluded entirely. Add explicit opt-in flag.

- **Schema validation on parse** — validate event shape with zod/valibot in `verifyFile`
  Why: A malicious file with `timestampISO: undefined` or `seq: "0"` passes the chain checks but produces incorrect state silently.

---

### Core — Storage

- **`EventSource` abstraction** — decouple verifier from JSONL transport
  Why: v0.2 SQLite adapter needs the same verification logic without duplicating it.
  ```ts
  interface EventSource {
    events(): AsyncIterable<string>
  }
  ```
  Then `verifyFile` and `verifySQLite` are thin adapters.

- **SQLite storage adapter**
  Why: JSONL is hard to query. SQLite enables run list, filtering, and DSAR exports.

---

### Vercel AI Adapter

- **`streamText` support**
  Why: `streamText` is the primary pattern in Vercel AI SDK for production agents. v0.1 wrapper covers `generateText` only. Document clearly.

- **Middleware pattern** instead of wrapper
  Why: One-line setup at model instantiation is better DX than finding every `generateText` call. Wrapper was chosen for v0.1 correctness. Migrate in v0.2.

---

### CLI

- **Browser UI** (`agentlog studio`)
  Why: `npx agentlog view` is terminal-only in v0.1. A local `localhost:3001` timeline is the "wow" moment for developer adoption.

- **`--max-age` pruning command**
  Why: JSONL files that live forever are a GDPR liability under Art. 5(1)(e) (storage limitation). Deleting whole run files is GDPR-clean; line-level deletion is not.

- **`RETENTION.md` template**
  Why: Operators need a starting point for documenting their retention policy for GDPR Art. 30 records of processing.

---

### Compliance (iappExpert)

- **`verifyAndFilter(filePath, predicate)`** — DSAR export hook
  Why: GDPR Art. 15/20 right of access and portability. Returns matching events with verification proof for the full chain.

- **DPA-facing error structure**
  Why: Free-text error strings won't survive a regulator review. Structured codes + timestamps needed for incident reports.

---

### Architecture

- **`AbortSignal` on `verifyFile`**
  Why: Large historical archives will pin the process with no cancellation path. Not needed until archive sizes grow.

- **Path validation** — reject symlinks, non-regular files, paths outside `.agentlog/runs/`
  Why: Currently not needed (dev tool, trusted input). Needed if `verifyFile` is ever exposed via CLI flags accepting untrusted paths or wrapped in a server.

- **`eventType !== 'redacted'` check** → typed discriminator
  Why: String comparison will become fragile as more event types accumulate. Replace with a typed capability flag in v0.2.

---

## Open decisions (not yet resolved)

1. **Forged redaction scope** — is signed redaction tombstone in v0.2 or later?
2. **v0.2 priority order** — proposal: structured error codes → tail anchor → EventSource → redaction auth. Confirm or reorder.
3. **`eventsChecked` on stream failure** — return actual count or `0` as "stream-level failure" signal?
