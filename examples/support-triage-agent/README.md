# support-triage-agent

A deterministic support-agent demo for agentlog.

It simulates refund decisions with local fake data and logs the agent timeline:

- order lookup
- refund-policy lookup
- support-note creation
- success, denial, not-found, and policy-error paths

## Run

Create `.env` in this folder:

```bash
OPENAI_API_KEY="sk-..."
```

Then run one scenario:

```bash
pnpm start approved
pnpm start denied
pnpm start not_found
pnpm start policy_error
```

