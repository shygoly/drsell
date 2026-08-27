import en from './en.json';
import zhCN from './zh-CN.json';

export type AppLocale = 'zh-CN' | 'en';

const catalogs: Record<AppLocale, Record<string, string>> = {
  'zh-CN': zhCN,
  en,
};

export function resolveLocale(input?: string | null): AppLocale {
  if (!input) return 'zh-CN';
  if (input.toLowerCase().startsWith('en')) return 'en';
  return 'zh-CN';
}

export function createTranslator(locale: AppLocale) {
  const table = catalogs[locale] ?? catalogs['zh-CN'];
  return (key: string) => table[key] ?? key;
}
