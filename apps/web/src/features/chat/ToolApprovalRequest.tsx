import type { ToolCallPart } from '@chat-tess/shared';

export interface ToolApprovalRequestProps {
  /** Chamadas que só executam se o usuário autorizar. */
  calls: ToolCallPart[];
  onDecide(isApproved: boolean): void;
}

/**
 * O assistente quer executar uma ação que depende do usuário. Mostra a tool e
 * os argumentos inteiros: é neles que apareceria um dado da conversa sendo
 * enviado para fora por causa de uma instrução escondida em conteúdo externo.
 */
export function ToolApprovalRequest({ calls, onDecide }: ToolApprovalRequestProps) {
  return (
    <section
      aria-label="Pedido de autorização"
      className="max-w-[85%] space-y-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-slate-900"
    >
      <p className="font-medium">O assistente precisa da sua autorização para continuar:</p>
      <ul className="space-y-2">
        {calls.map((call) => (
          <li key={call.callId} className="space-y-1">
            <p>
              Usar a ferramenta <code>{call.toolName}</code> com:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs break-all whitespace-pre-wrap">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-600">
        Páginas e arquivos lidos pelo assistente podem trazer instruções escondidas. Autorize só se
        a ação faz sentido para o que você pediu.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onDecide(false)}
          className="rounded-lg px-3 py-1.5 hover:bg-amber-100"
        >
          Negar
        </button>
        <button
          type="button"
          onClick={() => onDecide(true)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700"
        >
          Permitir
        </button>
      </div>
    </section>
  );
}
