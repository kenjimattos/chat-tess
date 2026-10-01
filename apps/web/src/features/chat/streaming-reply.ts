import type { StreamEvent } from '@chat-tess/shared';

export type ToolActivityStatus = 'running' | 'succeeded' | 'failed';

export interface ToolActivity {
  callId: string;
  toolName: string;
  status: ToolActivityStatus;
}

/** Resposta do agente sendo recebida em stream. */
export interface StreamingReply {
  text: string;
  tools: ToolActivity[];
  /** O histórico foi compactado durante este turno. */
  wasCompacted: boolean;
  error: string | null;
  isFinished: boolean;
}

export const emptyReply: StreamingReply = {
  text: '',
  tools: [],
  wasCompacted: false,
  error: null,
  isFinished: false,
};

/** Aplica um evento do stream à resposta em andamento. */
export function applyStreamEvent(reply: StreamingReply, event: StreamEvent): StreamingReply {
  switch (event.type) {
    case 'text_delta':
      return { ...reply, text: reply.text + event.text };
    case 'tool_started':
      return {
        ...reply,
        tools: [
          ...reply.tools,
          { callId: event.callId, toolName: event.toolName, status: 'running' },
        ],
      };
    case 'tool_finished':
      return {
        ...reply,
        tools: reply.tools.map((tool) =>
          tool.callId === event.callId
            ? { ...tool, status: event.isError ? 'failed' : 'succeeded' }
            : tool,
        ),
      };
    case 'compacted':
      return { ...reply, wasCompacted: true };
    case 'error':
      return { ...reply, error: event.message, isFinished: true };
    case 'done':
      return { ...reply, isFinished: true };
    // O turno parou à espera do usuário; o pedido aparece a partir do histórico.
    case 'approval_required':
      return { ...reply, isFinished: true };
    case 'usage':
      return reply;
  }
}
