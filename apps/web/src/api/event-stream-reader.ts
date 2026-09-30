import { streamEventSchema, type StreamEvent } from '@chat-tess/shared';

/**
 * Lê uma resposta Server-Sent Events e devolve os eventos já validados.
 * Blocos são separados por linha em branco; comentários (": ping") são ignorados.
 */
export async function* readEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  // `stream: true` guarda bytes de um caractere que chegou partido entre dois pedaços.
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const event = parseBlock(block);
        if (event) {
          yield event;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): StreamEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n');
  if (!data) {
    return null;
  }
  return streamEventSchema.parse(JSON.parse(data));
}
