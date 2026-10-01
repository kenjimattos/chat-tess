export interface EarlierMessagesButtonProps {
  isLoading: boolean;
  onLoad(): void;
}

/** No topo do histórico: busca a página anterior de mensagens. */
export function EarlierMessagesButton({ isLoading, onLoad }: EarlierMessagesButtonProps) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onLoad}
        disabled={isLoading}
        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      >
        {isLoading ? 'Carregando…' : 'Carregar mensagens anteriores'}
      </button>
    </div>
  );
}
