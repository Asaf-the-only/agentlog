# Changelog

## 0.2.1-alpha.0

- Added `streamText` support for the Vercel AI SDK adapter.
- Added `agentlog studio`, a local browser UI for inspecting existing JSONL runs.
- Added completed-run tail anchors with `<runId>.head.json`.
- Added runId/filename binding in `verifyFile` to prevent run-file substitution.
- Added structured verifier errors via `VerifyResult.details`.
- Added `examples/vercel-stream-text`.

## 0.2.0

- Added `streamText` support.
- Added completed-run tail anchors.
- Added structured verifier errors.
- Added first-pass JSONL studio.

## 0.1.1

- Aligned event schema with the roadmap (`type`, `ts`, `payload`, versioned genesis).
- Fixed metadata-only capture behavior.
- Fixed tool result logging.
- Added error lifecycle handling for failed runs.
- Added package publish hygiene.

## 0.1.0

- Initial local-first JSONL audit logger.
- Added core run creation, hash chaining, and verification.
- Added Vercel AI SDK `generateText` adapter.
- Added CLI `verify` and `view`.
