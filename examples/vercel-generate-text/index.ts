import { generateText, tool, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { createAgentLogger } from '@asafhm/agentlog-vercel-ai';

const { telemetry, runId, onError } = createAgentLogger({
  agentName: 'support-agent',
  gitignore: true,
});

let result;
try {
  result = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: 'What is the weather in Tel Aviv and what is the latest news about AI?',
    experimental_telemetry: telemetry,
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
} catch (error) {
  onError(error);
  throw error;
}

console.log('Result:', result.text);
console.log('Run ID:', runId);
console.log(`\nView log:   node ../../apps/cli/dist/index.js view .agentlog/runs/${runId}.jsonl`);
console.log(`Verify log: node ../../apps/cli/dist/index.js verify .agentlog/runs/${runId}.jsonl`);
