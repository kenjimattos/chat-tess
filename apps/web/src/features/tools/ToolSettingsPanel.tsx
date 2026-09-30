import type { ToolSetting } from '@chat-tess/shared';
import { useEffect, useState } from 'react';
import { listTools, setToolEnabled } from '../../api/tools-api';

const SOURCE_LABEL: Record<ToolSetting['source'], string> = {
  built_in: 'Nativa',
  connector: 'Conector',
  mcp: 'MCP',
};

export interface ToolSettingsPanelProps {
  onClose(): void;
}

/** Liga e desliga as ferramentas que o agente pode usar. */
export function ToolSettingsPanel({ onClose }: ToolSettingsPanelProps) {
  const [tools, setTools] = useState<ToolSetting[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    listTools().then(
      (loaded) => isCurrent && setTools(loaded),
      () => isCurrent && setError('Não foi possível carregar as ferramentas.'),
    );
    return () => {
      isCurrent = false;
    };
  }, []);

  async function toggle(tool: ToolSetting) {
    const enabled = !tool.enabled;
    setTools(
      (current) =>
        current?.map((item) => (item.name === tool.name ? { ...item, enabled } : item)) ?? null,
    );
    try {
      await setToolEnabled(tool.name, enabled);
    } catch {
      setError(`Não foi possível alterar ${tool.name}.`);
      setTools(
        (current) =>
          current?.map((item) =>
            item.name === tool.name ? { ...item, enabled: !enabled } : item,
          ) ?? null,
      );
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Ferramentas"
      className="fixed inset-0 z-10 flex justify-end bg-black/20"
      onClick={onClose}
    >
      <section
        className="h-full w-full max-w-sm space-y-4 overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Ferramentas</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
          >
            Fechar
          </button>
        </header>
        <p className="text-sm text-slate-600">
          Escolha quais ferramentas o agente pode usar nas suas conversas.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {!tools && !error && <p className="text-sm text-slate-500">Carregando…</p>}

        <ul className="space-y-3">
          {tools?.map((tool) => (
            <li key={tool.name} className="rounded-lg border border-slate-200 p-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={tool.enabled}
                  onChange={() => void toggle(tool)}
                  className="mt-1"
                  aria-label={tool.name}
                />
                <span className="space-y-1">
                  <span className="flex items-center gap-2">
                    <code className="text-sm font-medium text-slate-900">{tool.name}</code>
                    <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">
                      {SOURCE_LABEL[tool.source]}
                    </span>
                  </span>
                  <span className="block text-sm text-slate-600">{tool.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
