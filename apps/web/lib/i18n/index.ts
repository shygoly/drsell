import en from './en.json';
import zhCN from './zh-CN.json';

export type AppLocale = 'zh-CN' | 'en';

const catalogs: Record<AppLocale, Record<string, string>> = {
  'zh-CN': zhCN,
  en,
};

/**
 * Shopify admin passes `locale` on every embedded load. English is the default
 * so the App Store listing, the review flow and any admin without the param
 * all land on English rather than zh-CN.
 */
export function resolveLocale(input?: string | null): AppLocale {
  if (!input) return 'en';
  if (input.toLowerCase().startsWith('zh')) return 'zh-CN';
  return 'en';
}

export function createTranslator(locale: AppLocale) {
  const table = catalogs[locale] ?? catalogs.en;
  return (key: string) => table[key] ?? key;
}
