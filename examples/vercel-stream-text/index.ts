import { streamText, tool, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { createAgentLogger } from '@asafhm/agentlog-vercel-ai';

const { telemetry, runId, onError } = createAgentLogger({
  agentName: 'stream-agent',
  gitignore: true,
});

const result = streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'What is the weather in Tel Aviv and what is the latest news about AI?',
  experimental_telemetry: telemetry,
  onError,
  tools: {
    getWeather: tool({
      description: 'Get weather for a city',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, temp: 28, condition: 'sunny' }),
    }),
    getNews: tool({
      description: 'Get the latest news headline for a topic',
      inputSchema: z.object({ topic: z.string() }),
      execute: async ({ topic }) => ({
        topic,
        headline: `Breaking: Major developments in ${topic} as experts weigh in`,
        source: 'Daily News',
        publishedAt: new Date().toISOString(),
      }),
    }),
  },
  stopWhen: stepCountIs(3),
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
console.log('\n');

const usage = await result.usage;
console.log('Usage:', usage);
console.log('Run ID:', runId);
console.log(`\nView log:   node ../../apps/cli/dist/index.js view .agentlog/runs/${runId}.jsonl`);
console.log(`Verify log: node ../../apps/cli/dist/index.js verify .agentlog/runs/${runId}.jsonl`);
