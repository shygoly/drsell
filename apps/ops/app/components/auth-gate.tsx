'use client';

import { useEffect } from 'react';
import { getToken } from '@/lib/api';

export function AuthGate({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!getToken()) window.location.href = '/login';
  }, []);
  return children;
}
