import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONVERSATION_TITLE,
  MAX_TITLE_LENGTH,
  titleFromFirstMessage,
} from './conversation';

describe('titleFromFirstMessage', () => {
  it('usa o texto da mensagem quando ele é curto', () => {
    expect(titleFromFirstMessage('Como funciona o Vitest?')).toBe('Como funciona o Vitest?');
  });

  it('usa só a primeira linha e remove espaços extras', () => {
    expect(titleFromFirstMessage('  Resuma   este contrato \n\nSegue o texto...')).toBe(
      'Resuma este contrato',
    );
  });

  it('corta textos longos e indica o corte', () => {
    const title = titleFromFirstMessage('a'.repeat(200));

    expect(title).toHaveLength(MAX_TITLE_LENGTH);
    expect(title.endsWith('…')).toBe(true);
  });

  it('usa o título padrão quando a mensagem não tem texto', () => {
    expect(titleFromFirstMessage('   \n  ')).toBe(DEFAULT_CONVERSATION_TITLE);
  });
});
