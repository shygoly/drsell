'use client';

import { useEffect, useState } from 'react';
import { clearToken, getToken, isTokenValid } from '@/lib/auth';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!isTokenValid(token)) {
      clearToken();
      window.location.href = '/login';
      return;
    }
    setOk(true);
  }, []);

  if (!ok) return null;
  return children;
}
