'use client';

import { AppProvider } from '@shopify/polaris';
import enPolaris from '@shopify/polaris/locales/en.json';
import zhPolaris from '@shopify/polaris/locales/zh-CN.json';
import { createContext, useContext, useMemo } from 'react';
import { AppLocale, createTranslator } from '@/lib/i18n';

const I18nCtx = createContext<(key: string) => string>(() => '');

export function AppProviders({
  locale,
  children,
}: {
  locale: AppLocale;
  children: React.ReactNode;
}) {
  const polarisI18n = locale === 'en' ? enPolaris : zhPolaris;
  const t = useMemo(() => createTranslator(locale), [locale]);

  return (
    <AppProvider i18n={polarisI18n}>
      <I18nCtx.Provider value={t}>{children}</I18nCtx.Provider>
    </AppProvider>
  );
}

export function useTranslations() {
  return useContext(I18nCtx);
}
