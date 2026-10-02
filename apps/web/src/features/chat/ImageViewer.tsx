import { useEffect } from 'react';

export interface ImageViewerProps {
  url: string;
  fileName: string;
  onClose(): void;
}

/** Mostra a imagem ampliada sobre o chat. Fecha no botão, com Esc ou clicando fora dela. */
export function ImageViewer({ url, fileName, onClose }: ImageViewerProps) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={`Imagem ${fileName}`}
      className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
      onClick={onClose}
    >
      <img
        src={url}
        alt={fileName}
        className="max-h-[85vh] max-w-full rounded-lg object-contain"
        onClick={(event) => event.stopPropagation()}
      />
      <div
        className="flex items-center gap-4 text-sm text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <a href={url} target="_blank" rel="noreferrer" className="underline">
          Abrir em nova aba
        </a>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="rounded-lg bg-white/10 px-3 py-1 hover:bg-white/20"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
