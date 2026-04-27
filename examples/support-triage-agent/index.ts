import { openai } from '@ai-sdk/openai';
import { createAgentLogger } from '@asafhm/agentlog-vercel-ai';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

type Scenario = 'approved' | 'denied' | 'not_found' | 'policy_error';

type Order = {
  orderId: string;
  customerTier: 'standard' | 'pro';
  item: string;
  category: 'electronics' | 'apparel';
  deliveredDaysAgo: number;
  issue: 'damaged' | 'wrong_size';
  amountUsd: number;
};

const scenario = parseScenario(process.argv[2]);

const scenarioOrders: Record<Exclude<Scenario, 'not_found'>, Order> = {
  approved: {
    orderId: 'A100',
    customerTier: 'pro',
    item: 'Wireless keyboard',
    category: 'electronics',
    deliveredDaysAgo: 4,
    issue: 'damaged',
    amountUsd: 89,
  },
  denied: {
    orderId: 'B200',
    customerTier: 'standard',
    item: 'Running shoes',
    category: 'apparel',
    deliveredDaysAgo: 52,
    issue: 'wrong_size',
    amountUsd: 120,
  },
  policy_error: {
    orderId: 'C300',
    customerTier: 'standard',
    item: 'Bluetooth speaker',
    category: 'electronics',
    deliveredDaysAgo: 8,
    issue: 'damaged',
    amountUsd: 64,
  },
};

const orderId = scenario === 'not_found' ? 'Z999' : scenarioOrders[scenario].orderId;
const notes: Array<{ orderId: string; summary: string; priority: 'low' | 'normal' | 'high' }> = [];

const { telemetry, runId, onError } = createAgentLogger({
  agentName: 'support-triage-agent',
  captureMode: 'metadata',
  gitignore: true,
});

const result = streamText({
  model: openai('gpt-4o-mini'),
  experimental_telemetry: telemetry,
  onError,
  stopWhen: stepCountIs(5),
  prompt: [
    'You are a support triage agent deciding refund requests.',
    `Scenario: ${scenario}.`,
    `Customer says order ${orderId} has a problem.`,
    '',
    'Required flow:',
    '1. Call lookupOrder with the orderId.',
    '2. If the order exists, call getRefundPolicy with its category.',
    '3. Call createSupportNote with your final decision summary.',
    '4. Final answer must include Decision and Reason.',
    '',
    'Decision rules:',
    '- If the order is not found, decision is manual_review.',
    '- If policy lookup fails, decision is manual_review.',
    '- If deliveredDaysAgo is within refundWindowDays and issue is damaged, decision is refund_approved.',
    '- Otherwise decision is refund_denied.',
  ].join('\n'),
  tools: {
    lookupOrder: tool({
      description: 'Look up an order by ID.',
      inputSchema: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => {
        const order = Object.values(scenarioOrders).find((candidate) => candidate.orderId === orderId);

        if (!order) {
          return { found: false, orderId };
        }

        return { found: true, order };
      },
    }),
    getRefundPolicy: tool({
      description: 'Fetch the refund policy for a product category.',
      inputSchema: z.object({ category: z.enum(['electronics', 'apparel']) }),
      execute: async ({ category }) => {
        if (scenario === 'policy_error') {
          throw new Error('Refund policy service unavailable');
        }

        const policies = {
          electronics: {
            category,
            refundWindowDays: 14,
            damagedItemsRefundable: true,
            restockingFeeUsd: 0,
          },
          apparel: {
            category,
            refundWindowDays: 30,
            damagedItemsRefundable: true,
            restockingFeeUsd: 7,
          },
        };

        return policies[category];
      },
    }),
    createSupportNote: tool({
      description: 'Create an internal support note for the triage decision.',
      inputSchema: z.object({
        orderId: z.string(),
        summary: z.string(),
        priority: z.enum(['low', 'normal', 'high']),
      }),
      execute: async (note) => {
        notes.push(note);
        return { saved: true, noteId: `note-${notes.length}`, ...note };
      },
    }),
  },
});

try {
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nAgent failed: ${message}`);
}

console.log('\n');
console.log('Scenario:', scenario);
console.log('Run ID:', runId);
console.log(`\nView log:    node ../../apps/cli/dist/index.js view .agentlog/runs/${runId}.jsonl`);
console.log(`Verify log:  node ../../apps/cli/dist/index.js verify .agentlog/runs/${runId}.jsonl`);
console.log('Open studio: node ../../apps/cli/dist/index.js studio');

function parseScenario(value: string | undefined): Scenario {
  if (value === 'approved' || value === 'denied' || value === 'not_found' || value === 'policy_error') {
    return value;
  }

  return 'approved';
}
