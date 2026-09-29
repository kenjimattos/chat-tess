import type { CurrentUser } from '@chat-tess/shared';
import { useCallback, useEffect, useState } from 'react';
import { fetchCurrentUser, logout } from '../../api/auth-api';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'error' };

export function useCurrentUser() {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let isCurrent = true;

    fetchCurrentUser().then(
      (user) => {
        if (isCurrent) {
          setSession(user ? { status: 'authenticated', user } : { status: 'anonymous' });
        }
      },
      () => isCurrent && setSession({ status: 'error' }),
    );

    return () => {
      isCurrent = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setSession({ status: 'anonymous' });
  }, []);

  return { session, signOut };
}
