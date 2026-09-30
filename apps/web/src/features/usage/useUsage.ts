import type { UsageSummaryResponse } from '@chat-tess/shared';
import { useCallback, useEffect, useState } from 'react';
import { fetchUsage } from '../../api/usage-api';

/** Consumo de tokens do usuário; `refresh` é chamado ao fim de cada turno. */
export function useUsage() {
  const [usage, setUsage] = useState<UsageSummaryResponse | null>(null);

  const refresh = useCallback(async () => {
    setUsage(await fetchUsage().catch(() => null));
  }, []);

  useEffect(() => {
    let isCurrent = true;
    fetchUsage().then(
      (loaded) => isCurrent && setUsage(loaded),
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, []);

  return { usage, refresh };
}
