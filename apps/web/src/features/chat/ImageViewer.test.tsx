import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImageViewer } from './ImageViewer';

function renderViewer() {
  const onClose = vi.fn();
  render(<ImageViewer url="/api/attachments/a1" fileName="foto.png" onClose={onClose} />);
  return { onClose, dialog: screen.getByRole('dialog', { name: 'Imagem foto.png' }) };
}

describe('ImageViewer', () => {
  it('mostra a imagem e o link para abri-la em outra aba', () => {
    renderViewer();

    expect(screen.getByRole('img', { name: 'foto.png' })).toHaveAttribute(
      'src',
      '/api/attachments/a1',
    );
    expect(screen.getByRole('link', { name: 'Abrir em nova aba' })).toHaveAttribute(
      'href',
      '/api/attachments/a1',
    );
  });

  it('fecha no botão, com Esc e ao clicar fora da imagem', async () => {
    const { onClose, dialog } = renderViewer();

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(dialog);

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('continua aberto ao clicar na imagem', async () => {
    const { onClose } = renderViewer();

    await userEvent.click(screen.getByRole('img', { name: 'foto.png' }));

    expect(onClose).not.toHaveBeenCalled();
  });
});
