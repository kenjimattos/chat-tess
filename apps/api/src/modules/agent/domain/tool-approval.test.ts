import type { MessagePart } from '@chat-tess/shared';
import { describe, expect, it } from 'vitest';
import { DENIED_BY_USER, notExecuted, toolCallsIn } from './tool-approval';

const call = {
  type: 'tool_call' as const,
  callId: 'call-1',
  toolName: 'send_email',
  input: { to: 'bia@empresa.com' },
};

describe('toolCallsIn', () => {
  it('separa as chamadas de tool das outras partes da mensagem', () => {
    const parts: MessagePart[] = [{ type: 'text', text: 'Vou enviar.' }, call];

    expect(toolCallsIn(parts)).toEqual([call]);
  });
});

describe('notExecuted', () => {
  it('devolve ao LLM o motivo como resultado de erro da chamada', () => {
    expect(notExecuted(call, DENIED_BY_USER)).toEqual({
      type: 'tool_result',
      callId: 'call-1',
      toolName: 'send_email',
      output: DENIED_BY_USER,
      isError: true,
    });
  });
});
