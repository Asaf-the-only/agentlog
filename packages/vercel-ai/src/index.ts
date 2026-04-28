import { createRun } from '@asafhm/agentlog-core';
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
        ...(full && !event.success && {
          error: event.error instanceof Error
            ? { message: event.error.message, name: event.error.name, stack: event.error.stack }
            : String(event.error),
        }),
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
    onError(errorOrEvent: unknown) {
      const error =
        errorOrEvent !== null &&
        typeof errorOrEvent === 'object' &&
        'error' in errorOrEvent
          ? (errorOrEvent as { error: unknown }).error
          : errorOrEvent;
      const serializedError = error instanceof Error
        ? { message: error.message, name: error.name, stack: error.stack }
        : String(error);
      run.append('late_error', { error: serializedError });
      run.end('error', error instanceof Error ? error.message : String(error));
    },
  };
}
