import { createRun } from '@agentlog/core';
import type { TelemetryIntegration } from 'ai';

export function createAgentLogger(config?: {
  agentName?: string;
  captureMode?: 'metadata' | 'full';
  gitignore?: boolean;
}) {
  const captureMode = config?.captureMode ?? 'metadata';
  const run = createRun({ agentName: config?.agentName, captureMode, gitignore: config?.gitignore });
  const full = captureMode === 'full';

  const integration: TelemetryIntegration = {
    onStart(event) {
      run.append('prompt', {
        model: event.model,
        ...(full && { prompt: event.prompt, messages: event.messages }),
      });
    },

    onToolCallStart(event) {
      run.append('tool_call', {
        tool: event.toolCall.toolName,
        ...(full && { input: event.toolCall.input }),
      });
    },

    onToolCallFinish(event) {
      run.append('tool_result', {
        tool: event.toolCall.toolName,
        success: event.success,
        ...(full && event.success && { output: event.output }),
        ...(full && !event.success && { error: String(event.error) }),
      });
    },

    onFinish(event) {
      run.append('response', {
        usage: event.usage,
        ...(full && { text: event.text }),
      });
      run.end('success');
    },
  };

  return {
    runId: run.runId,
    telemetry: {
      isEnabled: true,
      integrations: integration,
    },
    onError(error: unknown) {
      run.end('error', String(error));
    },
  };
}
