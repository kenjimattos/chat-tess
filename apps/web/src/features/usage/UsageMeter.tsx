import type { UsageSummaryResponse } from '@chat-tess/shared';

const compactNumber = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Barra de consumo de tokens do usuário em relação ao limite. */
export function UsageMeter({ usage }: { usage: UsageSummaryResponse }) {
  const usedFraction = usage.tokenLimit > 0 ? Math.min(usage.tokensUsed / usage.tokenLimit, 1) : 1;
  const barColor =
    usedFraction >= 1 ? 'bg-red-500' : usedFraction >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500';
  const label = `Uso: ${compactNumber.format(usage.tokensUsed)} de ${compactNumber.format(usage.tokenLimit)} tokens`;

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500" title={label}>
      <span>{label}</span>
      <div
        role="meter"
        aria-label="Consumo de tokens"
        aria-valuemin={0}
        aria-valuemax={usage.tokenLimit}
        aria-valuenow={Math.min(usage.tokensUsed, usage.tokenLimit)}
        className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 max-sm:hidden"
      >
        <div className={`h-full ${barColor}`} style={{ width: `${usedFraction * 100}%` }} />
      </div>
    </div>
  );
}
