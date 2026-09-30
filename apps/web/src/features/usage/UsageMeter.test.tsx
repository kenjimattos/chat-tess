import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UsageMeter } from './UsageMeter';

const usage = (tokensUsed: number, tokenLimit = 2_000_000) => ({
  tokenLimit,
  tokensUsed,
  remainingTokens: Math.max(tokenLimit - tokensUsed, 0),
  recentUsage: [],
});

describe('UsageMeter', () => {
  it('mostra o consumo em relação ao limite', () => {
    render(<UsageMeter usage={usage(12_345)} />);

    expect(screen.getByText('Uso: 12,3 mil de 2 mi tokens')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Consumo de tokens' })).toHaveAttribute(
      'aria-valuenow',
      '12345',
    );
  });

  it('não passa do limite na barra quando o consumo excede o cap', () => {
    render(<UsageMeter usage={usage(1500, 1000)} />);

    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '1000');
  });
});
