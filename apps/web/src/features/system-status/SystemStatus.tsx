import { useEffect, useState } from 'react';
import { requestJson } from '../../api/http-client';

type Status = 'checking' | 'online' | 'offline';

const STATUS_LABEL: Record<Status, string> = {
  checking: 'Verificando a API…',
  online: 'API e banco de dados no ar',
  offline: 'API indisponível',
};

const STATUS_COLOR: Record<Status, string> = {
  checking: 'bg-slate-400',
  online: 'bg-emerald-500',
  offline: 'bg-red-500',
};

export function SystemStatus() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let isCurrent = true;

    requestJson('/health/ready').then(
      () => isCurrent && setStatus('online'),
      () => isCurrent && setStatus('offline'),
    );

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
      <span aria-hidden className={`size-2 rounded-full ${STATUS_COLOR[status]}`} />
      {STATUS_LABEL[status]}
    </p>
  );
}
